-- A Workspace's own Usage figures (spec 0031, ticket #370; GLOSSARY: Usage). The scope usage:read is for a program's
-- key only, never an assistant's, like values:approve and view-links:write: the database backs the core's refusal.
alter table access_keys drop constraint access_keys_assistant_never_approves;
alter table access_keys add constraint access_keys_assistant_never_approves check (kind = 'program' or not (scopes && array['values:approve', 'view-links:write', 'usage:read']));

-- One Workspace's values by day and way in (Source, and for a program the kind of key) between two UTC days, both
-- included, for the Metrics listed (the ones the key's creator sees): counts only, no Metric, no person, no value. The
-- ways are those of usage_rollup_day. Service role only, called by the core after it checked the key and the creator's
-- Role; p_workspace is the key's own Workspace and a Metric of another one is never counted.
create or replace function workspace_usage_values(p_workspace uuid, p_metrics bigint[], p_from date, p_to date)
returns table (day date, way text, n bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select (o.created_at at time zone 'utc')::date as day,
    case o.source when 'web_form' then 'web' when 'mail' then 'email' when 'slack' then 'slack' when 'telegram' then 'telegram'
      when 'api' then case when k.feed_id is not null then 'feed' when k.kind = 'assistant' then 'mcp' else 'api' end
      else 'other' end as way,
    count(*) as n
  from observations o left join access_keys k on k.id = o.access_key_id
  where o.workspace_id = p_workspace and o.metric_id = any (p_metrics)
    and o.created_at >= p_from::timestamp at time zone 'utc' and o.created_at < (p_to + 1)::timestamp at time zone 'utc'
  group by 1, 2
$$;
revoke all on function workspace_usage_values(uuid, bigint[], date, date) from public, anon, authenticated;
grant execute on function workspace_usage_values(uuid, bigint[], date, date) to service_role;

-- Calls to a Workspace's usage figures, counted per hour (ticket #370): one row per Workspace and hour, holding a number
-- and nothing else. It goes with its Workspace.
create table workspace_usage_calls (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  hour timestamptz not null,
  n integer not null default 0,
  primary key (workspace_id, hour)
);
alter table workspace_usage_calls enable row level security;
revoke all on table workspace_usage_calls from public, anon, authenticated;
select attach_demo_guard('workspace_usage_calls');

-- Takes one call of the hour: true when fewer than p_max were taken, false otherwise. One statement, so calls at once
-- cannot pass the limit together: the increment happens only while the count is below p_max.
create or replace function claim_workspace_usage_call(p_ws uuid, p_max int) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare got int;
begin
  delete from workspace_usage_calls where workspace_id = p_ws and hour < date_trunc('hour', now());
  insert into workspace_usage_calls as c (workspace_id, hour, n) values (p_ws, date_trunc('hour', now()), 1)
    on conflict (workspace_id, hour) do update set n = c.n + 1 where c.n < p_max;
  get diagnostics got = row_count;
  return got > 0;
end $$;
revoke all on function claim_workspace_usage_call(uuid, int) from public, anon, authenticated;
grant execute on function claim_workspace_usage_call(uuid, int) to service_role;
