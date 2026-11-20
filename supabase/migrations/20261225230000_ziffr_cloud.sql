-- The Ziffr Cloud API (spec 0029, ticket #267; GLOSSARY: Ziffr Cloud, Workspace Limit). Every signed call is claimed
-- here before it does anything: a signature seen before is a replay and is refused, and at most p_limit calls a
-- minute pass. Signatures are kept fifteen minutes, longer than the ten minutes in which one can pass (five either
-- way, by Ziffr Cloud's clock), with room for clocks that differ, so a replay can never come back.
create table cloud_api_calls (
  signature text primary key check (char_length(signature) = 64),
  at timestamptz not null default now()
);
create index cloud_api_calls_at on cloud_api_calls (at);
alter table cloud_api_calls enable row level security;
revoke all on table cloud_api_calls from public, anon, authenticated;

-- 'ok' for a call that may run, 'replay' for a signature seen before, 'limit' over p_limit calls a minute. One lock
-- for all calls, so parallel calls are counted in turn.
create or replace function claim_cloud_call(p_signature text, p_limit int) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('claim_cloud_call'));
  delete from cloud_api_calls where at < now() - interval '15 minutes';
  if exists (select 1 from cloud_api_calls where signature = p_signature) then return 'replay'; end if;
  if (select count(*) from cloud_api_calls where at > now() - interval '1 minute') >= p_limit then return 'limit'; end if;
  insert into cloud_api_calls (signature) values (p_signature);
  return 'ok';
end $$;

-- A handover token's nonce is Ziffr Cloud's to keep; Ziffr remembers none. Nothing else is stored.

revoke execute on function claim_cloud_call(text, int) from public, anon, authenticated;
grant execute on function claim_cloud_call(text, int) to service_role;
