-- View Designs added to a Workspace (spec 0024, GLOSSARY: View Design): the designs everyone in it can choose like a
-- built-in View. Only Owners and Admins add or remove one, through the core, which checks the file (ziffr.view/1)
-- before it is stored and writes the Audit Log. A widget drawn with a design keeps its own checked copy in its
-- settings, so removing a design from the Workspace never changes a widget already placed.
create table view_designs (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- The checked design, as the core wrote it; never larger than the format allows.
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 65536),
  added_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on view_designs (workspace_id);
-- Read and written only through the core (service role); no browser reaches this table.
alter table view_designs enable row level security;

-- A widget drawn by a View Design of the Workspace.
alter table widgets drop constraint widgets_template_check;
alter table widgets add constraint widgets_template_check
  check (template in ('number','line','bars','gauge','table','forecast','correlation','matrix','drivers','ranked','share','pictogram','story-line','story','canvas','design'));
