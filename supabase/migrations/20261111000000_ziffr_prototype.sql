-- PROTOTYPE, wipe me. Ziffr feedback prototype schema.
-- Vocabulary follows GLOSSARY.md. Access goes through the server with the
-- service role; RLS is on with no policies so nothing is exposed to anon.

create table profiles (
  id text primary key,
  name text not null,
  role text not null,
  color text not null,
  slack_handle text not null unique,
  email text not null unique
);

create table catalog_metrics (
  id serial primary key,
  category text not null,
  name text not null,
  description text not null,
  unit text not null default '',
  format text not null check (format in ('number','currency','percent')),
  decimals int not null default 0,
  period text not null check (period in ('day','week','month')),
  submission_rule text not null check (submission_rule in ('reject','overwrite','add','keep_both')),
  polarity text not null check (polarity in ('higher','lower','target')),
  target_min numeric,
  target_max numeric,
  sources text[] not null default '{}'
);

create table metrics (
  id serial primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  unit text not null default '',
  format text not null check (format in ('number','currency','percent')),
  decimals int not null default 0,
  period text not null check (period in ('day','week','month')),
  submission_rule text not null check (submission_rule in ('reject','overwrite','add','keep_both')),
  polarity text not null check (polarity in ('higher','lower','target')),
  target_min numeric,
  target_max numeric,
  sources text[] not null default '{}',
  owner_id text not null references profiles(id),
  formula text,               -- set => Derived Metric, e.g. '({revenue} - {cost}) / {revenue} * 100'
  from_catalog_id int references catalog_metrics(id),
  created_at timestamptz not null default now()
);

create table tokens (
  id serial primary key,
  code text not null unique,
  metric_id int not null references metrics(id) on delete cascade,
  submitter_id text not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (metric_id, submitter_id)
);

create table observations (
  id bigserial primary key,
  metric_id int not null references metrics(id) on delete cascade,
  period_start date not null,
  value numeric not null,
  submitter_id text references profiles(id),
  source text not null,
  original_value numeric,     -- set when a Correction was accepted
  created_at timestamptz not null default now()
);
create index on observations (metric_id, period_start);

create table prompts (
  id serial primary key,
  metric_id int not null references metrics(id) on delete cascade,
  submitter_id text not null references profiles(id),
  source text not null,
  text text not null,
  period_start date not null,
  sent_at timestamptz not null default now(),
  answered_at timestamptz
);

create table intake_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  source text not null,
  sender text not null,
  sender_id text references profiles(id),
  raw text not null,
  metric_id int references metrics(id) on delete set null,
  token_code text,
  outcome text not null,
  detail text not null,
  observation_id bigint references observations(id) on delete set null
);

create table actions (
  id serial primary key,
  metric_id int not null references metrics(id) on delete cascade,
  period_start date not null,
  observation_id bigint references observations(id) on delete set null,
  asker_id text not null references profiles(id),
  assignee_id text not null references profiles(id),
  question text not null,
  kind text not null default 'question' check (kind in ('question','task')),
  due_date date,
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table thread_messages (
  id serial primary key,
  action_id int not null references actions(id) on delete cascade,
  author_id text not null references profiles(id),
  body text not null,
  correction_value numeric,
  correction_status text check (correction_status in ('proposed','accepted','declined')),
  created_at timestamptz not null default now()
);

create table dashboards (
  id serial primary key,
  name text not null,
  owner_id text not null references profiles(id),
  created_at timestamptz not null default now()
);

-- A Widget = metric(s) + View template + settings. dashboard_id null & saved => lives in the owner's Pool.
-- Placing a widget on a dashboard inserts an independent copy (GLOSSARY: Widget).
create table widgets (
  id serial primary key,
  owner_id text not null references profiles(id),
  dashboard_id int references dashboards(id) on delete cascade,
  saved boolean not null default false,
  title text,
  template text not null check (template in ('number','line','bars','gauge','table','forecast','correlation','matrix','drivers')),
  metric_ids int[] not null,
  settings jsonb not null default '{}',
  x int not null default 0, y int not null default 0, w int not null default 3, h int not null default 4,
  created_at timestamptz not null default now()
);

create table shares (
  id serial primary key,
  object_type text not null check (object_type in ('metric','dashboard')),
  object_id int not null,
  user_id text not null references profiles(id),
  role text not null check (role in ('viewer','editor')),
  unique (object_type, object_id, user_id)
);

-- One scratch Analysis Canvas per user.
create table analysis_canvas (
  user_id text not null references profiles(id),
  metric_id int not null references metrics(id) on delete cascade,
  position int not null default 0,
  primary key (user_id, metric_id)
);

alter table profiles enable row level security;
alter table catalog_metrics enable row level security;
alter table metrics enable row level security;
alter table tokens enable row level security;
alter table observations enable row level security;
alter table prompts enable row level security;
alter table intake_log enable row level security;
alter table actions enable row level security;
alter table thread_messages enable row level security;
alter table dashboards enable row level security;
alter table widgets enable row level security;
alter table shares enable row level security;
alter table analysis_canvas enable row level security;

-- Rebuilds the fictional online shop "Northwind Goods" relative to today,
-- so the story (October-style cost spike = last complete month) stays current.
create or replace function prototype_reset() returns void
language plpgsql security definer set search_path = public as $$
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
  truncate analysis_canvas, shares, widgets, dashboards, thread_messages, actions, intake_log, prompts,
           observations, tokens, metrics, catalog_metrics, profiles restart identity cascade;
  perform setseed(0.4242);

  insert into profiles values
    ('sara','Sara Lindqvist','Founder & owner','#7c3aed','@sara','sara@northwind.example'),
    ('ben','Ben Okafor','Operations lead','#0891b2','@ben','ben@northwind.example'),
    ('anna','Anna Weber','Head of sales','#ea580c','@anna','anna@northwind.example');

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
$$;
