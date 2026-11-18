-- "Add up all values" in the database (GLOSSARY: Submission Rule; spec 0022, ticket #111). Reading the value, adding
-- in JavaScript and writing it back lost one of two values that arrived together, and stored float noise such as
-- 0.30000000000000004. Here the sum is one statement under a lock on the Metric's period, so two values sent at the
-- same moment both count, also when the period had no value yet, and the sum is rounded to 6 decimals.
-- Answers the observation, the value it had before (null when this value is the first) and the value it has now.
create or replace function add_to_observation(
  p_metric int, p_period date, p_value numeric, p_submitter text, p_source text, p_access_key bigint, p_imported boolean
) returns table (observation_id bigint, before numeric, after numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_before numeric;
  v_after numeric;
begin
  -- One lock per Metric and period for the rest of the transaction: the second value waits for the first.
  perform pg_advisory_xact_lock(p_metric, hashtext('add_to_observation:' || p_period::text));
  select o.id, o.value into v_id, v_before from observations o
    where o.metric_id = p_metric and o.period_start = p_period order by o.created_at desc, o.id desc limit 1;
  if v_id is null then
    insert into observations (metric_id, period_start, value, submitter_id, source, access_key_id, imported)
      -- The first value is stored as received, as under every other rule; only a sum is rounded.
      values (p_metric, p_period, p_value, p_submitter, p_source, p_access_key, coalesce(p_imported, false))
      returning id, value into v_id, v_after;
  else
    update observations set value = round(value + p_value, 6) where id = v_id returning value into v_after;
  end if;
  return query select v_id, v_before, v_after;
end;
$$;
revoke execute on function add_to_observation(int, date, numeric, text, text, bigint, boolean) from public, anon, authenticated;
grant execute on function add_to_observation(int, date, numeric, text, text, bigint, boolean) to service_role;
