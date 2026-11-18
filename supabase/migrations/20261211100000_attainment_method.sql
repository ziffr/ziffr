-- How Attainment is computed (spec 0022, ticket #130; GLOSSARY: Attainment, Metric Description). Two methods:
-- 'ratio', value ÷ target (target ÷ value for "lower is better"), what Ziffr showed up to 0.9.0, and 'distance',
-- 100 % plus the distance to the target in steps of its size. A Workspace has a default, set by Owners and Admins;
-- every existing Workspace gets 'ratio', so nothing it shows changes. A Metric may override it in its Metric
-- Description; null follows the Workspace.

alter table workspaces add column attainment_method text not null default 'ratio' check (attainment_method in ('ratio', 'distance'));
alter table metrics add column attainment_method text check (attainment_method in ('ratio', 'distance'));
