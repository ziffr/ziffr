-- Adding an Installation Admin in one step (spec 0066; GLOSSARY: Installation Admin, Blocked User): under the lock of
-- claiming, removing and blocking, so that who is an Installation Admin and who is blocked are never decided at the
-- same moment from each other's old answer. Answers 'ok', 'forbidden' (the actor is no Installation Admin any more),
-- 'blocked' (the person's account is blocked) or 'exists'.
create or replace function add_installation_admin(p_actor text, p_actor_on_server boolean, p_person text)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('installation:claim'));
  if not coalesce(p_actor_on_server, false) and not exists (select 1 from installation_admins where person_id = p_actor) then
    return 'forbidden';
  end if;
  if person_blocked(p_person) then return 'blocked'; end if;
  insert into installation_admins (person_id, added_by) values (p_person, p_actor) on conflict (person_id) do nothing;
  if not found then return 'exists'; end if;
  return 'ok';
end $$;
revoke execute on function add_installation_admin(text, boolean, text) from public, anon, authenticated;
grant execute on function add_installation_admin(text, boolean, text) to service_role;
