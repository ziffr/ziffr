-- Snapshots (spec 0013, ticket #175; ADR 0007; GLOSSARY: Snapshot): a dashboard as it stood for one week, month or
-- quarter. `frozen` keeps its layout and the values up to the end of the period, and never changes: the database
-- refuses it, whatever code runs with the service role. `words` keeps what people write about it (the introduction,
-- each Finding's headline and sentences), written after it is taken; each change is a Version. A Snapshot starts as
-- a draft its dashboard's owner and Editors see; `shown_at` ends the draft. Deleting keeps a row without its frozen
-- part or words, so an automatic Snapshot of that period is not taken again (#176). Idempotent.
create table if not exists dashboard_snapshots (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  dashboard_id integer not null references dashboards(id) on delete cascade,
  period_kind text not null check (period_kind in ('week', 'month', 'quarter')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  label text not null check (char_length(label) between 1 and 60),
  taken_by text not null check (char_length(taken_by) between 1 and 64),
  automatic boolean not null default false,
  taken_at timestamptz not null default now(),
  shown_at timestamptz,
  shown_by text check (char_length(shown_by) <= 64),
  words_changed_at timestamptz,
  frozen jsonb check (frozen is null or (jsonb_typeof(frozen) = 'object' and pg_column_size(frozen) <= 8000000)),
  words jsonb not null default '{}'::jsonb check (jsonb_typeof(words) = 'object' and pg_column_size(words) <= 400000),
  deleted_at timestamptz,
  deleted_by text check (char_length(deleted_by) <= 64)
);
-- One Snapshot per dashboard and period while it exists; a deleted one may be taken again by hand.
create unique index if not exists dashboard_snapshots_one_per_period on dashboard_snapshots (dashboard_id, period_kind, period_start) where deleted_at is null;
create index if not exists dashboard_snapshots_dashboard_idx on dashboard_snapshots (workspace_id, dashboard_id, period_start desc);
alter table dashboard_snapshots enable row level security;

-- What was taken stays as it was taken: the period, who took it and its frozen part. The frozen part only goes, with
-- the words, when the Snapshot is deleted, and a deleted Snapshot does not come back.
create or replace function dashboard_snapshots_keep_frozen() returns trigger language plpgsql as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.dashboard_id is distinct from old.dashboard_id
    or new.period_kind is distinct from old.period_kind or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end or new.taken_by is distinct from old.taken_by
    or new.taken_at is distinct from old.taken_at or new.automatic is distinct from old.automatic then
    raise exception 'A Snapshot keeps its period and who took it.' using errcode = 'ZF403';
  end if;
  if old.deleted_at is not null and (new.deleted_at is null or new.frozen is not null) then
    raise exception 'A deleted Snapshot stays deleted.' using errcode = 'ZF403';
  end if;
  if new.frozen is distinct from old.frozen and not (new.frozen is null and new.deleted_at is not null) then
    raise exception 'A Snapshot''s numbers never change.' using errcode = 'ZF403';
  end if;
  return new;
end;
$$;

drop trigger if exists dashboard_snapshots_keep_frozen on dashboard_snapshots;
create trigger dashboard_snapshots_keep_frozen before update on dashboard_snapshots for each row execute function dashboard_snapshots_keep_frozen();

-- A Snapshot's words keep Versions like everything else people write.
alter table versions drop constraint if exists versions_object_type_check;
alter table versions add constraint versions_object_type_check
  check (object_type in ('widget','dashboard','deck','master','metric','template','theme','workflow','snapshot'));

-- A Snapshot, and a Version of its words, always land in the workspace of its dashboard, whatever the writer passed
-- (ADR 0003): the same function as before, with these two cases added.
create or replace function workspace_from_parent() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ws uuid;
begin
  case tg_table_name
    when 'observations', 'actions', 'prompts', 'period_states', 'series_values', 'tokens', 'analysis_canvas' then
      select workspace_id into ws from metrics where id = new.metric_id;
    when 'observation_history' then
      select workspace_id into ws from metrics where id = new.metric_id;
    when 'breakdown_rows', 'breakdown_history' then
      select workspace_id into ws from observations where id = new.observation_id;
    when 'thread_messages' then
      select workspace_id into ws from actions where id = new.action_id;
    when 'group_members' then
      select workspace_id into ws from groups where id = new.group_id;
    when 'widgets' then
      if new.dashboard_id is not null then select workspace_id into ws from dashboards where id = new.dashboard_id; end if;
    when 'dashboard_snapshots' then
      select workspace_id into ws from dashboards where id = new.dashboard_id;
    when 'deliveries' then
      if new.action_id is not null then select workspace_id into ws from actions where id = new.action_id;
      elsif new.prompt_id is not null then select workspace_id into ws from prompts where id = new.prompt_id; end if;
    when 'intake_log' then
      if new.metric_id is not null then select workspace_id into ws from metrics where id = new.metric_id; end if;
    when 'shares', 'versions', 'view_links', 'access_requests' then
      case new.object_type
        when 'metric' then select workspace_id into ws from metrics where id = new.object_id;
        when 'dashboard' then select workspace_id into ws from dashboards where id = new.object_id;
        when 'deck' then select workspace_id into ws from decks where id = new.object_id;
        when 'widget' then select workspace_id into ws from widgets where id = new.object_id;
        when 'template' then select workspace_id into ws from team_templates where id = new.object_id;
        when 'theme' then select workspace_id into ws from themes where id = new.object_id;
        when 'workflow' then select workspace_id into ws from workflows where id = new.object_id;
        when 'snapshot' then select workspace_id into ws from dashboard_snapshots where id = new.object_id;
        else null;
      end case;
    else null;
  end case;
  if ws is not null then new.workspace_id := ws; end if;
  return new;
end $$;

revoke all on function workspace_from_parent() from public, anon, authenticated;

drop trigger if exists workspace_from_parent on dashboard_snapshots;
create trigger workspace_from_parent before insert on dashboard_snapshots for each row execute function workspace_from_parent();
