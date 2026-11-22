-- personal_webhook_ends.workspace_id now belongs to its Workspace (spec 0037, ticket #641): a Workspace that is deleted takes
-- its waiting ends with it, which is what the comment of 20270107520000_personal_webhook_ends.sql said but its column did not do.
-- Deleting a Workspace removes its memberships and Personal Webhooks in a cascade, and the triggers that note an end must not
-- insert a row for a Workspace that is already gone, so both skip it.
delete from personal_webhook_ends where not exists (select 1 from workspaces w where w.id = personal_webhook_ends.workspace_id);
alter table personal_webhook_ends add constraint personal_webhook_ends_workspace_fk foreign key (workspace_id) references workspaces(id) on delete cascade;

create or replace function end_personal_webhooks() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid; who text; why text;
begin
  if tg_op = 'DELETE' then ws := old.workspace_id; who := old.user_id; why := 'left';
  elsif new.role = 'guest' then ws := new.workspace_id; who := new.user_id; why := 'guest';
  else return new;
  end if;
  if exists (select 1 from workspaces where id = ws) then
    insert into personal_webhook_ends (webhook_id, workspace_id, owner_id, name, reason)
      select id, workspace_id, owner_id, name, why from webhooks where workspace_id = ws and owner_id = who
      on conflict (webhook_id) do nothing;
  end if;
  delete from webhooks where workspace_id = ws and owner_id = who;
  return coalesce(new, old);
end $$;

create or replace function note_account_personal_webhooks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into personal_webhook_ends (webhook_id, workspace_id, owner_id, name, reason)
    select h.id, h.workspace_id, h.owner_id, h.name, 'account' from webhooks h
    where h.owner_id = old.id and exists (select 1 from workspaces w where w.id = h.workspace_id)
    on conflict (webhook_id) do nothing;
  return old;
end $$;
