-- Installation Usage, the figures #365 left out (spec 0031, #389): what nothing recorded until now, as counts only.
-- Nothing here holds a person or a name. workspace_id in usage_events is only there so a Workspace the operator leaves
-- out of the figures stays out; it is never returned and the rows are forgotten after 400 days.

-- Events that leave no row behind once they happened: a Workspace deleted, a Size booked.
create table usage_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('workspaces_deleted', 'sizes_booked')),
  workspace_id uuid not null
);
create index usage_events_at on usage_events (at);
alter table usage_events enable row level security;
revoke all on table usage_events from public, anon, authenticated;

create or replace function usage_event_workspace_deleted() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid then
    insert into usage_events (kind, workspace_id) values ('workspaces_deleted', old.id);
  end if;
  return null;
end $$;
create trigger usage_event_workspace_deleted after delete on workspaces for each row execute function usage_event_workspace_deleted();

-- A Workspace given a limit of its own by Ziffr Cloud, or whose Size changed: one event each.
create or replace function usage_event_size_booked() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.set_by = 'cloud' and (tg_op = 'INSERT' or old.set_by is distinct from new.set_by or old.metrics is distinct from new.metrics or old.label is distinct from new.label) then
    insert into usage_events (kind, workspace_id) values ('sizes_booked', new.workspace_id);
  end if;
  return null;
end $$;
create trigger usage_event_size_booked after insert or update on workspace_limits for each row execute function usage_event_size_booked();

-- When a Workspace began as a trial (it ends as kept or closed, and trial_ends_at is cleared when kept). Set by a
-- trigger so every way of making a trial counts, and filled in for the trials that exist.
alter table workspaces add column trial_started_at timestamptz;
update workspaces set trial_started_at = created_at
  where trial_ends_at is not null or trial_kept_at is not null or trial_closed_at is not null or trial_ended_at is not null;
create or replace function workspaces_trial_started() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.trial_ends_at is not null and new.trial_started_at is null then new.trial_started_at := coalesce(new.created_at, now()); end if;
  return new;
end $$;
create trigger workspaces_trial_started before insert on workspaces for each row execute function workspaces_trial_started();

-- Adds a batch of call counts (the server's in-memory counters, flushed): [{ day, kind, workspace_id, n }]. A row for
-- a Workspace that is gone, the demo or an unknown kind is skipped, so one bad row never loses the batch.
create or replace function add_usage_counts(p_rows jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then raise exception 'add_usage_counts: rows'; end if;
  insert into usage_counts as c (day, kind, workspace_id, n)
  select r.day, r.kind, r.workspace_id, sum(r.n)
  from jsonb_to_recordset(p_rows) as r(day date, kind text, workspace_id uuid, n bigint)
  join workspaces w on w.id = r.workspace_id
  where r.kind in ('api_calls', 'feed_calls', 'mcp_calls') and r.n > 0 and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
  group by r.day, r.kind, r.workspace_id
  on conflict (day, kind, workspace_id) do update set n = c.n + excluded.n;
end $$;
revoke all on function add_usage_counts(jsonb) from public, anon, authenticated;
grant execute on function add_usage_counts(jsonb) to service_role;

-- Forgets usage_events older than 400 days; returns how many went.
create or replace function prune_usage_events() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from usage_events where at < now() - interval '400 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function prune_usage_events() from public, anon, authenticated;
grant execute on function prune_usage_events() to service_role;

-- The figures of one UTC day (replaces the version of 20261225340000). New: sign-ups, trials started, Sizes booked,
-- Workspaces deleted, values by a Feed and by a connected assistant (split off the API's), people and Workspaces
-- active in 7 days, and, for a day the job missed (p_states false), the states that creation dates can rebuild.
-- Values by a person's Access Key stay values_api; a Feed's key is a Feed, a connected assistant's is the MCP Server
-- (a local MCP Server uses an ordinary Access Key and cannot be told from the API). A Derived Metric is computed when
-- read, never recorded, so there is no values_derived.
create or replace function usage_rollup_day(p_day date, p_exclude uuid, p_states boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  d_from timestamptz := p_day::timestamp at time zone 'utc';
  d_to timestamptz := (p_day + 1)::timestamp at time zone 'utc';
  f jsonb := '{}'::jsonb;
begin
  create temporary table if not exists _usage_ws (id uuid primary key) on commit drop;
  truncate _usage_ws;
  insert into _usage_ws select w.id from workspaces w where w.id <> demo and w.id is distinct from p_exclude;

  -- A day's values with their way in: Source, and for a program the kind of key it used.
  create temporary table if not exists _usage_values (workspace_id uuid, way text) on commit drop;
  truncate _usage_values;
  insert into _usage_values
    select o.workspace_id,
      case o.source when 'web_form' then 'web' when 'mail' then 'email' when 'slack' then 'slack' when 'telegram' then 'telegram'
        when 'api' then case when k.feed_id is not null then 'feed' when k.kind = 'assistant' then 'mcp' else 'api' end
        else null end
    from observations o join _usage_ws u on u.id = o.workspace_id left join access_keys k on k.id = o.access_key_id
    where o.created_at >= d_from and o.created_at < d_to;

  f := f || jsonb_build_object(
    'workspaces_created', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.created_at >= d_from and w.created_at < d_to),
    'trials_started', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.trial_started_at >= d_from and w.trial_started_at < d_to),
    'trials_kept', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.trial_kept_at >= d_from and w.trial_kept_at < d_to),
    'trials_closed', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.trial_closed_at >= d_from and w.trial_closed_at < d_to),
    'sizes_booked', (select count(*) from usage_events e where e.kind = 'sizes_booked' and e.at >= d_from and e.at < d_to and e.workspace_id <> demo and e.workspace_id is distinct from p_exclude),
    'workspaces_deleted', (select count(*) from usage_events e where e.kind = 'workspaces_deleted' and e.at >= d_from and e.at < d_to and e.workspace_id is distinct from p_exclude),
    -- People who made an account that day and belong to a Workspace in the figures.
    'signups', (select count(distinct p.id) from profiles p join auth.users a on a.id = p.auth_user_id join memberships m on m.user_id = p.id join _usage_ws u on u.id = m.workspace_id where a.created_at >= d_from and a.created_at < d_to),
    'emails_sent', (select count(*) from deliveries x join _usage_ws u on u.id = x.workspace_id where x.connector = 'email' and x.mail_state = 'sent' and x.sent_at >= d_from and x.sent_at < d_to),
    'api_calls', coalesce((select sum(c.n) from usage_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.kind = 'api_calls'), 0),
    'feed_calls', coalesce((select sum(c.n) from usage_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.kind = 'feed_calls'), 0),
    'mcp_calls', coalesce((select sum(c.n) from usage_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.kind = 'mcp_calls'), 0),
    -- Calls by a Feed or by a connected assistant split the API's calls by kind: like values by Source they rest on the
    -- number of Workspaces that made one (never returned).
    'feed_calls_ws', (select count(distinct c.workspace_id) from usage_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.kind = 'feed_calls' and c.n > 0),
    'mcp_calls_ws', (select count(distinct c.workspace_id) from usage_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.kind = 'mcp_calls' and c.n > 0),
    'views_dashboards', coalesce((select sum(c.n_app + c.n_link) from view_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.subject_kind = 'dashboard'), 0),
    'views_decks', coalesce((select sum(c.n_app + c.n_link) from view_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.subject_kind = 'deck'), 0),
    'views_metrics', coalesce((select sum(c.n_app + c.n_link) from view_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.subject_kind = 'metric'), 0)
  );
  -- Values by way in, and beside each the number of Workspaces behind it (the small-number rule; never returned).
  f := f || (select coalesce(jsonb_object_agg('values_' || w.way, coalesce(t.n, 0)) || jsonb_object_agg('values_' || w.way || '_ws', coalesce(t.ws, 0)), '{}'::jsonb)
    from (values ('web'), ('email'), ('slack'), ('telegram'), ('api'), ('feed'), ('mcp')) as w(way)
    left join (select way, count(*) n, count(distinct workspace_id) ws from _usage_values group by way) t on t.way = w.way);

  if p_states then
    f := f || jsonb_build_object(
      'workspaces', (select count(*) from _usage_ws),
      'workspaces_trial', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.trial_ends_at is not null and w.trial_kept_at is null),
      'workspaces_paid', (select count(*) from workspaces w join _usage_ws u on u.id = w.id join workspace_limits l on l.workspace_id = w.id where not (w.trial_ends_at is not null and w.trial_kept_at is null)),
      'people', (select count(distinct m.user_id) from memberships m join _usage_ws u on u.id = m.workspace_id join profiles p on p.id = m.user_id where p.auth_user_id is not null),
      -- As the job reads them: the last sign-in of an account, and the last use of a Workspace (spec 0029's record).
      'people_active_7d', (select count(distinct m.user_id) from memberships m join _usage_ws u on u.id = m.workspace_id join profiles p on p.id = m.user_id join auth.users a on a.id = p.auth_user_id where a.last_sign_in_at >= d_to - interval '7 days'),
      'workspaces_active_7d', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.last_used_at >= d_to - interval '7 days'),
      'metrics', (select count(*) from metrics m join _usage_ws u on u.id = m.workspace_id where m.archived_at is null),
      'metrics_archived', (select count(*) from metrics m join _usage_ws u on u.id = m.workspace_id where m.archived_at is not null),
      'dashboards', (select count(*) from dashboards x join _usage_ws u on u.id = x.workspace_id),
      'widgets', (select count(*) from widgets x join _usage_ws u on u.id = x.workspace_id where x.dashboard_id is not null),
      'decks', (select count(*) from decks x join _usage_ws u on u.id = x.workspace_id),
      'workflows', (select count(*) from workflows x join _usage_ws u on u.id = x.workspace_id),
      'feeds', (select count(*) from feeds x join _usage_ws u on u.id = x.workspace_id where x.deleted_at is null),
      'packs_installed', (select count(*) from pack_installs x join _usage_ws u on u.id = x.workspace_id)
    );
    f := f || jsonb_build_object('workspaces_free', (f->>'workspaces')::int - (f->>'workspaces_trial')::int - (f->>'workspaces_paid')::int);
    f := f || jsonb_build_object('packs', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.pack_id, 'installs', t.n) order by t.pack_id)
      from (select x.pack_id, count(distinct x.workspace_id) n from pack_installs x join _usage_ws u on u.id = x.workspace_id where x.source = 'marketplace' group by x.pack_id having count(distinct x.workspace_id) >= 3) t
    ), '[]'::jsonb));
  else
    -- A day the job missed: what a creation date can rebuild, as of the end of that day. What has been deleted since is
    -- not counted, so such a day may be a little low. Kinds of Workspace, Workflows, Packs and the 7-day figures have no
    -- date to rebuild from and are left out.
    f := f || jsonb_build_object(
      'workspaces', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.created_at < d_to),
      'people', (select count(distinct m.user_id) from memberships m join _usage_ws u on u.id = m.workspace_id join profiles p on p.id = m.user_id where p.auth_user_id is not null and m.created_at < d_to),
      'metrics', (select count(*) from metrics m join _usage_ws u on u.id = m.workspace_id where m.created_at < d_to and (m.archived_at is null or m.archived_at >= d_to)),
      'metrics_archived', (select count(*) from metrics m join _usage_ws u on u.id = m.workspace_id where m.created_at < d_to and m.archived_at < d_to),
      'dashboards', (select count(*) from dashboards x join _usage_ws u on u.id = x.workspace_id where x.created_at < d_to),
      'widgets', (select count(*) from widgets x join _usage_ws u on u.id = x.workspace_id where x.dashboard_id is not null and x.created_at < d_to),
      'decks', (select count(*) from decks x join _usage_ws u on u.id = x.workspace_id where x.created_at < d_to),
      'feeds', (select count(*) from feeds x join _usage_ws u on u.id = x.workspace_id where x.created_at < d_to and (x.deleted_at is null or x.deleted_at >= d_to)),
      'packs_installed', (select count(*) from pack_installs x join _usage_ws u on u.id = x.workspace_id where x.installed_at < d_to)
    );
  end if;
  return f;
end $$;
revoke all on function usage_rollup_day(date, uuid, boolean) from public, anon, authenticated;
grant execute on function usage_rollup_day(date, uuid, boolean) to service_role;
