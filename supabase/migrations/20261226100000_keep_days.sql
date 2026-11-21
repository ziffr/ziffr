-- Settable days (spec 0025, ticket #517; GLOSSARY: Installation Settings): how long logs are kept, how long an unused
-- Workspace waits between its warning and its deletion, and how long a Workspace may stay over its limit. The
-- core reads each setting (packages/core/src/installation-days.ts) and passes it in; the database keeps its own lower
-- bounds, so a mistaken setting can shorten what is kept only down to them: the Audit Log a year, View Counts 90 days,
-- an unused Workspace's wait 7 days.

-- The Audit Log: the database now refuses to remove an event younger than a year (it was two years). How long events are
-- kept above that is the Installation's setting, and the core removes them (audit-retention.ts).
create or replace function audit_events_add_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and (old.at < now() - interval '365 days' or not exists (select 1 from workspaces w where w.id = old.workspace_id)) then
    return old;
  end if;
  -- Only seal_audit_event, running as its owner, with the mark it sets for the length of its own statement.
  if tg_op = 'UPDATE' and current_setting('ziffr.sealing_audit', true) = 'on'
     and current_user = (select pg_get_userbyid(proowner) from pg_proc where oid = 'seal_audit_event(bigint,text,text,jsonb,jsonb)'::regprocedure)
     and (to_jsonb(new) - 'object_name' - 'details') = (to_jsonb(old) - 'object_name' - 'details')
     -- Each of the two stays as it is, or goes from plain to sealed, or from a key version to a newer one: never to
     -- plain text, never sideways to another value of the same version.
     and (new.object_name is not distinct from old.object_name
          or (new.object_name is not null and sealed_format(new.object_name) and (old.object_name is null or not sealed_format(old.object_name) or sealed_version(new.object_name) > sealed_version(old.object_name))))
     and (new.details = old.details
          or (sealed_details(new.details) and (not sealed_details(old.details) or sealed_version(new.details ->> 'sealed') > sealed_version(old.details ->> 'sealed')))) then
    return new;
  end if;
  raise exception 'The Audit Log is add-only.' using errcode = 'ZF403';
end;
$$;

-- View Counts: the days to keep come from the core, never fewer than 90.
drop function prune_view_counts();
create or replace function prune_view_counts(p_days integer default 400)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n integer;
begin
  delete from view_counts where day < (now() at time zone 'utc')::date - greatest(coalesce(p_days, 400), 90);
  get diagnostics n = row_count;
  return n;
end $function$;
revoke execute on function prune_view_counts(integer) from public, anon, authenticated;
grant execute on function prune_view_counts(integer) to service_role;

-- Unused Workspaces: the wait between the warning and the deletion is kept with the warning, so a Workspace is never
-- deleted sooner than its warning said, whatever the setting says later. The deletion window stays one week wide.
alter table workspaces add column unused_wait_days int check (unused_wait_days between 7 and 90);

create or replace function deletable_as_unused(p_workspace uuid, p_days int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspaces w
    where w.id = p_workspace and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
      and w.trial_ends_at is null and w.unused_warned_at is not null
      and w.unused_warned_at <= now() - make_interval(days => coalesce(w.unused_wait_days, 14))
      and w.unused_warned_at > now() - make_interval(days => coalesce(w.unused_wait_days, 14) + 7)
      and w.last_used_at <= w.unused_warned_at - make_interval(days => p_days)
      and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
      and exists (
        select 1 from deliveries d
        where d.workspace_id = w.id and d.kind = 'notice' and d.connector = 'email' and d.mail_state = 'sent'
          and d.subject = 'Your Ziffr Workspace will be deleted' and d.created_at >= w.unused_warned_at
      )
  )
$$;

create or replace function unused_workspace_candidates(p_days int, p_limit int) returns table (workspace_id uuid, step text)
language plpgsql security definer set search_path = public as $$
begin
  update workspaces set unused_warned_at = null where unused_warned_at is not null and unused_warned_at <= now() - make_interval(days => coalesce(unused_wait_days, 14) + 7);
  return query
    (select w.id, 'warn'::text from workspaces w
      where w.unused_warned_at is null and w.trial_ends_at is null and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
        and w.last_used_at <= now() - make_interval(days => p_days)
        and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
        and exists (select 1 from memberships m where m.workspace_id = w.id and m.role = 'owner')
      order by w.last_used_at limit p_limit)
    union all
    (select w.id, 'delete'::text from workspaces w where deletable_as_unused(w.id, p_days) order by w.unused_warned_at limit p_limit);
end $$;

-- Claims the warning for a Workspace unused for p_days, once, and records the wait it promised (7 to 90 days).
drop function claim_unused_warning(uuid, int);
create or replace function claim_unused_warning(p_workspace uuid, p_days int, p_wait int default 14) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update workspaces w set unused_warned_at = now(), unused_wait_days = least(greatest(coalesce(p_wait, 14), 7), 90)
    where w.id = p_workspace and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid and w.trial_ends_at is null
      and w.unused_warned_at is null and w.last_used_at <= now() - make_interval(days => p_days)
      and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
    returning w.id into v_id;
  return v_id is not null;
end $$;
revoke execute on function claim_unused_warning(uuid, int, int) from public, anon, authenticated;
grant execute on function claim_unused_warning(uuid, int, int) to service_role;

-- Trials: the grace days a trial had when it was closed are kept with it, so a later setting never deletes an ended
-- trial sooner than the days its Owner was told (a trial closed before this has the usual 7).
alter table workspaces add column trial_grace_days int check (trial_grace_days between 1 and 60);

-- Workspace Limits: the days over the limit and the days between two such periods, as the core found them in effect
-- (ZIFFR_LIMIT_GRACE_DAYS, ZIFFR_LIMIT_GRACE_EVERY_DAYS), kept beside the default limit.
alter table installation_limit_default
  add column grace_days int not null default 14 check (grace_days between 0 and 90),
  add column grace_every_days int not null default 90 check (grace_every_days between 0 and 730);

create or replace function workspace_grace_days() returns int
language sql stable security definer set search_path = public as $$ select coalesce((select grace_days from installation_limit_default where only_row), 14) $$;
create or replace function workspace_grace_every_days() returns int
language sql stable security definer set search_path = public as $$ select coalesce((select grace_every_days from installation_limit_default where only_row), 90) $$;
revoke execute on function workspace_grace_days(), workspace_grace_every_days() from public, anon, authenticated;
grant execute on function workspace_grace_days(), workspace_grace_every_days() to service_role;

-- The rule (the same as workspace-limits.ts; a test runs both): with no days over the limit, one more Metric over it waits.
drop function workspace_limit_rule(int, int, timestamptz, timestamptz, timestamptz);
create or replace function workspace_limit_rule(p_count int, p_limit int, p_since timestamptz, p_now timestamptz, p_last_grace timestamptz,
  p_grace int default 14, p_every int default 90)
returns text language sql immutable as $$
  select case
    when p_limit is null or p_count + 1 <= p_limit then 'allow'
    when p_count + 1 > workspace_limit_room(p_limit) then 'refuse'
    when p_grace <= 0 then 'refuse'
    when p_since is not null and p_now >= p_since + make_interval(days => p_grace) then 'refuse'
    when p_since is null and p_last_grace is not null and p_now < p_last_grace + make_interval(days => p_grace) then 'over'
    when p_since is null and p_last_grace is not null and p_now < p_last_grace + make_interval(days => p_every) then 'refuse'
    else 'over'
  end
$$;
revoke execute on function workspace_limit_rule(int, int, timestamptz, timestamptz, timestamptz, int, int) from public, anon, authenticated;
grant execute on function workspace_limit_rule(int, int, timestamptz, timestamptz, timestamptz, int, int) to service_role;

create or replace function workspace_limit_settle(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_last timestamptz;
begin
  perform 1 from workspaces where id = p_workspace for update;
  select metrics into v_limit from workspace_limit_of(p_workspace);
  if v_limit is not null and workspace_metric_count(p_workspace) > v_limit then
    select last_grace_started_at into v_last from workspaces where id = p_workspace;
    if v_last is not null and now() < v_last + make_interval(days => greatest(workspace_grace_days(), workspace_grace_every_days())) then
      update workspaces set over_limit_since = v_last where id = p_workspace and over_limit_since is null;
    else
      update workspaces set over_limit_since = now(), last_grace_started_at = now() where id = p_workspace and over_limit_since is null;
    end if;
  else
    update workspaces set over_limit_since = null where id = p_workspace and over_limit_since is not null;
  end if;
end $$;

create or replace function metrics_within_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_since timestamptz;
  v_last timestamptz;
  v_count int;
  v_rule text;
begin
  if tg_op = 'UPDATE' and not (old.archived_at is not null and new.archived_at is null)
    and new.workspace_id is not distinct from old.workspace_id then return new; end if;
  if new.archived_at is not null then return new; end if;
  select over_limit_since, last_grace_started_at into v_since, v_last from workspaces where id = new.workspace_id for update;
  select metrics into v_limit from workspace_limit_of(new.workspace_id);
  if v_limit is null then return new; end if;
  v_count := workspace_metric_count(new.workspace_id);
  v_rule := workspace_limit_rule(v_count, v_limit, v_since, now(), v_last, workspace_grace_days(), workspace_grace_every_days());
  if v_rule = 'refuse' then
    raise exception using errcode = 'ZF441', message = 'workspace_limit', detail = v_count::text || '/' || v_limit::text;
  end if;
  if v_rule = 'over' and v_since is null then
    if v_last is not null and now() < v_last + make_interval(days => workspace_grace_days()) then
      update workspaces set over_limit_since = v_last where id = new.workspace_id;
    else
      update workspaces set over_limit_since = now(), last_grace_started_at = now() where id = new.workspace_id;
    end if;
  end if;
  return new;
end $$;
