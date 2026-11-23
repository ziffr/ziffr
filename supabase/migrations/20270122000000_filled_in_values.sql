-- Filled-in Values (spec 0046, ticket #800; GLOSSARY: Filled-in Value, Stand-in, Observation, Superseded Value, Delivery):
-- a value one person enters for a Submitter who has not sent it is recorded as the Submitter's and always carries who
-- entered it.
--
-- observations.entered_by: the person who entered it, when that is not the submitter; a person id like submitter_id, so
-- it is not sealed. A value the submitter replaces with their own sets it back to null; the Filled-in Value then lives on
-- in observation_history with its entered_by (a Superseded Value).
alter table observations add column entered_by text references profiles(id);
alter table observations add constraint observations_entered_by_not_submitter check (entered_by is null or entered_by is distinct from submitter_id);
alter table observation_history add column entered_by text;

-- For an Import from a Workspace Export: the name of who entered the value, free text about a person, sealed with the
-- Workspace Key like submitted_by_name (spec 0040) and bound to its value's row. A value recorded in the app has none.
alter table observations add column entered_by_name text;

-- Whom a Stand-in's Prompt asks for: set when Ziffr asks the Stand-in in someone's place. The answer to a Prompt is
-- recorded under this person, never guessed from the Tokens, so someone who both submits and stands in records each
-- answer under the right name.
alter table prompts add column stands_in_for text references profiles(id);
-- Prompts asked before this existed: one that went to someone who holds a Stand-in's Token for the Metric and no Token
-- of their own for it was a Stand-in's Prompt, and still waits for an answer under the new rule. It touches the demo's
-- rows too, so the demo guard is told for this one statement.
do $$
begin
  perform set_config('ziffr.demo_seed', 'on', true);
  update prompts p set stands_in_for = (select t.stands_in_for from tokens t where t.metric_id = p.metric_id and t.submitter_id = p.submitter_id and t.stands_in_for is not null limit 1)
    where p.stands_in_for is null
      and exists (select 1 from tokens t where t.metric_id = p.metric_id and t.submitter_id = p.submitter_id and t.stands_in_for is not null)
      and not exists (select 1 from tokens o where o.metric_id = p.metric_id and o.submitter_id = p.submitter_id and o.stands_in_for is null);
  perform set_config('ziffr.demo_seed', 'off', true);
end $$;

-- Who set an Away entry. Away is global (one row per person, whatever their Workspaces), so it opens filling in only when the
-- person set it themselves or an Owner or Admin of the Metric's own Workspace did: not an Admin of another Workspace.
-- Entries from before this are taken as set by the person, as the app let them set their own.
alter table away add column set_by text references profiles(id) on delete set null;
update away set set_by = user_id where set_by is null;

-- The message about a Filled-in Value names the value it is about, so that it is checked again when it is sent.
alter table deliveries add column filled_in_observation_id bigint references observations(id) on delete set null;

-- The re-encryption job and its counts know the new sealed column: seal_table as it was (spec 0040, ticket 9), with
-- observations' text columns now submitted_by_name and entered_by_name.
create or replace function seal_table(p_table text, out key text, out cols text[], out ncols text[], out extra text[], out scope text) language plpgsql immutable as $$
begin
  ncols := array[]::text[];
  extra := array[]::text[];
  case p_table
    when 'thread_messages' then key := 'id'; cols := array['body']; ncols := array['correction_value']; scope := 'workspace_id = $1';
    when 'actions' then key := 'id'; cols := array['question', 'breakdown_label']; scope := 'workspace_id = $1';
    when 'contacts' then key := 'person_id'; cols := array['email', 'slack_handle', 'phone']; scope := 'workspace_id = $1';
    when 'profiles' then key := 'id'; cols := array['name'];
      scope := 'role = ''Contact'' and (contact_workspace = $1 or (contact_workspace is null and id in (select c.person_id from contacts c where c.workspace_id = $1))) and not exists (select 1 from contacts o where o.person_id = profiles.id and o.workspace_id <> $1)';
    when 'deliveries' then key := 'id'; cols := array['subject', 'body']; scope := 'workspace_id = $1';
    -- A Prompt's text names the Metric it asks about.
    when 'prompts' then key := 'id'; cols := array['text']; scope := 'workspace_id = $1';
    when 'intake_log' then key := 'id'; cols := array['sender', 'raw', 'detail']; scope := 'workspace_id = $1';
    when 'audit_events' then key := 'id'; cols := array['object_name']; scope := 'workspace_id = $1';
    when 'alerts' then key := 'id'; cols := array['level']; scope := 'workspace_id = $1';
    when 'webhooks' then key := 'id'; cols := array['url', 'secret', 'secret_previous']; scope := 'workspace_id = $1';
    when 'webhook_external_ids' then key := 'id'; cols := array['external_id', 'url']; scope := 'workspace_id = $1';
    when 'dashboards' then key := 'id'; cols := array['intro']; scope := 'workspace_id = $1';
    when 'widgets' then key := 'id'; cols := array['title']; scope := 'workspace_id = $1';
    when 'metrics' then key := 'id'; cols := array['description', 'name']; ncols := array['target_min', 'target_max']; scope := 'workspace_id = $1';
    when 'condensed_values' then key := 'id'; cols := array['payload']; scope := 'workspace_id = $1';
    when 'breakdown_rows' then key := 'id'; cols := array['label']; ncols := array['value']; scope := 'workspace_id = $1';
    -- A history entry's label and value are sealed for the row they were copied from (row_id), older entries for their own id.
    when 'breakdown_history' then key := 'id'; cols := array['label']; ncols := array['value']; extra := array['row_id']; scope := 'workspace_id = $1';
    -- An imported value keeps who sent it, and who entered it for them, as sealed names (spec 0040, ticket 9; spec 0046).
    when 'observations' then key := 'id'; cols := array['submitted_by_name', 'entered_by_name']; ncols := array['value', 'original_value']; scope := 'workspace_id = $1';
    -- A history entry's number is sealed for the observation it was a value of.
    when 'observation_history' then key := 'id'; cols := array[]::text[]; ncols := array['value']; extra := array['observation_id']; scope := 'workspace_id = $1';
    when 'series_values' then key := 'id'; cols := array[]::text[]; ncols := array['value']; extra := array['metric_id', 'kind', 'period_start']; scope := 'workspace_id = $1';
    -- A period's note, named by its Metric and period through the generated row_key.
    when 'period_states' then key := 'row_key'; cols := array['note']; scope := 'workspace_id = $1';
    -- A Slack connection's bot token, named by its Workspace; a revoked connection keeps no token (see below), so it is not listed.
    when 'slack_installations' then key := 'workspace_id'; cols := array['bot_token']; scope := 'workspace_id = $1 and revoked_at is null';
    -- A Tag's name (spec 0038), sealed with its blind index beside it.
    when 'tags' then key := 'id'; cols := array['name']; scope := 'workspace_id = $1';
    else raise exception 'Not a table with sealed columns: %', p_table;
  end case;
end;
$$;
revoke all on function seal_table(text) from public, anon, authenticated;

-- A Superseded Value keeps who entered it: the history entry copies entered_by as it copies the submitter.
create or replace function keep_observation_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and current_setting('ziffr.sealing_values', true) = 'on' then return new; end if;
  if tg_op = 'DELETE' and (not exists (select 1 from workspaces where id = old.workspace_id) or not exists (select 1 from metrics where id = old.metric_id)) then
    return old;
  end if;
  if tg_op = 'DELETE' or old.value is distinct from new.value or old.value_sealed is distinct from new.value_sealed then
    insert into observation_history (observation_id, metric_id, period_start, value, value_sealed, submitter_id, entered_by, source, recorded_at, change)
      values (old.id, old.metric_id, old.period_start, old.value, old.value_sealed, old.submitter_id, old.entered_by, old.source, old.created_at, case tg_op when 'UPDATE' then 'updated' else 'deleted' end);
  end if;
  return coalesce(new, old);
end;
$$;

-- The Delivery kind `filled_in`: told once to the submitter that someone entered a value for them. It can be held by
-- Quiet Hours and nothing can answer it. It names its Metric in alert_metric_id, which every send checks again.
alter table deliveries drop constraint deliveries_kind_check;
alter table deliveries add constraint deliveries_kind_check
  check (kind in ('question','task','reminder','reply','correction','decision','closed','done','prompt','notice','digest','alert','heads_up','checklist','filled_in'));

-- Who entered a value is a person whose name may sit in a Workspace's words: those who left stay findable to be hidden.
create or replace function former_person_ids(ws uuid) returns table (person_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p from (
    select submitter_id as p from observations where workspace_id = ws
    union all select entered_by from observations where workspace_id = ws
    union all select submitter_id from observation_history where workspace_id = ws
    union all select entered_by from observation_history where workspace_id = ws
    union all select author_id from thread_messages where workspace_id = ws
    union all select author_id from versions where workspace_id = ws
    union all select asker_id from actions where workspace_id = ws
    union all select assignee_id from actions where workspace_id = ws
    union all select sender_id from intake_log where workspace_id = ws
    union all select submitter_id from tokens where workspace_id = ws
    union all select stand_in_id from tokens where workspace_id = ws
    union all select taken_by from dashboard_snapshots where workspace_id = ws
    union all select shown_by from dashboard_snapshots where workspace_id = ws
  ) s
  where p is not null
    and not exists (select 1 from memberships m where m.workspace_id = ws and m.user_id = s.p)
    -- A Feed is a person without a membership, not someone who left: its name is no secret and hiding it would blank ordinary words.
    and not exists (select 1 from feeds f where f.person_id = s.p)
$$;
revoke execute on function former_person_ids(uuid) from public, anon, authenticated;
grant execute on function former_person_ids(uuid) to service_role;

-- A Contact who accepts an invitation keeps their history: as it was, with who entered a value and whom a Prompt
-- stood in for moving along (spec 0046). A value the Contact entered for the person they became is no longer one
-- someone else entered: it is theirs.
create or replace function merge_contact(ws uuid, contact text, person text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from contacts where workspace_id = ws and person_id = contact) then
    raise exception 'not a contact of this workspace';
  end if;
  update tokens set submitter_id = person where workspace_id = ws and submitter_id = contact;
  update tokens set stand_in_id = person where workspace_id = ws and stand_in_id = contact;
  update tokens set stands_in_for = person where workspace_id = ws and stands_in_for = contact;
  -- Neither direction may leave a value entered by the person it is for (the check on entered_by).
  update observations set entered_by = null where workspace_id = ws and entered_by = person and submitter_id = contact;
  update observations set entered_by = null where workspace_id = ws and entered_by = contact and submitter_id = person;
  update observations set submitter_id = person where workspace_id = ws and submitter_id = contact;
  update observations set entered_by = person where workspace_id = ws and entered_by = contact;
  update observation_history set entered_by = null where workspace_id = ws and entered_by = person and submitter_id = contact;
  update observation_history set entered_by = null where workspace_id = ws and entered_by = contact and submitter_id = person;
  update observation_history set submitter_id = person where workspace_id = ws and submitter_id = contact;
  update observation_history set entered_by = person where workspace_id = ws and entered_by = contact;
  update prompts set submitter_id = person where workspace_id = ws and submitter_id = contact;
  update prompts set stands_in_for = person where workspace_id = ws and stands_in_for = contact;
  update intake_log set sender_id = person where workspace_id = ws and sender_id = contact;
  update deliveries set recipient_id = person where workspace_id = ws and recipient_id = contact;
  update deliveries set sender_id = person where workspace_id = ws and sender_id = contact;
  update actions set asker_id = person where workspace_id = ws and asker_id = contact;
  update actions set assignee_id = person where workspace_id = ws and assignee_id = contact;
  update thread_messages set author_id = person where workspace_id = ws and author_id = contact;
  delete from contacts where workspace_id = ws and person_id = contact;
end $$;
revoke execute on function merge_contact(uuid, text, text) from public, anon, authenticated;
grant execute on function merge_contact(uuid, text, text) to service_role;

-- Recording a value, as it was (spec 0028), with who entered it. p_entered_by is set only for a Filled-in Value, which is
-- only ever a period's first value under a rule of one value per period: the database refuses it over an existing value
-- (ZF450) or under another rule (ZF451), however the core got there, since both are read under the period's lock. And a
-- submitter's own value replaces a Filled-in Value whatever the rule (op 'overwrite'): the Filled-in Value goes to the
-- history with its entered_by, and the row is the submitter's own again (entered_by null).
drop function record_value(int, date, text, bigint, numeric, text, text, text, bigint, boolean, bigint, int, text, int, jsonb);
create function record_value(
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
    if v_rule not in ('reject', 'overwrite') then raise exception 'This Submission Rule combines several people''s values.' using errcode = 'ZF451'; end if;
    if p_entered_by is not distinct from p_submitter then raise exception 'A value is entered for someone else.' using errcode = 'ZF451'; end if;
    -- Never a Guest, whoever asks.
    if exists (select 1 from memberships mm join metrics mt on mt.workspace_id = mm.workspace_id where mt.id = p_metric and mm.user_id = p_entered_by and mm.role = 'guest') then
      raise exception 'A Guest cannot fill in for someone.' using errcode = 'ZF451';
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
      insert into breakdown_rows (id, observation_id, label, label_index, value, value_sealed, position)
        select (e->>'id')::bigint, v_id, e->>'label', e->>'index', (e->>'value')::numeric, e->>'value_sealed', coalesce(max(r.position) + 1, 0)
        from breakdown_rows r where r.observation_id = v_id;
    end if;
  end loop;
  return v_id;
end;
$$;
revoke execute on function record_value(int, date, text, bigint, numeric, text, text, text, bigint, boolean, bigint, int, text, int, jsonb, text) from public, anon, authenticated;
grant execute on function record_value(int, date, text, bigint, numeric, text, text, text, bigint, boolean, bigint, int, text, int, jsonb, text) to service_role;
