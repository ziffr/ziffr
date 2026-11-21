-- Held replies (ticket #513 part b; GLOSSARY: Held Reply): a reply by email that no provider vouched for waits here until
-- the person it went to confirms it with a one-time link sent to the address the Workspace keeps for them. Only the
-- hash of the link's token is stored, so a copy of the table cannot confirm anything, and the reply's own words are
-- sealed with a key made from the token itself (held-replies.ts), so they open only with the link. A row is deleted
-- when it is confirmed (single use) and, once expired, the next time one is held. Service role only: row level
-- security stays on with no policies.
create table held_replies (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  delivery_id bigint not null references deliveries(id) on delete cascade,
  -- sha256 of the token, hex.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- sha256 of the address the link was sent to, so a link sent to an address the person no longer has acts for nobody.
  address_hash text not null check (address_hash ~ '^[0-9a-f]{64}$'),
  -- The reply as AES-256-GCM, base64; the core holds at most 1,000 characters (4 bytes each at most), which fit well inside.
  sealed_text text not null check (char_length(sealed_text) <= 12000),
  kind text not null check (kind in ('value', 'reply')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index held_replies_delivery_idx on held_replies (delivery_id, expires_at);
create index held_replies_expires_idx on held_replies (expires_at);
alter table held_replies enable row level security;
select attach_demo_guard('held_replies');
