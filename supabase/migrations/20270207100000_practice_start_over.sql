-- Start over (spec 0063, #1266; GLOSSARY: Practice Workspace): a Practice Workspace is deleted, with its Workspace Key
-- and the person rows made for it, in one step, so a fresh one can be made. The one thing this step can delete is the
-- Practice Workspace made for the person named: it locks the row and checks the mark, which only the insert could set
-- (practice_mark_fixed). Any other Workspace, the demo included, is left as it is and the answer is false.
create function delete_practice_workspace(p_workspace uuid, p_person text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  made_for_it text[];
begin
  if p_workspace is null or p_person is null or p_workspace = 'd3e00000-0000-4000-8000-000000000001'::uuid then return false; end if;
  perform 1 from workspaces where id = p_workspace and practice_for = p_person for update;
  if not found then return false; end if;
  -- The rows that stand for people only there: made-up people, and Contacts and Feeds added in it.
  select coalesce(array_agg(x.id), '{}') into made_for_it from (
    select p.id from profiles p where p.made_up_in = p_workspace
    union select c.person_id from contacts c where c.workspace_id = p_workspace
    union select f.person_id from feeds f where f.workspace_id = p_workspace
  ) as x(id);
  -- The key first: whatever of the Workspace is left anywhere cannot be read (spec 0028).
  update workspaces set keyed_at = coalesce(keyed_at, now()) where id = p_workspace;
  delete from workspace_keys where workspace_id = p_workspace;
  insert into installation_audit_events (actor_id, actor_name, kind, subject) values (null, 'Ziffr', 'workspace.key_destroyed', p_workspace::text);
  -- Values and their parts first, while the Workspace is still there: removing them writes history rows that name it,
  -- which could not be written once it is going.
  delete from breakdown_rows where workspace_id = p_workspace;
  delete from observations where workspace_id = p_workspace;
  delete from intake_log where workspace_id = p_workspace;
  delete from workspaces where id = p_workspace;
  -- Never the person it was made for, anybody who can sign in or anybody who is a member somewhere.
  delete from profiles p where p.id = any (made_for_it) and p.id <> p_person and p.auth_user_id is null
    and not exists (select 1 from memberships m where m.user_id = p.id)
    and not exists (select 1 from installation_admins a where a.person_id = p.id);
  return true;
end $$;
revoke execute on function delete_practice_workspace(uuid, text) from public, anon, authenticated;
grant execute on function delete_practice_workspace(uuid, text) to service_role;
