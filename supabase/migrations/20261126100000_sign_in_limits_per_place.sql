-- Sign-in limits counted per address and place together (spec 0009, ticket #129). Counting an address alone at a low
-- limit let anyone use up a victim's links from anywhere; now the low limit is per address and network address
-- together, and the address alone has a much higher ceiling. Only hashes, as before.
alter table sign_in_requests add column if not exists pair_key text check (pair_key is null or char_length(pair_key) = 64);
create index if not exists sign_in_requests_pair on sign_in_requests (pair_key, at) where pair_key is not null;

drop function if exists claim_sign_in_link(text, text, int, int);

-- Records this request only when the address and network together, the address alone and the network alone are all
-- under their limits for the last hour. Locks per key make requests at the same moment count one after the other.
create or replace function claim_sign_in_link(p_address_key text, p_pair_key text, p_network_key text, p_per_pair int, p_per_address int, p_per_network int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  by_pair int;
  by_address int;
  by_network int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('sign-in:' || p_address_key));
  if p_network_key is not null then perform pg_advisory_xact_lock(hashtext('sign-in:' || p_network_key)); end if;
  delete from sign_in_requests where at < now() - interval '1 day';
  select count(*) into by_pair from sign_in_requests where pair_key = p_pair_key and at > now() - interval '1 hour';
  select count(*) into by_address from sign_in_requests where address_key = p_address_key and at > now() - interval '1 hour';
  if p_network_key is not null then
    select count(*) into by_network from sign_in_requests where network_key = p_network_key and at > now() - interval '1 hour';
  end if;
  if by_pair >= p_per_pair or by_address >= p_per_address or by_network >= p_per_network then return false; end if;
  insert into sign_in_requests (address_key, pair_key, network_key) values (p_address_key, p_pair_key, p_network_key);
  return true;
end $$;
revoke execute on function claim_sign_in_link(text, text, text, int, int, int) from public, anon, authenticated;
grant execute on function claim_sign_in_link(text, text, text, int, int, int) to service_role;
