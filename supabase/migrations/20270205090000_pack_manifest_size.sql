-- A Pack's manifest as installed (specs 0030 and 0039, GLOSSARY: Pack) holds its logo, at most 128,000 bytes and so up
-- to about 171,000 characters as a data address, and the entries its n8n templates fill. The table kept at most 16,384
-- bytes of it, so a Pack with a logo over about 11 KB passed every check and was then refused by install_pack and
-- update_pack (#1234). 262,144 bytes hold the largest manifest the Pack format allows. Only the check changes; no row
-- does.
alter table pack_installs drop constraint pack_installs_manifest_check;
alter table pack_installs add constraint pack_installs_manifest_check check (jsonb_typeof(manifest) = 'object' and octet_length(manifest::text) <= 262144);
