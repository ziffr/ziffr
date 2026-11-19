-- Installation Admins (spec 0025, ticket #196; GLOSSARY: Installation Admin, Installation): the people who run the
-- Installation as a whole, outside any Workspace. The first one claims it with a one-time setup code that Ziffr
-- prints in its server log; only the code's SHA-256 hash is stored. Every table here is for the service role only:
-- Row Level Security is on with no policies, and the public roles have no grants at all.

create table installation_admins (
  -- A person who has signed in at least once; they stop being one when their person row goes.
  person_id text primary key references profiles(id) on delete cascade,
  -- Who added them: null for the one who claimed the Installation with the setup code.
  added_by text check (char_length(added_by) <= 64),
  added_at timestamptz not null default now()
);
alter table installation_admins enable row level security;
revoke all on table installation_admins from public, anon, authenticated;

-- The setup code while the Installation has no Installation Admin: one row at most, replaced at every start. Valid
-- until it is used; using it deletes it.
create table installation_setup_codes (
  id boolean primary key default true check (id),
  code_hash text not null check (char_length(code_hash) = 64),
  made_at timestamptz not null default now()
);
alter table installation_setup_codes enable row level security;
revoke all on table installation_setup_codes from public, anon, authenticated;

-- Wrong setup codes, per person, kept a day: at most a few an hour each. Counted per person rather than per code,
-- so nobody can use up the code the operator just read in the log.
create table installation_claim_tries (
  person_id text not null check (char_length(person_id) <= 64),
  at timestamptz not null default now()
);
create index on installation_claim_tries (person_id, at);
alter table installation_claim_tries enable row level security;
revoke all on table installation_claim_tries from public, anon, authenticated;

-- What Installation Admins did: claiming, adding and removing admins, and changing settings (by name, never their
-- value). Add-only like the Audit Log of a Workspace, which it is not: no Workspace's Owners read it.
create table installation_audit_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- No foreign key: the record outlives the person, so the name is kept as it was then.
  actor_id text check (char_length(actor_id) <= 64),
  actor_name text not null check (char_length(actor_name) between 1 and 120),
  kind text not null check (kind ~ '^[a-z_]+\.[a-z_]+$' and char_length(kind) <= 60),
  -- The person added or removed, or the setting's name; never a setting's value.
  subject text check (char_length(subject) <= 120)
);
create index on installation_audit_events (id desc);
alter table installation_audit_events enable row level security;
revoke all on table installation_audit_events from public, anon, authenticated;

create or replace function installation_audit_add_only() returns trigger language plpgsql as $$
begin
  raise exception 'The Installation''s audit is add-only.' using errcode = 'ZF403';
end;
$$;
create trigger installation_audit_add_only before update or delete on installation_audit_events for each row execute function installation_audit_add_only();
create trigger installation_audit_no_truncate before truncate on installation_audit_events for each statement execute function installation_audit_add_only();

-- The database's own time, so no event can be backdated.
create or replace function installation_audit_stamp() returns trigger language plpgsql as $$
begin
  new.at := now();
  return new;
end;
$$;
create trigger installation_audit_stamp before insert on installation_audit_events for each row execute function installation_audit_stamp();

-- Claims the Installation for a person with the setup code's hash, in one step under a lock, so two people with the
-- right code at the same moment cannot both become the first Installation Admin. Answers 'ok', 'claimed' (there is
-- an Installation Admin already, whatever the code), 'wait' (too many wrong codes from this person in the last hour)
-- or 'wrong'.
create or replace function claim_installation(p_person text, p_code_hash text, p_tries_per_hour int)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('installation:claim'));
  if exists (select 1 from installation_admins) then
    return 'claimed';
  end if;
  delete from installation_claim_tries where at < now() - interval '1 day';
  if (select count(*) from installation_claim_tries where person_id = p_person and at > now() - interval '1 hour') >= p_tries_per_hour then
    return 'wait';
  end if;
  if not exists (select 1 from installation_setup_codes where code_hash = p_code_hash) then
    insert into installation_claim_tries (person_id) values (p_person);
    return 'wrong';
  end if;
  insert into installation_admins (person_id, added_by) values (p_person, null);
  -- Once only: the code is gone with its first use.
  delete from installation_setup_codes where id;
  delete from installation_claim_tries where true;
  return 'ok';
end;
$$;
revoke execute on function claim_installation(text, text, int) from public, anon, authenticated;
grant execute on function claim_installation(text, text, int) to service_role;

-- Removes an Installation Admin unless they are the last one on the page and the server names nobody else
-- (p_server_admins: how many people ZIFFR_INSTALLATION_ADMINS names who are not this one). Under the same lock as
-- claiming, so two admins removing each other at once leave one. Answers 'ok', 'last' or 'none'.
create or replace function remove_installation_admin(p_person text, p_server_admins int)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('installation:claim'));
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
revoke execute on function remove_installation_admin(text, int) from public, anon, authenticated;
grant execute on function remove_installation_admin(text, int) to service_role;
