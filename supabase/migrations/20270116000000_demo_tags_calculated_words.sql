-- The demo shows Tags and calculated Metrics, and every demo Metric says what it is and why it matters (ticket for spec 0038;
-- GLOSSARY: Tag, Derived Metric, Metric Description, Demo Mode). Before this the demo had no Tag, two Derived Metrics whose
-- descriptions did not say they were calculated, and one-line descriptions that said what a number is but not why anyone
-- watches it. `prototype_seed_metric_words()` makes all three; demo_reset calls it last, so every nightly reset has them, and
-- this migration calls it once so a running demo has them at once. Only the demo Workspace is touched. It has no Workspace
-- Key (spec 0028: the demo is made-up, public data), so Tag names are written plain with the plain index the core uses for a
-- Workspace that does not seal (tag-rows.ts); the core reads plain and sealed names alike.

create or replace function public.prototype_seed_metric_words() returns void
language plpgsql security definer set search_path = public as $$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  w record;
  t text;
  tag_id uuid;
begin
  -- Three more calculated Metrics, from the same monthly inputs as Margin. They never receive values: Aggregation none, since
  -- a ratio does not add up over a quarter.
  insert into metrics (slug, name, description, unit, format, decimals, period, submission_rule, polarity, target_min, target_max, sources, owner_id, formula, aggregation)
  select v.* from (values
    ('cost-per-order',        'Cost per order',        '', '€', 'currency', 2, 'month', 'reject', 'lower',  null::numeric, 55::numeric,  '{}'::text[], 'sara', '{cost} / {orders}',                    'none'),
    ('tickets-per-100-orders','Tickets per 100 orders','', '',  'number',   1, 'month', 'reject', 'lower',  null,          25,           '{}',         'ben',  '{support-tickets} / {orders} * 100',   'none'),
    ('revenue-growth',        'Revenue growth',        '', '%', 'percent',  1, 'month', 'reject', 'higher', 0,             null,         '{}',         'sara', 'change({revenue}) / prev({revenue}) * 100', 'none')
  ) as v(slug, name, description, unit, format, decimals, period, submission_rule, polarity, target_min, target_max, sources, owner_id, formula, aggregation)
  where not exists (select 1 from metrics m where m.workspace_id = demo and m.slug = v.slug);

  -- Ben owns Tickets per 100 orders, as he owns Support tickets, and Sara sees it the way she sees that one: by a share. Nobody
  -- else sees it, like the other Metrics of the demo that are not for everyone.
  insert into shares (object_type, object_id, user_id, role)
  select 'metric', m.id, 'sara', 'viewer' from metrics m where m.workspace_id = demo and m.slug = 'tickets-per-100-orders'
  on conflict do nothing;

  -- Cost per order on the Monthly overview, under its charts: a calculated Metric drawn like any other, with its target. Once:
  -- a reset makes the dashboard again, and the widget is not there until this adds it.
  insert into widgets (workspace_id, owner_id, dashboard_id, template, metric_ids, settings, x, y, w, h)
  select demo, d.owner_id, d.id, 'line', array[m.id], '{"window":18,"showTarget":true}'::jsonb, 0, 11, 12, 6
  from dashboards d join metrics m on m.workspace_id = demo and m.slug = 'cost-per-order'
  where d.workspace_id = demo and d.name = 'Monthly overview'
    and not exists (select 1 from widgets x where x.dashboard_id = d.id and m.id = any (x.metric_ids));

  -- What each Metric is, why anyone watches it, and for a calculated one what it is calculated from.
  update metrics m set description = d.description
  from (values
    ('revenue',               'Net revenue from all shop orders, excluding VAT. The top line every other number is read against: the budget is set on it, and Margin, Average order value and Revenue growth are calculated from it.'),
    ('orders',                'Number of orders shipped in the month. Shows how much customers buy, and is the base for Average order value, Cost per order and Tickets per 100 orders.'),
    ('cost',                  'All operating costs booked in the month: goods, shipping, staff, marketing. Read it next to Revenue: when it grows faster, Margin shrinks.'),
    ('support-tickets',       'Customer support tickets opened in the month. A rise without more Orders usually means a problem with delivery or the product.'),
    ('return-rate',           'Share of shipped orders that were returned. A return costs the sale and the shipping, so a rise shows up in Margin.'),
    ('deals-closed',          'Wholesale deals signed with retail partners, counted each day. Wholesale grows the business beyond the web shop; a quiet stretch is the first sign of a thin pipeline.'),
    ('margin',                'Share of revenue left after all costs. Calculated from Revenue and Cost: Revenue minus Cost, divided by Revenue. It tells whether growth pays; below 20% the shop earns too little for every euro it sells. Gross margin looks at the cost of goods and shipping only.'),
    ('average-order-value',   'Revenue per order. Calculated from Revenue and Orders: Revenue divided by Orders. Shows whether customers buy more per order; the aim is at least 70 €.'),
    ('gross-margin',          'Share of revenue left after the cost of goods and shipping only, before staff and marketing. Shows whether the products themselves still earn enough; Margin looks at all costs.'),
    ('churn-rate',            'Share of subscribers who cancelled during the month. Every cancelled subscriber is recurring revenue lost, so this is the number to watch for the subscription business.'),
    ('support-tickets-weekly','Customer support tickets opened in the week. The weekly view of Support tickets, for the weekly review: a peak points to a problem this week, not at the end of the month.'),
    ('refunds-weekly',        'Refunds paid out in the week. Money that leaves the shop after the sale; a jump points to a faulty batch or a delivery problem.'),
    ('new-leads-weekly',      'Wholesale leads who asked for an offer in the week. The first step towards Deals closed: fewer leads this week means fewer deals in a few weeks.'),
    ('cancellations-weekly',  'Subscriptions cancelled in the week. The early reading of Churn rate: a bad week shows here before the month ends.'),
    ('trial-signups-weekly',  'New trial sign-ups in the week. Shows whether marketing brings people in; they are the subscribers of the weeks to come.'),
    ('orders-shipped-weekly', 'Orders shipped in the week. Shows whether the warehouse keeps up with demand; a drop while orders are open means a bottleneck.'),
    ('cost-per-order',        'What an order costs to serve, in euros. Calculated from Cost and Orders: Cost divided by Orders. Shows whether growth is cheap or expensive: when it rises while Average order value stays flat, Margin shrinks.'),
    ('tickets-per-100-orders','Support tickets for every 100 orders. Calculated from Support tickets and Orders: tickets divided by orders, times 100. A busy month alone does not move it; a rise means more customers need help with each order.'),
    ('revenue-growth',        'How much Revenue grew against the month before, in percent. Calculated from Revenue: this month minus last month, divided by last month. Shown by month only. Below zero means the shop shrank.')
  ) as d(slug, description)
  where m.workspace_id = demo and m.slug = d.slug;

  -- Tags: a few words people use to group the Metrics, as a Workspace does by hand. Made again each time, so a reset never
  -- keeps a Tag that no Metric carries.
  delete from tags where workspace_id = demo;
  for w in
    select * from (values
      ('revenue',               array['finance','sales','board']),
      ('orders',                array['sales','operations']),
      ('cost',                  array['finance','board']),
      ('support-tickets',       array['customers','operations']),
      ('return-rate',           array['customers','operations']),
      ('deals-closed',          array['sales','wholesale']),
      ('margin',                array['finance','board']),
      ('average-order-value',   array['sales','finance']),
      ('gross-margin',          array['finance','board']),
      ('churn-rate',            array['customers','board']),
      ('support-tickets-weekly',array['customers','weekly review']),
      ('refunds-weekly',        array['finance','weekly review']),
      ('new-leads-weekly',      array['sales','wholesale','weekly review']),
      ('cancellations-weekly',  array['customers','weekly review']),
      ('trial-signups-weekly',  array['sales','weekly review']),
      ('orders-shipped-weekly', array['operations','weekly review']),
      ('cost-per-order',        array['finance','operations']),
      ('tickets-per-100-orders',array['customers','operations']),
      ('revenue-growth',        array['sales','board'])
    ) as x(slug, tags)
  loop
    foreach t in array w.tags loop
      select id into tag_id from tags where workspace_id = demo and name = t;
      if tag_id is null then
        tag_id := gen_random_uuid();
        -- The plain index of tag-rows.ts: sha256 of the Workspace, the purpose and the name, each followed by a NUL.
        insert into tags (id, workspace_id, name, name_index, created_by)
        values (tag_id, demo, t,
                'p1.' || encode(sha256(convert_to(demo::text, 'UTF8') || '\x00'::bytea || convert_to('tags.name', 'UTF8') || '\x00'::bytea || convert_to(lower(t), 'UTF8')), 'hex'),
                'sara');
      end if;
      insert into metric_tags (metric_id, tag_id, workspace_id)
      select m.id, tag_id, demo from metrics m where m.workspace_id = demo and m.slug = w.slug
      on conflict do nothing;
    end loop;
  end loop;
end $$;

revoke execute on function public.prototype_seed_metric_words() from public, anon, authenticated;
grant execute on function public.prototype_seed_metric_words() to service_role;

-- demo_reset as in 20261225460000, with the Tags, calculated Metrics, their widget and the descriptions made last.
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
  perform prototype_seed_realistic_times();
  perform prototype_seed_period_record();
  perform prototype_seed_memberships();
  perform prototype_seed_gross_margin();
  perform prototype_seed_churn_rate();
  perform prototype_seed_weekly_numbers();
  perform prototype_seed_example_alert();
  perform prototype_seed_metric_words();
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

-- A running demo has them at once, not at the next reset. The guard is switched off for this transaction, as for any
-- migration that writes demo rows; a new Installation has no demo yet, and demo_reset makes them when it seeds one.
do $$
begin
  if exists (select 1 from metrics where workspace_id = 'd3e00000-0000-4000-8000-000000000001' and slug = 'revenue') then
    perform set_config('ziffr.demo_seed', 'on', true);
    perform prototype_seed_metric_words();
    perform set_config('ziffr.demo_seed', 'off', true);
  end if;
end $$;
