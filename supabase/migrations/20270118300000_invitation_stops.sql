-- "Do not invite me again" (spec 0040, ticket 5; GLOSSARY: Invitation): an address that used the one-click link in an
-- invitation email gets no more invitation emails from any Workspace on the Installation. Keyed by the same canonical
-- form of the address as the daily limits (no +tag; no dots for Gmail). Only the service role reads or writes it: no
-- policies, so the public keys see nothing.
create table invitation_stops (
  address_key text primary key check (char_length(address_key) between 3 and 254),
  created_at timestamptz not null default now()
);
alter table invitation_stops enable row level security;

-- claim_invitation_email as it was, with one more answer: 'stopped' when the address asked not to be invited again. It is
-- checked before anything is counted or recorded, so a stopped address costs no limit and gets no mail.
create or replace function claim_invitation_email(p_invitation bigint, p_sender text, p_address_key text, p_per_workspace int, p_per_address int, p_per_sender int)
returns text language plpgsql security definer set search_path = public as $$
declare inv record; ends timestamptz; lim trial_limits;
begin
  if p_sender is null or p_address_key is null then return 'used'; end if;
  if exists (select 1 from invitation_stops where address_key = p_address_key) then return 'stopped'; end if;
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
  -- Checked again under the address's lock, so a stop that lands while a send is claimed still holds.
  if exists (select 1 from invitation_stops where address_key = p_address_key) then return 'stopped'; end if;
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
