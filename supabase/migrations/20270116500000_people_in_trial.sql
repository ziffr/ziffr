-- People in a trial (spec 0040, ticket 3; ADR 0015; GLOSSARY: Trial Limit, Trial Workspace, Invitation). A Trial Workspace
-- may now invite colleagues, within numbers the database keeps: how many people it holds (ZF435), how many invitation
-- emails it and all trials together send a day and one open invitation per address (ZF436), and no invitation before
-- the Owner has recorded a value of their own (ZF439). Every count is taken under a lock on the Workspace's row (or, for
-- all trials together, one advisory lock), so requests at once wait for each other and cannot all pass. Lowering a
-- number never deletes anything: only the next invitation or join is refused.

alter table trial_limits
  add column people int not null default 5 check (people between 1 and 25),
  add column invitations_per_day int not null default 10 check (invitations_per_day between 0 and 50),
  add column invitations_all_per_day int not null default 500 check (invitations_all_per_day between 0 and 5000);

-- The numbers in effect, with the new ones (the row the table gives when it has none is the defaults).
create or replace function trial_limit_numbers() returns trial_limits
language sql stable security definer set search_path = public as $$
  select coalesce((select t from trial_limits t where only_row), row(true, 25, 2, 2, 1, 5, now(), 5, 10, 500)::trial_limits)
$$;
revoke execute on function trial_limit_numbers() from public, anon, authenticated;

create or replace function trial_limit_names() returns text
language sql immutable as $$ select '^ZIFFR_TRIAL_(DAYS|GRACE_DAYS|MAX|LIMIT_(PEOPLE|INVITATIONS_PER_DAY|INVITATIONS_ALL_PER_DAY|METRICS|MESSAGES_PER_DAY|KEYS|FEEDS|ASSISTANTS|WEBHOOKS|WEBHOOK_SENDS_PER_DAY|VIEW_LINKS))$' $$;

create or replace function recompute_trial_limits(p_env jsonb) returns void
language sql security definer set search_path = public as $$
  insert into trial_limits (only_row, metrics, keys, feeds, assistants, view_links, people, invitations_per_day, invitations_all_per_day, updated_at) values (true,
    trial_limit_pick('ZIFFR_TRIAL_LIMIT_METRICS', 5, 100, 25, p_env), trial_limit_pick('ZIFFR_TRIAL_LIMIT_KEYS', 1, 10, 2, p_env),
    trial_limit_pick('ZIFFR_TRIAL_LIMIT_FEEDS', 1, 10, 2, p_env), trial_limit_pick('ZIFFR_TRIAL_LIMIT_ASSISTANTS', 1, 5, 1, p_env),
    trial_limit_pick('ZIFFR_TRIAL_LIMIT_VIEW_LINKS', 0, 20, 5, p_env),
    trial_limit_pick('ZIFFR_TRIAL_LIMIT_PEOPLE', 1, 25, 5, p_env), trial_limit_pick('ZIFFR_TRIAL_LIMIT_INVITATIONS_PER_DAY', 0, 50, 10, p_env),
    trial_limit_pick('ZIFFR_TRIAL_LIMIT_INVITATIONS_ALL_PER_DAY', 0, 5000, 500, p_env), now())
  on conflict (only_row) do update set metrics = excluded.metrics, keys = excluded.keys, feeds = excluded.feeds,
    assistants = excluded.assistants, view_links = excluded.view_links, people = excluded.people,
    invitations_per_day = excluded.invitations_per_day, invitations_all_per_day = excluded.invitations_all_per_day, updated_at = now()
$$;
revoke execute on function recompute_trial_limits(jsonb) from public, anon, authenticated;

-- The address an invitation is for in its canonical form (no +tag; no dots for Gmail), kept by the core when it makes
-- the invitation, so "one open invitation per address" cannot be passed by writing the same mailbox another way.
alter table invitations add column address_key text check (address_key is null or char_length(address_key) between 3 and 254);
create index on invitations (workspace_id, address_key) where address_key is not null;

-- Whether a send counted against the trials' shared daily number, fixed when it was claimed: a trial that is later kept
-- does not move its past sends in or out of that count.
alter table invitation_emails add column in_trial boolean not null default false;
create index on invitation_emails (sent_at) where in_trial;

-- The Owner's first value: a value of their own, recorded by hand, in a form, by key or by an assistant for them, never
-- one that came in through a Feed or an Import. Until then nobody can be invited: a bot that signs in cannot answer a
-- Prompt, so it cannot reach the invitations cheaply (a person who signs in and posts a form does; the gate raises the cost, it is not a proof).
create or replace function trial_owner_has_a_value(p_workspace uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from observations o
    join memberships m on m.workspace_id = o.workspace_id and m.user_id = o.submitter_id and m.role = 'owner'
    where o.workspace_id = p_workspace and not o.imported)
$$;
revoke execute on function trial_owner_has_a_value(uuid) from public, anon, authenticated;

-- The people a trial holds for its limit: everyone who is a member, and every invitation that is still open (not
-- revoked, not accepted, not past its last day), because each of them will take a place the moment it is used.
create or replace function trial_people(p_workspace uuid, p_joining text default null) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from memberships where workspace_id = p_workspace)::int
       + (select count(*) from invitations where workspace_id = p_workspace and revoked_at is null and accepted_at is null and expires_at > now())::int
       -- An invitation accepted a moment ago whose person has not joined yet (the core accepts, then inserts the membership
       -- in a second statement) still holds its place, so nobody can take it in that gap; p_joining is the one joining now.
       + (select count(*) from invitations i where i.workspace_id = p_workspace and i.accepted_at > now() - interval '2 minutes'
            and i.accepted_by is distinct from p_joining
            and not exists (select 1 from memberships m where m.workspace_id = p_workspace and m.user_id = i.accepted_by))::int
$$;
-- The core reads it for the Owner's view of usage; the public keys cannot.
revoke execute on function trial_people(uuid, text) from public, anon, authenticated;
grant execute on function trial_people(uuid, text) to service_role;

-- Before a person joins a Trial Workspace, or an invitation is made for one: the Workspace's row is locked first, so
-- parallel joins and invitations wait for each other. Refused with ZF435 (people), ZF436 (a second open invitation for
-- one address) or ZF439 (no value of the Owner's own yet). Outside a trial, nothing here applies.
create or replace function people_in_trial() returns trigger
language plpgsql security definer set search_path = public as $$
declare ends timestamptz; joining text;
begin
  -- The row is locked only for a trial: other Workspaces' joins and invitations never wait here.
  select trial_ends_at into ends from workspaces where id = new.workspace_id and trial_ends_at is not null for update;
  if ends is null then return new; end if;
  if tg_table_name = 'memberships' then
    -- A person who is a member already takes no second place (an upsert of the same row).
    if exists (select 1 from memberships where workspace_id = new.workspace_id and user_id = new.user_id) then return new; end if;
    joining := new.user_id;
  else
    if not trial_owner_has_a_value(new.workspace_id) then
      raise exception using errcode = 'ZF439', message = 'invitations_after_first_value';
    end if;
    if new.email is not null and exists (
      select 1 from invitations i where i.workspace_id = new.workspace_id and i.revoked_at is null and i.accepted_at is null and i.expires_at > now()
        and coalesce(i.address_key, lower(i.email)) = coalesce(new.address_key, lower(new.email))) then
      raise exception using errcode = 'ZF436', message = 'invitation_open_for_address';
    end if;
  end if;
  if trial_people(new.workspace_id, joining) >= (trial_limit_numbers()).people then
    raise exception using errcode = 'ZF435', message = 'people_per_trial';
  end if;
  return new;
end $$;

create trigger people_in_trial before insert on memberships for each row execute function people_in_trial();
create trigger people_in_trial before insert on invitations for each row execute function people_in_trial();

-- The claim of an invitation email (replaces 20261117110000's, same signature): in a trial it also counts the trial's
-- own emails of the day and all trials' together, under the locks, and refuses with ZF436 ('invitations_per_trial_day',
-- 'invitations_all_trials_day'). A trial that has ended sends nothing. The numbers are the Trial Limits' row.
create or replace function claim_invitation_email(p_invitation bigint, p_sender text, p_address_key text, p_per_workspace int, p_per_address int, p_per_sender int)
returns text language plpgsql security definer set search_path = public as $$
declare inv record; ends timestamptz; lim trial_limits;
begin
  if p_sender is null or p_address_key is null then return 'used'; end if;
  select id, workspace_id, email_sends, email_sent_at, revoked_at, accepted_at, expires_at into inv from invitations where id = p_invitation for update;
  if not found or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at < now() or inv.email_sends >= 3
     or (inv.email_sent_at is not null and inv.email_sent_at > now() - interval '1 minute') then
    return 'used';
  end if;
  select trial_ends_at into ends from workspaces where id = inv.workspace_id;
  if ends is not null and ends <= now() then return 'used'; end if;
  perform pg_advisory_xact_lock(hashtext('invitation-address:' || p_address_key));
  perform pg_advisory_xact_lock(hashtext('invitation-workspace:' || inv.workspace_id::text));
  perform pg_advisory_xact_lock(hashtext('invitation-sender:' || p_sender));
  if ends is not null then
    -- One lock for all trials, always taken last, so no two sends can pass the shared number together.
    perform pg_advisory_xact_lock(hashtext('invitation-trials'));
    lim := trial_limit_numbers();
    if (select count(*) from invitation_emails where workspace_id = inv.workspace_id and sent_at > now() - interval '24 hours') >= lim.invitations_per_day then
      raise exception using errcode = 'ZF436', message = 'invitations_per_trial_day';
    end if;
    if (select count(*) from invitation_emails where in_trial and sent_at > now() - interval '24 hours') >= lim.invitations_all_per_day then
      raise exception using errcode = 'ZF436', message = 'invitations_all_trials_day';
    end if;
  end if;
  if (select count(*) from invitation_emails where workspace_id = inv.workspace_id and sent_at > now() - interval '24 hours') >= p_per_workspace
     or (select count(*) from invitation_emails where address_key = p_address_key and sent_at > now() - interval '24 hours') >= p_per_address
     or (select count(*) from invitation_emails where sent_by = p_sender and sent_at > now() - interval '24 hours') >= p_per_sender then
    return 'limit';
  end if;
  insert into invitation_emails (invitation_id, workspace_id, sent_by, address_key, in_trial) values (inv.id, inv.workspace_id, p_sender, p_address_key, ends is not null);
  update invitations set email_sends = email_sends + 1, email_sent_at = now(), email_error = null where id = inv.id;
  return 'ok';
end $$;
revoke execute on function claim_invitation_email(bigint, text, text, int, int, int) from public, anon, authenticated;
grant execute on function claim_invitation_email(bigint, text, text, int, int, int) to service_role;

-- Accepting an invitation by email, in one transaction: the Workspace's row is locked, the invitation is checked to be
-- open now (not revoked, not expired, not accepted), it is marked accepted and the membership inserted. Two accepts, or
-- an accept and an invitation, at once cannot pass the people limit or leave a place half taken. 'ok' (also for someone who
-- is a member already), 'gone' (not open any more) or 'full' (a trial holds as many people as it may: nothing changed).
create or replace function accept_email_invitation(p_invitation bigint, p_person text) returns text
language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  select id, workspace_id, role, email, revoked_at, accepted_at, expires_at into inv from invitations where id = p_invitation for update;
  if not found or inv.email is null or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at <= now() then return 'gone'; end if;
  perform 1 from workspaces where id = inv.workspace_id for update;
  -- Inside one block, so a refusal takes the mark back with it.
  begin
    update invitations set accepted_at = now(), accepted_by = p_person where id = inv.id;
    if not exists (select 1 from memberships where workspace_id = inv.workspace_id and user_id = p_person) then
      insert into memberships (workspace_id, user_id, role) values (inv.workspace_id, p_person, inv.role);
    end if;
  exception when sqlstate 'ZF435' then
    return 'full';
  end;
  return 'ok';
end $$;
revoke execute on function accept_email_invitation(bigint, text) from public, anon, authenticated;
grant execute on function accept_email_invitation(bigint, text) to service_role;
