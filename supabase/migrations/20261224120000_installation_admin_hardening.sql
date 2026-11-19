-- Installation Admins, hardened after review (spec 0025; GLOSSARY: Installation Admin). Every step that decides who
-- runs the Installation now happens in the database under the one claim lock: removing an admin checks that the one
-- removing still is one, the setup code is made only while nobody runs the Installation, and the last admin's
-- person cannot be deleted, which would otherwise leave the Installation open to a new setup code.

-- Removing takes the acting person too (p_actor; p_actor_on_server when the server names them by address) and
-- answers 'forbidden' when they are no admin any more, as when another admin removed them a moment before.
drop function if exists remove_installation_admin(text, int);
create or replace function remove_installation_admin(p_actor text, p_actor_on_server boolean, p_person text, p_server_admins int)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('installation:claim'));
  if not p_actor_on_server and not exists (select 1 from installation_admins where person_id = p_actor) then
    return 'forbidden';
  end if;
  if not exists (select 1 from installation_admins where person_id = p_person) then
    return 'none';
  end if;
  if p_server_admins < 1 and (select count(*) from installation_admins where person_id <> p_person) < 1 then
    return 'last';
  end if;
  delete from installation_admins where person_id = p_person;
  return 'ok';
end;
$$;
revoke execute on function remove_installation_admin(text, boolean, text, int) from public, anon, authenticated;
grant execute on function remove_installation_admin(text, boolean, text, int) to service_role;

-- Stores a new setup code's hash only while the Installation has no Installation Admin, in one step with that check.
-- p_fresh (at start) replaces a waiting code; otherwise one waiting is kept. Answers 'made', 'waiting' or 'claimed'.
create or replace function prepare_setup_code(p_code_hash text, p_fresh boolean)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('installation:claim'));
  if exists (select 1 from installation_admins) then
    delete from installation_setup_codes where id;
    return 'claimed';
  end if;
  if not p_fresh and exists (select 1 from installation_setup_codes) then
    return 'waiting';
  end if;
  insert into installation_setup_codes (id, code_hash, made_at) values (true, p_code_hash, now())
    on conflict (id) do update set code_hash = excluded.code_hash, made_at = excluded.made_at;
  return 'made';
end;
$$;
revoke execute on function prepare_setup_code(text, boolean) from public, anon, authenticated;
grant execute on function prepare_setup_code(text, boolean) to service_role;

-- The last Installation Admin's person is not deleted: another admin must be added first. Deleting them would
-- remove their admin row by cascade and leave the Installation unclaimed, so whoever reads the log next could claim it.
create or replace function installation_keep_last_admin() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('installation:claim'));
  if exists (select 1 from installation_admins where person_id = old.id)
     and not exists (select 1 from installation_admins where person_id <> old.id) then
    raise exception 'This person is the last Installation Admin. Add another Installation Admin first.' using errcode = 'ZF409';
  end if;
  return old;
end;
$$;
create trigger installation_keep_last_admin before delete on profiles for each row execute function installation_keep_last_admin();

-- The audit's triggers with a fixed search_path, like every other function here.
create or replace function installation_audit_add_only() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'The Installation''s audit is add-only.' using errcode = 'ZF403';
end;
$$;
create or replace function installation_audit_stamp() returns trigger language plpgsql set search_path = public as $$
begin
  new.at := now();
  return new;
end;
$$;
