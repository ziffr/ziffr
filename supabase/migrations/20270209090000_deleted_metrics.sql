-- Deleted Metrics that past Snapshots keep (spec 0065; GLOSSARY: Metric, Snapshot). A Snapshot keeps its own copy of the
-- numbers, but who is shown a Metric in it is decided by who sees the Metric now, which nobody does once it is
-- deleted. Deleting a Metric therefore writes down who saw it at that moment: they keep seeing it in Snapshots of
-- dashboards they may still open, and nobody else gains anything. No name, value or word of the Metric is kept here.
create table deleted_metrics (
  -- No reference: the Metric is gone. Ids come from a sequence and are not used again.
  metric_id int primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- A Total that was open to everyone who saw it stays so in the copies (GLOSSARY: Total).
  total_open boolean not null default false,
  deleted_at timestamptz not null default now(),
  unique (workspace_id, metric_id)
);

create table deleted_metric_readers (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  metric_id int not null,
  user_id text not null,
  primary key (metric_id, user_id),
  foreign key (workspace_id, metric_id) references deleted_metrics(workspace_id, metric_id) on delete cascade,
  -- Whoever leaves the Workspace loses it with everything else, also if they join again later.
  foreign key (workspace_id, user_id) references memberships(workspace_id, user_id) on delete cascade
);
create index deleted_metric_readers_person_idx on deleted_metric_readers (workspace_id, user_id);

-- No browser role has any grant: Row Level Security is on with no policy, and only the core (service role) reads and writes.
alter table deleted_metrics enable row level security;
alter table deleted_metric_readers enable row level security;
revoke all on table deleted_metrics from public, anon, authenticated;
revoke all on table deleted_metric_readers from public, anon, authenticated;
select attach_demo_guard('deleted_metrics');
select attach_demo_guard('deleted_metric_readers');

-- The demo's lists (spec 0051): nothing there deletes a Metric.
insert into demo_closed_tables (table_name, reason) values
  ('deleted_metrics', 'Nothing in the demo deletes a Metric (spec 0065).'),
  ('deleted_metric_readers', 'Nothing in the demo deletes a Metric (spec 0065).')
on conflict (table_name) do nothing;
