-- The Marketplace connection (spec 0030, ticket #278; GLOSSARY: Marketplace, Pack). Ziffr asks the Marketplace once a
-- day which installed Packs have newer versions, for the whole Installation at once, so the Marketplace cannot tell
-- Workspaces apart; the answer is kept here, one row per Pack, and each Workspace reads what concerns its Packs.
-- Read and written only through the core (service role); no browser reaches these tables.
create table marketplace_versions (
  pack_id text primary key check (char_length(pack_id) between 3 and 100),
  version text not null check (char_length(version) between 5 and 20),
  seen_at timestamptz not null default now()
);
alter table marketplace_versions enable row level security;

-- When the Installation last asked, so it asks at most once a day however many pages are opened.
create table marketplace_checks (
  only_row boolean primary key default true check (only_row),
  checked_at timestamptz not null
);
alter table marketplace_checks enable row level security;
