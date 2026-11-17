-- What a Trial Workspace really sends (spec 0021, ADR 0010): at most a set number of messages a day over all its
-- Connectors together. Each real send takes a row here first, under a lock on the workspace, so sends at once over
-- email, Slack and Telegram cannot pass the limit between them. Rows go with the Delivery or the workspace.
create table trial_sends (
  delivery_id bigint primary key references deliveries (id) on delete cascade,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index trial_sends_workspace_sent on trial_sends (workspace_id, sent_at);
alter table trial_sends enable row level security;

-- Takes the day's slot for one queued Delivery: 'ok' (also outside a trial, and again for a Delivery that took its
-- slot already, such as one retried after its Connector made it wait), 'wait' (the day's limit is reached; it is
-- tried again in an hour) or 'gone' (no such queued Delivery).
create or replace function claim_trial_send(p_id bigint, p_per_day int)
returns text language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if p_per_day is null or p_per_day < 1 then raise exception 'trial limit out of range'; end if;
  select d.workspace_id into ws from deliveries d join workspaces w on w.id = d.workspace_id
    where d.id = p_id and d.mail_state = 'queued' and w.trial_ends_at is not null;
  if not found then
    return case when exists (select 1 from deliveries where id = p_id and mail_state = 'queued') then 'ok' else 'gone' end;
  end if;
  perform pg_advisory_xact_lock(hashtext('trial-sends:' || ws::text));
  if exists (select 1 from trial_sends where delivery_id = p_id) then return 'ok'; end if;
  if (select count(*) from trial_sends where workspace_id = ws and sent_at > now() - interval '24 hours') >= p_per_day then
    update deliveries set not_before = now() + interval '1 hour' where id = p_id;
    return 'wait';
  end if;
  insert into trial_sends (delivery_id, workspace_id) values (p_id, ws);
  return 'ok';
end $$;

revoke execute on function claim_trial_send(bigint, int) from public, anon, authenticated;
grant execute on function claim_trial_send(bigint, int) to service_role;

-- A Trial Workspace holds at most 25 Metrics (spec 0021). Kept here like the per-key cap: the trigger takes the
-- workspace's row lock first, so parallel creations wait for each other and cannot all pass the count.
create or replace function metrics_per_trial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from workspaces where id = new.workspace_id and trial_ends_at is not null for update;
  if not found then return new; end if;
  if (select count(*) from metrics where workspace_id = new.workspace_id) >= 25 then
    raise exception using errcode = 'ZF430', message = 'metrics_per_trial';
  end if;
  return new;
end $$;

create trigger metrics_per_trial before insert on metrics
  for each row execute function metrics_per_trial();
