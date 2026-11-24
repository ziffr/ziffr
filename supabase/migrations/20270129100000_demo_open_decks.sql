-- Open decks and Snapshots in the demo (spec 0051, ticket 10; GLOSSARY: Demo Mode, Deck, Snapshot). Opens the two tables behind
-- making and changing a visitor's decks (`decks`) and taking Snapshots (`dashboard_snapshots`); Versions and templates were
-- opened by ticket 9, so a deck's Versions and a deck saved as a template need nothing more. Nothing changes for a visitor
-- until the Installation says so (ZIFFR_DEMO_CHANGES with ZIFFR_DEMO_ONLY, which the reset job turns into
-- demo_state.open_to_visitors): the guard still refuses every write on an Installation where the setting is off.
--
-- Rows a visitor may make in the whole demo between two Demo Resets are capped by demo_limits (ticket 5): the spec's 15 decks
-- and 20 Snapshots are in it already. The words of the seed stay as they are (ticket 6): every seeded deck is in the showcase,
-- a seeded Snapshot keeps its words and its numbers and is never deleted (dashboard_snapshots is a table whose seeded rows
-- are kept), and the words trigger is on both tables already. No demo row is read or written here.

-- A Snapshot had no created_at (only taken_at, which a program may give), and the row-cap trigger counts rows by created_at.
-- The rows that exist get the epoch (the column is added with that default, then the default is changed), so they predate every
-- demo_state.seed_done_at and are never counted against visitors (the seed's Snapshots included, until the next Demo Reset makes
-- them again). No row is updated, so no demo trigger fires and no ziffr.demo_seed is needed. A new row gets the time of its insert,
-- which a visitor cannot choose.
alter table dashboard_snapshots add column created_at timestamptz not null default 'epoch';
alter table dashboard_snapshots alter column created_at set default now();

select open_demo_table('decks');
select open_demo_table('dashboard_snapshots');

select apply_demo_limits('decks', 'decks');
select apply_demo_limits('dashboard_snapshots', 'snapshots');

-- A deck's store is a large JSON, so its size is also held in the database: the core refuses a visitor's deck over 512 KB
-- before it writes (demo-visitor-deck.ts); this is the backstop for a write that did not come through it. Well above the
-- core's 512 KB of compact JSON, since the database keeps the JSON re-spaced and this counts its bytes (octet_length). The seed is exempt.
create or replace function demo_deck_size_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if demo_seeding() then return new; end if;
  if new.document is not null and octet_length(new.document::text) > 900000 then
    raise exception using errcode = 'ZF4D2', message = 'demo_limit:deck_size';
  end if;
  return new;
end $$;
revoke execute on function demo_deck_size_check() from public, anon, authenticated;
create trigger zzz_demo_deck_size before insert or update of document on decks for each row
  when (new.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_deck_size_check();

-- One Snapshot at a time in the whole demo (ticket 10): taking one freezes a whole dashboard's numbers. A single row holds the
-- lease: who has it and until when. The core takes it in one statement before computing and gives it back after; it runs out by
-- itself (the core asks for 90 seconds), so a crash cannot hold it. It has no workspace_id: it is not the demo's data, only a
-- turn, and it is not emptied by a Demo Reset (a lease of the moment).
create table demo_snapshot_lock (
  id boolean primary key default true check (id),
  holder text check (holder is null or char_length(holder) <= 64),
  taken_until timestamptz not null default '-infinity'
);
insert into demo_snapshot_lock (id) values (true);
alter table demo_snapshot_lock enable row level security;
revoke all on table demo_snapshot_lock from public, anon, authenticated, service_role;

-- Takes the turn when nobody has it (or it ran out): answers whether it is now `p_holder`'s, for `p_seconds` (1 to 300).
create or replace function demo_snapshot_lock_take(p_holder text, p_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_seconds < 1 or p_seconds > 300 then raise exception 'demo_snapshot_lock_take: seconds must be 1 to 300'; end if;
  if p_holder is null or char_length(p_holder) not between 8 and 64 then raise exception 'demo_snapshot_lock_take: holder'; end if;
  update demo_snapshot_lock set holder = p_holder, taken_until = clock_timestamp() + make_interval(secs => p_seconds)
    where id and taken_until < clock_timestamp();
  return found;
end $$;

-- Gives the turn back: only the holder can, so a late release never frees another visitor's turn.
create or replace function demo_snapshot_lock_release(p_holder text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update demo_snapshot_lock set holder = null, taken_until = '-infinity' where id and holder = p_holder;
end $$;

revoke execute on function demo_snapshot_lock_take(text, integer) from public, anon, authenticated;
revoke execute on function demo_snapshot_lock_release(text) from public, anon, authenticated;
grant execute on function demo_snapshot_lock_take(text, integer) to service_role;
grant execute on function demo_snapshot_lock_release(text) to service_role;
