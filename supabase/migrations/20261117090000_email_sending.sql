-- Sending email (spec 0004, ticket #71; GLOSSARY: Delivery, Connector). A Delivery by the Email Connector is queued,
-- sent or failed once mail settings exist; everything else stays in the Outbox as before ("outbox": recorded, not
-- sent, which is also every Delivery made before this). The recipient's address is looked up when sending, never
-- stored here, so the Outbox holds no addresses.
alter table deliveries add column mail_state text not null default 'outbox'
  check (mail_state in ('outbox', 'queued', 'sending', 'sent', 'failed'));
alter table deliveries add column attempts smallint not null default 0 check (attempts between 0 and 10);
alter table deliveries add column last_attempt_at timestamptz;
alter table deliveries add column sent_at timestamptz;
-- The provider's Message-ID, to find a message in its logs; never shown to members.
alter table deliveries add column provider_id text check (char_length(provider_id) <= 300);
-- Why the last attempt failed, in a few words for the Outbox; never the server's reply in full.
alter table deliveries add column last_error text check (char_length(last_error) <= 200);
create index on deliveries (mail_state, last_attempt_at) where mail_state in ('queued', 'sending');
