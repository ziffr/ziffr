-- Automatic Snapshots (spec 0013, ticket #176; GLOSSARY: Snapshot, Lock): a dashboard may take a Snapshot of every
-- week, month or quarter by itself, on the clock that runs Workflows. It is taken as soon as every Metric on it is
-- Locked for every Metric period inside the Snapshot period, or `snapshot_wait_days` days after the period ends,
-- whichever comes first. Null means only by hand. Idempotent.
alter table dashboards add column if not exists snapshot_every text;
alter table dashboards add column if not exists snapshot_wait_days integer not null default 5;
do $$ begin
  alter table dashboards add constraint dashboards_snapshot_every_check check (snapshot_every is null or snapshot_every in ('week', 'month', 'quarter'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table dashboards add constraint dashboards_snapshot_wait_days_check check (snapshot_wait_days between 0 and 60);
exception when duplicate_object then null; end $$;
