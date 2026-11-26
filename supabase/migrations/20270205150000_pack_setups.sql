-- The record of a Set up (spec 0058, #1180; GLOSSARY: Pack, Position, Repeat). What a Set up did: the install, the
-- Pack's version, who and when, the lines of its Repeats (their names sealed with the Workspace Key), the people put into
-- each Position, and the ids of what was made, by the Pack's key and line.
--
-- The record decides nothing: no permission, message or sight is ever worked out from it. Uninstalling the Pack deletes
-- it and leaves everything made; removing a person takes them out of it; the Workspace's deletion takes it with it.
-- Written and read by the core only (service role): Row Level Security is on with no policy, and no browser role has a
-- grant. The demo sets nothing up, so its tables are closed to visitors and there is no seed.

create table pack_setups (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  install_id bigint not null references pack_installs(id) on delete cascade,
  pack_version text not null check (char_length(pack_version) between 5 and 20),
  made_by text references profiles(id) on delete set null,
  made_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index on pack_setups (workspace_id, install_id);
create index on pack_setups (install_id);

-- One line of a Repeat, such as a salesperson or a site. The name is written sealed by the core, after the row has its id.
create table pack_setup_lines (
  id bigserial primary key,
  workspace_id uuid not null,
  setup_id bigint not null,
  repeat_key text not null check (repeat_key ~ '^[a-z][a-z0-9-]{0,39}$'),
  name text not null default '' check (char_length(name) <= 1000),
  unique (id, setup_id),
  foreign key (setup_id, workspace_id) references pack_setups (id, workspace_id) on delete cascade
);
create index on pack_setup_lines (setup_id);
create index on pack_setup_lines (workspace_id);

create table pack_setup_people (
  id bigserial primary key,
  workspace_id uuid not null,
  setup_id bigint not null,
  line_id bigint,
  position_key text not null check (position_key ~ '^[a-z][a-z0-9-]{0,39}$'),
  person_id text not null references profiles(id) on delete cascade,
  foreign key (setup_id, workspace_id) references pack_setups (id, workspace_id) on delete cascade,
  foreign key (line_id, setup_id) references pack_setup_lines (id, setup_id) on delete cascade
);
create index on pack_setup_people (setup_id);
create index on pack_setup_people (workspace_id, person_id);

-- What was made. The id is not a foreign key: a thing deleted since stays named by its id, and reads as gone.
create table pack_setup_items (
  id bigserial primary key,
  workspace_id uuid not null,
  setup_id bigint not null,
  line_id bigint,
  kind text not null check (kind in ('metric', 'dashboard', 'workflow')),
  pack_key text not null check (pack_key ~ '^[a-z][a-z0-9-]{0,39}$'),
  object_id bigint not null,
  foreign key (setup_id, workspace_id) references pack_setups (id, workspace_id) on delete cascade,
  foreign key (line_id, setup_id) references pack_setup_lines (id, setup_id) on delete cascade
);
create index on pack_setup_items (setup_id);
create index on pack_setup_items (workspace_id);

do $$
declare t text;
begin
  foreach t in array array['pack_setups', 'pack_setup_lines', 'pack_setup_people', 'pack_setup_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from public, anon, authenticated', t);
    -- The demo's guard refuses a visitor's write, as on every table that has a workspace_id.
    perform attach_demo_guard(('public.' || quote_ident(t))::regclass);
  end loop;
end $$;

insert into demo_closed_tables (table_name, reason) values
  ('pack_setups', 'The demo sets nothing up from a Pack (spec 0058).'),
  ('pack_setup_lines', 'The demo sets nothing up from a Pack (spec 0058).'),
  ('pack_setup_people', 'The demo sets nothing up from a Pack (spec 0058).'),
  ('pack_setup_items', 'The demo sets nothing up from a Pack (spec 0058).')
on conflict (table_name) do nothing;

-- Removing a person (a member removed or leaving, a Contact deleted) takes them out of every record of the Workspace,
-- unless they are still in it the other way. tg_argv[0] names the column that holds the person.
create or replace function pack_setup_people_leave() returns trigger
language plpgsql security definer set search_path = public as $$
declare person text := to_jsonb(old) ->> tg_argv[0];
begin
  delete from pack_setup_people p
   where p.workspace_id = old.workspace_id and p.person_id = person
     and not exists (select 1 from memberships m where m.workspace_id = old.workspace_id and m.user_id = person)
     and not exists (select 1 from contacts c where c.workspace_id = old.workspace_id and c.person_id = person);
  return null;
end $$;
revoke all on function pack_setup_people_leave() from public, anon, authenticated;
create trigger pack_setup_people_member_leaves after delete on memberships for each row execute function pack_setup_people_leave('user_id');
create trigger pack_setup_people_contact_leaves after delete on contacts for each row execute function pack_setup_people_leave('person_id');

-- The re-encryption job and its counts know the new sealed column: seal_table as it was (spec 0060), with the lines'
-- names added.
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
    else raise exception 'Not a table with sealed columns: %', p_table;
  end case;
end;
$$;
revoke all on function seal_table(text) from public, anon, authenticated;

-- seal_counts as it was (spec 0038), with pack_setup_lines among the tables it counts.
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
    'observations', 'observation_history', 'series_values', 'period_states', 'slack_installations', 'tags', 'pack_setup_lines'] loop
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
