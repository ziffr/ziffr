-- The demo guard becomes an allow-list (spec 0051, ticket 3; GLOSSARY: Demo Mode, Demo Reset). Until now every write to
-- the demo is refused unless the seed writes (20261225110000). This migration adds the way to let a visit's writes
-- through, and opens nothing: `demo_open_tables` is empty, so every write is refused exactly as before.
--
-- A visit's write passes only when ALL hold: the request is the core's (service role) and carries the visit header
-- `x-ziffr-demo-visit: <Generation>` (the core sends it only where the setting ZIFFR_DEMO_CHANGES is in effect, which
-- needs a demo-only Installation); the table is on `demo_open_tables`; and the Generation is the demo's current one.
-- The check takes the reset's advisory lock in its shared form, so a write either commits before a Demo Reset begins, or
-- waits for it and is then refused as stale (ZF4D1) because the Generation moved: no row of an old Generation lands in
-- the new demo. Anything else keeps the old refusal (ZF4D0). The header counts only with the service role, which only
-- the core holds, and Row Level Security with no policies keeps every browser out, so it gives nobody anything new.
--
-- Rows outside the demo still cost one comparison in the trigger's WHEN clause (attach_demo_guard) and nothing here.
-- This migration writes no demo row.

-- The tables a visit may write, written only by migrations. Never the tables of people, the workspace's own row and
-- the like: the check makes sure of it, whatever a later migration puts here.
create table demo_open_tables (
  table_name text primary key,
  check (table_name not in ('workspaces', 'profiles', 'memberships', 'contacts', 'away', 'ask_now_claims', 'demo_state', 'demo_visit_counts'))
);
-- The tables refused on purpose, each with its reason.
create table demo_closed_tables (
  table_name text primary key,
  reason text not null check (length(reason) > 0)
);
alter table demo_open_tables enable row level security;
alter table demo_closed_tables enable row level security;
revoke all on demo_open_tables, demo_closed_tables from public, anon, authenticated;
grant select on demo_open_tables, demo_closed_tables to service_role;

-- Every table of today with a workspace_id is closed. A later ticket opens a table by moving its row to the open list in
-- a migration of its own, and says why the others stay closed.
insert into demo_closed_tables (table_name, reason)
select c.table_name::text, 'Closed until a ticket of spec 0051 opens it: the demo is read-only for visitors.'
from information_schema.columns c
join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
where c.table_schema = 'public' and c.column_name = 'workspace_id';

-- Tables with a workspace_id on neither list. demo-read-only.db.test.ts asks, as it asks demo_read_only_gaps(): a
-- migration that makes a table calls attach_demo_guard and puts the table on one of the two lists.
create or replace function demo_unclassified_tables() returns setof text
language sql stable set search_path = public as $$
  select c.table_name::text from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'workspace_id'
    and c.table_name::text not in (select table_name from demo_open_tables)
    and c.table_name::text not in (select table_name from demo_closed_tables)
  order by 1
$$;
revoke execute on function demo_unclassified_tables() from public, anon, authenticated;
grant execute on function demo_unclassified_tables() to service_role;

-- Whether the request is a visit's write to this table that may pass. Raises ZF4D1 when the table is open, the request is a
-- visit's and the Generation is no longer the demo's. Called only for a row of the demo, by demo_read_only().
create or replace function demo_visit_allows(t text) returns boolean
language plpgsql set search_path = public as $$
declare
  headers text := current_setting('request.headers', true);
  claims text := current_setting('request.jwt.claims', true);
  seen text;
  current_generation bigint;
begin
  if coalesce(headers, '') = '' or coalesce(claims, '') = '' then return false; end if;
  -- The header counts only on a request made with the service role, which is the core's.
  if (claims::json ->> 'role') is distinct from 'service_role' then return false; end if;
  seen := headers::json ->> 'x-ziffr-demo-visit';
  if seen is null or seen !~ '^[0-9]{1,15}$' then return false; end if;
  if not exists (select 1 from demo_open_tables where table_name = t) then return false; end if;
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

-- The guard: the seed writes, as before; a visit's write passes where the table is open and the Generation is current;
-- everything else is refused with ZF4D0. With the open list empty, the second line never lets anything through.
create or replace function demo_read_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if demo_seeding() then return coalesce(new, old); end if;
  if demo_visit_allows(tg_table_name::text) then return coalesce(new, old); end if;
  raise exception using errcode = 'ZF4D0', message = 'demo_read_only';
end $$;
