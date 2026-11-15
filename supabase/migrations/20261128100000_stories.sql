-- Stories (spec 0010, ticket #148; GLOSSARY: Story, Finding). A story is kept like a dashboard, so it is shared,
-- versioned, shown through View Links and recorded in the Audit Log the same way, with the same visibility rules;
-- `kind` tells them apart, and a story's widgets are its Findings, read top to bottom. `intro` opens a story.
alter table dashboards add column if not exists kind text not null default 'dashboard';
alter table dashboards add column if not exists intro text not null default '';
do $$ begin
  alter table dashboards add constraint dashboards_kind_check check (kind in ('dashboard', 'story'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table dashboards add constraint dashboards_intro_length check (char_length(intro) <= 4000);
exception when duplicate_object then null; end $$;

-- The demo's "Board stories" was a dashboard full of Findings; it becomes the story it tells.
update dashboards set kind = 'story', name = 'October in short',
  intro = 'Revenue grew on the year again, but cost grew faster: what drove it, and what the plan expects next.'
where workspace_id = 'd3e00000-0000-4000-8000-000000000001' and name = 'Board stories' and kind = 'dashboard';
update widgets set x = 0, w = 12
where dashboard_id in (select id from dashboards where workspace_id = 'd3e00000-0000-4000-8000-000000000001' and kind = 'story');

-- The demo's reset seeds the same story again.
create or replace function prototype_seed_stories() returns void
language plpgsql security definer set search_path = public as $$
declare d int; rev int; ord int; cst int;
begin
  select id into rev from metrics where slug = 'revenue' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  select id into ord from metrics where slug = 'orders' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  select id into cst from metrics where slug = 'cost' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  insert into dashboards (name, owner_id, kind, intro, workspace_id) values ('October in short', 'sara', 'story',
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
