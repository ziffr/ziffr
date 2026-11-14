-- Values from programs (spec 0002, ticket #49; GLOSSARY: Source, Access Key). A value submitted with an Access Key
-- names the key, so its history says which program sent it; the key's row may go, the value stays.
alter table observations add column access_key_id bigint references access_keys(id) on delete set null;

-- Idempotency keys of submissions: the first answer for a key's Idempotency-Key, kept 24 hours. A repeat with the same
-- body gets that answer again; a different body is a conflict. A row without an answer is a submission in progress.
create table api_idempotency (
  key_id bigint not null references access_keys(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  body_hash text not null check (char_length(body_hash) = 64),
  status smallint check (status between 100 and 599),
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (key_id, idempotency_key)
);
create index on api_idempotency (created_at);
alter table api_idempotency enable row level security;
