-- Telegram per workspace (spec 0016, ticket #24; GLOSSARY: Connector). One bot serves the whole Installation: its
-- token stays in the environment (ZIFFR_TELEGRAM_BOT_TOKEN) and is never stored here. Each workspace turns Telegram on
-- or off; it is off until an Owner or Admin turns it on, and turning it off keeps who linked themselves.
create table if not exists telegram_workspaces (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  enabled boolean not null default false,
  changed_by text references profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table telegram_workspaces enable row level security;
