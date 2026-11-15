-- Feeds (spec 0012, ADR 0006, GLOSSARY: Feed, Feed Key, Import): programs outside Ziffr that bring in values from
-- another system. A Feed is a person row, like a Contact, so its Tokens, values and history work as anyone's; this
-- table says which workspace it belongs to. It is never a member and never a Contact, so it signs in nowhere and is
-- listed as nobody's colleague. Deleting a Feed only marks it: its values keep its name.
create table feeds (
  person_id text primary key references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on feeds (workspace_id);
alter table feeds enable row level security;

-- A Feed Key acts for a Feed, not its creator, and can do exactly one thing; a person's key can never get that scope.
alter table access_keys add column feed_id text references feeds(person_id) on delete cascade;
create index on access_keys (feed_id) where feed_id is not null;
alter table access_keys add constraint access_keys_feed_scope check (
  (feed_id is null and not ('feed:submit' = any(scopes))) or (feed_id is not null and scopes = array['feed:submit'])
);

-- An Import (a Feed's value for a past period that had none) skipped the Unusual Value check; the history says so.
alter table observations add column imported boolean not null default false;

-- The API becomes a Source of its own. Until now it rode on the personal form link, so every Metric that takes form
-- values keeps taking API values; an Owner or Editor can now turn either off alone.
update metrics set sources = array_append(sources, 'api') where 'web_form' = any(sources) and not ('api' = any(sources));

-- A Feed's batches: one at a time per Feed, and its day's limit checked when a batch is claimed, under a lock, so
-- parallel requests cannot all pass the count before any of them is recorded. A batch that died holds the Feed for at
-- most ten minutes. The day's count is the batches' own: what each took, or what it claimed while it runs.
create table feed_batches (
  id bigint generated always as identity primary key,
  feed_id text not null references feeds(person_id) on delete cascade,
  items integer not null check (items between 1 and 500),
  taken integer check (taken between 0 and 500),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index on feed_batches (feed_id, started_at desc);
alter table feed_batches enable row level security;

-- The batch's id, or -1 while another batch of the Feed runs, or -2 when it would cross the day's limit.
create or replace function claim_feed_batch(p_feed text, p_items integer, p_limit integer) returns bigint
language plpgsql set search_path = public as $$
declare
  used bigint;
  batch bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ziffr-feed-batch:' || p_feed));
  if exists (select 1 from feed_batches where feed_id = p_feed and finished_at is null and started_at > now() - interval '10 minutes') then
    return -1;
  end if;
  select coalesce(sum(coalesce(taken, items)), 0) into used from feed_batches where feed_id = p_feed and started_at > now() - interval '24 hours';
  if used + p_items > p_limit then
    return -2;
  end if;
  insert into feed_batches (feed_id, items) values (p_feed, p_items) returning id into batch;
  delete from feed_batches where feed_id = p_feed and started_at < now() - interval '2 days';
  return batch;
end $$;
revoke execute on function claim_feed_batch(text, integer, integer) from public, anon, authenticated;
