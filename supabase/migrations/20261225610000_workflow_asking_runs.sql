-- Asking Schedules (spec 0035, ticket #361; GLOSSARY: Asking Schedule, Workflow). A Workflow with its own days and
-- hour is claimed per Workflow and local day, before anything is sent: the unique key keeps a second call, a slow run
-- or a second server from running it twice. The row keeps how the run went in counts, never what was sent or to whom.
-- 'skipped' is a day a new schedule did not run because its hour had already passed when it was saved.
create table workflow_asking_runs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_id int not null references workflows(id) on delete cascade,
  day date not null,
  trigger text not null check (trigger in ('schedule', 'manual', 'saved')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  state text not null default 'running' check (state in ('running', 'done', 'failed', 'skipped')),
  prompts int not null default 0 check (prompts >= 0),
  reminders int not null default 0 check (reminders >= 0),
  escalations int not null default 0 check (escalations >= 0),
  error text check (char_length(error) <= 100),
  unique (workflow_id, day)
);
create index workflow_asking_runs_workspace on workflow_asking_runs (workspace_id);
alter table workflow_asking_runs enable row level security;
-- Read-only in the demo, like every table with a workspace_id (demo-read-only.db.test.ts).
select attach_demo_guard('workflow_asking_runs');

-- Claims a Workflow's day: only a day later than every day it has claimed, so a changed time zone cannot run a day
-- twice or a past day. Under a lock on the Workflow, so two claims at once cannot both pass. Null when not claimed.
create or replace function claim_workflow_asking_day(p_workspace uuid, p_workflow int, p_day date, p_trigger text)
returns bigint language plpgsql security definer set search_path = public as $$
declare run_id bigint;
begin
  if p_trigger not in ('schedule', 'manual', 'saved') then return null; end if;
  if not exists (select 1 from workflows where id = p_workflow and workspace_id = p_workspace) then return null; end if;
  perform pg_advisory_xact_lock(hashtext('workflow-asking-day:' || p_workflow::text));
  if exists (select 1 from workflow_asking_runs where workflow_id = p_workflow and day >= p_day) then return null; end if;
  insert into workflow_asking_runs (workspace_id, workflow_id, day, trigger, state, finished_at)
    values (p_workspace, p_workflow, p_day, p_trigger, case when p_trigger = 'saved' then 'skipped' else 'running' end, case when p_trigger = 'saved' then now() else null end)
    returning id into run_id;
  return run_id;
end $$;
revoke execute on function claim_workflow_asking_day(uuid, int, date, text) from public, anon, authenticated;
grant execute on function claim_workflow_asking_day(uuid, int, date, text) to service_role;
