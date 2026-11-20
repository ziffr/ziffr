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

-- A value recorded by any Source is use: a new one, and one that replaces or adds to a period's value (the Submission
-- Rules overwrite and add, an accepted Correction).
create or replace function observations_touch_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform touch_workspace(new.workspace_id);
  return null;
end $$;

create trigger observations_touch_workspace after insert or update of value on observations
  for each row execute function observations_touch_workspace();

-- A limit of its own (a Size booked, or one an Installation Admin set) ends any warning: such a Workspace is never
-- deleted as unused, and if it comes back to the default it is warned afresh.
create or replace function workspace_limits_clear_warning() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update workspaces set unused_warned_at = null where id = coalesce(new.workspace_id, old.workspace_id) and unused_warned_at is not null;
  return null;
end $$;

create trigger workspace_limits_clear_warning after insert or update or delete on workspace_limits
  for each row execute function workspace_limits_clear_warning();

-- Whether a Workspace may be deleted as unused now, read under its row lock by the deletion: on the default limit, no
-- trial, not the demo, warned between 14 and 21 days ago (an older warning is stale and never deletes), and unused
-- for p_days before the warning and since.
create or replace function deletable_as_unused(p_workspace uuid, p_days int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspaces w
    where w.id = p_workspace and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
      and w.trial_ends_at is null and w.unused_warned_at is not null
      and w.unused_warned_at <= now() - interval '14 days' and w.unused_warned_at > now() - interval '21 days'
      and w.last_used_at <= w.unused_warned_at - make_interval(days => p_days)
      and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
  )
$$;

-- The Workspaces a run may warn (unused for p_days, on the default limit, never warned) and may delete, oldest first,
-- at most p_limit each; warnings older than 21 days are stale and cleared, so the Workspace is warned afresh.
create or replace function unused_workspace_candidates(p_days int, p_limit int) returns table (workspace_id uuid, step text)
language plpgsql security definer set search_path = public as $$
begin
  update workspaces set unused_warned_at = null where unused_warned_at is not null and unused_warned_at <= now() - interval '21 days';
  return query
    (select w.id, 'warn'::text from workspaces w
      where w.unused_warned_at is null and w.trial_ends_at is null and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
        and w.last_used_at <= now() - make_interval(days => p_days)
        and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
      order by w.last_used_at limit p_limit)
    union all
    (select w.id, 'delete'::text from workspaces w where deletable_as_unused(w.id, p_days) order by w.unused_warned_at limit p_limit);
end $$;

-- Takes back a warning that could not be sent, so a Workspace is never deleted without one.
create or replace function unclaim_unused_warning(p_workspace uuid) returns void
language sql security definer set search_path = public as $$
  update workspaces set unused_warned_at = null where id = p_workspace
$$;

-- Deletes a Workspace as unused, in one step under its row lock, only while it still may be (a sign-in or a value
-- committed before it stops it): first its key (spec 0028: from then on nothing of it can be read, in the database or in backups
-- taken afterwards), with the Installation's audit line by its id, then the Workspace, whose rows go with it by their
-- foreign keys, and one more line that it was deleted as unused. One step, so a key is never destroyed for a
-- Workspace that then stays. True for the call that deleted it.
create or replace function delete_unused_workspace(p_workspace uuid, p_days int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from workspaces where id = p_workspace for update;
  if not found or not deletable_as_unused(p_workspace, p_days) then return false; end if;
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

-- Replaces the function of 20261209150000: an Installation Admin is never deleted as a lone person (their only
-- Workspace may be one that goes), so an Installation never loses its admins this way.
create or replace function delete_lone_person(p_person text) returns uuid
language sql security definer set search_path = public as $$
  delete from profiles p where p.id = p_person
    and not exists (select 1 from memberships m where m.user_id = p_person)
    and not exists (select 1 from installation_admins a where a.person_id = p_person)
  returning p.auth_user_id
$$;

revoke execute on function touch_workspace(uuid), deletable_as_unused(uuid, int), delete_unused_workspace(uuid, int), claim_unused_warning(uuid, int), unused_workspace_candidates(int, int), unclaim_unused_warning(uuid), delete_lone_person(text) from public, anon, authenticated;
grant execute on function touch_workspace(uuid), deletable_as_unused(uuid, int), delete_unused_workspace(uuid, int), claim_unused_warning(uuid, int), unused_workspace_candidates(int, int), unclaim_unused_warning(uuid), delete_lone_person(text) to service_role;
