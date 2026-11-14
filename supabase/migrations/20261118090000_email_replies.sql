-- Replies by email (spec 0004, ticket #73; GLOSSARY: Delivery, Thread, Prompt). Each email Delivery that goes out
-- while inbound mail is set up carries a reply address with a random token of its own: the token names exactly one
-- recipient, workspace and Thread or Prompt, and a reply is only taken for a known token, from the address it was sent
-- to, within 30 days.
alter table deliveries add column reply_token text unique check (char_length(reply_token) = 32);

-- Every email that came in, once: a provider that delivers the same message twice (by its Message-ID) changes nothing
-- the second time. It keeps what was done with it, never the message itself.
create table inbound_emails (
  id bigint generated always as identity primary key,
  message_id text check (char_length(message_id) <= 300),
  delivery_id bigint references deliveries(id) on delete set null,
  workspace_id uuid references workspaces(id) on delete cascade,
  received_at timestamptz not null default now(),
  outcome text not null check (char_length(outcome) <= 40)
);
create unique index on inbound_emails (message_id) where message_id is not null;
create index on inbound_emails (delivery_id, received_at);
alter table inbound_emails enable row level security;
