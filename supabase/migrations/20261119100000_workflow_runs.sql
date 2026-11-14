-- Scheduled Workflow runs (spec 0005, ticket #85; GLOSSARY: Workflow). One row per workspace and local day, made
-- before anything is sent: the unique key is what keeps a second call, a slow run or a second server from running a
-- day twice. It keeps how the run went in counts, never what was sent or to whom.
create table workflow_runs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  day date not null,
  trigger text not null check (trigger in ('schedule', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  state text not null default 'running' check (state in ('running', 'done', 'failed')),
  prompts int not null default 0 check (prompts >= 0),
  reminders int not null default 0 check (reminders >= 0),
  escalations int not null default 0 check (escalations >= 0),
  error text check (char_length(error) <= 100),
  unique (workspace_id, day)
);
alter table workflow_runs enable row level security;
