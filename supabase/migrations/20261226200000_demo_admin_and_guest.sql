-- The demo shows every role (#528): Sara stays the Owner, Ben becomes an Admin, and a new Guest, Greta, sees only what
-- is shared with her. Replaces prototype_seed_memberships (last defined in 20261225460000), which demo_reset calls
-- after the base Metrics and dashboards exist.
create or replace function public.prototype_seed_memberships() returns void language plpgsql security definer set search_path = public as $$
declare demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  delete from memberships where workspace_id = demo;
  insert into profiles (id, name, role, color, slack_handle, email) values
    ('mia','Mia Hartmann','Finance lead','#db2777','@mia','mia@northwind.example'),
    ('lena','Lena Petrov','Customer success','#059669','@lena','lena@northwind.example'),
    ('tom','Tom Eriksen','Head of customer success','#2563eb','@tom','tom@northwind.example'),
    ('jonas','Jonas Brandt','Support lead','#ca8a04','@jonas','jonas@northwind.example'),
    ('greta','Greta Lund','Outside bookkeeper','#7c3aed','@greta','greta@northwind.example')
  on conflict (id) do update set name = excluded.name, role = excluded.role, color = excluded.color,
    slack_handle = excluded.slack_handle, email = excluded.email, auth_user_id = null;
  delete from away where user_id in ('mia','lena','tom','jonas','greta');
  insert into memberships (workspace_id, user_id, role) values
    (demo, 'sara', 'owner'),
    (demo, 'ben', 'admin'),
    (demo, 'anna', 'member'),
    (demo, 'mia', 'member'),
    (demo, 'lena', 'member'),
    (demo, 'tom', 'member'),
    (demo, 'jonas', 'member'),
    (demo, 'greta', 'guest');
  -- What the Guest may see: two Metrics and one dashboard, nothing else.
  insert into shares (workspace_id, object_type, object_id, user_id, role)
  select demo, 'metric', id, 'greta', 'viewer' from metrics where workspace_id = demo and slug in ('revenue', 'orders')
  on conflict do nothing;
  insert into shares (workspace_id, object_type, object_id, user_id, role)
  select demo, 'dashboard', id, 'greta', 'viewer' from dashboards where workspace_id = demo and name = 'Monthly overview'
  on conflict do nothing;
end $$;
revoke execute on function prototype_seed_memberships() from public, anon, authenticated;
grant execute on function prototype_seed_memberships() to service_role;
