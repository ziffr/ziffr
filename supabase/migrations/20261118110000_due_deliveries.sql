-- The email Deliveries the retry job sends next (spec 0004, ticket #74): queued, not waiting out a limit
-- (not_before), and past their wait after a failed attempt (1, 2, 4, 8 minutes), oldest first. Chosen here, before
-- the limit, so emails that must wait can never fill a run and hold up the ones that are due.
create or replace function due_deliveries(p_limit int, p_max_attempts int)
returns setof bigint language sql stable security definer set search_path = public as $$
  select id from deliveries
  where mail_state = 'queued' and attempts < p_max_attempts
    and (not_before is null or not_before <= now())
    and (last_attempt_at is null or attempts = 0 or last_attempt_at <= now() - make_interval(mins => power(2, attempts - 1)::int))
  order by id
  limit least(greatest(p_limit, 1), 500)
$$;
revoke execute on function due_deliveries(int, int) from public, anon, authenticated;
grant execute on function due_deliveries(int, int) to service_role;
create index on deliveries (id) where mail_state = 'queued';
