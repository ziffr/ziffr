-- People linking themselves to Telegram (spec 0016, ticket #25; GLOSSARY: Connector, Contact). A bot cannot write to
-- anyone first and cannot look people up, so a member or Contact links themselves: Ziffr makes a one-time code, they
-- open the bot with it and tap Start, and Telegram's update names their account and private chat. One Telegram
-- account is one person per workspace; the same account may be linked in several workspaces.
create table if not exists telegram_links (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  telegram_user_id bigint not null check (telegram_user_id > 0),
  chat_id bigint not null check (chat_id > 0),
  linked_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);
create unique index if not exists telegram_links_user on telegram_links (workspace_id, telegram_user_id);
create index if not exists telegram_links_user_any on telegram_links (telegram_user_id);
alter table telegram_links enable row level security;

-- A waiting code: only its SHA-256 is kept, so the table never holds a usable code. Ten minutes, used once; making a
-- new one ends the person's last.
create table if not exists telegram_link_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists telegram_link_codes_person on telegram_link_codes (workspace_id, person_id);
alter table telegram_link_codes enable row level security;

-- Every update Telegram sent, claimed by its update_id before anything else, so a retry from Telegram changes
-- nothing. Polling continues after the highest one.
create table if not exists telegram_updates (
  update_id bigint primary key check (update_id >= 0),
  workspace_id uuid references workspaces(id) on delete set null,
  delivery_id bigint references deliveries(id) on delete set null,
  telegram_user_id bigint,
  outcome text not null default 'taken' check (outcome ~ '^[a-z_]{1,30}$'),
  received_at timestamptz not null default now()
);
create index if not exists telegram_updates_received on telegram_updates (received_at);
create index if not exists telegram_updates_chat_hints on telegram_updates (telegram_user_id, received_at);
create index if not exists telegram_updates_delivery on telegram_updates (delivery_id);
alter table telegram_updates enable row level security;
