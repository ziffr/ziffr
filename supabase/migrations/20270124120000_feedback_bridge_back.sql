-- Feedback bridge back (spec 0049, ticket #918; GLOSSARY: Feedback): answers from GitHub come into a feedback's conversation,
-- GitHub closing and reopening shows as its status, and a person's reply goes out to GitHub. Add-only: new columns and
-- functions, existing rows untouched. Everything is reached by the core's service role only (no browser grant).

-- The webhook deliveries already handled (GitHub's X-GitHub-Delivery id), so a replay or a redelivery changes nothing.
create table feedback_github_deliveries (
  delivery_id text primary key check (char_length(delivery_id) between 8 and 64),
  received_at timestamptz not null default now()
);
alter table feedback_github_deliveries enable row level security;
revoke all on table feedback_github_deliveries from public, anon, authenticated;
create index feedback_github_deliveries_received_idx on feedback_github_deliveries (received_at);

-- Where a message sits on GitHub and how posting it went. `github_comment_ref` is `<kind>-comment:<id>`: for a team comment
-- the one that came in (a unique index, so one comment is one message however often it is delivered), for a person's
-- reply the comment the bot made. The commenter's GitHub login is NOT stored anywhere: team answers are anonymous too.
alter table feedback_messages
  add column github_comment_ref text check (github_comment_ref is null or char_length(github_comment_ref) <= 80),
  add column posted_at timestamptz,
  add column post_attempts int not null default 0,
  add column post_attempted_at timestamptz,
  add column post_error text check (post_error is null or char_length(post_error) <= 200);
create unique index feedback_messages_comment_ref_idx on feedback_messages (github_comment_ref) where github_comment_ref is not null;
create index feedback_messages_to_post_idx on feedback_messages (created_at) where from_team = false and posted_at is null;

-- Claims a webhook delivery: true the first time, false for a repeat. Old ids are dropped here (30 days is far beyond
-- any redelivery a maintainer would make by hand).
create or replace function feedback_claim_github_delivery(p_id text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from feedback_github_deliveries where received_at < now() - interval '30 days';
  insert into feedback_github_deliveries (delivery_id) values (p_id) on conflict do nothing;
  return found;
end $$;
revoke execute on function feedback_claim_github_delivery(text) from public, anon, authenticated;
grant execute on function feedback_claim_github_delivery(text) to service_role;

-- Gives a claim back when handling the event failed, so a redelivery can try again.
create or replace function feedback_release_github_delivery(p_id text) returns void
language sql security definer set search_path = public as $$
  delete from feedback_github_deliveries where delivery_id = p_id;
$$;
revoke execute on function feedback_release_github_delivery(text) from public, anon, authenticated;
grant execute on function feedback_release_github_delivery(text) to service_role;

-- Adds one comment from the Ziffr team to the feedback filed as this issue or discussion, once (the unique reference), and
-- marks it answered unless it is closed. Returns who to tell, or nothing when there is no such feedback or the comment is
-- already in. `told` is false when the previous team message is less than an hour old, so a run of comments is one notice.
create or replace function feedback_take_team_comment(p_kind text, p_number int, p_ref text, p_words text)
returns table (person_id text, workspace_id uuid, told boolean)
language plpgsql security definer set search_path = public as $$
declare f feedback; mid bigint; recent boolean;
begin
  select * into f from feedback where github_kind = p_kind and github_number = p_number for update;
  if not found then return; end if;
  recent := exists (select 1 from feedback_messages m where m.feedback_id = f.id and m.from_team and m.created_at > now() - interval '1 hour');
  insert into feedback_messages (feedback_id, from_team, words, github_comment_ref, posted_at)
    values (f.id, true, p_words, p_ref, now()) on conflict (github_comment_ref) where github_comment_ref is not null do nothing returning id into mid;
  if mid is null then return; end if;
  update feedback set status = case when status in ('open', 'answered') then 'answered' else status end, updated_at = now() where id = f.id;
  return query select f.person_id, f.workspace_id, not recent;
end $$;
revoke execute on function feedback_take_team_comment(text, int, text, text) from public, anon, authenticated;
grant execute on function feedback_take_team_comment(text, int, text, text) to service_role;

-- Sets the status GitHub moved a feedback to: closed from anywhere, open only from closed (a reopening), answered only from
-- open. Says how many rows changed.
create or replace function feedback_set_status_from_github(p_kind text, p_number int, p_status text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_status not in ('open', 'closed', 'answered') then return 0; end if;
  update feedback set status = p_status, updated_at = now()
    where github_kind = p_kind and github_number = p_number and status <> p_status
      and (p_status <> 'open' or status = 'closed') and (p_status <> 'answered' or status = 'open');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function feedback_set_status_from_github(text, int, text) from public, anon, authenticated;
grant execute on function feedback_set_status_from_github(text, int, text) to service_role;

-- Stores a person's reply under their own feedback unless they have written their share today (per feedback and per person)
-- or the conversation is full. One call counts and inserts under a lock per person. An answered feedback is open again.
-- Returns the new message, or no row when it is not theirs or a limit is reached.
create or replace function feedback_reply_create(p_person text, p_feedback uuid, p_words text, p_per_feedback int, p_per_person int, p_total int)
returns setof feedback_messages
language plpgsql security definer set search_path = public as $$
declare made feedback_messages;
begin
  perform pg_advisory_xact_lock(hashtextextended('feedback-reply:' || p_person, 0));
  if not exists (select 1 from feedback where id = p_feedback and person_id = p_person) then return; end if;
  if (select count(*) from feedback_messages where feedback_id = p_feedback) >= p_total then return; end if;
  if (select count(*) from feedback_messages where feedback_id = p_feedback and not from_team and created_at > now() - interval '24 hours') >= p_per_feedback then return; end if;
  if (select count(*) from feedback_messages m join feedback f on f.id = m.feedback_id where f.person_id = p_person and not m.from_team and m.created_at > now() - interval '24 hours') >= p_per_person then return; end if;
  insert into feedback_messages (feedback_id, from_team, words) values (p_feedback, false, p_words) returning * into made;
  update feedback set status = 'open', updated_at = now() where id = p_feedback and status = 'answered';
  return next made;
end $$;
revoke execute on function feedback_reply_create(text, uuid, text, int, int, int) from public, anon, authenticated;
grant execute on function feedback_reply_create(text, uuid, text, int, int, int) to service_role;

-- Takes up to p_limit replies of people that are not on GitHub yet (their feedback is filed), tried fewer than p_max_attempts
-- times and not within p_retry_minutes, marks each as tried now (a lease) and returns what is needed to post it.
create or replace function feedback_claim_replies(p_limit int, p_max_attempts int, p_retry_minutes int)
returns table (message_id bigint, message_words text, post_kind text, post_number int, ref text, attempts int)
language sql security definer set search_path = public as $$
  with picked as (
    select m.id from feedback_messages m join feedback f on f.id = m.feedback_id
    where not m.from_team and m.posted_at is null and f.github_number is not null and m.post_attempts < p_max_attempts
      and (m.post_attempted_at is null or m.post_attempted_at < now() - make_interval(mins => p_retry_minutes))
    order by m.created_at limit least(greatest(p_limit, 0), 50) for update of m skip locked),
  upd as (
    update feedback_messages m set post_attempts = m.post_attempts + 1, post_attempted_at = now()
    from picked where m.id = picked.id returning m.id, m.words, m.feedback_id, m.post_attempts)
  select upd.id, upd.words, f.github_kind, f.github_number, f.public_ref, upd.post_attempts
  from upd join feedback f on f.id = upd.feedback_id;
$$;
revoke execute on function feedback_claim_replies(int, int, int) from public, anon, authenticated;
grant execute on function feedback_claim_replies(int, int, int) to service_role;
