-- Stopping Prompts and reminders on Telegram (spec 0016, ticket #28; GLOSSARY: Prompt, Delivery). A button under each
-- one stops them for that person in that workspace; questions, tasks and replies in their Threads keep coming, and
-- the person turns them on again on the Connectors page. Email and Slack have their own (email_opt_outs,
-- slack_opt_outs).
create table if not exists telegram_opt_outs (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  opted_out_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);
alter table telegram_opt_outs enable row level security;
