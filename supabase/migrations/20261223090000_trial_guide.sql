-- The Trial Guide (ticket 193; GLOSSARY: Trial Guide, Test Metric): the few steps a new Trial Workspace opens on, from
-- picking where Ziffr asks its Owner to the first answered value. The step reached and the ways picked are kept with
-- the workspace, so reopening the guide continues where its Owner left it; the Test Metric is the one it asks for.
-- Read and written only through the core (service role), for the trial's Owner.
alter table workspaces add column trial_guide_step text
  check (trial_guide_step in ('welcome', 'where', 'connect', 'ask', 'done'));
alter table workspaces add column trial_guide_ways text[] not null default '{}'
  check (trial_guide_ways <@ array['email', 'web-form', 'slack', 'telegram']::text[] and cardinality(trial_guide_ways) <= 4);
alter table workspaces add column trial_test_metric_id integer references metrics (id) on delete set null;
