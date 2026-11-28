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
  'versions.author_id', 'view_designs.added_by', 'view_links.created_by', 'webhooks.created_by',
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

-- A check for the test of this ticket and for whoever runs the Installation: every column of the schema ('table.column')
-- whose text holds the given words. Sealed columns cannot be searched.
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

-- Version messages Ziffr wrote with the person's name ("Handed over from … to …") say "Deleted person" instead. Their
-- names are today's and those the Audit Log saw them use. A name somebody else has too is rewritten only in the
-- Workspaces that know this person.
create or replace function erase_person_from_versions(p_person text) returns void
language plpgsql security definer set search_path = public as $$
declare
  n text; shared boolean; known uuid[]; first_part text; last_part text;
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  select coalesce(array_agg(distinct w), '{}') into known from (
    select workspace_id as w from audit_events where actor_id = p_person or (object_type = 'person' and object_id = p_person)
    union all select workspace_id from versions where author_id = p_person
    union all select workspace_id from observations where submitter_id = p_person or entered_by = p_person
    union all select workspace_id from actions where assignee_id = p_person or asker_id = p_person
  ) x;
  for n in
    select distinct names.name from (
      select name from profiles where id = p_person
      union all select actor_name from audit_events where actor_id = p_person
      union all select actor_name from installation_audit_events where actor_id = p_person
    ) names where coalesce(names.name, '') not in ('', 'Deleted person')
  loop
    shared := exists (select 1 from profiles where id <> p_person and contact_workspace is null and name = n);
    first_part := 'Handed over from ' || n || ' to ';
    last_part := ' to ' || n;
    update versions set message = 'Handed over from Deleted person to ' || substr(message, length(first_part) + 1)
      where starts_with(message, first_part) and workspace_id <> demo and (not shared or workspace_id = any (known));
    -- The Workflow's or a program's note may follow, after "; ".
    update versions set message = case
        when right(message, length(last_part)) = last_part then left(message, length(message) - length(n)) || 'Deleted person'
        else replace(message, last_part || '; ', ' to Deleted person; ') end
      where starts_with(message, 'Handed over from ')
        and (right(message, length(last_part)) = last_part or strpos(message, last_part || '; ') > 0)
        and workspace_id <> demo and (not shared or workspace_id = any (known));
  end loop;
end $$;

-- Step one, in one transaction. The core passes the address as it read it, with the two forms of it other tables are
-- keyed by, and the addresses the server names as Installation Admins. Answers {outcome, auth_user_id}: 'ok', 'none'
-- (no such person), 'not_a_person' (a Contact, a Feed or a made-up person), 'member' (still in a Workspace),
-- 'only_admin', or 'changed' (the address is another by now).
create or replace function erase_person(p_person text, p_address text, p_mailbox text, p_sign_in_key text, p_server_admins text[])
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

  perform erase_person_from_versions(p_person);
  if address is not null then
    delete from invitations where lower(email) = address;
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
revoke execute on function erase_person_from_versions(text) from public, anon, authenticated;
revoke execute on function erase_person(text, text, text, text, text[]) from public, anon, authenticated;
revoke execute on function finish_erasing_person(text) from public, anon, authenticated;
grant execute on function person_reference_gaps() to service_role;
grant execute on function person_text_found(text) to service_role;
grant execute on function erase_person(text, text, text, text, text[]) to service_role;
grant execute on function finish_erasing_person(text) to service_role;
