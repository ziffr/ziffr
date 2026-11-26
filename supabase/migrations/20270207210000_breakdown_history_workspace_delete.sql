-- Deleting a Workspace that holds values with a Breakdown failed (GLOSSARY: Workspace, Breakdown): the rows of a
-- Breakdown go with their Workspace, and the trigger that keeps their history (20261113120000) tried to write a row
-- naming that Workspace, or, where the value had gone first, naming none, which the demo's guard refused. A trial's
-- Workspace Key is destroyed before its rows are deleted, so such a trial was left unreadable and undeleted.
-- Rows that go because their value or their whole Workspace goes keep no history, as a value's own history does
-- (keep_observation_history): it would go with them. A Breakdown replaced or removed while its value stays is kept.
-- Nothing else is changed: a deletion that failed before is finished by the same job that tried it, run again.
create or replace function keep_breakdown_history() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from workspaces where id = old.workspace_id) or not exists (select 1 from observations where id = old.observation_id) then
    return old;
  end if;
  insert into breakdown_history (observation_id, label, value, value_sealed, row_id, parent_row_id) values (old.observation_id, old.label, old.value, old.value_sealed, old.id, old.parent_id);
  return old;
end;
$$;
