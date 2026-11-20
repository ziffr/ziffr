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

revoke execute on function claim_limit_notice(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function claim_limit_notice(uuid, text, timestamptz) to service_role;
