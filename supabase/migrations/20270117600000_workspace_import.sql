-- Importing a Workspace Export into a new Workspace (spec 0040, ticket 9; GLOSSARY: Workspace Export, Workspace Key).
-- A Workspace being filled by an import is marked `importing_at`: its Owner's lists leave it out until the job ends,
-- and a job that fails or stops deletes it with its key, so a half import is never left. The job itself is one row
-- (`workspace_imports`) the progress page reads: its step, how far it got and, if it failed, the first problem with
-- its line. A person from the file is an invitation that is `held_at` until the new Owner presses "Invite everyone":
-- a held invitation cannot be accepted and sends nothing, and `import_plan` keeps what the file says of that person
-- (Groups, Shares) for the moment they join. Only the service role reads or writes these.

alter table workspaces add column importing_at timestamptz;

create table workspace_imports (
  id uuid primary key default gen_random_uuid(),
  -- Set null, not cascade: the job's row stays to say why when the half-made Workspace was deleted.
  workspace_id uuid references workspaces(id) on delete set null,
  created_by text not null references profiles(id) on delete cascade,
  status text not null check (status in ('uploading', 'checking', 'importing', 'done', 'failed')),
  step text not null default '' check (char_length(step) <= 80),
  -- The temporary file of the upload, removed when the job ends or is undone (the core checks its form before removing).
  temp_path text check (char_length(temp_path) <= 300),
  workspace_name text check (char_length(workspace_name) <= 80),
  -- Records read in the pass that is running, and the file's total once the checking pass has counted them.
  records_done bigint not null default 0,
  records_total bigint,
  counts jsonb not null default '{}'::jsonb,
  problem text check (char_length(problem) <= 600),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index on workspace_imports (created_by, started_at desc);
-- One import at a time per person.
create unique index workspace_imports_one_running on workspace_imports (created_by) where status in ('uploading', 'checking', 'importing');
alter table workspace_imports enable row level security;
revoke all on table workspace_imports from public, anon, authenticated;
-- The demo Workspace is never imported into and keeps no import jobs: the guard refuses writes to its rows like any table's.
select attach_demo_guard('workspace_imports');

alter table invitations add column held_at timestamptz;
alter table invitations add column import_plan jsonb check (import_plan is null or pg_column_size(import_plan) <= 100000);

-- Whether a time zone name is one this database knows: the file's names are checked by Node when read, and here too,
-- because the database is what keeps the Workspace's time (Node and Postgres differ on some names).
create function timezone_known(p_name text) returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_name)
$$;
revoke execute on function timezone_known(text) from public, anon, authenticated;
grant execute on function timezone_known(text) to service_role;

-- Destroying a Workspace's key also for a Workspace whose import failed (it is deleted right after, with nothing in it
-- that anyone may keep). Otherwise as it was: under the Workspace's lock, marked as keyed so no key is made again, the
-- Installation's audit line by id once. Only a Trial Workspace or one being imported.
create or replace function destroy_workspace_keys(p_workspace uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare
  ends timestamptz;
  importing timestamptz;
begin
  select trial_ends_at, importing_at into ends, importing from workspaces where id = p_workspace for update;
  if not found then
    return false;
  end if;
  if ends is null and importing is null then
    raise exception 'Only a Trial Workspace or one being imported can be deleted.';
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

-- Claims a place for an upload in one locked step: this person has no import under way. An upload counts only against the
-- person, so a slow one cannot block anyone else; the Installation's limit of imports that run is checked when the
-- import begins (begin_workspace_import), after the file has arrived. Answers the job's id, or refused = 'mine' (this person has one) or 'busy' (five uploads are coming in).
create function start_workspace_import(p_person text, out job uuid, out refused text) language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('workspace_imports'));
  if exists (select 1 from workspace_imports where created_by = p_person and status in ('uploading', 'checking', 'importing')) then
    refused := 'mine';
  -- At most 5 uploads come in at once on an Installation. Import exists only on Installations that are not hosted Ziffr, an
  -- upload that sends no byte for 30 seconds is ended and none may take more than 15 minutes, so this is bounded and short.
  elsif (select count(*) from workspace_imports where status = 'uploading') >= 5 then
    refused := 'busy';
  else
    insert into workspace_imports (created_by, status, step) values (p_person, 'uploading', 'Receiving the file') returning id into job;
  end if;
end;
$$;
revoke all on function start_workspace_import(text) from public, anon, authenticated;
grant execute on function start_workspace_import(text) to service_role;

-- Begins the import of an upload that has arrived: the Installation runs fewer than p_max imports ('busy' otherwise,
-- and the job stays an upload so the caller can end it), under the same lock. Answers 'ok', 'busy' or 'gone'.
create function begin_workspace_import(p_job uuid, p_person text, p_max int, p_temp text) returns text language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('workspace_imports'));
  if (select count(*) from workspace_imports where status in ('checking', 'importing')) >= p_max then
    return 'busy';
  end if;
  update workspace_imports set status = 'checking', step = 'Checking the file', temp_path = p_temp, updated_at = now()
    where id = p_job and created_by = p_person and status = 'uploading';
  return case when found then 'ok' else 'gone' end;
end;
$$;
revoke all on function begin_workspace_import(uuid, text, int, text) from public, anon, authenticated;
grant execute on function begin_workspace_import(uuid, text, int, text) to service_role;
