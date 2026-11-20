-- Usage (spec 0031, #362): how often a dashboard, deck or Metric is opened per day, and how often programs call, as
-- numbers only. There is no column for a person, a session, an address or a device, and none will be added: a test
-- (usage-counts.db.test.ts) lists the columns and fails on any new one.

-- The first day a Workspace was counted. Nothing is called "not opened for 90 days" before this plus 90 days. Existing
-- Workspaces start on the day the feature is released; a new one gets it with its first count (record_view).
alter table workspaces add column usage_since date;
update workspaces set usage_since = current_date where id <> 'd3e00000-0000-4000-8000-000000000001';

create table view_counts (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  day date not null,
  subject_kind text not null check (subject_kind in ('dashboard', 'deck', 'metric')),
  subject_id bigint not null,
  n_app integer not null default 0 check (n_app >= 0),
  n_link integer not null default 0 check (n_link >= 0),
  n_api integer not null default 0 check (n_api >= 0),
  primary key (workspace_id, day, subject_kind, subject_id)
);
alter table view_counts enable row level security;
select attach_demo_guard('view_counts');

-- Counters for calls, written in batches (the Installation's figures, never returned with the Workspace).
-- workspace_id is only there so deleting a Workspace deletes its counts.
create table usage_counts (
  day date not null,
  kind text not null check (kind in ('api_calls', 'feed_calls', 'mcp_calls')),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  n bigint not null default 0 check (n >= 0),
  primary key (day, kind, workspace_id)
);
alter table usage_counts enable row level security;
select attach_demo_guard('usage_counts');

-- Counts one open (or one read by a program) of a subject of the Workspace: an upsert, one statement, the only write.
-- Counts nothing for a subject that is not in that Workspace, so a wrong id can neither count nor fill the table.
create or replace function record_view(p_workspace uuid, p_kind text, p_subject bigint, p_via text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare ok boolean;
begin
  if p_via not in ('app', 'link', 'api') then raise exception 'record_view: unknown way %', p_via; end if;
  select case p_kind
    when 'dashboard' then exists (select 1 from dashboards where id = p_subject and workspace_id = p_workspace)
    when 'deck' then exists (select 1 from decks where id = p_subject and workspace_id = p_workspace)
    when 'metric' then exists (select 1 from metrics where id = p_subject and workspace_id = p_workspace)
    else false end into ok;
  if not ok then return; end if;
  insert into view_counts as v (workspace_id, day, subject_kind, subject_id, n_app, n_link, n_api)
  values (p_workspace, (now() at time zone 'utc')::date, p_kind, p_subject,
          (p_via = 'app')::int, (p_via = 'link')::int, (p_via = 'api')::int)
  on conflict (workspace_id, day, subject_kind, subject_id) do update set
    n_app = v.n_app + (p_via = 'app')::int, n_link = v.n_link + (p_via = 'link')::int, n_api = v.n_api + (p_via = 'api')::int;
  update workspaces set usage_since = (now() at time zone 'utc')::date where id = p_workspace and usage_since is null;
end $function$;
revoke execute on function record_view(uuid, text, bigint, text) from public, anon, authenticated;

-- Deletes counts older than 400 days (13 months); returns how many rows went.
create or replace function prune_view_counts()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n integer;
begin
  delete from view_counts where day < (now() at time zone 'utc')::date - 400;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke execute on function prune_view_counts() from public, anon, authenticated;

-- A deleted dashboard, deck or Metric takes its counts with it (the subject is polymorphic, so no foreign key).
create or replace function forget_view_counts() returns trigger
 language plpgsql set search_path to 'public' as $function$
begin
  delete from view_counts where workspace_id = old.workspace_id and subject_kind = tg_argv[0] and subject_id = old.id;
  return old;
end $function$;
create trigger forget_view_counts after delete on dashboards for each row execute function forget_view_counts('dashboard');
create trigger forget_view_counts after delete on decks for each row execute function forget_view_counts('deck');
create trigger forget_view_counts after delete on metrics for each row execute function forget_view_counts('metric');
