-- Workspace Limits: at most one 14-day grace per 90 days (spec 0029, ticket #457). Archiving down and bringing the
-- Metrics back used to clear over_limit_since and renew the 14 days over the limit every time. workspaces.
-- last_grace_started_at remembers when a grace last started and is never cleared; a Workspace that goes over its limit
-- again within 90 days of it gets no new grace (only what is left of the 14 days, if it archived down during them): new
-- Metrics, and Archived Metrics brought back, are refused at once.
-- Archiving down still works. The trigger covers every way in (app, API, MCP Server, Feeds, Packs, paste).
alter table workspaces add column last_grace_started_at timestamptz;

-- Workspaces already over their limit have a grace running: it counts as the last one.
update workspaces set last_grace_started_at = over_limit_since where over_limit_since is not null;

-- The rule with the last grace added (the same as workspace-limits.ts; a test runs both).
drop function workspace_limit_rule(int, int, timestamptz, timestamptz);
create or replace function workspace_limit_rule(p_count int, p_limit int, p_since timestamptz, p_now timestamptz, p_last_grace timestamptz)
returns text language sql immutable as $$
  select case
    when p_limit is null or p_count + 1 <= p_limit then 'allow'
    when p_count + 1 > workspace_limit_room(p_limit) then 'refuse'
    when p_since is not null and p_now >= p_since + interval '14 days' then 'refuse'
    -- Archived down during the grace and over again before its 14 days ran out: the rest of that grace, not a new one.
    when p_since is null and p_last_grace is not null and p_now < p_last_grace + interval '14 days' then 'over'
    when p_since is null and p_last_grace is not null and p_now < p_last_grace + interval '2160 hours' then 'refuse'
    else 'over'
  end
$$;

-- Sets or clears over_limit_since by the count and limit now. Going over starts a grace (and records it) unless the
-- last one started less than 90 days ago: then the Workspace shares that grace's start, whose days are used up or
-- running out, and no new one begins.
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
    if v_last is not null and now() < v_last + interval '2160 hours' then
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
  v_rule := workspace_limit_rule(v_count, v_limit, v_since, now(), v_last);
  if v_rule = 'refuse' then
    raise exception using errcode = 'ZF441', message = 'workspace_limit', detail = v_count::text || '/' || v_limit::text;
  end if;
  if v_rule = 'over' and v_since is null then
    if v_last is not null and now() < v_last + interval '14 days' then
      update workspaces set over_limit_since = v_last where id = new.workspace_id;
    else
      update workspaces set over_limit_since = now(), last_grace_started_at = now() where id = new.workspace_id;
    end if;
  end if;
  return new;
end $$;

revoke execute on function workspace_limit_rule(int, int, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function workspace_limit_rule(int, int, timestamptz, timestamptz, timestamptz) to service_role;
