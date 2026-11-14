-- Claiming a workspace's day for its Workflow run (spec 0005, ticket #86): only a day later than every day it has
-- claimed. Changing the time zone could otherwise make "today" yesterday or tomorrow and run a day early, late or
-- twice; days now only move forward. Under a lock on the workspace, so two claims at once cannot both pass.
create or replace function claim_workflow_day(p_workspace uuid, p_day date, p_trigger text)
returns bigint language plpgsql security definer set search_path = public as $$
declare run_id bigint;
begin
  if p_trigger not in ('schedule', 'manual') then return null; end if;
  perform pg_advisory_xact_lock(hashtext('workflow-day:' || p_workspace::text));
  if exists (select 1 from workflow_runs where workspace_id = p_workspace and day >= p_day) then return null; end if;
  insert into workflow_runs (workspace_id, day, trigger) values (p_workspace, p_day, p_trigger) returning id into run_id;
  return run_id;
end $$;
revoke execute on function claim_workflow_day(uuid, date, text) from public, anon, authenticated;
grant execute on function claim_workflow_day(uuid, date, text) to service_role;
