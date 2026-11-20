-- Destroying a Workspace's key (spec 0028, ticket #249; GLOSSARY: Workspace Key): the first step of deleting a
-- Workspace. Under the Workspace row's lock, so it cannot cross create_first_workspace_key: the Workspace is marked as
-- keyed (also one that never had a key, so none is ever made for it from now on), every version of its key is
-- deleted, and the Installation's audit gets its one line, by the Workspace's id and never its name. Recorded here,
-- in the same step, because this is the moment after which the Workspace can no longer be read, whatever the rest of
-- the deletion does; a retry adds no second line. Only a Trial Workspace can be deleted today, checked here under the
-- lock too, so no caller can destroy the key of any other Workspace by mistake. Only the service role may call it.
create function destroy_workspace_keys(p_workspace uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare
  ends timestamptz;
begin
  select trial_ends_at into ends from workspaces where id = p_workspace for update;
  if not found then
    return false;
  end if;
  if ends is null then
    raise exception 'Only a Trial Workspace can be deleted.';
  end if;
  update workspaces set keyed_at = coalesce(keyed_at, now()) where id = p_workspace;
  delete from workspace_keys where workspace_id = p_workspace;
  if not exists (select 1 from installation_audit_events where kind = 'workspace.key_destroyed' and subject = p_workspace::text) then
    insert into installation_audit_events (actor_id, actor_name, kind, subject) values (null, 'Ziffr', 'workspace.key_destroyed', p_workspace::text);
  end if;
  return true;
end;
$$;
revoke all on function destroy_workspace_keys(uuid) from public, anon, authenticated;
