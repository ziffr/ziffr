-- Contacts (ADR 0003, GLOSSARY: Contact): people known to a Workspace who have no login and submit values by Slack,
-- email or form. Each is a person (profiles), so their values, Tokens and threads stay theirs when they are later
-- invited and become a Member. How this workspace reaches and recognises them (Slack handle, email, phone) is kept
-- here, per workspace, not on the person: two workspaces may know the same address without clashing, and nothing on
-- the person lets anyone sign in as them.
create table contacts (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  email text,
  slack_handle text,
  phone text,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, person_id),
  constraint contacts_reachable check (email is not null or slack_handle is not null or phone is not null)
);
create unique index contacts_workspace_email on contacts (workspace_id, lower(email)) where email is not null;
create unique index contacts_workspace_slack on contacts (workspace_id, lower(slack_handle)) where slack_handle is not null;
alter table contacts enable row level security;
