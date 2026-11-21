-- Appearance (#505; GLOSSARY: Appearance): how a person wants Ziffr's own screens drawn. One choice per person, so it
-- follows them to every device and Workspace. `system` follows the device's light or dark setting.
alter table profiles add column appearance text not null default 'system' check (appearance in ('system', 'light', 'dark', 'contrast'));
