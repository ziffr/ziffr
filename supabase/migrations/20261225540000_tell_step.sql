-- The Workflow step Tell (spec 0032, ticket #377; GLOSSARY: Tell, Alert, Workflow): what a Tell step remembers so that it
-- tells once per crossing, and each person's "stop telling me" per Workflow. The step itself lives in the Workflow's
-- config; nothing here holds a value.

-- One row per Tell step (by the id the step carries), Metric of the Workflow: armed (quiet, waiting) or fired. A missing
-- row is armed. Per-period kinds also keep the period they fired for.
create table tell_states (
  workflow_id bigint not null references workflows(id) on delete cascade,
  step_id text not null,
  metric_id bigint not null references metrics(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  state text not null default 'armed' check (state in ('armed', 'fired')),
  fired_period date,
  fired_at timestamptz,
  primary key (workflow_id, step_id, metric_id)
);
create index tell_states_metric_idx on tell_states (metric_id);
alter table tell_states enable row level security;
select attach_demo_guard('tell_states');

-- A person who said "stop telling me" for one Workflow: no Tell step of it tells them again until they say so.
create table tell_stops (
  workflow_id bigint not null references workflows(id) on delete cascade,
  person_id text not null,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workflow_id, person_id)
);
create index tell_stops_person_idx on tell_stops (workspace_id, person_id);
alter table tell_stops enable row level security;
select attach_demo_guard('tell_stops');

-- Fires a Tell step for one Metric: true for the one call that moves it from armed to fired (a per-period kind: or
-- from another period's fired state), so two values arriving at once tell once. A step never seen is armed.
create or replace function claim_tell_fire(p_workflow bigint, p_step text, p_metric bigint, p_ws uuid, p_period date, p_per_period boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into tell_states (workflow_id, step_id, metric_id, workspace_id, state, fired_period, fired_at)
  values (p_workflow, p_step, p_metric, p_ws, 'fired', p_period, now())
  on conflict (workflow_id, step_id, metric_id) do update
    set state = 'fired', fired_period = p_period, fired_at = now()
    where tell_states.state = 'armed' or (p_per_period and tell_states.fired_period is distinct from p_period);
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke execute on function claim_tell_fire(bigint, text, bigint, uuid, date, boolean) from public, anon, authenticated;
grant execute on function claim_tell_fire(bigint, text, bigint, uuid, date, boolean) to service_role;

-- The Workflow a Tell message came from, so its email's one-click link can say "stop telling me" for that Workflow.
alter table deliveries add column tell_workflow_id bigint references workflows(id) on delete set null;
