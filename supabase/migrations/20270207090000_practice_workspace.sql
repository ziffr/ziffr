-- Practice Workspaces (spec 0063, #1265; GLOSSARY: Practice Workspace, Made-up Person): a private Workspace of an
-- Installation Admin, with made-up people, from which nothing ever leaves. The core refuses at every place that sends
-- (packages/core/src/practice.ts); this is the second layer, in the database, so a place that forgets still cannot queue
-- a message, hold a connection to the outside or let anyone else in. The demo Workspace and its guard are not touched.

-- 1. The mark: whom the Workspace was made for. Set when the row is inserted, never added, changed or removed after.
alter table workspaces add column practice_for text check (char_length(practice_for) between 1 and 64);
alter table workspaces add constraint workspaces_practice_alone
  check (practice_for is null or (trial_ends_at is null and join_domain is null and id <> 'd3e00000-0000-4000-8000-000000000001'::uuid));
create unique index workspaces_one_practice_per_person on workspaces (practice_for) where practice_for is not null;

create function practice_mark_fixed() returns trigger language plpgsql set search_path = public as $$
begin
  if new.practice_for is distinct from old.practice_for or (old.practice_for is not null and new.id is distinct from old.id) then
    raise exception using errcode = 'ZF4P0', message = 'practice_mark_is_fixed';
  end if;
  return new;
end $$;
create trigger practice_mark_fixed before update on workspaces for each row execute function practice_mark_fixed();

-- Whether a Workspace is a Practice Workspace.
create function is_practice_workspace(p_workspace uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspaces where id = p_workspace and practice_for is not null)
$$;

-- 2. Made-up people: a person row made for one Practice Workspace. No sign-in, no Contact, and only an address under
-- the reserved name .invalid, which no mail server can route. No foreign key: the rows go with the Workspace in the one
-- step that deletes it.
alter table profiles add column made_up_in uuid;
alter table profiles add constraint profiles_made_up_cannot_be_reached
  check (made_up_in is null or (auth_user_id is null and contact_workspace is null and slack_handle is null and phone is null and (email is null or lower(email) like '%.invalid')));
create index profiles_made_up_in on profiles (made_up_in) where made_up_in is not null;

create function made_up_person_fixed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.made_up_in is distinct from old.made_up_in then
    raise exception using errcode = 'ZF4P0', message = 'practice_mark_is_fixed';
  end if;
  if tg_op = 'INSERT' and new.made_up_in is not null and not is_practice_workspace(new.made_up_in) then
    raise exception using errcode = 'ZF4P2', message = 'practice_refused:profiles';
  end if;
  return new;
end $$;
create trigger made_up_person_fixed before insert or update on profiles for each row execute function made_up_person_fixed();

-- 3. Nobody else gets in: a Practice Workspace's members are the person it was made for, as its Owner, and its own
-- made-up people (never as Owner). A made-up person belongs to no other Workspace.
create function practice_members() returns trigger language plpgsql security definer set search_path = public as $$
declare
  made_for text;
  made_up uuid;
begin
  select practice_for into made_for from workspaces where id = new.workspace_id;
  select made_up_in into made_up from profiles where id = new.user_id;
  if made_up is not null and made_up is distinct from new.workspace_id then
    raise exception using errcode = 'ZF4P2', message = 'practice_refused:memberships';
  end if;
  if made_for is not null and not (
    (new.user_id = made_for and new.role = 'owner') or (made_up is not null and made_up = new.workspace_id and new.role <> 'owner')
  ) then
    raise exception using errcode = 'ZF4P2', message = 'practice_refused:memberships';
  end if;
  return new;
end $$;
create trigger practice_members before insert or update on memberships for each row execute function practice_members();

-- The allowances: none. What a Practice Workspace may nevertheless do is decided here and in the core's one place
-- (practice.ts), and nowhere else; an allowance is a later migration that replaces this function with a narrow case, and
-- whatever it does not name stays refused.
create function practice_allows(p_table text, p_row jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select false
$$;

-- 4. A Delivery of it stays in the Outbox: asked to be queued, it is not; asked to be sending or sent, the write fails.
create function practice_holds_delivery() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_practice_workspace(new.workspace_id) or practice_allows(tg_table_name, to_jsonb(new)) then return new; end if;
  if new.mail_state in ('sending', 'sent') then
    raise exception using errcode = 'ZF4P1', message = 'practice_sends_nothing';
  end if;
  if new.mail_state = 'queued' then new.mail_state := 'outbox'; end if;
  if new.mail_state = 'outbox' and new.last_error is null then new.last_error := 'Practice Workspace: nothing is sent.'; end if;
  return new;
end $$;
create trigger practice_holds_delivery before insert or update of mail_state, workspace_id on deliveries
  for each row execute function practice_holds_delivery();

-- 5. What would reach outside or let someone else in cannot be stored for it at all.
create function practice_refuses() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_practice_workspace(new.workspace_id) and not practice_allows(tg_table_name, to_jsonb(new)) then
    raise exception using errcode = 'ZF4P2', message = 'practice_refused:' || tg_table_name;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array[
    'invitations', 'invitation_emails', 'join_requests', 'view_links', 'calendar_links',
    'webhooks', 'webhook_sends',
    'slack_installations', 'slack_install_states', 'slack_links', 'slack_link_codes', 'slack_sends',
    'telegram_workspaces', 'telegram_links', 'telegram_link_codes', 'telegram_sends',
    'email_sends', 'workspace_limits'
  ] loop
    execute format('create trigger practice_refuses before insert or update on %I for each row execute function practice_refuses()', t);
  end loop;
end $$;

-- The tables refused to a Practice Workspace, for the test that keeps the list complete.
create function practice_refused_tables() returns setof text language sql stable security definer set search_path = public as $$
  select c.relname::text from pg_trigger g join pg_class c on c.oid = g.tgrelid
  where g.tgname = 'practice_refuses' and not g.tgisinternal order by 1
$$;

-- 6. It is not counted, limited, warned or deleted as unused, and is not listed to Installation Admins.
create or replace function workspace_limit_of(p_workspace uuid) returns table (metrics integer, label text)
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from workspace_limits l where l.workspace_id = p_workspace) then
    return query select l.metrics, l.label from workspace_limits l where l.workspace_id = p_workspace;
  elsif p_workspace <> 'd3e00000-0000-4000-8000-000000000001'::uuid
    and not exists (select 1 from workspaces w where w.id = p_workspace and (w.trial_ends_at is not null or w.practice_for is not null)) then
    return query select d.metrics, d.label from installation_limit_default d;
  end if;
end $$;

create or replace function workspace_limits_overview()
returns table (workspace_id uuid, name text, metrics integer, limit_metrics integer, label text, own boolean, set_by text, set_by_person text, set_at timestamptz, over_limit_since timestamptz)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, workspace_metric_count(w.id), lim.metrics, lim.label, l.workspace_id is not null, l.set_by, l.set_by_person, l.set_at, w.over_limit_since
  from workspaces w
  left join workspace_limits l on l.workspace_id = w.id
  left join lateral workspace_limit_of(w.id) lim on true
  where w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid and w.practice_for is null
  order by lower(w.name), w.id
$$;

create or replace function owns_default_workspace(p_person text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join workspaces w on w.id = m.workspace_id
    where m.user_id = p_person and m.role = 'owner' and w.trial_ends_at is null and w.practice_for is null
      and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
      and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
  )
$$;

create or replace function unused_workspace_candidates(p_days integer, p_limit integer) returns table (workspace_id uuid, step text)
language plpgsql security definer set search_path = public as $$
begin
  update workspaces set unused_warned_at = null where unused_warned_at is not null and unused_warned_at <= now() - make_interval(days => coalesce(unused_wait_days, 14) + 7);
  return query
    (select w.id, 'warn'::text from workspaces w
      where w.unused_warned_at is null and w.trial_ends_at is null and w.practice_for is null and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
        and w.last_used_at <= now() - make_interval(days => p_days)
        and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
        and exists (select 1 from memberships m where m.workspace_id = w.id and m.role = 'owner')
      order by w.last_used_at limit p_limit)
    union all
    (select w.id, 'delete'::text from workspaces w where deletable_as_unused(w.id, p_days) order by w.unused_warned_at limit p_limit);
end $$;

create or replace function claim_unused_warning(p_workspace uuid, p_days integer, p_wait integer default 14) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update workspaces w set unused_warned_at = now(), unused_wait_days = least(greatest(coalesce(p_wait, 14), 7), 90)
    where w.id = p_workspace and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid and w.trial_ends_at is null and w.practice_for is null
      and w.unused_warned_at is null and w.last_used_at <= now() - make_interval(days => p_days)
      and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
    returning w.id into v_id;
  return v_id is not null;
end $$;

create or replace function deletable_as_unused(p_workspace uuid, p_days integer) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspaces w
    where w.id = p_workspace and w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
      and w.practice_for is null
      and w.trial_ends_at is null and w.unused_warned_at is not null
      and w.unused_warned_at <= now() - make_interval(days => coalesce(w.unused_wait_days, 14))
      and w.unused_warned_at > now() - make_interval(days => coalesce(w.unused_wait_days, 14) + 7)
      and w.last_used_at <= w.unused_warned_at - make_interval(days => p_days)
      and not exists (select 1 from workspace_limits l where l.workspace_id = w.id)
      and exists (
        select 1 from deliveries d
        where d.workspace_id = w.id and d.kind = 'notice' and d.connector = 'email' and d.mail_state = 'sent'
          and d.subject = 'Your Ziffr Workspace will be deleted' and d.created_at >= w.unused_warned_at
      )
  )
$$;

create or replace function usage_event_workspace_deleted() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid and old.practice_for is null then
    insert into usage_events (kind, excluded) values ('workspaces_deleted', usage_workspace_excluded(old.id));
  end if;
  return null;
end $$;

-- The Installation's usage totals leave it out, as they leave out the demo: only the first query changes.
do $$
declare
  body text;
  was constant text := 'insert into _usage_ws select w.id from workspaces w where w.id <> demo and w.id is distinct from p_exclude;';
begin
  select pg_get_functiondef('usage_rollup_day(date, uuid, boolean)'::regprocedure) into body;
  if position(was in body) = 0 then raise exception 'usage_rollup_day has changed: add "and w.practice_for is null" to it by hand'; end if;
  execute replace(body, was, 'insert into _usage_ws select w.id from workspaces w where w.id <> demo and w.id is distinct from p_exclude and w.practice_for is null;');
end $$;

revoke execute on function practice_mark_fixed(), made_up_person_fixed(), practice_members(), practice_holds_delivery(), practice_refuses() from public, anon, authenticated;
revoke execute on function is_practice_workspace(uuid), practice_refused_tables(), practice_allows(text, jsonb) from public, anon, authenticated;
grant execute on function is_practice_workspace(uuid), practice_refused_tables(), practice_allows(text, jsonb) to service_role;
