-- A Metric's Calculation Note (spec 0060, ticket #1199; GLOSSARY: Calculation Note, Metric Description, Workspace Key):
-- "How it is calculated", a second text beside the description: exactly what counts, where the figure comes from and which
-- adjustments are made. Sealed with the Workspace Key like the description, so the length check allows for a sealed text.
--
-- Null means no note: the column has no default, so no existing row is rewritten, none waits for the re-encryption job,
-- and no row of the demo is read or written (rule 5).
alter table metrics add column calculation_note text constraint metrics_calculation_note_length check (calculation_note is null or char_length(calculation_note) <= 24000);

-- A visitor of the demo may not change a seeded Metric's note, as they may not change its other words (spec 0051).
insert into demo_words_columns (table_name, column_name, kind) values ('metrics', 'calculation_note', 'words');

-- The re-encryption job and its counts know the new sealed column: seal_table as it was (spec 0046), with the Metrics'
-- calculation_note added.
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
    else raise exception 'Not a table with sealed columns: %', p_table;
  end case;
end;
$$;
revoke all on function seal_table(text) from public, anon, authenticated;
