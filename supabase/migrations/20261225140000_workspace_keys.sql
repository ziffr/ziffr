-- Workspace Keys (spec 0028, ticket #245; GLOSSARY: Workspace Key; ADR 0012). Each Workspace's key, stored only
-- wrapped: AES-256-GCM under a key the core derives from ZIFFR_SECRETS_KEY (or a later KeyWrapper), bound to the
-- Workspace and the version. Never a key in clear: the database cannot open what the core seals with it. Only the
-- service role reaches the table. A Workspace has one current version (retired_at null) and may keep older ones
-- while its data is re-encrypted; deleting a Workspace destroys its keys first (ticket #249), and the cascade below
-- makes sure none outlives it.
create table workspace_keys (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  version integer not null check (version between 1 and 999999999),
  -- "k1.<iv>.<ciphertext>.<tag>" or a later wrapper's format; 32 bytes of key wrap to well under 200 characters.
  wrapped text not null check (char_length(wrapped) between 1 and 2048),
  -- The KeyWrapper that wrapped it ("installation" in the open-source core; ee/ may add others).
  wrapper text not null check (wrapper ~ '^[a-z][a-z0-9-]{0,39}$'),
  -- Which Installation key wrapped it: a fingerprint derived from that key, never the key. Lets the Installation
  -- settings page say whether any key is still wrapped under ZIFFR_SECRETS_KEY_PREVIOUS.
  wrapped_under text check (wrapped_under ~ '^[0-9a-f]{16}$'),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  primary key (workspace_id, version),
  -- The demo's data is made up and public: it has no Workspace Key (spec 0028).
  constraint workspace_keys_not_demo check (workspace_id <> 'd3e00000-0000-4000-8000-000000000001')
);
create unique index workspace_keys_one_current on workspace_keys (workspace_id) where retired_at is null;
alter table workspace_keys enable row level security;
revoke all on table workspace_keys from public, anon, authenticated;

-- When the Workspace was first given a key. Set together with that key and never cleared, so a Workspace whose key
-- rows are gone (destroyed on deletion, or lost) is refused instead of quietly given a new key, under which its
-- sealed values would read as empty and new ones would be sealed for nobody who expects them.
alter table workspaces add column keyed_at timestamptz;

-- A Workspace's first key and its mark, in one step; a second call, from another process at the same moment,
-- changes nothing. Refused once the Workspace was keyed before: a lost or destroyed key is not replaced here.
create function create_first_workspace_key(p_workspace uuid, p_wrapped text, p_wrapper text, p_under text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  marked timestamptz;
begin
  select keyed_at into marked from workspaces where id = p_workspace for update;
  if not found then
    raise exception 'No such workspace.';
  end if;
  if exists (select 1 from workspace_keys where workspace_id = p_workspace) then
    return true;
  end if;
  if marked is not null then
    return false;
  end if;
  insert into workspace_keys (workspace_id, version, wrapped, wrapper, wrapped_under) values (p_workspace, 1, p_wrapped, p_wrapper, p_under);
  update workspaces set keyed_at = now() where id = p_workspace;
  return true;
end;
$$;
revoke all on function create_first_workspace_key(uuid, text, text, text) from public, anon, authenticated;

-- A database that ran an earlier draft of this migration may hold keys without the mark: mark those Workspaces too.
update workspaces set keyed_at = now() where keyed_at is null and id in (select workspace_id from workspace_keys);
