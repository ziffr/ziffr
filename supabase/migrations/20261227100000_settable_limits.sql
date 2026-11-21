-- Settable limits at the Workspace and person level (ticket #518; GLOSSARY: Settable Limit): what an Owner or Admin
-- set for their Workspace and what a person set for themselves, each only down from the level above. A null column
-- means "follow the level above". The ranges are checked here too, so no path can store an absurd value; the core
-- clamps to the Installation's ceiling when it reads, so a value that became too high stays harmless. Service role
-- only: row level security stays on with no policies.
create table workspace_settable_limits (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  alerts_per_person int check (alerts_per_person between 1 and 200),
  alert_messages_per_person int check (alert_messages_per_person between 1 and 200),
  view_link_days int check (view_link_days between 1 and 90),
  alert_mail_share int check (alert_mail_share between 10 and 90),
  unused_days int check (unused_days between 30 and 365),
  updated_at timestamptz not null default now()
);
alter table workspace_settable_limits enable row level security;
select attach_demo_guard('workspace_settable_limits');

create table person_settable_limits (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  alert_messages_per_person int check (alert_messages_per_person between 1 and 200),
  overdue_days_back int check (overdue_days_back between 7 and 90),
  calendar_days_back int check (calendar_days_back between 0 and 30),
  calendar_days_ahead int check (calendar_days_ahead between 7 and 90),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);
alter table person_settable_limits enable row level security;
select attach_demo_guard('person_settable_limits');
