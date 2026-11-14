-- Plotted values without a row limit (GLOSSARY: Observation, Breakdown). A chart shows one value per period, the
-- latest when the Submission Rule keeps both; reading every row and keeping the latest in the app dropped the newest
-- values once a workspace had more rows than the API returns at once (Max Rows: 1000 on a hosted project). These
-- answer with one JSON array, which no row limit cuts, and read only the latest value of each period.

-- The latest value of each period of a workspace's Metrics, oldest period first; optionally of some Metrics and
-- periods only (period starts, both included).
create or replace function latest_observations(p_workspace uuid, p_metric_ids integer[] default null, p_from date default null, p_to date default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(o) order by o.metric_id, o.period_start), '[]'::jsonb)
  from (
    select distinct on (metric_id, period_start) id, metric_id, period_start, value, submitter_id, source, original_value, access_key_id, created_at
    from observations
    where workspace_id = p_workspace
      and (p_metric_ids is null or metric_id = any (p_metric_ids))
      and (p_from is null or period_start >= p_from)
      and (p_to is null or period_start <= p_to)
    order by metric_id, period_start, created_at desc, id desc
  ) o
$$;

-- The same, for the last few periods of each Metric only: enough for a list with a trend line.
create or replace function recent_observations(p_workspace uuid, p_points integer, p_metric_ids integer[] default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'n' order by r.metric_id, r.period_start), '[]'::jsonb)
  from (
    select l.*, row_number() over (partition by l.metric_id order by l.period_start desc) as n
    from (
      select distinct on (metric_id, period_start) id, metric_id, period_start, value, submitter_id, source, original_value, access_key_id, created_at
      from observations
      where workspace_id = p_workspace and (p_metric_ids is null or metric_id = any (p_metric_ids))
      order by metric_id, period_start, created_at desc, id desc
    ) l
  ) r
  where r.n <= greatest(p_points, 0)
$$;

-- The Breakdown of each period of some Metrics: the rows of the latest value of that period that has rows (when the
-- rule keeps both, a later value without rows does not hide an earlier Breakdown). Filtered by Metric, not by a list
-- of value ids, which grew too long for a request.
create or replace function latest_breakdowns(p_workspace uuid, p_metric_ids integer[], p_from date default null, p_to date default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('metric_id', x.metric_id, 'period_start', x.period_start, 'rows', x.rows) order by x.metric_id, x.period_start), '[]'::jsonb)
  from (
    select distinct on (o.metric_id, o.period_start) o.metric_id, o.period_start,
      (select jsonb_agg(jsonb_build_object('label', b.label, 'value', b.value) order by b.position, b.id)
         from breakdown_rows b where b.observation_id = o.id and b.workspace_id = p_workspace) as rows
    from observations o
    where o.workspace_id = p_workspace and o.metric_id = any (p_metric_ids)
      and (p_from is null or o.period_start >= p_from)
      and (p_to is null or o.period_start <= p_to)
      and exists (select 1 from breakdown_rows b where b.observation_id = o.id and b.workspace_id = p_workspace)
    order by o.metric_id, o.period_start, o.created_at desc, o.id desc
  ) x
$$;

-- Only the core calls these, with the service role, after deciding what the person may see.
revoke execute on function latest_observations(uuid, integer[], date, date) from public, anon, authenticated;
revoke execute on function recent_observations(uuid, integer, integer[]) from public, anon, authenticated;
revoke execute on function latest_breakdowns(uuid, integer[], date, date) from public, anon, authenticated;
grant execute on function latest_observations(uuid, integer[], date, date) to service_role;
grant execute on function recent_observations(uuid, integer, integer[]) to service_role;
grant execute on function latest_breakdowns(uuid, integer[], date, date) to service_role;
