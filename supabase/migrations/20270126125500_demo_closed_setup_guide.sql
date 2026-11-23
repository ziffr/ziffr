-- The Setup Guide's three tables (spec 0052, ticket 1) are closed to the demo's visitors: the demo never holds a row in
-- them (the demo guard refuses it), and its guided steps stay in the tour. They were made after the allow-list, so the
-- demo-read-only test found them on neither list.
insert into demo_closed_tables (table_name, reason) values
  ('setup_guides', 'The demo never has a Setup Guide: its guided steps are the tour (spec 0052).'),
  ('setup_guide_people', 'The demo never has a Setup Guide: its guided steps are the tour (spec 0052).'),
  ('business_functions', 'A person''s Business Function is not asked in the demo (spec 0052).')
on conflict (table_name) do nothing;
