-- A Breakdown row may name a parent row (GLOSSARY: Breakdown; spec 0041, ticket 12): a row of the SAME Breakdown, so a
-- Breakdown can be drawn as a tree. Add-only: the column is optional, and a Breakdown without parents is as flat as ever.
-- The database holds the rules itself, whatever wrote the row (the core checks the same ones first, in words):
--   - the parent is a row of the same value (a composite foreign key), and so of the same Workspace (checked again below);
--   - a row is not its own parent, and there is no cycle;
--   - a row is at most 4 levels down (a top-level row is level 1);
--   - a Breakdown that has parents holds at most 200 rows (a flat one keeps its own, older limit); the guard fires on every
--     change of a row's parent or of the value it belongs to, and finds whether a value has parents through a partial index.
-- A parent's rows go with it: deleting a row deletes its parts, so a part is never left hanging at the top level.
-- No policy and no grant change: the table is read and written by the core with the service role, as before. No demo
-- row is touched.

alter table breakdown_rows add column parent_id bigint;
alter table breakdown_rows add constraint breakdown_rows_id_observation_key unique (id, observation_id);
alter table breakdown_rows add constraint breakdown_rows_parent_fk foreign key (parent_id, observation_id) references breakdown_rows (id, observation_id) on delete cascade;
alter table breakdown_rows add constraint breakdown_rows_not_own_parent check (parent_id is distinct from id);
create index breakdown_rows_parent on breakdown_rows (parent_id) where parent_id is not null;
-- Which Breakdowns have parents at all, found without reading a flat Breakdown's rows (a large flat one is not scanned per insert).
create index breakdown_rows_with_parents on breakdown_rows (observation_id) where parent_id is not null;

-- A replaced or deleted row keeps its place in the history: the id its parent had, which is that parent's own history entry's `row_id`.
alter table breakdown_history add column parent_row_id bigint;
create or replace function keep_breakdown_history() returns trigger
language plpgsql as $$
begin
  insert into breakdown_history (observation_id, label, value, value_sealed, row_id, parent_row_id) values (old.observation_id, old.label, old.value, old.value_sealed, old.id, old.parent_id);
  return old;
end;
$$;

create function breakdown_rows_parent_guard() returns trigger language plpgsql set search_path = public as $$
declare
  v_parent_obs bigint;
  v_levels_up int;
  v_cycle boolean;
  v_height int;
  v_rows int;
  v_ws uuid;
  v_parent_ws uuid;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'A Breakdown row cannot be its own parent.' using errcode = 'ZF460'; end if;
    select p.observation_id into v_parent_obs from breakdown_rows p where p.id = new.parent_id;
    if v_parent_obs is distinct from new.observation_id then raise exception 'A parent must be a row of the same Breakdown.' using errcode = 'ZF460'; end if;
    -- The Workspace of both is read from their values, whatever the row says of itself.
    select o.workspace_id into v_ws from observations o where o.id = new.observation_id;
    select o.workspace_id into v_parent_ws from observations o where o.id = v_parent_obs;
    if v_ws is distinct from v_parent_ws then raise exception 'A parent must be a row of the same Workspace.' using errcode = 'ZF460'; end if;
    -- The rows above: how many levels, and whether this very row is among them (a cycle). Stopped one past the limit.
    with recursive up(id, parent_id, n) as (
      select p.id, p.parent_id, 1 from breakdown_rows p where p.id = new.parent_id
      union all
      select r.id, r.parent_id, up.n + 1 from breakdown_rows r join up on r.id = up.parent_id where up.n < 6
    ) select max(n), coalesce(bool_or(id = new.id), false) into v_levels_up, v_cycle from up;
    if v_cycle then raise exception 'A Breakdown row cannot be its own ancestor.' using errcode = 'ZF460'; end if;
    -- The rows below (only an update has any): this row's own level plus the depth under it.
    with recursive down(id, n) as (
      select r.id, 1 from breakdown_rows r where r.parent_id = new.id
      union all
      select r.id, down.n + 1 from breakdown_rows r join down on r.parent_id = down.id where down.n < 6
    ) select coalesce(max(n), 0) into v_height from down;
    if v_levels_up + 1 + v_height > 4 then raise exception 'A Breakdown has at most 4 levels.' using errcode = 'ZF461'; end if;
  end if;
  -- Once a Breakdown has parents, it holds at most 200 rows.
  if new.parent_id is not null or exists (select 1 from breakdown_rows r where r.observation_id = new.observation_id and r.parent_id is not null) then
    select count(*) into v_rows from breakdown_rows r where r.observation_id = new.observation_id;
    -- An insert, or a row moved here from another value, is not counted among the rows yet.
    if tg_op = 'INSERT' or old.observation_id is distinct from new.observation_id then v_rows := v_rows + 1; end if;
    if v_rows > 200 then raise exception 'A Breakdown with parents has at most 200 rows.' using errcode = 'ZF462'; end if;
  end if;
  return new;
end $$;
revoke all on function breakdown_rows_parent_guard() from public, anon, authenticated;
create trigger breakdown_rows_parent_guard before insert or update of parent_id, observation_id on breakdown_rows for each row execute function breakdown_rows_parent_guard();

-- The Breakdown of each period of some Metrics, as before, with each row's parent.
create or replace function latest_breakdowns(p_workspace uuid, p_metric_ids integer[], p_from date default null, p_to date default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('metric_id', x.metric_id, 'period_start', x.period_start, 'rows', x.rows) order by x.metric_id, x.period_start), '[]'::jsonb)
  from (
    select distinct on (o.metric_id, o.period_start) o.metric_id, o.period_start,
      (select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.label, 'value', b.value, 'value_sealed', b.value_sealed, 'parent_id', b.parent_id) order by b.position, b.id)
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

-- Recording a value, as it was, with each new row's parent (an id the core reserved, of a row of this value that comes
-- earlier in the list or is there already). The rest is as in 20270122000000.
create or replace function record_value(
  p_metric int, p_period date, p_op text, p_new_id bigint, p_value numeric, p_value_sealed text, p_submitter text, p_source text,
  p_access_key bigint, p_imported boolean, p_expect_id bigint, p_expect_count int, p_expect_value text, p_expect_rows int, p_rows jsonb,
  p_entered_by text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_rule text;
  v_id bigint;
  v_plain numeric;
  v_sealed text;
  v_by text;
  v_who text;
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
  select o.id, o.value, o.value_sealed, o.entered_by, o.submitter_id into v_id, v_plain, v_sealed, v_by, v_who from observations o
    where o.metric_id = p_metric and o.period_start = p_period order by o.created_at desc, o.id desc limit 1 for update;
  select count(*) into v_count from observations o where o.metric_id = p_metric and o.period_start = p_period;
  if v_id is distinct from p_expect_id or v_count is distinct from p_expect_count then raise exception 'The period changed meanwhile.' using errcode = 'ZF409'; end if;
  if p_entered_by is not null then
    -- Someone else's value is entered once, for a period with none, under a rule that keeps one value per period.
    if v_id is not null then raise exception 'The period already has a value.' using errcode = 'ZF450'; end if;
    if v_rule not in ('reject', 'overwrite') then raise exception 'This Submission Rule combines several people''s values.' using errcode = 'ZF452'; end if;
    if p_entered_by is not distinct from p_submitter then raise exception 'A value is entered for someone else.' using errcode = 'ZF452'; end if;
    -- Never a Guest, whoever asks.
    if exists (select 1 from memberships mm join metrics mt on mt.workspace_id = mm.workspace_id where mt.id = p_metric and mm.user_id = p_entered_by and mm.role = 'guest') then
      raise exception 'A Guest cannot fill in for someone.' using errcode = 'ZF452';
    end if;
  end if;
  -- The operation follows the Metric's Submission Rule, which the core applied: a call that does not is refused. The one
  -- exception is the submitter's own value replacing a Filled-in Value for them, which replaces it under any rule.
  if (p_op = 'overwrite' and v_rule <> 'overwrite' and not (v_by is not null and p_entered_by is null and v_who is not distinct from p_submitter))
    or (p_op = 'add' and v_rule <> 'add') or (p_op = 'insert' and v_id is not null and v_rule <> 'keep_both')
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
    insert into observations (id, metric_id, period_start, value, value_sealed, submitter_id, entered_by, source, access_key_id, imported)
      values (p_new_id, p_metric, p_period, p_value, p_value_sealed, p_submitter, p_entered_by, p_source, p_access_key, v_id is null and coalesce(p_imported, false));
    v_id := p_new_id;
  elsif p_op = 'overwrite' then
    update observations set value = p_value, value_sealed = p_value_sealed, submitter_id = p_submitter, entered_by = p_entered_by, source = p_source, access_key_id = p_access_key, created_at = now()
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
      insert into breakdown_rows (id, observation_id, label, label_index, value, value_sealed, position, parent_id)
        select (e->>'id')::bigint, v_id, e->>'label', e->>'index', (e->>'value')::numeric, e->>'value_sealed', coalesce(max(r.position) + 1, 0), (e->>'parent')::bigint
        from breakdown_rows r where r.observation_id = v_id;
    end if;
  end loop;
  return v_id;
end;
$$;
revoke execute on function record_value(int, date, text, bigint, numeric, text, text, text, bigint, boolean, bigint, int, text, int, jsonb, text) from public, anon, authenticated;
grant execute on function record_value(int, date, text, bigint, numeric, text, text, text, bigint, boolean, bigint, int, text, int, jsonb, text) to service_role;
