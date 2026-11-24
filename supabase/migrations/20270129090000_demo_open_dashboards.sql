-- Open dashboards in the demo (spec 0051, ticket 9; GLOSSARY: Demo Mode, Dashboard, Widget, Pool, Theme, Version, Widget
-- Template). Opens the five tables behind creating and changing a visitor's dashboards: dashboards, widgets (a dashboard's
-- and the Pool's), versions, themes and team_templates (Widget and Dashboard Templates). Nothing changes for a visitor
-- until the Installation says so (ZIFFR_DEMO_CHANGES with ZIFFR_DEMO_ONLY, which the reset job turns into
-- demo_state.open_to_visitors): the guard still refuses every write on an Installation where the setting is off.
--
-- Rows a visitor may make in the whole demo between two Demo Resets are capped by demo_limits (the row-cap triggers of
-- ticket 5). The spec gives numbers for dashboards, widgets, saved widgets and templates (already in demo_limits); it gives
-- none for Themes and Versions, so two rows are added here as starting points for the owner: 15 Themes (as templates) and
-- 150 Versions (a Version merges the edits of ten minutes, so this only holds back a script).
-- The words of the seed stay as they are (ticket 6): the words trigger is on every one of these tables already. One column
-- joins the words here: a Theme's tokens (its colours and fonts), so a visitor cannot make the seed's Themes unreadable
-- for everyone; a Theme of their own they may shape as they like.
-- No demo row is read or written here.

insert into demo_limits (kind, max_rows, scope_column, filter_column, filter_value) values
  ('themes', 15, null, null, null),
  ('versions', 150, null, null, null)
on conflict (kind) do nothing;

insert into demo_words_columns (table_name, column_name, kind) values ('themes', 'tokens', 'words'), ('dashboards', 'theme_id', 'kept') on conflict do nothing;
-- A seeded dashboard keeps its Theme: a Theme changes how everyone sees it. (The Theme itself keeps its colours, above.)

-- The words a widget's settings hold are the Finding's (kicker, headline, subline, footnote, source), the highlighted row's label,
-- the callouts and the panels (titles, labels, notes), and the widget a free layout started from: one list, with the core's
-- (demo-words-columns.ts, DEMO_SETTING_WORD_KEYS), so the database protects what the text rules treat as words.
update demo_words_columns set keys = array['kicker', 'headline', 'subline', 'footnote', 'source', 'highlight', 'callouts', 'panels', 'canvasSeed'] where table_name = 'widgets' and column_name = 'settings';

select open_demo_table('dashboards');
select open_demo_table('widgets');
select open_demo_table('versions');
select open_demo_table('themes');
select open_demo_table('team_templates');

select apply_demo_limits('dashboards', 'dashboards');
select apply_demo_limits('widgets', 'widgets_per_dashboard');
select apply_demo_limits('widgets', 'saved_widgets');
select apply_demo_limits('versions', 'versions');
select apply_demo_limits('themes', 'themes');
select apply_demo_limits('team_templates', 'templates');
