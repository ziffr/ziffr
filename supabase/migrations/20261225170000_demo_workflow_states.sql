-- The demo's Workflows tell the same story as its numbers (ticket #17; GLOSSARY: Workflow, Approval, Demo Mode).
-- The demo has values for the last 18 months, but no Workflow had ever run, so every Metric on "Monthly finance
-- close" said Not started for last month. Now the demo starts with a month close under way:
--   * every month before last month is Published and locked on "Monthly finance close" (it locks), and Published on
--     "Operations, monthly" (it does not);
--   * last month, Orders and Cost are Published and locked, and Revenue waits for Ben's approval, with his approval
--     Task open, as the Workflow's own approve step would leave it; a Metric still without a value for last month
--     (Return rate) was asked for it and is waited for;
--   * this month has no value yet and no state: Not started.
-- Only the demo Workspace is touched, on each demo reset, after the Workflows are made.
create or replace function public.prototype_seed_workflows()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  last_month date := (date_trunc('month', current_date) - interval '1 month')::date;
  fin int; ops int; rev record; task int; reason text;
begin
  insert into workflows (owner_id, name, config) values
  ('sara', 'Monthly finance close', '{"dueWorkingDays":3,"steps":[{"type":"remind","daysBefore":2},{"type":"escalate","to":"stand-in","daysAfter":0},{"type":"escalate","to":"owner","daysAfter":2},{"type":"check","changePct":30,"outsideTarget":true},{"type":"approve","approvers":["ben","sara"]},{"type":"publish","lock":true}]}') returning id into fin;
  insert into workflows (owner_id, name, config) values
  ('ben', 'Operations, monthly', '{"dueWorkingDays":2,"steps":[{"type":"remind","daysBefore":1},{"type":"escalate","to":"stand-in","daysAfter":1},{"type":"check","changePct":40,"outsideTarget":false},{"type":"approve","approvers":["ben"]},{"type":"publish","lock":false}]}') returning id into ops;
  update metrics set workflow_id = fin where slug in ('revenue', 'orders', 'cost') and workspace_id = demo;
  update metrics set workflow_id = ops where slug in ('support-tickets', 'return-rate') and workspace_id = demo;
  update tokens set stand_in_id = case submitter_id when 'sara' then 'ben' when 'ben' then 'anna' when 'anna' then 'sara' end
    where workspace_id = demo;

  -- Every period with a value before last month went through its Workflow.
  insert into period_states (metric_id, period_start, state, workspace_id, updated_at)
  select distinct o.metric_id, o.period_start, case when m.workflow_id = fin then 'locked' else 'published' end, demo,
    (o.period_start + interval '1 month' + interval '3 days')
  from observations o join metrics m on m.id = o.metric_id
  where m.workspace_id = demo and m.workflow_id in (fin, ops) and o.period_start < last_month;

  -- Last month: the month close is under way.
  insert into period_states (metric_id, period_start, state, workspace_id)
  select m.id, last_month, case when m.workflow_id = fin then 'locked' else 'published' end, demo
  from metrics m
  where m.workspace_id = demo and m.slug in ('orders', 'cost', 'support-tickets', 'return-rate')
    and exists (select 1 from observations o where o.metric_id = m.id and o.period_start = last_month);

  -- A Metric on a Workflow without a value for last month was asked for it and is still waited for.
  insert into period_states (metric_id, period_start, state, workspace_id)
  select m.id, last_month, 'asked', demo
  from metrics m
  where m.workspace_id = demo and m.workflow_id in (fin, ops)
    and not exists (select 1 from observations o where o.metric_id = m.id and o.period_start = last_month);

  select m.id, o.value, m.target_min, coalesce(o.submitter_id, 'sara') as submitter into rev
  from metrics m join observations o on o.metric_id = m.id and o.period_start = last_month
  where m.workspace_id = demo and m.slug = 'revenue'
  order by o.created_at desc limit 1;
  if rev.id is not null then
    -- The check step's reason, in its words: the demo's October Revenue lies below its target.
    reason := case when rev.target_min is not null and rev.value < rev.target_min then 'below target' end;
    -- The approval Task the approve step asks of the first Approver, worded as the Workflow words it.
    insert into actions (metric_id, period_start, asker_id, assignee_id, question, kind, purpose, status, workspace_id)
    values (rev.id, last_month, rev.submitter, 'ben',
      'Approve Revenue for ' || to_char(last_month, 'Mon YYYY') || ': ' || to_char(rev.value, 'FM999,999,999') || ' €' || coalesce(', ' || reason, '') || '. Reply “approve”, or “send back:” with what to check.',
      'task', 'approval', 'open', demo)
    returning id into task;
    insert into period_states (metric_id, period_start, state, approval_step, approval_action_id, approval_for, note, workspace_id)
    values (rev.id, last_month, 'approval', 0, task, rev.submitter, reason, demo);
  end if;
end $function$;

revoke execute on function prototype_seed_workflows() from public, anon, authenticated;
grant execute on function prototype_seed_workflows() to service_role;
