-- Open values (spec 0051, ticket 8; GLOSSARY: Demo Mode, Demo Reset): the first opening of the demo to visitors' changes. Where the
-- Installation is a demo-only one and says visitors may change the demo (the setting ZIFFR_DEMO_CHANGES, which the reset job
-- turns into `demo_state.open_to_visitors`), a visit may now write the tables below: the work around a value (recording it by
-- hand, the web form, paste, filling in for someone, the simulated channels recording their answer, Ask me now, Approvals,
-- Self-checks, Corrections, Locks, a run of the Workflows to the Outbox, Stand-ins and Away). With the setting off nothing here
-- lets any write through: `demo_visit_allows` and `demo_visit_current` refuse a visit unless `open_to_visitors` is on.
--
-- Every table opened here also has the demo guard, the seeded words' trigger and the reset lock (open_demo_table, attach_demo_words_guard),
-- so a visit still cannot touch the showcase or a seeded row's words, and a write waits for a Demo Reset or is refused as stale. The
-- row caps of `demo_limits` apply to the two tables that grow with a visitor's work: values and open Questions and Tasks.
--
-- This migration writes no row of the demo (rule 5): it changes only the lists and triggers, and the keys of the seed's rows that
-- three new tables need (demo_seeded_rows, which has no workspace_id).

-- 1. Three tables the work writes that no ticket had classified: what a message said (the intake log), and a Breakdown's labels
--    (and their history). Their words are a visitor's too, so a row the seed made keeps them.
insert into demo_words_columns (table_name, column_name, kind) values
  ('intake_log', 'sender', 'words'), ('intake_log', 'raw', 'words'), ('intake_log', 'detail', 'words'),
  ('breakdown_rows', 'label', 'words'),
  ('breakdown_history', 'label', 'words');
select attach_demo_words_guard('intake_log');
select attach_demo_words_guard('breakdown_rows');
select attach_demo_words_guard('breakdown_history');
-- A demo that exists already was seeded before these three were classified: its rows count as the seed's, as the next Demo Reset will make them.
do $$
declare demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  if coalesce((select showcase_ready from demo_state where id), false) then
    insert into demo_seeded_rows select 'intake_log', id::text from intake_log where workspace_id = demo on conflict do nothing;
    insert into demo_seeded_rows select 'breakdown_rows', id::text from breakdown_rows where workspace_id = demo on conflict do nothing;
    insert into demo_seeded_rows select 'breakdown_history', id::text from breakdown_history where workspace_id = demo on conflict do nothing;
  end if;
end $$;

-- 2. Open the tables. Each moves from the closed list to the open list and gets the reset lock's statement trigger.
select open_demo_table('observations');
select open_demo_table('observation_history');
select open_demo_table('breakdown_rows');
select open_demo_table('breakdown_history');
select open_demo_table('intake_log');
select open_demo_table('period_states');
select open_demo_table('prompts');
select open_demo_table('tokens');
select open_demo_table('deliveries');
select open_demo_table('actions');
select open_demo_table('thread_messages');

-- 3. The row caps of demo_limits for what grows with a visitor's work: values (observations) and open Questions and Tasks (actions,
--    which Approvals, Self-checks and the Workflows' run make). The other tables are bounded by these, by the write budget and by
--    the one run a minute.
select apply_demo_limits('observations', 'values');
select apply_demo_limits('actions', 'open_actions');

-- 4. The one Workflow run a minute in the whole demo is counted in demo_visit_counts, under a kind of its own.
alter table demo_visit_counts drop constraint demo_visit_counts_kind_check;
alter table demo_visit_counts add constraint demo_visit_counts_kind_check check (kind in ('visit_minute', 'visit', 'address', 'network', 'demo', 'workflow_run'));

-- 5. Whether the request is a visit's that may write now, for the two tables that cannot be on the open list (they have no
--    workspace_id: `away` is a person's, `ask_now_claims` a Metric's): the core's request (service role), the visit header, an
--    Installation that opened the demo, a showcase that is ready, and the Generation the demo is in now. Takes the reset lock
--    shared, as demo_visit_allows does; raises ZF4D1 for a stale Generation. Marks the demo as changed.
create or replace function demo_visit_current() returns boolean
language plpgsql set search_path = public as $$
declare
  headers text := current_setting('request.headers', true);
  claims text := current_setting('request.jwt.claims', true);
  seen text;
  current_generation bigint;
begin
  if coalesce(headers, '') = '' or coalesce(claims, '') = '' then return false; end if;
  if (claims::json ->> 'role') is distinct from 'service_role' then return false; end if;
  seen := headers::json ->> 'x-ziffr-demo-visit';
  if seen is null or seen !~ '^[0-9]{1,15}$' then return false; end if;
  if not exists (select 1 from demo_state where id and open_to_visitors and showcase_ready) then return false; end if;
  perform pg_advisory_xact_lock_shared(hashtext('ziffr-demo-reset'));
  select generation into current_generation from demo_state where id;
  if current_generation is distinct from seen::bigint then
    raise exception using errcode = 'ZF4D1', message = 'demo_stale';
  end if;
  update demo_state set changed_since_reset = true, last_change_at = now() where id and not changed_since_reset;
  return true;
end $$;
revoke execute on function demo_visit_current() from public, anon, authenticated;
grant execute on function demo_visit_current() to service_role;

-- 6. Ask me now's claims carry only their Metric (spec 0021): a visit may claim its Metric's turn (an insert, or the update of an
--    older claim), never delete one; the claim function already allows one press in ten minutes per Metric. The prompt it
--    makes goes to the Outbox. Rows of the demo's Metrics are refused for everything else, as before.
create or replace function demo_metric_read_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if demo_seeding() then return coalesce(new, old); end if;
  if exists (select 1 from metrics where workspace_id = 'd3e00000-0000-4000-8000-000000000001'
             and id in (case when tg_op <> 'DELETE' then new.metric_id end, case when tg_op <> 'INSERT' then old.metric_id end)) then
    if tg_op <> 'DELETE' and demo_visit_current() then return new; end if;
    raise exception using errcode = 'ZF4D0', message = 'demo_read_only';
  end if;
  return coalesce(new, old);
end $$;
-- The statement trigger takes the reset lock before any row is locked, as the open tables' do (20270126090000), so a visit and a
-- Demo Reset cannot wait for each other's rows.
create trigger zz_demo_visit_lock before insert or update or delete on ask_now_claims for each statement execute function demo_visit_lock();

-- 7. Away is a person's own row, global to the Installation (spec 0046). A visit may set or clear the Away of the demo's made-up
--    people, for at most 30 days from today (a day's slack for the visitor's clock) and ending within 90 days: the same rule the
--    core states first (demo-values.ts), here as the backstop. Everyone else's rows are as they were: a person who belongs to
--    no demo is not the demo's.
create or replace function demo_away_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  ids text[] := array_remove(array[
    case when tg_op <> 'DELETE' then to_jsonb(new) ->> 'user_id' end,
    case when tg_op <> 'INSERT' then to_jsonb(old) ->> 'user_id' end], null);
  demo uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  if demo_seeding() then return coalesce(new, old); end if;
  if exists (select 1 from memberships where workspace_id = demo and user_id = any(ids))
     or exists (select 1 from contacts where workspace_id = demo and person_id = any(ids))
     or exists (select 1 from feeds where workspace_id = demo and person_id = any(ids)) then
    -- A visit never moves a row to another person.
    if tg_op = 'UPDATE' then
      if old.user_id is distinct from new.user_id then
        raise exception using errcode = 'ZF4D0', message = 'demo_read_only';
      end if;
    end if;
    if demo_visit_current() then
      if tg_op = 'DELETE' then return old; end if;
      if new.starts >= current_date - 1 and new.ends <= current_date + 90 and new.ends - new.starts <= 30 then return new; end if;
    end if;
    raise exception using errcode = 'ZF4D0', message = 'demo_read_only';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function demo_away_guard() from public, anon, authenticated;
grant execute on function demo_away_guard() to service_role;
drop trigger zz_demo_read_only on away;
create trigger zz_demo_read_only before insert or update or delete on away for each row execute function demo_away_guard();
create trigger zz_demo_visit_lock before insert or update or delete on away for each statement execute function demo_visit_lock();

-- 8. Say why the others stay closed. The tables of the dashboards, decks, Snapshots, Metrics, Threads and sharing are for the next
--    tickets of the spec (9 to 11); the rest is closed on purpose.
update demo_closed_tables set reason = 'Closed until a later ticket of spec 0051 (9 to 11) opens it: dashboards, decks, Snapshots, Metrics, Threads and sharing.'
  where table_name in ('dashboards', 'widgets', 'decks', 'metrics', 'workflows', 'groups', 'themes', 'team_templates', 'tags', 'dashboard_snapshots',
    'versions', 'shares', 'group_members', 'access_requests', 'delivery_preferences', 'metric_tags', 'series_values');
update demo_closed_tables set reason = 'Closed on purpose: the Workflows'' daily run and its claims are never scheduled in the demo; a visitor''s run is not claimed.'
  where table_name = 'workflow_runs';
update demo_closed_tables set reason = 'Closed on purpose: a person, a setting, a key, a link, a file, a Connector or a message that reaches outside the demo, or what every visitor sees.'
  where reason = 'Closed until a ticket of spec 0051 opens it: the demo is read-only for visitors.';
