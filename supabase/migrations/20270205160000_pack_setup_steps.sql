-- A Set up that works in steps (spec 0058, #1181; GLOSSARY: Pack, Repeat). A large Set up makes its Metrics a few at a
-- time; the record says how far it is, so that only its own person can go on with it, only with the same choices, and
-- never twice at once. Rows written before this are finished Set ups: they take no further step, as they have no mark.
-- The tables and who may read them stay as they are.
alter table pack_setups add column input_mark text check (input_mark is null or input_mark ~ '^[0-9a-f]{64}$');
alter table pack_setups add column step integer not null default 0 check (step >= 0);
alter table pack_setups add column messages integer not null default 0 check (messages >= 0);
alter table pack_setups add column finished_at timestamptz;
