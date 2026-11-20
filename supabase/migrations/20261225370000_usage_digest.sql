-- The monthly usage digest to Owners (spec 0031, ticket #368; GLOSSARY: Usage). Two small tables and a new kind of
-- Delivery. Nothing here holds a value, a name or a count: a claim says only that an Owner's month was handled.

-- One row per Workspace, Owner and month (yyyy-mm), written before anything is made, so repeated or parallel runs
-- of the job send once. A month whose Usage page was empty keeps its row too: it was handled.
create table usage_digests (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  claimed_at timestamptz not null default now(),
  primary key (workspace_id, month, person_id)
);
alter table usage_digests enable row level security;
select attach_demo_guard('usage_digests');

-- A person who switched the digest off, for all their Workspaces (one setting per person, on by default). It has no
-- workspace_id: it belongs to the person, as their sign-in does.
create table usage_digest_opt_outs (
  person_id text primary key references profiles(id) on delete cascade,
  opted_out_at timestamptz not null default now()
);
alter table usage_digest_opt_outs enable row level security;

-- The digest is a Delivery of its own kind, by email only.
alter table deliveries drop constraint deliveries_kind_check;
alter table deliveries add constraint deliveries_kind_check
  check (kind in ('question','task','reminder','reply','correction','decision','closed','done','prompt','notice','digest'));
