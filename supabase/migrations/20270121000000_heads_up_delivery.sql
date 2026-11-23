-- Heads-ups in the app and by message (spec 0041, ticket 14; GLOSSARY: Heads-up, Delivery, Delivery Preference). What a person
-- chose about Heads-ups (settings, Not useful, muted Metrics) and what they were told, kept per Workspace and person, and the
-- Delivery kind `heads_up`.
--
-- Who may read any of it: nobody but the core, with the service key. Row level security is on and there is no policy, and the
-- grants are taken away as well, so a browser, a Connector or a View Link gets nothing. Every row belongs to one person and to
-- one Workspace; the core reads and writes a row only for the acting person. A key holds Metric ids, never a name or a value.

-- A person's own choices. `show`: Heads-ups are listed for them (on unless they switch it off); `by_message`: they are also told
-- by their Delivery Preference (off unless they switch it on). `checked_at` is when the job last looked for them, so a Workspace
-- with many opted-in people is worked through fairly when one call cannot reach everyone.
create table heads_up_settings (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  show boolean not null default true,
  by_message boolean not null default false,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);
alter table heads_up_settings enable row level security;
revoke all on heads_up_settings from public, anon, authenticated;
select attach_demo_guard('heads_up_settings');

-- Marked "Not useful" by the person: that Heads-up (its key: kind and Metrics) is not shown to them again.
create table heads_up_dismissed (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z-]{0,39}(:[0-9]{1,10}){1,2}$'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, person_id, key)
);
alter table heads_up_dismissed enable row level security;
revoke all on heads_up_dismissed from public, anon, authenticated;
select attach_demo_guard('heads_up_dismissed');

-- Metrics the person muted: no Heads-up about them is shown or sent to that person. Goes with the Metric.
create table heads_up_mutes (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  metric_id int not null references metrics(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, person_id, metric_id)
);
alter table heads_up_mutes enable row level security;
revoke all on heads_up_mutes from public, anon, authenticated;
select attach_demo_guard('heads_up_mutes');

-- What was sent to a person, once per Heads-up: a row stays "open" (ended_at null) while the Heads-up stands and is ended when it
-- no longer does, so one that returns can be sent again. The weekly cap counts these rows by told_at, ended or not.
create table heads_up_told (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z-]{0,39}(:[0-9]{1,10}){1,2}$'),
  told_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index heads_up_told_open on heads_up_told (workspace_id, person_id, key) where ended_at is null;
create index heads_up_told_week on heads_up_told (workspace_id, person_id, told_at);
alter table heads_up_told enable row level security;
revoke all on heads_up_told from public, anon, authenticated;
select attach_demo_guard('heads_up_told');

-- Takes one message of the week for a person, in one step under a lock of that person: 'gone' when they are not a member of the
-- Workspace (now, in the same statement: someone who left cannot get a new row), 'told' when this Heads-up was already sent and has
-- not ended, 'cap' when the person has had `p_cap` in the 7 days up to `p_now`, else 'send:<id of the new row>' (and it is
-- counted). A message that is counted but does not leave gives its place back: when the delivery fails for good, a trigger in the
-- next migration removes the row by its id.
create or replace function claim_heads_up_message(p_ws uuid, p_person text, p_key text, p_cap int, p_now timestamptz) returns text
language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('heads_up_told:' || p_ws::text || ':' || p_person));
  if not exists (select 1 from memberships where workspace_id = p_ws and user_id = p_person) then
    return 'gone';
  end if;
  if exists (select 1 from heads_up_told where workspace_id = p_ws and person_id = p_person and key = p_key and ended_at is null) then
    return 'told';
  end if;
  if (select count(*) from heads_up_told where workspace_id = p_ws and person_id = p_person and told_at > p_now - interval '7 days' and told_at <= p_now) >= p_cap then
    return 'cap';
  end if;
  insert into heads_up_told (workspace_id, person_id, key, told_at) values (p_ws, p_person, p_key, p_now) returning id into new_id;
  return 'send:' || new_id::text;
end $$;
revoke execute on function claim_heads_up_message(uuid, text, text, int, timestamptz) from public, anon, authenticated;
grant execute on function claim_heads_up_message(uuid, text, text, int, timestamptz) to service_role;

-- Ends what no longer stands (every open row of the person whose key is not in `p_standing`) and forgets ended rows older than 30 days.
create or replace function end_heads_up_told(p_ws uuid, p_person text, p_standing text[], p_now timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('heads_up_told:' || p_ws::text || ':' || p_person));
  update heads_up_told set ended_at = p_now where workspace_id = p_ws and person_id = p_person and ended_at is null and key <> all(p_standing);
  -- (Only ended rows: one that still stands stays open, or it would be said again.)
  delete from heads_up_told where workspace_id = p_ws and person_id = p_person and ended_at is not null and told_at < p_now - interval '30 days';
end $$;
revoke execute on function end_heads_up_told(uuid, text, text[], timestamptz) from public, anon, authenticated;
grant execute on function end_heads_up_told(uuid, text, text[], timestamptz) to service_role;

-- The Delivery kind `heads_up`, and the Metrics it is about: checked again at the moment it leaves (a queued message may wait
-- for hours), when the person must still see BOTH. The messages of a deleted Metric go with it.
alter table deliveries drop constraint deliveries_kind_check;
alter table deliveries add constraint deliveries_kind_check
  check (kind in ('question','task','reminder','reply','correction','decision','closed','done','prompt','notice','digest','alert','heads_up'));
alter table deliveries add column heads_up_metric_a int references metrics(id) on delete cascade;
alter table deliveries add column heads_up_metric_b int references metrics(id) on delete cascade;
-- The Heads-up's key, so that a person's Not useful, mute or switch-off made while it waits stops it too.
alter table deliveries add column heads_up_key text;
alter table deliveries add constraint deliveries_heads_up_metrics check (kind <> 'heads_up' or heads_up_metric_a is not null);
