-- Every Workspace keeps at least one Owner (GLOSSARY: Workspace Role). Checked in the database, one change at a time
-- per workspace, so two Owners demoting each other at the same moment cannot leave none. Deleting the whole
-- workspace (its memberships go with it) is not held back.
create or replace function keep_an_owner() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role <> 'owner' or (tg_op = 'UPDATE' and new.role = 'owner') then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from workspaces where id = old.workspace_id) then
    return coalesce(new, old);
  end if;
  perform pg_advisory_xact_lock(hashtext('owners:' || old.workspace_id::text));
  if not exists (select 1 from memberships where workspace_id = old.workspace_id and role = 'owner' and user_id <> old.user_id) then
    raise exception 'A workspace keeps at least one Owner.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function keep_an_owner() from public, anon, authenticated;
create trigger keep_an_owner before update or delete on memberships for each row execute function keep_an_owner();
