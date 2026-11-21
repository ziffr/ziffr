-- The re-encryption job learns the numbers (GLOSSARY: Workspace Key; spec 0028 step 2, ticket #248): rows written before
-- sealing hold plain numbers; the job lists them, the core seals them and seal_number writes the sealed text in place of
-- the number, only if the row is still as the job read it. Names of Metrics are a text column like any other. The
-- functions only list rows and count how far each column is, never a key; all answer the service role only.

-- Where each sealed table keeps its rows of one Workspace: the column naming the row, its sealed text columns, its
-- sealed number columns (each with a text column `<name>_sealed` beside it), the columns a number's place needs besides
-- the row's id, and the condition that picks the Workspace's rows ($1). This is seal_table of the key change (ticket
-- #250) with the numbers and the Prompts added.
drop function seal_table(text);
create function seal_table(p_table text, out key text, out cols text[], out ncols text[], out extra text[], out scope text) language plpgsql immutable as $$
begin
  ncols := array[]::text[];
  extra := array[]::text[];
  case p_table
    when 'thread_messages' then key := 'id'; cols := array['body']; ncols := array['correction_value']; scope := 'workspace_id = $1';
    when 'actions' then key := 'id'; cols := array['question', 'breakdown_label']; scope := 'workspace_id = $1';
    when 'contacts' then key := 'person_id'; cols := array['email', 'slack_handle', 'phone']; scope := 'workspace_id = $1';
    when 'profiles' then key := 'id'; cols := array['name'];
      scope := 'role = ''Contact'' and (contact_workspace = $1 or (contact_workspace is null and id in (select c.person_id from contacts c where c.workspace_id = $1))) and not exists (select 1 from contacts o where o.person_id = profiles.id and o.workspace_id <> $1)';
    when 'deliveries' then key := 'id'; cols := array['subject', 'body']; scope := 'workspace_id = $1';
    -- A Prompt's text names the Metric it asks about.
    when 'prompts' then key := 'id'; cols := array['text']; scope := 'workspace_id = $1';
    when 'intake_log' then key := 'id'; cols := array['sender', 'raw', 'detail']; scope := 'workspace_id = $1';
    when 'audit_events' then key := 'id'; cols := array['object_name']; scope := 'workspace_id = $1';
    when 'alerts' then key := 'id'; cols := array['level']; scope := 'workspace_id = $1';
    when 'webhooks' then key := 'id'; cols := array['url', 'secret', 'secret_previous']; scope := 'workspace_id = $1';
    when 'webhook_external_ids' then key := 'id'; cols := array['external_id', 'url']; scope := 'workspace_id = $1';
    when 'dashboards' then key := 'id'; cols := array['intro']; scope := 'workspace_id = $1';
    when 'widgets' then key := 'id'; cols := array['title']; scope := 'workspace_id = $1';
    when 'metrics' then key := 'id'; cols := array['description', 'name']; ncols := array['target_min', 'target_max']; scope := 'workspace_id = $1';
    when 'condensed_values' then key := 'id'; cols := array['payload']; scope := 'workspace_id = $1';
    when 'breakdown_rows' then key := 'id'; cols := array['label']; ncols := array['value']; scope := 'workspace_id = $1';
    -- A history entry's label and value are sealed for the row they were copied from (row_id), older entries for their own id.
    when 'breakdown_history' then key := 'id'; cols := array['label']; ncols := array['value']; extra := array['row_id']; scope := 'workspace_id = $1';
    when 'observations' then key := 'id'; cols := array[]::text[]; ncols := array['value', 'original_value']; scope := 'workspace_id = $1';
    -- A history entry's number is sealed for the observation it was a value of.
    when 'observation_history' then key := 'id'; cols := array[]::text[]; ncols := array['value']; extra := array['observation_id']; scope := 'workspace_id = $1';
    when 'series_values' then key := 'id'; cols := array[]::text[]; ncols := array['value']; extra := array['metric_id', 'kind', 'period_start']; scope := 'workspace_id = $1';
    else raise exception 'Not a table with sealed columns: %', p_table;
  end case;
end;
$$;
revoke all on function seal_table(text) from public, anon, authenticated;

drop function seal_candidates(uuid, text, integer, text[], integer);
create function seal_candidates(p_workspace uuid, p_table text, p_current integer, p_skip text[], p_limit integer)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t record;
  c text;
  wanted text := '';
  picked text := '';
begin
  select * into t from seal_table(p_table);
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Between 1 and 1000 rows at a time.';
  end if;
  foreach c in array t.cols loop
    picked := picked || format(' or (%1$I is not null and (not sealed_format(%1$I) or sealed_version(%1$I) < $2))', c);
    wanted := wanted || format(', %1$I', c);
  end loop;
  -- A number: a plain one still to be sealed (as its exact text), or a sealed one under an older key version.
  foreach c in array t.ncols loop
    picked := picked || format(' or %1$I is not null or (%2$I is not null and sealed_version(%2$I) < $2)', c, c || '_sealed');
    wanted := wanted || format(', %1$I::text as %1$I, %2$I', c, c || '_sealed');
  end loop;
  foreach c in array t.extra loop
    wanted := wanted || format(', %1$I', c);
  end loop;
  if p_table = 'audit_events' then
    picked := picked || ' or not sealed_details(details) or sealed_version(details ->> ''sealed'') < $2';
    wanted := wanted || ', details';
  end if;
  if p_table = 'contacts' then
    wanted := wanted || ', email_index, slack_index';
    -- A sealed address or handle whose blind index is missing or of an older key version is filled in too.
    picked := picked || ' or (email is not null and coalesce(blind_index_version(email_index), 0) < $2) or (slack_handle is not null and coalesce(blind_index_version(slack_index), 0) < $2)';
  end if;
  if p_table = 'breakdown_rows' then
    wanted := wanted || ', label_index';
    picked := picked || ' or (label_index is null or coalesce(blind_index_version(label_index), 0) < $2)';
  end if;
  if p_table = 'webhook_external_ids' then
    -- The hash finds the task again: it is of the Webhook, the system and the external id, under the current key.
    wanted := wanted || ', webhook_id, system, external_hash';
    picked := picked || ' or coalesce(blind_index_version(external_hash), 0) < $2';
  end if;
  return query execute format(
    'select to_jsonb(r) from (select %1$I::text as key%2$s from %3$I where (%4$s) and (%5$s) and not (%1$I::text = any($3)) order by %1$I limit $4) r',
    t.key, wanted, p_table, t.scope, substr(picked, 5)
  ) using p_workspace, p_current, coalesce(p_skip, array[]::text[]), p_limit;
end;
$$;
revoke all on function seal_candidates(uuid, text, integer, text[], integer) from public, anon, authenticated;

drop function seal_counts(uuid, integer);
create function seal_counts(p_workspace uuid, p_current integer)
returns table(table_name text, column_name text, total bigint, plain bigint, old_version bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  tbl text;
  t record;
  c text;
  extra text;
begin
  foreach tbl in array array['thread_messages', 'actions', 'contacts', 'profiles', 'deliveries', 'prompts', 'intake_log', 'audit_events', 'alerts', 'webhooks', 'webhook_external_ids', 'dashboards', 'widgets', 'metrics', 'condensed_values', 'breakdown_rows', 'breakdown_history',
    'observations', 'observation_history', 'series_values'] loop
    select * into t from seal_table(tbl);
    foreach c in array t.cols loop
      table_name := tbl; column_name := c;
      extra := case
        when tbl = 'breakdown_rows' then ' or (label_index is null or coalesce(blind_index_version(label_index), 0) < $2)'
        when tbl = 'webhook_external_ids' and c = 'external_id' then ' or coalesce(blind_index_version(external_hash), 0) < $2'
        when tbl = 'contacts' and c = 'email' then ' or (email is not null and coalesce(blind_index_version(email_index), 0) < $2)'
        when tbl = 'contacts' and c = 'slack_handle' then ' or (slack_handle is not null and coalesce(blind_index_version(slack_index), 0) < $2)'
        else '' end;
      -- The index of a value counts with the value: one where there is an index to check, else the value alone.
      execute format(
        'select count(%1$I), count(%1$I) filter (where not sealed_format(%1$I)), count(%1$I) filter (where sealed_version(%1$I) < $2%4$s) from %2$I where %3$s',
        c, tbl, t.scope, extra
      ) into total, plain, old_version using p_workspace, p_current;
      return next;
    end loop;
    foreach c in array t.ncols loop
      table_name := tbl; column_name := c;
      execute format(
        'select count(%1$I) + count(%2$I), count(%1$I), count(%2$I) filter (where sealed_version(%2$I) < $2) from %3$I where %4$s',
        c, c || '_sealed', tbl, t.scope
      ) into total, plain, old_version using p_workspace, p_current;
      return next;
    end loop;
    if tbl = 'audit_events' then
      table_name := tbl; column_name := 'details';
      select count(*), count(*) filter (where not sealed_details(details)),
             count(*) filter (where sealed_details(details) and sealed_version(details ->> 'sealed') < p_current)
        into total, plain, old_version from audit_events where workspace_id = p_workspace;
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function seal_counts(uuid, integer) from public, anon, authenticated;

-- Seals one number of one row: the number is emptied and its sealed text set, only if the row still holds what the job
-- read (p_was: the plain number as text, or the sealed text it moves from). The history trigger and the checks that
-- refuse a changed value for an archived Metric or a condensed period are told this is no change of the value.
create function seal_number(p_workspace uuid, p_table text, p_key text, p_column text, p_was text, p_sealed text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  t record;
  n integer;
begin
  select * into t from seal_table(p_table);
  if not (p_column = any (t.ncols)) then raise exception 'Not a sealed number column: %.%', p_table, p_column; end if;
  if not sealed_format(p_sealed) then raise exception 'Not a sealed value.'; end if;
  perform set_config('ziffr.sealing_values', 'on', true);
  if sealed_format(p_was) then
    execute format('update %1$I set %2$I = $4 where (%3$s) and %4$I::text = $2 and %2$I = $3', p_table, p_column || '_sealed', t.scope, t.key) using p_workspace, p_key, p_was, p_sealed;
  else
    execute format('update %1$I set %2$I = null, %3$I = $4 where (%4$s) and %5$I::text = $2 and %2$I = $3::numeric', p_table, p_column, p_column || '_sealed', t.scope, t.key) using p_workspace, p_key, p_was, p_sealed;
  end if;
  get diagnostics n = row_count;
  perform set_config('ziffr.sealing_values', 'off', true);
  return n = 1;
end;
$$;
revoke all on function seal_number(uuid, text, text, text, text, text) from public, anon, authenticated;

-- Sealing a value is no change of it: no history entry, no "touched" mark, and no refusal for an archived Metric or a
-- condensed period; and a sealed value that changes is a change, which the checks now see (they compared only the
-- plain number, which stays empty once sealed).
create or replace function keep_observation_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and current_setting('ziffr.sealing_values', true) = 'on' then return new; end if;
  if tg_op = 'DELETE' and (not exists (select 1 from workspaces where id = old.workspace_id) or not exists (select 1 from metrics where id = old.metric_id)) then
    return old;
  end if;
  if tg_op = 'DELETE' or old.value is distinct from new.value or old.value_sealed is distinct from new.value_sealed then
    insert into observation_history (observation_id, metric_id, period_start, value, value_sealed, submitter_id, source, recorded_at, change)
      values (old.id, old.metric_id, old.period_start, old.value, old.value_sealed, old.submitter_id, old.source, old.created_at, case tg_op when 'UPDATE' then 'updated' else 'deleted' end);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function observations_not_archived() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.metric_id = old.metric_id and new.period_start = old.period_start
    and ((new.value is not distinct from old.value and new.value_sealed is not distinct from old.value_sealed) or current_setting('ziffr.sealing_values', true) = 'on') then return new; end if;
  if exists (select 1 from metrics m where m.id = new.metric_id and m.archived_at is not null) then
    raise exception using errcode = 'ZF440', message = 'This Metric is archived';
  end if;
  return new;
end;
$$;

create or replace function observations_not_condensed() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.metric_id = old.metric_id and new.period_start = old.period_start
    and ((new.value is not distinct from old.value and new.value_sealed is not distinct from old.value_sealed) or current_setting('ziffr.sealing_values', true) = 'on') then return new; end if;
  if exists (select 1 from condensed_values c where c.metric_id = new.metric_id and new.period_start between c.period_start and c.period_end)
    or (tg_op = 'UPDATE' and exists (select 1 from condensed_values c where c.metric_id = old.metric_id and old.period_start between c.period_start and c.period_end)) then
    raise exception using errcode = 'ZF446', message = 'This period was condensed';
  end if;
  return new;
end;
$$;

create or replace function observations_touch_workspace() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and current_setting('ziffr.sealing_values', true) = 'on' then return null; end if;
  perform touch_workspace(new.workspace_id);
  return null;
end $$;

-- The data a Snapshot freezes is sealed as one text (`frozen.data` = {"sealed": "w1..."}) beside the plain list of the
-- Metrics it kept (`frozen.metricIds`, ids only, which the checks on who may open a draft read). The job seals the data
-- of a Snapshot frozen before, and moves a sealed one to a newer key version, through seal_json: the one change to a
-- frozen part it may make besides Breakdown labels. Everything else about the frozen part must stay as it is, the data
-- must come back as a text in the sealed format (never older than the one it replaces), and the list of Metrics must be
-- the one the data names.
create function frozen_data_resealed(old jsonb, new jsonb) returns boolean language sql immutable as $$
  select (old - 'data' - 'metricIds') = (new - 'data' - 'metricIds')
    and jsonb_typeof(new -> 'data') = 'object' and (select count(*) from jsonb_object_keys(new -> 'data')) = 1
    and sealed_format(new #>> '{data,sealed}')
    and (case when jsonb_typeof(old -> 'data') = 'object' and (select count(*) from jsonb_object_keys(old -> 'data')) = 1 and sealed_format(old #>> '{data,sealed}')
           then sealed_version(new #>> '{data,sealed}') >= sealed_version(old #>> '{data,sealed}') else true end)
    and (new -> 'metricIds') is not distinct from (case
           when old ? 'metricIds' then old -> 'metricIds'
           when jsonb_typeof(old #> '{data,metrics}') = 'array' then (select coalesce(jsonb_agg(m -> 'id' order by n), '[]'::jsonb) from jsonb_array_elements(old #> '{data,metrics}') with ordinality as t(m, n))
           else null end)
$$;
revoke all on function frozen_data_resealed(jsonb, jsonb) from public, anon, authenticated;

create or replace function dashboard_snapshots_keep_frozen() returns trigger language plpgsql as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.dashboard_id is distinct from old.dashboard_id
    or new.period_kind is distinct from old.period_kind or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end or new.taken_by is distinct from old.taken_by
    or new.taken_at is distinct from old.taken_at or new.automatic is distinct from old.automatic then
    raise exception 'A Snapshot keeps its period and who took it.' using errcode = 'ZF403';
  end if;
  if old.deleted_at is not null and (new.deleted_at is null or new.frozen is not null) then
    raise exception 'A deleted Snapshot stays deleted.' using errcode = 'ZF403';
  end if;
  if new.frozen is distinct from old.frozen and not (new.frozen is null and new.deleted_at is not null)
     and not (
       current_setting('ziffr.sealing_json', true) = 'on'
       and current_user = (select pg_get_userbyid(proowner) from pg_proc where oid = 'seal_json(uuid,text,text,bigint,jsonb,jsonb)'::regprocedure)
       and old.frozen is not null and new.frozen is not null
       and ((frozen_without_labels(new.frozen) = frozen_without_labels(old.frozen) and frozen_labels_resealed(old.frozen, new.frozen))
            or frozen_data_resealed(old.frozen, new.frozen))
     ) then
    raise exception 'A Snapshot''s numbers never change.' using errcode = 'ZF403';
  end if;
  return new;
end;
$$;

-- seal_json also takes a Workflow's settings, whose Check percentage and Tell levels are sealed (ticket #248).
create or replace function seal_json(p_workspace uuid, p_table text, p_column text, p_id bigint, p_was jsonb, p_new jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if (p_table, p_column) not in (('widgets', 'settings'), ('dashboard_snapshots', 'words'), ('dashboard_snapshots', 'frozen'), ('versions', 'snapshot'), ('view_links', 'frozen'), ('view_links', 'snapshot_words'), ('workflows', 'config')) then
    raise exception 'Not a column with sealed words: %.%', p_table, p_column;
  end if;
  perform set_config('ziffr.sealing_json', 'on', true);
  execute format('update %1$I set %2$I = $1 where id = $2 and workspace_id = $3 and %2$I = $4', p_table, p_column) using p_new, p_id, p_workspace, p_was;
  get diagnostics n = row_count;
  perform set_config('ziffr.sealing_json', 'off', true);
  return n = 1;
end;
$$;
