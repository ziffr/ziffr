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

-- Replaces one row (or, with no hours given, only removes it) in a single statement, so a failed or racing save never
-- leaves a person without their rule and so back on the Workspace's default.
create or replace function set_quiet_hours(p_workspace uuid, p_person text, p_from smallint, p_to smallint, p_days smallint[], p_zone text, p_clear boolean)
returns void language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('quiet_hours:' || p_workspace::text || ':' || coalesce(p_person, '')));
  delete from quiet_hours where workspace_id = p_workspace and person_id is not distinct from p_person;
  if not p_clear then
    insert into quiet_hours (workspace_id, person_id, from_hour, to_hour, days, time_zone) values (p_workspace, p_person, p_from, p_to, p_days, p_zone);
  end if;
end $$;
revoke execute on function set_quiet_hours(uuid, text, smallint, smallint, smallint[], text, boolean) from public, anon, authenticated;
grant execute on function set_quiet_hours(uuid, text, smallint, smallint, smallint[], text, boolean) to service_role;
