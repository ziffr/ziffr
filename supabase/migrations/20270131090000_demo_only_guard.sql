-- Demo review D6 (spec 0051): a visit may write only where the demo is the Installation's ONLY Workspace. Until now the one
-- switch was `demo_state.open_to_visitors`, set by the reset job from the setting ZIFFR_DEMO_CHANGES with ZIFFR_DEMO_ONLY; both
-- set by mistake on an Installation with real Workspaces would have given anonymous visits service-role writes. Now both
-- functions that let a visit's write pass refuse while any other Workspace exists. Everything else in them is as before
-- (20270126090000 and 20270128120000); the new check is the only change. Needs a security review.

create or replace function demo_visit_allows(t text) returns boolean
language plpgsql set search_path = public as $$
declare
  headers text := current_setting('request.headers', true);
  claims text := current_setting('request.jwt.claims', true);
  seen text;
  current_generation bigint;
begin
  if coalesce(headers, '') = '' or coalesce(claims, '') = '' then return false; end if;
  -- Only a demo-only Installation may let visitors write (spec 0051, review D6): the one switch, `open_to_visitors`, is set from a
  -- setting, so a mistake in settings must not open the doors of an Installation that has real Workspaces. Checked here in the
  -- database as well as by the core, which would refuse to switch it on.
  if exists (select 1 from workspaces where id <> 'd3e00000-0000-4000-8000-000000000001') then return false; end if;
  -- The header counts only on a request made with the service role, which is the core's.
  if (claims::json ->> 'role') is distinct from 'service_role' then return false; end if;
  seen := headers::json ->> 'x-ziffr-demo-visit';
  if seen is null or seen !~ '^[0-9]{1,15}$' then return false; end if;
  if not exists (select 1 from demo_open_tables where table_name = t) then return false; end if;
  -- This Installation must have said, through the reset job, that visitors may change its demo; and the table must have
  -- the statement trigger that took the lock before its rows were locked.
  if not exists (select 1 from demo_state where id and open_to_visitors) then return false; end if;
  if exists (select 1 from demo_open_tables_without_lock() w where w = t) then return false; end if;
  -- Shared with every other visit's write, exclusive for the reset (demo_reset takes the same key exclusively): a write
  -- in flight holds the reset off, and a reset that began first makes the write wait and then find the Generation moved.
  perform pg_advisory_xact_lock_shared(hashtext('ziffr-demo-reset'));
  select generation into current_generation from demo_state where id;
  if current_generation is distinct from seen::bigint then
    raise exception using errcode = 'ZF4D1', message = 'demo_stale';
  end if;
  -- The first change since the reset marks the demo as changed, for the job that resets only a changed demo. Later
  -- changes match no row, so they take no row lock and writers do not queue on it.
  update demo_state set changed_since_reset = true, last_change_at = now() where id and not changed_since_reset;
  return true;
end $$;
revoke execute on function demo_visit_allows(text) from public, anon, authenticated;
grant execute on function demo_visit_allows(text) to service_role;

create or replace function demo_visit_current() returns boolean
language plpgsql set search_path = public as $$
declare
  headers text := current_setting('request.headers', true);
  claims text := current_setting('request.jwt.claims', true);
  seen text;
  current_generation bigint;
begin
  if coalesce(headers, '') = '' or coalesce(claims, '') = '' then return false; end if;
  -- Only a demo-only Installation may let visitors write (spec 0051, review D6): the one switch, `open_to_visitors`, is set from a
  -- setting, so a mistake in settings must not open the doors of an Installation that has real Workspaces. Checked here in the
  -- database as well as by the core, which would refuse to switch it on.
  if exists (select 1 from workspaces where id <> 'd3e00000-0000-4000-8000-000000000001') then return false; end if;
  if (claims::json ->> 'role') is distinct from 'service_role' then return false; end if;
  seen := headers::json ->> 'x-ziffr-demo-visit';
  if seen is null or seen !~ '^[0-9]{1,15}$' then return false; end if;
  if not exists (select 1 from demo_state where id and open_to_visitors and showcase_ready) then return false; end if;
  perform pg_advisory_xact_lock_shared(hashtext('ziffr-demo-reset'));
  select generation into current_generation from demo_state where id;
  if current_generation is distinct from seen::bigint then
    raise exception using errcode = 'ZF4D1', message = 'demo_stale';
  end if;
  update demo_state set changed_since_reset = true, last_change_at = now() where id and not changed_since_reset;
  return true;
end $$;
revoke execute on function demo_visit_current() from public, anon, authenticated;
grant execute on function demo_visit_current() to service_role;
