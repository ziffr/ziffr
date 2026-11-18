-- The unit's side (spec 0022, ticket #110; GLOSSARY: Metric Description). A Metric's unit stands before the number
-- ("$1,200") or after it ("1.200 €"), and the display reads only the unit, its side, the decimals and the Number
-- Style: `format` no longer adds a "€" or "%" of its own. So that every Metric shows exactly what it showed before,
-- the units the old display added are written into the Metrics that had none.

alter table metrics add column unit_position text not null default 'after' check (unit_position in ('before', 'after'));
alter table catalog_metrics add column unit_position text not null default 'after' check (unit_position in ('before', 'after'));

update metrics set unit = '€' where unit = '' and format = 'currency';
update metrics set unit = '%' where unit = '' and format = 'percent';
update catalog_metrics set unit = '€' where unit = '' and format = 'currency';
update catalog_metrics set unit = '%' where unit = '' and format = 'percent';
