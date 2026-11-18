-- The Answer Languages of a workspace (spec 0022, ticket #118; GLOSSARY: Answer Language): the languages the words
-- in an answer ("last week", "letzte Woche") are tried in. Null until an Owner or Admin chooses: they then follow the
-- Workspace Profile's country, English plus its languages (packages/core/src/numbers/languages.ts). The check holds
-- the shape only, one to twenty language codes, so adding a language needs no migration; the core keeps known ones.
alter table workspaces add column if not exists answer_languages text[]
  check (answer_languages is null or (cardinality(answer_languages) between 1 and 20
    and array_to_string(answer_languages, ',') ~ '^[a-z]{2,3}(,[a-z]{2,3})*$'));
