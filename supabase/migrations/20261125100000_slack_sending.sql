-- Sending by Slack (spec 0007, ticket #103; GLOSSARY: Delivery, Connector). A Slack Delivery uses the queue email
-- has: mail_state is now the sending state of every real Connector, with the same attempts and waits. A sent one
-- keeps its direct message's channel and ts, so a reply in its thread finds it again.
alter table deliveries add column if not exists slack_channel text check (slack_channel ~ '^[A-Z0-9]{3,24}$');
alter table deliveries add column if not exists slack_ts text check (slack_ts ~ '^[0-9]{1,12}\.[0-9]{1,8}$');
create unique index if not exists deliveries_slack_message on deliveries (slack_channel, slack_ts) where slack_ts is not null;

-- Every Slack message that goes out is a row here, so a send is claimed within limits under locks on the workspace,
-- the recipient (a Slack user of one Slack workspace), the person who caused it and the Slack workspace as a whole,
-- whose limit keeps Ziffr below chat.postMessage's own.
create table if not exists slack_sends (
  id bigint generated always as identity primary key,
  delivery_id bigint references deliveries(id) on delete set null,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  team_id text not null check (char_length(team_id) <= 24),
  recipient_key text not null check (char_length(recipient_key) <= 60),
  sender_id text references profiles(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists slack_sends_workspace on slack_sends (workspace_id, sent_at);
create index if not exists slack_sends_team on slack_sends (team_id, sent_at);
create index if not exists slack_sends_recipient on slack_sends (recipient_key, sent_at);
create index if not exists slack_sends_sender on slack_sends (sender_id, sent_at);
alter table slack_sends enable row level security;

-- Someone who stopped Prompts and reminders on Slack (a button in each one) gets none from that workspace any more;
-- questions, tasks and replies in their Threads keep coming. Email has its own (email_opt_outs).
create table if not exists slack_opt_outs (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  opted_out_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);
alter table slack_opt_outs enable row level security;

-- 'ok' when claimed (and counted); 'wait' when a limit is reached (not_before set, attempts untouched); 'gone' when it
-- is not a queued Slack Delivery any more.
create or replace function claim_slack_send(p_id bigint, p_team_id text, p_recipient text, p_per_workspace int, p_per_recipient int, p_per_sender int, p_per_team_minute int, p_max_attempts int)
returns text language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if p_team_id is null or p_recipient is null then return 'gone'; end if;
  select id, workspace_id, sender_id into d from deliveries where id = p_id and connector = 'slack' and mail_state = 'queued' and attempts < p_max_attempts;
  if not found then return 'gone'; end if;
  perform pg_advisory_xact_lock(hashtext('slack-workspace:' || d.workspace_id::text));
  perform pg_advisory_xact_lock(hashtext('slack-team:' || p_team_id));
  perform pg_advisory_xact_lock(hashtext('slack-recipient:' || p_recipient));
  if d.sender_id is not null then perform pg_advisory_xact_lock(hashtext('slack-sender:' || d.sender_id)); end if;
  if (select count(*) from slack_sends where workspace_id = d.workspace_id and sent_at > now() - interval '24 hours') >= p_per_workspace
     or (select count(*) from slack_sends where team_id = p_team_id and sent_at > now() - interval '1 minute') >= p_per_team_minute
     or (select count(*) from slack_sends where recipient_key = p_recipient and sent_at > now() - interval '1 hour') >= p_per_recipient
     or (d.sender_id is not null and (select count(*) from slack_sends where sender_id = d.sender_id and sent_at > now() - interval '24 hours') >= p_per_sender) then
    -- The Slack workspace's minute passes soon; the other limits are waited out like email's.
    update deliveries set not_before = now() + case when (select count(*) from slack_sends where team_id = p_team_id and sent_at > now() - interval '1 minute') >= p_per_team_minute then interval '1 minute' else interval '10 minutes' end where id = d.id;
    return 'wait';
  end if;
  update deliveries set mail_state = 'sending', last_attempt_at = now(), not_before = null where id = d.id and mail_state = 'queued';
  if not found then return 'gone'; end if;
  insert into slack_sends (delivery_id, workspace_id, team_id, recipient_key, sender_id) values (d.id, d.workspace_id, p_team_id, p_recipient, d.sender_id);
  return 'ok';
end $$;
revoke execute on function claim_slack_send(bigint, text, text, int, int, int, int, int) from public, anon, authenticated;
grant execute on function claim_slack_send(bigint, text, text, int, int, int, int, int) to service_role;

-- The queued Deliveries of one Connector that the job sends next, chosen as due_deliveries always chose email's.
create or replace function due_deliveries_via(p_connector text, p_limit int, p_max_attempts int)
returns setof bigint language sql stable security definer set search_path = public as $$
  select id from deliveries
  where mail_state = 'queued' and connector = p_connector and attempts < p_max_attempts
    and (not_before is null or not_before <= now())
    and (last_attempt_at is null or attempts = 0 or last_attempt_at <= now() - make_interval(mins => power(2, attempts - 1)::int))
  order by id
  limit least(greatest(p_limit, 1), 500)
$$;
revoke execute on function due_deliveries_via(text, int, int) from public, anon, authenticated;
grant execute on function due_deliveries_via(text, int, int) to service_role;

-- Email's job keeps choosing email only: Slack ones in the queue must never be sent as email.
create or replace function due_deliveries(p_limit int, p_max_attempts int)
returns setof bigint language sql stable security definer set search_path = public as $$
  select due_deliveries_via('email', p_limit, p_max_attempts)
$$;
