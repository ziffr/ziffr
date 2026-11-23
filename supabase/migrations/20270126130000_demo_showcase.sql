-- Seeded words and the showcase of the demo (spec 0051, ticket 6; GLOSSARY: Demo Mode, Demo Reset). When a later ticket lets
-- visitors change a table, they may change what the seed made, but not its words (names, descriptions, intros, a
-- Snapshot's words) and not the few objects the landing page and the tour point at (the showcase). This migration builds
-- that protection and opens nothing: no table is on `demo_open_tables`, so the demo guard refuses every visitor write
-- before the trigger below is ever reached. A visitor can still do exactly as much as yesterday: nothing.
--
-- What is here:
--  * `demo_words_columns`: for each table a visitor might be let write, the columns that hold words (`words`) or that
--    keep a seeded row in being (`kept`: archived, deleted, a slug). Written only by migrations. packages/core/src/
--    demo-words-columns.ts is the same list with every other text column too, and a database test compares the two and
--    the schema, so a new column or table fails a test until someone has said what it is.
--  * `demo_kept_rows`: the tables whose seeded rows a visitor may not delete (Metrics, Workflows, Groups, Tags, Themes,
--    templates, dashboards, decks, Snapshots), so the demo never misses a part of itself between resets.
--  * `demo_seeded_rows` and `demo_showcase`: no workspace_id, filled by `prototype_seed_showcase()` after every Demo Reset
--    (the ids change at each reset), as the keys (`demo_row_key`) of the rows the seed made, and of the showcase.
--  * `demo_protected_reason`: the one check, and a row trigger `zz_demo_words_*` that runs it for a row of the demo. The
--    trigger sorts after the demo guard (`zz_demo_read_only_*`), which refuses first unless the seed or an allowed visit
--    writes; the seed always passes here. It refuses with ZF4D3 (showcase) or ZF4D4 (words).
--
-- The migration writes only its own new tables (and runs the seed function once, with ziffr.demo_seed on for its
-- transaction, rule 5): no demo row is written, so it is safe where the demo exists.

-- Which columns of which tables are words, or keep a seeded row. Never written by the core: only by migrations.
create table demo_words_columns (
  table_name text not null,
  column_name text not null,
  kind text not null check (kind in ('words', 'kept')),
  primary key (table_name, column_name)
);
create table demo_kept_rows (table_name text primary key);
-- The keys of the rows the seed made, and of the showcase, as demo_row_key writes them. No workspace_id: these hold keys
-- of the demo only, and the seed function empties and fills them.
create table demo_seeded_rows (table_name text not null, row_key text not null, primary key (table_name, row_key));
create table demo_showcase (table_name text not null, row_key text not null, primary key (table_name, row_key));
alter table demo_words_columns enable row level security;
alter table demo_kept_rows enable row level security;
alter table demo_seeded_rows enable row level security;
alter table demo_showcase enable row level security;
revoke all on demo_words_columns, demo_kept_rows, demo_seeded_rows, demo_showcase from public, anon, authenticated, service_role;
grant select on demo_words_columns, demo_kept_rows, demo_seeded_rows, demo_showcase to service_role;

insert into demo_words_columns (table_name, column_name, kind) values
  ('dashboards', 'name', 'words'), ('dashboards', 'intro', 'words'),
  ('widgets', 'title', 'words'),
  ('decks', 'name', 'words'), ('decks', 'footer', 'words'),
  ('metrics', 'name', 'words'), ('metrics', 'description', 'words'), ('metrics', 'unit', 'words'),
  ('metrics', 'slug', 'kept'), ('metrics', 'archived_at', 'kept'), ('metrics', 'archived_by', 'kept'),
  ('workflows', 'name', 'words'),
  ('groups', 'name', 'words'),
  ('themes', 'name', 'words'),
  ('team_templates', 'name', 'words'), ('team_templates', 'description', 'words'),
  ('tags', 'name', 'words'), ('tags', 'name_index', 'words'),
  ('dashboard_snapshots', 'label', 'words'), ('dashboard_snapshots', 'words', 'words'),
  ('dashboard_snapshots', 'deleted_at', 'kept'), ('dashboard_snapshots', 'deleted_by', 'kept'),
  ('actions', 'question', 'words'),
  ('thread_messages', 'body', 'words'),
  ('series_values', 'note', 'words'),
  ('period_states', 'note', 'words'),
  ('prompts', 'text', 'words'),
  ('deliveries', 'subject', 'words'), ('deliveries', 'body', 'words'),
  ('versions', 'name', 'words'), ('versions', 'message', 'words');
insert into demo_kept_rows (table_name) values
  ('dashboards'), ('decks'), ('metrics'), ('workflows'), ('groups'), ('themes'), ('team_templates'), ('tags'), ('dashboard_snapshots');

-- The key of a row in demo_seeded_rows and demo_showcase: the id, except where a row is one of a Metric's period (its
-- value, its history and its state), which is named by the Metric and the period so that a new row for the same period
-- is the same key.
create or replace function demo_row_key(t text, r jsonb) returns text
language sql immutable set search_path = public as $$
  select case when t in ('observations', 'observation_history', 'period_states') then (r ->> 'metric_id') || ':' || (r ->> 'period_start') else r ->> 'id' end
$$;
revoke execute on function demo_row_key(text, jsonb) from public, anon, authenticated;
grant execute on function demo_row_key(text, jsonb) to service_role;

-- Whether a row belongs to the showcase: it is listed, or it hangs off an object that is (a widget or Snapshot of a showcase
-- dashboard, a reply in a showcase Thread, a Question on a showcase period, a share or Version of a showcase dashboard or
-- deck), so a visitor cannot add to what everyone must see as it is either.
create or replace function demo_in_showcase(t text, r jsonb) returns boolean
language sql stable set search_path = public as $$
  select r is not null and (
    exists (select 1 from demo_showcase s where s.table_name = t and s.row_key = demo_row_key(t, r))
    or case
      when t in ('widgets', 'dashboard_snapshots') then exists (select 1 from demo_showcase s where s.table_name = 'dashboards' and s.row_key = r ->> 'dashboard_id')
      when t in ('shares', 'versions', 'access_requests') then exists (
        select 1 from demo_showcase s where s.row_key = r ->> 'object_id'
          and s.table_name = case r ->> 'object_type' when 'dashboard' then 'dashboards' when 'deck' then 'decks' else '' end)
      when t = 'thread_messages' then exists (select 1 from demo_showcase s where s.table_name = 'actions' and s.row_key = r ->> 'action_id')
      when t = 'actions' then exists (select 1 from demo_showcase s where s.table_name = 'period_states' and s.row_key = (r ->> 'metric_id') || ':' || (r ->> 'period_start'))
      else false end)
$$;
revoke execute on function demo_in_showcase(text, jsonb) from public, anon, authenticated;
grant execute on function demo_in_showcase(text, jsonb) to service_role;

-- Why a visitor's write to a row of the demo must be refused, or null. `op` is INSERT, UPDATE or DELETE. A write that
-- touches a showcase row (old or new) is refused ('showcase'); a change to a word of a row the seed made, or a delete of
-- a kept one, is refused ('words'). A row a visitor made is theirs to change.
create or replace function demo_protected_reason(op text, t text, old_row jsonb, new_row jsonb) returns text
language plpgsql stable set search_path = public as $$
declare seeded boolean;
begin
  if demo_in_showcase(t, old_row) or demo_in_showcase(t, new_row) then return 'showcase'; end if;
  if op = 'INSERT' then return null; end if;
  seeded := exists (select 1 from demo_seeded_rows s where s.table_name = t and s.row_key = demo_row_key(t, old_row));
  if not seeded then return null; end if;
  if op = 'DELETE' then
    return case when exists (select 1 from demo_kept_rows k where k.table_name = t) then 'words' end;
  end if;
  if exists (select 1 from demo_words_columns w where w.table_name = t and (old_row -> w.column_name) is distinct from (new_row -> w.column_name)) then return 'words'; end if;
  return null;
end $$;
revoke execute on function demo_protected_reason(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function demo_protected_reason(text, text, jsonb, jsonb) to service_role;

-- The trigger: the seed writes whatever it needs; anything else that reached here passed the demo guard (an allowed visit).
create or replace function demo_words_guard() returns trigger
language plpgsql set search_path = public as $$
declare why text;
begin
  if demo_seeding() then return coalesce(new, old); end if;
  why := demo_protected_reason(tg_op, tg_table_name::text, case when tg_op = 'INSERT' then null else to_jsonb(old) end, case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  if why = 'showcase' then raise exception using errcode = 'ZF4D3', message = 'demo_showcase'; end if;
  if why = 'words' then raise exception using errcode = 'ZF4D4', message = 'demo_words'; end if;
  return coalesce(new, old);
end $$;
revoke execute on function demo_words_guard() from public, anon, authenticated;

-- Gives a table the words trigger, for a row of the demo only (rows of real Workspaces pay one comparison). Safe to call twice.
create or replace function attach_demo_words_guard(t regclass) returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from pg_attribute where attrelid = t and attname = 'workspace_id' and not attisdropped) then
    raise exception 'attach_demo_words_guard: % has no workspace_id', t;
  end if;
  execute format('drop trigger if exists zz_demo_words_new on %s', t);
  execute format('drop trigger if exists zz_demo_words_old on %s', t);
  execute format($f$create trigger zz_demo_words_new before insert or update on %s for each row
    when (new.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_words_guard()$f$, t);
  execute format($f$create trigger zz_demo_words_old before delete on %s for each row
    when (old.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_words_guard()$f$, t);
end $$;
revoke execute on function attach_demo_words_guard(regclass) from public, anon, authenticated;

-- Every table that holds words or hangs off a showcase object.
do $$
declare t text;
begin
  foreach t in array array['dashboards', 'widgets', 'decks', 'metrics', 'workflows', 'groups', 'themes', 'team_templates', 'tags',
    'dashboard_snapshots', 'actions', 'thread_messages', 'series_values', 'period_states', 'prompts', 'deliveries', 'versions',
    'observations', 'observation_history', 'shares', 'access_requests'] loop
    perform attach_demo_words_guard(('public.' || quote_ident(t))::regclass);
  end loop;
end $$;

-- What demo-showcase.db.test.ts asks of the schema: the columns of a table with their types (so that a text column nobody
-- classified fails a test), and the tables with a words column but no words trigger.
create or replace function demo_text_columns(t text) returns table (column_name text, data_type text)
language sql stable set search_path = public as $$
  select c.column_name::text, c.data_type::text from information_schema.columns c where c.table_schema = 'public' and c.table_name = t order by c.ordinal_position
$$;
revoke execute on function demo_text_columns(text) from public, anon, authenticated;
grant execute on function demo_text_columns(text) to service_role;
create or replace function demo_words_tables_without_trigger() returns setof text
language sql stable set search_path = public as $$
  select w.table_name from (select distinct table_name from demo_words_columns) w
  where not exists (select 1 from pg_trigger g where g.tgrelid = to_regclass('public.' || quote_ident(w.table_name)) and g.tgname = 'zz_demo_words_new')
  order by 1
$$;
revoke execute on function demo_words_tables_without_trigger() from public, anon, authenticated;
grant execute on function demo_words_tables_without_trigger() to service_role;

-- Fills the two key tables from what the seed just made. Called after demo_reset and everything the core seeds on top of it
-- (the last step of resetDemoWorkspace), by supabase/seed.sql and Docker's first start; and once here for a demo that
-- already exists. Like prototype_seed_pins it does not redefine demo_reset, which other migrations also redefine.
create or replace function prototype_seed_showcase() returns void language plpgsql security definer set search_path = public as $$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  t text;
begin
  perform set_config('ziffr.demo_seed', 'on', true);
  delete from demo_showcase;
  delete from demo_seeded_rows;
  -- What the sign-in page's picture, the tour and the landing page's examples point at.
  insert into demo_showcase select 'dashboards', id::text from dashboards where workspace_id = demo and name in ('Monthly overview', 'October in short', 'Weekly numbers');
  insert into demo_showcase select 'decks', id::text from decks where workspace_id = demo;
  insert into demo_showcase select 'workflows', id::text from workflows where workspace_id = demo and name = 'Weekly numbers';
  -- The periods of the landing page's three examples: Gross margin in October (and September's 40.3), Churn rate in March
  -- 2026, and Weekly numbers' weeks 46 and 47. Their values, history and state, and the Questions and Threads about them.
  create temporary table if not exists showcase_periods (metric_id int, period_start date) on commit drop;
  truncate showcase_periods;
  insert into showcase_periods
    select m.id, p.period_start from metrics m join (values ('gross-margin', date '2026-09-01'), ('gross-margin', date '2026-10-01'), ('churn-rate', date '2026-03-01')) p(slug, period_start) on p.slug = m.slug
    where m.workspace_id = demo
    union
    select m.id, p.period_start from metrics m join workflows w on w.id = m.workflow_id and w.workspace_id = demo and w.name = 'Weekly numbers'
    cross join (values (date '2026-11-09'), (date '2026-11-16')) p(period_start) where m.workspace_id = demo;
  insert into demo_showcase select x.t, sp.metric_id::text || ':' || sp.period_start::text from showcase_periods sp cross join (values ('observations'), ('observation_history'), ('period_states')) x(t);
  insert into demo_showcase select 'actions', a.id::text from actions a join showcase_periods sp on sp.metric_id = a.metric_id and sp.period_start = a.period_start where a.workspace_id = demo;
  -- Every row the seed made in a table that holds words, so that what a visitor made is told apart from it.
  for t in select distinct table_name from demo_words_columns loop
    execute format('insert into demo_seeded_rows select %L, demo_row_key(%L, to_jsonb(r_)) from %I r_ where r_.workspace_id = %L on conflict do nothing', t, t, t, demo);
  end loop;
  perform set_config('ziffr.demo_seed', 'off', true);
end $$;
revoke execute on function prototype_seed_showcase() from public, anon, authenticated;
grant execute on function prototype_seed_showcase() to service_role;

select prototype_seed_showcase();
