-- Invitations, domain joining and roles (ADR 0003, GLOSSARY: Invitation, Workspace, Workspace Role, Contact).
-- An Invitation brings a person into a Workspace with a role: by email (once, for that address) or by link (until it
-- ends). Domain joining lets people with a verified address at the workspace's company domain ask to join; it is off
-- until an Owner sets the domain, and an Owner or Admin approves each request.
create table invitations (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token text not null unique,
  email text,
  role text not null check (role in ('owner', 'admin', 'member', 'guest')),
  contact_person_id text references profiles(id) on delete set null,
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by text references profiles(id) on delete set null
);
create index on invitations (workspace_id);
alter table invitations enable row level security;

create table join_requests (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_by text references profiles(id) on delete set null,
  decided_at timestamptz
);
create unique index join_requests_one_open on join_requests (workspace_id, person_id) where status = 'open';
alter table join_requests enable row level security;

alter table workspaces add column join_domain text;

-- A Contact who accepts an invitation keeps their history: everything in that workspace that points to the Contact's
-- person moves to the person who signed in, and the Contact entry goes. Nothing outside the workspace is touched.
create or replace function merge_contact(ws uuid, contact text, person text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from contacts where workspace_id = ws and person_id = contact) then
    raise exception 'not a contact of this workspace';
  end if;
  update tokens set submitter_id = person where workspace_id = ws and submitter_id = contact;
  update tokens set stand_in_id = person where workspace_id = ws and stand_in_id = contact;
  update tokens set stands_in_for = person where workspace_id = ws and stands_in_for = contact;
  update observations set submitter_id = person where workspace_id = ws and submitter_id = contact;
  update observation_history set submitter_id = person where workspace_id = ws and submitter_id = contact;
  update prompts set submitter_id = person where workspace_id = ws and submitter_id = contact;
  update intake_log set sender_id = person where workspace_id = ws and sender_id = contact;
  update deliveries set recipient_id = person where workspace_id = ws and recipient_id = contact;
  update deliveries set sender_id = person where workspace_id = ws and sender_id = contact;
  update actions set asker_id = person where workspace_id = ws and asker_id = contact;
  update actions set assignee_id = person where workspace_id = ws and assignee_id = contact;
  update thread_messages set author_id = person where workspace_id = ws and author_id = contact;
  delete from contacts where workspace_id = ws and person_id = contact;
end $$;
revoke execute on function merge_contact(uuid, text, text) from public, anon, authenticated;
grant execute on function merge_contact(uuid, text, text) to service_role;
