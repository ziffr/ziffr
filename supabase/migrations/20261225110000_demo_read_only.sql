-- Demo Mode is read-only (spec 0029, ticket #271; GLOSSARY: Demo Mode): visitors look around and switch between the
-- demo's made-up people, but nothing they do is saved. This is the one check: every row of the demo Workspace, and
-- the rows of its people, refuse to be written, whichever core function, server action or SQL function tries. The
-- core turns the error code ZF4D0 into one sentence for the person (packages/core/src/db.ts and demo.ts).
--
-- Only the demo's seed writes it. demo_reset turns `ziffr.demo_seed` on for its own transaction; the core's seed of
-- the demo's Snapshots, which SQL cannot compute, sends the request header `x-ziffr-demo-seed` with the service role.
-- Nothing else can write these tables at all (Row Level Security is on with no policies), so the header gives nobody
-- anything they did not have.
--
-- Rows outside the demo pay one comparison in the trigger's WHEN clause, never a function call. A table with a
-- workspace_id made later calls attach_demo_guard (20261225190000) in its own migration; demo-read-only.db.test.ts
-- fails until it has.

create or replace function demo_seeding() returns boolean
language plpgsql stable set search_path = public as $$
declare
  headers text := current_setting('request.headers', true);
  claims text := current_setting('request.jwt.claims', true);
begin
  if current_setting('ziffr.demo_seed', true) = 'on' then return true; end if;
  -- The header counts only on a request made with the service role, which is the core's.
  return coalesce(headers, '') <> '' and coalesce(claims, '') <> ''
    and (headers::json ->> 'x-ziffr-demo-seed') = 'on' and (claims::json ->> 'role') = 'service_role';
end $$;

create or replace function demo_read_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if demo_seeding() then return coalesce(new, old); end if;
  raise exception using errcode = 'ZF4D0', message = 'demo_read_only';
end $$;

-- The rows of a person (profiles by id, away by user_id): a member, Contact or Feed of the demo. The demo is visited,
-- never joined, so its people belong to no real Workspace.
create or replace function demo_people_read_only() returns trigger
language plpgsql set search_path = public as $$
declare
  col text := tg_argv[0];
  ids text[] := array_remove(array[
    case when tg_op <> 'DELETE' then to_jsonb(new) ->> col end,
    case when tg_op <> 'INSERT' then to_jsonb(old) ->> col end], null);
  demo uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  if demo_seeding() then return coalesce(new, old); end if;
  if exists (select 1 from memberships where workspace_id = demo and user_id = any(ids))
     or exists (select 1 from contacts where workspace_id = demo and person_id = any(ids))
     or exists (select 1 from feeds where workspace_id = demo and person_id = any(ids)) then
    raise exception using errcode = 'ZF4D0', message = 'demo_read_only';
  end if;
  return coalesce(new, old);
end $$;

-- Ask me now's claims carry only their Metric.
create or replace function demo_metric_read_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if demo_seeding() then return coalesce(new, old); end if;
  if exists (select 1 from metrics where workspace_id = 'd3e00000-0000-4000-8000-000000000001'
             and id in (case when tg_op <> 'DELETE' then new.metric_id end, case when tg_op <> 'INSERT' then old.metric_id end)) then
    raise exception using errcode = 'ZF4D0', message = 'demo_read_only';
  end if;
  return coalesce(new, old);
end $$;

-- Every table with a workspace_id: one trigger for the row as written, one for the row as it was. They sort after
-- workspace_from_parent, so a child row's workspace is filled in before it is looked at.
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'workspace_id'
  loop
    execute format($f$create trigger zz_demo_read_only_new before insert or update on %I for each row
      when (new.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_read_only()$f$, t);
    execute format($f$create trigger zz_demo_read_only_old before update or delete on %I for each row
      when (old.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_read_only()$f$, t);
  end loop;
end $$;

create trigger zz_demo_read_only_new before insert or update on workspaces for each row
  when (new.id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_read_only();
create trigger zz_demo_read_only_old before update or delete on workspaces for each row
  when (old.id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_read_only();
create trigger zz_demo_read_only before insert or update or delete on profiles for each row execute function demo_people_read_only('id');
create trigger zz_demo_read_only before insert or update or delete on away for each row execute function demo_people_read_only('user_id');
create trigger zz_demo_read_only before insert or update or delete on ask_now_claims for each row execute function demo_metric_read_only();

-- The tables that should refuse the demo's writes but have no trigger for it: none, until a migration adds a table
-- with a workspace_id and forgets them (or a check that keeps the demo out). demo-read-only.db.test.ts asks.
create or replace function demo_read_only_gaps() returns setof text
language sql stable set search_path = public as $$
  select x.table_name::text from (
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'workspace_id'
    union select unnest(array['workspaces', 'profiles', 'away', 'ask_now_claims'])
  ) x
  where (select count(*) from pg_trigger g where g.tgrelid = ('public.' || quote_ident(x.table_name))::regclass
         and g.tgname in ('zz_demo_read_only_new', 'zz_demo_read_only_old')) < 2
    and not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || quote_ident(x.table_name))::regclass and g.tgname = 'zz_demo_read_only')
    -- A table whose own check keeps the demo out has no demo row to protect (workspace_keys).
    and not exists (select 1 from pg_constraint k where k.conrelid = ('public.' || quote_ident(x.table_name))::regclass and k.contype = 'c'
                    and pg_get_constraintdef(k.oid) like '%<> ''d3e00000-0000-4000-8000-000000000001''%')
  order by 1
$$;

revoke execute on function demo_read_only_gaps() from public, anon, authenticated;
grant execute on function demo_read_only_gaps() to service_role;
revoke execute on function demo_seeding() from public, anon, authenticated;
-- The triggers call it as whoever writes: the core's service role.
grant execute on function demo_seeding() to service_role;
revoke execute on function demo_read_only() from public, anon, authenticated;
revoke execute on function demo_people_read_only() from public, anon, authenticated;
revoke execute on function demo_metric_read_only() from public, anon, authenticated;

-- The seed: demo_reset as before (20261114140000), now the one function that writes the demo, for its own
-- transaction only. It no longer needs its minute's gap for visitors, who cannot call it, but the nightly job and the
-- first start still share it.
create or replace function demo_reset(min_gap interval default interval '1 minute') returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare fresh_catalog boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ziffr-demo-reset'));
  if exists (select 1 from workspaces where id = 'd3e00000-0000-4000-8000-000000000001' and created_at > now() - min_gap) then
    return false;
  end if;
  perform set_config('ziffr.demo_seed', 'on', true);
  fresh_catalog := not exists (select 1 from catalog_metrics);
  perform prototype_reset();
  perform prototype_seed_breakdowns();
  perform prototype_seed_comparisons();
  perform prototype_seed_stories();
  perform prototype_reset_decks();
  perform prototype_seed_templates();
  perform prototype_seed_themes();
  perform prototype_seed_connectors();
  perform prototype_seed_groups();
  perform prototype_seed_workflows();
  perform prototype_seed_memberships();
  if fresh_catalog then
  update catalog_metrics set aggregation = case
    when name in ('Customer satisfaction','Net Promoter Score','Average delivery time','Body weight') then 'average'
    when name in ('Monthly recurring revenue','Inventory value','Headcount','Cash balance') then 'last'
    when format = 'percent' then 'none' else 'sum' end;
  end if;
  perform set_config('ziffr.demo_seed', 'off', true);
  return true;
end $$;

revoke execute on function demo_reset(interval) from public, anon, authenticated;
grant execute on function demo_reset(interval) to service_role;

-- A value's history when its Workspace or its Metric is deleted with it: nothing is left to show it, so none is kept.
-- Before, such a row found no Metric to take its workspace from and fell back to the column's old default, the demo,
-- where the read-only demo now refuses it (and where it never belonged).
create or replace function keep_observation_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and (not exists (select 1 from workspaces where id = old.workspace_id) or not exists (select 1 from metrics where id = old.metric_id)) then
    return old;
  end if;
  if tg_op = 'DELETE' or old.value is distinct from new.value then
    insert into observation_history (observation_id, metric_id, period_start, value, submitter_id, source, recorded_at, change)
      values (old.id, old.metric_id, old.period_start, old.value, old.submitter_id, old.source, old.created_at, case tg_op when 'UPDATE' then 'updated' else 'deleted' end);
  end if;
  return coalesce(new, old);
end;
$$;
