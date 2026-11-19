-- Limits on replies by email (spec 0004; docs/guides/email.md): anyone can send mail to a reply domain, and every
-- message forwarded to Ziffr costs a lookup. Counted per sender (a hash of the inbox it came from) and for the whole
-- Installation, over the last hour, before anything else is read. Only hashes, kept for a day, as for sign-in links.
create table if not exists inbound_requests (
  id bigint generated always as identity primary key,
  sender_key text not null check (char_length(sender_key) = 64),
  at timestamptz not null default now()
);
create index if not exists inbound_requests_sender on inbound_requests (sender_key, at);
create index if not exists inbound_requests_at on inbound_requests (at);
alter table inbound_requests enable row level security;

-- Records this message only when its sender and the Installation are both under their limits for the last hour. A
-- lock per sender, and one for the total, make messages arriving together count one after the other.
create or replace function claim_inbound_email(p_sender_key text, p_per_sender int, p_total int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  by_sender int;
  total int;
begin
  perform pg_advisory_xact_lock(hashtext('inbound:' || p_sender_key));
  perform pg_advisory_xact_lock(hashtext('inbound:total'));
  delete from inbound_requests where at < now() - interval '1 day';
  select count(*) into by_sender from inbound_requests where sender_key = p_sender_key and at > now() - interval '1 hour';
  select count(*) into total from inbound_requests where at > now() - interval '1 hour';
  if by_sender >= p_per_sender or total >= p_total then return false; end if;
  insert into inbound_requests (sender_key) values (p_sender_key);
  return true;
end $$;
revoke all on table inbound_requests from public, anon, authenticated;
revoke execute on function claim_inbound_email(text, int, int) from public, anon, authenticated;
grant execute on function claim_inbound_email(text, int, int) to service_role;
