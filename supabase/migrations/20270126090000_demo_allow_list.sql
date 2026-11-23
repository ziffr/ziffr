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
-- Three more things keep this safe on an Installation that is not a demo-only one, and from a mistake in the core:
-- `demo_state.open_to_visitors` (set by the reset job from the setting in effect; the database refuses a visit unless it
-- is on), the tables' write privileges (the service role can no longer write the lists), and a statement trigger that
-- takes the reset lock before any row is locked, so a visit's UPDATE or DELETE cannot deadlock against a reset.
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
-- Supabase's default privileges give the service role everything on a new table: take the writes back, so that only
-- migrations (the table's owner) change what is open. The core, with the service role, can only read the lists.
revoke all on demo_open_tables, demo_closed_tables from service_role;
grant select on demo_open_tables, demo_closed_tables to service_role;

-- Whether this Installation lets visitors change the demo: set by the reset job from the setting in effect (which only
-- the core can read, as it comes from the environment and the Installation settings page) at every call, which the clock
-- makes every 15 minutes there. Off by default and after anything but a call that says on, so the database refuses a
-- visit on an Installation where it was never switched on, whatever header arrives.
alter table demo_state add column open_to_visitors boolean not null default false;
-- The core updates this row (the flag); nothing needs to insert into it, delete it or empty it.
revoke insert, delete, truncate on demo_state from service_role;

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

-- Moves with the reset's lock: a statement trigger for each open table runs before any row of the statement is locked.
-- Postgres locks a row before its row trigger runs, so taking the shared lock only there could wait for a reset that
-- is itself waiting for that row: a deadlock. Here the visit queues behind a reset first, then finds its Generation stale.
create or replace function demo_visit_lock() returns trigger
language plpgsql set search_path = public as $$
declare
  headers text := current_setting('request.headers', true);
  claims text := current_setting('request.jwt.claims', true);
  seen text;
begin
  if coalesce(headers, '') = '' or coalesce(claims, '') = '' then return null; end if;
  if (claims::json ->> 'role') is distinct from 'service_role' then return null; end if;
  seen := headers::json ->> 'x-ziffr-demo-visit';
  if seen is null or seen !~ '^[0-9]{1,15}$' then return null; end if;
  perform pg_advisory_xact_lock_shared(hashtext('ziffr-demo-reset'));
  if (select generation from demo_state where id) is distinct from seen::bigint then
    raise exception using errcode = 'ZF4D1', message = 'demo_stale';
  end if;
  return null;
end $$;
revoke execute on function demo_visit_lock() from public, anon, authenticated;

-- Opens a table to visits: puts it on the list and gives it the lock's statement trigger. The way a migration of a later
-- ticket opens a table; it is run by migrations only.
create or replace function open_demo_table(t regclass) returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from pg_attribute where attrelid = t and attname = 'workspace_id' and not attisdropped) then
    raise exception 'open_demo_table: % has no workspace_id', t;
  end if;
  delete from demo_closed_tables where table_name = (select relname::text from pg_class where oid = t);
  insert into demo_open_tables (table_name) values ((select relname::text from pg_class where oid = t)) on conflict do nothing;
  execute format('drop trigger if exists zz_demo_visit_lock on %s', t);
  execute format('create trigger zz_demo_visit_lock before insert or update or delete on %s for each statement execute function demo_visit_lock()', t);
end $$;
revoke execute on function open_demo_table(regclass) from public, anon, authenticated, service_role;

-- Open tables without the lock's statement trigger: none, unless a migration put a table on the list by hand.
-- demo-read-only.db.test.ts asks, and demo_visit_allows refuses such a table.
create or replace function demo_open_tables_without_lock() returns setof text
language sql stable set search_path = public as $$
  select o.table_name from demo_open_tables o
  where not exists (select 1 from pg_trigger g where g.tgrelid = to_regclass('public.' || quote_ident(o.table_name)) and g.tgname = 'zz_demo_visit_lock')
  order by 1
$$;
revoke execute on function demo_open_tables_without_lock() from public, anon, authenticated;
grant execute on function demo_open_tables_without_lock() to service_role;

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

-- The guard: the seed writes, as before; a visit's write passes where the table is open and the Generation is current;
-- everything else is refused with ZF4D0. With the open list empty, the second line never lets anything through.
create or replace function demo_read_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if demo_seeding() then return coalesce(new, old); end if;
  -- A visit's write stays inside the demo: an UPDATE never moves a row into or out of it, and never changes its id.
  if tg_op = 'UPDATE' and (to_jsonb(old) ->> (case when tg_table_name = 'workspaces' then 'id' else 'workspace_id' end))
       is distinct from (to_jsonb(new) ->> (case when tg_table_name = 'workspaces' then 'id' else 'workspace_id' end)) then
    raise exception using errcode = 'ZF4D0', message = 'demo_read_only';
  end if;
  if demo_visit_allows(tg_table_name::text) then return coalesce(new, old); end if;
  raise exception using errcode = 'ZF4D0', message = 'demo_read_only';
end $$;
