-- Workspaces and memberships (GLOSSARY: Workspace, Workspace Role; ADR 0003; spec 0001 ticket 4, #5).
-- Every row belongs to a Workspace. People (profiles), the Metric Catalog and Away dates stay global:
-- one person can be in several workspaces.

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table workspaces enable row level security;

create table memberships (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'guest')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on memberships (user_id);
alter table memberships enable row level security;

-- The demo data lives in one demo workspace with a fixed id, so seed functions and tests can find it.
insert into workspaces (id, name) values ('d3e00000-0000-4000-8000-000000000001', 'Northwind Goods (demo)');

-- PROTOTYPE: until the core sets the workspace on every write (spec 0001, tickets 10 to 14), new rows default to
-- the demo workspace. The defaults are dropped once every write path goes through the core.
do $$
declare t text;
begin
  foreach t in array array[
    'access_requests','actions','analysis_canvas','breakdown_history','breakdown_rows','dashboards','decks',
    'deliveries','delivery_preferences','group_members','groups','intake_log','metrics','observation_history',
    'observations','period_states','prompts','series_values','shares','team_templates','themes',
    'thread_messages','tokens','versions','view_links','widgets','workflows'
  ] loop
    execute format('alter table %I add column workspace_id uuid not null default %L references workspaces(id) on delete cascade', t, 'd3e00000-0000-4000-8000-000000000001');
    execute format('create index on %I (workspace_id)', t);
  end loop;
end $$;

-- What was unique across the installation is now unique per workspace.
alter table metrics drop constraint metrics_slug_key;
alter table metrics add constraint metrics_workspace_slug_key unique (workspace_id, slug);
alter table groups drop constraint groups_name_key;
alter table groups add constraint groups_workspace_name_key unique (workspace_id, name);
alter table delivery_preferences drop constraint delivery_preferences_user_id_kind_key;
alter table delivery_preferences add constraint delivery_preferences_workspace_user_kind_key unique nulls not distinct (workspace_id, user_id, kind);
drop index themes_one_default;
create unique index themes_one_default on themes (workspace_id) where is_default;

-- The demo people and their roles in the demo workspace.
create or replace function prototype_seed_memberships() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from memberships where workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  insert into memberships (workspace_id, user_id, role) values
    ('d3e00000-0000-4000-8000-000000000001', 'sara', 'owner'),
    ('d3e00000-0000-4000-8000-000000000001', 'ben', 'member'),
    ('d3e00000-0000-4000-8000-000000000001', 'anna', 'member');
end $$;
revoke execute on function prototype_seed_memberships() from public, anon, authenticated;
grant execute on function prototype_seed_memberships() to service_role;
