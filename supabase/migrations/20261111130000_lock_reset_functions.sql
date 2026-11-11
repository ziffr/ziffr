-- The reset functions wipe all demo data. Only the server (service role) may call them;
-- PostgREST would otherwise expose them to anyone holding the public anon key.
-- They stay SECURITY DEFINER because TRUNCATE ... RESTART IDENTITY needs the sequence owner,
-- and EXECUTE is granted to service_role alone.
alter function prototype_reset() security definer;
alter function prototype_reset_decks() security definer;
revoke execute on function prototype_reset() from public, anon, authenticated;
revoke execute on function prototype_reset_decks() from public, anon, authenticated;
grant execute on function prototype_reset() to service_role;
grant execute on function prototype_reset_decks() to service_role;
