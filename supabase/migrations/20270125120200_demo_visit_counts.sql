-- The demo's visit counts (spec 0051, ticket 2): how many changes one visit, one network address and the whole demo have
-- made in a window, kept only as hashes and numbers so a database dump holds no usable visit id (the cookie's id is
-- hashed by the core before it gets here). Nothing reads it yet: the limits of ticket 5 do. It has no workspace_id, so
-- it needs no demo guard and is not the demo's data; it is emptied by every Demo Reset (resetDemoWorkspace).
create table demo_visit_counts (
  window_start timestamptz not null,
  -- 'visit' (one cookie's hash), 'address' (a network address's hash) or 'demo' (everything, key empty).
  kind text not null check (kind in ('visit', 'address', 'demo')),
  key text not null check ((kind = 'demo' and key = '') or (kind <> 'demo' and key ~ '^[0-9a-f]{32}$')),
  count integer not null default 0 check (count >= 0),
  primary key (window_start, kind, key)
);
alter table demo_visit_counts enable row level security;

-- Adds to a count in one statement, so requests at the same moment cannot lose one, and answers the new count.
create or replace function demo_visit_bump(p_window timestamptz, p_kind text, p_key text, p_by integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare total integer;
begin
  if p_by < 1 or p_by > 1000 then raise exception 'demo_visit_bump: by must be 1 to 1000'; end if;
  insert into demo_visit_counts (window_start, kind, key, count) values (p_window, p_kind, p_key, p_by)
    on conflict (window_start, kind, key) do update set count = demo_visit_counts.count + p_by
    returning count into total;
  return total;
end $$;

revoke execute on function demo_visit_bump(timestamptz, text, text, integer) from public, anon, authenticated;
grant execute on function demo_visit_bump(timestamptz, text, text, integer) to service_role;
