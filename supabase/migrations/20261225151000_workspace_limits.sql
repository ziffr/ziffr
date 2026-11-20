-- Workspace Limits (GLOSSARY: Workspace Limit, Size; spec 0029, ticket #265). The most Metrics a Workspace may hold,
-- Archived Metrics not counted, Derived Metrics counted. Unlimited unless someone sets it: an Installation Admin on
-- the Installation Settings page, or (ticket 4) Ziffr Cloud through its API. A Workspace without a row of its own has
-- the Installation's default, which the core keeps in installation_limit_default (the setting may live in the
-- server's environment, which the database cannot read).
--
-- The rule over the limit, the same as workspace-limits.ts (a test runs both): a Workspace may go over its limit by
-- 10 %, at least one Metric. The first time a Metric takes it over, workspaces.over_limit_since is set; for 14 days
-- after that new Metrics may be made up to that room. After the 14 days no new Metric may be made while it holds as
-- many Metrics as its limit or more. Once it holds no more than its limit, over_limit_since is cleared. Values,
-- Prompts and everything else never stop: only making a Metric, and bringing an Archived Metric back, wait.

create table workspace_limits (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  -- null: no limit for this Workspace, whatever the default.
  metrics int check (metrics between 1 and 1000000),
  label text check (char_length(label) between 1 and 30),
  -- A coming change shown to Owners and Admins, such as "Changes to Team on 1 December 2026".
  next_label text check (char_length(next_label) between 1 and 30),
  next_on date,
  set_by text not null check (set_by in ('installation_admin', 'cloud')),
  -- The Installation Admin who set it; null when Ziffr Cloud did.
  set_by_person text references profiles(id) on delete set null,
  set_at timestamptz not null default now()
);
alter table workspace_limits enable row level security;
revoke all on table workspace_limits from public, anon, authenticated;

-- The Installation's default as the core last found it in effect (ZIFFR_DEFAULT_METRICS_LIMIT, ..._LABEL): one row.
create table installation_limit_default (
  only_row boolean primary key default true check (only_row),
  metrics int check (metrics between 1 and 1000000),
  label text check (char_length(label) between 1 and 30),
  updated_at timestamptz not null default now()
);
alter table installation_limit_default enable row level security;
revoke all on table installation_limit_default from public, anon, authenticated;
insert into installation_limit_default (only_row) values (true);

alter table workspaces add column over_limit_since timestamptz;

-- The days of grace and the room over the limit, in one place for the database.
create or replace function workspace_limit_room(p_limit int) returns int
language sql immutable as $$ select p_limit + greatest(1, p_limit / 10) $$;

-- What one more Metric does: 'allow' (it fits the limit), 'over' (it takes the Workspace over its limit, within the
-- room and the grace) or 'refuse'. p_count is the Metrics it holds now, p_since when it went over (or null).
create or replace function workspace_limit_rule(p_count int, p_limit int, p_since timestamptz, p_now timestamptz)
returns text language sql immutable as $$
  select case
    when p_limit is null or p_count + 1 <= p_limit then 'allow'
    when p_count + 1 > workspace_limit_room(p_limit) then 'refuse'
    when p_since is not null and p_now >= p_since + interval '14 days' then 'refuse'
    else 'over'
  end
$$;

-- The limit a Workspace has: its own row, else the default; no row for no limit at all. The demo has none, and a
-- Trial Workspace keeps spec 0021's own rule (25 Metrics, metrics_per_trial) instead of the default while it runs.
create or replace function workspace_limit_of(p_workspace uuid) returns table (metrics int, label text)
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from workspace_limits l where l.workspace_id = p_workspace) then
    return query select l.metrics, l.label from workspace_limits l where l.workspace_id = p_workspace;
  elsif p_workspace <> 'd3e00000-0000-4000-8000-000000000001'::uuid
    and not exists (select 1 from workspaces w where w.id = p_workspace and w.trial_ends_at is not null) then
    return query select d.metrics, d.label from installation_limit_default d;
  end if;
end $$;

-- The Metrics a Workspace holds for its limit: every one that is not archived.
create or replace function workspace_metric_count(p_workspace uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from metrics where workspace_id = p_workspace and archived_at is null
$$;

-- Sets or clears over_limit_since by the count and limit now: set (if not yet) when it holds more than its limit,
-- cleared when it holds no more. Called after every change that moves either.
create or replace function workspace_limit_settle(p_workspace uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
begin
  -- The Workspace's row first, as the trigger before a new Metric takes it, so a count and a creation never cross.
  perform 1 from workspaces where id = p_workspace for update;
  select metrics into v_limit from workspace_limit_of(p_workspace);
  if v_limit is not null and workspace_metric_count(p_workspace) > v_limit then
    update workspaces set over_limit_since = now() where id = p_workspace and over_limit_since is null;
  else
    update workspaces set over_limit_since = null where id = p_workspace and over_limit_since is not null;
  end if;
end $$;

-- Before a Metric is made, or an Archived Metric brought back: the Workspace's row is locked first, so parallel
-- creations wait for each other and cannot all pass the room. Refused with ZF441 (the core says why).
create or replace function metrics_within_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_since timestamptz;
  v_count int;
  v_rule text;
begin
  -- An update counts only when it brings an Archived Metric back or moves a Metric into another Workspace.
  if tg_op = 'UPDATE' and not (old.archived_at is not null and new.archived_at is null)
    and new.workspace_id is not distinct from old.workspace_id then return new; end if;
  if new.archived_at is not null then return new; end if;
  select over_limit_since into v_since from workspaces where id = new.workspace_id for update;
  select metrics into v_limit from workspace_limit_of(new.workspace_id);
  if v_limit is null then return new; end if;
  v_count := workspace_metric_count(new.workspace_id);
  v_rule := workspace_limit_rule(v_count, v_limit, v_since, now());
  if v_rule = 'refuse' then
    raise exception using errcode = 'ZF441', message = 'workspace_limit', detail = v_count::text || '/' || v_limit::text;
  end if;
  if v_rule = 'over' and v_since is null then
    update workspaces set over_limit_since = now() where id = new.workspace_id;
  end if;
  return new;
end $$;

create trigger metrics_within_limit before insert or update of archived_at, workspace_id on metrics
  for each row execute function metrics_within_limit();

-- After a Metric is deleted or archived: back under the limit clears the grace.
create or replace function metrics_limit_settle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform workspace_limit_settle(old.workspace_id);
  return null;
end $$;

create trigger metrics_limit_settle after delete or update of archived_at, workspace_id on metrics
  for each row execute function metrics_limit_settle();

-- A limit set, changed or removed: a limit below the count starts the grace, one above it ends it.
create or replace function workspace_limits_settle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform workspace_limit_settle(coalesce(new.workspace_id, old.workspace_id));
  return null;
end $$;

create trigger workspace_limits_settle after insert or update or delete on workspace_limits
  for each row execute function workspace_limits_settle();

-- The default changed: every Workspace on it settles again.
create or replace function installation_limit_default_settle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
begin
  for v_ws in select w.id from workspaces w where not exists (select 1 from workspace_limits l where l.workspace_id = w.id) loop
    perform workspace_limit_settle(v_ws);
  end loop;
  return null;
end $$;

create trigger installation_limit_default_settle after update on installation_limit_default
  for each row when (old.metrics is distinct from new.metrics) execute function installation_limit_default_settle();

-- The Workspaces with their count and limit, for the Installation Admin's list: name and numbers, nothing else.
create or replace function workspace_limits_overview() returns table (
  workspace_id uuid, name text, metrics int, limit_metrics int, label text, own boolean, set_by text, set_by_person text, set_at timestamptz, over_limit_since timestamptz
) language sql stable security definer set search_path = public as $$
  select w.id, w.name, workspace_metric_count(w.id), lim.metrics, lim.label, l.workspace_id is not null, l.set_by, l.set_by_person, l.set_at, w.over_limit_since
  from workspaces w
  left join workspace_limits l on l.workspace_id = w.id
  left join lateral workspace_limit_of(w.id) lim on true
  where w.id <> 'd3e00000-0000-4000-8000-000000000001'::uuid
  order by lower(w.name), w.id
$$;

revoke execute on function workspace_limit_of(uuid), workspace_metric_count(uuid), workspace_limit_settle(uuid), workspace_limits_overview() from public, anon, authenticated;
grant execute on function workspace_limit_of(uuid), workspace_metric_count(uuid), workspace_limit_settle(uuid), workspace_limits_overview() to service_role;
