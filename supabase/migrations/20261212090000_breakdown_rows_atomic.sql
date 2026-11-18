-- Every Submission Rule applied in one database call, with the value's Breakdown (GLOSSARY: Submission Rule,
-- Breakdown; spec 0022, ticket #126). #111 made "Add up all values" one statement, but its rows were still read, merged
-- in JavaScript and written back, so two values with breakdowns arriving together lost rows. The other rules looked
-- for an earlier value and wrote after, so two values at once into an empty period were both kept even under
-- "Reject a second value" or "Overwrite with the newer value", and two overwrites could leave rows of both.
--
-- record_observation takes the lock add_to_observation takes, on the Metric's period, until the transaction ends: a
-- second value waits for the first and then sees it. It answers what became of the value:
-- - recorded: the period had no value; the value and its rows are stored as sent;
-- - added ("add"): the value is added to the latest one, rounded to 6 decimals; a row whose label is already there
--   (in any case) is added to the same way, a new label is put after the others;
-- - overwritten ("overwrite"): the latest value is replaced, with its sender, source and time, and so are its rows;
-- - kept_both ("keep_both"): stored beside the earlier values (`earlier` says how many), with its own rows;
-- - rejected_duplicate ("reject"): nothing is written.
-- `before` is the latest value the period had, null when there was none; `after` is the value now stored for it.
create or replace function record_observation(
  p_metric int, p_period date, p_rule text, p_value numeric, p_submitter text, p_source text, p_access_key bigint, p_imported boolean, p_rows jsonb
) returns table (observation_id bigint, outcome text, before numeric, after numeric, earlier int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_id bigint;
  v_before numeric;
  v_after numeric;
  v_earlier int;
  v_outcome text;
  v_row record;
  v_hit bigint;
begin
  if p_rule not in ('add', 'overwrite', 'keep_both', 'reject') then raise exception 'Unknown Submission Rule %', p_rule; end if;
  -- The same lock as add_to_observation's, so every way a value is written for this period waits its turn.
  perform pg_advisory_xact_lock(p_metric, hashtext('add_to_observation:' || p_period::text));
  select o.id, o.value into v_id, v_before from observations o
    where o.metric_id = p_metric and o.period_start = p_period order by o.created_at desc, o.id desc limit 1;
  select count(*) into v_earlier from observations o where o.metric_id = p_metric and o.period_start = p_period;

  if v_id is null or p_rule = 'keep_both' then
    insert into observations (metric_id, period_start, value, submitter_id, source, access_key_id, imported)
      -- An Import only ever fills an empty period.
      values (p_metric, p_period, p_value, p_submitter, p_source, p_access_key, v_id is null and coalesce(p_imported, false))
      returning id, value into v_id, v_after;
    v_outcome := case when v_before is null then 'recorded' else 'kept_both' end;
  elsif p_rule = 'reject' then
    return query select v_id, 'rejected_duplicate'::text, v_before, v_before, v_earlier;
    return;
  elsif p_rule = 'overwrite' then
    update observations set value = p_value, submitter_id = p_submitter, source = p_source, access_key_id = p_access_key, created_at = now()
      where id = v_id returning value into v_after;
    delete from breakdown_rows where observation_id = v_id;
    v_outcome := 'overwritten';
  else
    update observations set value = round(value + p_value, 6) where id = v_id returning value into v_after;
    v_outcome := 'added';
  end if;

  for v_row in select e->>'label' as label, (e->>'value')::numeric as value, n from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(e, n) order by n loop
    v_hit := null;
    if v_outcome = 'added' then
      select r.id into v_hit from breakdown_rows r where r.observation_id = v_id and lower(r.label) = lower(v_row.label) order by r.position, r.id limit 1;
    end if;
    if v_hit is null then
      insert into breakdown_rows (observation_id, label, value, position)
        select v_id, v_row.label, v_row.value, coalesce(max(r.position) + 1, 0) from breakdown_rows r where r.observation_id = v_id;
    else
      update breakdown_rows set value = round(value + v_row.value, 6) where id = v_hit;
    end if;
  end loop;
  return query select v_id, v_outcome, v_before, v_after, v_earlier;
end;
$$;
revoke execute on function record_observation(int, date, text, numeric, text, text, bigint, boolean, jsonb) from public, anon, authenticated;
grant execute on function record_observation(int, date, text, numeric, text, text, bigint, boolean, jsonb) to service_role;
