-- Deck Templates and Workflow Templates (spec 0030, ticket #274; GLOSSARY: Deck Template, Workflow Template): kept with
-- the Widget Templates, slide layouts and Dashboard Templates. A Deck Template's body is its slides with Slot numbers
-- instead of Metrics; a Workflow Template's is a Workflow's Due Date and steps with no person in them.
alter table team_templates drop constraint if exists team_templates_kind_check;
alter table team_templates add constraint team_templates_kind_check check (kind in ('widget', 'slide', 'dashboard', 'deck', 'workflow'));
