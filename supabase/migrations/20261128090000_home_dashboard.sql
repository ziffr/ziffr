-- The dashboard a person's Home opens, per workspace (spec 0010, ticket #146; GLOSSARY: Dashboard). Chosen by the
-- person; a dashboard that is deleted clears it, and one they can no longer open is skipped by the core.
alter table memberships add column if not exists home_dashboard_id bigint references dashboards (id) on delete set null;
