-- Erasing one person (spec 0071, ticket 1; GLOSSARY: Deleted person): the inventory of what holds a person, and the two
-- steps around the removal of their sign-in. erase_person removes what is only theirs and takes their name, address,
-- phone number and chat handles; the core then removes the sign-in; finish_erasing_person deletes the row entirely when
-- nothing refers to it, and otherwise keeps it as a Deleted person. Both steps can run again. The Audit Log is left as it is.

-- The inventory: every column that refers to a person, or holds their address or a chat handle. A migration that adds
-- such a column adds its row here; person-references.db.test.ts fails until it has.
--   erased       it goes. `erasing` says how: 'row' deletes the rows whose column is the person, 'value' empties the
--                column, 'statement' is written out in erase_person_rows (or goes with its row).
--   kept         history: it stays, and shows the Deleted person. While one such column holds them, their row stays.
--   handed_over  what a hand-over moves to another member first (hand_over); what is left stays as kept does.
--   not_a_person its name only reads like one.
create table person_references (
  table_name text not null,
  column_name text not null,
  treatment text not null check (treatment in ('erased', 'kept', 'handed_over', 'not_a_person')),
  erasing text check (erasing in ('row', 'value', 'statement')),
  primary key (table_name, column_name),
  check ((treatment = 'erased') = (erasing is not null))
);
alter table person_references enable row level security;
revoke all on table person_references from public, anon, authenticated;

insert into person_references (table_name, column_name, treatment, erasing)
select split_part(c, '.', 1), split_part(c, '.', 2), 'erased', 'row' from unnest(array[
  'access_requests.requester_id', 'alert_day_counts.person_id', 'alerts.person_id', 'analysis_canvas.user_id', 'away.user_id',
  'business_functions.person_id', 'calendar_links.person_id', 'contacts.person_id', 'deleted_metric_readers.user_id',
  'delivery_preferences.user_id', 'email_opt_out_notices.person_id', 'email_opt_outs.person_id', 'feedback.person_id',
  'feedback_prompts.person_id', 'first_prompt_claims.submitter_id', 'group_members.user_id', 'heads_up_dismissed.person_id',
  'heads_up_mutes.person_id', 'heads_up_settings.person_id', 'heads_up_told.person_id', 'installation_admins.person_id',
  'installation_claim_tries.person_id', 'installation_reply_tests.person_id', 'installation_telegram_tests.person_id',
  'invitations.accepted_by', 'join_requests.person_id', 'memberships.user_id', 'note_questions.person_id',
  'pack_setup_people.person_id', 'paste_claims.person_id', 'person_settable_limits.person_id', 'personal_webhook_ends.owner_id',
  'pinned_dashboards.person_id', 'quiet_hours.person_id', 'setup_guide_people.person_id', 'share_proposals.proposer_id',
  'share_proposals.recipient_person_id', 'shares.user_id', 'slack_install_states.person_id', 'slack_link_codes.person_id',
  'slack_links.person_id', 'slack_opt_outs.person_id', 'telegram_link_codes.person_id', 'telegram_links.person_id',
  'telegram_opt_outs.person_id', 'tell_stops.person_id', 'test_message_sends.person_id', 'tokens.stands_in_for',
  'tokens.submitter_id', 'usage_digest_opt_outs.person_id', 'usage_digests.person_id', 'webhook_person_send_days.person_id',
  'webhooks.owner_id'
]) c
union all
select split_part(c, '.', 1), split_part(c, '.', 2), 'erased', 'value' from unnest(array[
  'actions.previous_assignee_id', 'pack_setup_people.held_for', 'tokens.stand_in_id'
]) c
union all
select split_part(c, '.', 1), split_part(c, '.', 2), 'erased', 'statement' from unnest(array[
  'profiles.auth_user_id', 'profiles.email', 'profiles.phone', 'profiles.slack_handle',
  -- Go with their row (the person's own); a Contact of a Workspace is its own person, even with the same address.
  'contacts.email', 'contacts.email_index', 'contacts.phone', 'contacts.slack_handle', 'installation_telegram_tests.chat_id',
  'installation_telegram_tests.telegram_user_id', 'invitations.email_error', 'slack_links.email', 'slack_links.slack_user_id',
  'telegram_links.chat_id', 'telegram_links.telegram_user_id',
  -- Found by the person's address or chat handle.
  'deliveries.telegram_chat_id', 'email_opt_outs.address_hash', 'email_sends.address_key', 'held_replies.address_hash',
  'intake_log.sender', 'invitation_emails.address_key', 'invitation_stops.address_key', 'invitations.address_key',
  'invitations.email', 'practice_ways.address_key', 'practice_ways.destination', 'share_proposals.recipient_email',
  'share_proposals.recipient_key', 'sign_in_requests.address_key', 'slack_sends.recipient_key', 'telegram_sends.chat_id',
  'telegram_updates.telegram_user_id'
]) c
union all
select split_part(c, '.', 1), split_part(c, '.', 2), 'kept', null from unnest(array[
  'access_keys.created_by', 'away.set_by', 'contacts.created_by', 'dashboard_snapshots.deleted_by',
  'dashboard_snapshots.shown_by', 'dashboard_snapshots.taken_by', 'deliveries.recipient_id', 'deliveries.sender_id',
  'email_sends.sender_id',
  -- A Feed's own person row, which is never erased as a person.
  'feeds.person_id', 'feeds.created_by', 'installation_admins.added_by', 'installation_announcements.created_by',
  'installation_announcements.updated_by', 'installation_settings.updated_by', 'intake_log.sender_id',
  'invitation_emails.sent_by', 'invitations.contact_person_id', 'invitations.created_by', 'join_requests.decided_by',
  'marketplace_revoked_keys.revoked_by', 'metrics.archived_by', 'metrics.owner_taken_by', 'metrics.total_opened_by',
  'observation_history.entered_by', 'observation_history.submitter_id', 'observations.entered_by', 'observations.submitter_id',
  -- Names copied as text with an imported value: text that copied a name stays as written.
  'observations.entered_by_name', 'observations.submitted_by_name',
  'pack_installs.installed_by', 'pack_setups.made_by', 'prompts.stands_in_for', 'prompts.submitter_id',
  'slack_installations.installed_by', 'slack_sends.sender_id', 'tags.created_by', 'telegram_sends.sender_id',
  'telegram_workspaces.changed_by', 'thread_messages.author_id', 'usage_keys.created_by', 'value_notes.author_id',
  'versions.author_id',
  -- The two people of a hand-over, kept with its version so its message can be rewritten by id.
  'versions.handover_from_person_id', 'versions.handover_to_person_id', 'view_designs.added_by', 'view_links.created_by', 'webhooks.created_by',
  'workspace_announcements.created_by', 'workspace_announcements.updated_by', 'workspace_imports.created_by',
  'workspace_limits.set_by_person'
]) c
union all
select split_part(c, '.', 1), split_part(c, '.', 2), 'handed_over', null from unnest(array[
  'actions.asker_id', 'actions.assignee_id', 'dashboards.owner_id', 'decks.owner_id', 'metrics.owner_id',
  'team_templates.owner_id', 'themes.owner_id', 'widgets.owner_id', 'workflows.owner_id'
]) c
union all
select split_part(c, '.', 1), split_part(c, '.', 2), 'not_a_person', null from unnest(array[
  'installation_settings.set_by', 'share_proposals.email_state', 'slack_installations.bot_user_id', 'slack_links.matched_by',
  'workspace_limits.set_by', 'workspaces.used_by'
]) c;

-- Who a hand-over was between (hand-over versions made from now on). No foreign key: a version is history and never
-- holds up the removal of a profile.
alter table versions add column handover_from_person_id text, add column handover_to_person_id text;
create index on versions (handover_from_person_id) where handover_from_person_id is not null;
create index on versions (handover_to_person_id) where handover_to_person_id is not null;

-- The columns the inventory misses ('table.column'), and its rows whose column is gone ('gone: table.column'). A column
-- counts when it references a person or a sign-in, or its name reads like a person, an address or a chat handle. The
-- Audit Log is left as it is, so its two tables are not listed.
create or replace function person_reference_gaps() returns setof text
language sql stable set search_path = public as $$
  with columns as (
    select c.table_name::text as t, c.column_name::text as c, c.data_type
    from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.table_name not in ('person_references', 'audit_events', 'installation_audit_events')
  ), linked as (
    select r.relname::text as t, a.attname::text as c
    from pg_constraint k
    join pg_class r on r.oid = k.conrelid
    join pg_namespace n on n.oid = r.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
    where k.contype = 'f' and k.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      -- A key over the person and their Workspace refers to the person by its person column alone.
      and a.attname <> 'workspace_id'
  ), wanted as (
    select t, c from linked
    union
    select t, c from columns where data_type in ('text', 'character varying', 'uuid', 'bigint', 'ARRAY') and (
      c ~ '(^|_)(person|people|user|owner|author|actor|submitter|assignee|asker|sender|recipient|proposer|requester|reader|member)(_id|_ids|_name|_key)?$'
      or c ~ '_by(_person|_name|_id)?$'
      or c in ('stands_in_for', 'stand_in_id', 'held_for')
      or c ~ '(email|address|phone|handle|destination|chat_id)')
  )
  select w.t || '.' || w.c from wanted w
    where not exists (select 1 from person_references p where p.table_name = w.t and p.column_name = w.c)
  union all
  select 'gone: ' || p.table_name || '.' || p.column_name from person_references p
    where not exists (select 1 from columns c where c.t = p.table_name and c.c = p.column_name)
  order by 1
$$;

-- For the database tests only, and callable by the service role only: every column of the schema ('table.column') whose
-- text holds the given words. It reads across all Workspaces, so nothing offers it to a person. Sealed columns cannot be
-- searched.
create or replace function person_text_found(p_needle text) returns setof text
language plpgsql stable set search_path = public as $$
declare r record; found_it boolean;
begin
  if coalesce(length(p_needle), 0) < 3 then raise exception 'Search for three characters or more.'; end if;
  for r in
    select c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')
    order by 1, 2
  loop
    execute format('select exists (select 1 from %I where strpos(lower(%I::text), lower($1)) > 0)', r.table_name, r.column_name)
      into found_it using p_needle;
    if found_it then return next r.table_name || '.' || r.column_name; end if;
  end loop;
end $$;

-- A Deleted person keeps their row for the history that refers to it (spec 0071).
alter table profiles add column erased_at timestamptz;

-- Nothing gives a Deleted person a name, an address or a sign-in again.
create or replace function deleted_person_fixed() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.erased_at is null or new.name <> 'Deleted person' or new.email is not null or new.phone is not null
     or new.slack_handle is not null or (new.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id) then
    raise exception 'A Deleted person is not changed.' using errcode = 'ZF409';
  end if;
  return new;
end $$;
create trigger deleted_person_fixed before update on profiles for each row
  when (old.erased_at is not null) execute function deleted_person_fixed();

-- Nor a place in a Workspace. The share lock waits for an erasure under way, then reads its result.
create or replace function deleted_person_joins_nothing() returns trigger
language plpgsql security definer set search_path = public as $$
declare erased timestamptz;
begin
  select erased_at into erased from profiles where id = new.user_id for share;
  if erased is not null then
    raise exception 'A Deleted person joins no Workspace.' using errcode = 'ZF409';
  end if;
  return new;
end $$;
create trigger deleted_person_joins_nothing before insert or update of user_id on memberships
  for each row execute function deleted_person_joins_nothing();

-- What the inventory marks erased and finds by the person's id.
create or replace function erase_person_rows(p_person text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- Chat handles and numbers kept beside what stays or goes, found through the person's links before those are removed.
  update deliveries set telegram_chat_id = null where recipient_id = p_person and telegram_chat_id is not null;
  update telegram_sends set chat_id = 0 where chat_id in (select chat_id from telegram_links where person_id = p_person);
  delete from telegram_updates where telegram_user_id in (select telegram_user_id from telegram_links where person_id = p_person);
  delete from practice_ways where (way = 'telegram' and destination in (select chat_id::text from telegram_links where person_id = p_person))
    or (way = 'slack' and split_part(destination, ':', 2) in (select lower(slack_user_id) from slack_links where person_id = p_person));
  update slack_sends set recipient_key = 'deleted-person'
    where split_part(recipient_key, ':', 2) in (select slack_user_id from slack_links where person_id = p_person);
  update intake_log set sender = 'Deleted person' where sender_id = p_person and sender <> 'Deleted person';
  -- Connected assistants end for good, and what they made that nothing points to goes. A key that submitted something
  -- stays, revoked, so the history still says how it came in.
  update access_keys set revoked_at = now() where created_by = p_person and revoked_at is null;
  delete from assistant_tokens where access_key_id in (select id from access_keys where created_by = p_person);
  delete from oauth_codes where access_key_id in (select id from access_keys where created_by = p_person);
  delete from access_keys k where k.created_by = p_person
    and not exists (select 1 from observations o where o.access_key_id = k.id)
    and not exists (select 1 from metrics m where m.access_key_id = k.id)
    and not exists (select 1 from share_proposals s where s.access_key_id = k.id and s.proposer_id <> p_person);
  update view_links set revoked_at = now() where created_by = p_person and revoked_at is null;
  for r in select table_name, column_name, erasing from person_references where erasing in ('row', 'value') order by 1, 2 loop
    if r.erasing = 'row' then
      execute format('delete from %I where %I = $1', r.table_name, r.column_name) using p_person;
    else
      execute format('update %I set %I = null where %I = $1', r.table_name, r.column_name, r.column_name) using p_person;
    end if;
  end loop;
end $$;

-- The inventory's columns that hold a person's id in a table whose rows belong to a Workspace.
create or replace function workspace_person_columns() returns table (table_name text, column_name text)
language sql stable security definer set search_path = public as $$
  select p.table_name, p.column_name from person_references p
    join information_schema.columns c on c.table_schema = 'public' and c.table_name = p.table_name and c.column_name = p.column_name
      and c.data_type in ('text', 'character varying')
    join information_schema.columns w on w.table_schema = 'public' and w.table_name = p.table_name and w.column_name = 'workspace_id'
      and w.data_type = 'uuid'
    where p.treatment <> 'not_a_person' and p.erasing is distinct from 'statement'
    order by 1, 2
$$;

-- The Workspaces tied to a person by their id: the Audit Log, or a column of the inventory that holds them in a row of
-- a Workspace (their memberships and hand-overs among them). Never the demo.
create or replace function person_workspaces(p_person text) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare r record; known uuid[]; more uuid[];
begin
  select coalesce(array_agg(workspace_id), '{}') into known from audit_events
    where actor_id = p_person or (object_type = 'person' and object_id = p_person);
  for r in select table_name, column_name from workspace_person_columns() loop
    execute format('select coalesce(array_agg(distinct workspace_id), ''{}'') from %I where %I = $1 and workspace_id is not null', r.table_name, r.column_name)
      into more using p_person;
    known := known || more;
  end loop;
  return array(select distinct w from unnest(known) w where w <> 'd3e00000-0000-4000-8000-000000000001' order by 1);
end $$;

-- For the core, before step one: in each Workspace tied to the person, every name that anyone it knows by id has or had,
-- the person's own among them, as [{workspace_id, person_id, name}]. A Contact's name comes sealed; only the core opens
-- it, to tell whether the person's name is theirs alone there. One value, so no row limit cuts it short.
create or replace function person_version_names(p_person text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r record; known uuid[]; seen jsonb := '[]'; more jsonb;
begin
  known := person_workspaces(p_person);
  for r in select table_name, column_name from workspace_person_columns() loop
    execute format('select coalesce(jsonb_agg(jsonb_build_array(workspace_id, person)), ''[]'') from (select distinct workspace_id, %I as person from %I where workspace_id = any ($1) and %I is not null) x', r.column_name, r.table_name, r.column_name)
      into more using known;
    seen := seen || more;
  end loop;
  return (
    with named as (
      select (e ->> 0)::uuid as w, e ->> 1 as person from jsonb_array_elements(seen) e
      union select workspace_id, actor_id from audit_events where workspace_id = any (known) and actor_id is not null
      union select workspace_id, object_id from audit_events where workspace_id = any (known) and object_type = 'person' and object_id is not null
      union select contact_workspace, id from profiles where contact_workspace = any (known)
      union select w, p_person from unnest(known) w
    ), used as (
      select id as person, name from profiles where id in (select person from named)
      union select actor_id, actor_name from audit_events where actor_id in (select person from named)
      union select actor_id, actor_name from installation_audit_events where actor_id in (select person from named)
    )
    select coalesce(jsonb_agg(jsonb_build_object('workspace_id', n.w, 'person_id', n.person, 'name', u.name)), '[]')
      from named n join used u on u.person = n.person
      where coalesce(u.name, '') not in ('', 'Deleted person')
  );
end $$;

-- Version messages Ziffr wrote with the person's name ("Handed over from … to …") say "Deleted person" instead.
-- A version that holds the two ids is rewritten by them alone. An older one holds only names: it is rewritten only in a
-- Workspace tied to this person, and only for a name the core found nobody else there carries (`p_names`:
-- [{workspace_id, name}]); both are checked again here. A word Ziffr writes when it has no name is never matched.
create or replace function erase_person_from_versions(p_person text, p_names jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record; known uuid[]; first_part text; last_part text;
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  -- The other side is named as they are now; a program's note, after "; changed through", stays.
  update versions v set message = 'Handed over from '
      || case when v.handover_from_person_id = p_person then 'Deleted person'
         else coalesce((select name from profiles where id = v.handover_from_person_id and name not like 'w1.%'), 'a former member') end
      || ' to '
      || case when v.handover_to_person_id = p_person then 'Deleted person'
         else coalesce((select name from profiles where id = v.handover_to_person_id and name not like 'w1.%'), 'a member') end
      || coalesce(substring(v.message from '; changed through .*$'), '')
    where (v.handover_from_person_id = p_person or v.handover_to_person_id = p_person)
      and v.workspace_id <> demo and starts_with(v.message, 'Handed over from ');

  known := person_workspaces(p_person);
  for r in
    select distinct x.workspace_id as w, x.name as n from jsonb_to_recordset(coalesce(p_names, '[]')) x(workspace_id uuid, name text)
    where x.workspace_id = any (known) and x.workspace_id <> demo
      and lower(btrim(x.name)) not in ('', 'someone', 'a former member', 'a member', 'an owner or admin', 'a contact', 'deleted person')
      and x.name in (
        select name from profiles where id = p_person
        union select actor_name from audit_events where actor_id = p_person
        union select actor_name from installation_audit_events where actor_id = p_person)
  loop
    first_part := 'Handed over from ' || r.n || ' to ';
    last_part := ' to ' || r.n;
    update versions set message = 'Handed over from Deleted person to ' || substr(message, length(first_part) + 1)
      where workspace_id = r.w and handover_from_person_id is null and handover_to_person_id is null
        and starts_with(message, first_part);
    -- The Workflow's or a program's note may follow, after "; ".
    update versions set message = case
        when right(message, length(last_part)) = last_part then left(message, length(message) - length(r.n)) || 'Deleted person'
        else replace(message, last_part || '; ', ' to Deleted person; ') end
      where workspace_id = r.w and handover_from_person_id is null and handover_to_person_id is null
        and starts_with(message, 'Handed over from ')
        and (right(message, length(last_part)) = last_part or strpos(message, last_part || '; ') > 0);
  end loop;
end $$;

-- Step one, in one transaction. The core passes the address as it read it, with the two forms of it other tables are
-- keyed by, the addresses the server names as Installation Admins, and in `p_found` what only the core can find, as it
-- is sealed: {names: see erase_person_from_versions; intake: [{id, sender}], the intake rows from the person's mailbox
-- that matched nobody, each with the sender to keep instead}. Answers {outcome, auth_user_id}: 'ok', 'none'
-- (no such person), 'not_a_person' (a Contact, a Feed or a made-up person), 'member' (still in a Workspace),
-- 'only_admin', or 'changed' (the address is another by now).
create or replace function erase_person(p_person text, p_address text, p_mailbox text, p_sign_in_key text, p_server_admins text[], p_found jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare who profiles%rowtype; address text; is_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtext('installation:claim'));
  select * into who from profiles where id = p_person for update;
  if not found then return jsonb_build_object('outcome', 'none'); end if;
  -- A Contact belongs to the Workspace that made them. Somebody who signed in on a Contact's row is a person of their own.
  if who.made_up_in is not null
     or (who.erased_at is null and who.auth_user_id is null and (who.contact_workspace is not null or who.role = 'Contact'))
     or exists (select 1 from feeds where person_id = p_person)
     or exists (select 1 from memberships where user_id = p_person and workspace_id = 'd3e00000-0000-4000-8000-000000000001') then
    return jsonb_build_object('outcome', 'not_a_person');
  end if;
  if exists (select 1 from memberships where user_id = p_person) then return jsonb_build_object('outcome', 'member'); end if;
  address := lower(who.email);
  if address is distinct from lower(p_address) then return jsonb_build_object('outcome', 'changed'); end if;
  is_admin := exists (select 1 from installation_admins where person_id = p_person)
    or (who.auth_user_id is not null and coalesce(address = any (p_server_admins), false));
  if is_admin
     and not exists (select 1 from installation_admins where person_id <> p_person)
     and not exists (select 1 from unnest(p_server_admins) a where a is distinct from address)
     and exists (select 1 from profiles where id <> p_person and auth_user_id is not null and made_up_in is null) then
    return jsonb_build_object('outcome', 'only_admin');
  end if;

  perform erase_person_from_versions(p_person, p_found -> 'names');
  if address is not null then
    update intake_log i set sender = x.sender from jsonb_to_recordset(coalesce(p_found -> 'intake', '[]')) x(id bigint, sender text)
      where i.id = x.id and i.sender_id is null;
    -- Also an Invitation sent to another spelling of the same mailbox.
    delete from invitations where lower(email) = address or address_key = p_mailbox;
    delete from share_proposals where lower(recipient_email) = address or recipient_key = p_mailbox;
    delete from invitation_stops where address_key = p_mailbox;
    delete from practice_ways where address_key = p_mailbox or lower(destination) = address;
    update email_sends set address_key = 'deleted-person' where address_key = p_mailbox;
    update invitation_emails set address_key = 'deleted-person' where address_key = p_mailbox;
    delete from held_replies where address_hash = encode(sha256(convert_to(address, 'UTF8')), 'hex');
    delete from sign_in_requests where address_key = p_sign_in_key;
  end if;
  perform erase_person_rows(p_person);
  update profiles set name = 'Deleted person', email = null, phone = null, slack_handle = null, role = '', color = '#8a8f98',
    appearance = 'system', is_owner = false, erased_at = coalesce(erased_at, now())
    where id = p_person;
  return jsonb_build_object('outcome', 'ok', 'auth_user_id', who.auth_user_id);
end $$;

-- Step two, once the sign-in is gone: the row is deleted entirely when nothing marked kept or handed over holds it, and
-- stays as a Deleted person otherwise. Answers 'deleted' (also when it already was), 'kept', 'not_erased' or 'signed_in'.
create or replace function finish_erasing_person(p_person text) returns text
language plpgsql security definer set search_path = public as $$
declare who profiles%rowtype; r record; held boolean;
begin
  select * into who from profiles where id = p_person for update;
  if not found then return 'deleted'; end if;
  if who.erased_at is null then return 'not_erased'; end if;
  if who.auth_user_id is not null then return 'signed_in'; end if;
  -- Whatever a session still open wrote since step one.
  perform erase_person_rows(p_person);
  for r in select table_name, column_name from person_references where treatment in ('kept', 'handed_over') order by 1, 2 loop
    execute format('select exists (select 1 from %I where %I = $1)', r.table_name, r.column_name) into held using p_person;
    if held then return 'kept'; end if;
  end loop;
  delete from profiles where id = p_person;
  return 'deleted';
end $$;

revoke execute on function person_reference_gaps() from public, anon, authenticated;
revoke execute on function person_text_found(text) from public, anon, authenticated;
revoke execute on function deleted_person_fixed() from public, anon, authenticated;
revoke execute on function deleted_person_joins_nothing() from public, anon, authenticated;
revoke execute on function erase_person_rows(text) from public, anon, authenticated;
revoke execute on function workspace_person_columns() from public, anon, authenticated;
revoke execute on function person_workspaces(text) from public, anon, authenticated;
revoke execute on function person_version_names(text) from public, anon, authenticated;
revoke execute on function erase_person_from_versions(text, jsonb) from public, anon, authenticated;
revoke execute on function erase_person(text, text, text, text, text[], jsonb) from public, anon, authenticated;
revoke execute on function finish_erasing_person(text) from public, anon, authenticated;
grant execute on function person_reference_gaps() to service_role;
grant execute on function person_text_found(text) to service_role;
grant execute on function person_version_names(text) to service_role;
grant execute on function erase_person(text, text, text, text, text[], jsonb) to service_role;
grant execute on function finish_erasing_person(text) to service_role;
