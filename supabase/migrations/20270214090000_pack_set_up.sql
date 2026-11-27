-- The record of a guided Pack set-up (spec 0068, #1343; GLOSSARY: Pack, Position). The guided flow keeps one record for
-- an install that stays open when a step stops, so that its person takes it up again and makes only what is missing;
-- one step holds it at a time; it notes which Metrics got their people and which decks were made, and for whom someone
-- holds a Position until they have joined. The tables, who may read them and the demo guard stay as they are. The record
-- still decides nothing.
alter table pack_setups add column guided boolean not null default false;
alter table pack_setups add column working_since timestamptz;
-- One guided set-up for an install: two presses at once cannot both start one.
create unique index pack_setups_one_guided on pack_setups (install_id) where guided;

alter table pack_setup_items add column people_done boolean not null default false;
alter table pack_setup_items drop constraint pack_setup_items_kind_check;
alter table pack_setup_items add constraint pack_setup_items_kind_check check (kind in ('metric', 'dashboard', 'workflow', 'deck'));

alter table pack_setup_people add column held_for text references profiles(id) on delete set null;
create index on pack_setup_people (held_for) where held_for is not null;

-- pack_setup_people_leave as it was (20270205150000), which now also forgets whom a holder stood in for.
create or replace function pack_setup_people_leave() returns trigger
language plpgsql security definer set search_path = public as $$
declare person text := to_jsonb(old) ->> tg_argv[0];
begin
  if exists (select 1 from memberships m where m.workspace_id = old.workspace_id and m.user_id = person)
     or exists (select 1 from contacts c where c.workspace_id = old.workspace_id and c.person_id = person) then
    return null;
  end if;
  delete from pack_setup_people p where p.workspace_id = old.workspace_id and p.person_id = person;
  update pack_setup_people p set held_for = null where p.workspace_id = old.workspace_id and p.held_for = person;
  return null;
end $$;
revoke all on function pack_setup_people_leave() from public, anon, authenticated;
