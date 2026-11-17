-- Half-year and annual Snapshots (spec 0020, ticket #56): a Snapshot may be of a half-year or a year as well as of a
-- week, a month or a quarter, and a dashboard may take one of either by itself. Halves and years start from the
-- workspace's year start (spec 0017); the code checks that a Snapshot's start is the first day of one.
alter table dashboard_snapshots drop constraint if exists dashboard_snapshots_period_kind_check;
alter table dashboard_snapshots add constraint dashboard_snapshots_period_kind_check
  check (period_kind in ('week', 'month', 'quarter', 'half', 'year'));

alter table dashboards drop constraint if exists dashboards_snapshot_every_check;
alter table dashboards add constraint dashboards_snapshot_every_check
  check (snapshot_every is null or snapshot_every in ('week', 'month', 'quarter', 'half', 'year'));
