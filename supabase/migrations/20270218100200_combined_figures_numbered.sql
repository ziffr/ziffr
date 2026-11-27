-- How many figures a Combined Prompt numbered when its numbers were fixed (spec 0064, decision 3; GLOSSARY: Combined
-- Prompt). Plain numbers in a reply are taken in order only when there is one for every figure the message numbered, so
-- the count must stay when a listed figure's row goes with its Metric. Adds only.
alter table deliveries add column figures_numbered int check (figures_numbered between 1 and 50);
