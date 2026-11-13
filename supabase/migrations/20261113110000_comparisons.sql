-- PROTOTYPE, wipe me. Aggregation, Target Series and Projections (GLOSSARY).
alter table metrics add column aggregation text not null default 'sum' check (aggregation in ('sum','average','last','none'));
alter table catalog_metrics add column aggregation text not null default 'sum' check (aggregation in ('sum','average','last','none'));

create table series_values (
  id bigserial primary key,
  metric_id int not null references metrics(id) on delete cascade,
  kind text not null check (kind in ('target','projection')),
  period_start date not null,
  value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  unique (metric_id, kind, period_start)
);
alter table series_values enable row level security;

create or replace function prototype_seed_comparisons() returns void
language plpgsql security definer set search_path = public as $$
declare rev int; d date; i int; m0 date := (date_trunc('month', current_date) - interval '18 months')::date;
begin
  update metrics set aggregation = case slug
    when 'return-rate' then 'none' when 'margin' then 'none' when 'average-order-value' then 'none' else 'sum' end;
  update catalog_metrics set aggregation = case
    when name in ('Customer satisfaction','Net Promoter Score','Average delivery time','Body weight') then 'average'
    when name in ('Monthly recurring revenue','Inventory value','Headcount','Cash balance') then 'last'
    when format = 'percent' then 'none' else 'sum' end;

  -- A monthly revenue budget: 120k, higher before Christmas, lower in January.
  select id into rev from metrics where slug = 'revenue';
  for i in 0..20 loop
    d := (m0 + make_interval(months => i))::date;
    insert into series_values (metric_id, kind, period_start, value, note) values
      (rev, 'target', d, round(105000 * power(1.012, i) * case extract(month from d) when 11 then 1.15 when 12 then 1.3 when 1 then 0.88 else 1 end), 'Budget 2025/26');
  end loop;
  -- An outside projection for the next three months.
  for i in 0..2 loop
    d := (date_trunc('month', current_date) + make_interval(months => i))::date;
    insert into series_values (metric_id, kind, period_start, value, note) values
      (rev, 'projection', d, round(124000 * case extract(month from d) when 11 then 1.12 when 12 then 1.28 when 1 then 0.9 else 1 end), 'Sales plan, November 2026');
  end loop;
end;
$$;
revoke execute on function prototype_seed_comparisons() from public, anon, authenticated;
grant execute on function prototype_seed_comparisons() to service_role;

-- Demo stories (GLOSSARY: Story Widget, Panel, Bridge): small multiples of YoY change and a revenue bridge.
create or replace function prototype_seed_stories() returns void
language plpgsql security definer set search_path = public as $$
declare d int; rev int; ord int; cst int;
begin
  select id into rev from metrics where slug = 'revenue';
  select id into ord from metrics where slug = 'orders';
  select id into cst from metrics where slug = 'cost';
  insert into dashboards (name, owner_id) values ('Board stories', 'sara') returning id into d;
  insert into widgets (owner_id, dashboard_id, template, metric_ids, settings, x, y, w, h) values
    ('sara', d, 'story', array[rev], jsonb_build_object(
      'kicker', 'Northwind Goods, monthly report',
      'footnote', 'November to January are projections from the sales plan of November 2026.',
      'panels', jsonb_build_array(jsonb_build_object('type','period-bars','metricIds',jsonb_build_array(rev, ord, cst),'measure','pct-yoy','periods',5,'highlight','projection','projections',true))), 0, 0, 12, 11),
    ('sara', d, 'story', array[rev], jsonb_build_object(
      'kicker', 'Revenue bridge',
      'panels', jsonb_build_array(jsonb_build_object('type','bridge','metricIds',jsonb_build_array(rev),'bridge',jsonb_build_object('mode','variance')))), 0, 11, 7, 11);
end;
$$;
revoke execute on function prototype_seed_stories() from public, anon, authenticated;
grant execute on function prototype_seed_stories() to service_role;
