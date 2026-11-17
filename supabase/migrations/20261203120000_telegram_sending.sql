-- Sending by Telegram (spec 0016, ticket #26; GLOSSARY: Delivery, Connector, Source). Telegram becomes a Connector
-- Deliveries and Delivery Preferences may name. A Telegram Delivery uses the queue every real Connector uses
-- (mail_state, attempts, waits); a sent one keeps its chat and message id, so a reply to it finds it again.
alter table deliveries drop constraint if exists deliveries_connector_check;
alter table deliveries add constraint deliveries_connector_check check (connector in ('slack','email','whatsapp','tickets','telegram'));
alter table delivery_preferences drop constraint if exists delivery_preferences_connector_check;
alter table delivery_preferences add constraint delivery_preferences_connector_check check (connector in ('slack','email','whatsapp','tickets','telegram'));

alter table deliveries add column if not exists telegram_chat_id bigint check (telegram_chat_id > 0);
alter table deliveries add column if not exists telegram_message_id bigint check (telegram_message_id > 0);
create unique index if not exists deliveries_telegram_message on deliveries (telegram_chat_id, telegram_message_id) where telegram_message_id is not null;

-- Answers by Telegram arrive as the Source "telegram". A Metric that already takes answers by Slack or email takes them
-- by Telegram too, as a reply in a messenger proves as much as one by email; one kept to the web form or the API stays.
update metrics set sources = array_append(sources, 'telegram')
where ('slack' = any(sources) or 'mail' = any(sources)) and not ('telegram' = any(sources));

-- Every Telegram message that goes out is a row here, so a send is claimed within limits under locks on the workspace,
-- the chat, the person who caused it and the bot as a whole, below Telegram's own limits (about one message a second
-- per chat, thirty a second per bot).
create table if not exists telegram_sends (
  id bigint generated always as identity primary key,
  delivery_id bigint references deliveries(id) on delete set null,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  chat_id bigint not null,
  sender_id text references profiles(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists telegram_sends_workspace on telegram_sends (workspace_id, sent_at);
create index if not exists telegram_sends_chat on telegram_sends (chat_id, sent_at);
create index if not exists telegram_sends_sender on telegram_sends (sender_id, sent_at);
create index if not exists telegram_sends_sent on telegram_sends (sent_at);
alter table telegram_sends enable row level security;

-- 'ok' when claimed (and counted); 'wait' when a limit is reached (not_before set, attempts untouched); 'gone' when it
-- is not a queued Telegram Delivery any more.
create or replace function claim_telegram_send(p_id bigint, p_chat bigint, p_per_workspace int, p_per_recipient int, p_per_sender int, p_per_bot_second int, p_max_attempts int)
returns text language plpgsql security definer set search_path = public as $$
declare d record;
declare wait interval;
begin
  if p_chat is null then return 'gone'; end if;
  select id, workspace_id, sender_id into d from deliveries where id = p_id and connector = 'telegram' and mail_state = 'queued' and attempts < p_max_attempts;
  if not found then return 'gone'; end if;
  perform pg_advisory_xact_lock(hashtext('telegram-workspace:' || d.workspace_id::text));
  perform pg_advisory_xact_lock(hashtext('telegram-chat:' || p_chat::text));
  perform pg_advisory_xact_lock(hashtext('telegram-bot'));
  if d.sender_id is not null then perform pg_advisory_xact_lock(hashtext('telegram-sender:' || d.sender_id)); end if;
  wait := case
    when (select count(*) from telegram_sends where sent_at > now() - interval '1 second') >= p_per_bot_second then interval '2 seconds'
    when (select count(*) from telegram_sends where chat_id = p_chat and sent_at > now() - interval '1 second') >= 1 then interval '2 seconds'
    when (select count(*) from telegram_sends where chat_id = p_chat and sent_at > now() - interval '1 hour') >= p_per_recipient then interval '15 minutes'
    when (select count(*) from telegram_sends where workspace_id = d.workspace_id and sent_at > now() - interval '24 hours') >= p_per_workspace then interval '1 hour'
    when d.sender_id is not null and (select count(*) from telegram_sends where sender_id = d.sender_id and sent_at > now() - interval '24 hours') >= p_per_sender then interval '1 hour'
    else null end;
  if wait is not null then
    update deliveries set not_before = now() + wait where id = d.id;
    return 'wait';
  end if;
  update deliveries set mail_state = 'sending', last_attempt_at = now(), not_before = null where id = d.id and mail_state = 'queued';
  if not found then return 'gone'; end if;
  insert into telegram_sends (delivery_id, workspace_id, chat_id, sender_id) values (d.id, d.workspace_id, p_chat, d.sender_id);
  return 'ok';
end $$;
revoke execute on function claim_telegram_send(bigint, bigint, int, int, int, int, int) from public, anon, authenticated;
grant execute on function claim_telegram_send(bigint, bigint, int, int, int, int, int) to service_role;
