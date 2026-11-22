-- Feedback Prompt (ticket #722; GLOSSARY: Feedback Prompt): the card that now and then asks a person whether they like
-- Ziffr. One row per person holds only how the asking stands: how often it was shown, when it may be shown next, and
-- whether it has stopped for good. The words of a "no" go to a second table WITHOUT the person, so Installation Admins
-- read what is missing and never who wrote it. Both tables are reached by the core's service role only.
create table feedback_prompts (
  person_id text primary key references profiles(id) on delete cascade,
  shown_count int not null default 0 check (shown_count >= 0 and shown_count <= 100),
  next_ask_at timestamptz,
  stopped boolean not null default false,
  answer text check (answer in ('no', 'starred', 'never')),
  updated_at timestamptz not null default now()
);
alter table feedback_prompts enable row level security;
revoke all on table feedback_prompts from public, anon, authenticated;

-- What people said when it is not good yet: no person, no Workspace, only the date. The core keeps the newest 500.
create table feedback_prompt_words (
  id bigserial primary key,
  words text not null check (char_length(words) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table feedback_prompt_words enable row level security;
revoke all on table feedback_prompt_words from public, anon, authenticated;

-- The card appears after a person has submitted values on a few different days; one look at their newest values says so.
create index if not exists observations_submitter_created_idx on observations (submitter_id, created_at desc) where submitter_id is not null;

-- On how many different days (UTC) in the last half year the person submitted a value. A count only, never a value or a
-- Metric: the card asks nothing else about what a person does.
create or replace function feedback_submission_days(p_person text) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct (created_at at time zone 'utc')::date)::int
    from observations where submitter_id = p_person and created_at > now() - interval '180 days'
$$;
revoke execute on function feedback_submission_days(text) from public, anon, authenticated;
grant execute on function feedback_submission_days(text) to service_role;
