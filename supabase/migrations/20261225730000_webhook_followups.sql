-- Follow-ups to the Webhook sends (ticket #430, spec 0034; GLOSSARY: Webhook, Action). Service role only.
--
-- 1. An Action's state changes only through change_action_status, which the core's changeActionState calls: a trigger
--    refuses any other change of `actions.status`, so no channel, script or later migration can change an Action
--    without telling the Webhooks (the grep test in the core stays as the early warning).
create or replace function guard_action_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status and coalesce(current_setting('ziffr.action_state_writer', true), '') <> 'on' then
    raise exception 'An Action''s state changes only through change_action_status.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger actions_status_guard before update of status on actions for each row execute function guard_action_status();

-- The one writer: the change applies only while the row is still as the caller read it, so two calls at once change it
-- once. The setting is local to this transaction and cleared again before the function returns.
create or replace function change_action_status(p_workspace uuid, p_id int, p_from text, p_to text, p_asker text, p_assignee text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('ziffr.action_state_writer', 'on', true);
  update actions set status = p_to, updated_at = now()
    where id = p_id and workspace_id = p_workspace and status = p_from and asker_id = p_asker and assignee_id = p_assignee;
  get diagnostics n = row_count;
  perform set_config('ziffr.action_state_writer', '', true);
  return n = 1;
end $$;
revoke execute on function change_action_status(uuid, int, text, text, text, text) from public, anon, authenticated;
grant execute on function change_action_status(uuid, int, text, text, text, text) to service_role;

-- 2. The daily cap of sends per Workspace is one atomic claim of a slot, so runs at the same moment cannot pass it together.
create table webhook_send_days (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (workspace_id, day)
);
alter table webhook_send_days enable row level security;
select attach_demo_guard('webhook_send_days');

-- Takes one slot of today's (UTC) cap; true only when there was one left.
create or replace function take_webhook_send_slot(p_workspace uuid, p_cap int) returns boolean
language plpgsql security definer set search_path = public as $$
declare got int;
begin
  insert into webhook_send_days (workspace_id, day, n) values (p_workspace, (now() at time zone 'utc')::date, 1)
  on conflict (workspace_id, day) do update set n = webhook_send_days.n + 1 where webhook_send_days.n < p_cap
  returning n into got;
  return got is not null;
end $$;
revoke execute on function take_webhook_send_slot(uuid, int) from public, anon, authenticated;
grant execute on function take_webhook_send_slot(uuid, int) to service_role;

-- 3. Takes the queued sends of one Workspace (of one Metric when given) at once, for the moment before a Metric or a
--    Workspace is deleted: its sends would go with it, so they are sent first.
create or replace function claim_webhook_sends_for(p_workspace uuid, p_metric int, p_limit int) returns setof webhook_sends
language sql security definer set search_path = public as $$
  update webhook_sends s set state = 'sending', claimed_at = now()
  where s.id in (
    select id from webhook_sends
    where workspace_id = p_workspace and state = 'queued' and next_attempt_at <= now() and (p_metric is null or metric_id = p_metric)
    order by created_at limit p_limit for update skip locked)
  returning s.*;
$$;
revoke execute on function claim_webhook_sends_for(uuid, int, int) from public, anon, authenticated;
grant execute on function claim_webhook_sends_for(uuid, int, int) to service_role;
