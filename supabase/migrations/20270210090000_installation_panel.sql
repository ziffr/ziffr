-- The Installation panel (spec 0066; GLOSSARY: Installation Admin, User, Blocked User, Installation Health): what an
-- Installation Admin lists about Users and Workspaces, blocking a User, signing them out, extending a running trial and
-- reading how the background jobs and messages stand. Functions only, no new table.
--
-- Every function is for the service role alone: the core checks that the person is an Installation Admin before it calls
-- one. They return facts about accounts and Workspaces and counts, never anything a Workspace holds (no Metric name,
-- value, note, comment, dashboard or Contact).
--
-- A block is Auth's own ban (auth.users.banned_until), so Auth refuses the sign-in and the refresh of a session by
-- itself; Ziffr asks person_blocked wherever something else could still act as the person (keys, links, replies).

-- Whether the person's account is blocked. A person without an account (a Contact, a Feed, a made-up person) is not.
create or replace function person_blocked(p_person text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join auth.users u on u.id = p.auth_user_id
    where p.id = p_person and u.banned_until > now()
  )
$$;

-- One page of Users, newest first. The search is a plain "contains" on the address and the name, never a pattern built
-- from what was typed. `person_id` stays on the server (it marks Installation Admins). A name is read only from a person
-- row that is not a sealed Contact's. Workspaces counted: never the demo, never a Practice Workspace.
create or replace function installation_users(p_search text, p_limit int, p_offset int) returns table (
  user_id uuid, person_id text, name text, email text, signed_up_at timestamptz, last_sign_in_at timestamptz, blocked boolean, workspaces int, total bigint
) language sql stable security definer set search_path = public as $$
  with found as (
    select u.id as user_id, p.id as person_id, case when p.contact_workspace is null then p.name end as name, u.email::text as email,
      u.created_at as signed_up_at, u.last_sign_in_at, coalesce(u.banned_until > now(), false) as blocked
    from auth.users u
    left join profiles p on p.auth_user_id = u.id
    where u.deleted_at is null and not coalesce(u.is_anonymous, false)
  )
  select f.user_id, f.person_id, f.name, f.email, f.signed_up_at, f.last_sign_in_at, f.blocked,
    (select count(*)::int from memberships m join workspaces w on w.id = m.workspace_id
       where m.user_id = f.person_id and w.practice_for is null and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid),
    count(*) over ()
  from found f
  where coalesce(p_search, '') = ''
    or position(lower(p_search) in lower(coalesce(f.email, ''))) > 0
    or position(lower(p_search) in lower(coalesce(f.name, ''))) > 0
  order by f.signed_up_at desc nulls last, f.user_id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

-- Whether this admin action may go ahead: under the hourly number. Counted in the Installation's own audit, where each
-- one is an event anyway, under a lock per admin, so parallel clicks count one after the other.
create or replace function installation_action_free(p_actor text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('installation:action:' || p_actor));
  return (select count(*) from installation_audit_events
    where actor_id = p_actor and kind in ('user.blocked', 'user.unblocked', 'user.signed_out', 'workspace.trial_extended') and at > now() - interval '1 hour') < p_limit;
end $$;

-- Blocks or unblocks a User, or signs them out everywhere, with its line in the Installation's audit, in one
-- transaction: nothing is half done. The audit keeps the account's id, never a name or address, so deleting a person
-- leaves nothing of them in it. Answers 'ok', 'limit', 'gone' (no such account), 'self' (nobody blocks themself),
-- 'admin' (an Installation Admin is removed from the admins first), 'forbidden' (the actor is no Installation Admin
-- any more) or 'unchanged' (blocked or not blocked already).
create or replace function installation_user_action(p_actor text, p_actor_on_server boolean, p_actor_name text, p_user uuid, p_action text, p_server_admins text[], p_limit int)
returns text language plpgsql security definer set search_path = public as $$
declare account record;
begin
  if p_action not in ('block', 'unblock', 'sign_out') then raise exception 'unknown action'; end if;
  -- The lock of claiming and removing Installation Admins: who is one cannot change while this decides.
  perform pg_advisory_xact_lock(hashtext('installation:claim'));
  if not coalesce(p_actor_on_server, false) and not exists (select 1 from installation_admins where person_id = p_actor) then
    return 'forbidden';
  end if;
  if not installation_action_free(p_actor, p_limit) then return 'limit'; end if;
  select id, email::text as email, banned_until into account from auth.users where id = p_user and deleted_at is null for update;
  if not found then return 'gone'; end if;
  if p_action = 'block' then
    if exists (select 1 from profiles where id = p_actor and auth_user_id = p_user) then return 'self'; end if;
    if exists (select 1 from installation_admins a join profiles p on p.id = a.person_id where p.auth_user_id = p_user)
      or lower(coalesce(account.email, '')) = any (coalesce(p_server_admins, '{}'))
      or exists (select 1 from profiles p where p.auth_user_id = p_user and lower(coalesce(p.email, '')) = any (coalesce(p_server_admins, '{}'))) then
      return 'admin';
    end if;
    if account.banned_until > now() then return 'unchanged'; end if;
    -- Until someone unblocks them: Auth knows a ban only by its end.
    update auth.users set banned_until = now() + interval '100 years', updated_at = now() where id = p_user;
  elsif p_action = 'unblock' then
    if account.banned_until is null or account.banned_until <= now() then return 'unchanged'; end if;
    update auth.users set banned_until = null, updated_at = now() where id = p_user;
  end if;
  if p_action in ('block', 'sign_out') then
    -- Every session of the account; its refresh tokens go with their session, and any without one are removed too.
    delete from auth.sessions where user_id = p_user;
    delete from auth.refresh_tokens where user_id = p_user::text;
  end if;
  insert into installation_audit_events (actor_id, actor_name, kind, subject)
    values (left(p_actor, 64), coalesce(nullif(left(trim(p_actor_name), 120), ''), 'Someone'),
      case p_action when 'block' then 'user.blocked' when 'unblock' then 'user.unblocked' else 'user.signed_out' end, p_user::text);
  return 'ok';
end $$;

-- One page of Workspaces by name, for the Installation panel: what kind each is, its dates, its limit and three counts.
-- Never the demo, never a Practice Workspace (it is private to the Installation Admin it was made for). The search is a
-- plain "contains" on the Workspace's name and its Owners' names and addresses. Nothing a Workspace holds leaves here.
create or replace function installation_workspaces(p_search text, p_limit int, p_offset int) returns table (
  workspace_id uuid, name text, created_at timestamptz, last_used_at timestamptz, trial_ends_at timestamptz, trial_closed_at timestamptz,
  trial_grace_days int, closed_because text, deleting_at timestamptz, over_limit_since timestamptz, people int, metrics int, dashboards int,
  limit_metrics int, label text, own boolean, set_by text, set_by_person text, set_at timestamptz, total bigint
) language sql stable security definer set search_path = public as $$
  with found as (
    select w.* from workspaces w
    where w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid and w.practice_for is null
      and (coalesce(p_search, '') = ''
        or position(lower(p_search) in lower(w.name)) > 0
        or exists (select 1 from memberships m join profiles p on p.id = m.user_id
          where m.workspace_id = w.id and m.role = 'owner' and p.contact_workspace is null
            and (position(lower(p_search) in lower(coalesce(p.name, ''))) > 0 or position(lower(p_search) in lower(coalesce(p.email, ''))) > 0)))
  ), page as (
    select f.*, count(*) over () as total from found f
    order by lower(f.name), f.id
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select w.id, w.name, w.created_at, w.last_used_at, w.trial_ends_at, w.trial_closed_at, w.trial_grace_days, w.closed_because, w.deleting_at, w.over_limit_since,
    (select count(*)::int from memberships m where m.workspace_id = w.id),
    workspace_metric_count(w.id),
    (select count(*)::int from dashboards d where d.workspace_id = w.id),
    lim.metrics, lim.label, l.workspace_id is not null, l.set_by, l.set_by_person, l.set_at, w.total
  from page w
  left join workspace_limits l on l.workspace_id = w.id
  left join lateral workspace_limit_of(w.id) lim on true
  order by lower(w.name), w.id
$$;

-- Gives a running trial more days, in one transaction with its audit line. Only a trial that has not ended, closed or
-- been claimed for deletion, and never beyond p_max_days from now. The reminders are due again for the new end, and the
-- Access Keys and View Links the trial had shortened get their own end date back, as far as the new end allows.
create or replace function installation_extend_trial(p_actor text, p_actor_on_server boolean, p_actor_name text, p_workspace uuid, p_days int, p_max_days int, p_limit int)
returns table (result text, ends_at timestamptz) language plpgsql security definer set search_path = public as $$
declare w record; new_end timestamptz; link record;
begin
  if not coalesce(p_actor_on_server, false) and not exists (select 1 from installation_admins where person_id = p_actor) then
    return query select 'forbidden'::text, null::timestamptz; return;
  end if;
  if p_days is null or p_days < 1 or p_days > p_max_days then return query select 'days'::text, null::timestamptz; return; end if;
  if not installation_action_free(p_actor, p_limit) then return query select 'limit'::text, null::timestamptz; return; end if;
  select x.id, x.trial_ends_at, x.trial_closed_at, x.closed_because, x.deleting_at, x.practice_for into w from workspaces x where x.id = p_workspace for update;
  if not found or w.practice_for is not null or w.id = 'd3e00000-0000-4000-8000-000000000001'::uuid then return query select 'gone'::text, null::timestamptz; return; end if;
  if w.trial_ends_at is null or w.trial_ends_at <= now() or w.trial_closed_at is not null or w.closed_because is not null or w.deleting_at is not null then
    return query select 'not_running'::text, null::timestamptz; return;
  end if;
  new_end := w.trial_ends_at + make_interval(days => p_days);
  if new_end > now() + make_interval(days => p_max_days) then return query select 'too_far'::text, null::timestamptz; return; end if;
  update workspaces set trial_ends_at = new_end, trial_reminded_3_at = null, trial_reminded_at = null, trial_reminded_end_at = null where id = p_workspace;
  update access_keys k set expires_on = least(k.requested_expires_on, (new_end at time zone 'UTC')::date)
    where k.workspace_id = p_workspace and k.revoked_at is null and k.requested_expires_on is not null
      and k.expires_on >= current_date and least(k.requested_expires_on, (new_end at time zone 'UTC')::date) > k.expires_on;
  -- One link at a time: the trial's View Link trigger counts the links that work, and a Trial Limit lowered below what
  -- this trial holds must not stop the extension; such a link keeps its old end.
  for link in select v.id, v.requested_expires_at from view_links v
    where v.workspace_id = p_workspace and v.revoked_at is null and v.requested_expires_at is not null
      and v.expires_at >= current_date and v.requested_expires_at > v.expires_at
  loop
    begin
      -- The trigger shortens it to the new end again.
      update view_links set expires_at = link.requested_expires_at where id = link.id;
    exception when sqlstate 'ZF437' then null;
    end;
  end loop;
  insert into installation_audit_events (actor_id, actor_name, kind, subject)
    values (left(p_actor, 64), coalesce(nullif(left(trim(p_actor_name), 120), ''), 'Someone'), 'workspace.trial_extended', p_workspace::text);
  return query select 'ok'::text, new_end;
end $$;

-- How the Installation's own work stands, from what Ziffr records anyway: the latest recorded run of each job that
-- records one, and the messages that wait or failed, as counts by channel. No Workspace, person or message is named.
create or replace function installation_health() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'workflows_at', greatest((select max(started_at) from workflow_runs where trigger = 'schedule'),
      (select max(started_at) from workflow_asking_runs where trigger = 'schedule')),
    'workflows_failed_7d', (select count(*) from workflow_runs where state = 'failed' and started_at > now() - interval '7 days')
      + (select count(*) from workflow_asking_runs where state = 'failed' and started_at > now() - interval '7 days'),
    'deliveries_at', (select max(greatest(last_attempt_at, sent_at)) from deliveries),
    'waiting', (select count(*) from deliveries where mail_state in ('queued', 'sending') and coalesce(not_before, created_at) <= now()),
    'waiting_since', (select min(coalesce(not_before, created_at)) from deliveries where mail_state in ('queued', 'sending') and coalesce(not_before, created_at) <= now()),
    'failed', coalesce((select jsonb_agg(jsonb_build_object('channel', f.connector, 'day', f.day, 'week', f.week) order by f.connector) from (
      select connector, count(*) filter (where coalesce(last_attempt_at, created_at) > now() - interval '24 hours') as day, count(*) as week
      from deliveries where mail_state = 'failed' and coalesce(last_attempt_at, created_at) > now() - interval '7 days' group by connector) f), '[]'::jsonb),
    'retention_at', (select max(claimed_at) from retention_runs),
    'retention_failed_7d', (select count(*) from retention_runs where state = 'failed' and claimed_at > now() - interval '7 days'),
    'usage_day', (select max(day) from installation_usage_daily),
    'keys_at', (select max(sealed_checked_at) from workspaces),
    'heads_ups_at', (select max(scanned_at) from heads_up_scans),
    'demo_at', (select reset_at from demo_state limit 1)
  )
$$;

revoke execute on function person_blocked(text), installation_users(text, int, int), installation_action_free(text, int),
  installation_user_action(text, boolean, text, uuid, text, text[], int), installation_workspaces(text, int, int),
  installation_extend_trial(text, boolean, text, uuid, int, int, int), installation_health() from public, anon, authenticated;
grant execute on function person_blocked(text), installation_users(text, int, int), installation_action_free(text, int),
  installation_user_action(text, boolean, text, uuid, text, text[], int), installation_workspaces(text, int, int),
  installation_extend_trial(text, boolean, text, uuid, int, int, int), installation_health() to service_role;
