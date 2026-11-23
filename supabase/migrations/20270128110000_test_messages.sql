-- Test Messages (spec 0052, ticket 7; GLOSSARY: Test Message). A person sends themselves one message through a Connector
-- to see that it reaches them. It is a Delivery of its own kind, `test`: held by nothing (it goes only to the person who
-- asked, at once), answerable by nothing. This adds the kind and the table that counts presses, so the limits hold when
-- two presses arrive at the same moment.
alter table deliveries drop constraint deliveries_kind_check;
alter table deliveries add constraint deliveries_kind_check
  check (kind in ('question','task','reminder','reply','correction','decision','closed','done','prompt','notice','digest','alert','heads_up','checklist','filled_in','test'));

-- One row per press that was let through. Read and written only through the core (service role); no browser reaches it.
create table test_message_sends (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  way text not null check (way in ('email', 'slack', 'telegram')),
  at timestamptz not null default now()
);
create index test_message_sends_person on test_message_sends (workspace_id, person_id, at);
alter table test_message_sends enable row level security;
revoke all on table test_message_sends from public, anon, authenticated;
select attach_demo_guard('test_message_sends');
-- Closed to the demo's visitors (spec 0051's allow-list): the demo never sends a Test Message, and holds no row here.
insert into demo_closed_tables (table_name, reason) values
  ('test_message_sends', 'The demo sends no Test Message: it sends nothing (spec 0052).')
on conflict (table_name) do nothing;

-- Lets one press through or says which limit stops it: 'ok', or 'window|<when it resets>' (too many by this way in the
-- last p_window_minutes), or 'day|<when it resets>' (too many by all ways in the last 24 hours). The person's rows are
-- locked for the statement, so two presses at once cannot both take the last place.
create function claim_test_message(p_workspace uuid, p_person text, p_way text, p_per_window int, p_window_minutes int, p_per_day int)
returns text language plpgsql security definer set search_path = public as $$
declare
  in_window int; oldest_window timestamptz; in_day int; oldest_day timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text || ':' || p_person, 0));
  delete from test_message_sends where workspace_id = p_workspace and person_id = p_person and at < now() - interval '1 day';
  select count(*), min(at) into in_window, oldest_window from test_message_sends
    where workspace_id = p_workspace and person_id = p_person and way = p_way and at >= now() - make_interval(mins => p_window_minutes);
  if in_window >= p_per_window then
    return 'window|' || to_char((oldest_window + make_interval(mins => p_window_minutes)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  select count(*), min(at) into in_day, oldest_day from test_message_sends where workspace_id = p_workspace and person_id = p_person;
  if in_day >= p_per_day then
    return 'day|' || to_char((oldest_day + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  insert into test_message_sends (workspace_id, person_id, way) values (p_workspace, p_person, p_way);
  return 'ok';
end $$;
revoke execute on function claim_test_message(uuid, text, text, int, int, int) from public, anon, authenticated;
grant execute on function claim_test_message(uuid, text, text, int, int, int) to service_role;
