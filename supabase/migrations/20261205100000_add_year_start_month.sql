-- The month a workspace's Fiscal Year starts in (spec 0017, ticket #39; GLOSSARY: Fiscal Year): 1 is January, the
-- calendar year every workspace had so far. Quarters, half-years and years start from it everywhere in Ziffr.
alter table workspaces add column if not exists year_start_month smallint not null default 1
  check (year_start_month between 1 and 12);
