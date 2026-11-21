-- Quiet hours (ticket #519; GLOSSARY: Quiet Hours): the hours of the day and the whole days when Ziffr sends a person
-- no Prompt, reminder or Alert; the message waits and goes out when they end. One row per person and Workspace, plus
-- one with no person for the Workspace's default (Owners and Admins). A person's own row, even an empty one, takes the
-- place of the default. Service role only: row level security stays on with no policies.
create table quiet_hours (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- Null: the Workspace's default.
  person_id text references profiles(id) on delete cascade,
  -- Quiet from from_hour up to, not including, to_hour, in the time zone; from > to runs past midnight; equal means no hours.
  from_hour smallint not null check (from_hour between 0 and 23),
  to_hour smallint not null check (to_hour between 0 and 23),
  -- Whole days that are quiet, 0 Sunday to 6 Saturday. Never all seven: a message must be able to leave.
  days smallint[] not null default '{}' check (days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and cardinality(days) <= 6),
  -- The person's own time zone; null means the Workspace's.
  time_zone text check (time_zone is null or char_length(time_zone) between 1 and 64),
  updated_at timestamptz not null default now()
);
create unique index quiet_hours_one on quiet_hours (workspace_id, coalesce(person_id, ''));
alter table quiet_hours enable row level security;
select attach_demo_guard('quiet_hours');
