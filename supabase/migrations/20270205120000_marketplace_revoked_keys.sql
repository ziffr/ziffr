-- Marketplace key revocations (spec 0059, ticket #1193; GLOSSARY: Marketplace Key). When the Marketplace's reserve key
-- takes a signing key out of use, Ziffr keeps that and takes no statement of that key again. It is the Installation's,
-- not a Workspace's: no workspace_id, so nothing here is on the demo's lists. A row is written only after the core
-- verified the reserve key's signature; nothing in the app removes one.
create table marketplace_revoked_keys (
  -- A key's id: the first 32 hex characters of the SHA-256 of its raw bytes.
  key_id text primary key check (key_id ~ '^[0-9a-f]{32}$'),
  -- The reserve key that signed the revocation; from then on that key signs statements.
  revoked_by text not null check (revoked_by ~ '^[0-9a-f]{32}$' and revoked_by <> key_id),
  signed_at timestamptz not null,
  seen_at timestamptz not null default now()
);
-- No browser role has any grant: Row Level Security is on with no policy, and only the core (service role) reads and writes.
alter table marketplace_revoked_keys enable row level security;
revoke all on table marketplace_revoked_keys from public, anon, authenticated;
