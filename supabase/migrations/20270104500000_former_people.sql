-- People who left a Workspace but whose names remain in its values, threads, Versions, Snapshots and questions
-- (GLOSSARY: Guest, View Link). Only the core calls this, to find their names in words it must hide: the ids are
-- never sent anywhere. A member (also a Guest) is not "former", and people with no mark left are not found.
create or replace function former_person_ids(ws uuid) returns table (person_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p from (
    select submitter_id as p from observations where workspace_id = ws
    union all select submitter_id from observation_history where workspace_id = ws
    union all select author_id from thread_messages where workspace_id = ws
    union all select author_id from versions where workspace_id = ws
    union all select asker_id from actions where workspace_id = ws
    union all select assignee_id from actions where workspace_id = ws
    union all select sender_id from intake_log where workspace_id = ws
    union all select submitter_id from tokens where workspace_id = ws
    union all select stand_in_id from tokens where workspace_id = ws
    union all select taken_by from dashboard_snapshots where workspace_id = ws
    union all select shown_by from dashboard_snapshots where workspace_id = ws
  ) s
  where p is not null
    and not exists (select 1 from memberships m where m.workspace_id = ws and m.user_id = s.p)
    -- A Feed is a person without a membership, not someone who left: its name is no secret and hiding it would blank ordinary words.
    and not exists (select 1 from feeds f where f.person_id = s.p)
$$;
revoke execute on function former_person_ids(uuid) from public, anon, authenticated;
grant execute on function former_person_ids(uuid) to service_role;
