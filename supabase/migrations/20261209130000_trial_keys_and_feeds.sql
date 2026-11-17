-- Keys and Feeds in a Trial Workspace (spec 0021): at most 2 Access Keys of people, 2 Feeds and 2 Feed Keys per Feed
-- that still work, and none working past the trial's last day. Kept here like the Metric cap: each trigger takes the
-- workspace's row lock first, so keys or Feeds made at the same moment wait for each other and cannot all pass.
create or replace function access_keys_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
declare ends timestamptz;
begin
  select trial_ends_at into ends from workspaces where id = new.workspace_id for update;
  if ends is null then return new; end if;
  -- A key works through the end of its last day (UTC): never a day past the trial's.
  new.expires_on := least(new.expires_on, (ends at time zone 'UTC')::date);
  if new.feed_id is null then
    if (select count(*) from access_keys where workspace_id = new.workspace_id and feed_id is null and revoked_at is null and expires_on >= current_date) >= 2 then
      raise exception using errcode = 'ZF431', message = 'access_keys_per_trial';
    end if;
  elsif (select count(*) from access_keys where feed_id = new.feed_id and revoked_at is null and expires_on >= current_date) >= 2 then
    raise exception using errcode = 'ZF432', message = 'feed_keys_per_feed';
  end if;
  return new;
end $$;

create trigger access_keys_in_trial before insert on access_keys
  for each row execute function access_keys_in_trial();

create or replace function feeds_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from workspaces where id = new.workspace_id and trial_ends_at is not null for update;
  if not found then return new; end if;
  if (select count(*) from feeds where workspace_id = new.workspace_id and deleted_at is null) >= 2 then
    raise exception using errcode = 'ZF433', message = 'feeds_per_trial';
  end if;
  return new;
end $$;

create trigger feeds_in_trial before insert on feeds
  for each row execute function feeds_in_trial();
