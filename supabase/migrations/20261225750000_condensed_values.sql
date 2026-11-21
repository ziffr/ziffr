-- Condensed Values (spec 0033, ticket #380; GLOSSARY: Condensed Value, Retention): the one value that stands for a longer
-- period after the periods inside it were condensed. This is the table, its refusal of new values for a condensed
-- period, and nothing that makes one (the setting and the job are later tickets).
-- `payload` holds the numbers as JSON ({"sum", "last", "target"}: exact decimals as text) and is sealed with the
-- Workspace Key like the other values (spec 0028), bound to the row, so the core makes the id first (a uuid). The span's
-- dates, how many periods it held and whether it was locked say little alone and stay readable, so the database can
-- filter and refuse by them. Service role only: row level security stays on with no policies.
create table condensed_values (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  metric_id int not null references metrics(id) on delete cascade,
  -- The span's first and last day: a Metric period belongs to the span its first day lies in (a week to its Monday's month).
  period_start date not null,
  period_end date not null,
  span text not null check (span in ('week', 'month', 'quarter', 'year')),
  -- How many Metric periods had a value, and how many the span has in all.
  held int not null check (held >= 1),
  of int not null check (of >= held),
  locked boolean not null default false,
  -- Sealed. 6,000 characters leave room for the sealing of a sum, a last value and a Target.
  payload text not null check (char_length(payload) <= 6000),
  -- The day it was made: "This period was condensed on 3 December 2026".
  condensed_on date not null default current_date,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  -- Spans of one Metric never overlap, so no value is counted twice; a later span nests only by condensing again.
  unique (metric_id, period_start)
);
create index condensed_values_cover_idx on condensed_values (metric_id, period_start, period_end);
create index condensed_values_workspace_idx on condensed_values (workspace_id);
alter table condensed_values enable row level security;
select attach_demo_guard('condensed_values');

-- A period inside a condensed span takes no more values, as if locked for good: a new value, or a changed one, is
-- refused with ZF441, and so is moving a value to such a period. The core refuses it first with words of its own
-- (submissions.ts); this is the same rule for every other way a value is written. Changing anything else of a value
-- (its approval) and removing values (the job) stay possible.
create or replace function observations_not_condensed() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value and new.metric_id = old.metric_id
    and new.period_start = old.period_start then return new; end if;
  if exists (select 1 from condensed_values c where c.metric_id = new.metric_id and new.period_start between c.period_start and c.period_end) then
    raise exception using errcode = 'ZF441', message = 'This period was condensed';
  end if;
  return new;
end;
$$;

create trigger observations_not_condensed before insert or update on observations
  for each row execute function observations_not_condensed();
