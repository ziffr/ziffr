-- Feedback (spec 0049, ticket #915; GLOSSARY: Feedback): what a person tells the Ziffr team from inside the app, kept
-- outside every Workspace. Only the central version (hosted Ziffr) writes here; the tables exist everywhere so the
-- schema is one, and stay empty on a self-hosted Installation. No demo rows (ziffr.demo_seed is not needed).
-- Visibility: the tables are reached by the core's service role only (browser roles have no grant and no policy), and
-- the core answers a person with their own rows only. workspace_id is a plain value, not a reference: it exists only
-- to count the day's feedback per Workspace, is never returned to anyone and no Workspace Export reads this table.
create table feedback (
  id uuid primary key default gen_random_uuid(),
  person_id text not null references profiles(id) on delete cascade,
  workspace_id uuid,
  kind text not null check (kind in ('problem', 'idea', 'question')),
  words text not null check (char_length(words) between 1 and 2000),
  route text check (route is null or char_length(route) <= 200),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  status text not null default 'waiting_for_review' check (status in ('waiting_for_review', 'open', 'answered', 'closed')),
  -- The only thing the public post will show of this row (spec 0049, the bridge): opaque, never derived from the person.
  public_ref text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table feedback enable row level security;
revoke all on table feedback from public, anon, authenticated;
create index feedback_person_idx on feedback (person_id, created_at desc);
create index feedback_workspace_idx on feedback (workspace_id, created_at desc) where workspace_id is not null;

-- The conversation under one feedback (the bridge's replies come here; a Thread of an Action cannot hold it, because
-- those belong to a Workspace). `from_team` is true for what came back from the Ziffr team.
create table feedback_messages (
  id bigserial primary key,
  feedback_id uuid not null references feedback(id) on delete cascade,
  from_team boolean not null,
  words text not null check (char_length(words) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table feedback_messages enable row level security;
revoke all on table feedback_messages from public, anon, authenticated;
create index feedback_messages_feedback_idx on feedback_messages (feedback_id, created_at);

-- Makes one feedback unless the person or the Workspace has sent their share today. One call counts and inserts under
-- a lock per person, so two requests at once cannot both pass the count. Returns the new row, or null when over a limit.
create or replace function feedback_create(
  p_person text, p_workspace uuid, p_kind text, p_words text, p_route text, p_version text, p_per_person int, p_per_workspace int
) returns feedback
language plpgsql security definer set search_path = public as $$
declare made feedback;
begin
  perform pg_advisory_xact_lock(hashtextextended('feedback:' || p_person, 0));
  if p_workspace is not null then perform pg_advisory_xact_lock(hashtextextended('feedback-ws:' || p_workspace::text, 0)); end if;
  if (select count(*) from feedback where person_id = p_person and created_at > now() - interval '24 hours') >= p_per_person then return null; end if;
  if p_workspace is not null and (select count(*) from feedback where workspace_id = p_workspace and created_at > now() - interval '24 hours') >= p_per_workspace then return null; end if;
  insert into feedback (person_id, workspace_id, kind, words, route, app_version)
    values (p_person, p_workspace, p_kind, p_words, p_route, p_version) returning * into made;
  return made;
end $$;
revoke execute on function feedback_create(text, uuid, text, text, text, text, int, int) from public, anon, authenticated;
grant execute on function feedback_create(text, uuid, text, text, text, text, int, int) to service_role;
