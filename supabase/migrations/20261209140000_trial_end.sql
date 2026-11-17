-- The end of a Trial Workspace (spec 0021): when its Owner was reminded (once, the day before) and when it was closed
-- (keys revoked, Slack and Telegram unlinked). It is deleted a week after its end; these say how far along it is.
alter table workspaces add column trial_reminded_at timestamptz;
alter table workspaces add column trial_closed_at timestamptz;

-- The tables that name a workspace, for the test that a deleted trial leaves nothing behind: a table added later is
-- checked without anyone remembering to.
create or replace function tables_with_workspace_id() returns setof text
language sql stable security definer set search_path = public as $$
  select c.table_name::text from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
  where c.table_schema = 'public' and c.column_name = 'workspace_id' and t.table_type = 'BASE TABLE' order by 1
$$;
revoke execute on function tables_with_workspace_id() from public, anon, authenticated;
grant execute on function tables_with_workspace_id() to service_role;
