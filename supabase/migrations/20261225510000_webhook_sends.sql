-- Sends to Webhooks (spec 0034, ticket #400; GLOSSARY: Webhook): one row per Webhook that chose an event, written by the
-- core's change after the change itself succeeded. The row holds the inputs as ids (the message is built at send time,
-- so who may hear it is judged then) and never a word of the Workspace: the reply's text is read from its Thread
-- message when the message is built. It is also the log the Webhook's page shows, kept 14 days. Service role only.
alter table webhooks
  add column failing_since timestamptz,
  add column failure_count int not null default 0;

create table webhook_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  webhook_id uuid not null references webhooks(id) on delete cascade,
  type text not null check (type in ('ping', 'action.created', 'action.updated', 'action.answered', 'action.done', 'value.recorded', 'value.unusual', 'alert.fired')),
  action_id int references actions(id) on delete cascade,
  thread_message_id int,
  metric_id int references metrics(id) on delete cascade,
  period_start date,
  -- Where the change came from; the Webhook's id only for 'webhook' (so its recipe can ignore its own echo).
  source_type text not null check (source_type in ('app', 'api', 'mcp', 'email', 'slack', 'telegram', 'web_form', 'ticket_system', 'workflow', 'system', 'webhook')),
  source_webhook_id uuid,
  reason text check (reason in ('done', 'answered', 'closed', 'metric_archived', 'metric_deleted', 'assignee_left', 'workspace_closing')),
  state text not null default 'queued' check (state in ('queued', 'sending', 'retrying', 'delivered', 'failed', 'dropped')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  status_code int,
  -- A short word from a fixed list (timeout, network, refused, too_big...), never an answer body or an address.
  failure text check (char_length(failure) <= 40),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_attempt_at timestamptz,
  delivered_at timestamptz
);
create index webhook_sends_due_idx on webhook_sends (next_attempt_at) where state in ('queued', 'retrying', 'sending');
create index webhook_sends_log_idx on webhook_sends (webhook_id, created_at desc);
create index webhook_sends_day_idx on webhook_sends (workspace_id, last_attempt_at);
alter table webhook_sends enable row level security;
select attach_demo_guard('webhook_sends');

-- Takes the sends that are due, each by one conditional update, so two runs of the job never send one twice. A send
-- still 'sending' after five minutes belongs to a run that died, and is taken again (at least once; its id is the same).
create or replace function claim_webhook_sends(p_limit int) returns setof webhook_sends
language sql security definer set search_path = public as $$
  update webhook_sends s set state = 'sending', claimed_at = now()
  where s.id in (
    select id from webhook_sends
    where (state in ('queued', 'retrying') and next_attempt_at <= now()) or (state = 'sending' and claimed_at < now() - interval '5 minutes')
    order by next_attempt_at limit p_limit for update skip locked)
  returning s.*;
$$;
revoke execute on function claim_webhook_sends(int) from public, anon, authenticated;
grant execute on function claim_webhook_sends(int) to service_role;

-- Notes a failed attempt on a Webhook and switches it off when it keeps failing: p_max sends failed in a row, or the
-- first failure is older than p_days with no success since. Returns true only for the call that switched it off, so
-- the Owners hear once. Queued sends are dropped with it.
create or replace function note_webhook_failure(p_id uuid, p_final boolean, p_max int, p_days int) returns boolean
language plpgsql security definer set search_path = public as $$
declare w webhooks%rowtype;
begin
  select * into w from webhooks where id = p_id for update;
  if not found then return false; end if;
  update webhooks set failing_since = coalesce(failing_since, now()), failure_count = failure_count + (case when p_final then 1 else 0 end) where id = p_id returning * into w;
  if w.disabled_at is null and (w.failure_count >= p_max or w.failing_since < now() - make_interval(days => p_days)) then
    update webhooks set disabled_at = now(), disabled_reason = 'failing', updated_at = now() where id = p_id;
    update webhook_sends set state = 'dropped' where webhook_id = p_id and state in ('queued', 'retrying');
    return true;
  end if;
  return false;
end $$;
revoke execute on function note_webhook_failure(uuid, boolean, int, int) from public, anon, authenticated;
grant execute on function note_webhook_failure(uuid, boolean, int, int) to service_role;

-- A 410 Gone says the address is meant to be gone: the Webhook is switched off, once, with its queued sends dropped.
-- Returns true only for the call that switched it off.
create or replace function switch_off_webhook_gone(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update webhooks set disabled_at = now(), disabled_reason = 'gone', updated_at = now() where id = p_id and disabled_at is null;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update webhook_sends set state = 'dropped' where webhook_id = p_id and state in ('queued', 'retrying');
  return true;
end $$;
revoke execute on function switch_off_webhook_gone(uuid) from public, anon, authenticated;
grant execute on function switch_off_webhook_gone(uuid) to service_role;
