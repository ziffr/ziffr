-- Firing Alerts (spec 0032, ticket #374; GLOSSARY: Alert, Delivery): the Delivery kind `alert`, the claim that lets one
-- call fire an Alert once per crossing, and the daily message limits, counted in the database so values arriving at once
-- cannot pass them (as the claim_* functions do). The limits themselves come from the core (alert-limits.ts).
alter table deliveries drop constraint deliveries_kind_check;
alter table deliveries add constraint deliveries_kind_check
  check (kind in ('question','task','reminder','reply','correction','decision','closed','done','prompt','notice','alert'));

-- Fires an Alert: true for the one call that moves it from armed to fired (a per-period kind: or from another period's
-- fired state), so two values arriving at once send one message. An Alert that is paused fires nothing.
create or replace function claim_alert_fire(p_id bigint, p_ws uuid, p_period date, p_per_period boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update alerts set state = 'fired', fired_period = p_period, fired_at = now(), updated_at = now()
   where id = p_id and workspace_id = p_ws and paused is null and not paused_by_person
     and (state = 'armed' or (p_per_period and fired_period is distinct from p_period));
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke execute on function claim_alert_fire(bigint, uuid, date, boolean) from public, anon, authenticated;
grant execute on function claim_alert_fire(bigint, uuid, date, boolean) to service_role;

-- How many Alert messages a person and their Workspace were sent on a day. The Workspace's own row has person_id ''.
-- `over` counts what did not go, so Owners and Admins can see that a limit was reached (counts only); `noted` is that
-- the person has had their one last note for the day.
create table alert_day_counts (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null,
  day date not null,
  sent int not null default 0,
  over int not null default 0,
  noted boolean not null default false,
  primary key (workspace_id, person_id, day)
);
create index alert_day_counts_day_idx on alert_day_counts (day);
alter table alert_day_counts enable row level security;
select attach_demo_guard('alert_day_counts');

-- Takes one Alert message of the day for a person, in one step under a lock of the Workspace: 'send' while the person
-- and the Workspace are under their limits; 'note' once, for the first message over the person's limit (the one
-- last message that says more fired); 'none' for every other. Nothing is counted for a message that does not go.
create or replace function claim_alert_message(p_ws uuid, p_person text, p_day date, p_per_person int, p_per_workspace int) returns text
language plpgsql security definer set search_path = public as $$
declare w alert_day_counts; p alert_day_counts;
begin
  perform pg_advisory_xact_lock(hashtext('alert_messages:' || p_ws::text));
  delete from alert_day_counts where workspace_id = p_ws and day < p_day - 7;
  insert into alert_day_counts (workspace_id, person_id, day) values (p_ws, '', p_day), (p_ws, p_person, p_day) on conflict do nothing;
  select * into w from alert_day_counts where workspace_id = p_ws and person_id = '' and day = p_day;
  select * into p from alert_day_counts where workspace_id = p_ws and person_id = p_person and day = p_day;
  if w.sent >= p_per_workspace then
    update alert_day_counts set over = over + 1 where workspace_id = p_ws and person_id = '' and day = p_day;
    return 'none';
  end if;
  if p.sent >= p_per_person then
    update alert_day_counts set over = over + 1, noted = true where workspace_id = p_ws and person_id = p_person and day = p_day;
    return case when p.noted then 'none' else 'note' end;
  end if;
  update alert_day_counts set sent = sent + 1 where workspace_id = p_ws and person_id in ('', p_person) and day = p_day;
  return 'send';
end $$;
revoke execute on function claim_alert_message(uuid, text, date, int, int) from public, anon, authenticated;
grant execute on function claim_alert_message(uuid, text, date, int, int) to service_role;
