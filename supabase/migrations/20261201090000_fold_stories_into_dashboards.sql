-- Stories fold back into dashboards (spec 0013, ticket #174; ADR 0007; GLOSSARY: Dashboard, Finding). Every
-- dashboard keeps an introduction and reads top to bottom in its Read view, so a story is just a dashboard again;
-- its widgets keep their place. `kind` stays (migrations are add-only) and only ever says 'dashboard' from now on.
update dashboards set kind = 'dashboard' where kind = 'story';

alter table dashboards drop constraint if exists dashboards_kind_check;
alter table dashboards add constraint dashboards_kind_check check (kind = 'dashboard');

-- The demo's reset seeds "October in short" again, now as a dashboard with an introduction.
create or replace function prototype_seed_stories() returns void
language plpgsql security definer set search_path = public as $$
declare d int; rev int; ord int; cst int;
begin
  select id into rev from metrics where slug = 'revenue' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  select id into ord from metrics where slug = 'orders' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  select id into cst from metrics where slug = 'cost' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  insert into dashboards (name, owner_id, intro, workspace_id) values ('October in short', 'sara',
    'Revenue grew on the year again, but cost grew faster: what drove it, and what the plan expects next.',
    'd3e00000-0000-4000-8000-000000000001') returning id into d;
  insert into widgets (owner_id, dashboard_id, template, metric_ids, settings, x, y, w, h, workspace_id) values
    ('sara', d, 'story', array[rev], jsonb_build_object(
      'kicker', 'Northwind Goods, monthly report',
      'footnote', 'November to January are projections from the sales plan of November 2026.',
      'panels', jsonb_build_array(jsonb_build_object('type','period-bars','metricIds',jsonb_build_array(rev, ord, cst),'measure','pct-yoy','periods',5,'highlight','projection','projections',true))), 0, 0, 12, 11,
      'd3e00000-0000-4000-8000-000000000001'),
    ('sara', d, 'story', array[rev], jsonb_build_object(
      'kicker', 'Revenue bridge',
      'panels', jsonb_build_array(jsonb_build_object('type','bridge','metricIds',jsonb_build_array(rev),'bridge',jsonb_build_object('mode','variance')))), 0, 11, 12, 11,
      'd3e00000-0000-4000-8000-000000000001');
end $$;
revoke execute on function prototype_seed_stories() from public, anon, authenticated;
grant execute on function prototype_seed_stories() to service_role;
