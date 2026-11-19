-- First Prompts a program sets off by naming Submitters (ticket #217; GLOSSARY: Submitter, Prompt, Access Key): a
-- person added through a key is asked at once only if they were not asked for that Metric in the last day, and at
-- most five times a day in the workspace. The check and the reservation are one step under a lock per person in the
-- workspace, so parallel calls cannot each pass it. Rows are kept for a day.
create table if not exists first_prompt_claims (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  submitter_id text not null,
  metric_id int not null references metrics(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists first_prompt_claims_person on first_prompt_claims (workspace_id, submitter_id, at);
create index if not exists first_prompt_claims_at on first_prompt_claims (at);
alter table first_prompt_claims enable row level security;

-- Reserves a first Prompt for a person and a Metric when they were not asked for it in the last day (by a Prompt or
-- an earlier claim) and have fewer than p_limit claims that day. Returns whether the Prompt may go out.
create or replace function claim_first_prompt(p_workspace uuid, p_submitter text, p_metric int, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  used int;
begin
  perform pg_advisory_xact_lock(hashtext('first-prompt:' || p_workspace::text || ':' || p_submitter));
  delete from first_prompt_claims where at < now() - interval '1 day';
  if exists (select 1 from first_prompt_claims where workspace_id = p_workspace and submitter_id = p_submitter and metric_id = p_metric and at > now() - interval '1 day')
     or exists (select 1 from prompts where workspace_id = p_workspace and submitter_id = p_submitter and metric_id = p_metric and sent_at > now() - interval '1 day') then
    return false;
  end if;
  select count(*) into used from first_prompt_claims where workspace_id = p_workspace and submitter_id = p_submitter and at > now() - interval '1 day';
  if used >= p_limit then return false; end if;
  insert into first_prompt_claims (workspace_id, submitter_id, metric_id) values (p_workspace, p_submitter, p_metric);
  return true;
end $$;
revoke all on table first_prompt_claims from public, anon, authenticated;
revoke execute on function claim_first_prompt(uuid, text, int, int) from public, anon, authenticated;
grant execute on function claim_first_prompt(uuid, text, int, int) to service_role;
