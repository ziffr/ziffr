-- The demo shows pinned dashboards (ticket #764; GLOSSARY: Pinned Dashboard, Demo Mode). Pinning is off in the demo
-- (it saves nothing), so a visitor could never see what a pin does; the seed now pins a few for Sara and Ben.
-- This does not redefine demo_reset (other migrations do, and the last one to land would drop the others' changes).
-- prototype_seed_pins seeds on its own, turning seeding on for its own transaction, and is called after demo_reset by
-- the nightly reset (packages/core/src/demo-reset.ts), supabase/seed.sql and the Docker first start, and once here
-- for a demo that already exists.
create or replace function prototype_seed_pins() returns void language plpgsql security definer set search_path = public as $$
declare demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  perform set_config('ziffr.demo_seed', 'on', true);
  delete from pinned_dashboards where workspace_id = demo;
  insert into pinned_dashboards (workspace_id, person_id, dashboard_id, position)
  select demo, p.person, d.id, p.pos
  from (values ('sara', 'Monthly overview', 0), ('sara', 'Weekly numbers', 1), ('sara', 'Board stories', 2),
               ('ben', 'Operations', 0), ('ben', 'Monthly overview', 1)) as p(person, dash, pos)
  join dashboards d on d.workspace_id = demo and d.name = p.dash
  join profiles pr on pr.id = p.person;
  perform set_config('ziffr.demo_seed', 'off', true);
end $$;
revoke execute on function prototype_seed_pins() from public, anon, authenticated;
grant execute on function prototype_seed_pins() to service_role;

select prototype_seed_pins();
