-- A way back after stopping requests by email (issue #1333; GLOSSARY: Prompt, Delivery). Only the person gets the
-- emails again: by their switch in Ziffr, by the Undo on the page that has just stopped them, or by confirming a message
-- the Metric's owner had sent to them. Only hashes of the two links are kept, each with the moment it ends, and both go
-- with the stop's row, so each works once.
alter table email_opt_outs add column undo_hash text check (undo_hash ~ '^[0-9a-f]{64}$');
alter table email_opt_outs add column undo_until timestamptz;
-- A mark of the mailbox the person stopped from (a hash, never the address): the confirmation message goes only there,
-- so someone who may change a Contact's address cannot have it sent to themselves.
alter table email_opt_outs add column address_hash text check (address_hash ~ '^[0-9a-f]{64}$');
alter table email_opt_outs add column resume_hash text check (resume_hash ~ '^[0-9a-f]{64}$');
alter table email_opt_outs add column resume_until timestamptz;
create unique index email_opt_outs_resume_hash on email_opt_outs (resume_hash) where resume_hash is not null;

-- When the confirmation message was last asked for. Kept apart from the stop, which opting back in removes, so that
-- stopping again does not start the wait anew.
alter table email_opt_out_notices add column resume_asked_at timestamptz;

-- True when the person may be asked now (and records that they are); false when they were asked within p_days. One
-- statement, so presses made at once ask once. A new row says the owners were never told, so it holds no notice back.
create or replace function claim_resume_ask(p_workspace uuid, p_person text, p_days int)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed text;
begin
  insert into email_opt_out_notices as n (workspace_id, person_id, notified_at, resume_asked_at)
  values (p_workspace, p_person, 'epoch', now())
  on conflict (workspace_id, person_id) do update set resume_asked_at = now()
    where n.resume_asked_at is null or n.resume_asked_at < now() - make_interval(days => p_days)
  returning n.person_id into claimed;
  return claimed is not null;
end $$;
revoke execute on function claim_resume_ask(uuid, text, int) from public, anon, authenticated;
grant execute on function claim_resume_ask(uuid, text, int) to service_role;
