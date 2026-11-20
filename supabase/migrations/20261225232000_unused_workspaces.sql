-- Unused Workspaces on the default limit (spec 0029, ticket #269; GLOSSARY: Workspace Limit). Where an Installation
-- sets ZIFFR_DELETE_UNUSED_AFTER_DAYS, a Workspace on its default limit (no limit of its own) that nobody used for that
-- many days gets one warning to its Owners, and 14 days later, still unused, is deleted with its key destroyed first.
-- Never a trial, never the demo, never a Workspace with a limit of its own (a paid Size, or one an Installation Admin
-- set).
--
-- Used means: anyone of the Workspace signed in, or a value was recorded for one of its Metrics by any Source.
-- last_used_at keeps the latest, written at most once an hour per Workspace; any use clears the warning. Existing
-- Workspaces count as used now, so none is warned the day this arrives.
alter table workspaces
  add column last_used_at timestamptz not null default now(),
  add column unused_warned_at timestamptz;

-- Marks a Workspace as used now: at most once an hour, and always when it was warned, so the warning ends at once.
create or replace function touch_workspace(p_workspace uuid) returns void
language sql security definer set search_path = public as $$
  update workspaces set last_used_at = now(), unused_warned_at = null
  where id = p_workspace and (last_used_at < now() - interval '1 hour' or unused_warned_at is not null)
$$;

-- A value recorded by any Source is use (record_observation, add_to_observation and every other insert).
create or replace function observations_touch_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform touch_workspace(new.workspace_id);
  return null;
end $$;

create trigger observations_touch_workspace after insert on observations
  for each row execute function observations_touch_workspace();

-- Whether a Workspace may be deleted as unused now, read under its row lock by the deletion: on the default limit,
-- no trial, not the demo, warned at least p_wait_days ago and not used since the warning.
create or replace function deletable_as_unused(p_workspace uuid, p_wait_days int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspaces w
    where w.id = p_workspace and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
      and w.trial_ends_at is null and w.unused_warned_at is not null
      and w.unused_warned_at <= now() - make_interval(days => greatest(p_wait_days, 14))
      and w.last_used_at <= w.unused_warned_at
      and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
  )
$$;

-- Deletes a Workspace as unused, in one step under its row lock, only while it still may be (a sign-in or a value since
-- the check stops it): first its key (spec 0028: from then on nothing of it can be read, in the database or in backups
-- taken afterwards), with the Installation's audit line by its id, then the Workspace, whose rows go with it by their
-- foreign keys, and one more line that it was deleted as unused. One step, so a key is never destroyed for a
-- Workspace that then stays. True for the call that deleted it.
create or replace function delete_unused_workspace(p_workspace uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from workspaces where id = p_workspace for update;
  if not found or not deletable_as_unused(p_workspace, 14) then return false; end if;
  update workspaces set keyed_at = coalesce(keyed_at, now()) where id = p_workspace;
  delete from workspace_keys where workspace_id = p_workspace;
  if not exists (select 1 from installation_audit_events where kind = 'workspace.key_destroyed' and subject = p_workspace::text) then
    insert into installation_audit_events (actor_id, actor_name, kind, subject) values (null, 'Ziffr', 'workspace.key_destroyed', p_workspace::text);
  end if;
  delete from workspaces where id = p_workspace;
  insert into installation_audit_events (actor_id, actor_name, kind, subject) values (null, 'Ziffr', 'workspace.deleted_unused', p_workspace::text);
  return true;
end $$;

-- Claims the warning for a Workspace unused for p_days, once: true for the call that may send it.
create or replace function claim_unused_warning(p_workspace uuid, p_days int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update workspaces w set unused_warned_at = now()
    where w.id = p_workspace and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid and w.trial_ends_at is null
      and w.unused_warned_at is null and w.last_used_at <= now() - make_interval(days => p_days)
      and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
    returning w.id into v_id;
  return v_id is not null;
end $$;

revoke execute on function touch_workspace(uuid), deletable_as_unused(uuid, int), delete_unused_workspace(uuid), claim_unused_warning(uuid, int) from public, anon, authenticated;
grant execute on function touch_workspace(uuid), deletable_as_unused(uuid, int), delete_unused_workspace(uuid), claim_unused_warning(uuid, int) to service_role;
