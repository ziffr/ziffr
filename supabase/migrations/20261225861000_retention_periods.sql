-- Retention, what a preview counts (spec 0033, ticket #381; GLOSSARY: Retention): per period older than a day, how many
-- values a Metric holds, how many Breakdown rows they carry, and how many earlier values (Superseded Values) they left
-- behind. One row per period, counted in the database, so a Metric with years of values is previewed in one call
-- and nothing but counts leaves it. Service role only, like the rest of the core's reads.
create or replace function retention_periods(p_ws uuid, p_metric int, p_cutoff date)
returns table (period_start date, values_held int, breakdown_rows int, superseded int)
language sql stable set search_path = public as $$
  with obs as (
    select id, o.period_start from observations o where o.workspace_id = p_ws and o.metric_id = p_metric and o.period_start < p_cutoff
  ),
  per as (select obs.period_start, count(*) as n from obs group by 1),
  rows_ as (select obs.period_start, count(*) as n from breakdown_rows r join obs on obs.id = r.observation_id group by 1),
  rows_old as (select obs.period_start, count(*) as n from breakdown_history h join obs on obs.id = h.observation_id group by 1),
  vals_old as (
    select h.period_start, count(*) as n from observation_history h
    where h.workspace_id = p_ws and h.metric_id = p_metric and h.period_start < p_cutoff group by 1
  )
  select per.period_start, per.n::int, coalesce(rows_.n, 0)::int, (coalesce(rows_old.n, 0) + coalesce(vals_old.n, 0))::int
  from per
  left join rows_ using (period_start)
  left join rows_old using (period_start)
  left join vals_old using (period_start)
  order by per.period_start;
$$;
revoke execute on function retention_periods(uuid, int, date) from public, anon, authenticated;
grant execute on function retention_periods(uuid, int, date) to service_role;
