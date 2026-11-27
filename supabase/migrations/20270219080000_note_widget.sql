-- The Note Widget (#1359; GLOSSARY: Note Widget): a widget that holds a person's own words and reads no Metric. The
-- database keeps the new view, never with a Metric (a note's words are not checked against anyone's sight of one), and
-- the demo counts its text among a seeded widget's words. Its text sits in `settings.note`, sealed with the
-- Workspace Key like a Finding's words (sealed-words.ts).
alter table widgets drop constraint widgets_template_check;
alter table widgets add constraint widgets_template_check
  check (template in ('number','line','bars','gauge','table','forecast','correlation','matrix','drivers','scoreboard','progress','stacked','pareto','slope','running-total','bump','heatmap','ranked','share','pictogram','story-line','story','canvas','note','design'));
alter table widgets add constraint widgets_note_draws_no_metric check (template <> 'note' or cardinality(metric_ids) = 0);

-- One list with the core's (demo-words-columns.ts, DEMO_SETTING_WORD_KEYS). Only this table of rules is written: no
-- demo row is read or changed.
update demo_words_columns set keys = array['kicker', 'headline', 'subline', 'footnote', 'source', 'note', 'highlight', 'callouts', 'panels', 'canvasSeed'] where table_name = 'widgets' and column_name = 'settings';
