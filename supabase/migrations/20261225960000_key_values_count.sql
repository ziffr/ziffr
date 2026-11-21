-- Counting the values an API key submitted in a day (ticket #516). The daily limit per key can now be raised on the
-- Installation settings page to a million, so the count is one aggregate in the database instead of reading the
-- log's rows into the server. Only the service role calls them (the core).

-- The values the key submitted since p_since.
create or replace function key_values_total(p_key bigint, p_since timestamptz) returns bigint
language sql stable set search_path = public as $$
  select coalesce(sum(submitted), 0)::bigint from access_log where key_id = p_key and submitted > 0 and at > p_since
$$;

-- When the oldest submissions since p_since have passed enough for p_need more values to fit: the time of the first
-- submission (oldest first) at which the running sum reaches p_need, or null when it never does.
create or replace function key_values_free_at(p_key bigint, p_since timestamptz, p_need bigint) returns timestamptz
language sql stable set search_path = public as $$
  select min(at) from (
    select at, sum(submitted) over (order by at, id) as running
    from access_log where key_id = p_key and submitted > 0 and at > p_since
  ) r where running >= p_need
$$;

revoke execute on function key_values_total(bigint, timestamptz) from public, anon, authenticated;
revoke execute on function key_values_free_at(bigint, timestamptz, bigint) from public, anon, authenticated;
