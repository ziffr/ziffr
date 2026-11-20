-- The starting Packs (spec 0030, #279) share entries such as "Revenue", as Packs of different makers will. A name is
-- now unique among the entries every Workspace has, and within each installed Pack, so a Workspace can install two
-- Packs that both describe Revenue; its catalog lists both, under each Pack.
drop index if exists catalog_metrics_workspace_name_key;
create unique index catalog_metrics_workspace_name_key on catalog_metrics (workspace_id, pack_install_id, name) where workspace_id is not null;
