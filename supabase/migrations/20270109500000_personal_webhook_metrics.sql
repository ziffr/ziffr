-- The Metrics a Personal Webhook listens to (spec 0037, ticket #642): up to 50 ids the person picked for
-- `value.recorded` and `value.unusual`. Only a Personal Webhook has any; a Workspace Webhook hears of every Metric it may.
-- The ids are validated by the core against the Workspace and the person's sight when picked, and the send checks them
-- again; a Metric that is deleted later leaves a stale id that no longer matches anything.
alter table webhooks add column metric_ids integer[] not null default '{}';
alter table webhooks add constraint webhooks_metric_ids_check check (cardinality(metric_ids) <= 50 and (owner_id is not null or cardinality(metric_ids) = 0));

-- Corrects the comment of 20270107520000: personal_webhook_ends.workspace_id had no foreign key, so a deleted Workspace
-- could leave rows there until the sweep cleared them; now they go with the Workspace.
delete from personal_webhook_ends where workspace_id not in (select id from workspaces);
alter table personal_webhook_ends add foreign key (workspace_id) references workspaces(id) on delete cascade;
