-- The Setup Guide (spec 0052, ticket 1; GLOSSARY: Setup Guide, Business Function, Trial Guide, Workspace Profile).
-- Its state is three small tables and one column, read and written only through the core (service role): the
-- Workspace's own progress (`setup_guides`, shared by its Owners and Admins), each person's side of it
-- (`setup_guide_people`: first seen, hidden, their own skipped steps) and a person's Business Function in one
-- Workspace (`business_functions`, seen only by the person and the Workspace's Owners and Admins, by the core's
-- rules). A step's tick is never stored: the core works it out from what the Workspace has. The demo Workspace never
-- holds a row (the demo guard). The Trial Guide's state moves into `setup_guides`; its old columns stay, unused.

create table setup_guides (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- 'scratch' is the one explicit choice ("Explore on my own"); a Pack is read from the installs, never chosen here.
  starting_point text check (starting_point in ('scratch', 'pack')),
  -- Set null when the Metric is deleted: the step asks for another one.
  first_metric_id integer references metrics(id) on delete set null,
  skipped text[] not null default '{}'
    check (skipped <@ array['about', 'start', 'ways', 'first_metric', 'team']::text[]),
  updated_at timestamptz not null default now()
);

create table setup_guide_people (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  first_seen_at timestamptz,
  hidden_at timestamptz,
  skipped text[] not null default '{}' check (skipped <@ array['about', 'ways']::text[]),
  primary key (workspace_id, person_id)
);

create table business_functions (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  function text not null check (function in ('sales', 'marketing', 'finance', 'operations',
    'customer_support', 'people', 'product_engineering', 'management', 'other')),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);

-- Deny by default: no role but the service role reads or writes them, so no browser can reach them through the API.
alter table setup_guides enable row level security;
alter table setup_guide_people enable row level security;
alter table business_functions enable row level security;
revoke all on table setup_guides, setup_guide_people, business_functions from public, anon, authenticated;
select attach_demo_guard('setup_guides');
select attach_demo_guard('setup_guide_people');
select attach_demo_guard('business_functions');

-- When the Workspace's clock was last saved, so a Workspace that really is in UTC can tick "About you" by saving it.
alter table workspaces add column clock_set_at timestamptz;

-- A membership that ends takes the person's side of the guide and their Business Function with it, so a function never
-- outlives the membership.
create function end_setup_guide_person() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from setup_guide_people where workspace_id = old.workspace_id and person_id = old.user_id;
  delete from business_functions where workspace_id = old.workspace_id and person_id = old.user_id;
  return old;
end $$;
create trigger end_setup_guide_person after delete on memberships for each row execute function end_setup_guide_person();

-- Skips a step for the Workspace in one statement, so two Admins skipping at once lose neither. The step is checked
-- against the list by the column's CHECK. Returns whether this call added it.
create function setup_guide_skip(p_workspace uuid, p_step text) returns boolean language plpgsql security definer set search_path = public as $$
declare added int;
begin
  update setup_guides set skipped = array_append(skipped, p_step), updated_at = now()
    where workspace_id = p_workspace and not (skipped @> array[p_step]);
  get diagnostics added = row_count;
  return added > 0;
end $$;
revoke execute on function setup_guide_skip(uuid, text) from public, anon, authenticated;
grant execute on function setup_guide_skip(uuid, text) to service_role;

-- The same for one person's own steps.
create function setup_guide_person_skip(p_workspace uuid, p_person text, p_step text) returns boolean language plpgsql security definer set search_path = public as $$
declare added int;
begin
  insert into setup_guide_people (workspace_id, person_id) values (p_workspace, p_person) on conflict do nothing;
  update setup_guide_people set skipped = array_append(skipped, p_step)
    where workspace_id = p_workspace and person_id = p_person and not (skipped @> array[p_step]);
  get diagnostics added = row_count;
  return added > 0;
end $$;
revoke execute on function setup_guide_person_skip(uuid, text, text) from public, anon, authenticated;
grant execute on function setup_guide_person_skip(uuid, text, text) to service_role;

-- Whether a Contact is a Submitter of at least one Metric (a field worker who answers by Telegram is a team of its own
-- kind): one existence check, so a Workspace with thousands of Contacts reads no list.
create function setup_guide_contact_submits(p_workspace uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tokens t join contacts c on c.workspace_id = t.workspace_id and c.person_id = t.submitter_id
    where t.workspace_id = p_workspace and t.stands_in_for is null)
$$;
revoke execute on function setup_guide_contact_submits(uuid) from public, anon, authenticated;
grant execute on function setup_guide_contact_submits(uuid) to service_role;

-- Moving the Trial Guide's state (spec 0052), as a function so a test can run it on Workspaces made for it; it only adds
-- rows that are missing, so running it again changes nothing. Every Workspace that had a guide gets a row: its Test Metric is the First
-- Metric, the guide is finished when it was finished or had reached Done, a trial starts from its Test Metric (which
-- counts as a start), and the Owner has seen the guide. `trial_guide_ways` needs no copy: the guide wrote the same
-- choice into the Owner's Delivery Preference. The demo has no trial columns set, so no demo row is touched.
create function setup_guide_move_trial_state() returns void language plpgsql security definer set search_path = public as $$
begin
  insert into setup_guides (workspace_id, started_at, finished_at, starting_point, first_metric_id)
    select w.id, coalesce(w.created_at, now()),
           coalesce(w.trial_guide_finished_at, case when w.trial_guide_step = 'done' then now() end),
           'scratch', w.trial_test_metric_id
    from workspaces w
    where w.trial_guide_step is not null and w.id <> 'd3e00000-0000-4000-8000-000000000001'
    on conflict do nothing;
  insert into setup_guide_people (workspace_id, person_id, first_seen_at)
    select m.workspace_id, m.user_id, now()
    from memberships m join workspaces w on w.id = m.workspace_id join setup_guides g on g.workspace_id = m.workspace_id
    where m.role = 'owner' and w.trial_guide_step is not null
    on conflict do nothing;
end $$;
revoke execute on function setup_guide_move_trial_state() from public, anon, authenticated;
grant execute on function setup_guide_move_trial_state() to service_role;
select setup_guide_move_trial_state();

comment on column workspaces.trial_guide_step is 'Unused since spec 0052; see setup_guides.';
comment on column workspaces.trial_guide_ways is 'Unused since spec 0052; see setup_guides.';
comment on column workspaces.trial_guide_finished_at is 'Unused since spec 0052; see setup_guides.';
