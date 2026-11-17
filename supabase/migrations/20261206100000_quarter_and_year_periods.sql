-- Quarterly and yearly Metrics (spec 0017, ticket #40; GLOSSARY: Period, Fiscal Year): a Metric, and a catalog
-- Metric, may have a value per quarter or per year besides a day, week or month. `period_start` stays the first day,
-- of a quarter or year that starts from the workspace's year start (`workspaces.year_start_month`).
alter table metrics drop constraint if exists metrics_period_check;
alter table metrics add constraint metrics_period_check check (period in ('day', 'week', 'month', 'quarter', 'year'));
alter table catalog_metrics drop constraint if exists catalog_metrics_period_check;
alter table catalog_metrics add constraint catalog_metrics_period_check check (period in ('day', 'week', 'month', 'quarter', 'year'));
