-- Webhooks in Trial Workspaces (spec 0037, "Trial Workspaces"; ticket #646): a trial may now hold Webhooks within a
-- smaller limit, so create_webhook no longer refuses one. What keeps a trial from being an abuse path lives in the core
-- (packages/core/src/webhook-trial.ts: the limit passed as p_max, the daily cap, no private hosts, the operator switch).
-- The count and the insert stay in one step under a lock of the Workspace, so Webhooks made at once cannot pass the limit
-- together. Returns 'ok' or 'limit'. The demo still has none (its write guard).
create or replace function create_webhook(p_id uuid, p_ws uuid, p_name text, p_url text, p_secret text, p_events text[], p_by text, p_max int) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('webhooks:' || p_ws::text));
  if (select count(*) from webhooks where workspace_id = p_ws) >= p_max then return 'limit'; end if;
  insert into webhooks (id, workspace_id, name, url, secret, events, created_by) values (p_id, p_ws, p_name, p_url, p_secret, p_events, p_by);
  return 'ok';
end $$;
