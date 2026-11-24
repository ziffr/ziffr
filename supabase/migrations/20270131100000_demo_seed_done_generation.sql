-- Demo review D8 (spec 0051): `demo_seed_done` now names the Generation whose seed is finished and marks only that one, so a
-- reset that overlaps a newer one (the older call finishing late) cannot mark the newer seed done before its own steps ran.
-- The old function without an argument is dropped: it was the unguarded form, and only the core called it.
drop function if exists demo_seed_done();

create or replace function demo_seed_done(p_generation bigint) returns void
language sql security definer set search_path = public as $$
  update demo_state set seed_done_at = now() where id and generation = p_generation;
$$;
revoke execute on function demo_seed_done(bigint) from public, anon, authenticated;
grant execute on function demo_seed_done(bigint) to service_role;
