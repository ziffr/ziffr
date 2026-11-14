-- Telling Metric owners that someone stopped email, once a day at most (spec 0006, ticket #95; GLOSSARY: Prompt,
-- Delivery). Since a person can switch email off and on from Ziffr, the last time owners were told is kept apart from
-- the opt-out itself, which opting back in removes. Claimed under a row lock, so flips sent at once tell them once.
create table if not exists email_opt_out_notices (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);
alter table email_opt_out_notices enable row level security;

-- True when the owners may be told now (and records that they are); false when they were told in the last 24 hours.
create or replace function claim_opt_out_notice(p_workspace uuid, p_person text)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed text;
begin
  insert into email_opt_out_notices as n (workspace_id, person_id, notified_at) values (p_workspace, p_person, now())
  on conflict (workspace_id, person_id) do update set notified_at = now()
    where n.notified_at < now() - interval '24 hours'
  returning n.person_id into claimed;
  return claimed is not null;
end $$;
revoke execute on function claim_opt_out_notice(uuid, text) from public, anon, authenticated;
grant execute on function claim_opt_out_notice(uuid, text) to service_role;
