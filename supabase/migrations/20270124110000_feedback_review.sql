-- Feedback review (spec 0049, ticket #919; GLOSSARY: Feedback): with `ZIFFR_FEEDBACK_MODE=review` a
-- maintainer approves, edits or rejects each feedback before it is filed. Add-only: new columns on `feedback` and one
-- function; no rows are touched, so the demo guard is not involved. The browser roles still have no grant.
alter table feedback
  add column edited_by_team boolean not null default false,
  add column reviewed_at timestamptz;

-- One review step in one transaction: moves a feedback that is still waiting for review to `open` (approve, so the
-- bridge files it) or `closed` (reject), optionally with new words (edit), and writes the message the person reads in
-- My feedback (from_team). Only a feedback that is waiting changes, so two maintainers at once cannot both decide.
-- Returns {ref, edited}: the feedback's opaque public_ref (what the Installation audit names) and whether the words really
-- changed, or null when it was not waiting.
create or replace function feedback_review(p_id uuid, p_status text, p_words text, p_message text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare ref text; old_words text; edited boolean;
begin
  if p_status not in ('open', 'closed') then raise exception 'feedback_review: bad status'; end if;
  select words into old_words from feedback where id = p_id and status = 'waiting_for_review' for update;
  if not found then return null; end if;
  edited := p_words is not null and p_words <> old_words;
  update feedback set status = p_status, words = case when edited then p_words else words end,
    edited_by_team = edited_by_team or edited, reviewed_at = now(), updated_at = now()
    where id = p_id returning public_ref into ref;
  -- An edit is always told, even when the caller gave no message of its own.
  if p_message is not null or edited then
    insert into feedback_messages (feedback_id, from_team, words)
      values (p_id, true, coalesce(p_message, 'The Ziffr team edited your words before they were posted. What you see above is what was posted.'));
  end if;
  return jsonb_build_object('ref', ref, 'edited', edited);
end $$;
revoke execute on function feedback_review(uuid, text, text, text) from public, anon, authenticated;
grant execute on function feedback_review(uuid, text, text, text) to service_role;
