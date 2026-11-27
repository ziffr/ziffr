-- Value Notes (spec 0064, #1308; GLOSSARY: Value Note): words about one period's value of a Metric.
-- A period's notes are a history: entries are added and never rewritten. A note is its first entry; a correction or a
-- removal is a further entry that names it. Only two marks change a stored entry: its value was replaced
-- (replaced_at), and its words were deleted for good (erased_at, words emptied). Adds only.
create table value_notes (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  metric_id int not null references metrics(id) on delete cascade,
  period_start date not null,
  -- The first entry of the note this one corrects or removes; null on that first entry.
  note_id bigint references value_notes(id) on delete cascade,
  kind text not null check (kind in ('written', 'corrected', 'removed')),
  -- The contribution the note is about. Null on a Derived Metric or Total, and while it is only proposed. No foreign
  -- key: a replaced value keeps its notes in the history.
  observation_id bigint,
  -- The words and the number they were said of, sealed with the Workspace Key (spec 0028).
  words text,
  said_of numeric,
  said_of_sealed text,
  -- Who wrote this entry (for a removal, who removed the note) and the way it came in.
  author_id text not null references profiles(id),
  source text not null,
  added_later boolean not null default false,
  replaced_at timestamptz,
  erased_at timestamptz,
  -- Set while the note travels with a proposed Correction: it is no Value Note until that is accepted, and goes if
  -- the Correction is declined or its Thread is deleted.
  proposal bigint references thread_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint value_notes_removed_has_no_words check (kind <> 'removed' or (words is null and note_id is not null))
);
create index value_notes_period on value_notes (metric_id, period_start, id);
create index value_notes_workspace on value_notes (workspace_id);
create index value_notes_proposal on value_notes (proposal) where proposal is not null;

alter table value_notes enable row level security;
revoke all on table value_notes from public, anon, authenticated;
select attach_demo_guard('value_notes');
insert into demo_closed_tables (table_name, reason) values ('value_notes', 'Words people write about values; the demo takes none')
  on conflict (table_name) do nothing;

-- A period keeps at most 50 entries, also when two arrive at once. A removal is always taken: words that should not
-- stand must be removable in a full period.
create function value_notes_cap() returns trigger language plpgsql set search_path = public as $$
begin
  if new.kind = 'removed' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('value_notes:' || new.metric_id || ':' || new.period_start, 0));
  if (select count(*) from value_notes v where v.metric_id = new.metric_id and v.period_start = new.period_start and v.kind <> 'removed') >= 50 then
    raise exception using errcode = 'ZF480', message = 'A period keeps at most 50 notes';
  end if;
  return new;
end $$;
revoke all on function value_notes_cap() from public, anon, authenticated;
create trigger value_notes_cap before insert on value_notes for each row execute function value_notes_cap();

-- Ids reserved before the insert, so the words can be sealed for their row.
create function reserve_value_note_ids(p_table text, p_count integer) returns bigint[]
language plpgsql security definer set search_path = public as $$
begin
  if p_table is distinct from 'value_notes' or p_count is null or p_count < 1 or p_count > 1000 then
    raise exception 'Not a reservation of Value Note ids';
  end if;
  return array(select nextval(pg_get_serial_sequence('value_notes', 'id')) from generate_series(1, p_count));
end $$;
revoke all on function reserve_value_note_ids(text, integer) from public, anon, authenticated;
grant execute on function reserve_value_note_ids(text, integer) to service_role;

-- The sealing job, the key change and their counts learn the new table.
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
    when 'metrics' then key := 'id'; cols := array['description', 'name', 'calculation_note']; ncols := array['target_min', 'target_max']; scope := 'workspace_id = $1';
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
    -- A Repeat line's name in the record of a Set up (spec 0058).
    when 'pack_setup_lines' then key := 'id'; cols := array['name']; scope := 'workspace_id = $1';
    -- A Value Note's words and the number it was said of (spec 0064).
    when 'value_notes' then key := 'id'; cols := array['words']; ncols := array['said_of']; scope := 'workspace_id = $1';
    else raise exception 'Not a table with sealed columns: %', p_table;
  end case;
end;
$$;
revoke all on function seal_table(text) from public, anon, authenticated;

create or replace function seal_counts(p_workspace uuid, p_current integer)
returns table(table_name text, column_name text, total bigint, plain bigint, old_version bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  tbl text;
  t record;
  c text;
  extra text;
begin
  foreach tbl in array array['thread_messages', 'actions', 'contacts', 'profiles', 'deliveries', 'prompts', 'intake_log', 'audit_events', 'alerts', 'webhooks', 'webhook_external_ids', 'dashboards', 'widgets', 'metrics', 'condensed_values', 'breakdown_rows', 'breakdown_history',
    'observations', 'observation_history', 'series_values', 'period_states', 'slack_installations', 'tags', 'pack_setup_lines', 'value_notes'] loop
    select * into t from seal_table(tbl);
    foreach c in array t.cols loop
      table_name := tbl; column_name := c;
      extra := case
        when tbl = 'breakdown_rows' then ' or (label_index is null or coalesce(blind_index_version(label_index), 0) < $2)'
        when tbl = 'webhook_external_ids' and c = 'external_id' then ' or coalesce(blind_index_version(external_hash), 0) < $2'
        when tbl = 'tags' then ' or coalesce(blind_index_version(name_index), 0) < $2'
        when tbl = 'contacts' and c = 'email' then ' or (email is not null and coalesce(blind_index_version(email_index), 0) < $2)'
        when tbl = 'contacts' and c = 'slack_handle' then ' or (slack_handle is not null and coalesce(blind_index_version(slack_index), 0) < $2)'
        else '' end;
      -- The index of a value counts with the value: one where there is an index to check, else the value alone.
      execute format(
        'select count(%1$I), count(%1$I) filter (where not sealed_format(%1$I)), count(%1$I) filter (where sealed_version(%1$I) < $2%4$s) from %2$I where %3$s',
        c, tbl, t.scope, extra
      ) into total, plain, old_version using p_workspace, p_current;
      return next;
    end loop;
    foreach c in array t.ncols loop
      table_name := tbl; column_name := c;
      execute format(
        'select count(%1$I) + count(%2$I), count(%1$I), count(%2$I) filter (where sealed_version(%2$I) < $2) from %3$I where %4$s',
        c, c || '_sealed', tbl, t.scope
      ) into total, plain, old_version using p_workspace, p_current;
      return next;
    end loop;
    if tbl = 'audit_events' then
      table_name := tbl; column_name := 'details';
      select count(*), count(*) filter (where not sealed_details(details)),
             count(*) filter (where sealed_details(details) and sealed_version(details ->> 'sealed') < p_current)
        into total, plain, old_version from audit_events where workspace_id = p_workspace;
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function seal_counts(uuid, integer) from public, anon, authenticated;
grant execute on function seal_counts(uuid, integer) to service_role;

-- A Contact merged into a person keeps their notes under that person.
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
  update value_notes set author_id = person where workspace_id = ws and author_id = contact;
  delete from contacts where workspace_id = ws and person_id = contact;
end $$;
revoke all on function merge_contact(uuid, text, text) from public, anon, authenticated;
grant execute on function merge_contact(uuid, text, text) to service_role;

-- Someone who only wrote notes is a former person too, so that their name is hidden where names are.
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
    union all select author_id from value_notes where workspace_id = ws
  ) s
  where p is not null
    and not exists (select 1 from memberships m where m.workspace_id = ws and m.user_id = s.p)
    -- A Feed is a person without a membership, not someone who left: its name is no secret and hiding it would blank ordinary words.
    and not exists (select 1 from feeds f where f.person_id = s.p)
$$;
revoke all on function former_person_ids(uuid) from public, anon, authenticated;
grant execute on function former_person_ids(uuid) to service_role;

-- Retention removes the notes of the periods it condenses or deletes.
create or replace function retention_remove_values(p_ws uuid, p_metric int, p_from date, p_to date, p_periods date[], p_expected int, p_states boolean, p_condensed uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ids bigint[]; old_ids bigint[]; n_obs int; n_rows int; n_hist int; n_targets int; n_states int := 0;
begin
  perform 1 from metrics where id = p_metric and workspace_id = p_ws for update;
  if not found then raise exception using errcode = 'ZF445', message = 'That Metric was not found'; end if;
  if p_condensed is not null and not exists (select 1 from condensed_values c where c.id = p_condensed and c.workspace_id = p_ws
      and c.metric_id = p_metric and c.period_start = p_from and c.period_end = p_to) then
    raise exception using errcode = 'ZF445', message = 'The Condensed Value is no longer there';
  end if;
  if exists (select 1 from period_states s where s.metric_id = p_metric and s.state in ('asked', 'submitted', 'approval')
      and s.period_start between p_from and p_to and (p_periods is null or s.period_start = any (p_periods)))
    or exists (select 1 from actions a where a.workspace_id = p_ws and a.metric_id = p_metric and a.status in ('open', 'answered')
      and a.period_start between p_from and p_to and (p_periods is null or a.period_start = any (p_periods)))
    or exists (select 1 from actions a join thread_messages t on t.action_id = a.id where a.workspace_id = p_ws and a.metric_id = p_metric
      and t.correction_status = 'proposed' and a.period_start between p_from and p_to and (p_periods is null or a.period_start = any (p_periods))) then
    raise exception using errcode = 'ZF444', message = 'Open work holds a period';
  end if;
  select coalesce(array_agg(o.id), '{}') into ids from observations o
    where o.workspace_id = p_ws and o.metric_id = p_metric and o.period_start between p_from and p_to and (p_periods is null or o.period_start = any (p_periods));
  if coalesce(array_length(ids, 1), 0) <> p_expected then
    raise exception using errcode = 'ZF445', message = 'The values changed since they were counted';
  end if;
  select coalesce(array_agg(distinct h.observation_id), '{}') into old_ids from observation_history h
    where h.workspace_id = p_ws and h.metric_id = p_metric and h.period_start between p_from and p_to and (p_periods is null or h.period_start = any (p_periods));
  delete from breakdown_rows where workspace_id = p_ws and observation_id = any (ids);
  get diagnostics n_rows = row_count;
  delete from breakdown_history where workspace_id = p_ws and observation_id = any (ids || old_ids);
  delete from observations where workspace_id = p_ws and id = any (ids);
  get diagnostics n_obs = row_count;
  delete from observation_history where workspace_id = p_ws and metric_id = p_metric
    and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
  get diagnostics n_hist = row_count;
  -- The Value Notes of those periods go with their values (spec 0064); the download before a delete holds them.
  delete from value_notes where workspace_id = p_ws and metric_id = p_metric
    and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
  delete from series_values where workspace_id = p_ws and metric_id = p_metric and kind = 'target'
    and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
  get diagnostics n_targets = row_count;
  if p_states then
    delete from period_states where metric_id = p_metric and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
    get diagnostics n_states = row_count;
  end if;
  return jsonb_build_object('values', n_obs, 'breakdown_rows', n_rows, 'superseded', n_hist, 'targets', n_targets, 'states', n_states);
end $$;
revoke all on function retention_remove_values(uuid, int, date, date, date[], int, boolean, uuid) from public, anon, authenticated;
grant execute on function retention_remove_values(uuid, int, date, date, date[], int, boolean, uuid) to service_role;
