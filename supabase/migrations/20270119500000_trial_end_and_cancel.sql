-- The end of a trial on hosted Ziffr, now that there is no Free Size (spec 0040, ticket 6, #679; GLOSSARY: Trial Workspace).
--
-- 1. A reminder three days before the end and one as it ends, besides the one a day before (trial_reminded_at): each is
--    claimed by setting its mark, so two runs of the scheduler never send one twice.
-- 2. Cancelling a Size closes the Workspace like an ended trial: read-only for the grace days with the Workspace Export
--    offered, then deleted. Every check of a trial reads trial_ends_at, so a cancelled Workspace gets that day, and
--    closed_because says it was a cancelled Size and not a trial, for the words the screens use.
-- 3. A View Link made in a trial keeps the end date that was asked for (as an Access Key does), and gets it back when
--    the trial is subscribed to, since the Workspace then goes on.
alter table workspaces
  add column trial_reminded_3_at timestamptz,
  add column trial_reminded_end_at timestamptz,
  add column closed_because text check (closed_because = 'cancelled');

alter table view_links add column requested_expires_at date;

-- Replaces 20270117500000: the same clamp and count, and it remembers the end date asked for.
create or replace function view_links_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
declare ends timestamptz;
begin
  perform 1 from workspaces where id = new.workspace_id and trial_ends_at is not null for update;
  if not found then return new; end if;
  select trial_ends_at into ends from workspaces where id = new.workspace_id;
  -- What was asked for, before the trial shortened it (a change of the date asks for a new one).
  if tg_op = 'INSERT' or new.expires_at is distinct from old.expires_at then new.requested_expires_at := new.expires_at; end if;
  new.expires_at := least(new.expires_at, (ends at time zone 'UTC')::date);
  if (select count(*) from view_links where workspace_id = new.workspace_id and id <> new.id and revoked_at is null and expires_at >= current_date) >= (trial_limit_numbers()).view_links then
    raise exception using errcode = 'ZF437', message = 'view_links_per_trial';
  end if;
  return new;
end $$;

-- Replaces 20261225231000: the same, and the View Links get back the end date they were made with.
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
  -- The Workspace is no trial now, so the trigger lets the date through.
  update view_links set expires_at = requested_expires_at
    where workspace_id = p_workspace and revoked_at is null and requested_expires_at is not null and requested_expires_at > expires_at;
  perform workspace_limit_settle(p_workspace);
  return true;
end $$;

-- Closes a Workspace whose Size was cancelled, once: true for the call that did it. It ends now like a trial, so every
-- check of a trial (nothing sent or taken, keys and links stopped) and the deletion after the grace days apply; the
-- demo and a Workspace that is in a trial are left alone.
create or replace function close_cancelled_workspace(p_workspace uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update workspaces set trial_ends_at = now(), trial_kept_at = null, closed_because = 'cancelled'
    where id = p_workspace and trial_ends_at is null and trial_closed_at is null
      and id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
    returning id into v_id;
  return v_id is not null;
end $$;

revoke execute on function keep_trial(uuid), close_cancelled_workspace(uuid) from public, anon, authenticated;
grant execute on function keep_trial(uuid), close_cancelled_workspace(uuid) to service_role;
