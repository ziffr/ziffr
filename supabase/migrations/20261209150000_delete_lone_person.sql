-- Deleting a trial's Owner (spec 0021): their person row goes only when they belong to no workspace at all, checked
-- and deleted in one statement, so a failed count or someone joining another workspace at that moment never deletes
-- a person who is still somewhere. Answers the sign-in to delete with them, or null when nothing was deleted.
create or replace function delete_lone_person(p_person text) returns uuid
language sql security definer set search_path = public as $$
  delete from profiles p where p.id = p_person and not exists (select 1 from memberships m where m.user_id = p_person)
  returning p.auth_user_id
$$;
revoke execute on function delete_lone_person(text) from public, anon, authenticated;
grant execute on function delete_lone_person(text) to service_role;
