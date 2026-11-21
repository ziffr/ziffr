-- One lock per Workspace for taking a usage call (ticket #370): calls at once no longer race the clean-up of old hours
-- against the increment, so exactly the limit is granted and none fails for a conflict.
create or replace function claim_workspace_usage_call(p_ws uuid, p_max int) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare got int;
begin
  perform pg_advisory_xact_lock(hashtext('workspace_usage:' || p_ws::text));
  delete from workspace_usage_calls where workspace_id = p_ws and hour < date_trunc('hour', now());
  insert into workspace_usage_calls as c (workspace_id, hour, n) values (p_ws, date_trunc('hour', now()), 1)
    on conflict (workspace_id, hour) do update set n = c.n + 1 where c.n < p_max;
  get diagnostics got = row_count;
  return got > 0;
end $$;
