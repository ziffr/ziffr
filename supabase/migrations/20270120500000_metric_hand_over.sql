-- Handing a Metric over (GLOSSARY: Metric Owner, Share, Guest): in one step under a lock on the new owner's
-- membership, the Metric changes owner, the new owner's own Share on it goes (they need none), the old owner stays on
-- as Editor (never downgraded), and the open Questions that were waiting on the old owner as the Metric's owner go to
-- the new one (only escalations: an Approval is a Task, for the Workflow's approvers). The database also refuses what must never be: a Guest who owns a Metric, an owner who is not a member.
-- The person who took the Metric for themselves by their role (an Owner or Admin), or null: the round trip then leaves
-- them no Editor Share. "Took it by role" is `owner_taken_by = owner_id`, so a value left behind when another path
-- (an import, a later feature) changes the owner never matches the new owner. Set in the same step as the owner; never
-- read from the Audit Log. Nothing to backfill: hand-overs, and so Metrics taken this way, exist only from here on.
alter table metrics add column owner_taken_by text;

create or replace function hand_over_metric(ws uuid, metric int, old_owner text, new_owner text, keep_old boolean, drop_new boolean, took boolean)
returns table (action_id int, period date)
language plpgsql
security definer
set search_path = public
as $$
declare new_role text;
begin
  select role into new_role from memberships where workspace_id = ws and user_id = new_owner for share;
  if new_role is null or new_role = 'guest' then raise exception 'the new owner must be a member who can own things'; end if;
  update metrics set owner_id = new_owner, owner_taken_by = case when took then new_owner else null end where id = metric and workspace_id = ws and owner_id = old_owner;
  if not found then raise exception 'the metric changed hands meanwhile'; end if;
  if drop_new then
    delete from shares where workspace_id = ws and object_type = 'metric' and object_id = metric and user_id = new_owner;
  end if;
  if keep_old then
    insert into shares (workspace_id, object_type, object_id, user_id, role) values (ws, 'metric', metric, old_owner, 'editor')
      on conflict (object_type, object_id, user_id) do update set role = 'editor';
  end if;
  return query
    update actions a set assignee_id = new_owner
      where a.workspace_id = ws and a.metric_id = metric and a.assignee_id = old_owner and a.kind = 'question'
        and a.purpose = 'escalation' and a.status in ('open', 'answered')
      returning a.id, a.period_start;
end $$;
revoke execute on function hand_over_metric(uuid, int, text, text, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function hand_over_metric(uuid, int, text, text, boolean, boolean, boolean) to service_role;

-- A person who owns a Metric cannot become a Guest.
create or replace function memberships_guest_owns_nothing() returns trigger language plpgsql as $$
begin
  if new.role = 'guest' and old.role <> 'guest' and exists (select 1 from metrics where workspace_id = new.workspace_id and owner_id = new.user_id) then
    raise exception 'a Guest cannot own a Metric: hand over their Metrics first';
  end if;
  return new;
end $$;
create trigger memberships_guest_owns_nothing before update of role on memberships for each row execute function memberships_guest_owns_nothing();

-- A Metric's owner, when set or changed, is a member of its Workspace who is not a Guest.
create or replace function metrics_owner_is_member() returns trigger language plpgsql as $$
declare found_role text;
begin
  -- The demo's own seed builds its made-up company in its own order, under its own guard (ziffr.demo_seed).
  if current_setting('ziffr.demo_seed', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then return new; end if;
  -- Under a share lock on the owner's membership, so a role change to Guest, which updates that row, waits for this
  -- write (and the other way round): every writer of owner_id, the removal's hand_over too, meets setRole.
  select role into found_role from memberships where workspace_id = new.workspace_id and user_id = new.owner_id and role <> 'guest' for share;
  if found_role is null then raise exception 'a Metric''s owner must be a member who is not a Guest'; end if;
  return new;
end $$;
create trigger metrics_owner_is_member before insert or update of owner_id on metrics for each row execute function metrics_owner_is_member();

-- The removal's handover knows who acts, to remember a Metric taken for oneself.
drop function if exists hand_over(uuid, text, text, text);
create or replace function hand_over(ws uuid, leaving text, successor text, actor_role text, actor_id text default null) returns void
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
  -- Taking the Metrics for oneself by one's role is remembered on them, in this same step.
  update metrics set owner_id = successor, owner_taken_by = case when successor = actor_id then successor else null end where workspace_id = ws and owner_id = leaving;
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
revoke execute on function hand_over(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function hand_over(uuid, text, text, text, text) to service_role;
