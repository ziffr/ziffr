-- The pair table behind the Heads-ups (spec 0041, ticket 13; GLOSSARY: Heads-up). Once a Workspace has been scanned, this table
-- holds for every pair of its Metrics that could be compared how their changes correlate (the whole history, the history
-- before the last 6 periods, and the last 6). It is DERIVED data, worked out by the Heads-up job from values; nothing in it
-- is a value, and nothing in it says who may see what.
--
-- Who may read it: nobody but the core, with the service key. Row level security is on and there is no policy, so a browser,
-- a Connector, a View Link or any signed-in role gets nothing (and the grants are taken away as well). The core's
-- listHeadsUps(actor) reads only the rows whose two Metrics the person may see (visible_heads_up_pairs) and works out the
-- correction for the number of pairs from those rows alone. A row is never written for a pair of Metrics of two
-- Workspaces (heads_up_pairs_same_workspace), and rows go with their Metrics and their Workspace (on delete cascade).
-- Kept for 90 days (the job deletes what a scan did not refresh).

create table heads_up_pairs (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- The lower id first, so a pair is stored once.
  metric_a int not null references metrics(id) on delete cascade,
  metric_b int not null references metrics(id) on delete cascade,
  -- The Common Period they were compared on, and the last period the comparison runs to (the first day of that period).
  span text not null check (span in ('day', 'week', 'month', 'quarter', 'year')),
  through date not null,
  scanned_at timestamptz not null default now(),

  -- The whole history. `lag` is positive where metric_a moves first; `p_delays` the chance of the best delay by luck times the
  -- delays looked at, `p` the larger of that and the chances of each half (what the correction reads); the halves are the
  -- pairs in time order, `meets` whether every condition of a Heads-up that does not depend on the other pairs holds.
  lag smallint not null check (lag between -3 and 3),
  r double precision not null check (r between -1 and 1),
  n int not null check (n between 12 and 200),
  n_eff double precision not null check (n_eff > 0 and n_eff <= n),
  p_delays double precision not null check (p_delays between 0 and 1),
  p double precision not null check (p between 0 and 1 and p >= p_delays),
  tries smallint not null check (tries between 1 and 7),
  meets boolean not null,
  r_first double precision check (r_first between -1 and 1),
  n_first int not null check (n_first >= 6),
  r_second double precision check (r_second between -1 and 1),
  n_second int not null check (n_second >= 6),
  check (n_first + n_second = n),

  -- The history before the last 6 periods (null where it has fewer than 12 pairs), judged the same way.
  before_lag smallint check (before_lag between -3 and 3),
  before_r double precision check (before_r between -1 and 1),
  before_n int check (before_n between 12 and 200),
  before_n_eff double precision check (before_n_eff > 0 and before_n_eff <= before_n),
  before_p_delays double precision check (before_p_delays between 0 and 1),
  before_p double precision check (before_p between 0 and 1 and before_p >= before_p_delays),
  before_tries smallint check (before_tries between 1 and 7),
  before_meets boolean,
  before_r_first double precision check (before_r_first between -1 and 1),
  before_n_first int check (before_n_first >= 6),
  before_r_second double precision check (before_r_second between -1 and 1),
  before_n_second int check (before_n_second >= 6),
  -- The last 6 periods at the earlier history's delay (null where they do not all have a pair or one series is constant):
  -- r, the pairs (always 6), whether |r| is under 0.3, and the chance that the link dropped.
  recent_r double precision check (recent_r between -1 and 1),
  recent_n int check (recent_n = 6),
  recent_low boolean,
  recent_drop_p double precision check (recent_drop_p between 0 and 1),

  primary key (workspace_id, metric_a, metric_b),
  check (metric_a < metric_b),
  -- The earlier history is all there or all absent; the last periods need the earlier history.
  check ((before_lag is null) = (before_r is null) and (before_lag is null) = (before_n is null) and (before_lag is null) = (before_n_eff is null)
    and (before_lag is null) = (before_p_delays is null) and (before_lag is null) = (before_p is null) and (before_lag is null) = (before_tries is null)
    and (before_lag is null) = (before_meets is null) and (before_lag is null) = (before_n_first is null) and (before_lag is null) = (before_n_second is null)),
  check ((recent_r is null) = (recent_n is null) and (recent_r is null) = (recent_low is null) and (recent_r is null) = (recent_drop_p is null)),
  check (recent_r is null or before_lag is not null)
);
create index heads_up_pairs_scanned on heads_up_pairs (scanned_at);
alter table heads_up_pairs enable row level security;
revoke all on heads_up_pairs from public, anon, authenticated;
-- Read-only in the demo, like every table with a workspace_id (demo-read-only.db.test.ts); the demo is never scanned.
select attach_demo_guard('heads_up_pairs');

-- A pair's Metrics belong to the pair's Workspace: a row that would join two Workspaces, or name another Workspace's Metric,
-- is refused (the job is the only writer, and the database holds it to this as well).
create or replace function heads_up_pairs_same_workspace() returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from metrics where id in (new.metric_a, new.metric_b) and workspace_id = new.workspace_id) <> 2 then
    raise exception 'A pair of Metrics must belong to its Workspace';
  end if;
  return new;
end $$;
create trigger heads_up_pairs_same_workspace before insert or update on heads_up_pairs for each row execute function heads_up_pairs_same_workspace();

-- One row per Workspace: when its last scan was claimed and what it covered, in counts. Words never, values never.
create table heads_up_scans (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  metrics int not null default 0 check (metrics >= 0),
  pairs int not null default 0 check (pairs >= 0),
  -- Whether the Workspace had more Metrics than a scan looks at (the 200 most recently updated were).
  capped boolean not null default false
);
alter table heads_up_scans enable row level security;
revoke all on heads_up_scans from public, anon, authenticated;
select attach_demo_guard('heads_up_scans');

-- Claims a Workspace's scan: its time, for the one call that may run it; null for every other call, and for a Workspace that
-- was scanned within `p_every`. One statement, so two calls at once cannot both pass.
create or replace function claim_heads_up_scan(p_ws uuid, p_every interval default interval '6 hours')
returns timestamptz language plpgsql security definer set search_path = public as $$
declare claimed timestamptz;
begin
  insert into heads_up_scans (workspace_id, scanned_at) values (p_ws, now())
  on conflict (workspace_id) do update set scanned_at = now() where heads_up_scans.scanned_at < now() - p_every
  returning scanned_at into claimed;
  return claimed;
end $$;
revoke execute on function claim_heads_up_scan(uuid, interval) from public, anon, authenticated;
grant execute on function claim_heads_up_scan(uuid, interval) to service_role;

-- What a person's read needs, in ONE statement (one snapshot): whether the Workspace's scan was capped, and, only if it was not, the rows
-- whose two Metrics are both among `p_ids` (the Metrics the person may see, decided by the core), in key order. A scan that is
-- running meanwhile cannot make the two disagree. Only the core's service key may call it.
create or replace function visible_heads_up_pairs(p_ws uuid, p_ids int[])
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'capped', coalesce((select capped from heads_up_scans where workspace_id = p_ws), false),
    'rows', case when coalesce((select capped from heads_up_scans where workspace_id = p_ws), false) then '[]'::jsonb
      else coalesce((select jsonb_agg(to_jsonb(hp) order by metric_a, metric_b) from heads_up_pairs hp
        where workspace_id = p_ws and metric_a = any (p_ids) and metric_b = any (p_ids)), '[]'::jsonb) end);
$$;
revoke execute on function visible_heads_up_pairs(uuid, int[]) from public, anon, authenticated;
grant execute on function visible_heads_up_pairs(uuid, int[]) to service_role;
