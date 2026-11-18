-- Ask me now (spec 0021): a Metric's owner asks for its current Prompt at once. At most once every ten minutes per
-- Metric, claimed in one statement, so two presses at the same moment send one Prompt, not two.
create table ask_now_claims (
  metric_id bigint primary key references metrics (id) on delete cascade,
  asked_at timestamptz not null default now()
);
alter table ask_now_claims enable row level security;

-- true when this press may ask; false when the Metric was asked by Ask me now in the last ten minutes.
create or replace function claim_ask_now(p_metric bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare taken boolean;
begin
  insert into ask_now_claims (metric_id, asked_at) values (p_metric, now())
    on conflict (metric_id) do update set asked_at = now() where ask_now_claims.asked_at < now() - interval '10 minutes'
    returning true into taken;
  return coalesce(taken, false);
end $$;

revoke execute on function claim_ask_now(bigint) from public, anon, authenticated;
grant execute on function claim_ask_now(bigint) to service_role;
