-- Archived Metrics (GLOSSARY: Archived Metric; spec 0029, ticket #264). An Archived Metric keeps its description,
-- values, history and Versions, asks for nothing and takes no values. `archived_at` says since when, `archived_by`
-- who put it aside; both are cleared when it is brought back.
--
-- The core refuses a value for an Archived Metric before it is written (submissions.ts), with the words "This Metric
-- is archived". The trigger below is the same rule in the database, for every other way a value is written (an
-- accepted Correction, a value that arrives while the Metric is being archived): a new value, or a changed one, is
-- refused with ZF440, and so is moving a value to another period. Removing values (deleting the Metric) and
-- changing anything else of a value (such as its approval) stay possible.
alter table metrics
  add column archived_at timestamptz,
  add column archived_by text references profiles(id) on delete set null;

-- The Metrics page lists a Workspace's Metrics by whether they are archived.
create index metrics_workspace_archived on metrics (workspace_id, (archived_at is not null));

create or replace function observations_not_archived() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value and new.metric_id = old.metric_id
    and new.period_start = old.period_start then return new; end if;
  if exists (select 1 from metrics m where m.id = new.metric_id and m.archived_at is not null) then
    raise exception using errcode = 'ZF440', message = 'This Metric is archived';
  end if;
  return new;
end;
$$;

create trigger observations_not_archived before insert or update on observations
  for each row execute function observations_not_archived();
