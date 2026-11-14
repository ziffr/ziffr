-- Invitation emails, one row per send (spec 0004, ticket #72; GLOSSARY: Invitation). The daily limits count these:
-- by workspace, by the person who makes the send happen (invites or resends; across all their workspaces) and by a
-- canonical form of the address (no +tag; no dots for Gmail). A send is claimed in the same transaction under locks on all three, so parallel invitations
-- cannot pass the limits.
create table invitation_emails (
  id bigint generated always as identity primary key,
  invitation_id bigint not null references invitations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  sent_by text references profiles(id) on delete set null,
  address_key text not null check (char_length(address_key) between 3 and 254),
  sent_at timestamptz not null default now()
);
create index on invitation_emails (address_key, sent_at);
create index on invitation_emails (workspace_id, sent_at);
create index on invitation_emails (sent_by, sent_at);
alter table invitation_emails enable row level security;

-- 'ok' when the send is claimed; 'limit' when the workspace or the address had enough today; 'used' when the
-- invitation was emailed three times or under a minute ago, or is no longer open.
create or replace function claim_invitation_email(p_invitation bigint, p_sender text, p_address_key text, p_per_workspace int, p_per_address int, p_per_sender int)
returns text language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  if p_sender is null or p_address_key is null then return 'used'; end if;
  select id, workspace_id, email_sends, email_sent_at, revoked_at, accepted_at, expires_at into inv from invitations where id = p_invitation for update;
  if not found or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at < now() or inv.email_sends >= 3
     or (inv.email_sent_at is not null and inv.email_sent_at > now() - interval '1 minute') then
    return 'used';
  end if;
  perform pg_advisory_xact_lock(hashtext('invitation-address:' || p_address_key));
  perform pg_advisory_xact_lock(hashtext('invitation-workspace:' || inv.workspace_id::text));
  perform pg_advisory_xact_lock(hashtext('invitation-sender:' || p_sender));
  if (select count(*) from invitation_emails where workspace_id = inv.workspace_id and sent_at > now() - interval '24 hours') >= p_per_workspace
     or (select count(*) from invitation_emails where address_key = p_address_key and sent_at > now() - interval '24 hours') >= p_per_address
     or (select count(*) from invitation_emails where sent_by = p_sender and sent_at > now() - interval '24 hours') >= p_per_sender then
    return 'limit';
  end if;
  insert into invitation_emails (invitation_id, workspace_id, sent_by, address_key) values (inv.id, inv.workspace_id, p_sender, p_address_key);
  update invitations set email_sends = email_sends + 1, email_sent_at = now(), email_error = null where id = inv.id;
  return 'ok';
end $$;
-- Only the core (service role) may claim sends; the public keys cannot call it.
revoke execute on function claim_invitation_email(bigint, text, text, int, int, int) from public, anon, authenticated;
grant execute on function claim_invitation_email(bigint, text, text, int, int, int) to service_role;
