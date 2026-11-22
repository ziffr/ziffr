-- Handing a Metric over (GLOSSARY: Metric Owner, Share, Guest): in one step under a lock on the new owner's
-- membership, the Metric changes owner, the new owner's own Share on it goes (they need none), the old owner stays on
-- as Editor (never downgraded), and the open Questions that were waiting on the old owner as the Metric's owner go to
-- the new one (only escalations: an Approval is a Task, for the Workflow's approvers). The database also refuses what must never be: a Guest who owns a Metric, an owner who is not a member.
create or replace function hand_over_metric(ws uuid, metric int, old_owner text, new_owner text, keep_old boolean, drop_new boolean)
returns table (action_id int, period date)
language plpgsql
security definer
set search_path = public
as $$
declare new_role text;
begin
  select role into new_role from memberships where workspace_id = ws and user_id = new_owner for share;
  if new_role is null or new_role = 'guest' then raise exception 'the new owner must be a member who can own things'; end if;
  update metrics set owner_id = new_owner where id = metric and workspace_id = ws and owner_id = old_owner;
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
revoke execute on function hand_over_metric(uuid, int, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function hand_over_metric(uuid, int, text, text, boolean, boolean) to service_role;

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
