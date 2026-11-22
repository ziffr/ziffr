-- A period's note and a Slack bot token sealed with the Workspace Key (GLOSSARY: Workspace Key; spec 0028, ticket #246), and
-- covered by the re-encryption job: the job's table list (seal_table), its candidates (through seal_table) and its counts.
-- A period's state has no id, so its row is named by a generated `row_key`, "<metric>_<yyyy-mm-dd>", which the sealed note
-- is bound to; the Slack connection is named by its Workspace.
alter table period_states add column row_key text generated always as (metric_id::text || '_' || lpad(extract(year from period_start)::int::text, 4, '0') || '-' || lpad(extract(month from period_start)::int::text, 2, '0') || '-' || lpad(extract(day from period_start)::int::text, 2, '0')) stored;
create unique index period_states_row_key on period_states (row_key);

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
    when 'observations' then key := 'id'; cols := array[]::text[]; ncols := array['value', 'original_value']; scope := 'workspace_id = $1';
    -- A history entry's number is sealed for the observation it was a value of.
    when 'observation_history' then key := 'id'; cols := array[]::text[]; ncols := array['value']; extra := array['observation_id']; scope := 'workspace_id = $1';
    when 'series_values' then key := 'id'; cols := array[]::text[]; ncols := array['value']; extra := array['metric_id', 'kind', 'period_start']; scope := 'workspace_id = $1';
    -- A period's note, named by its Metric and period through the generated row_key.
    when 'period_states' then key := 'row_key'; cols := array['note']; scope := 'workspace_id = $1';
    -- A Slack connection's bot token, named by its Workspace; a revoked connection keeps no token (see below), so it is not listed.
    when 'slack_installations' then key := 'workspace_id'; cols := array['bot_token']; scope := 'workspace_id = $1 and revoked_at is null';
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
    'observations', 'observation_history', 'series_values', 'period_states', 'slack_installations'] loop
    select * into t from seal_table(tbl);
    foreach c in array t.cols loop
      table_name := tbl; column_name := c;
      extra := case
        when tbl = 'breakdown_rows' then ' or (label_index is null or coalesce(blind_index_version(label_index), 0) < $2)'
        when tbl = 'webhook_external_ids' and c = 'external_id' then ' or coalesce(blind_index_version(external_hash), 0) < $2'
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

-- A connection that ended (a disconnect, an uninstall, a revoked token, the end of a trial) keeps no token: it is of no use
-- any more, and an old one that no longer opens would otherwise keep a retired Workspace Key alive for ever.
create function slack_forget_revoked_token() returns trigger language plpgsql as $$
begin
  if new.revoked_at is not null then new.bot_token := 'revoked-token-is-no-longer-kept'; end if;
  return new;
end;
$$;
create trigger slack_installations_forget_token before insert or update on slack_installations for each row execute function slack_forget_revoked_token();
update slack_installations set bot_token = 'revoked-token-is-no-longer-kept' where revoked_at is not null;
