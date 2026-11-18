-- The Number Style of a workspace (spec 0022, ticket #108; GLOSSARY: Number Style): how it writes numbers, stored as
-- one of four keys, each 1234.5 written in that style. Null until an Owner or Admin picks one: the style then follows
-- the Workspace Profile's country (packages/core/src/number-style.ts), and 1,234.5 without one.
alter table workspaces add column if not exists number_style text
  check (number_style in ('1,234.5', '1.234,5', '1 234,5', '1''234.5'));
