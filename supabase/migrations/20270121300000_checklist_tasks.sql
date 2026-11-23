-- Checklist Tasks (spec 0045, ticket #792; GLOSSARY: Checklist Item, Task, Action). A tick-off Checklist Item gives its
-- Assignee one Task per period that is about the Workflow and its period instead of a Metric: an Action with the purpose
-- `checklist`, the Workflow's id and the item's step id. `metric_id` may be null for that purpose and no other, so a
-- Metric can never go missing from any other Action; one Task per item and period.
alter table actions alter column metric_id drop not null;
alter table actions add column workflow_id int references workflows(id) on delete cascade;
alter table actions add column checklist_item_id text check (checklist_item_id is null or char_length(checklist_item_id) between 1 and 40);
alter table actions drop constraint actions_purpose_check;
alter table actions add constraint actions_purpose_check check (purpose in ('approval', 'escalation', 'self_check', 'checklist'));
alter table actions add constraint actions_metric_or_checklist
  check (purpose is not distinct from 'checklist' and metric_id is null and workflow_id is not null and checklist_item_id is not null
      or purpose is distinct from 'checklist' and metric_id is not null and checklist_item_id is null and workflow_id is null);
create unique index actions_checklist_item_period on actions (workflow_id, checklist_item_id, period_start) where purpose = 'checklist';
create index actions_workflow on actions (workflow_id) where workflow_id is not null;
-- Whom a Checklist Task was handed over from (an Escalation to the item's Stand-in): they keep reading and answering it.
alter table actions add column previous_assignee_id text references profiles(id);

-- What the Workflow did for one Checklist Task (a Remind or an Escalate step), claimed before it is sent, once per Task and step.
alter table workflow_step_runs drop constraint workflow_step_runs_kind_check;
alter table workflow_step_runs add constraint workflow_step_runs_kind_check check (kind in ('checklist', 'paused', 'task_step'));
create or replace function claim_workflow_step(p_workspace uuid, p_workflow int, p_step text, p_period date, p_kind text)
returns bigint language plpgsql security definer set search_path = public as $$
declare run_id bigint;
begin
  if p_kind not in ('checklist', 'paused', 'task_step') then return null; end if;
  if not exists (select 1 from workflows where id = p_workflow and workspace_id = p_workspace) then return null; end if;
  insert into workflow_step_runs (workspace_id, workflow_id, step_id, period_start, kind)
    values (p_workspace, p_workflow, p_step, p_period, p_kind)
    on conflict (workflow_id, step_id, period_start) do nothing
    returning id into run_id;
  return run_id;
end $$;

-- An Action always lands in the workspace of what it is about: its Metric, or for a Checklist Task its Workflow (ADR 0003).
create or replace function workspace_from_parent() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ws uuid;
begin
  case tg_table_name
    when 'observations', 'prompts', 'period_states', 'series_values', 'tokens', 'analysis_canvas' then
      select workspace_id into ws from metrics where id = new.metric_id;
    when 'actions' then
      -- A Checklist Task has no Metric: it lands in the workspace of its Workflow.
      if new.metric_id is not null then select workspace_id into ws from metrics where id = new.metric_id;
      elsif new.workflow_id is not null then select workspace_id into ws from workflows where id = new.workflow_id; end if;
    when 'observation_history' then
      select workspace_id into ws from metrics where id = new.metric_id;
    when 'breakdown_rows', 'breakdown_history' then
      select workspace_id into ws from observations where id = new.observation_id;
    when 'thread_messages' then
      select workspace_id into ws from actions where id = new.action_id;
    when 'group_members' then
      select workspace_id into ws from groups where id = new.group_id;
    when 'widgets' then
      if new.dashboard_id is not null then select workspace_id into ws from dashboards where id = new.dashboard_id; end if;
    when 'dashboard_snapshots' then
      select workspace_id into ws from dashboards where id = new.dashboard_id;
    when 'deliveries' then
      if new.action_id is not null then select workspace_id into ws from actions where id = new.action_id;
      elsif new.prompt_id is not null then select workspace_id into ws from prompts where id = new.prompt_id; end if;
    when 'intake_log' then
      if new.metric_id is not null then select workspace_id into ws from metrics where id = new.metric_id; end if;
    when 'shares', 'versions', 'view_links', 'access_requests' then
      case new.object_type
        when 'metric' then select workspace_id into ws from metrics where id = new.object_id;
        when 'dashboard' then select workspace_id into ws from dashboards where id = new.object_id;
        when 'deck' then select workspace_id into ws from decks where id = new.object_id;
        when 'widget' then select workspace_id into ws from widgets where id = new.object_id;
        when 'template' then select workspace_id into ws from team_templates where id = new.object_id;
        when 'theme' then select workspace_id into ws from themes where id = new.object_id;
        when 'workflow' then select workspace_id into ws from workflows where id = new.object_id;
        when 'snapshot' then select workspace_id into ws from dashboard_snapshots where id = new.object_id;
        else null;
      end case;
    else null;
  end case;
  if ws is not null then new.workspace_id := ws; end if;
  return new;
end $$;
