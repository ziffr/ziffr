-- The demo shows pinned dashboards (ticket #764; GLOSSARY: Pinned Dashboard, Demo Mode). Pinning is off in the demo
-- (it saves nothing), so a visitor could never see what a pin does; the seed now pins a few for Sara and Ben.
-- demo_reset is as in 20261225430000 with one more call, prototype_seed_pins. The migration also runs it once, with
-- seeding on for this transaction only, so a demo that already exists gets the pins without waiting for the nightly reset.
create or replace function prototype_seed_pins() returns void language plpgsql security definer set search_path = public as $$
declare demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  delete from pinned_dashboards where workspace_id = demo;
  insert into pinned_dashboards (workspace_id, person_id, dashboard_id, position)
  select demo, p.person, d.id, p.pos
  from (values ('sara', 'Monthly overview', 0), ('sara', 'Weekly numbers', 1), ('sara', 'Board stories', 2),
               ('ben', 'Operations', 0), ('ben', 'Monthly overview', 1)) as p(person, dash, pos)
  join dashboards d on d.workspace_id = demo and d.name = p.dash
  join profiles pr on pr.id = p.person;
end $$;
revoke execute on function prototype_seed_pins() from public, anon, authenticated;
grant execute on function prototype_seed_pins() to service_role;

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
  perform prototype_seed_period_record();
  perform prototype_seed_memberships();
  perform prototype_seed_pins();
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

select set_config('ziffr.demo_seed', 'on', true);
select prototype_seed_pins();
select set_config('ziffr.demo_seed', 'off', true);
