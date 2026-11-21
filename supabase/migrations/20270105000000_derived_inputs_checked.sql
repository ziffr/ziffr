-- A Derived Metric made through createDerivedMetric (ticket #619) is calculated only from Metrics its owner may share
-- (owns or edits). `inputs_checked` marks those, so the rule also applies later: it shows no values while its owner
-- no longer may share one of its inputs. Derived Metrics made before (Packs, the demo's seed) are not marked and keep
-- working as they did. Add-only.
alter table metrics add column inputs_checked boolean not null default false;
