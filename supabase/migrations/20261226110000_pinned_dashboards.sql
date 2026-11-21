-- Pinned dashboards (ticket #509; GLOSSARY: Pinned Dashboard): the dashboards a person keeps in the sidebar under
-- Dashboards, in the order they chose, per person and Workspace. A row only says "this person pinned this dashboard
-- here"; whether they may still open it is decided when it is read (the core drops a dashboard that is no longer
-- shared with them), so nothing here grants sight. Service role only: row level security stays on with no policies.
create table pinned_dashboards (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  dashboard_id bigint not null references dashboards(id) on delete cascade,
  -- The place in the person's list, counting from 0; the core keeps them 0, 1, 2… without gaps.
  position int not null check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, person_id, dashboard_id)
);
create index pinned_dashboards_person_idx on pinned_dashboards (workspace_id, person_id, position);
alter table pinned_dashboards enable row level security;
select attach_demo_guard('pinned_dashboards');

-- At most 8 per person and Workspace, also when two are pinned at once (the core checks first, with words of its own).
create or replace function pinned_dashboards_max() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('pinned_dashboards:' || new.workspace_id::text || ':' || new.person_id));
  if (select count(*) from pinned_dashboards p where p.workspace_id = new.workspace_id and p.person_id = new.person_id) >= 8 then
    raise exception using errcode = 'ZF451', message = 'At most 8 dashboards can be pinned';
  end if;
  return new;
end;
$$;
create trigger pinned_dashboards_max before insert on pinned_dashboards
  for each row execute function pinned_dashboards_max();
