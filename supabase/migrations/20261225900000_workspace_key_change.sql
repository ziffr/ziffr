-- Changing a Workspace Key and re-sealing everything the job did not reach yet (spec 0028, ticket #250; GLOSSARY:
-- Workspace Key, Installation Admin). Three parts: Breakdown labels with their index and history, a Webhook's
-- external task id with its hash, and the words sealed inside JSON columns join the re-encryption job; a new key
-- version is made current under the Workspace row's lock; an old version is destroyed only once nothing refers to it.
-- Every function answers the service role only and never returns a key.

-- Where a scan of a JSON column began and under which key version it ended: an old key version is destroyed only
-- after a scan that began once no process could still write under it.
alter table workspace_seal_progress add column done_version integer, add column scan_started_at timestamptz;

-- Breakdown labels and their history join the tables the job seals. A history entry holds the label of a row that is
-- gone (its sealed form keeps the id of the row it was copied from, older entries none).
create or replace function seal_table(p_table text, out key text, out cols text[], out scope text) language plpgsql immutable as $$
begin
  case p_table
    when 'thread_messages' then key := 'id'; cols := array['body']; scope := 'workspace_id = $1';
    when 'actions' then key := 'id'; cols := array['question', 'breakdown_label']; scope := 'workspace_id = $1';
    when 'contacts' then key := 'person_id'; cols := array['email', 'slack_handle', 'phone']; scope := 'workspace_id = $1';
    when 'profiles' then key := 'id'; cols := array['name'];
      scope := 'role = ''Contact'' and id in (select c.person_id from contacts c where c.workspace_id = $1 and not exists (select 1 from contacts o where o.person_id = c.person_id and o.workspace_id <> c.workspace_id))';
    when 'deliveries' then key := 'id'; cols := array['subject', 'body']; scope := 'workspace_id = $1';
    when 'intake_log' then key := 'id'; cols := array['sender', 'raw', 'detail']; scope := 'workspace_id = $1';
    when 'audit_events' then key := 'id'; cols := array['object_name']; scope := 'workspace_id = $1';
    when 'alerts' then key := 'id'; cols := array['level']; scope := 'workspace_id = $1';
    when 'webhooks' then key := 'id'; cols := array['url', 'secret', 'secret_previous']; scope := 'workspace_id = $1';
    when 'webhook_external_ids' then key := 'id'; cols := array['external_id', 'url']; scope := 'workspace_id = $1';
    when 'dashboards' then key := 'id'; cols := array['intro']; scope := 'workspace_id = $1';
    when 'widgets' then key := 'id'; cols := array['title']; scope := 'workspace_id = $1';
    when 'metrics' then key := 'id'; cols := array['description']; scope := 'workspace_id = $1';
    when 'condensed_values' then key := 'id'; cols := array['payload']; scope := 'workspace_id = $1';
    when 'breakdown_rows' then key := 'id'; cols := array['label']; scope := 'workspace_id = $1';
    when 'breakdown_history' then key := 'id'; cols := array['label']; scope := 'workspace_id = $1';
    else raise exception 'Not a table with sealed columns: %', p_table;
  end case;
end;
$$;

-- The key version of a blind index ("b1.<version>.<hash>"); null for anything else (a plain "p1." hash too).
create function blind_index_version(p_value text) returns integer language sql immutable as $$
  select case when p_value ~ '^b1\.[1-9][0-9]{0,8}\.' then (regexp_match(p_value, '^b1\.([0-9]+)\.'))[1]::integer end
$$;
revoke all on function blind_index_version(text) from public, anon, authenticated;

-- seal_candidates as before, with the blind indexes of Breakdown rows and of a Webhook's external tasks: a row whose
-- label (or external id) is sealed but whose index is missing, plain or of an older key version is a candidate too.
create or replace function seal_candidates(p_workspace uuid, p_table text, p_current integer, p_skip text[], p_limit integer)
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
  if p_table = 'breakdown_history' then
    -- The row a copy was taken from decides the place its label is sealed for.
    wanted := wanted || ', row_id';
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

-- seal_counts as before, with Breakdown labels and their history. An index of an older key version counts as a value
-- of an older key version, so an old key version is never destroyed while a blind index still names it.
create or replace function seal_counts(p_workspace uuid, p_current integer)
returns table(table_name text, column_name text, total bigint, plain bigint, old_version bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  tbl text;
  t record;
  c text;
  extra text;
begin
  foreach tbl in array array['thread_messages', 'actions', 'contacts', 'profiles', 'deliveries', 'intake_log', 'audit_events', 'alerts', 'webhooks', 'webhook_external_ids', 'dashboards', 'widgets', 'metrics', 'condensed_values', 'breakdown_rows', 'breakdown_history'] loop
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

-- A Snapshot's frozen part never changes (spec 0017), so its Breakdown labels, which are words, could not be sealed
-- later. The one exception: seal_json, running as its owner with the mark it sets for the length of its own statement,
-- may replace the labels, and only the labels: with every label taken out, the new frozen part must equal the old one.
create function frozen_without_labels(f jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(f #> '{data,breakdowns}') = 'object' then
    jsonb_set(f, '{data,breakdowns}', coalesce((
      select jsonb_object_agg(m.key, case when jsonb_typeof(m.value) = 'object' then (
        select coalesce(jsonb_object_agg(p.key, case when jsonb_typeof(p.value) = 'array' then (
          select coalesce(jsonb_agg(case when jsonb_typeof(r.e) = 'object' then r.e - 'label' else r.e end order by r.n), '[]'::jsonb)
          from jsonb_array_elements(p.value) with ordinality as r(e, n)) else p.value end), '{}'::jsonb)
        from jsonb_each(m.value) p) else m.value end)
      from jsonb_each(f #> '{data,breakdowns}') m), '{}'::jsonb))
  else f end
$$;
revoke all on function frozen_without_labels(jsonb) from public, anon, authenticated;

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
       and frozen_without_labels(new.frozen) = frozen_without_labels(old.frozen)
     ) then
    raise exception 'A Snapshot''s numbers never change.' using errcode = 'ZF403';
  end if;
  return new;
end;
$$;

-- Seals the words of a JSON column (a Finding's words in widgets.settings, a Snapshot's words and frozen labels, a
-- Version's snapshot, a View Link's frozen copy and words), only if the column still holds what the job read: a
-- compare-and-swap on the whole value. Only these columns, only the Workspace's own rows.
create function seal_json(p_workspace uuid, p_table text, p_column text, p_id bigint, p_was jsonb, p_new jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if (p_table, p_column) not in (('widgets', 'settings'), ('dashboard_snapshots', 'words'), ('dashboard_snapshots', 'frozen'), ('versions', 'snapshot'), ('view_links', 'frozen'), ('view_links', 'snapshot_words')) then
    raise exception 'Not a column with sealed words: %.%', p_table, p_column;
  end if;
  perform set_config('ziffr.sealing_json', 'on', true);
  execute format('update %1$I set %2$I = $1 where id = $2 and workspace_id = $3 and %2$I = $4', p_table, p_column) using p_new, p_id, p_workspace, p_was;
  get diagnostics n = row_count;
  perform set_config('ziffr.sealing_json', 'off', true);
  return n = 1;
end;
$$;
revoke all on function seal_json(uuid, text, text, bigint, jsonb, jsonb) from public, anon, authenticated;

-- A new key version for a Workspace becomes current, the one before it retired, in one step under the Workspace row's
-- lock. p_version must be the next number after the newest, so two changes at once cannot both win. False when the
-- Workspace has no key or the version is not the next.
create function add_workspace_key_version(p_workspace uuid, p_version integer, p_wrapped text, p_wrapper text, p_under text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  newest integer;
begin
  perform 1 from workspaces where id = p_workspace for update;
  if not found then return false; end if;
  select max(version) into newest from workspace_keys where workspace_id = p_workspace;
  if newest is null or p_version <> newest + 1 then return false; end if;
  update workspace_keys set retired_at = now() where workspace_id = p_workspace and retired_at is null;
  insert into workspace_keys (workspace_id, version, wrapped, wrapper, wrapped_under) values (p_workspace, p_version, p_wrapped, p_wrapper, p_under);
  return true;
end;
$$;
revoke all on function add_workspace_key_version(uuid, integer, text, text, text) from public, anon, authenticated;

-- Destroys one retired key version, only when it is older than the current one and has been retired for at least
-- p_settle_seconds: by then no process still holds the key set from before the change (they keep it 10 minutes) and
-- so none can seal under it. The core has checked that nothing refers to it; this is the last guard.
create function destroy_key_version(p_workspace uuid, p_version integer, p_settle_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  perform 1 from workspaces where id = p_workspace for update;
  if not found then return false; end if;
  delete from workspace_keys
    where workspace_id = p_workspace and version = p_version and retired_at is not null
      and retired_at < now() - make_interval(secs => greatest(p_settle_seconds, 0))
      and version < (select max(version) from workspace_keys where workspace_id = p_workspace and retired_at is null);
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function destroy_key_version(uuid, integer, integer) from public, anon, authenticated;
