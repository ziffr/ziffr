-- The Telegram round trip test on the Installation Settings page (spec 0025; GLOSSARY: Installation Settings,
-- Installation Admin). An Installation Admin opens the bot with a one-time code; the bot sends a test message, and
-- a reply with a number proves that Telegram reaches Ziffr too. Only the code's SHA-256 hash is kept, for ten
-- minutes and one use; the chat is kept only while the test waits for its answer. It connects nobody to any
-- Workspace: these rows are not Telegram links and no Delivery reads them. Only the service role reaches the table.
create table installation_telegram_tests (
  id bigint generated always as identity primary key,
  person_id text not null references profiles(id) on delete cascade,
  -- Null once the code was used: it works once.
  code_hash text unique check (char_length(code_hash) = 64),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  sent_at timestamptz,
  answered_at timestamptz,
  -- Only while the test waits for its answer; cleared when it is answered or has run out.
  chat_id bigint,
  telegram_user_id bigint,
  message_id bigint
);
create index on installation_telegram_tests (person_id, created_at desc);
create index on installation_telegram_tests (chat_id, message_id) where chat_id is not null;
alter table installation_telegram_tests enable row level security;
revoke all on table installation_telegram_tests from public, anon, authenticated;

-- Makes a test for the person when they made fewer than p_limit in the last hour, under a lock per person, so
-- parallel clicks count one after the other. Older tests' chats are forgotten and day-old tests deleted on the way.
create or replace function make_installation_telegram_test(p_person text, p_code_hash text, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('installation:telegram-test:' || p_person));
  delete from installation_telegram_tests where created_at < now() - interval '1 day';
  update installation_telegram_tests set chat_id = null, telegram_user_id = null, message_id = null, code_hash = null
    where person_id = p_person and answered_at is null;
  if (select count(*) from installation_telegram_tests where person_id = p_person and created_at > now() - interval '1 hour') >= p_limit then
    return false;
  end if;
  insert into installation_telegram_tests (person_id, code_hash) values (p_person, p_code_hash);
  return true;
end $$;
revoke execute on function make_installation_telegram_test(text, text, int) from public, anon, authenticated;
grant execute on function make_installation_telegram_test(text, text, int) to service_role;
