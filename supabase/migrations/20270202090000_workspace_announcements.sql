-- Workspace Announcements (spec 0054, ticket #1089; GLOSSARY: Announcement, Workspace Admin). One plain line an Owner or
-- Admin of a Workspace tells its people for a while: the same fields as an Installation Announcement without an audience
-- and without the sign-in page. A row belongs to one Workspace and goes with it. No browser role has any grant: Row Level
-- Security is on with no policy, and the core (service role) reads and writes after checking the Workspace and the role.

create table workspace_announcements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- Plain text, one line: the core removes control and bidirectional characters before it gets here; this is the last line.
  text text not null check (char_length(text) between 1 and 280 and text !~ '[[:cntrl:]]'),
  -- Both or neither; https only (the core parses it, this keeps a bad row out whatever writes it).
  link_url text check (char_length(link_url) <= 500 and link_url ~ '^https://[^[:space:][:cntrl:]]+$'),
  link_label text check (char_length(link_label) between 1 and 40 and link_label !~ '[[:cntrl:]]'),
  level text not null default 'info' check (level in ('info', 'warning')),
  starts_at timestamptz,
  ends_at timestamptz,
  -- The switch: off keeps the row for later.
  active boolean not null default true,
  dismissible boolean not null default true,
  created_by text references profiles(id) on delete set null,
  updated_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((link_url is null) = (link_label is null)),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index on workspace_announcements (workspace_id, active);
alter table workspace_announcements enable row level security;
revoke all on table workspace_announcements from public, anon, authenticated;

-- Before a write: stamps the time, keeps the row in its Workspace, and keeps at most 10 active Announcements per Workspace
-- that have not ended. The count and the write are one transaction under one lock per Workspace, so two writes cannot
-- both pass the cap, and one Workspace's writes never wait for another's.
create or replace function workspace_announcements_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- A row never moves to another Workspace.
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_announcements_move' using errcode = 'ZF4A3';
  end if;
  if new.active and (new.ends_at is null or new.ends_at > now()) then
    perform pg_advisory_xact_lock(hashtextextended('workspace-announcements:' || new.workspace_id::text, 0));
    if (select count(*) from workspace_announcements a
        where a.workspace_id = new.workspace_id and a.active and (a.ends_at is null or a.ends_at > now()) and a.id <> new.id) >= 10 then
      raise exception using errcode = 'ZF4A2', message = 'workspace_announcements_cap';
    end if;
  end if;
  return new;
end $$;
create trigger workspace_announcements_guard before insert or update on workspace_announcements
  for each row execute function workspace_announcements_guard();

-- Closed to the demo's visitors (spec 0051): a visitor never writes an Announcement. There is no demo seed.
insert into demo_closed_tables (table_name, reason) values
  ('workspace_announcements', 'Only an Owner or Admin of a Workspace writes its Announcements; a visitor never does (spec 0054).')
on conflict (table_name) do nothing;
