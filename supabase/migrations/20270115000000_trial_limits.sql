-- Trial Limits as numbers (spec 0040, ticket 2; GLOSSARY: Trial Limit). What the database enforces for a Trial
-- Workspace (Metrics, keys, Feeds, assistants, View Links) was a literal in each trigger. It is one row now, which the
-- core writes from the Installation Settings in effect (the environment, the page, Ziffr Cloud's signed call), so a change
-- needs no migration and applies to every running trial at once. The triggers read the row and fall back to the
-- defaults when it is missing. Counts are still taken under the Workspace's row lock, so requests at once wait for each
-- other and cannot all pass. Lowering a number never deletes anything: only the next insert is refused.
create table trial_limits (
  only_row boolean primary key default true check (only_row),
  metrics int not null default 25 check (metrics between 5 and 100),
  keys int not null default 2 check (keys between 1 and 10),
  feeds int not null default 2 check (feeds between 1 and 10),
  assistants int not null default 1 check (assistants between 1 and 5),
  view_links int not null default 5 check (view_links between 0 and 20),
  updated_at timestamptz not null default now()
);
alter table trial_limits enable row level security;
revoke all on table trial_limits from public, anon, authenticated;
insert into trial_limits (only_row) values (true);

-- Which Installation Settings Ziffr Cloud wrote through its signed API: the page shows them read-only, "Set by Ziffr
-- Cloud". A row the page wrote has none.
alter table installation_settings add column set_by text check (set_by = 'cloud');

-- The numbers in effect, as one function the triggers share.
create or replace function trial_limit_numbers() returns trial_limits
language sql stable security definer set search_path = public as $$
  select coalesce((select t from trial_limits t where only_row), row(true, 25, 2, 2, 1, 5, now())::trial_limits)
$$;
revoke execute on function trial_limit_numbers() from public, anon, authenticated;

-- Replaces the functions of 20261209110000 (Metrics) and 20261209130000, 20261220090000, 20261225231000 (keys, Feeds).
create or replace function metrics_per_trial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from workspaces where id = new.workspace_id and trial_ends_at is not null for update;
  if not found then return new; end if;
  if (select count(*) from metrics where workspace_id = new.workspace_id) >= (trial_limit_numbers()).metrics then
    raise exception using errcode = 'ZF430', message = 'metrics_per_trial';
  end if;
  return new;
end $$;

create or replace function access_keys_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
declare ends timestamptz; lim trial_limits := trial_limit_numbers();
begin
  select trial_ends_at into ends from workspaces where id = new.workspace_id for update;
  if ends is null then return new; end if;
  new.requested_expires_on := new.expires_on;
  new.expires_on := least(new.expires_on, (ends at time zone 'UTC')::date);
  if new.kind = 'assistant' then
    if (select count(*) from access_keys where workspace_id = new.workspace_id and kind = 'assistant' and revoked_at is null and expires_on >= current_date) >= lim.assistants then
      raise exception using errcode = 'ZF434', message = 'assistants_per_trial';
    end if;
  elsif new.feed_id is null then
    if (select count(*) from access_keys where workspace_id = new.workspace_id and feed_id is null and kind = 'program' and revoked_at is null and expires_on >= current_date) >= lim.keys then
      raise exception using errcode = 'ZF431', message = 'access_keys_per_trial';
    end if;
  elsif (select count(*) from access_keys where feed_id = new.feed_id and revoked_at is null and expires_on >= current_date) >= lim.feeds then
    raise exception using errcode = 'ZF432', message = 'feed_keys_per_feed';
  end if;
  return new;
end $$;

create or replace function feeds_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from workspaces where id = new.workspace_id and trial_ends_at is not null for update;
  if not found then return new; end if;
  if (select count(*) from feeds where workspace_id = new.workspace_id and deleted_at is null) >= (trial_limit_numbers()).feeds then
    raise exception using errcode = 'ZF433', message = 'feeds_per_trial';
  end if;
  return new;
end $$;

-- View Links that work (not revoked, not past their last day) in a Trial Workspace: ZF437, taken under the Workspace's
-- row lock like the others.
create or replace function view_links_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from workspaces where id = new.workspace_id and trial_ends_at is not null for update;
  if not found then return new; end if;
  if (select count(*) from view_links where workspace_id = new.workspace_id and revoked_at is null and expires_at >= current_date) >= (trial_limit_numbers()).view_links then
    raise exception using errcode = 'ZF437', message = 'view_links_per_trial';
  end if;
  return new;
end $$;

create trigger view_links_in_trial before insert on view_links
  for each row execute function view_links_in_trial();

-- The Trial Limit settings, by name: the only names the functions below accept.
create or replace function trial_limit_names() returns text
language sql immutable as $$ select '^ZIFFR_TRIAL_(DAYS|GRACE_DAYS|MAX|LIMIT_(METRICS|MESSAGES_PER_DAY|KEYS|FEEDS|ASSISTANTS|WEBHOOKS|WEBHOOK_SENDS_PER_DAY|VIEW_LINKS))$' $$;

-- One number of the row: the server's environment (p_env, which the core passes), else the saved setting, else the
-- default; a value outside its range counts for nothing, as in trial-limits.ts.
create or replace function trial_limit_pick(p_name text, p_min int, p_max int, p_default int, p_env jsonb) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select n::int from (select case when p_env ->> p_name ~ '^[0-9]{1,9}$' then (p_env ->> p_name)::bigint end as n) x where n between p_min and p_max),
    (select n::int from (select case when value ~ '^[0-9]{1,9}$' then value::bigint end as n from installation_settings where name = p_name) y where n between p_min and p_max),
    p_default)
$$;

-- Writes the row the triggers read from the settings and the environment. Called only by the functions below (a save by
-- Ziffr Cloud or by the page, in the same transaction as the setting) and by the hourly trial job for a changed
-- environment: never from the paths that make a Metric, key, Feed or View Link.
create or replace function recompute_trial_limits(p_env jsonb) returns void
language sql security definer set search_path = public as $$
  insert into trial_limits (only_row, metrics, keys, feeds, assistants, view_links, updated_at) values (true,
    trial_limit_pick('ZIFFR_TRIAL_LIMIT_METRICS', 5, 100, 25, p_env), trial_limit_pick('ZIFFR_TRIAL_LIMIT_KEYS', 1, 10, 2, p_env),
    trial_limit_pick('ZIFFR_TRIAL_LIMIT_FEEDS', 1, 10, 2, p_env), trial_limit_pick('ZIFFR_TRIAL_LIMIT_ASSISTANTS', 1, 5, 1, p_env),
    trial_limit_pick('ZIFFR_TRIAL_LIMIT_VIEW_LINKS', 0, 20, 5, p_env), now())
  on conflict (only_row) do update set metrics = excluded.metrics, keys = excluded.keys, feeds = excluded.feeds,
    assistants = excluded.assistants, view_links = excluded.view_links, updated_at = now()
$$;

-- A setting Ziffr Cloud wrote is changed or removed only by Ziffr Cloud's function, whatever else holds the service role.
create or replace function trial_limits_of_cloud_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.set_by = 'cloud' and coalesce(current_setting('ziffr.cloud_trial_limits', true), '') <> 'on' then
    raise exception using errcode = 'ZF438', message = 'trial_limit_set_by_cloud';
  end if;
  return coalesce(new, old);
end $$;
create trigger trial_limits_of_cloud_only before update or delete on installation_settings
  for each row execute function trial_limits_of_cloud_only();

-- Ziffr Cloud's call (PATCH semantics): p_values maps setting names to a whole number, or to null to give that Trial
-- Limit back to its default (the days: no trials). Names left out stay as they are. Everything in one step under a lock,
-- with the row the triggers read, so two calls at once leave one of them whole.
create or replace function set_cloud_trial_limits(p_values jsonb, p_env jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(p_values) is distinct from 'object' or jsonb_typeof(p_env) is distinct from 'object' then raise exception 'trial limits must be an object'; end if;
  for k, v in select key, value from jsonb_each(p_values) loop
    if k !~ trial_limit_names() or not (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9]{1,9}$')) then raise exception 'not a trial limit'; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext('trial-limits'));
  perform set_config('ziffr.cloud_trial_limits', 'on', true);
  for k, v in select key, value from jsonb_each(p_values) loop
    if jsonb_typeof(v) = 'null' then
      delete from installation_settings where name = k;
    else
      insert into installation_settings (name, value, sealed, set_by, updated_by, updated_at) values (k, v #>> '{}', false, 'cloud', null, now())
        on conflict (name) do update set value = excluded.value, sealed = false, set_by = 'cloud', updated_by = null, updated_at = now();
    end if;
  end loop;
  perform set_config('ziffr.cloud_trial_limits', 'off', true);
  perform recompute_trial_limits(p_env);
end $$;

-- The page's save of Trial Limits: the same, for an Installation Admin (p_by). A setting Ziffr Cloud wrote is refused
-- (ZF438) under the lock, so a save made a moment after Ziffr Cloud's never overwrites it.
create or replace function save_page_trial_limits(p_values jsonb, p_env jsonb, p_by text) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(p_values) is distinct from 'object' or jsonb_typeof(p_env) is distinct from 'object' then raise exception 'trial limits must be an object'; end if;
  for k, v in select key, value from jsonb_each(p_values) loop
    if k !~ trial_limit_names() or not (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9]{1,9}$')) then raise exception 'not a trial limit'; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext('trial-limits'));
  for k, v in select key, value from jsonb_each(p_values) loop
    if exists (select 1 from installation_settings where name = k and set_by = 'cloud') then
      raise exception using errcode = 'ZF438', message = 'trial_limit_set_by_cloud';
    end if;
    if jsonb_typeof(v) = 'null' then
      delete from installation_settings where name = k;
    else
      insert into installation_settings (name, value, sealed, set_by, updated_by, updated_at) values (k, v #>> '{}', false, null, p_by, now())
        on conflict (name) do update set value = excluded.value, sealed = false, set_by = null, updated_by = p_by, updated_at = now();
    end if;
  end loop;
  perform recompute_trial_limits(p_env);
end $$;

-- For the hourly job: bring the row in line with a changed environment.
create or replace function refresh_trial_limits(p_env jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('trial-limits'));
  perform recompute_trial_limits(p_env);
end $$;

revoke execute on function trial_limit_names(), trial_limit_pick(text, int, int, int, jsonb), recompute_trial_limits(jsonb),
  set_cloud_trial_limits(jsonb, jsonb), save_page_trial_limits(jsonb, jsonb, text), refresh_trial_limits(jsonb) from public, anon, authenticated;
grant execute on function set_cloud_trial_limits(jsonb, jsonb), save_page_trial_limits(jsonb, jsonb, text), refresh_trial_limits(jsonb) to service_role;
