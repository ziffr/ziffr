-- Security review of spec 0034 (#409): the cap of links is per Action (all its Webhooks together), not per Webhook and Action,
-- so five Webhooks cannot pile up fifty. Same function, same grants.
create or replace function link_webhook_external(p_id uuid, p_ws uuid, p_webhook uuid, p_action int, p_system text, p_external text, p_url text, p_hash text, p_hashes text[], p_max int) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('webhook_link:' || p_action::text));
  if exists (select 1 from webhook_external_ids where webhook_id = p_webhook and external_hash = any(p_hashes) and not (action_id = p_action and system = p_system)) then return 'taken'; end if;
  if not exists (select 1 from webhook_external_ids where webhook_id = p_webhook and action_id = p_action and system = p_system)
     and (select count(*) from webhook_external_ids where action_id = p_action) >= p_max then return 'limit'; end if;
  delete from webhook_external_ids where webhook_id = p_webhook and action_id = p_action and system = p_system;
  insert into webhook_external_ids (id, workspace_id, webhook_id, action_id, system, external_id, url, external_hash) values (p_id, p_ws, p_webhook, p_action, p_system, p_external, p_url, p_hash);
  return 'ok';
exception when unique_violation then
  -- The same external task linked to another Action at the same moment (the lock is per Action).
  return 'taken';
end $$;

