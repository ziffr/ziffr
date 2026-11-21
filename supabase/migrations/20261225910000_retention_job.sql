-- Retention, the daily job (spec 0033, ticket #382; GLOSSARY: Retention, Condensed Value). What the job needs from the
-- database and nothing it does by itself: the confirmation a Metric's Retention in force was started from (its cap),
-- the claim of a Metric's day, how a Metric's runs went, and the one transaction that removes what a Condensed Value
-- (or a confirmed delete) stands for.

-- The cap: what the person confirmed. Copied from the confirmation when the Retention starts ({"id", "confirmed_on",
-- "periods", "values", "held_back_periods", "held_back_values"}): the job never takes more of the old periods and values
-- than that without a new confirmation. A Retention in force without one is never run (fail closed).
alter table metrics add column retention_cap jsonb
  check (retention_cap is null or (jsonb_typeof(retention_cap) = 'object' and pg_column_size(retention_cap) <= 400));

-- One row per Metric and day, claimed before any work starts, so repeated or parallel calls run once. A run that stopped
-- (the server went away) is taken over after its lease has run out; a finished one never. Counts only, never a value.
create table retention_runs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  metric_id int not null references metrics(id) on delete cascade,
  day date not null,
  claimed_at timestamptz not null default now(),
  attempts int not null default 1 check (attempts >= 1),
  finished_at timestamptz,
  state text not null default 'running' check (state in ('running', 'done', 'failed')),
  counts jsonb check (counts is null or pg_column_size(counts) <= 400),
  error text check (char_length(error) <= 100),
  unique (metric_id, day)
);
create index retention_runs_workspace on retention_runs (workspace_id);
alter table retention_runs enable row level security;
-- Read-only in the demo, like every table with a workspace_id (demo-read-only.db.test.ts); the demo has no Retention.
select attach_demo_guard('retention_runs');

-- How a Metric's Retention is doing: failures in a row (three stop it), and the words Owners read on its page when
-- something needs them (a check that did not match, numbers that grew since the confirmation, a stop). `confirmation`
-- is the id of the cap the state belongs to, so a new confirmation starts clean. Words only, never a value.
create table retention_state (
  metric_id int primary key references metrics(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  confirmation text,
  failures int not null default 0 check (failures >= 0),
  stopped boolean not null default false,
  note text check (char_length(note) <= 300),
  last_run_on date,
  updated_at timestamptz not null default now()
);
create index retention_state_workspace on retention_state (workspace_id);
alter table retention_state enable row level security;
select attach_demo_guard('retention_state');

-- Claims a Metric's day. Null when it was claimed already by a run that has not run out of time, or finished, or the
-- Metric is not of that Workspace. One statement, so two calls at once cannot both pass.
create or replace function claim_retention_run(p_ws uuid, p_metric int, p_day date, p_lease interval default interval '10 minutes')
returns bigint language plpgsql security definer set search_path = public as $$
declare run_id bigint;
begin
  if not exists (select 1 from metrics where id = p_metric and workspace_id = p_ws) then return null; end if;
  insert into retention_runs (workspace_id, metric_id, day) values (p_ws, p_metric, p_day)
  on conflict (metric_id, day) do update set claimed_at = now(), attempts = retention_runs.attempts + 1, state = 'running'
    where retention_runs.finished_at is null and retention_runs.claimed_at < now() - p_lease
  returning id into run_id;
  return run_id;
end $$;
revoke execute on function claim_retention_run(uuid, int, date, interval) from public, anon, authenticated;
grant execute on function claim_retention_run(uuid, int, date, interval) to service_role;

-- Removes the values a Metric holds for some periods, with their history, in one transaction: the originals (and the
-- Breakdown rows and Superseded Values that went with them), the Targets of those periods and, when `p_states`, their
-- period states and Locks. The periods are those from `p_from` to `p_to`, or only the listed ones. It holds the Metric's
-- row, which a value being written waits for, and refuses (rolling everything back) when
--   ZF444: open work (an open Question, Task, Correction or Approval, or a period its Workflow has not finished) holds one,
--   ZF445: the values it finds are not as many as the job counted (`p_expected`): something arrived since.
-- Returns what it removed, in counts.
create or replace function retention_remove_values(p_ws uuid, p_metric int, p_from date, p_to date, p_periods date[], p_expected int, p_states boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ids bigint[]; old_ids bigint[]; n_obs int; n_rows int; n_hist int; n_targets int; n_states int := 0;
begin
  perform 1 from metrics where id = p_metric and workspace_id = p_ws for update;
  if not found then raise exception using errcode = 'ZF445', message = 'That Metric was not found'; end if;
  if exists (select 1 from period_states s where s.metric_id = p_metric and s.state in ('asked', 'submitted', 'approval')
      and s.period_start between p_from and p_to and (p_periods is null or s.period_start = any (p_periods)))
    or exists (select 1 from actions a where a.workspace_id = p_ws and a.metric_id = p_metric and a.status in ('open', 'answered')
      and a.period_start between p_from and p_to and (p_periods is null or a.period_start = any (p_periods))) then
    raise exception using errcode = 'ZF444', message = 'Open work holds a period';
  end if;
  select coalesce(array_agg(o.id), '{}') into ids from observations o
    where o.workspace_id = p_ws and o.metric_id = p_metric and o.period_start between p_from and p_to and (p_periods is null or o.period_start = any (p_periods));
  if coalesce(array_length(ids, 1), 0) <> p_expected then
    raise exception using errcode = 'ZF445', message = 'The values changed since they were counted';
  end if;
  select coalesce(array_agg(distinct h.observation_id), '{}') into old_ids from observation_history h
    where h.workspace_id = p_ws and h.metric_id = p_metric and h.period_start between p_from and p_to and (p_periods is null or h.period_start = any (p_periods));
  -- Breakdown rows first (their history is written with their value's workspace), then all of that history.
  delete from breakdown_rows where workspace_id = p_ws and observation_id = any (ids);
  get diagnostics n_rows = row_count;
  delete from breakdown_history where workspace_id = p_ws and observation_id = any (ids || old_ids);
  delete from observations where workspace_id = p_ws and id = any (ids);
  get diagnostics n_obs = row_count;
  delete from observation_history where workspace_id = p_ws and metric_id = p_metric
    and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
  get diagnostics n_hist = row_count;
  delete from series_values where workspace_id = p_ws and metric_id = p_metric and kind = 'target'
    and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
  get diagnostics n_targets = row_count;
  if p_states then
    delete from period_states where metric_id = p_metric and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
    get diagnostics n_states = row_count;
  end if;
  return jsonb_build_object('values', n_obs, 'breakdown_rows', n_rows, 'superseded', n_hist, 'targets', n_targets, 'states', n_states);
end $$;
revoke execute on function retention_remove_values(uuid, int, date, date, date[], int, boolean) from public, anon, authenticated;
grant execute on function retention_remove_values(uuid, int, date, date, date[], int, boolean) to service_role;

-- Takes back a Condensed Value the job made but did not go on with, only while the span still holds the original values
-- it stands for: a Condensed Value that stands alone (its originals are gone) is never removed, whatever the caller saw
-- of the answer to the removal (a timeout after the commit, say). Under the Metric's row, so it cannot cross a removal.
-- Returns whether it was removed.
create or replace function retention_discard_condensed(p_ws uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare c condensed_values%rowtype;
begin
  select * into c from condensed_values where id = p_id and workspace_id = p_ws;
  if not found then return false; end if;
  perform 1 from metrics where id = c.metric_id and workspace_id = p_ws for update;
  if not exists (select 1 from observations o where o.workspace_id = p_ws and o.metric_id = c.metric_id and o.period_start between c.period_start and c.period_end) then
    return false;
  end if;
  delete from condensed_values where id = p_id and workspace_id = p_ws;
  return true;
end $$;
revoke execute on function retention_discard_condensed(uuid, uuid) from public, anon, authenticated;
grant execute on function retention_discard_condensed(uuid, uuid) to service_role;
