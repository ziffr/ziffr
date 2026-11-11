-- PROTOTYPE, wipe me. Decks (GLOSSARY: Deck, Slide, Snapshot).
-- The editor's tldraw document is stored as JSON; slides are its frames.
create table decks (
  id serial primary key,
  owner_id text not null references profiles(id),
  name text not null,
  document jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table decks enable row level security;

-- prototype_reset() truncates everything it seeds; decks are wiped alongside.
create or replace function prototype_reset_decks() returns void
language sql security definer set search_path = public as $$
  truncate decks restart identity;
  insert into decks (owner_id, name) values ('sara', 'Board update, ' || to_char(current_date, 'FMMonth YYYY'));
$$;
