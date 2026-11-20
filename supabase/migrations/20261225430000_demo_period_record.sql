-- The demo has a period with a story (ticket #411; GLOSSARY: Period Record, Correction, Lock, Demo Mode): Cost three
-- months ago was submitted by Ben, questioned by Sara, corrected in Ben's Thread, accepted, and is locked, so its
-- Period Record page shows a struck-through value, a Correction and a Lock. Only the demo Workspace is touched, on each
-- demo reset, after the Workflows are made (their period states are what lock it).
create or replace function public.prototype_seed_period_record()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  p date := (date_trunc('month', current_date) - interval '3 months')::date;
  m int; o record; fixed numeric; act int;
begin
  select id into m from metrics where workspace_id = demo and slug = 'cost';
  select id, value into o from observations where metric_id = m and period_start = p order by created_at desc, id desc limit 1;
  if m is null or o.id is null then return; end if;
  fixed := round(o.value * 0.94);
  -- Submitted by mail the day after the month ended; accepted as a Correction two days later; locked a day after that.
  update observations set original_value = o.value, value = fixed, created_at = (p + interval '1 month' + interval '1 day')
    where id = o.id;
  insert into actions (metric_id, period_start, observation_id, asker_id, assignee_id, question, kind, status, workspace_id, created_at, updated_at)
  values (m, p, o.id, 'sara', 'ben', 'Cost for ' || to_char(p, 'FMMonth YYYY') || ' looks high. Did something land twice?', 'question', 'answered', demo,
    p + interval '1 month' + interval '2 days', p + interval '1 month' + interval '3 days')
  returning id into act;
  insert into thread_messages (action_id, author_id, body, correction_value, correction_status, workspace_id, created_at) values
    (act, 'ben', 'Yes, one supplier invoice was booked twice. The right figure is ' || to_char(fixed, 'FM999,999,999') || ' €.', fixed, 'accepted', demo, p + interval '1 month' + interval '2 days 3 hours'),
    (act, 'sara', 'Thank you, accepted.', null, null, demo, p + interval '1 month' + interval '3 days');
  update period_states set updated_at = p + interval '1 month' + interval '4 days' where metric_id = m and period_start = p;
end $function$;

revoke execute on function prototype_seed_period_record() from public, anon, authenticated;
grant execute on function prototype_seed_period_record() to service_role;

-- demo_reset as in 20261225110000, now also seeding that period.
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
