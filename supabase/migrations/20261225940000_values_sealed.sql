-- Values and Metric names sealed with the Workspace Key (GLOSSARY: Workspace Key, Observation, Breakdown, Target Series;
-- spec 0028 step 2, ticket #248). A number is sealed as text, bound to the row it lives in: the numeric column is
-- emptied and a text column beside it holds the sealed value, with a check that exactly one of them is set (an
-- optional number: at most one). The database never opens a sealed value, so everything that added numbers up here
-- moves into the core: record_value below only writes what the core computed, after checking that the rows are as the
-- core read them (a compare-and-swap; the core retries). Rows written before, and Workspaces without a key (the demo,
-- an Installation without ZIFFR_SECRETS_KEY), keep plain numbers and are read as before until the re-encryption job
-- seals them.

-- 1. The columns -----------------------------------------------------------------------------------------------------

alter table observations alter column value drop not null;
alter table observations add column value_sealed text, add column original_value_sealed text;
alter table observations add constraint observations_one_value check (num_nonnulls(value, value_sealed) = 1);
alter table observations add constraint observations_one_original check (num_nonnulls(original_value, original_value_sealed) <= 1);

-- An entry of the history keeps the value as it was stored, sealed for the observation it was a value of.
alter table observation_history alter column value drop not null;
alter table observation_history add column value_sealed text;
alter table observation_history add constraint observation_history_one_value check (num_nonnulls(value, value_sealed) = 1);

alter table breakdown_rows alter column value drop not null;
alter table breakdown_rows add column value_sealed text;
alter table breakdown_rows add constraint breakdown_rows_one_value check (num_nonnulls(value, value_sealed) = 1);

alter table breakdown_history alter column value drop not null;
alter table breakdown_history add column value_sealed text;
alter table breakdown_history add constraint breakdown_history_one_value check (num_nonnulls(value, value_sealed) = 1);

-- A Target Series or Projection point is sealed for its place: the Metric, the kind and the day.
alter table series_values alter column value drop not null;
alter table series_values add column value_sealed text;
alter table series_values add constraint series_values_one_value check (num_nonnulls(value, value_sealed) = 1);

-- A Metric's Target Range, and the value a late Correction proposes.
alter table metrics add column target_min_sealed text, add column target_max_sealed text;
alter table metrics add constraint metrics_one_target_min check (num_nonnulls(target_min, target_min_sealed) <= 1);
alter table metrics add constraint metrics_one_target_max check (num_nonnulls(target_max, target_max_sealed) <= 1);
alter table thread_messages add column correction_value_sealed text;
alter table thread_messages add constraint thread_messages_one_correction check (num_nonnulls(correction_value, correction_value_sealed) <= 1);

-- 2. What the database copies and passes on --------------------------------------------------------------------------

-- Ids for observations too: a sealed value is bound to its row's id, so the core takes it first.
create or replace function reserve_row_ids(p_table text, p_count integer) returns bigint[] language plpgsql security definer set search_path = public as $$
declare
  seq text;
begin
  if p_table not in ('thread_messages', 'actions', 'deliveries', 'intake_log', 'audit_events', 'alerts', 'breakdown_rows', 'observations', 'prompts') then
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

-- A value replaced or deleted goes to the history as it was stored (plain or sealed for its observation).
create or replace function keep_observation_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and (not exists (select 1 from workspaces where id = old.workspace_id) or not exists (select 1 from metrics where id = old.metric_id)) then
    return old;
  end if;
  if tg_op = 'DELETE' or old.value is distinct from new.value or old.value_sealed is distinct from new.value_sealed then
    insert into observation_history (observation_id, metric_id, period_start, value, value_sealed, submitter_id, source, recorded_at, change)
      values (old.id, old.metric_id, old.period_start, old.value, old.value_sealed, old.submitter_id, old.source, old.created_at, case tg_op when 'UPDATE' then 'updated' else 'deleted' end);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function keep_breakdown_history() returns trigger
language plpgsql as $$
begin
  insert into breakdown_history (observation_id, label, value, value_sealed, row_id) values (old.observation_id, old.label, old.value, old.value_sealed, old.id);
  return old;
end;
$$;

drop trigger observations_touch_workspace on observations;
create trigger observations_touch_workspace after insert or update of value, value_sealed on observations for each row execute function observations_touch_workspace();

-- The latest value of each period, as before, with the sealed columns that the core opens.
create or replace function latest_observations(p_workspace uuid, p_metric_ids integer[] default null, p_from date default null, p_to date default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(o) order by o.metric_id, o.period_start), '[]'::jsonb)
  from (
    select distinct on (metric_id, period_start) id, metric_id, period_start, value, value_sealed, submitter_id, source, original_value, original_value_sealed, access_key_id, created_at
    from observations
    where workspace_id = p_workspace
      and (p_metric_ids is null or metric_id = any (p_metric_ids))
      and (p_from is null or period_start >= p_from)
      and (p_to is null or period_start <= p_to)
    order by metric_id, period_start, created_at desc, id desc
  ) o
$$;

create or replace function recent_observations(p_workspace uuid, p_points integer, p_metric_ids integer[] default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'n' order by r.metric_id, r.period_start), '[]'::jsonb)
  from (
    select l.*, row_number() over (partition by l.metric_id order by l.period_start desc) as n
    from (
      select distinct on (metric_id, period_start) id, metric_id, period_start, value, value_sealed, submitter_id, source, original_value, original_value_sealed, access_key_id, created_at
      from observations
      where workspace_id = p_workspace and (p_metric_ids is null or metric_id = any (p_metric_ids))
      order by metric_id, period_start, created_at desc, id desc
    ) l
  ) r
  where r.n <= greatest(p_points, 0)
$$;

create or replace function latest_breakdowns(p_workspace uuid, p_metric_ids integer[], p_from date default null, p_to date default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('metric_id', x.metric_id, 'period_start', x.period_start, 'rows', x.rows) order by x.metric_id, x.period_start), '[]'::jsonb)
  from (
    select distinct on (o.metric_id, o.period_start) o.metric_id, o.period_start,
      (select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.label, 'value', b.value, 'value_sealed', b.value_sealed) order by b.position, b.id)
         from breakdown_rows b where b.observation_id = o.id and b.workspace_id = p_workspace) as rows
    from observations o
    where o.workspace_id = p_workspace and o.metric_id = any (p_metric_ids)
      and (p_from is null or o.period_start >= p_from)
      and (p_to is null or o.period_start <= p_to)
      and exists (select 1 from breakdown_rows b where b.observation_id = o.id and b.workspace_id = p_workspace)
    order by o.metric_id, o.period_start, o.created_at desc, o.id desc
  ) x
$$;
revoke execute on function latest_observations(uuid, integer[], date, date) from public, anon, authenticated;
revoke execute on function recent_observations(uuid, integer, integer[]) from public, anon, authenticated;
revoke execute on function latest_breakdowns(uuid, integer[], date, date) from public, anon, authenticated;
grant execute on function latest_observations(uuid, integer[], date, date) to service_role;
grant execute on function recent_observations(uuid, integer, integer[]) to service_role;
grant execute on function latest_breakdowns(uuid, integer[], date, date) to service_role;

-- 3. Recording a value -----------------------------------------------------------------------------------------------

-- Target Series and Projections: the core sends each point as { period, value, sealed } (sealed where the Workspace
-- seals, then value is null) and the database upserts them. It adds nothing up.
create or replace function set_series_values(p_metric integer, p_kind text, p_saves jsonb, p_removes date[], p_note text)
returns table(saved integer, removed integer) language plpgsql security definer set search_path = public as $$
declare
  n_saved int := 0;
  n_removed int := 0;
begin
  if p_kind not in ('target', 'projection') then raise exception 'unknown series %', p_kind; end if;
  insert into series_values (metric_id, kind, period_start, value, value_sealed, note)
    select p_metric, p_kind, (s->>'period')::date, (s->>'value')::numeric, s->>'sealed', nullif(left(coalesce(p_note, ''), 120), '')
    from jsonb_array_elements(coalesce(p_saves, '[]'::jsonb)) s
  on conflict (metric_id, kind, period_start) do update set value = excluded.value, value_sealed = excluded.value_sealed, note = excluded.note;
  get diagnostics n_saved = row_count;
  delete from series_values where metric_id = p_metric and kind = p_kind and period_start = any(coalesce(p_removes, '{}'::date[]));
  get diagnostics n_removed = row_count;
  return query select n_saved, n_removed;
end $$;

-- record_observation computed with values in SQL, which cannot be done with sealed ones: the core now reads the period's
-- values, applies the Submission Rule itself (adding up included, exactly) and hands record_value what to write. The
-- database checks, under the same lock as before, that the rows are as the core read them and writes nothing
-- otherwise: it raises ZF409 and the core reads again (a compare-and-swap, retried a few times).
-- Whether a plain stored number is the one the core read (as text): compared as doubles, which is what the core
-- read it as. A sealed text never parses, so the cast is behind the pattern check, in a case.
create function same_plain_number(p_stored numeric, p_expected text) returns boolean language sql immutable as $$
  select case when p_stored is not null and p_expected ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' then p_stored::float8 = p_expected::float8 else false end
$$;
revoke all on function same_plain_number(numeric, text) from public, anon, authenticated;

drop function record_observation(int, date, text, numeric, text, text, bigint, boolean, jsonb);
drop function if exists add_to_observation(int, date, numeric, text, text, bigint, boolean);

-- p_op: 'insert' (a new value, id p_new_id), 'overwrite' or 'add' (the latest value of the period, changed).
-- p_expect_id/p_expect_count: the latest value and how many the period has, as the core read them; p_expect_value:
-- the latest value as stored (the sealed text, or the plain number as text), for 'overwrite' and 'add'; p_expect_rows:
-- how many Breakdown rows that value has ('add', when rows are to be merged into them; otherwise null). Each element of p_rows: { op: 'insert', id, label, index, value,
-- value_sealed } or { op: 'update', id, value, value_sealed, expect } (expect as stored, as p_expect_value).
create function record_value(
  p_metric int, p_period date, p_op text, p_new_id bigint, p_value numeric, p_value_sealed text, p_submitter text, p_source text,
  p_access_key bigint, p_imported boolean, p_expect_id bigint, p_expect_count int, p_expect_value text, p_expect_rows int, p_rows jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_rule text;
  v_id bigint;
  v_plain numeric;
  v_sealed text;
  v_count int;
  v_rows int;
  e jsonb;
  v_n int;
begin
  if p_op not in ('insert', 'overwrite', 'add') then raise exception 'Unknown operation %', p_op; end if;
  select m.submission_rule into v_rule from metrics m where m.id = p_metric;
  if v_rule is null then raise exception 'Unknown Metric'; end if;
  perform pg_advisory_xact_lock(p_metric, hashtext('add_to_observation:' || p_period::text));
  -- The latest value is locked as a row too: writers that do not take the advisory lock (a Correction accepted, a value
  -- corrected by its submitter) wait for this one, and the updates below hold only if the value is still as read.
  select o.id, o.value, o.value_sealed into v_id, v_plain, v_sealed from observations o
    where o.metric_id = p_metric and o.period_start = p_period order by o.created_at desc, o.id desc limit 1 for update;
  select count(*) into v_count from observations o where o.metric_id = p_metric and o.period_start = p_period;
  if v_id is distinct from p_expect_id or v_count is distinct from p_expect_count then raise exception 'The period changed meanwhile.' using errcode = 'ZF409'; end if;
  -- The operation follows the Metric's Submission Rule, which the core applied: a call that does not is refused.
  if (p_op = 'add' and v_rule <> 'add') or (p_op = 'overwrite' and v_rule <> 'overwrite') or (p_op = 'insert' and v_id is not null and v_rule <> 'keep_both')
    or (p_op <> 'insert' and v_id is null) then
    raise exception 'The operation does not follow the Submission Rule.';
  end if;
  if p_op in ('overwrite', 'add') then
    -- Sealed values are compared as stored; a plain one as a double, which is what the core read it as.
    if not (case when v_sealed is not null then v_sealed = p_expect_value else same_plain_number(v_plain, p_expect_value) end) then
      raise exception 'The value changed meanwhile.' using errcode = 'ZF409';
    end if;
  end if;
  if p_op = 'add' and p_expect_rows is not null then
    select count(*) into v_rows from breakdown_rows r where r.observation_id = v_id;
    if v_rows <> p_expect_rows then raise exception 'The rows changed meanwhile.' using errcode = 'ZF409'; end if;
  end if;

  if p_op = 'insert' then
    insert into observations (id, metric_id, period_start, value, value_sealed, submitter_id, source, access_key_id, imported)
      values (p_new_id, p_metric, p_period, p_value, p_value_sealed, p_submitter, p_source, p_access_key, v_id is null and coalesce(p_imported, false));
    v_id := p_new_id;
  elsif p_op = 'overwrite' then
    update observations set value = p_value, value_sealed = p_value_sealed, submitter_id = p_submitter, source = p_source, access_key_id = p_access_key, created_at = now()
      where id = v_id and value is not distinct from v_plain and value_sealed is not distinct from v_sealed;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'The value changed meanwhile.' using errcode = 'ZF409'; end if;
    delete from breakdown_rows where observation_id = v_id;
  else
    update observations set value = p_value, value_sealed = p_value_sealed
      where id = v_id and value is not distinct from v_plain and value_sealed is not distinct from v_sealed;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'The value changed meanwhile.' using errcode = 'ZF409'; end if;
  end if;

  for e in select x from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(x, n) order by n loop
    if e->>'op' = 'update' then
      update breakdown_rows set value = (e->>'value')::numeric, value_sealed = e->>'value_sealed'
        where id = (e->>'id')::bigint and observation_id = v_id
          and case when value_sealed is not null then value_sealed = e->>'expect' else same_plain_number(value, e->>'expect') end;
      get diagnostics v_n = row_count;
      if v_n <> 1 then raise exception 'A row changed meanwhile.' using errcode = 'ZF409'; end if;
    else
      insert into breakdown_rows (id, observation_id, label, label_index, value, value_sealed, position)
        select (e->>'id')::bigint, v_id, e->>'label', e->>'index', (e->>'value')::numeric, e->>'value_sealed', coalesce(max(r.position) + 1, 0)
        from breakdown_rows r where r.observation_id = v_id;
    end if;
  end loop;
  return v_id;
end;
$$;
revoke execute on function record_value(int, date, text, bigint, numeric, text, text, text, bigint, boolean, bigint, int, text, int, jsonb) from public, anon, authenticated;
grant execute on function record_value(int, date, text, bigint, numeric, text, text, text, bigint, boolean, bigint, int, text, int, jsonb) to service_role;
