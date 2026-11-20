-- Installation Usage (spec 0031, #365): the Installation's figures per day, and the Usage Key that reads them.
-- Nothing here holds a Workspace's id or name, a person, a Metric's name or a value in a figure: the rollup writes
-- counts only, and installation-usage.ts returns only a fixed list of keys on top of that.

-- One row per UTC day: whole numbers (and the Marketplace Packs held by at least 3 Workspaces as { id, installs }).
create table installation_usage_daily (
  day date primary key,
  figures jsonb not null check (jsonb_typeof(figures) = 'object' and octet_length(figures::text) <= 16384)
);
alter table installation_usage_daily enable row level security;
revoke all on table installation_usage_daily from public, anon, authenticated;

-- The Usage Key: a secret that reads the figures and nothing else. Only its hash is kept; one is live at a time.
create table usage_keys (
  id bigserial primary key,
  prefix text not null check (prefix ~ '^[0-9a-f]{6}$'),
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  window_started_at timestamptz not null default now(),
  window_calls integer not null default 0
);
alter table usage_keys enable row level security;
revoke all on table usage_keys from public, anon, authenticated;
create unique index usage_keys_one_live on usage_keys ((true)) where revoked_at is null;

-- Counts one call of the live key in its hour; answers whether it is still within p_limit. Service role only.
create or replace function touch_usage_key(p_id bigint, p_limit integer) returns boolean
language sql security definer set search_path = public, pg_temp as $$
  with u as (
    update usage_keys k set
      window_calls = case when k.window_started_at > now() - interval '1 hour' then k.window_calls + 1 else 1 end,
      window_started_at = case when k.window_started_at > now() - interval '1 hour' then k.window_started_at else now() end,
      last_used_at = now()
    where k.id = p_id and k.revoked_at is null
    returning k.window_calls
  )
  select coalesce((select window_calls <= p_limit from u), false);
$$;
revoke all on function touch_usage_key(bigint, integer) from public, anon, authenticated;
grant execute on function touch_usage_key(bigint, integer) to service_role;

-- Makes the key the one live one: revokes the others and inserts, in one transaction under a lock, so two Installation
-- Admins making a key at once cannot leave none or two. Service role only.
create or replace function make_usage_key(p_prefix text, p_hash text, p_by text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('usage_keys'));
  update usage_keys set revoked_at = now() where revoked_at is null;
  insert into usage_keys (prefix, secret_hash, created_by) values (p_prefix, p_hash, p_by);
end $$;
revoke all on function make_usage_key(text, text, text) from public, anon, authenticated;
grant execute on function make_usage_key(text, text, text) to service_role;

-- The figures of one UTC day, as counts. p_exclude leaves one Workspace (the operator's own) out of every figure; the
-- demo is never in them. p_states false (a day the job missed) leaves out the figures that count a state at the end of
-- the day, which cannot be rebuilt afterwards, rather than giving today's state for that day. Returns the figures
-- only; the caller stores them.
create or replace function usage_rollup_day(p_day date, p_exclude uuid, p_states boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  d_from timestamptz := p_day::timestamp at time zone 'utc';
  d_to timestamptz := (p_day + 1)::timestamp at time zone 'utc';
  f jsonb := '{}'::jsonb;
  v bigint;
begin
  -- Workspaces in the figures: not the demo, not the excluded one.
  create temporary table if not exists _usage_ws (id uuid primary key) on commit drop;
  truncate _usage_ws;
  insert into _usage_ws select w.id from workspaces w where w.id <> demo and w.id is distinct from p_exclude;

  -- Events of the day.
  f := f || jsonb_build_object(
    'workspaces_created', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.created_at >= d_from and w.created_at < d_to),
    'trials_kept', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.trial_kept_at >= d_from and w.trial_kept_at < d_to),
    'trials_closed', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.trial_closed_at >= d_from and w.trial_closed_at < d_to),
    'values_web', (select count(*) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'web_form' and o.created_at >= d_from and o.created_at < d_to),
    'values_email', (select count(*) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'mail' and o.created_at >= d_from and o.created_at < d_to),
    'values_slack', (select count(*) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'slack' and o.created_at >= d_from and o.created_at < d_to),
    'values_telegram', (select count(*) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'telegram' and o.created_at >= d_from and o.created_at < d_to),
    'values_api', (select count(*) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'api' and o.created_at >= d_from and o.created_at < d_to),
    'values_web_ws', (select count(distinct o.workspace_id) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'web_form' and o.created_at >= d_from and o.created_at < d_to),
    'values_email_ws', (select count(distinct o.workspace_id) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'mail' and o.created_at >= d_from and o.created_at < d_to),
    'values_slack_ws', (select count(distinct o.workspace_id) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'slack' and o.created_at >= d_from and o.created_at < d_to),
    'values_telegram_ws', (select count(distinct o.workspace_id) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'telegram' and o.created_at >= d_from and o.created_at < d_to),
    'values_api_ws', (select count(distinct o.workspace_id) from observations o join _usage_ws u on u.id = o.workspace_id where o.source = 'api' and o.created_at >= d_from and o.created_at < d_to),
    'emails_sent', (select count(*) from deliveries x join _usage_ws u on u.id = x.workspace_id where x.connector = 'email' and x.mail_state = 'sent' and x.sent_at >= d_from and x.sent_at < d_to),
    'api_calls', coalesce((select sum(c.n) from usage_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.kind = 'api_calls'), 0),
    'feed_calls', coalesce((select sum(c.n) from usage_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.kind = 'feed_calls'), 0),
    'mcp_calls', coalesce((select sum(c.n) from usage_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.kind = 'mcp_calls'), 0),
    'views_dashboards', coalesce((select sum(c.n_app + c.n_link) from view_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.subject_kind = 'dashboard'), 0),
    'views_decks', coalesce((select sum(c.n_app + c.n_link) from view_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.subject_kind = 'deck'), 0),
    'views_metrics', coalesce((select sum(c.n_app + c.n_link) from view_counts c join _usage_ws u on u.id = c.workspace_id where c.day = p_day and c.subject_kind = 'metric'), 0)
  );

  if p_states then
    f := f || jsonb_build_object(
      'workspaces', (select count(*) from _usage_ws),
      'workspaces_trial', (select count(*) from workspaces w join _usage_ws u on u.id = w.id where w.trial_ends_at is not null and w.trial_kept_at is null),
      'workspaces_paid', (select count(*) from workspaces w join _usage_ws u on u.id = w.id join workspace_limits l on l.workspace_id = w.id where not (w.trial_ends_at is not null and w.trial_kept_at is null)),
      'people', (select count(distinct m.user_id) from memberships m join _usage_ws u on u.id = m.workspace_id join profiles p on p.id = m.user_id where p.auth_user_id is not null),
      'metrics', (select count(*) from metrics m join _usage_ws u on u.id = m.workspace_id where m.archived_at is null),
      'metrics_archived', (select count(*) from metrics m join _usage_ws u on u.id = m.workspace_id where m.archived_at is not null),
      'dashboards', (select count(*) from dashboards x join _usage_ws u on u.id = x.workspace_id),
      'widgets', (select count(*) from widgets x join _usage_ws u on u.id = x.workspace_id where x.dashboard_id is not null),
      'decks', (select count(*) from decks x join _usage_ws u on u.id = x.workspace_id),
      'workflows', (select count(*) from workflows x join _usage_ws u on u.id = x.workspace_id),
      'feeds', (select count(*) from feeds x join _usage_ws u on u.id = x.workspace_id where x.deleted_at is null),
      'packs_installed', (select count(*) from pack_installs x join _usage_ws u on u.id = x.workspace_id)
    );
    f := f || jsonb_build_object('workspaces_free', (f->>'workspaces')::int - (f->>'workspaces_trial')::int - (f->>'workspaces_paid')::int);
    -- Marketplace Packs only, and only those at least 3 Workspaces hold; an uploaded Pack is never named.
    f := f || jsonb_build_object('packs', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.pack_id, 'installs', t.n) order by t.pack_id)
      from (select x.pack_id, count(distinct x.workspace_id) n from pack_installs x join _usage_ws u on u.id = x.workspace_id where x.source = 'marketplace' group by x.pack_id having count(distinct x.workspace_id) >= 3) t
    ), '[]'::jsonb));
  end if;
  return f;
end $$;
revoke all on function usage_rollup_day(date, uuid, boolean) from public, anon, authenticated;
grant execute on function usage_rollup_day(date, uuid, boolean) to service_role;
