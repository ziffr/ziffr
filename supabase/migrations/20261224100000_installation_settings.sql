-- Installation Settings (spec 0025, ticket #197; GLOSSARY: Installation Settings): what the Installation talks to,
-- set on the page by an Installation Admin instead of in the server's environment. One row per setting, named as
-- its environment variable. Secret values are sealed with AES-256-GCM under ZIFFR_SECRETS_KEY before they arrive
-- here, bound to their name, so a database dump holds none and a sealed value moved to another row does not open.
-- Only the service role reaches the table.
create table installation_settings (
  name text primary key check (name ~ '^ZIFFR_[A-Z0-9_]+$' and char_length(name) <= 64),
  value text not null check (char_length(value) <= 4096),
  sealed boolean not null default false,
  updated_by text check (char_length(updated_by) <= 64),
  updated_at timestamptz not null default now()
);
alter table installation_settings enable row level security;
revoke all on table installation_settings from public, anon, authenticated;
