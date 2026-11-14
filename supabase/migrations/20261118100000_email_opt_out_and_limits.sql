-- Opting out of email and sending limits (spec 0004, ticket #74; GLOSSARY: Prompt, Delivery). Someone who stops
-- Prompts and reminders by email (one click, RFC 8058) gets none from that workspace any more; questions, tasks and
-- replies in their Threads keep coming. Each Prompt or reminder carries an unsubscribe token of its own.
create table email_opt_outs (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  opted_out_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);
alter table email_opt_outs enable row level security;
alter table deliveries add column unsubscribe_token text unique check (char_length(unsubscribe_token) = 32);

-- Sending limits, held here (spec 0004, ticket #74): every email that goes out is a row in email_sends, and a send is
-- claimed under locks on the workspace, the inbox (a canonical form of the address: no +tag, no Gmail dots) and the
-- person who caused it, so neither parallel sends nor many workspaces or Contacts for one inbox can pass the limits.
-- An email over a limit waits: not_before keeps it out of the job's runs for ten minutes, so it holds up nobody else's.
alter table deliveries add column not_before timestamptz;
-- A Prompt's personal form link is added when the email is sent, never stored in its body: the Outbox shows the body
-- to the Prompt's sender, and the link submits as its recipient.
alter table deliveries add column form_token_id int references tokens(id) on delete set null;

create table email_sends (
  id bigint generated always as identity primary key,
  delivery_id bigint references deliveries(id) on delete set null,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  sender_id text references profiles(id) on delete set null,
  address_key text not null check (char_length(address_key) between 3 and 254),
  sent_at timestamptz not null default now()
);
create index on email_sends (workspace_id, sent_at);
create index on email_sends (address_key, sent_at);
create index on email_sends (sender_id, sent_at);
alter table email_sends enable row level security;

-- 'ok' when claimed (and counted); 'wait' when a limit is reached (it stays queued, attempts untouched, not_before
-- set); 'gone' when it is not queued any more.
create or replace function claim_delivery_send(p_id bigint, p_address_key text, p_per_workspace int, p_per_address int, p_per_sender int, p_max_attempts int)
returns text language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if p_address_key is null then return 'gone'; end if;
  select id, workspace_id, sender_id into d from deliveries where id = p_id and mail_state = 'queued' and attempts < p_max_attempts;
  if not found then return 'gone'; end if;
  perform pg_advisory_xact_lock(hashtext('mail-workspace:' || d.workspace_id::text));
  perform pg_advisory_xact_lock(hashtext('mail-address:' || p_address_key));
  if d.sender_id is not null then perform pg_advisory_xact_lock(hashtext('mail-sender:' || d.sender_id)); end if;
  if (select count(*) from email_sends where workspace_id = d.workspace_id and sent_at > now() - interval '24 hours') >= p_per_workspace
     or (select count(*) from email_sends where address_key = p_address_key and sent_at > now() - interval '1 hour') >= p_per_address
     or (d.sender_id is not null and (select count(*) from email_sends where sender_id = d.sender_id and sent_at > now() - interval '24 hours') >= p_per_sender) then
    update deliveries set not_before = now() + interval '10 minutes' where id = d.id;
    return 'wait';
  end if;
  update deliveries set mail_state = 'sending', last_attempt_at = now(), not_before = null where id = d.id and mail_state = 'queued';
  if not found then return 'gone'; end if;
  insert into email_sends (delivery_id, workspace_id, sender_id, address_key) values (d.id, d.workspace_id, d.sender_id, p_address_key);
  return 'ok';
end $$;
revoke execute on function claim_delivery_send(bigint, text, int, int, int, int) from public, anon, authenticated;
grant execute on function claim_delivery_send(bigint, text, int, int, int, int) to service_role;
