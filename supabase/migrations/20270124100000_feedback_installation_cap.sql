-- Feedback: a cap for the whole Installation per day (spec 0049, ticket #947; GLOSSARY: Feedback). The per-person and
-- per-Workspace limits do not stop many new accounts from filling the queue the bridge files from, so feedback_create
-- takes a third count: all feedback made in the last 24 hours, whoever sent it. The function gets one more parameter
-- (the cap, passed in by the core from an Installation Setting, because the database cannot read settings) and the old
-- signature is dropped, so no caller can skip the cap. The count and the insert stay in one transaction under a lock per
-- person, then per Workspace, then one for the Installation (always in that order, so two requests never wait on each
-- other in a circle). Over the Installation's cap the function raises 'feedback_installation_cap' instead of returning no
-- row, so the core can tell it from the person's or the Workspace's limit; nothing is inserted and nothing is returned.
-- Visibility and grants are as before: the service role only, never a browser role.
drop function if exists feedback_create(text, uuid, text, text, text, text, int, int);
create or replace function feedback_create(
  p_person text, p_workspace uuid, p_kind text, p_words text, p_route text, p_version text, p_per_person int, p_per_workspace int, p_per_installation int
) returns setof feedback
language plpgsql security definer set search_path = public as $$
declare made feedback;
begin
  perform pg_advisory_xact_lock(hashtextextended('feedback:' || p_person, 0));
  if p_workspace is not null then perform pg_advisory_xact_lock(hashtextextended('feedback-ws:' || p_workspace::text, 0)); end if;
  perform pg_advisory_xact_lock(hashtextextended('feedback-installation', 0));
  if (select count(*) from feedback where person_id = p_person and created_at > now() - interval '24 hours') >= p_per_person then return; end if;
  if p_workspace is not null and (select count(*) from feedback where workspace_id = p_workspace and created_at > now() - interval '24 hours') >= p_per_workspace then return; end if;
  if (select count(*) from feedback where created_at > now() - interval '24 hours') >= p_per_installation then
    raise exception 'feedback_installation_cap' using errcode = 'P0001';
  end if;
  insert into feedback (person_id, workspace_id, kind, words, route, app_version)
    values (p_person, p_workspace, p_kind, p_words, p_route, p_version) returning * into made;
  return next made;
end $$;
revoke execute on function feedback_create(text, uuid, text, text, text, text, int, int, int) from public, anon, authenticated;
grant execute on function feedback_create(text, uuid, text, text, text, text, int, int, int) to service_role;
