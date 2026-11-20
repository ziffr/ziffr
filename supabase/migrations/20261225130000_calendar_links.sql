-- Calendar Links (spec 0027, ticket #243; GLOSSARY: Calendar Link): a secret address that shows one person's Schedule
-- in a calendar app. Only the secret's SHA-256 is kept; one link per person per Workspace. A link ends with the person's
-- membership (a trigger, whichever way they leave), with the person and with the Workspace (a Trial Workspace too).
create table calendar_links (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  -- "No names": events say only what kind and how many, for a calendar others can see.
  no_names boolean not null default false,
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  -- The fetches of the current hour, for the limit of 60 an hour.
  window_started_at timestamptz,
  window_fetches int not null default 0,
  unique (workspace_id, person_id)
);
alter table calendar_links enable row level security;

-- Leaving a Workspace, or being removed from it, ends the person's Calendar Link there in the same step.
create or replace function end_calendar_link() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from calendar_links where workspace_id = old.workspace_id and person_id = old.user_id;
  return old;
end $$;
create trigger end_calendar_link after delete on memberships for each row execute function end_calendar_link();

-- One fetch of a Calendar Link, counted in one statement so two fetches at once cannot both pass the limit. Returns the
-- link with whether this fetch is within the limit, or nothing for an unknown hash.
create or replace function fetch_calendar_link(p_hash text, p_limit int) returns table (id bigint, workspace_id uuid, person_id text, no_names boolean, allowed boolean)
language sql security definer set search_path = public as $$
  update calendar_links c set
    window_fetches = case when c.window_started_at > now() - interval '1 hour' then c.window_fetches + 1 else 1 end,
    window_started_at = case when c.window_started_at > now() - interval '1 hour' then c.window_started_at else now() end,
    last_fetched_at = now()
  where c.secret_hash = p_hash
  returning c.id, c.workspace_id, c.person_id, c.no_names, c.window_fetches <= p_limit;
$$;
revoke all on function fetch_calendar_link(text, int) from public, anon, authenticated;
grant execute on function fetch_calendar_link(text, int) to service_role;

