-- The demo's Filled-in Values (spec 0046, "Demo"): in the monthly finance close, one past period where Ben, Sara's
-- Stand-in, entered her value for Orders while she was Away, and one where Sara, the Workflow's owner, filled in Cost for
-- Ben after the Due Date and Ben later replaced it (a Superseded Value that keeps who entered it). Both show read only,
-- with the matching Audit Log rows. Nothing is sent from the demo; these are the records of what would have happened.
-- A function of its own, as the pins and the finished period are (20270119100000, 20270121400000): the demo's reset
-- calls it after the close is seeded, `supabase/seed.sql` and Docker's first start call it too, and it runs once here
-- for a demo that exists. It does nothing twice, and nothing where the demo has no such Metrics.
create or replace function prototype_seed_fill_in() returns void language plpgsql security definer set search_path = public as $$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  stand_p date := (date_trunc('month', current_date) - interval '4 months')::date;
  owner_p date := (date_trunc('month', current_date) - interval '5 months')::date;
  orders_id int; cost_id int; o record; first_value numeric;
begin
  if exists (select 1 from observations where workspace_id = demo and entered_by is not null) then return; end if;
  select id into orders_id from metrics where workspace_id = demo and slug = 'orders';
  select id into cost_id from metrics where workspace_id = demo and slug = 'cost';
  perform set_config('ziffr.demo_seed', 'on', true);

  -- Sara was Away over the Due Date; Ben, her Stand-in, was asked and entered her value in the web form.
  select id, value into o from observations where metric_id = orders_id and period_start = stand_p order by created_at desc, id desc limit 1;
  if o.id is not null then
    insert into away (user_id, starts, ends, set_by) values ('sara', (stand_p + interval '1 month')::date, (stand_p + interval '1 month 12 days')::date, 'sara') on conflict (user_id) do nothing;
    insert into prompts (workspace_id, metric_id, submitter_id, source, text, period_start, sent_at, answered_at, answered_source, stands_in_for)
    values (demo, orders_id, 'ben', 'web_form', 'Sara is away: what was the number of orders in ' || to_char(stand_p, 'FMMonth YYYY') || '?', stand_p,
      stand_p + interval '1 month 3 days', stand_p + interval '1 month 5 days', 'web_form', 'sara');
    update observations set submitter_id = 'sara', entered_by = 'ben', source = 'web_form', created_at = stand_p + interval '1 month 5 days 10 hours' where id = o.id;
    insert into audit_events (workspace_id, at, actor_id, actor_name, kind, object_type, object_id, object_name, details)
    values (demo, stand_p + interval '1 month 5 days 10 hours', 'ben', (select name from profiles where id = 'ben'), 'value.filled_in', 'metric', orders_id::text, 'Orders',
      jsonb_build_object('period', stand_p, 'for', 'sara', 'as', 'stand_in', 'away_set_by', 'sara'));
  end if;

  -- Sara, the Workflow's owner, filled in Ben's Cost after the Due Date; Ben sent his own figure two days later.
  select id, value into o from observations where metric_id = cost_id and period_start = owner_p order by created_at desc, id desc limit 1;
  if o.id is not null then
    first_value := round(o.value * 0.97);
    insert into observation_history (workspace_id, observation_id, metric_id, period_start, value, submitter_id, entered_by, source, recorded_at, superseded_at, change)
    values (demo, o.id, cost_id, owner_p, first_value, 'ben', 'sara', 'web_form', owner_p + interval '1 month 5 days 9 hours', owner_p + interval '1 month 7 days 11 hours', 'updated');
    update observations set created_at = owner_p + interval '1 month 7 days 11 hours' where id = o.id;
    insert into audit_events (workspace_id, at, actor_id, actor_name, kind, object_type, object_id, object_name, details)
    values (demo, owner_p + interval '1 month 5 days 9 hours', 'sara', (select name from profiles where id = 'sara'), 'value.filled_in', 'metric', cost_id::text, 'Cost',
      jsonb_build_object('period', owner_p, 'for', 'ben', 'as', 'workflow_owner', 'away_set_by', null));
  end if;
  perform set_config('ziffr.demo_seed', 'off', true);
end $$;
revoke execute on function prototype_seed_fill_in() from public, anon, authenticated;
grant execute on function prototype_seed_fill_in() to service_role;

select prototype_seed_fill_in();
