-- Webhooks (spec 0034, ticket #399; GLOSSARY: Webhook): an https address a Workspace's Owner or Admin sets, with the
-- events it gets. This is the table and its limits; nothing is sent yet (ticket 3). A Webhook belongs to the
-- Workspace, like a Feed. The address, the secret and the previous secret (kept for 24 hours after a replacement so a
-- receiver can switch without a gap) are sealed with the Workspace Key (spec 0028), bound to the row, so the core makes
-- the id first. Service role only: row level security stays on with no policies.
create table webhooks (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- Sealed. 6,000 characters leave room for the sealing of an address of at most 2,000.
  url text not null check (char_length(url) <= 6000),
  secret text not null check (char_length(secret) <= 600),
  secret_previous text check (char_length(secret_previous) <= 600),
  secret_previous_until timestamptz,
  events text[] not null default '{}' check (cardinality(events) <= 20),
  -- Set when switched off: by an Owner or Admin ('owner'), by the failing sends (spec 0034, ticket 3) or by a 410 answer.
  disabled_at timestamptz,
  disabled_reason text check (disabled_reason in ('owner', 'failing', 'gone')),
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((disabled_at is null) = (disabled_reason is null)),
  check ((secret_previous is null) = (secret_previous_until is null))
);
create index webhooks_workspace_idx on webhooks (workspace_id);
alter table webhooks enable row level security;
select attach_demo_guard('webhooks');

-- Makes one Webhook within the limit, in one step under a lock of the Workspace, so Webhooks made at once cannot pass
-- it together. Never in a Trial Workspace (a free trial that can make the server call any address is an abuse path).
-- Returns 'ok', 'trial' or 'limit'. The id was taken first (the address and secret are sealed for it).
create or replace function create_webhook(p_id uuid, p_ws uuid, p_name text, p_url text, p_secret text, p_events text[], p_by text, p_max int) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('webhooks:' || p_ws::text));
  if exists (select 1 from workspaces where id = p_ws and trial_ends_at is not null) then return 'trial'; end if;
  if (select count(*) from webhooks where workspace_id = p_ws) >= p_max then return 'limit'; end if;
  insert into webhooks (id, workspace_id, name, url, secret, events, created_by) values (p_id, p_ws, p_name, p_url, p_secret, p_events, p_by);
  return 'ok';
end $$;
revoke execute on function create_webhook(uuid, uuid, text, text, text, text[], text, int) from public, anon, authenticated;
grant execute on function create_webhook(uuid, uuid, text, text, text, text[], text, int) to service_role;
