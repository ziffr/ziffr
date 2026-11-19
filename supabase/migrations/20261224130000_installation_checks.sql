-- Installation checks (spec 0025, ticket #200; GLOSSARY: Installation Settings): what the Installation Settings page
-- learned from outside that a setting works, such as Slack's signed check of the events address. One row per check,
-- with a fingerprint of the setting it proved (a hash, never the value), so a check made with a secret since
-- replaced no longer counts. Only the service role reaches the table.
create table installation_checks (
  name text primary key check (name ~ '^[a-z0-9_.]+$' and char_length(name) <= 64),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  checked_at timestamptz not null default now()
);
alter table installation_checks enable row level security;
revoke all on table installation_checks from public, anon, authenticated;
