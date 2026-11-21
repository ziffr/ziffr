-- Retention, the setting (spec 0033, ticket #381; GLOSSARY: Retention): how long a Metric's values are kept and what
-- then happens. Three columns and nothing that acts on them: the preview, the confirmation and the 7-day delay are the
-- core's (retention-setting.ts), the daily job that condenses or deletes is a later ticket (#382).
-- `retention` is the Retention in force: null for none (the default, so nothing is ever lost unasked), else
-- {"keep_months", "then": "condense" | "delete", "into"?}. `retention_pending` is one confirmed but not yet started:
-- {"retention", "starts_on", "confirmed_on", "set_by", "told", "reminded"}, cancelled by anyone who may set it until
-- `starts_on` (the 8th day), when the job makes it the Retention in force. `default_retention` on the Workspace is
-- copied into a new Metric at its creation, with no link back. The core checks every shape (parseRetention); the
-- database only bounds the size, so no row can hold more than a setting.
alter table metrics add column retention jsonb
  check (retention is null or (jsonb_typeof(retention) = 'object' and pg_column_size(retention) <= 400));
alter table metrics add column retention_pending jsonb
  check (retention_pending is null or (jsonb_typeof(retention_pending) = 'object' and pg_column_size(retention_pending) <= 800));
alter table workspaces add column default_retention jsonb
  check (default_retention is null or (jsonb_typeof(default_retention) = 'object' and pg_column_size(default_retention) <= 400));
