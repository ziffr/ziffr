-- The emails to Owners about the Workspace Limit (spec 0029, ticket #266): one when the 14 days over the limit start,
-- one when they end. Each column holds the over_limit_since it was sent for, so each goes once per time over, and a
-- Workspace that goes back under and over again is told again.
alter table workspaces
  add column limit_started_told timestamptz,
  add column limit_ended_told timestamptz;

-- Claims one notice for one time over: true for the one call that may send it, false for every other.
create or replace function claim_limit_notice(p_workspace uuid, p_kind text, p_since timestamptz) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_kind = 'started' then
    update workspaces set limit_started_told = p_since
      where id = p_workspace and over_limit_since = p_since and limit_started_told is distinct from p_since returning id into v_id;
  elsif p_kind = 'ended' then
    update workspaces set limit_ended_told = p_since
      where id = p_workspace and over_limit_since = p_since and limit_ended_told is distinct from p_since returning id into v_id;
  end if;
  return v_id is not null;
end $$;

-- The notices due now, oldest time over first, at most p_limit: 'started' for a Workspace not told for this time over,
-- 'ended' once its days are over and it was not told that. One whose days ended before it was told they started is
-- marked as told about the start and gets only 'ended'.
create or replace function limit_notices_due(p_now timestamptz, p_grace_days int, p_limit int)
returns table (workspace_id uuid, kind text, since timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  update workspaces w set limit_started_told = w.over_limit_since
    where w.over_limit_since is not null and w.limit_started_told is distinct from w.over_limit_since
      and p_now >= w.over_limit_since + make_interval(days => p_grace_days);
  return query
    select w.id, case when w.limit_started_told is distinct from w.over_limit_since then 'started' else 'ended' end, w.over_limit_since
    from workspaces w
    where w.over_limit_since is not null and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
      and (w.limit_started_told is distinct from w.over_limit_since
        or (p_now >= w.over_limit_since + make_interval(days => p_grace_days) and w.limit_ended_told is distinct from w.over_limit_since))
    order by w.over_limit_since, w.id
    limit greatest(1, least(p_limit, 1000));
end $$;

revoke execute on function claim_limit_notice(uuid, text, timestamptz), limit_notices_due(timestamptz, int, int) from public, anon, authenticated;
grant execute on function claim_limit_notice(uuid, text, timestamptz), limit_notices_due(timestamptz, int, int) to service_role;
