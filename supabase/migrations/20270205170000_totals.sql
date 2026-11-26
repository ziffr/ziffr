-- Totals (spec 0058, "Team totals", ticket #1225; GLOSSARY: Total): a Derived Metric that adds up a list of Metrics it
-- keeps. This migration is the place for them; nothing in the app or the API makes one yet.
--
-- A Metric is a Total where `total_targets` says how it has its target: its own, or its parts' added up. Its numbers are
-- shown only to people who see every part counted, unless its owner opened it (`total_opened_at`).
alter table metrics
  add column if not exists total_targets text check (total_targets in ('own', 'parts')),
  add column if not exists total_opened_at timestamptz,
  add column if not exists total_opened_by text references profiles(id) on delete set null;
-- Only a Total can be opened.
alter table metrics add constraint metrics_only_a_total_is_opened check (total_opened_at is null or total_targets is not null);
-- A Total's targets that come from its parts leave no range of its own that could stand in for them.
alter table metrics add constraint metrics_total_of_parts_has_no_range
  check (total_targets is distinct from 'parts' or (target_min is null and target_max is null and target_min_sealed is null and target_max_sealed is null));

-- Its parts, each counting from a first period and, once ended, up to a last one.
create table total_parts (
  total_id int not null references metrics(id) on delete cascade,
  -- No action, so a Metric a Total names cannot be deleted, while a Workspace's deletion still takes both with it.
  part_id int not null references metrics(id),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- The first day of the first period it counts in, and of the last one.
  first_period date not null,
  last_period date check (last_period >= first_period),
  added_at timestamptz not null default now(),
  primary key (total_id, part_id),
  check (total_id <> part_id)
);
create index total_parts_part_idx on total_parts (part_id);
create index total_parts_workspace_idx on total_parts (workspace_id);
-- No browser role has any grant: Row Level Security is on with no policy, and only the core (service role) reads and writes.
alter table total_parts enable row level security;
revoke all on table total_parts from public, anon, authenticated;
select attach_demo_guard('total_parts');

-- A part is a Metric of the same Workspace that takes values (neither calculated nor a Total), and only a Total has parts:
-- the core checks this and more; this holds however a row is written.
create or replace function total_parts_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from metrics t where t.id = new.total_id and t.workspace_id = new.workspace_id and t.total_targets is not null and t.formula is null) then
    raise exception using errcode = 'ZF455', message = 'Only a Total has parts';
  end if;
  if not exists (select 1 from metrics p where p.id = new.part_id and p.workspace_id = new.workspace_id and p.total_targets is null and p.formula is null) then
    raise exception using errcode = 'ZF456', message = 'A part is a Metric of the same Workspace that takes values';
  end if;
  return new;
end;
$$;
create trigger total_parts_check before insert or update on total_parts
  for each row execute function total_parts_check();

-- The demo's lists (spec 0051): nothing there changes a Total's parts.
insert into demo_closed_tables (table_name, reason) values
  ('total_parts', 'Nothing in the demo adds or ends the parts of a Total (spec 0058).')
on conflict (table_name) do nothing;
