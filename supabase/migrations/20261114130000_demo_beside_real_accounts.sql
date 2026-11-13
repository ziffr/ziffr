-- Demo Mode beside real accounts (ADR 0005, GLOSSARY: Demo Mode). The demo lives in its own workspace, next to real
-- ones in the same database. Its reset and seed functions used to empty whole tables; from here on they only ever
-- touch the demo workspace, the made-up demo people and the shared catalog when it is empty. Ids come from the
-- database, never fixed numbers, because real rows share the same sequences.

CREATE OR REPLACE FUNCTION public.prototype_reset()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m0 date := (date_trunc('month', current_date) - interval '18 months')::date;
  last_month date := (date_trunc('month', current_date) - interval '1 month')::date;
  i int;
  d date;
  rev numeric; ord numeric; cst numeric; tix numeric; ret numeric;
  id_revenue int; id_orders int; id_cost int; id_tickets int; id_returns int; id_deals int;
  id_margin int; id_aov int;
  obs_return bigint; act_id int; dash_id int; ops_id int;
begin
  -- Only the demo workspace is wiped: every row in it goes with the workspace (on delete cascade). Real
  -- workspaces, real people and the shared catalog are never touched.
  perform pg_advisory_xact_lock(hashtext('ziffr-demo-reset'));
  -- Values first, while the workspace still exists: deleting them writes history rows into the same workspace.
  delete from breakdown_rows where workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  delete from observations where workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  delete from workspaces where id = 'd3e00000-0000-4000-8000-000000000001';
  insert into workspaces (id, name) values ('d3e00000-0000-4000-8000-000000000001', 'Northwind Goods (demo)');
  delete from away where user_id in ('sara','ben','anna');
  perform setseed(0.4242);

  -- The demo people are made up and can never sign in (auth_user_id stays empty).
  insert into profiles (id, name, role, color, slack_handle, email) values
    ('sara','Sara Lindqvist','Founder & owner','#7c3aed','@sara','sara@northwind.example'),
    ('ben','Ben Okafor','Operations lead','#0891b2','@ben','ben@northwind.example'),
    ('anna','Anna Weber','Head of sales','#ea580c','@anna','anna@northwind.example')
  on conflict (id) do update set name = excluded.name, role = excluded.role, color = excluded.color,
    slack_handle = excluded.slack_handle, email = excluded.email, auth_user_id = null;

  if not exists (select 1 from catalog_metrics) then
  insert into catalog_metrics (category,name,description,unit,format,decimals,period,submission_rule,polarity,target_min,target_max,sources) values
    ('Customers','Customer satisfaction','Share of surveyed customers who rated their experience 4 or 5 out of 5.','%','percent',0,'month','overwrite','higher',85,null,'{web_form,mail}'),
    ('Customers','Net Promoter Score','Promoters minus detractors, from the monthly NPS survey.','','number',0,'month','overwrite','higher',30,null,'{web_form}'),
    ('Customers','Churn rate','Share of subscribers who cancelled during the month.','%','percent',1,'month','overwrite','lower',null,3,'{mail}'),
    ('Sales','Monthly recurring revenue','Recurring subscription revenue at month end.','€','currency',0,'month','overwrite','higher',null,null,'{web_form,mail}'),
    ('Sales','Conversion rate','Share of website visitors who placed an order.','%','percent',2,'week','overwrite','higher',2.5,null,'{web_form}'),
    ('Sales','Website visitors','Unique visitors to the shop.','','number',0,'day','overwrite','higher',null,null,'{web_form}'),
    ('Operations','Inventory value','Value of stock on hand at cost price.','€','currency',0,'week','overwrite','target',150000,220000,'{mail}'),
    ('Operations','Average delivery time','Days from order to delivery, averaged over the week.','days','number',1,'week','overwrite','lower',null,3,'{slack,mail}'),
    ('Team','Headcount','People on payroll at period end.','','number',0,'month','reject','target',null,null,'{web_form}'),
    ('Team','Sick days','Sick days taken across the team.','days','number',0,'month','add','lower',null,10,'{slack,web_form}'),
    ('Finance','Cash balance','Cash across all bank accounts at period end.','€','currency',0,'week','overwrite','higher',50000,null,'{mail}'),
    ('Personal','Body weight','Morning weight.','kg','number',1,'day','keep_both','target',72,76,'{slack,web_form}'),
    ('Personal','Running distance','Kilometres run.','km','number',1,'day','add','higher',5,null,'{slack,web_form}');
  end if;

  insert into metrics (slug,name,description,unit,format,decimals,period,submission_rule,polarity,target_min,target_max,sources,owner_id) values
    ('revenue','Revenue','Net revenue from all shop orders, excluding VAT.','€','currency',0,'month','overwrite','higher',120000,null,'{web_form}','sara') returning id into id_revenue;
  insert into metrics (slug,name,description,unit,format,decimals,period,submission_rule,polarity,target_min,target_max,sources,owner_id) values
    ('orders','Orders','Number of orders shipped.','','number',0,'month','overwrite','higher',1600,null,'{web_form}','sara') returning id into id_orders;
  insert into metrics (slug,name,description,unit,format,decimals,period,submission_rule,polarity,target_min,target_max,sources,owner_id) values
    ('cost','Cost','All operating costs booked in the month: goods, shipping, staff, marketing.','€','currency',0,'month','overwrite','lower',null,90000,'{mail}','sara') returning id into id_cost;
  insert into metrics (slug,name,description,unit,format,decimals,period,submission_rule,polarity,target_min,target_max,sources,owner_id) values
    ('support-tickets','Support tickets','Customer support tickets opened.','','number',0,'month','overwrite','lower',null,400,'{mail}','ben') returning id into id_tickets;
  insert into metrics (slug,name,description,unit,format,decimals,period,submission_rule,polarity,target_min,target_max,sources,owner_id) values
    ('return-rate','Return rate','Share of shipped orders that were returned.','%','percent',1,'month','overwrite','lower',null,6,'{mail}','ben') returning id into id_returns;
  insert into metrics (slug,name,description,unit,format,decimals,period,submission_rule,polarity,target_min,target_max,sources,owner_id) values
    ('deals-closed','Deals closed','Wholesale deals signed with retail partners.','deals','number',0,'day','add','higher',3,null,'{slack}','anna') returning id into id_deals;
  insert into metrics (slug,name,description,unit,format,decimals,period,submission_rule,polarity,target_min,target_max,sources,owner_id,formula) values
    ('margin','Margin','Share of revenue left after cost.','%','percent',1,'month','reject','higher',20,null,'{}','sara','({revenue} - {cost}) / {revenue} * 100') returning id into id_margin;
  insert into metrics (slug,name,description,unit,format,decimals,period,submission_rule,polarity,target_min,target_max,sources,owner_id,formula) values
    ('average-order-value','Average order value','Revenue per order.','€','currency',2,'month','reject','higher',70,null,'{}','sara','{revenue} / {orders}') returning id into id_aov;

  insert into tokens (code,metric_id,submitter_id) values
    ('tk-sara-revenue',id_revenue,'sara'),
    ('tk-sara-orders',id_orders,'sara'),
    ('tk-ben-cost',id_cost,'ben'),
    ('tk-ben-tickets',id_tickets,'ben'),
    ('tk-ben-returns',id_returns,'ben'),
    ('tk-anna-deals',id_deals,'anna');

  -- 18 complete months of history
  for i in 0..17 loop
    d := (m0 + make_interval(months => i))::date;
    rev := round(92000 * power(1.016, i)
                 * (1 + case extract(month from d) when 11 then 0.18 when 12 then 0.32 when 1 then -0.12 else 0 end)
                 * (1 + (random() - 0.5) * 0.08));
    ord := round(rev / (64 + i * 0.35 + (random() - 0.5) * 4));
    tix := round(250 + ord * 0.06 + (random() - 0.5) * 50 + case when i = 10 then 120 else 0 end);
    cst := round(rev * 0.62 + tix * 38 + (random() - 0.5) * 3000);
    ret := round((4.2 + (tix - 330) / 90.0 + (random() - 0.5) * 0.6 + case when i = 10 then 2.6 else 0 end)::numeric, 1);
    if d = last_month then
      -- the spike the prototype's Action is about: a 4,200 € shipping invoice booked as 42,000 €
      cst := cst + 37800;
    end if;
    insert into observations (metric_id,period_start,value,submitter_id,source,created_at) values
      (id_revenue,d,rev,'sara','web_form',d + interval '1 month 2 days'),
      (id_orders,d,ord,'sara','web_form',d + interval '1 month 2 days'),
      (id_cost,d,cst,'ben','mail',d + interval '1 month 4 days'),
      (id_tickets,d,tix,'ben','mail',d + interval '1 month 1 day');
    if d <> last_month then
      insert into observations (metric_id,period_start,value,submitter_id,source,created_at)
        values (id_returns,d,ret,'ben','mail',d + interval '1 month 3 days')
        returning id into obs_return;
      if i = 10 then
        insert into actions (metric_id,period_start,observation_id,asker_id,assignee_id,question,status,created_at,updated_at)
          values (id_returns,d,obs_return,'sara','ben','Returns jumped well above target this month. What happened?','closed',
                  d + interval '1 month 5 days', d + interval '1 month 8 days')
          returning id into act_id;
        insert into thread_messages (action_id,author_id,body,created_at) values
          (act_id,'ben','A bad batch of the canvas sneakers from one supplier: soles came loose. We pulled the batch and support tickets spiked too.', d + interval '1 month 6 days'),
          (act_id,'sara','Thanks, makes sense. Let''s keep an eye on that supplier.', d + interval '1 month 8 days');
      end if;
    end if;
  end loop;

  -- daily deals up to yesterday
  for d in select gs::date from generate_series(m0, current_date - 1, interval '1 day') gs loop
    if extract(isodow from d) < 6 then
      insert into observations (metric_id,period_start,value,submitter_id,source,created_at)
        values (id_deals,d,floor(random() * 5 + random() * 2 + (d - m0) / 300.0),'anna','slack',d + interval '17 hours');
    end if;
  end loop;

  -- open Prompts the Source Simulator shows
  insert into prompts (metric_id,submitter_id,source,text,period_start) values
    (id_deals,'anna','slack','How many deals did you close today?',current_date),
    (id_returns,'ben','mail','What was the return rate for ' || to_char(last_month,'FMMonth YYYY') || '?',last_month);

  insert into dashboards (name,owner_id) values ('Monthly overview','sara') returning id into dash_id;
  insert into widgets (owner_id,dashboard_id,template,metric_ids,settings,x,y,w,h) values
    ('sara',dash_id,'number',array[id_revenue],'{}',0,0,3,4),
    ('sara',dash_id,'number',array[id_margin],'{}',3,0,3,4),
    ('sara',dash_id,'gauge',array[id_cost],'{}',6,0,3,4),
    ('sara',dash_id,'number',array[id_tickets],'{}',9,0,3,4),
    ('sara',dash_id,'line',array[id_cost],'{"window":18,"showTarget":true,"showForecast":true}',0,4,8,7),
    ('sara',dash_id,'table',array[id_revenue],'{"rows":6}',8,4,4,7);

  insert into dashboards (name,owner_id) values ('Operations','ben') returning id into ops_id;
  insert into widgets (owner_id,dashboard_id,template,metric_ids,settings,x,y,w,h) values
    ('ben',ops_id,'bars',array[id_tickets],'{"window":12}',0,0,6,6),
    ('ben',ops_id,'line',array[id_returns],'{"window":12,"showTarget":true}',6,0,6,6);

  -- saved widgets in the Pool
  insert into widgets (owner_id,saved,title,template,metric_ids,settings,w,h) values
    ('sara',true,'Revenue, 12-month trend','line',array[id_revenue],'{"window":12,"showTarget":true,"showForecast":true}',6,6);

  -- sharing: Monthly overview -> Ben (editor); Anna shares deals with Sara; Ben shares his metrics with Sara
  insert into shares (object_type,object_id,user_id,role) values
    ('dashboard',dash_id,'ben','editor'),
    ('metric',id_deals,'sara','viewer'),
    ('metric',id_tickets,'sara','viewer'),
    ('metric',id_returns,'sara','viewer');
end;
$function$;

CREATE OR REPLACE FUNCTION public.prototype_reset_decks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into decks (owner_id, name) values ('sara', 'Board update, ' || to_char(current_date, 'FMMonth YYYY'));
end $function$;

CREATE OR REPLACE FUNCTION public.prototype_seed_breakdowns()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o record; i int; n int; acc numeric; v numeric; share numeric; shares numeric[]; labels text[];
begin
  perform setseed(0.77);
  -- Revenue by country: rows add up to the total.
  labels := array['Germany','Austria','Switzerland','Netherlands','France'];
  for o in select ob.* from observations ob join metrics m on m.id = ob.metric_id where m.slug = 'revenue' and m.workspace_id = 'd3e00000-0000-4000-8000-000000000001' order by period_start loop
    shares := array[0.50 + (random()-0.5)*0.04, 0.14 + (random()-0.5)*0.02, 0.13 + (random()-0.5)*0.02, 0.12 + (random()-0.5)*0.02];
    acc := 0;
    for i in 1..5 loop
      v := case when i < 5 then round(o.value * shares[i]) else o.value - acc end;
      acc := acc + v;
      insert into breakdown_rows (observation_id, label, value, position) values (o.id, labels[i], v, i);
    end loop;
  end loop;

  -- Orders by payment method: PayPal's share grows from about 55 % to 70 %.
  labels := array['PayPal','Card','Invoice','Direct debit','Other'];
  select count(*) into n from observations ob join metrics m on m.id = ob.metric_id where m.slug = 'orders' and m.workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  i := 0;
  for o in select ob.* from observations ob join metrics m on m.id = ob.metric_id where m.slug = 'orders' and m.workspace_id = 'd3e00000-0000-4000-8000-000000000001' order by period_start loop
    share := 0.55 + 0.15 * i::numeric / greatest(n - 1, 1) + (random()-0.5)*0.02;
    shares := array[share, (1-share)*0.48, (1-share)*0.32, (1-share)*0.13];
    acc := 0;
    for v in 1..5 loop
      insert into breakdown_rows (observation_id, label, value, position)
        values (o.id, labels[v::int], case when v < 5 then round(o.value * shares[v::int]) else o.value - acc end, v::int);
      acc := acc + case when v < 5 then round(o.value * shares[v::int]) else 0 end;
    end loop;
    i := i + 1;
  end loop;

  -- Return rate by product category: rates, so the rows do not add up to the total.
  labels := array['Shoes','Apparel','Accessories','Home'];
  shares := array[1.55, 1.1, 0.6, 0.45];
  for o in select ob.* from observations ob join metrics m on m.id = ob.metric_id where m.slug = 'return-rate' and m.workspace_id = 'd3e00000-0000-4000-8000-000000000001' order by period_start loop
    for i in 1..4 loop
      insert into breakdown_rows (observation_id, label, value, position)
        values (o.id, labels[i], round((o.value * shares[i] * (1 + (random()-0.5)*0.12))::numeric, 1), i);
    end loop;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prototype_seed_comparisons()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rev int; d date; i int; m0 date := (date_trunc('month', current_date) - interval '18 months')::date;
begin
  update metrics set aggregation = case slug
    when 'return-rate' then 'none' when 'margin' then 'none' when 'average-order-value' then 'none' else 'sum' end
    where workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  update catalog_metrics set aggregation = case
    when name in ('Customer satisfaction','Net Promoter Score','Average delivery time','Body weight') then 'average'
    when name in ('Monthly recurring revenue','Inventory value','Headcount','Cash balance') then 'last'
    when format = 'percent' then 'none' else 'sum' end;

  -- A monthly revenue budget: 120k, higher before Christmas, lower in January.
  select id into rev from metrics where slug = 'revenue' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
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
$function$;

CREATE OR REPLACE FUNCTION public.prototype_seed_stories()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d int; rev int; ord int; cst int;
begin
  select id into rev from metrics where slug = 'revenue' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  select id into ord from metrics where slug = 'orders' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  select id into cst from metrics where slug = 'cost' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
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
$function$;

CREATE OR REPLACE FUNCTION public.prototype_seed_templates()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rev int;
begin
  select id into rev from metrics where slug = 'revenue' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  insert into team_templates (owner_id, kind, name, description, view, slots, body, w, h) values (
    'sara', 'widget', 'Year-on-year story', 'One metric against the year before, last six periods, latest projection highlighted.', 'story',
    ('[{"label":"Metric","multiple":false,"exampleIds":[' || rev || ']}]')::jsonb,
    '{"metricSlots":[0],"settings":{"kicker":"{metric}, {period}","headline":"{metric} {change yoy} on last year","subline":"Change against the same period a year earlier, in %","source":"Source: {metric} in Ziffr","panels":[{"type":"period-bars","slot":0,"metricIds":[],"measure":"pct-yoy","periods":6,"highlight":"projection","projections":true,"annotations":[{"kind":"ring","anchor":{"type":"rule","rule":"max"}}]}]}}',
    8, 10);
end $function$;

CREATE OR REPLACE FUNCTION public.prototype_seed_themes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare slides jsonb := '{"background_image":null,"logo":null,"logo_ratio":3,"logo_position":"top-right","logo_width":140,"footer":"Northwind Goods, internal","show_slide_number":true,"title_size":56,"body_size":24}';
begin
  update profiles set is_owner = (id = 'sara') where id in ('sara','ben','anna');
  insert into themes (owner_id, name, is_default, slides, tokens) values
  ('sara', 'Coral', true, slides, '{"canvas":"#F0EBE7","surface":"#FDFBF8","ink":"#221B19","muted":"#615955","rule":"#D9D3CF","accent":"#BB3D31","data":["#312926","#8C7B6E","#C7BFBA","#5E7C6B"],"good":"#21763C","bad":"#BE2323","band":"#E8E1DD","fontHeading":"general-sans","fontBody":"general-sans","fontFigures":"geist-mono","radius":8,"cards":"paper"}'),
  ('sara', 'Broadsheet', false, slides || '{"title_size":60}', '{"canvas":"#F3F0E8","surface":"#FFFDF8","ink":"#141414","muted":"#5A5650","rule":"#D8D2C4","accent":"#1F4E79","data":["#2B2B2B","#1F4E79","#8FA9C4","#B9B2A4"],"good":"#2E6B3F","bad":"#A3262A","band":"#EAE5D9","fontHeading":"playfair","fontBody":"libre-franklin","fontFigures":"libre-franklin","radius":0,"cards":"plain"}'),
  ('sara', 'Night', false, slides, '{"canvas":"#0E1015","surface":"#171A21","ink":"#F1F3F7","muted":"#9AA3B2","rule":"#2B303B","accent":"#F2B33D","data":["#7CB8FF","#A78BFA","#5ED3A6","#F2B33D"],"good":"#5ED3A6","bad":"#FF7A7A","band":"#232834","fontHeading":"inter","fontBody":"inter","fontFigures":"ibm-plex-mono","radius":10,"cards":"flat"}'),
  ('sara', 'Print', false, slides || '{"show_slide_number":true}', '{"canvas":"#FFFFFF","surface":"#FFFFFF","ink":"#000000","muted":"#555555","rule":"#C8C8C8","accent":"#000000","data":["#1A1A1A","#7F7F7F","#BFBFBF","#4D4D4D"],"good":"#2E7D32","bad":"#C62828","band":"#EDEDED","fontHeading":"arial","fontBody":"arial","fontFigures":"arial","radius":0,"cards":"plain"}');
end $function$;

CREATE OR REPLACE FUNCTION public.prototype_seed_connectors()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update profiles set phone = case id when 'sara' then '+49 151 0000001' when 'ben' then '+49 151 0000002' when 'anna' then '+49 151 0000003' end
    where id in ('sara','ben','anna');
  insert into delivery_preferences (user_id, kind, connector) values
    (null, 'question', 'slack'), (null, 'task', 'slack'), (null, 'reminder', 'email'), (null, 'update', 'slack'),
    ('ben', 'task', 'tickets'),
    ('anna', 'question', 'whatsapp'), ('anna', 'task', 'whatsapp'), ('anna', 'reminder', 'whatsapp'), ('anna', 'update', 'whatsapp');
end $function$;

CREATE OR REPLACE FUNCTION public.prototype_seed_groups()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare mg int; op int; sl int;
begin
  insert into groups (name) values ('Management') returning id into mg;
  insert into groups (name) values ('Operations') returning id into op;
  insert into groups (name) values ('Sales') returning id into sl;
  insert into group_members (group_id, user_id) values (mg, 'sara'), (op, 'sara'), (op, 'ben'), (sl, 'sara'), (sl, 'anna');
end $function$;

CREATE OR REPLACE FUNCTION public.prototype_seed_workflows()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare fin int; ops int;
begin
  insert into workflows (owner_id, name, config) values
  ('sara', 'Monthly finance close', '{"dueWorkingDays":3,"steps":[{"type":"remind","daysBefore":2},{"type":"escalate","to":"stand-in","daysAfter":0},{"type":"escalate","to":"owner","daysAfter":2},{"type":"check","changePct":30,"outsideTarget":true},{"type":"approve","approvers":["ben","sara"]},{"type":"publish","lock":true}]}') returning id into fin;
  insert into workflows (owner_id, name, config) values
  ('ben', 'Operations, monthly', '{"dueWorkingDays":2,"steps":[{"type":"remind","daysBefore":1},{"type":"escalate","to":"stand-in","daysAfter":1},{"type":"check","changePct":40,"outsideTarget":false},{"type":"approve","approvers":["ben"]},{"type":"publish","lock":false}]}') returning id into ops;
  update metrics set workflow_id = fin where slug in ('revenue', 'orders', 'cost') and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  update metrics set workflow_id = ops where slug in ('support-tickets', 'return-rate') and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  update tokens set stand_in_id = case submitter_id when 'sara' then 'ben' when 'ben' then 'anna' when 'anna' then 'sara' end
    where workspace_id = 'd3e00000-0000-4000-8000-000000000001';
end $function$;

revoke execute on function prototype_reset() from public, anon, authenticated;
grant execute on function prototype_reset() to service_role;
revoke execute on function prototype_reset_decks() from public, anon, authenticated;
grant execute on function prototype_reset_decks() to service_role;
revoke execute on function prototype_seed_breakdowns() from public, anon, authenticated;
grant execute on function prototype_seed_breakdowns() to service_role;
revoke execute on function prototype_seed_comparisons() from public, anon, authenticated;
grant execute on function prototype_seed_comparisons() to service_role;
revoke execute on function prototype_seed_stories() from public, anon, authenticated;
grant execute on function prototype_seed_stories() to service_role;
revoke execute on function prototype_seed_templates() from public, anon, authenticated;
grant execute on function prototype_seed_templates() to service_role;
revoke execute on function prototype_seed_themes() from public, anon, authenticated;
grant execute on function prototype_seed_themes() to service_role;
revoke execute on function prototype_seed_connectors() from public, anon, authenticated;
grant execute on function prototype_seed_connectors() to service_role;
revoke execute on function prototype_seed_groups() from public, anon, authenticated;
grant execute on function prototype_seed_groups() to service_role;
revoke execute on function prototype_seed_workflows() from public, anon, authenticated;
grant execute on function prototype_seed_workflows() to service_role;
