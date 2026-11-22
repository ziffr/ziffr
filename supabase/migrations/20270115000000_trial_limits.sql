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

-- Ziffr Cloud's call that sets the Trial Limits (PUT /api/cloud/v1/trial-limits): every Trial Limit setting is replaced in
-- one step, under a lock, so two calls at once leave one of them whole, never a mix. p_values maps setting names to whole
-- numbers; a Trial Limit left out loses its row and falls back to its default. Only the names and shapes of Trial Limits
-- pass; the ranges are the caller's (trial-limits.ts) and the table's checks for the numbers the triggers read.
create or replace function set_cloud_trial_limits(p_values jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v text;
begin
  if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'trial limits must be an object'; end if;
  perform pg_advisory_xact_lock(hashtext('trial-limits'));
  for k, v in select key, value from jsonb_each_text(p_values) loop
    if k !~ '^ZIFFR_TRIAL_(DAYS|GRACE_DAYS|MAX|LIMIT_[A-Z_]{1,40})$' or v !~ '^[0-9]{1,9}$' then raise exception 'not a trial limit'; end if;
  end loop;
  delete from installation_settings
    where name ~ '^ZIFFR_TRIAL_(DAYS|GRACE_DAYS|MAX|LIMIT_[A-Z_]{1,40})$' and not (p_values ? name);
  insert into installation_settings (name, value, sealed, set_by, updated_by, updated_at)
    select key, value, false, 'cloud', null, now() from jsonb_each_text(p_values)
    on conflict (name) do update set value = excluded.value, sealed = false, set_by = 'cloud', updated_by = null, updated_at = now();
end $$;
revoke execute on function set_cloud_trial_limits(jsonb) from public, anon, authenticated;
grant execute on function set_cloud_trial_limits(jsonb) to service_role;
