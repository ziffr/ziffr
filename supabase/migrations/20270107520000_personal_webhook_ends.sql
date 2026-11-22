-- Why a Personal Webhook ended (spec 0037, ticket #641): the database removes a person's Personal Webhooks with their
-- place in the Workspace (membership removed or made a Guest) or with their account, and notes each here with the
-- reason, so the core can write the Audit Log entry whichever way it happened. The core drains this table
-- (personal-webhooks.ts, recordPersonalWebhookEnds); a Workspace that is deleted takes its rows with it unrecorded.
-- Service role only; holds a name and ids, never an address or a secret.
create table personal_webhook_ends (
  webhook_id uuid primary key,
  workspace_id uuid not null,
  owner_id text not null,
  name text not null,
  reason text not null check (reason in ('left', 'guest', 'account')),
  ended_at timestamptz not null default now()
);
alter table personal_webhook_ends enable row level security;
select attach_demo_guard('personal_webhook_ends');

create or replace function end_personal_webhooks() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid; who text; why text;
begin
  if tg_op = 'DELETE' then ws := old.workspace_id; who := old.user_id; why := 'left';
  elsif new.role = 'guest' then ws := new.workspace_id; who := new.user_id; why := 'guest';
  else return new;
  end if;
  insert into personal_webhook_ends (webhook_id, workspace_id, owner_id, name, reason)
    select id, workspace_id, owner_id, name, why from webhooks where workspace_id = ws and owner_id = who
    on conflict (webhook_id) do nothing;
  delete from webhooks where workspace_id = ws and owner_id = who;
  return coalesce(new, old);
end $$;

-- An account that is deleted takes its Personal Webhooks with it (the foreign key); noted first, as the account's end.
create or replace function note_account_personal_webhooks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into personal_webhook_ends (webhook_id, workspace_id, owner_id, name, reason)
    select id, workspace_id, owner_id, name, 'account' from webhooks where owner_id = old.id
    on conflict (webhook_id) do nothing;
  return old;
end $$;
create trigger profiles_note_personal_webhooks before delete on profiles
  for each row execute function note_account_personal_webhooks();
