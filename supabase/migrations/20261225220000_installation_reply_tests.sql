-- The replies-by-email test on the Installation Settings page (spec 0025, #198; GLOSSARY: Installation Settings,
-- Installation Admin), like the test email for Mail and the round trip for Telegram. Ziffr emails the admin with a
-- reply address of the test's own; their reply, forwarded and signed by the inbound provider, proves the whole way
-- back. Only the reply token's SHA-256 hash is kept, for one use within thirty minutes, with what the reply showed:
-- whether it came from the admin's own address and whether the provider vouched for the sender. It is no Delivery:
-- no Workspace, Thread or value ever reads these rows. Only the service role reaches the table.
create table installation_reply_tests (
  id bigint generated always as identity primary key,
  person_id text not null references profiles(id) on delete cascade,
  -- Null once a reply was taken: the address works once.
  token_hash text unique check (char_length(token_hash) = 64),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz,
  from_admin boolean,
  vouched boolean
);
create index on installation_reply_tests (person_id, created_at desc);
alter table installation_reply_tests enable row level security;
revoke all on table installation_reply_tests from public, anon, authenticated;

-- Makes a test for the person when they made fewer than p_limit in the last hour, under a lock per person, so
-- parallel clicks count one after the other. Earlier unanswered tests of theirs stop working once a new one is made;
-- day-old tests go.
create or replace function make_installation_reply_test(p_person text, p_token_hash text, p_limit int)
returns bigint language plpgsql security definer set search_path = public as $$
declare made bigint;
begin
  perform pg_advisory_xact_lock(hashtext('installation:reply-test:' || p_person));
  delete from installation_reply_tests where created_at < now() - interval '1 day';
  -- The limit first: a refused click leaves the test that waits alone.
  if (select count(*) from installation_reply_tests where person_id = p_person and created_at > now() - interval '1 hour') >= p_limit then
    return null;
  end if;
  update installation_reply_tests set token_hash = null where person_id = p_person and received_at is null;
  insert into installation_reply_tests (person_id, token_hash) values (p_person, p_token_hash) returning id into made;
  return made;
end $$;
revoke execute on function make_installation_reply_test(text, text, int) from public, anon, authenticated;
grant execute on function make_installation_reply_test(text, text, int) to service_role;
