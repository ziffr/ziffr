-- Handover, corrected after review (GLOSSARY: Workspace Role, View Link, Workflow). The acting role is checked in
-- the same step as the handover; approvers keep their order; View Links the person made, threads they asked, stand-in
-- Tokens for them and the workspace's open invite links all end or move, so a removed person neither sees current
-- numbers nor rejoins by an old link.
drop function if exists hand_over(uuid, text, text);

create or replace function hand_over(ws uuid, leaving text, successor text, actor_role text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare leaving_role text;
begin
  if leaving = successor then raise exception 'the successor must be someone else'; end if;
  select role into leaving_role from memberships where workspace_id = ws and user_id = leaving for update;
  if leaving_role is null then raise exception 'not a member'; end if;
  if leaving_role = 'owner' and actor_role <> 'owner' then raise exception 'only Owners remove an Owner'; end if;
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
  -- Approvals the person would have given go to the successor, in the same place in the order; an approver who is
  -- then named twice keeps their first place.
  update workflows w set config = jsonb_set(w.config, '{steps}', (
      select coalesce(jsonb_agg(
        case when s.step->>'type' = 'approve' then jsonb_set(s.step, '{approvers}', (
          select coalesce(jsonb_agg(x.who order by x.first), '[]'::jsonb)
          from (
            select a.who, min(a.ord) as first
            from (
              select case when e.val = to_jsonb(leaving) then to_jsonb(successor) else e.val end as who, e.ord
              from jsonb_array_elements(coalesce(s.step->'approvers', '[]'::jsonb)) with ordinality as e(val, ord)
            ) a group by a.who
          ) x))
        else s.step end order by s.n), '[]'::jsonb)
      from jsonb_array_elements(w.config->'steps') with ordinality as s(step, n)))
    where w.workspace_id = ws and jsonb_path_exists(w.config, '$.steps[*].approvers[*] ? (@ == $p)', jsonb_build_object('p', leaving));
  -- Open work waiting on them, and threads they asked, go to the successor.
  update actions set assignee_id = successor where workspace_id = ws and assignee_id = leaving and status in ('open', 'answered');
  update actions set asker_id = successor where workspace_id = ws and asker_id = leaving and status in ('open', 'answered');
  -- What let them act or see ends.
  delete from tokens where workspace_id = ws and (submitter_id = leaving or stands_in_for = leaving);
  update tokens set stand_in_id = null where workspace_id = ws and stand_in_id = leaving;
  delete from shares where workspace_id = ws and user_id = leaving;
  delete from group_members where workspace_id = ws and user_id = leaving;
  delete from analysis_canvas where workspace_id = ws and user_id = leaving;
  delete from delivery_preferences where workspace_id = ws and user_id = leaving;
  update access_keys set revoked_at = now() where workspace_id = ws and created_by = leaving and revoked_at is null;
  update view_links set revoked_at = now() where workspace_id = ws and created_by = leaving and revoked_at is null;
  -- Their own open invitations, and every open invite link of the workspace: a link they kept must not let them back.
  update invitations set revoked_at = now() where workspace_id = ws and revoked_at is null and accepted_at is null and (created_by = leaving or email is null);
  delete from memberships where workspace_id = ws and user_id = leaving;
end $$;
revoke execute on function hand_over(uuid, text, text, text) from public, anon, authenticated;
grant execute on function hand_over(uuid, text, text, text) to service_role;
