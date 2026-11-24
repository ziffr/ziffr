-- Open Metrics, Threads and sharing in the demo (spec 0051, ticket 11; GLOSSARY: Demo Mode, Metric, Derived Metric, Target Series,
-- Projection, Tag, Group, Share, Question, Task). Opens the tables behind making and changing a visitor's Metrics (metrics, their
-- Targets and Projections in series_values), putting Tags on them (tags, metric_tags), Groups and who is in them (groups,
-- group_members), Shares among the demo's made-up people and asking for access (shares, access_requests), and a made-up person's
-- preferred channel (delivery_preferences). The Questions, Tasks and replies a visitor writes use tables the work around a value
-- opened (actions, thread_messages: ticket 8). Nothing changes for a visitor until the Installation says so (ZIFFR_DEMO_CHANGES with
-- ZIFFR_DEMO_ONLY, which the reset job turns into demo_state.open_to_visitors): the guard still refuses every write otherwise.
--
-- What stays closed on purpose: workflows (a Metric made by a visitor is never put into a Workflow, so the showcase Workflow's
-- period stays "all in and all locked"), feeds, access keys, webhooks, contacts, invitations, people and everything else of the
-- people tables. Handing a Metric over and deleting one are not opened by this ticket.
--
-- No row of the demo is read or written here (rule 5): only lists, triggers, a column on two tables and the caps' numbers.

-- 1. Shares and Group members had no creation time, so a row cap (counted by creation since the seed was done) could not be put on
--    them. Existing rows get '-infinity' (a constant, so no table is rewritten, and every row that exists now counts as older than the
--    seed's end, never against a visitor's cap); rows made from now on get the time they are made.
alter table shares add column created_at timestamptz not null default '-infinity';
alter table shares alter column created_at set default now();
alter table group_members add column created_at timestamptz not null default '-infinity';
alter table group_members alter column created_at set default now();

-- 2. The caps of the kinds that grow with a visitor's work. The numbers are starting points for the owner (the spec gives none
--    for these): the core's list (packages/core/src/demo-limits.ts) holds the same, and a database test compares the two.
--    `derived_metrics` counts Metrics that have a formula (inputs_checked is set with it), so one visitor's formulas cannot make
--    every recomputation heavy for the others; `series_rows` is the Targets and Projections of all Metrics together.
insert into demo_limits (kind, max_rows, scope_column, filter_column, filter_value) values
  ('derived_metrics', 5, null, 'inputs_checked', 'true'),
  ('series_rows', 500, null, null, null),
  ('thread_messages', 1500, null, null, null),
  ('shares', 300, null, null, null),
  ('group_members', 200, null, null, null),
  ('access_requests', 100, null, null, null)
on conflict (kind) do nothing;

-- 3. The tables the demo's guard may now let a visit write. A visit still cannot touch the showcase or the words of a seeded row
--    (the words trigger is on every one of them already), and each write waits for a Demo Reset or is refused as stale.
select open_demo_table('metrics');
select open_demo_table('series_values');
select open_demo_table('tags');
select open_demo_table('metric_tags');
select open_demo_table('groups');
select open_demo_table('group_members');
select open_demo_table('shares');
select open_demo_table('access_requests');
select open_demo_table('delivery_preferences');

-- 4. Row caps for what a visitor makes: Metrics, Derived Metrics, Targets and Projections, Tags, Groups, members, Shares, requests
--    for access and Thread messages. (Open Questions and Tasks are capped by ticket 8; values by ticket 8.)
select apply_demo_limits('metrics', 'metrics');
select apply_demo_limits('metrics', 'derived_metrics');
select apply_demo_limits('series_values', 'series_rows');
select apply_demo_limits('tags', 'tags');
select apply_demo_limits('groups', 'groups');
select apply_demo_limits('group_members', 'group_members');
select apply_demo_limits('shares', 'shares');
select apply_demo_limits('access_requests', 'access_requests');
select apply_demo_limits('thread_messages', 'thread_messages');

-- 5. A Tag on a showcase Metric would change what every visitor sees of the landing page's examples (Gross margin, Churn rate and
--    the six Weekly numbers Metrics): the showcase trigger knows nothing of metric_tags, so this one refuses a visit's write to the
--    Tags of a showcase Metric, as it refuses the Metric's own row. (The showcase function of 20270126130000 is left as it is.)
--    The triggers' names sort after the demo guard's, so a write that is not allowed at all is still refused with the guard's words.
create or replace function demo_metric_tags_guard() returns trigger
language plpgsql set search_path = public as $$
declare mid text := case when tg_op = 'DELETE' then old.metric_id::text else new.metric_id::text end;
begin
  if demo_seeding() then return coalesce(new, old); end if;
  if demo_object_in_showcase('metric', mid) or (tg_op = 'UPDATE' and demo_object_in_showcase('metric', old.metric_id::text)) then
    raise exception using errcode = 'ZF4D3', message = 'demo_showcase';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function demo_metric_tags_guard() from public, anon, authenticated;
create trigger zzz_demo_metric_tags_new before insert or update on metric_tags for each row
  when (new.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_metric_tags_guard();
create trigger zzz_demo_metric_tags_old before delete on metric_tags for each row
  when (old.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_metric_tags_guard();

-- 6. Say why the rest of the tables stay closed: the Metrics, Threads and sharing are open now; decks and Snapshots are ticket 10's.
update demo_closed_tables set reason = 'Closed until a later ticket of spec 0051 opens it (decks and Snapshots, ticket 10), or on purpose (Workflows are never changed by a visit).'
  where table_name in ('decks', 'workflows', 'dashboard_snapshots')
    and reason like 'Closed until a later ticket of spec 0051 (9 to 11) opens it%';
