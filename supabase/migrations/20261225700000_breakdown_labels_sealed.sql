-- Breakdown labels sealed with the Workspace Key, merged by blind index (GLOSSARY: Breakdown, Workspace Key; spec 0028
-- step 1, ticket #335). A label is free text people wrote, so the core writes it sealed, bound to its row's id, and
-- the database never opens it. "Add up" still merges a row into the one with the same label: it matches the blind
-- index the core stores beside the label (an HMAC with a key of the Workspace, never a plain hash), so two rows are
-- seen as equal only inside one Workspace. Rows written before, or where nothing is sealed (the demo, an Installation
-- without ZIFFR_SECRETS_KEY), have no index and are still matched by lower(label) until the re-encryption job (#247).

alter table breakdown_rows add column label_index text;
-- The row a history entry was copied from: its label is sealed for that row and opens with that row's id.
alter table breakdown_history add column row_id bigint;

-- A row keeps its label as stored (sealed or plain) and its id in the history, so the history opens like the row.
create or replace function keep_breakdown_history() returns trigger
language plpgsql as $$
begin
  insert into breakdown_history (observation_id, label, value, row_id) values (old.observation_id, old.label, old.value, old.id);
  return old;
end;
$$;

-- Ids for breakdown_rows too: a label is sealed for its row, so the id is taken first.
create or replace function reserve_row_ids(p_table text, p_count integer) returns bigint[] language plpgsql security definer set search_path = public as $$
declare
  seq text;
begin
  if p_table not in ('thread_messages', 'actions', 'deliveries', 'intake_log', 'audit_events', 'alerts', 'breakdown_rows') then
    raise exception 'Not a table with sealed columns: %', p_table;
  end if;
  if p_count is null or p_count < 1 or p_count > 1000 then
    raise exception 'Between 1 and 1000 ids at a time.';
  end if;
  seq := pg_get_serial_sequence(p_table, 'id');
  return array(select nextval(seq) from generate_series(1, p_count));
end;
$$;
revoke all on function reserve_row_ids(text, integer) from public, anon, authenticated;

-- A row's id may be given only as reserve_row_ids handed it out, never one ahead of the sequence.
create or replace function breakdown_rows_id_reserved() returns trigger language plpgsql as $$
begin
  if new.id > (select last_value from breakdown_rows_id_seq) then
    raise exception 'A Breakdown row id must come from reserve_row_ids.';
  end if;
  return new;
end $$;
create trigger breakdown_rows_id_reserved before insert on breakdown_rows for each row execute function breakdown_rows_id_reserved();

-- The Breakdown of each period of some Metrics, as before, with each row's id (a sealed label opens with it).
create or replace function latest_breakdowns(p_workspace uuid, p_metric_ids integer[], p_from date default null, p_to date default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('metric_id', x.metric_id, 'period_start', x.period_start, 'rows', x.rows) order by x.metric_id, x.period_start), '[]'::jsonb)
  from (
    select distinct on (o.metric_id, o.period_start) o.metric_id, o.period_start,
      (select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.label, 'value', b.value) order by b.position, b.id)
         from breakdown_rows b where b.observation_id = o.id and b.workspace_id = p_workspace) as rows
    from observations o
    where o.workspace_id = p_workspace and o.metric_id = any (p_metric_ids)
      and (p_from is null or o.period_start >= p_from)
      and (p_to is null or o.period_start <= p_to)
      and exists (select 1 from breakdown_rows b where b.observation_id = o.id and b.workspace_id = p_workspace)
    order by o.metric_id, o.period_start, o.created_at desc, o.id desc
  ) x
$$;
revoke execute on function latest_breakdowns(uuid, integer[], date, date) from public, anon, authenticated;
grant execute on function latest_breakdowns(uuid, integer[], date, date) to service_role;

-- record_observation as before (same rules, same answer), with rows that come ready from the core. Each element of
-- p_rows: value; label (as to be stored, sealed where the Workspace seals); id (reserved for the row, null where
-- nothing is sealed); index (the label's blind index to store) and indexes (its blind index under every key version,
-- to find a row whichever version wrote it); legacy (lower(label) in clear, only when the period still has plain
-- rows, so those keep merging until #247).
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
  v_new bigint;
begin
  if p_rule not in ('add', 'overwrite', 'keep_both', 'reject') then raise exception 'Unknown Submission Rule %', p_rule; end if;
  perform pg_advisory_xact_lock(p_metric, hashtext('add_to_observation:' || p_period::text));
  select o.id, o.value into v_id, v_before from observations o
    where o.metric_id = p_metric and o.period_start = p_period order by o.created_at desc, o.id desc limit 1;
  select count(*) into v_earlier from observations o where o.metric_id = p_metric and o.period_start = p_period;

  if v_id is null or p_rule = 'keep_both' then
    insert into observations (metric_id, period_start, value, submitter_id, source, access_key_id, imported)
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

  for v_row in
    select (e->>'id')::bigint as id, e->>'label' as label, e->>'index' as label_index,
           array(select jsonb_array_elements_text(coalesce(e->'indexes', '[]'::jsonb))) as indexes,
           e->>'legacy' as legacy, (e->>'value')::numeric as value, n
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(e, n) order by n
  loop
    v_hit := null;
    if v_outcome = 'added' then
      -- A row with an index is matched by it; a row without one (written before sealing) by its plain label.
      select r.id into v_hit from breakdown_rows r where r.observation_id = v_id and (
          (r.label_index is not null and r.label_index = any (v_row.indexes))
          or (v_row.legacy is not null and r.label_index is null and lower(r.label) = v_row.legacy)
        ) order by r.position, r.id limit 1;
    end if;
    if v_hit is null then
      v_new := coalesce(v_row.id, nextval(pg_get_serial_sequence('breakdown_rows', 'id')));
      insert into breakdown_rows (id, observation_id, label, label_index, value, position)
        select v_new, v_id, v_row.label, v_row.label_index, v_row.value, coalesce(max(r.position) + 1, 0) from breakdown_rows r where r.observation_id = v_id;
    else
      update breakdown_rows set value = round(value + v_row.value, 6) where id = v_hit;
    end if;
  end loop;
  return query select v_id, v_outcome, v_before, v_after, v_earlier;
end;
$$;
revoke execute on function record_observation(int, date, text, numeric, text, text, bigint, boolean, jsonb) from public, anon, authenticated;
grant execute on function record_observation(int, date, text, numeric, text, text, bigint, boolean, jsonb) to service_role;
