-- Connecting Slack (spec 0007, tickets #101 and #102; GLOSSARY: Connector, Workspace, Contact). One Ziffr workspace
-- connects at most one Slack workspace, and one Slack workspace at most one Ziffr workspace, so a thread in a direct
-- message names one Ziffr workspace. The bot token is sealed by the core (AES-256-GCM under ZIFFR_SECRETS_KEY, the
-- workspace id as additional data) before it is stored; it is never selected by a loader.
create table if not exists slack_installations (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  team_id text not null check (team_id ~ '^[A-Z0-9]{3,24}$'),
  team_name text not null default '' check (char_length(team_name) <= 120),
  app_id text not null check (app_id ~ '^[A-Z0-9]{3,24}$'),
  bot_user_id text not null check (bot_user_id ~ '^[A-Z0-9]{3,24}$'),
  bot_token text not null check (char_length(bot_token) between 20 and 1000),
  scopes text not null default '' check (char_length(scopes) <= 500),
  installed_by text references profiles(id) on delete set null,
  installed_at timestamptz not null default now(),
  -- Set by a disconnect in Ziffr, an uninstall or a revoked token in Slack: nothing is sent or taken any more.
  revoked_at timestamptz
);
create unique index if not exists slack_installations_team on slack_installations (team_id) where revoked_at is null;
alter table slack_installations enable row level security;

-- "Add to Slack" in progress: a one-time state bound to the person and workspace that started it, for ten minutes.
create table if not exists slack_install_states (
  state text primary key check (char_length(state) = 32),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table slack_install_states enable row level security;

-- Who a person is on the connected Slack workspace: found by their address (matched_by 'email', with the address it
-- was found by, so a changed address looks again) or linked by a code they sent the bot themselves ('code'). One
-- Slack user is one person per workspace.
create table if not exists slack_links (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  team_id text not null check (team_id ~ '^[A-Z0-9]{3,24}$'),
  slack_user_id text not null check (slack_user_id ~ '^[A-Z0-9]{3,24}$'),
  matched_by text not null check (matched_by in ('email', 'code')),
  email text check (char_length(email) <= 254),
  linked_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);
create unique index if not exists slack_links_user on slack_links (workspace_id, slack_user_id);
alter table slack_links enable row level security;

-- A code a member sends the bot to link their Slack account: 80 random bits, ten minutes, used once.
create table if not exists slack_link_codes (
  code text primary key check (code ~ '^ZIF-[A-Z2-7]{16}$'),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists slack_link_codes_person on slack_link_codes (workspace_id, person_id);
alter table slack_link_codes enable row level security;
