-- Assistants connected by OAuth (spec 0023, ADR 0011, GLOSSARY: Access Key). Ziffr is its own authorization server:
-- an assistant registers (oauth_clients), a person approves it on the consent screen, which makes an Access Key of
-- the kind `assistant` and a one-time code (oauth_codes), and the assistant trades the code for tokens
-- (assistant_tokens). A connection is that Access Key, so revocation, membership, scopes, the Access Log and the
-- limits hold for it as for any key. Only SHA-256 hashes of codes and tokens are stored.

-- Programs registered by dynamic client registration (RFC 7591). Public clients only: no secret. Their name and
-- addresses are whatever the program sent, so they are shown as untrusted text. A registration that never led to
-- a connection is deleted after a day (forget_unused_oauth_clients); one a key refers to is never deleted.
create table oauth_clients (
  id text primary key check (id ~ '^zc_[A-Za-z0-9_-]{22}$'),
  name text not null check (char_length(name) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index on oauth_clients (created_at) where used_at is null;
alter table oauth_clients enable row level security;

-- What a key is: a program's (made on the Team page) or an assistant's (made by connecting it). Feed Keys keep
-- their feed_id and the kind `program`.
alter table access_keys add column kind text not null default 'program' check (kind in ('program', 'assistant'));
-- Restrict: a connection ends by being revoked, never by its registration going away.
alter table access_keys add column oauth_client_id text references oauth_clients(id) on delete restrict;
alter table access_keys add constraint access_keys_assistant_is_a_persons check (kind = 'program' or (feed_id is null and oauth_client_id is not null));

-- Codes from the consent screen: ten minutes, once, for the client, address, PKCE challenge and resource they were
-- made for. A code that is presented again ends the connection it made (OAuth 2.1, 4.1.3).
create table oauth_codes (
  code_hash text primary key check (char_length(code_hash) = 64),
  client_id text not null references oauth_clients(id) on delete cascade,
  access_key_id bigint not null references access_keys(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  resource text,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index on oauth_codes (access_key_id);
create index on oauth_codes (expires_at);
alter table oauth_codes enable row level security;

-- An assistant's tokens: access tokens live an hour, a refresh token lives as long as its key and works once; a
-- used one presented again ends the connection.
create table assistant_tokens (
  token_hash text primary key check (char_length(token_hash) = 64),
  access_key_id bigint not null references access_keys(id) on delete cascade,
  kind text not null check (kind in ('access', 'refresh')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on assistant_tokens (access_key_id);
alter table assistant_tokens enable row level security;

-- Registrations and consent screens per network address and for the Installation as a whole, an hour at a time.
-- Only hashes of network addresses, kept a day, as for sign-in links.
create table oauth_requests (
  kind text not null check (kind in ('register', 'authorize')),
  network_key text check (network_key is null or char_length(network_key) = 64),
  at timestamptz not null default now()
);
create index on oauth_requests (kind, network_key, at);
create index on oauth_requests (kind, at);
alter table oauth_requests enable row level security;

-- Records this request only when the network address and the Installation are both under their limits for the
-- last hour, and clears counts older than a day. Locks make requests at the same
-- moment count one after the other.
create or replace function claim_oauth_request(p_kind text, p_network_key text, p_per_network int, p_total int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  by_network int := 0;
  total int;
begin
  perform pg_advisory_xact_lock(hashtext('oauth:' || p_kind));
  delete from oauth_requests where at < now() - interval '1 day';
  if p_network_key is not null then
    select count(*) into by_network from oauth_requests where kind = p_kind and network_key = p_network_key and at > now() - interval '1 hour';
  end if;
  select count(*) into total from oauth_requests where kind = p_kind and at > now() - interval '1 hour';
  if by_network >= p_per_network or total >= p_total then return false; end if;
  insert into oauth_requests (kind, network_key) values (p_kind, p_network_key);
  return true;
end $$;
revoke execute on function claim_oauth_request(text, text, int, int) from public, anon, authenticated;
grant execute on function claim_oauth_request(text, text, int, int) to service_role;

-- Clears registrations older than a day that no key refers to, and codes long past. A statement of its own, called
-- after the claim and allowed to fail, so tidying can never stop a registration.
create or replace function forget_unused_oauth_clients()
returns void language sql security definer set search_path = public as $$
  delete from oauth_codes where expires_at < now() - interval '1 day';
  delete from oauth_clients c where c.used_at is null and c.created_at < now() - interval '1 day'
    and not exists (select 1 from access_keys k where k.oauth_client_id = c.id);
$$;
revoke execute on function forget_unused_oauth_clients() from public, anon, authenticated;
grant execute on function forget_unused_oauth_clients() to service_role;

-- A person's approval on the consent screen, in one transaction: the Access Key of the kind `assistant`, the
-- registration marked as used, and the one-time code. The core has checked the person, scopes and end date; the
-- trial trigger below still has the last word. Answers the key's id.
create or replace function make_assistant_connection(
  p_workspace uuid, p_person text, p_client text, p_name text, p_prefix text, p_secret_hash text, p_scopes text[],
  p_expires_on date, p_code_hash text, p_redirect_uri text, p_code_challenge text, p_resource text)
returns bigint language plpgsql security definer set search_path = public as $$
declare key_id bigint;
begin
  insert into access_keys (workspace_id, created_by, name, prefix, secret_hash, scopes, expires_on, kind, oauth_client_id)
    values (p_workspace, p_person, p_name, p_prefix, p_secret_hash, p_scopes, p_expires_on, 'assistant', p_client)
    returning id into key_id;
  update oauth_clients set used_at = now() where id = p_client and used_at is null;
  insert into oauth_codes (code_hash, client_id, access_key_id, redirect_uri, code_challenge, resource, expires_at)
    values (p_code_hash, p_client, key_id, p_redirect_uri, p_code_challenge, p_resource, now() + interval '10 minutes');
  return key_id;
end $$;
revoke execute on function make_assistant_connection(uuid, text, text, text, text, text, text[], date, text, text, text, text) from public, anon, authenticated;
grant execute on function make_assistant_connection(uuid, text, text, text, text, text, text[], date, text, text, text, text) to service_role;

-- A Trial Workspace (spec 0021) may connect one assistant that works at a time, besides its two Access Keys; none
-- works past the trial's last day. Replaces the function of 20261209130000 with the assistant's own count.
create or replace function access_keys_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
declare ends timestamptz;
begin
  select trial_ends_at into ends from workspaces where id = new.workspace_id for update;
  if ends is null then return new; end if;
  new.expires_on := least(new.expires_on, (ends at time zone 'UTC')::date);
  if new.kind = 'assistant' then
    if (select count(*) from access_keys where workspace_id = new.workspace_id and kind = 'assistant' and revoked_at is null and expires_on >= current_date) >= 1 then
      raise exception using errcode = 'ZF434', message = 'assistants_per_trial';
    end if;
  elsif new.feed_id is null then
    if (select count(*) from access_keys where workspace_id = new.workspace_id and feed_id is null and kind = 'program' and revoked_at is null and expires_on >= current_date) >= 2 then
      raise exception using errcode = 'ZF431', message = 'access_keys_per_trial';
    end if;
  elsif (select count(*) from access_keys where feed_id = new.feed_id and revoked_at is null and expires_on >= current_date) >= 2 then
    raise exception using errcode = 'ZF432', message = 'feed_keys_per_feed';
  end if;
  return new;
end $$;
