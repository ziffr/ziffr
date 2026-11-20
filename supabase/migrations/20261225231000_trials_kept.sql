-- Trials kept as ordinary Workspaces (spec 0029, ticket #268; GLOSSARY: Trial Workspace, Workspace Limit). With
-- ZIFFR_TRIAL_THEN=keep, a Trial Workspace that reaches its end is not closed: it becomes an ordinary Workspace on the
-- Installation's default limit (Free on hosted Ziffr). So do trials Ziffr Cloud ends early when an Owner books a Size
-- (endTrial).
--
-- Every check of a trial reads workspaces.trial_ends_at (keys, Feeds, Metrics, sends, invitations). A kept trial
-- therefore moves that day to trial_ended_at, as the record of when the trial ended, and clears trial_ends_at, so
-- every one of those checks sees an ordinary Workspace at once; trial_kept_at says when.
alter table workspaces
  add column trial_kept_at timestamptz,
  add column trial_ended_at timestamptz;

-- The end date a key was made with, before a trial shortened it to the trial's last day: a kept trial gives it back.
alter table access_keys add column requested_expires_on date;

-- Replaces the function of 20261220090000 to remember the end date asked for; the rest is unchanged.
create or replace function access_keys_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
declare ends timestamptz;
begin
  select trial_ends_at into ends from workspaces where id = new.workspace_id for update;
  if ends is null then return new; end if;
  new.requested_expires_on := new.expires_on;
  new.expires_on := least(new.expires_on, (ends at time zone 'UTC')::date);
  if new.kind = 'assistant' then
    if (select count(*) from access_keys where workspace_id = new.workspace_id and kind = 'assistant' and revoked_at is null and expires_on >= current_date) >= 1 then
      raise exception using errcode = 'ZF434', message = 'assistants_per_trial';
    end if;
  elsif new.feed_id is null then
    if (select count(*) from access_keys where workspace_id = new.workspace_id and feed_id is null and kind = 'program' and revoked_at is null and expires_on >= current_date) >= 2 then
      raise exception using errcode = 'ZF431', message = 'access_keys_per_trial';
    end if;
  elsif (select count(*) from access_keys where feed_id = new.feed_id and revoked_at is null and expires_on >= current_date) >= 2 then
    raise exception using errcode = 'ZF432', message = 'feed_keys_per_feed';
  end if;
  return new;
end $$;

-- Turns a Trial Workspace into an ordinary one, once: true for the call that did it. Its keys get back the end date
-- they were made with (revoked ones stay revoked), and the Workspace Limit settles, so a trial that holds more
-- Metrics than its limit starts the 14 days over it.
create or replace function keep_trial(p_workspace uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update workspaces set trial_ended_at = least(trial_ends_at, now()), trial_ends_at = null, trial_kept_at = now()
    where id = p_workspace and trial_ends_at is not null and trial_closed_at is null
    returning id into v_id;
  if v_id is null then return false; end if;
  update access_keys set expires_on = requested_expires_on
    where workspace_id = p_workspace and revoked_at is null and requested_expires_on is not null and requested_expires_on > expires_on;
  perform workspace_limit_settle(p_workspace);
  return true;
end $$;

-- Whether a person owns a Workspace that has no limit of its own (so is on the Installation's default), the demo and
-- trials aside: for "one Free Workspace per person" (ZIFFR_ONE_DEFAULT_PER_PERSON).
create or replace function owns_default_workspace(p_person text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join workspaces w on w.id = m.workspace_id
    where m.user_id = p_person and m.role = 'owner' and w.trial_ends_at is null
      and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
      and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
  )
$$;

revoke execute on function keep_trial(uuid), owns_default_workspace(text) from public, anon, authenticated;
grant execute on function keep_trial(uuid), owns_default_workspace(text) to service_role;
