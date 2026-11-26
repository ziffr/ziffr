-- What a Practice Workspace may nevertheless do (spec 0063, #1271): nothing reaches anyone but the person it was made
-- for, or an address they entered themselves. The core decides at the moment of sending, comparing the address or chat
-- account a message would really go to (practice.ts); this is the same rule where the database can see it: who the
-- recipient is, whose the link or Webhook is, and whether the way is switched on.

-- 1. The ways to oneself that are switched on. `destination` is the one place that way may reach: the sign-in address
-- verified when email was switched on, or the chat account first linked after the way was switched on.
create table practice_ways (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  way text not null check (way in ('email', 'slack', 'telegram')),
  destination text check (char_length(destination) between 1 and 320),
  -- For email, the inbox that address reaches as the sends are counted by (mail.ts, mailboxKey): what the database can
  -- hold a send to.
  address_key text check (char_length(address_key) between 1 and 320),
  switched_at timestamptz not null default now(),
  primary key (workspace_id, way),
  check (way <> 'email' or (destination is not null and address_key is not null))
);
alter table practice_ways enable row level security;
revoke all on table practice_ways from public, anon, authenticated;
select attach_demo_guard('practice_ways');
insert into demo_closed_tables (table_name, reason) values ('practice_ways', 'The demo is never a Practice Workspace (spec 0063).') on conflict (table_name) do nothing;

-- Only a Practice Workspace has any.
create function practice_ways_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_practice_workspace(new.workspace_id) then
    raise exception using errcode = 'ZF4P2', message = 'practice_refused:practice_ways';
  end if;
  return new;
end $$;
create trigger practice_ways_only before insert or update on practice_ways for each row execute function practice_ways_check();

-- Whether a way is switched on.
create function practice_way_on(p_workspace uuid, p_way text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from practice_ways where workspace_id = p_workspace and way = p_way)
$$;

-- Whether a Delivery of a Practice Workspace is one to the person it was made for.
create function practice_send_is_ours(p_workspace uuid, p_person text, p_delivery text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from deliveries d where d.id = p_delivery::bigint and d.workspace_id = p_workspace and d.recipient_id = p_person)
$$;

-- 2. The allowances, each named; whatever is not named stays refused.
create or replace function practice_allows(p_table text, p_row jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      -- Links and Webhooks the person made themselves.
      when p_table = 'view_links' then p_row->>'created_by' = w.practice_for
      when p_table = 'calendar_links' then p_row->>'person_id' = w.practice_for
      when p_table = 'webhooks' then p_row->>'created_by' = w.practice_for and coalesce(p_row->>'owner_id', w.practice_for) = w.practice_for
      when p_table = 'webhook_sends' then exists (select 1 from webhooks h where h.id = (p_row->>'webhook_id')::uuid and h.workspace_id = w.id and h.created_by = w.practice_for)
      -- A message to the person themself, by a way they switched on. Never to anyone else, whatever the way.
      when p_table = 'deliveries' then p_row->>'recipient_id' = w.practice_for and practice_way_on(w.id, p_row->>'connector')
      -- A send is counted only for a Delivery to the person themself, going to the very destination recorded.
      when p_table = 'email_sends' then practice_send_is_ours(w.id, w.practice_for, p_row->>'delivery_id') and exists (
        select 1 from practice_ways y where y.workspace_id = w.id and y.way = 'email' and y.address_key = p_row->>'address_key')
      when p_table = 'slack_sends' then practice_send_is_ours(w.id, w.practice_for, p_row->>'delivery_id') and exists (
        select 1 from practice_ways y where y.workspace_id = w.id and y.way = 'slack' and y.destination = lower(p_row->>'recipient_key')
          and split_part(y.destination, ':', 1) = lower(p_row->>'team_id'))
      when p_table = 'telegram_sends' then practice_send_is_ours(w.id, w.practice_for, p_row->>'delivery_id') and exists (
        select 1 from practice_ways y where y.workspace_id = w.id and y.way = 'telegram' and y.destination = p_row->>'chat_id')
      when p_table in ('slack_installations', 'slack_install_states') then practice_way_on(w.id, 'slack')
      -- Only their own account, linked with their own code: never one found by an address.
      when p_table = 'slack_links' then practice_way_on(w.id, 'slack') and p_row->>'person_id' = w.practice_for and p_row->>'matched_by' = 'code'
      when p_table = 'slack_link_codes' then practice_way_on(w.id, 'slack') and p_row->>'person_id' = w.practice_for
      when p_table = 'telegram_workspaces' then practice_way_on(w.id, 'telegram')
      when p_table in ('telegram_links', 'telegram_link_codes') then practice_way_on(w.id, 'telegram') and p_row->>'person_id' = w.practice_for
      else false
    end
    from workspaces w
    where w.id = (p_row->>'workspace_id')::uuid and w.practice_for is not null
  ), false)
$$;

-- 3. A Delivery: queued, sending or sent only where the allowance above says so. One already on its way when a way is
-- switched off may still be marked sent, since it left; nothing new starts. Its recipient and Connector count too.
create or replace function practice_holds_delivery() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_practice_workspace(new.workspace_id) then return new; end if;
  if tg_op = 'UPDATE' and old.mail_state = 'sending' and new.mail_state = 'sent' and old.recipient_id = new.recipient_id and old.connector = new.connector
    and old.workspace_id = new.workspace_id then return new; end if;
  if practice_allows(tg_table_name, to_jsonb(new)) then return new; end if;
  if new.mail_state in ('sending', 'sent') then
    raise exception using errcode = 'ZF4P1', message = 'practice_sends_nothing';
  end if;
  if new.mail_state = 'queued' then new.mail_state := 'outbox'; end if;
  if new.mail_state = 'outbox' and new.last_error is null then new.last_error := 'Practice Workspace: nothing is sent.'; end if;
  return new;
end $$;
drop trigger practice_holds_delivery on deliveries;
create trigger practice_holds_delivery before insert or update of mail_state, workspace_id, recipient_id, connector on deliveries
  for each row execute function practice_holds_delivery();

-- 4. Ending a connection is always possible, also once its way is switched off: a Slack connection revoked, or Telegram
-- turned off, with nothing else of the row changed. Every other change asks the allowances like a new row.
create or replace function practice_refuses() returns trigger language plpgsql security definer set search_path = public as $$
declare
  was jsonb;
  becomes jsonb;
begin
  if tg_op = 'UPDATE' then
    was := to_jsonb(old);
    becomes := to_jsonb(new);
    if tg_table_name = 'slack_installations' and was->>'revoked_at' is null and becomes->>'revoked_at' is not null
      and becomes - 'revoked_at' = was - 'revoked_at' then return new; end if;
    if tg_table_name = 'telegram_workspaces' and was->>'enabled' = 'true' and becomes->>'enabled' = 'false'
      and becomes - array['enabled', 'changed_by', 'changed_at'] = was - array['enabled', 'changed_by', 'changed_at'] then return new; end if;
    -- Nor does a row move into a Practice Workspace, or out of one, unasked.
    if (was->>'workspace_id') is distinct from (becomes->>'workspace_id') and is_practice_workspace((was->>'workspace_id')::uuid) then
      raise exception using errcode = 'ZF4P2', message = 'practice_refused:' || tg_table_name;
    end if;
  end if;
  if is_practice_workspace(new.workspace_id) and not practice_allows(tg_table_name, to_jsonb(new)) then
    raise exception using errcode = 'ZF4P2', message = 'practice_refused:' || tg_table_name;
  end if;
  return new;
end $$;

-- 5. The chat account a way reaches is the first one linked after it was switched on. Another one linked later is not
-- recorded: nothing is sent to it until the way is switched off and on again.
create function practice_way_bind() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'telegram_links' then
    update practice_ways set destination = new.chat_id::text where workspace_id = new.workspace_id and way = 'telegram' and destination is null;
  else
    update practice_ways set destination = lower(new.team_id || ':' || new.slack_user_id) where workspace_id = new.workspace_id and way = 'slack' and destination is null;
  end if;
  return null;
end $$;
create trigger practice_way_bind after insert or update on telegram_links for each row execute function practice_way_bind();
create trigger practice_way_bind after insert or update on slack_links for each row execute function practice_way_bind();

revoke execute on function practice_ways_check(), practice_way_bind() from public, anon, authenticated;
revoke execute on function practice_way_on(uuid, text), practice_send_is_ours(uuid, text, text) from public, anon, authenticated;
grant execute on function practice_way_on(uuid, text), practice_send_is_ours(uuid, text, text) to service_role;
