-- Checklist Items for information (spec 0045, ticket #791; GLOSSARY: Checklist Item, Workflow, Delivery). The Delivery
-- kind `checklist` (a message from a Workflow's owner that no one can answer, held by Quiet Hours), and the claim that
-- lets a step that works once per Workflow and period send once: a row per step and period, made before anything is
-- sent, as workflow_runs is made per day. The row holds ids, a kind and counts, never a word of the item or a person.
alter table deliveries drop constraint deliveries_kind_check;
alter table deliveries add constraint deliveries_kind_check
  check (kind in ('question','task','reminder','reply','correction','decision','closed','done','prompt','notice','digest','alert','heads_up','checklist'));

create table workflow_step_runs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_id int not null references workflows(id) on delete cascade,
  -- The step's stable id in the Workflow's config; 'paused' for the one note a Workflow whose Metrics disagree on a period gets.
  step_id text not null check (char_length(step_id) between 1 and 40),
  period_start date not null,
  kind text not null check (kind in ('checklist', 'paused')),
  ran_at timestamptz not null default now(),
  sent int not null default 0 check (sent >= 0),
  skipped int not null default 0 check (skipped >= 0),
  unique (workflow_id, step_id, period_start)
);
create index workflow_step_runs_workspace on workflow_step_runs (workspace_id);
alter table workflow_step_runs enable row level security;
-- Read-only in the demo, like every table with a workspace_id (demo-read-only.db.test.ts).
select attach_demo_guard('workflow_step_runs');

-- Claims one step of a Workflow for one period: the row's id for the one call that may send, null for every other
-- (a second run, two servers, a period unlocked and locked again). The Workflow must be of the Workspace.
create or replace function claim_workflow_step(p_workspace uuid, p_workflow int, p_step text, p_period date, p_kind text)
returns bigint language plpgsql security definer set search_path = public as $$
declare run_id bigint;
begin
  if p_kind not in ('checklist', 'paused') then return null; end if;
  if not exists (select 1 from workflows where id = p_workflow and workspace_id = p_workspace) then return null; end if;
  insert into workflow_step_runs (workspace_id, workflow_id, step_id, period_start, kind)
    values (p_workspace, p_workflow, p_step, p_period, p_kind)
    on conflict (workflow_id, step_id, period_start) do nothing
    returning id into run_id;
  return run_id;
end $$;
revoke execute on function claim_workflow_step(uuid, int, text, date, text) from public, anon, authenticated;
grant execute on function claim_workflow_step(uuid, int, text, date, text) to service_role;
