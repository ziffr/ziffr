-- The Setup Guide's tables (spec 0052) came after the demo's allow-list (spec 0051): classify them as the allow-list asks
-- of every table with a workspace_id. They stay closed: a visitor of the demo changes nothing there. Touches no demo rows.
insert into demo_closed_tables (table_name, reason) values
  ('business_functions', 'Closed until a ticket of spec 0051 opens it: the demo is read-only for visitors.'),
  ('setup_guides', 'Closed until a ticket of spec 0051 opens it: the demo is read-only for visitors.'),
  ('setup_guide_people', 'Closed until a ticket of spec 0051 opens it: the demo is read-only for visitors.')
on conflict (table_name) do nothing;
