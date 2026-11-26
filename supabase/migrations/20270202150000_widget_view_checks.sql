-- Every built-in View (GLOSSARY: View, Widget Template) can be saved to a widget again (#1154). Scoreboard, Progress
-- against target, Stacked bars over time, Pareto, Slope chart, Running total, Bump chart and Heatmap were added to the
-- app without being added here, so saving one failed. The list is every id of TEMPLATES in
-- packages/core/src/widget-templates.ts; a database test (widget-views.db.test.ts) places each of them, so a new View
-- needs a migration like this one.
alter table widgets drop constraint widgets_template_check;
alter table widgets add constraint widgets_template_check
  check (template in ('number','line','bars','gauge','table','forecast','correlation','matrix','drivers','scoreboard','progress','stacked','pareto','slope','running-total','bump','heatmap','ranked','share','pictogram','story-line','story','canvas','design'));
