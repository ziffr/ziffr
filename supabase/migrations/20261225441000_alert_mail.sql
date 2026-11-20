-- Alert email never holds back Prompts (spec 0032, ticket #374): Alert emails are sent after everything else, may use at
-- most a share of a Workspace's daily email budget (the share comes from the core, mail.ts), and carry the Alert they
-- are about so that their one-click unsubscribe pauses that Alert only.
alter table deliveries add column alert_id bigint references alerts(id) on delete set null;

-- Chosen as before, but Alert messages last: a long queue of them can never fill a run before a Prompt or a task.
create or replace function due_deliveries_via(p_connector text, p_limit int, p_max_attempts int)
returns setof bigint language sql stable security definer set search_path = public as $$
  select id from deliveries
  where mail_state = 'queued' and connector = p_connector and attempts < p_max_attempts
    and (not_before is null or not_before <= now())
    and (last_attempt_at is null or attempts = 0 or last_attempt_at <= now() - make_interval(mins => power(2, attempts - 1)::int))
  order by (kind = 'alert'), id
  limit least(greatest(p_limit, 1), 500)
$$;

-- The same claim as before, with a limit of the Workspace's own for Alert emails: past it an Alert waits (as past any
-- limit) while everything else still goes out.
drop function claim_delivery_send(bigint, text, int, int, int, int);
create or replace function claim_delivery_send(p_id bigint, p_address_key text, p_per_workspace int, p_per_address int, p_per_sender int, p_max_attempts int, p_alerts_per_workspace int)
returns text language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if p_address_key is null then return 'gone'; end if;
  select id, workspace_id, sender_id, kind into d from deliveries where id = p_id and mail_state = 'queued' and attempts < p_max_attempts;
  if not found then return 'gone'; end if;
  perform pg_advisory_xact_lock(hashtext('mail-workspace:' || d.workspace_id::text));
  perform pg_advisory_xact_lock(hashtext('mail-address:' || p_address_key));
  if d.sender_id is not null then perform pg_advisory_xact_lock(hashtext('mail-sender:' || d.sender_id)); end if;
  if (select count(*) from email_sends where workspace_id = d.workspace_id and sent_at > now() - interval '24 hours') >= p_per_workspace
     or (select count(*) from email_sends where address_key = p_address_key and sent_at > now() - interval '1 hour') >= p_per_address
     or (d.sender_id is not null and (select count(*) from email_sends where sender_id = d.sender_id and sent_at > now() - interval '24 hours') >= p_per_sender)
     or (d.kind = 'alert' and (select count(*) from email_sends s join deliveries x on x.id = s.delivery_id where s.workspace_id = d.workspace_id and x.kind = 'alert' and s.sent_at > now() - interval '24 hours') >= p_alerts_per_workspace) then
    update deliveries set not_before = now() + interval '10 minutes' where id = d.id;
    return 'wait';
  end if;
  update deliveries set mail_state = 'sending', last_attempt_at = now(), not_before = null where id = d.id and mail_state = 'queued';
  if not found then return 'gone'; end if;
  insert into email_sends (delivery_id, workspace_id, sender_id, address_key) values (d.id, d.workspace_id, d.sender_id, p_address_key);
  return 'ok';
end $$;
revoke execute on function claim_delivery_send(bigint, text, int, int, int, int, int) from public, anon, authenticated;
grant execute on function claim_delivery_send(bigint, text, int, int, int, int, int) to service_role;
