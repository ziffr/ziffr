-- Ziffr's own Packs come with the app (spec 0052, ticket 4; GLOSSARY: Pack): an install made from the bundle is recorded
-- with the source 'included', beside 'upload' and 'marketplace'. Only the check on pack_installs.source changes; no row does,
-- so no demo row is touched. Written by the core only (service role), which sets the source itself, never the browser.
alter table pack_installs drop constraint pack_installs_source_check;
alter table pack_installs add constraint pack_installs_source_check check (source in ('upload', 'marketplace', 'included'));
