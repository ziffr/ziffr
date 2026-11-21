-- The re-encryption job (spec 0028, ticket #247; GLOSSARY: Workspace Key, Installation Admin). Plain rows of the sealed
-- columns are found, sealed by the core and checked off: these functions only list the rows that still need work and
-- count how far each column is, never a key. All of them answer the service role only. The job keeps no cursor: what
-- is left to do is read from the data, so it can stop and start at any time.

-- The format of a sealed value, as the core spells it (workspace-keys.ts): "w1.<version>.<iv>.<ciphertext>.<tag>".
create function sealed_format(p_value text) returns boolean language sql immutable as $$
  select p_value ~ '^w1\.[1-9][0-9]{0,8}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{22}$'
$$;

-- The key version a sealed value was written under; null for anything else.
create function sealed_version(p_value text) returns integer language sql immutable as $$
  select case when sealed_format(p_value) then (regexp_match(p_value, '^w1\.([0-9]+)\.'))[1]::integer end
$$;

revoke all on function sealed_format(text) from public, anon, authenticated;
revoke all on function sealed_version(text) from public, anon, authenticated;

-- An Audit Log event's details are sealed as a whole, kept as an object holding the sealed text: {"sealed": "w1..."}.
create function sealed_details(p_details jsonb) returns boolean language sql immutable as $$
  -- Never null: details without a "sealed" key are plain, not unknown.
  select coalesce(jsonb_typeof(p_details) = 'object' and (select count(*) from jsonb_object_keys(p_details)) = 1
    and jsonb_typeof(p_details -> 'sealed') = 'string' and sealed_format(p_details ->> 'sealed'), false)
$$;

revoke all on function sealed_details(jsonb) from public, anon, authenticated;

-- Where each sealed table keeps its rows of one Workspace: the column naming the row, its sealed columns and the
-- condition that picks the Workspace's rows ($1). A Contact's name lives in a person row of their own (role
-- 'Contact', in this Workspace only), never in a member's profile, which belongs to the person across Workspaces.
create function seal_table(p_table text, out key text, out cols text[], out scope text) language plpgsql immutable as $$
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
    else raise exception 'Not a table with sealed columns: %', p_table;
  end case;
end;
$$;

revoke all on function seal_table(text) from public, anon, authenticated;

-- Up to p_limit rows of one Workspace that still need sealing: a sealed column holding plain text, or a value written
-- under a key version older than p_current. p_skip names rows to leave out (ones this run could not seal). Rows come
-- back as { key, <sealed columns> } (an event's details too), in key order; the whole row is never returned.
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
  if p_table = 'audit_events' then
    picked := picked || ' or not sealed_details(details) or sealed_version(details ->> ''sealed'') < $2';
    wanted := wanted || ', details';
  end if;
  if p_table = 'contacts' then
    wanted := wanted || ', email_index, slack_index';
    -- A sealed address or handle without its blind index (never written so by the core) is filled in too.
    picked := picked || ' or (email is not null and email_index is null) or (slack_handle is not null and slack_index is null)';
  end if;
  return query execute format(
    'select to_jsonb(r) from (select %1$I::text as key%2$s from %3$I where (%4$s) and (%5$s) and not (%1$I::text = any($3)) order by %1$I limit $4) r',
    t.key, wanted, p_table, t.scope, substr(picked, 5)
  ) using p_workspace, p_current, coalesce(p_skip, array[]::text[]), p_limit;
end;
$$;
revoke all on function seal_candidates(uuid, text, integer, text[], integer) from public, anon, authenticated;

-- How far each sealed column of one Workspace is: how many values it holds, how many are plain, how many sit under a
-- key version older than p_current. One count per column. An event's details are counted as a column of their own.
create function seal_counts(p_workspace uuid, p_current integer)
returns table(table_name text, column_name text, total bigint, plain bigint, old_version bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  tbl text;
  t record;
  c text;
begin
  foreach tbl in array array['thread_messages', 'actions', 'contacts', 'profiles', 'deliveries', 'intake_log', 'audit_events', 'alerts', 'webhooks', 'webhook_external_ids', 'dashboards', 'widgets', 'metrics'] loop
    select * into t from seal_table(tbl);
    foreach c in array t.cols loop
      table_name := tbl; column_name := c;
      execute format(
        'select count(%1$I), count(%1$I) filter (where not sealed_format(%1$I)), count(%1$I) filter (where sealed_version(%1$I) < $2) from %2$I where %3$s',
        c, tbl, t.scope
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

-- How far the job is, per Workspace and column, as the last pass found it; never a value, a key or a row.
create table workspace_seal_progress (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  table_name text not null check (table_name ~ '^[a-z_]{1,63}$'),
  column_name text not null check (column_name ~ '^[a-z_]{1,63}$'),
  total bigint not null default 0,
  plain bigint not null default 0,
  -- Sealed under a key version older than the current one: the job moves these over.
  old_version bigint not null default 0,
  -- In the sealed format but would not open (changed, or from another place): counted apart from plain rows, and
  -- never overwritten by the job. Found when the column is checked off.
  unopenable bigint not null default 0,
  -- While the check of a big column is under way, the last row it has opened (and `unopenable` counts so far), so a
  -- pass that runs out of time goes on from there next time instead of starting again.
  verified_through text,
  -- Rows the last pass could not seal (two Contacts with the same address, a row that changed again and again).
  held_back bigint not null default 0,
  checked_at timestamptz not null default now(),
  -- Set when no plain row and no old-version row was left and every sealed value opened: from then on the core
  -- refuses plain values in this column (spec 0028). Cleared if a plain row turns up again.
  done_at timestamptz,
  primary key (workspace_id, table_name, column_name)
);
alter table workspace_seal_progress enable row level security;
revoke all on table workspace_seal_progress from public, anon, authenticated;

-- Which Workspaces the job has gone through, for the progress page: the last full pass of each, and when it began.
alter table workspaces add column sealed_checked_at timestamptz, add column sealed_claimed_at timestamptz;

-- One job at a time per Workspace: takes the Workspace for a pass of up to p_minutes, false when another job holds it.
-- Two jobs running at once would still be safe (every row is written only if it has not changed), this only keeps
-- them from doing the same work twice.
create function claim_seal_pass(p_workspace uuid, p_minutes integer) returns boolean language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update workspaces set sealed_claimed_at = now()
    where id = p_workspace and (sealed_claimed_at is null or sealed_claimed_at > now() or sealed_claimed_at < now() - make_interval(mins => p_minutes));
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function claim_seal_pass(uuid, integer) from public, anon, authenticated;

-- Ends a pass: the claim is given up and the time of the last full pass noted (null keeps the old one).
create function end_seal_pass(p_workspace uuid, p_full boolean) returns void language sql security definer set search_path = public as $$
  update workspaces set sealed_claimed_at = null, sealed_checked_at = case when p_full then now() else sealed_checked_at end where id = p_workspace;
$$;
revoke all on function end_seal_pass(uuid, boolean) from public, anon, authenticated;

-- The Audit Log stays add-only. The one exception, for the job: an event's object name and details may change from
-- plain to sealed, or from one key version to a newer one, by the function below and nothing else; every other column
-- stays as it was and the new values must be in the sealed format, so history can never be rewritten in clear.
create or replace function audit_events_add_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and (old.at < now() - interval '730 days' or not exists (select 1 from workspaces w where w.id = old.workspace_id)) then
    return old;
  end if;
  -- Only seal_audit_event, running as its owner, with the mark it sets for the length of its own statement.
  if tg_op = 'UPDATE' and current_setting('ziffr.sealing_audit', true) = 'on'
     and current_user = (select pg_get_userbyid(proowner) from pg_proc where oid = 'seal_audit_event(bigint,text,text,jsonb,jsonb)'::regprocedure)
     and (to_jsonb(new) - 'object_name' - 'details') = (to_jsonb(old) - 'object_name' - 'details')
     -- Each of the two stays as it is, or goes from plain to sealed, or from a key version to a newer one: never to
     -- plain text, never sideways to another value of the same version.
     and (new.object_name is not distinct from old.object_name
          or (new.object_name is not null and sealed_format(new.object_name) and (old.object_name is null or not sealed_format(old.object_name) or sealed_version(new.object_name) > sealed_version(old.object_name))))
     and (new.details = old.details
          or (sealed_details(new.details) and (not sealed_details(old.details) or sealed_version(new.details ->> 'sealed') > sealed_version(old.details ->> 'sealed')))) then
    return new;
  end if;
  raise exception 'The Audit Log is add-only.' using errcode = 'ZF403';
end;
$$;

-- Seals one event's object name and details, only if they are still what the job read (a compare-and-swap).
create function seal_audit_event(p_id bigint, p_name_was text, p_name text, p_details_was jsonb, p_details jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  perform set_config('ziffr.sealing_audit', 'on', true);
  update audit_events set object_name = p_name, details = p_details
    where id = p_id and object_name is not distinct from p_name_was and details = p_details_was;
  get diagnostics n = row_count;
  perform set_config('ziffr.sealing_audit', 'off', true);
  return n = 1;
end;
$$;
revoke all on function seal_audit_event(bigint, text, text, jsonb, jsonb) from public, anon, authenticated;

-- Seals a Contact's name, only if the person is still a Contact of this Workspace alone (a name is bound to one
-- Workspace) and the name is still what the job read: the scope of seal_table is applied again at the moment of writing.
create function seal_contact_name(p_workspace uuid, p_person text, p_name_was text, p_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update profiles set name = p_name
    where id = p_person and name = p_name_was and role = 'Contact'
      and id in (select c.person_id from contacts c where c.workspace_id = p_workspace and not exists (select 1 from contacts o where o.person_id = c.person_id and o.workspace_id <> c.workspace_id));
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function seal_contact_name(uuid, text, text, text) from public, anon, authenticated;

-- The demo is read-only: the job never writes it (it has no key and is skipped), and the guard keeps anyone else out too.
select attach_demo_guard('workspace_seal_progress');
