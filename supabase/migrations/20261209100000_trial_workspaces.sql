-- Trial Workspaces (spec 0021, GLOSSARY: Trial Workspace). An Installation that offers trials makes every workspace a
-- Trial Workspace: it carries the moment it ends, set once when it is made and never moved.
alter table workspaces add column trial_ends_at timestamptz;

create index workspaces_trial_ends_at on workspaces (trial_ends_at) where trial_ends_at is not null;

-- Makes a Trial Workspace with its Owner in one locked step, so sign-ups at once can pass neither the Installation's
-- cap nor "one per person". Answers 'ok:<id>', 'full' (the cap is reached) or 'taken' (the person already belongs to
-- a workspace, which on such an Installation can only be their own trial).
create or replace function create_trial_workspace(p_person text, p_name text, p_days int, p_max int)
returns text language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  -- A missing number would make a workspace without an end, or one past the cap: refused like a wrong one.
  if p_days is null or p_max is null or p_days < 1 or p_days > 30 or p_max < 1 then raise exception 'trial settings out of range'; end if;
  perform pg_advisory_xact_lock(hashtext('ziffr-trial-workspaces'));
  if exists (select 1 from memberships where user_id = p_person) then return 'taken'; end if;
  if (select count(*) from workspaces where trial_ends_at > now()) >= p_max then return 'full'; end if;
  insert into workspaces (name, trial_ends_at) values (p_name, now() + make_interval(days => p_days)) returning id into ws;
  insert into memberships (workspace_id, user_id, role) values (ws, p_person, 'owner');
  return 'ok:' || ws::text;
end;
$$;

revoke execute on function create_trial_workspace(text, text, int, int) from public, anon, authenticated;
grant execute on function create_trial_workspace(text, text, int, int) to service_role;
