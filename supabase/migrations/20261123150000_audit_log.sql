-- Audit Log (spec 0008, GLOSSARY: Audit Log): who did what to whom or what, and when, for a Workspace's Owners and
-- Admins. Add-only: rows are never changed, and removed only when they are older than the retention (730 days) or
-- when their workspace itself is deleted. It names people and objects and keeps small structured details (an old
-- and a new role, a period); never a value, a message body or a secret. Idempotent, so it can be applied again.
create table if not exists audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  at timestamptz not null default now(),
  -- No foreign key: the record outlives the person, so the name is kept as it was then.
  actor_id text check (char_length(actor_id) <= 64),
  actor_name text not null check (char_length(actor_name) between 1 and 120),
  -- The Access Key a program acted with, if any; no foreign key, for the same reason.
  access_key_id bigint,
  kind text not null check (kind ~ '^[a-z_]+\.[a-z_]+$' and char_length(kind) <= 60),
  object_type text check (object_type ~ '^[a-z_]+$' and char_length(object_type) <= 30),
  object_id text check (char_length(object_id) <= 64),
  -- The object's name when it happened; readers who do not see that Metric, dashboard or deck get no name.
  object_name text check (char_length(object_name) <= 120),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 2048)
);
create index if not exists audit_events_workspace_id_idx on audit_events (workspace_id, id desc);
create index if not exists audit_events_workspace_at_idx on audit_events (workspace_id, at);
create index if not exists audit_events_workspace_actor_idx on audit_events (workspace_id, actor_id, id desc);
create index if not exists audit_events_workspace_object_idx on audit_events (workspace_id, object_type, object_id);
alter table audit_events enable row level security;

-- The database itself keeps the log add-only, whatever code runs against it with the service role.
create or replace function audit_events_add_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and (old.at < now() - interval '730 days' or not exists (select 1 from workspaces w where w.id = old.workspace_id)) then
    return old;
  end if;
  raise exception 'The Audit Log is add-only.' using errcode = 'ZF403';
end;
$$;

drop trigger if exists audit_events_add_only on audit_events;
create trigger audit_events_add_only before update or delete on audit_events for each row execute function audit_events_add_only();

-- The time is the database's own: a backdated event could otherwise be removed at once as past the retention.
create or replace function audit_events_stamp() returns trigger language plpgsql as $$
begin
  new.at := now();
  return new;
end;
$$;

drop trigger if exists audit_events_stamp on audit_events;
create trigger audit_events_stamp before insert on audit_events for each row execute function audit_events_stamp();

create or replace function audit_events_no_truncate() returns trigger language plpgsql as $$
begin
  raise exception 'The Audit Log is add-only.' using errcode = 'ZF403';
end;
$$;

drop trigger if exists audit_events_no_truncate on audit_events;
create trigger audit_events_no_truncate before truncate on audit_events for each statement execute function audit_events_no_truncate();
