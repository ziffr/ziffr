-- The demo's limits (spec 0051, ticket 5; GLOSSARY: Demo Mode): how many rows of each kind visitors may make in the demo
-- between two Demo Resets, and the kinds of count the write budget keeps. This migration opens NOTHING and applies no
-- limit to any table: `apply_demo_limits` is what the migration that opens a table calls, after `open_demo_table`. Until
-- then no trigger below exists on any table, and the demo is as read-only as before.

-- One row per kind of row; the core's list (packages/core/src/demo-limits.ts) holds the same numbers and a database test
-- compares them. The service role may change a number (no migration needed), never what is counted: the table, the scope
-- and the filter are named by migrations only.
create table demo_limits (
  kind text primary key check (kind ~ '^[a-z_]{1,40}$'),
  max_rows integer not null check (max_rows between 1 and 100000),
  -- Counted per value of this column of the new row (widgets per dashboard), or for the whole demo when null.
  scope_column text check (scope_column ~ '^[a-z_]{1,63}$'),
  -- Counted only among rows whose column has this value, as text (saved widgets, open Questions and Tasks).
  filter_column text check (filter_column ~ '^[a-z_]{1,63}$'),
  filter_value text,
  check ((filter_column is null) = (filter_value is null))
);
alter table demo_limits enable row level security;
revoke all on demo_limits from public, anon, authenticated, service_role;
grant select on demo_limits to service_role;
grant update (max_rows) on demo_limits to service_role;

insert into demo_limits (kind, max_rows, scope_column, filter_column, filter_value) values
  ('dashboards', 25, null, null, null),
  ('widgets_per_dashboard', 40, 'dashboard_id', 'saved', 'false'),
  ('saved_widgets', 50, null, 'saved', 'true'),
  ('decks', 15, null, null, null),
  ('snapshots', 20, null, null, null),
  ('metrics', 15, null, null, null),
  ('templates', 15, null, null, null),
  ('workflows', 10, null, null, null),
  ('groups', 10, null, null, null),
  ('tags', 20, null, null, null),
  ('open_actions', 300, null, 'status', 'open'),
  ('values', 2000, null, null, null);

-- When the seed of this Generation was finished. A reset makes the demo in one transaction (`reset_at`, its start), but
-- the core then writes more seed rows in steps of their own (Snapshots, the close, the Outbox), which are created after
-- `reset_at`. The core sets this when the last step is done; until then (and on a demo that was never reset since this
-- migration) the cap counts from `reset_at`, which can only make a cap fire early, never late. Seed rows are then never
-- counted against visitors.
alter table demo_state add column seed_done_at timestamptz;

-- Every seed of the demo makes its Workspace again: as before (20270125120000), the Generation moves and the flag clears
-- in the same transaction, and now the seed's end is unknown again until the core says it is done.
create or replace function demo_state_on_reset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update demo_state set generation = generation + 1, changed_since_reset = false, last_change_at = null, reset_at = now(), seed_done_at = null
    where id;  -- a WHERE clause is required of every UPDATE here
  return null;
end $$;
revoke execute on function demo_state_on_reset() from public, anon, authenticated;

-- The row-cap trigger: before a row is inserted into the demo, or changed so that it becomes one of a kind, counts the
-- rows of this kind that visitors made since the seed was done (created after it) and refuses with ZF4D2 when the cap is
-- reached. It takes the demo Workspace's row lock first (NO KEY UPDATE: it does not conflict with the foreign-key checks
-- of other inserts), so two requests at the last place cannot both pass. The seed is never limited.
-- An UPDATE is checked only when it moves a row into a kind or into another scope (the trigger fires only for an UPDATE of
-- the counted columns); the row itself is not yet counted there, as its old values are in another bucket.
create or replace function demo_limit_check() returns trigger
language plpgsql set search_path = public as $$
declare
  lim demo_limits%rowtype;
  since timestamptz;
  total bigint;
  new_row jsonb := to_jsonb(new);
  scope_val text;
begin
  if demo_seeding() then return new; end if;
  select * into lim from demo_limits where kind = tg_argv[0];
  -- An unknown kind refuses rather than lets everything through.
  if not found then raise exception using errcode = 'ZF4D2', message = 'demo_limit:unknown'; end if;
  -- A row that is not of this kind (an unsaved widget for "saved widgets") is not this limit's business.
  if lim.filter_column is not null and (new_row ->> lim.filter_column) is distinct from lim.filter_value then return new; end if;
  scope_val := case when lim.scope_column is null then null else new_row ->> lim.scope_column end;
  -- An update that leaves the row in the kind and the scope it was in changes no count.
  if tg_op = 'UPDATE' then
    if (lim.filter_column is null or (to_jsonb(old) ->> lim.filter_column) = lim.filter_value)
       and (lim.scope_column is null or (to_jsonb(old) ->> lim.scope_column) is not distinct from scope_val) then
      return new;
    end if;
  end if;
  perform 1 from workspaces where id = 'd3e00000-0000-4000-8000-000000000001' for no key update;
  select coalesce(seed_done_at, reset_at) into since from demo_state where id;
  execute format(
    'select count(*) from %I.%I where workspace_id = $1 and created_at > coalesce($2, ''-infinity''::timestamptz)%s%s',
    tg_table_schema, tg_table_name,
    case when lim.filter_column is null then '' else format(' and %I::text = %L', lim.filter_column, lim.filter_value) end,
    case when lim.scope_column is null or scope_val is null then '' else format(' and %I::text = %L', lim.scope_column, scope_val) end
  ) into total using new.workspace_id, since;
  if total >= lim.max_rows then
    raise exception using errcode = 'ZF4D2', message = 'demo_limit:' || lim.kind;
  end if;
  return new;
end $$;
revoke execute on function demo_limit_check() from public, anon, authenticated;

-- Gives a table with a workspace_id and a created_at the row-cap triggers of one kind (one on INSERT; one on UPDATE of the
-- columns the kind counts by, where there are any) and an index for the count. Called by the migration that opens the
-- table, after open_demo_table; safe to call twice. It fails loudly for a kind that does not exist or a column the table
-- does not have, so a cap is never silently missing. The triggers are named to sort after the demo guard's and the reset
-- lock's, so a write the guard refuses is refused as before and never answers with a limit.
create or replace function apply_demo_limits(t regclass, p_kind text) returns void
language plpgsql set search_path = public as $$
declare
  lim demo_limits%rowtype;
  col text;
  cols text[] := '{}';
begin
  select * into lim from demo_limits where kind = p_kind;
  if not found then raise exception 'apply_demo_limits: no limit "%"', p_kind; end if;
  foreach col in array array['workspace_id', 'created_at'] || array_remove(array[lim.filter_column, lim.scope_column], null) loop
    if not exists (select 1 from pg_attribute where attrelid = t and attname = col and not attisdropped) then
      raise exception 'apply_demo_limits: % has no column "%" (limit "%")', t, col, p_kind;
    end if;
  end loop;
  cols := array_remove(array[lim.filter_column, lim.scope_column], null);
  execute format('drop trigger if exists %I on %s', 'zzz_demo_limit_' || p_kind, t);
  execute format('drop trigger if exists %I on %s', 'zzz_demo_limit_' || p_kind || '_upd', t);
  execute format($f$create trigger %I before insert on %s for each row
    when (new.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_limit_check(%L)$f$,
    'zzz_demo_limit_' || p_kind, t, p_kind);
  if array_length(cols, 1) > 0 then
    execute format($f$create trigger %I before update of %s on %s for each row
      when (new.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_limit_check(%L)$f$,
      'zzz_demo_limit_' || p_kind || '_upd', (select string_agg(quote_ident(c), ', ') from unnest(cols) c), t, p_kind);
  end if;
  -- The count scans a Workspace's rows by creation time: without this index it reads the whole table on every insert.
  execute format('create index if not exists %I on %s (workspace_id, created_at)', 'demo_limit_' || (select relname from pg_class where oid = t) || '_ix', t);
end $$;
revoke execute on function apply_demo_limits(regclass, text) from public, anon, authenticated, service_role;

-- The tables that carry a row-cap trigger, with its kind: the database test asks, and a trigger on a table that is not
-- open is a mistake it names.
create or replace function demo_limit_triggers() returns table (table_name text, kind text)
language sql stable set search_path = public as $$
  select distinct c.relname::text, regexp_replace(substr(g.tgname, length('zzz_demo_limit_') + 1), '_upd$', '')
  from pg_trigger g join pg_class c on c.oid = g.tgrelid
  where not g.tgisinternal and g.tgname like 'zzz\_demo\_limit\_%'
  order by 1, 2
$$;
revoke execute on function demo_limit_triggers() from public, anon, authenticated;
grant execute on function demo_limit_triggers() to service_role;

-- The write budget keeps two more kinds of count: a visit's changes in one minute (under the minute's start as the
-- window), and a network's (an IPv4 /24 or an IPv6 /48, as a keyed hash).
alter table demo_visit_counts drop constraint demo_visit_counts_kind_check;
alter table demo_visit_counts add constraint demo_visit_counts_kind_check check (kind in ('visit_minute', 'visit', 'address', 'network', 'demo'));
