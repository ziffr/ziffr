-- Workspace Webhooks are counted without the Personal ones (spec 0037, ticket #641): the Workspace's limit counts its own
-- only, except in a Trial Workspace, where Webhooks of both kinds count together within the trial's smaller limit
-- (ticket #646). Replaces the create_webhook of 20270107500000_trial_webhooks.sql with the same signature and answers.
create or replace function create_webhook(p_id uuid, p_ws uuid, p_name text, p_url text, p_secret text, p_events text[], p_by text, p_max int) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('webhooks:' || p_ws::text));
  if (select count(*) from webhooks where workspace_id = p_ws
        and (owner_id is null or exists (select 1 from workspaces where id = p_ws and trial_ends_at is not null))) >= p_max then return 'limit'; end if;
  insert into webhooks (id, workspace_id, name, url, secret, events, created_by) values (p_id, p_ws, p_name, p_url, p_secret, p_events, p_by);
  return 'ok';
end $$;
