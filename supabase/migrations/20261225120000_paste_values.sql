-- Paste values (spec 0026): the intake log marks a value that came from a paste ('paste'), and one recorded as
-- history beside it ('import'). The marks are written by the core only (submissions.ts), never from what a browser
-- sends. They are indexed by sender and time for the Metric's history and the intake log.
alter table intake_log add column marks text[] not null default '{}';

create index intake_log_pasted_idx on intake_log (sender_id, at) where marks @> array['paste'];

-- The per-person limit on pasted values (10,000 in any 24 hours, across every Workspace): each paste claims its
-- values before any is recorded, in one locked step, so two pastes at once cannot both pass on the same count.
create table paste_claims (
  id bigserial primary key,
  person_id text not null references profiles(id) on delete cascade,
  value_count int not null check (value_count > 0),
  at timestamptz not null default now()
);
create index paste_claims_person_at_idx on paste_claims (person_id, at);
alter table paste_claims enable row level security;

-- Claims `p_count` values for a person when that stays within `p_limit` over the last 24 hours. Returns how many
-- are left after the claim, or, when refused, -1 minus how many were left (so -1 means none were).
create or replace function claim_pasted_values(p_person text, p_count int, p_limit int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_used int;
begin
  perform pg_advisory_xact_lock(hashtext('paste_claims:' || p_person));
  select coalesce(sum(value_count), 0) into v_used from paste_claims where person_id = p_person and at > now() - interval '24 hours';
  if v_used + p_count > p_limit then return -1 - greatest(p_limit - v_used, 0); end if;
  if p_count > 0 then insert into paste_claims (person_id, value_count) values (p_person, p_count); end if;
  return p_limit - v_used - p_count;
end;
$$;
revoke execute on function claim_pasted_values(text, int, int) from public, anon, authenticated;
grant execute on function claim_pasted_values(text, int, int) to service_role;
