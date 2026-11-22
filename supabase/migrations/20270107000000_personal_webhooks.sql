-- Personal Webhooks (spec 0037, ticket #641; GLOSSARY: Personal Webhook): a Webhook that one person adds for themselves
-- in one Workspace. It is a row of `webhooks` with its person in `owner_id` (null for a Workspace's Webhook), so the
-- sealed address and secret, the log, the retries and the Workspace Key's changes work as they do for every Webhook.
-- Ends with the person: the row goes when their profile does, and (below) when they leave the Workspace or become a Guest.
alter table webhooks add column owner_id text references profiles(id) on delete cascade;
create index webhooks_owner_idx on webhooks (workspace_id, owner_id) where owner_id is not null;

-- The Workspace's switch: People may add their own Webhooks. Off for every Workspace, existing ones included; off pauses
-- every Personal Webhook of the Workspace.
alter table workspaces add column personal_webhooks_allowed boolean not null default false;

-- A Workspace's Webhooks are counted without the personal ones (the Workspace's limit counts its own only).
create or replace function create_webhook(p_id uuid, p_ws uuid, p_name text, p_url text, p_secret text, p_events text[], p_by text, p_max int) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('webhooks:' || p_ws::text));
  if exists (select 1 from workspaces where id = p_ws and trial_ends_at is not null) then return 'trial'; end if;
  if (select count(*) from webhooks where workspace_id = p_ws and owner_id is null) >= p_max then return 'limit'; end if;
  insert into webhooks (id, workspace_id, name, url, secret, events, created_by) values (p_id, p_ws, p_name, p_url, p_secret, p_events, p_by);
  return 'ok';
end $$;

-- Makes one Personal Webhook in one step under a lock of the person, so two made at once cannot pass the limit together.
-- Returns 'ok', 'off' (the Workspace does not allow them), 'role' (only Owners, Admins and Members add one) or 'limit'.
create or replace function create_personal_webhook(p_id uuid, p_ws uuid, p_owner text, p_name text, p_url text, p_secret text, p_events text[], p_max int) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('personal-webhooks:' || p_ws::text || ':' || p_owner));
  if not exists (select 1 from workspaces where id = p_ws and personal_webhooks_allowed) then return 'off'; end if;
  if not exists (select 1 from memberships where workspace_id = p_ws and user_id = p_owner and role in ('owner', 'admin', 'member')) then return 'role'; end if;
  if (select count(*) from webhooks where workspace_id = p_ws and owner_id = p_owner) >= p_max then return 'limit'; end if;
  insert into webhooks (id, workspace_id, name, url, secret, events, created_by, owner_id) values (p_id, p_ws, p_name, p_url, p_secret, p_events, p_owner, p_owner);
  return 'ok';
end $$;
revoke execute on function create_personal_webhook(uuid, uuid, text, text, text, text, text[], int) from public, anon, authenticated;
grant execute on function create_personal_webhook(uuid, uuid, text, text, text, text, text[], int) to service_role;

-- Sends of one person's Personal Webhooks per day (UTC), beside the Workspace's own count.
create table webhook_person_send_days (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (workspace_id, person_id, day)
);
alter table webhook_person_send_days enable row level security;
select attach_demo_guard('webhook_person_send_days');

-- Takes one slot of the person's day and one of the Workspace's, together or neither (under a lock of the Workspace's
-- day, so the Workspace's cap holds for the sends of both kinds): every send of a Personal Webhook counts against both.
create or replace function take_personal_webhook_send_slot(p_workspace uuid, p_person text, p_person_cap int, p_workspace_cap int) returns boolean
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; mine int; ours int;
begin
  perform pg_advisory_xact_lock(hashtext('webhook-slots:' || p_workspace::text));
  select n into mine from webhook_person_send_days where workspace_id = p_workspace and person_id = p_person and day = d;
  select n into ours from webhook_send_days where workspace_id = p_workspace and day = d;
  if coalesce(mine, 0) >= p_person_cap or coalesce(ours, 0) >= p_workspace_cap then return false; end if;
  insert into webhook_person_send_days (workspace_id, person_id, day, n) values (p_workspace, p_person, d, 1)
    on conflict (workspace_id, person_id, day) do update set n = webhook_person_send_days.n + 1;
  insert into webhook_send_days (workspace_id, day, n) values (p_workspace, d, 1)
    on conflict (workspace_id, day) do update set n = webhook_send_days.n + 1;
  return true;
end $$;
revoke execute on function take_personal_webhook_send_slot(uuid, text, int, int) from public, anon, authenticated;
grant execute on function take_personal_webhook_send_slot(uuid, text, int, int) to service_role;

-- A person's Webhooks end with their place in the Workspace: removed from it (the handover deletes the membership) or
-- made a Guest. The core records the Audit Log entry before it calls those; this is the net under every other path.
create or replace function end_personal_webhooks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from webhooks where workspace_id = old.workspace_id and owner_id = old.user_id;
    return old;
  end if;
  if new.role = 'guest' then delete from webhooks where workspace_id = new.workspace_id and owner_id = new.user_id; end if;
  return new;
end $$;
create trigger memberships_end_personal_webhooks after delete or update of role on memberships
  for each row execute function end_personal_webhooks();
