-- Handover when someone leaves (GLOSSARY: Workspace Role, Access Key, Stand-in): in one step, everything the person
-- owns in the Workspace passes to a successor, their open work goes along, and what let them act ends: Tokens,
-- stand-in roles, Shares, Group memberships, Access Keys and finally the membership. Nothing is deleted that others
-- built on; values and threads keep their author. Only the core calls this, after its checks.
create or replace function hand_over(ws uuid, leaving text, successor text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if leaving = successor then raise exception 'the successor must be someone else'; end if;
  if not exists (select 1 from memberships where workspace_id = ws and user_id = successor and role <> 'guest') then
    raise exception 'the successor must be a member who can own things';
  end if;
  update metrics set owner_id = successor where workspace_id = ws and owner_id = leaving;
  update dashboards set owner_id = successor where workspace_id = ws and owner_id = leaving;
  update widgets set owner_id = successor where workspace_id = ws and owner_id = leaving;
  update decks set owner_id = successor where workspace_id = ws and owner_id = leaving;
  update team_templates set owner_id = successor where workspace_id = ws and owner_id = leaving;
  update themes set owner_id = successor where workspace_id = ws and owner_id = leaving;
  update workflows set owner_id = successor where workspace_id = ws and owner_id = leaving;
  -- Approvals the person would have given now go to the successor.
  update workflows set config = jsonb_set(config, '{steps}', (
      select coalesce(jsonb_agg(case when s->>'type' = 'approve'
        then jsonb_set(s, '{approvers}', (select coalesce(jsonb_agg(distinct case when a = to_jsonb(leaving) then to_jsonb(successor) else a end), '[]'::jsonb) from jsonb_array_elements(s->'approvers') a))
        else s end), '[]'::jsonb)
      from jsonb_array_elements(config->'steps') s))
    where workspace_id = ws and config::text like '%' || leaving || '%';
  -- Open questions and tasks waiting on them go to the successor.
  update actions set assignee_id = successor where workspace_id = ws and assignee_id = leaving and status in ('open', 'answered');
  -- What let them act ends.
  delete from tokens where workspace_id = ws and submitter_id = leaving;
  update tokens set stand_in_id = null where workspace_id = ws and stand_in_id = leaving;
  delete from shares where workspace_id = ws and user_id = leaving;
  delete from group_members where workspace_id = ws and user_id = leaving;
  delete from analysis_canvas where workspace_id = ws and user_id = leaving;
  delete from delivery_preferences where workspace_id = ws and user_id = leaving;
  update access_keys set revoked_at = now() where workspace_id = ws and created_by = leaving and revoked_at is null;
  update invitations set revoked_at = now() where workspace_id = ws and created_by = leaving and revoked_at is null and accepted_at is null;
  delete from memberships where workspace_id = ws and user_id = leaving;
end $$;
revoke execute on function hand_over(uuid, text, text) from public, anon, authenticated;
grant execute on function hand_over(uuid, text, text) to service_role;
