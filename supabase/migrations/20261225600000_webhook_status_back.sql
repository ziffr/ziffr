-- Status back into Ziffr (spec 0034, ticket #402; GLOSSARY: Webhook): a Webhook's recipe says which external task an
-- Action is (a link) and reports it done, replied to, answered or reopened. This adds what that needs: the links
-- (sealed with the Workspace Key, so a dump holds no external id or address), the claims that make a replayed request
-- change nothing and bound a Webhook to 60 requests a minute, and a word on a Thread message saying which Webhook it
-- came through. Service role only: row level security stays on with no policies.

-- Which external task an Action is, per Webhook and system. `external_id` and `url` are sealed (spec 0028, bound to the
-- row, so the core makes the id first); `external_hash` is the blind index of (Webhook, system, external id), which finds
-- an Action by its external id and keeps one external task from being two Actions.
create table webhook_external_ids (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  webhook_id uuid not null references webhooks(id) on delete cascade,
  action_id int not null references actions(id) on delete cascade,
  system text not null check (system ~ '^[A-Za-z0-9-]{1,40}$'),
  external_id text not null check (char_length(external_id) <= 1500),
  url text check (char_length(url) <= 6000),
  external_hash text not null check (char_length(external_hash) <= 200),
  created_at timestamptz not null default now(),
  unique (webhook_id, action_id, system),
  unique (webhook_id, external_hash)
);
create index webhook_external_ids_action_idx on webhook_external_ids (action_id);
alter table webhook_external_ids enable row level security;
select attach_demo_guard('webhook_external_ids');

-- Links an Action to an external task for one Webhook, in one step under a lock of the Action: linking the same
-- system again replaces the earlier id, the same external task for another Action is refused ('taken'), and no Action has
-- more than p_max links ('limit'). The row is made new each time, since its sealed values are bound to its id.
create or replace function link_webhook_external(p_id uuid, p_ws uuid, p_webhook uuid, p_action int, p_system text, p_external text, p_url text, p_hash text, p_hashes text[], p_max int) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('webhook_link:' || p_action::text));
  if exists (select 1 from webhook_external_ids where webhook_id = p_webhook and external_hash = any(p_hashes) and not (action_id = p_action and system = p_system)) then return 'taken'; end if;
  if not exists (select 1 from webhook_external_ids where webhook_id = p_webhook and action_id = p_action and system = p_system)
     and (select count(*) from webhook_external_ids where webhook_id = p_webhook and action_id = p_action) >= p_max then return 'limit'; end if;
  delete from webhook_external_ids where webhook_id = p_webhook and action_id = p_action and system = p_system;
  insert into webhook_external_ids (id, workspace_id, webhook_id, action_id, system, external_id, url, external_hash) values (p_id, p_ws, p_webhook, p_action, p_system, p_external, p_url, p_hash);
  return 'ok';
exception when unique_violation then
  -- The same external task linked to another Action at the same moment (the lock is per Action).
  return 'taken';
end $$;
revoke execute on function link_webhook_external(uuid, uuid, uuid, int, text, text, text, text, text[], int) from public, anon, authenticated;
grant execute on function link_webhook_external(uuid, uuid, uuid, int, text, text, text, text, text[], int) to service_role;

-- A request a Webhook signed, claimed by a hash of its timestamp and signature (the parts the signature covers, so a replay
-- changes nothing whatever header it carries; the discipline of Slack's event_id),
-- and counted, so one Webhook makes at most p_max requests a minute. Kept 15 minutes: the signature itself is good for
-- five. Holds no word of the Workspace.
create table webhook_inbound_claims (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  webhook_id uuid not null references webhooks(id) on delete cascade,
  delivery_id text not null check (char_length(delivery_id) <= 100),  -- the hash, never a word of the request
  created_at timestamptz not null default now(),
  primary key (webhook_id, delivery_id)
);
create index webhook_inbound_claims_recent_idx on webhook_inbound_claims (webhook_id, created_at);
alter table webhook_inbound_claims enable row level security;
select attach_demo_guard('webhook_inbound_claims');

-- Takes one request: 'limit' when the Webhook already made p_max in the last minute, 'replay' when this delivery id was
-- taken before, else 'ok'. One lock per Webhook, so requests at once cannot pass the limit together.
create or replace function claim_webhook_inbound(p_ws uuid, p_webhook uuid, p_delivery text, p_max int) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('webhook_in:' || p_webhook::text));
  delete from webhook_inbound_claims where webhook_id = p_webhook and created_at < now() - interval '15 minutes';
  if (select count(*) from webhook_inbound_claims where webhook_id = p_webhook and created_at > now() - interval '1 minute') >= p_max then return 'limit'; end if;
  insert into webhook_inbound_claims (workspace_id, webhook_id, delivery_id) values (p_ws, p_webhook, p_delivery) on conflict do nothing;
  get diagnostics n = row_count;
  return case when n = 0 then 'replay' else 'ok' end;
end $$;
revoke execute on function claim_webhook_inbound(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function claim_webhook_inbound(uuid, uuid, text, int) to service_role;

-- The Webhook a Thread message came through (its name then, one line), shown as "via <name>". Never read as a command.
alter table thread_messages add column via text check (char_length(via) <= 80);

-- What a Webhook was sent, to answer "was this Action ever sent to it" quickly.
create index webhook_sends_action_idx on webhook_sends (webhook_id, action_id) where action_id is not null;
