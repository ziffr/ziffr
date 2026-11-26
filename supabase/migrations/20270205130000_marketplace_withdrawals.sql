-- Withdrawn Packs (spec 0059, ticket #1194; GLOSSARY: Withdrawn Pack). The daily updates question tells the
-- Installation which of the Packs it took from the Marketplace were withdrawn, and why; the answer is kept here, one
-- row per Pack, and each Workspace that installed it reads its own. It is the Installation's, not a Workspace's: no
-- workspace_id, so nothing here is on the demo's lists. Nothing is removed from any Workspace.
create table marketplace_withdrawals (
  pack_id text primary key check (char_length(pack_id) between 3 and 100),
  -- The Marketplace's words, held to the contract by the core (plain text, no web address); this is the last line.
  reason text not null check (char_length(reason) between 1 and 200 and reason !~ '[[:cntrl:]]'),
  seen_at timestamptz not null default now()
);
-- No browser role has any grant: Row Level Security is on with no policy, and only the core (service role) reads and writes.
alter table marketplace_withdrawals enable row level security;
revoke all on table marketplace_withdrawals from public, anon, authenticated;
