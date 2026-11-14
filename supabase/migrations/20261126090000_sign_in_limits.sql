-- Ziffr's own limits on sign-in links (spec 0009, ticket #129). Supabase limits them too, but a self-hoster may set
-- that wide open; these hold whatever its settings say. Only SHA-256 hashes of the address and of the network
-- address are kept, for a day at most.
create table if not exists sign_in_requests (
  id bigint generated always as identity primary key,
  address_key text not null check (char_length(address_key) = 64),
  network_key text check (network_key is null or char_length(network_key) = 64),
  at timestamptz not null default now()
);
create index if not exists sign_in_requests_address on sign_in_requests (address_key, at);
create index if not exists sign_in_requests_network on sign_in_requests (network_key, at) where network_key is not null;
alter table sign_in_requests enable row level security;
revoke all on sign_in_requests from public, anon, authenticated;

-- Counts the last hour's links for the address and for the network address and records this one only when both are
-- under their limits. A lock per key makes two requests at the same moment count one after the other.
create or replace function claim_sign_in_link(p_address_key text, p_network_key text, p_per_address int, p_per_network int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  by_address int;
  by_network int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('sign-in:' || p_address_key));
  if p_network_key is not null then perform pg_advisory_xact_lock(hashtext('sign-in:' || p_network_key)); end if;
  delete from sign_in_requests where at < now() - interval '1 day';
  select count(*) into by_address from sign_in_requests where address_key = p_address_key and at > now() - interval '1 hour';
  if p_network_key is not null then
    select count(*) into by_network from sign_in_requests where network_key = p_network_key and at > now() - interval '1 hour';
  end if;
  if by_address >= p_per_address or by_network >= p_per_network then return false; end if;
  insert into sign_in_requests (address_key, network_key) values (p_address_key, p_network_key);
  return true;
end $$;
revoke execute on function claim_sign_in_link(text, text, int, int) from public, anon, authenticated;
grant execute on function claim_sign_in_link(text, text, int, int) to service_role;
