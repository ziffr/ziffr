-- PROTOTYPE, wipe me. Versioning (GLOSSARY: Version) and append-only numbers.

-- Versions of what people build: widgets, dashboards, decks, masters, metric descriptions.
create table versions (
  id bigserial primary key,
  object_type text not null check (object_type in ('widget','dashboard','deck','master','metric')),
  object_id int not null,
  version int not null,
  snapshot jsonb not null,
  author_id text references profiles(id),
  message text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (object_type, object_id, version)
);
create index on versions (object_type, object_id, version desc);
alter table versions enable row level security;

-- Numbers are append-only: every value an observation had is kept, whichever path changes it.
create table observation_history (
  id bigserial primary key,
  observation_id bigint not null,
  metric_id int not null,
  period_start date not null,
  value numeric not null,
  submitter_id text,
  source text,
  recorded_at timestamptz not null,
  superseded_at timestamptz not null default now(),
  change text not null check (change in ('updated','deleted'))
);
create index on observation_history (metric_id, period_start);
alter table observation_history enable row level security;

create or replace function keep_observation_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' or old.value is distinct from new.value then
    insert into observation_history (observation_id, metric_id, period_start, value, submitter_id, source, recorded_at, change)
      values (old.id, old.metric_id, old.period_start, old.value, old.submitter_id, old.source, old.created_at, case tg_op when 'UPDATE' then 'updated' else 'deleted' end);
  end if;
  return coalesce(new, old);
end;
$$;
create trigger observation_history before update or delete on observations
  for each row execute function keep_observation_history();

create table breakdown_history (
  id bigserial primary key,
  observation_id bigint not null,
  label text not null,
  value numeric not null,
  superseded_at timestamptz not null default now()
);
alter table breakdown_history enable row level security;
create or replace function keep_breakdown_history() returns trigger
language plpgsql as $$
begin
  insert into breakdown_history (observation_id, label, value) values (old.observation_id, old.label, old.value);
  return old;
end;
$$;
create trigger breakdown_history before delete on breakdown_rows
  for each row execute function keep_breakdown_history();
