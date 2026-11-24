-- Installation Announcements (spec 0054, ticket #1085; GLOSSARY: Announcement, Installation Admin). One plain line an
-- Installation Admin tells everyone for a while: text, an optional https link with a label, a level, a window, an
-- audience, whether the sign-in page shows it and whether a person may dismiss it. The built-in demo notice is not a row.
-- No browser role has any grant: Row Level Security is on with no policy, and the core (service role) reads and writes
-- after checking the Installation Admin. The one unauthenticated read, for the sign-in page, is the function at the end.

create table installation_announcements (
  id uuid primary key default gen_random_uuid(),
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
  audience text not null default 'everyone' check (audience in ('everyone', 'demo')),
  -- Also shown on the sign-in page, to people who are not signed in. Only for everyone: a demo-only line has no place there.
  public boolean not null default false,
  created_by text references profiles(id) on delete set null,
  updated_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((link_url is null) = (link_label is null)),
  check (starts_at is null or ends_at is null or ends_at > starts_at),
  check (not public or audience = 'everyone')
);
create index on installation_announcements (active, public);
alter table installation_announcements enable row level security;
revoke all on table installation_announcements from public, anon, authenticated;

-- Before a write: stamps the time, and keeps at most 20 active Announcements that have not ended. The count and the write
-- are one transaction under one lock, so two writes cannot both pass the cap.
create or replace function installation_announcements_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.active and (new.ends_at is null or new.ends_at > now()) then
    perform pg_advisory_xact_lock(hashtextextended('installation-announcements', 0));
    if (select count(*) from installation_announcements a
        where a.active and (a.ends_at is null or a.ends_at > now()) and a.id <> new.id) >= 20 then
      raise exception using errcode = 'ZF4A1', message = 'installation_announcements_cap';
    end if;
  end if;
  return new;
end $$;
create trigger installation_announcements_guard before insert or update on installation_announcements
  for each row execute function installation_announcements_guard();

-- What the sign-in page may read: the lines that are public, switched on and inside their window, with the text, the link
-- and the level and nothing else (no id, no person, no time). Most urgent first. Called by the core for the sign-in page only.
create or replace function public_installation_announcements()
returns table (text text, link_url text, link_label text, level text)
language sql stable security definer set search_path = public as $$
  select a.text, a.link_url, a.link_label, a.level
  from installation_announcements a
  where a.public and a.active
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at is null or a.ends_at > now())
  order by (a.level = 'warning') desc, a.starts_at nulls first, a.created_at, a.id
  limit 20
$$;
revoke execute on function public_installation_announcements() from public, anon, authenticated;
grant execute on function public_installation_announcements() to service_role;

-- Closed to the demo's visitors (spec 0051): a visitor never writes an Announcement. There is no demo seed.
insert into demo_closed_tables (table_name, reason) values
  ('installation_announcements', 'Only an Installation Admin writes an Announcement; a visitor never does (spec 0054).')
on conflict (table_name) do nothing;
