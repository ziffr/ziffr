-- The demo's state (spec 0051, ticket 1; GLOSSARY: Demo Mode, Demo Reset): one row that says which Generation of the demo
-- is running (a counter that moves at each reset), when it started, and whether a visitor changed it since. The reset
-- job reads it to skip a clean, young demo. Nothing writes `changed_since_reset` yet: the demo stays read-only until
-- the setting that opens it exists (ticket 3), so every demo is clean and the job skips it only where that mode is on.
--
-- The row has no workspace_id (the demo guard and its gaps check look at tables that have one), it holds no person's
-- data, and only the core reads it, with the service key: Row Level Security on, no policy, no grant to the public roles.
create table demo_state (
  id boolean primary key default true check (id),
  generation bigint not null default 0,
  changed_since_reset boolean not null default false,
  last_change_at timestamptz,
  reset_at timestamptz
);
alter table demo_state enable row level security;
revoke all on demo_state from public, anon, authenticated;
grant select, insert, update, delete on demo_state to service_role;

-- An Installation that already has the demo starts at Generation 1, dated from when its demo was last seeded.
insert into demo_state (generation, reset_at)
select 1, w.created_at from workspaces w where w.id = 'd3e00000-0000-4000-8000-000000000001';
insert into demo_state (generation) select 0 where not exists (select 1 from demo_state);

-- Every seed of the demo makes its Workspace again (prototype_reset, called by demo_reset, by `prototype:reset` and by
-- Docker's first start), so a trigger on that insert moves the Generation and clears the flag in the same transaction,
-- whichever migration last redefined demo_reset: a later redefinition cannot drop it.
create or replace function demo_state_on_reset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update demo_state set generation = generation + 1, changed_since_reset = false, last_change_at = null, reset_at = now()
    where id;  -- a WHERE clause is required of every UPDATE here
  return null;
end $$;
revoke execute on function demo_state_on_reset() from public, anon, authenticated;

create trigger demo_state_on_reset after insert on workspaces for each row
  when (new.id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_state_on_reset();
