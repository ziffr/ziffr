-- Limits on replies by email (spec 0004; docs/guides/email.md): anyone can send mail to a reply domain. Counted over
-- the last hour per key, only as hashes, kept for a day, as for sign-in links. The core chooses the keys: per sender,
-- split by whether the receiving provider vouched for the sender (a forged From then only uses up the forged bucket,
-- never the real person's), and one for the whole Installation that only mail naming a real reply address for its
-- recipient counts against (so junk cannot use up what real replies need).
create table if not exists inbound_requests (
  id bigint generated always as identity primary key,
  key text not null check (char_length(key) = 64),
  at timestamptz not null default now()
);
create index if not exists inbound_requests_key on inbound_requests (key, at);
create index if not exists inbound_requests_at on inbound_requests (at);
alter table inbound_requests enable row level security;

-- Records one more message for the key when it is under its limit for the last hour. A lock per key makes messages
-- arriving together count one after the other.
create or replace function claim_inbound_email(p_key text, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  used int;
begin
  perform pg_advisory_xact_lock(hashtext('inbound:' || p_key));
  delete from inbound_requests where at < now() - interval '1 day';
  select count(*) into used from inbound_requests where key = p_key and at > now() - interval '1 hour';
  if used >= p_limit then return false; end if;
  insert into inbound_requests (key) values (p_key);
  return true;
end $$;
revoke all on table inbound_requests from public, anon, authenticated;
revoke execute on function claim_inbound_email(text, int) from public, anon, authenticated;
grant execute on function claim_inbound_email(text, int) to service_role;
