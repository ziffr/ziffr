-- The test email's limit (spec 0025; GLOSSARY: Installation Settings, Installation Admin): at most a few an hour per
-- Installation Admin, so the page cannot be used to knock on mail servers. Counted and recorded in one step under a
-- lock per person, in the Installation's own audit, where each attempt is an event anyway; parallel clicks count one
-- after the other.

-- Records a test email attempt for the person when they are under the limit for the last hour; false otherwise.
create or replace function claim_installation_test_email(p_person text, p_actor_name text, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  used int;
begin
  perform pg_advisory_xact_lock(hashtext('installation:test-email:' || p_person));
  select count(*) into used from installation_audit_events
    where actor_id = p_person and kind = 'setting.test_email' and at > now() - interval '1 hour';
  if used >= p_limit then return false; end if;
  insert into installation_audit_events (actor_id, actor_name, kind, subject)
    values (left(p_person, 64), coalesce(nullif(left(trim(p_actor_name), 120), ''), 'Someone'), 'setting.test_email', 'ZIFFR_SMTP_URL');
  return true;
end $$;
revoke execute on function claim_installation_test_email(text, text, int) from public, anon, authenticated;
grant execute on function claim_installation_test_email(text, text, int) to service_role;
