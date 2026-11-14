-- Access Log (spec 0002, GLOSSARY: Access Log): every call a program made with an Access Key, kept 90 days. It
-- records what was asked and how it ended, never bodies or values. Its workspace is its key's, through the key, so it
-- has no workspace column that could disagree. The per-minute and per-day limits are counted from it.
create table access_log (
  id bigint generated always as identity primary key,
  key_id bigint not null references access_keys(id) on delete cascade,
  at timestamptz not null default now(),
  method text not null check (char_length(method) between 1 and 10),
  route text not null check (char_length(route) between 1 and 200),
  status smallint not null check (status between 100 and 599),
  -- Values this call recorded, for the daily limit on submissions (ticket #49).
  submitted integer not null default 0 check (submitted >= 0)
);
create index on access_log (key_id, at desc);
create index on access_log (at);
alter table access_log enable row level security;
