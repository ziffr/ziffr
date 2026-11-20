-- The demo's guard for tables made after the read-only demo (#271; 20261225110000_demo_read_only.sql): every table
-- with a workspace_id refuses writes to the demo's rows. A migration that makes such a table calls
-- `select attach_demo_guard('my_table');` after creating it. demo-read-only.db.test.ts names any table that has not.

/** Gives a table with a workspace_id the demo's two read-only triggers, as the read-only migration gave every table
 * there was then. Safe to call twice. */
create or replace function attach_demo_guard(t regclass) returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from pg_attribute where attrelid = t and attname = 'workspace_id' and not attisdropped) then
    raise exception 'attach_demo_guard: % has no workspace_id', t;
  end if;
  execute format('drop trigger if exists zz_demo_read_only_new on %s', t);
  execute format('drop trigger if exists zz_demo_read_only_old on %s', t);
  execute format($f$create trigger zz_demo_read_only_new before insert or update on %s for each row
    when (new.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_read_only()$f$, t);
  execute format($f$create trigger zz_demo_read_only_old before update or delete on %s for each row
    when (old.workspace_id = 'd3e00000-0000-4000-8000-000000000001') execute function demo_read_only()$f$, t);
end $$;

revoke execute on function attach_demo_guard(regclass) from public, anon, authenticated;

-- Every table made since the read-only migration (calendar_links among them) that has neither the guard nor a check
-- of its own that keeps the demo out.
do $$
declare t text;
begin
  for t in select demo_read_only_gaps() loop
    if t not in ('workspaces', 'profiles', 'away', 'ask_now_claims') then
      perform attach_demo_guard(('public.' || quote_ident(t))::regclass);
    end if;
  end loop;
end $$;
