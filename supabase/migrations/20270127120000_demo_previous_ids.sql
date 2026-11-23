-- The demo's previous ids (spec 0051, ticket 7; GLOSSARY: Demo Reset): a Demo Reset deletes the demo Workspace and seeds it
-- again, so the seed's dashboards and decks come back with new ids. A page open on an old id would find nothing; this table
-- keeps, for each dashboard and deck the seed made, the old id and its name, so the page can follow the name to the new
-- one. Only the id and the name are kept (no person's data, no widgets), and the core shows a successor only when the
-- person may open it (packages/core/src/demo-successor.ts).
--
-- The rows are written by a trigger on the demo Workspace's own deletion, which runs before its rows go with it, so
-- whichever migration last redefined demo_reset or prototype_reset, the ids are kept (as demo_state's Generation is).
-- The table has no workspace_id: it is not the demo's data (the demo guard and its lists look at tables that have one),
-- it is read only by the core with the service key (Row Level Security on, no policy, no grant to the public roles).
-- It touches no demo row, so this migration does not set ziffr.demo_seed.
create table demo_previous_ids (
  -- The Generation that ended with these ids.
  generation bigint not null,
  kind text not null check (kind in ('dashboard', 'deck')),
  old_id integer not null,
  name text not null,
  primary key (kind, old_id)
);
alter table demo_previous_ids enable row level security;
revoke all on table demo_previous_ids from public, anon, authenticated;
grant select on table demo_previous_ids to service_role;

-- Keeps the ids of the dashboards and decks the seed made, and forgets those of 96 Generations ago (a day of resets).
-- A row a visitor made (made after the Generation began) is not kept: its page says it is gone, not where it went.
create or replace function demo_previous_ids_keep() returns trigger
language plpgsql security definer set search_path = public as $$
declare gen bigint; began timestamptz;
begin
  select coalesce(generation, 0), reset_at into gen, began from demo_state where id;
  gen := coalesce(gen, 0);
  insert into demo_previous_ids (generation, kind, old_id, name)
    select gen, 'dashboard', d.id, d.name from dashboards d
    where d.workspace_id = old.id and (began is null or d.created_at <= began)
  on conflict (kind, old_id) do update set generation = excluded.generation, name = excluded.name;
  insert into demo_previous_ids (generation, kind, old_id, name)
    select gen, 'deck', k.id, k.name from decks k
    where k.workspace_id = old.id and (began is null or k.created_at <= began)
  on conflict (kind, old_id) do update set generation = excluded.generation, name = excluded.name;
  delete from demo_previous_ids where generation < gen - 96;
  return old;
end $$;
revoke execute on function demo_previous_ids_keep() from public, anon, authenticated;

create trigger demo_previous_ids_before_delete before delete on workspaces for each row
  when (old.id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_previous_ids_keep();
