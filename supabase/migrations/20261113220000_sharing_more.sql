-- PROTOTYPE, wipe me. Decks can be shared; access can be requested; view-only links for people outside.
alter table shares drop constraint shares_object_type_check;
alter table shares add constraint shares_object_type_check check (object_type in ('metric','dashboard','deck'));

-- Asking the owner for access; the owner hears about it through their Connector.
create table access_requests (
  id serial primary key,
  requester_id text not null references profiles(id) on delete cascade,
  object_type text not null check (object_type in ('metric','dashboard','deck')),
  object_id int not null,
  status text not null default 'open' check (status in ('open','granted','declined')),
  created_at timestamptz not null default now()
);
alter table access_requests enable row level security;
alter table deliveries drop constraint deliveries_kind_check;
alter table deliveries add constraint deliveries_kind_check
  check (kind in ('question','task','reminder','reply','correction','decision','closed','done','prompt','notice'));

-- View-only links (GLOSSARY: View Link): a random token, an expiry, revocable; live or frozen at creation.
create table view_links (
  id serial primary key,
  token text not null unique,
  object_type text not null check (object_type in ('dashboard','deck')),
  object_id int not null,
  created_by text not null references profiles(id),
  label text not null default '',
  expires_at date not null,
  frozen jsonb,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table view_links enable row level security;
