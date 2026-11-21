-- claim_webhook_sends_for takes every send of the Workspace that is due, as claim_webhook_sends does (queued, retrying, or
-- stuck in 'sending' for five minutes), so a run limited to one Workspace (the tests') sees the same rows as the job.
create or replace function claim_webhook_sends_for(p_workspace uuid, p_metric int, p_limit int) returns setof webhook_sends
language sql security definer set search_path = public as $$
  update webhook_sends s set state = 'sending', claimed_at = now()
  where s.id in (
    select id from webhook_sends
    where workspace_id = p_workspace and (p_metric is null or metric_id = p_metric)
      and ((state in ('queued', 'retrying') and next_attempt_at <= now()) or (state = 'sending' and claimed_at < now() - interval '5 minutes'))
    order by next_attempt_at limit p_limit for update skip locked)
  returning s.*;
$$;
