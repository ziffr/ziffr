-- Tags (spec 0038, ticket #656; GLOSSARY: Tag): free words a Workspace puts on its Metrics, to find and group them. A Tag is
-- a row of its Workspace with its name sealed with the Workspace Key (spec 0028), bound to the row, so the core makes the
-- id first; `name_index` is the blind index of the normalised, lower-cased name, so a Workspace has one Tag per name without
-- the name being readable. `metric_tags` links a Tag to a Metric. Service role only: row level security stays on with no
-- policies, and what a person may see of a Tag is decided in the core (visibleTags), never here.
create table tags (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- Sealed: 600 characters leave room for the sealing of a name of at most 32.
  name text not null check (char_length(name) between 1 and 600),
  name_index text not null check (char_length(name_index) between 1 and 200),
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index tags_workspace_name_index on tags (workspace_id, name_index);
alter table tags enable row level security;
select attach_demo_guard('tags');

create table metric_tags (
  metric_id integer not null references metrics(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (metric_id, tag_id)
);
create index metric_tags_tag_idx on metric_tags (tag_id);
create index metric_tags_workspace_idx on metric_tags (workspace_id);
alter table metric_tags enable row level security;
select attach_demo_guard('metric_tags');

-- A Tag with no Metric left is removed (nothing lingers in the list, and the 200 count is words in use): after any delete of
-- links, whether a Tag was taken off a Metric or the Metric itself was deleted. It takes the Workspace's lock first, so a
-- Tag a request is just putting on another Metric is not removed under it.
create function tags_drop_unused() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('tags:' || w::text)) from (select distinct workspace_id as w from old_rows order by 1) x;
  delete from tags t where t.id in (select tag_id from old_rows) and not exists (select 1 from metric_tags m where m.tag_id = t.id);
  return null;
end $$;
create trigger metric_tags_drop_unused after delete on metric_tags referencing old table as old_rows for each statement execute function tags_drop_unused();

-- Changes the Tags of one Metric, in one step under a lock of the Workspace, so requests at once cannot pass the limits
-- together or lose each other's change. p_mode: 'set' makes the Tags exactly p_tags, 'add' puts p_tags on top of what the
-- Metric has, 'remove' takes p_tags off (words no Tag has are ignored). p_tags: [{"id": a fresh uuid, "name": sealed,
-- "index": current blind index, "indexes": [every index the name has under the key versions still held]}], no two of one
-- name. A word that exists is attached whoever sends it; a new one is made only with p_allow_new, and within p_max_ws
-- (counted after the Tags this call frees). Answers {"status": "ok" | "metric" | "new" | "metric_limit" |
-- "workspace_limit", "ids": [the Metric's Tags now]}. Nothing changes unless "ok".
create function set_metric_tags(p_ws uuid, p_metric integer, p_by text, p_mode text, p_tags jsonb, p_allow_new boolean, p_max_metric integer, p_max_ws integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t jsonb;
  hit uuid;
  have uuid[];
  named uuid[] := '{}';
  ids uuid[];
  fresh jsonb := '[]'::jsonb;
  freed integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('tags:' || p_ws::text));
  if jsonb_typeof(p_tags) <> 'array' then raise exception 'Tags must be a list.'; end if;
  if p_mode not in ('set', 'add', 'remove') then raise exception 'Unknown mode.'; end if;
  if not exists (select 1 from metrics where id = p_metric and workspace_id = p_ws) then return jsonb_build_object('status', 'metric'); end if;
  select coalesce(array_agg(tag_id), '{}') into have from metric_tags where metric_id = p_metric and workspace_id = p_ws;
  for t in select * from jsonb_array_elements(p_tags) loop
    select id into hit from tags where workspace_id = p_ws and name_index in (select jsonb_array_elements_text(t -> 'indexes')) limit 1;
    if hit is null then
      if p_mode = 'remove' then continue; end if;
      if not p_allow_new then return jsonb_build_object('status', 'new'); end if;
      fresh := fresh || jsonb_build_array(t);
    elsif not hit = any (named) then
      named := array_append(named, hit);
    end if;
  end loop;
  if p_mode = 'remove' then
    ids := array(select x from unnest(have) x where not x = any (named));
  elsif p_mode = 'add' then
    ids := array(select distinct x from unnest(have || named) x);
  else
    ids := named;
  end if;
  if cardinality(ids) + jsonb_array_length(fresh) > p_max_metric then return jsonb_build_object('status', 'metric_limit'); end if;
  -- Tags this Metric has now, that it will not have and that no other Metric has, go with this call: room for new ones.
  select count(*) into freed from unnest(have) l where not l = any (ids)
    and not exists (select 1 from metric_tags o where o.tag_id = l and o.metric_id <> p_metric);
  if (select count(*) from tags where workspace_id = p_ws) - freed + jsonb_array_length(fresh) > p_max_ws then return jsonb_build_object('status', 'workspace_limit'); end if;
  for t in select * from jsonb_array_elements(fresh) loop
    insert into tags (id, workspace_id, name, name_index, created_by) values ((t ->> 'id')::uuid, p_ws, t ->> 'name', t ->> 'index', p_by);
    ids := array_append(ids, (t ->> 'id')::uuid);
  end loop;
  insert into metric_tags (metric_id, tag_id, workspace_id) select p_metric, i, p_ws from unnest(ids) i on conflict do nothing;
  delete from metric_tags where metric_id = p_metric and workspace_id = p_ws and not tag_id = any (ids);
  return jsonb_build_object('status', 'ok', 'ids', to_jsonb(ids));
end $$;
revoke execute on function set_metric_tags(uuid, integer, text, text, jsonb, boolean, integer, integer) from public, anon, authenticated;
grant execute on function set_metric_tags(uuid, integer, text, text, jsonb, boolean, integer, integer) to service_role;

-- Renames one Tag: 'ok', 'missing' (not of this Workspace) or 'exists' (another Tag already has that name: merge instead).
create function rename_tag(p_ws uuid, p_id uuid, p_name text, p_index text, p_indexes text[]) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('tags:' || p_ws::text));
  if not exists (select 1 from tags where id = p_id and workspace_id = p_ws) then return 'missing'; end if;
  if exists (select 1 from tags where workspace_id = p_ws and id <> p_id and name_index = any (p_indexes)) then return 'exists'; end if;
  update tags set name = p_name, name_index = p_index where id = p_id and workspace_id = p_ws;
  return 'ok';
end $$;
revoke execute on function rename_tag(uuid, uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function rename_tag(uuid, uuid, text, text, text[]) to service_role;

-- Moves every Metric of one Tag to another and removes the first: 'ok' or 'missing'. A Metric that had both keeps one.
-- The count of Tags per Metric cannot grow: a Metric with the first only has the second instead.
create function merge_tags(p_ws uuid, p_from uuid, p_into uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('tags:' || p_ws::text));
  if p_from = p_into or (select count(*) from tags where workspace_id = p_ws and id in (p_from, p_into)) <> 2 then return 'missing'; end if;
  insert into metric_tags (metric_id, tag_id, workspace_id) select metric_id, p_into, p_ws from metric_tags where tag_id = p_from and workspace_id = p_ws on conflict do nothing;
  delete from tags where id = p_from and workspace_id = p_ws;
  return 'ok';
end $$;
revoke execute on function merge_tags(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function merge_tags(uuid, uuid, uuid) to service_role;

-- Removes a Tag from every Metric (its links go with it): 'ok' or 'missing'.
create function delete_tag(p_ws uuid, p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('tags:' || p_ws::text));
  delete from tags where id = p_id and workspace_id = p_ws;
  return case when found then 'ok' else 'missing' end;
end $$;
revoke execute on function delete_tag(uuid, uuid) from public, anon, authenticated;
grant execute on function delete_tag(uuid, uuid) to service_role;

-- The re-encryption job and its counts know the new table: a Tag's name is sealed with its blind index, which the job
-- recomputes under the current key version (seal_table, seal_candidates and seal_counts as before, with Tags added).
create or replace function seal_table(p_table text, out key text, out cols text[], out ncols text[], out extra text[], out scope text) language plpgsql immutable as $$
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
    -- A period's note, named by its Metric and period through the generated row_key.
    when 'period_states' then key := 'row_key'; cols := array['note']; scope := 'workspace_id = $1';
    -- A Slack connection's bot token, named by its Workspace; a revoked connection keeps no token (see below), so it is not listed.
    when 'slack_installations' then key := 'workspace_id'; cols := array['bot_token']; scope := 'workspace_id = $1 and revoked_at is null';
    -- A Tag's name (spec 0038), sealed with its blind index beside it.
    when 'tags' then key := 'id'; cols := array['name']; scope := 'workspace_id = $1';
    else raise exception 'Not a table with sealed columns: %', p_table;
  end case;
end;
$$;
revoke all on function seal_table(text) from public, anon, authenticated;

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
  if p_table = 'tags' then
    wanted := wanted || ', name_index';
    picked := picked || ' or coalesce(blind_index_version(name_index), 0) < $2';
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

create or replace function seal_counts(p_workspace uuid, p_current integer)
returns table(table_name text, column_name text, total bigint, plain bigint, old_version bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  tbl text;
  t record;
  c text;
  extra text;
begin
  foreach tbl in array array['thread_messages', 'actions', 'contacts', 'profiles', 'deliveries', 'prompts', 'intake_log', 'audit_events', 'alerts', 'webhooks', 'webhook_external_ids', 'dashboards', 'widgets', 'metrics', 'condensed_values', 'breakdown_rows', 'breakdown_history',
    'observations', 'observation_history', 'series_values', 'period_states', 'slack_installations', 'tags'] loop
    select * into t from seal_table(tbl);
    foreach c in array t.cols loop
      table_name := tbl; column_name := c;
      extra := case
        when tbl = 'breakdown_rows' then ' or (label_index is null or coalesce(blind_index_version(label_index), 0) < $2)'
        when tbl = 'webhook_external_ids' and c = 'external_id' then ' or coalesce(blind_index_version(external_hash), 0) < $2'
        when tbl = 'tags' then ' or coalesce(blind_index_version(name_index), 0) < $2'
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
