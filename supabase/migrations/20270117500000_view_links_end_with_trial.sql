-- A View Link made in a Trial Workspace ends no later than the trial (spec 0040, ticket 4; ADR 0015), as an Access Key
-- does: it shows a dashboard to someone outside the team, so it never outlives the trial it was made in. The clamp is in
-- the database whatever the caller, under the Workspace's row lock like the count of links that work (ZF437). A link
-- keeps the end date it was made with when the trial is subscribed to.
create or replace function view_links_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
declare ends timestamptz;
begin
  select trial_ends_at into ends from workspaces where id = new.workspace_id for update;
  if ends is null then return new; end if;
  -- A link works through its last day (UTC): never a day past the trial's.
  new.expires_at := least(new.expires_at, (ends at time zone 'UTC')::date);
  if (select count(*) from view_links where workspace_id = new.workspace_id and revoked_at is null and expires_at >= current_date) >= (trial_limit_numbers()).view_links then
    raise exception using errcode = 'ZF437', message = 'view_links_per_trial';
  end if;
  return new;
end $$;
