-- Dashboard Templates (spec 0014, GLOSSARY: Dashboard Template): a whole dashboard saved as a team template, kept
-- with the Widget Templates and slide layouts. Its body is the list of widgets with Slot numbers instead of Metrics.
alter table team_templates drop constraint if exists team_templates_kind_check;
alter table team_templates add constraint team_templates_kind_check check (kind in ('widget', 'slide', 'dashboard'));
