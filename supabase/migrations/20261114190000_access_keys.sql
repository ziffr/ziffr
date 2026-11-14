-- Access Keys (ADR 0003, GLOSSARY: Access Key): a secret a person creates so a program can act for them in one
-- Workspace, within scopes, until a set day. Only a hash of the secret is kept; a short prefix finds the row.
create table access_keys (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  name text not null,
  prefix text not null unique,
  secret_hash text not null,
  scopes text[] not null,
  expires_on date not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on access_keys (workspace_id);
alter table access_keys enable row level security;
