-- View Links to a Snapshot (spec 0013, ticket #178; GLOSSARY: View Link, Snapshot): a dashboard's frozen View Link
-- shows one of its Snapshots, read from the Snapshot whenever the link is opened, so it stops working once the
-- Snapshot is deleted. Frozen links made before keep what they stored. Idempotent.
alter table view_links add column if not exists snapshot_id bigint references dashboard_snapshots(id) on delete cascade;
do $$ begin
  alter table view_links add constraint view_links_snapshot_of_dashboard check (snapshot_id is null or (object_type = 'dashboard' and frozen is null));
exception when duplicate_object then null; end $$;
