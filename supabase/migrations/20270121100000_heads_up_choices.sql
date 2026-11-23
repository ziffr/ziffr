-- Heads-ups, a person's own rows (spec 0041, ticket 14; GLOSSARY: Heads-up). Follows 20270121000000_heads_up_delivery.sql.
-- Leaving or being removed ends the person's choices and what they were told in that Workspace, as it ends their Alerts, so
-- that someone who comes back is not messaged without switching it on again and no row says which pairs a former member was
-- told about. The caps on a person's Not useful and mutes are counted in the database, so two calls at once cannot pass them.
-- A message not sent (it failed, or was refused as it left) gives its place in the week back. A mute and a Heads-up message
-- can only name Metrics of their own Workspace.

create or replace function end_heads_up_choices() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from heads_up_settings where workspace_id = old.workspace_id and person_id = old.user_id;
  delete from heads_up_dismissed where workspace_id = old.workspace_id and person_id = old.user_id;
  delete from heads_up_mutes where workspace_id = old.workspace_id and person_id = old.user_id;
  delete from heads_up_told where workspace_id = old.workspace_id and person_id = old.user_id;
  return old;
end $$;
create trigger end_heads_up_choices after delete on memberships for each row execute function end_heads_up_choices();

-- At most 2,000 Not useful and 500 mutes a person in a Workspace; one that is already there is not counted again.
create or replace function heads_up_choice_cap() returns trigger language plpgsql set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('heads_up_choices:' || new.workspace_id::text || ':' || new.person_id));
  if tg_table_name = 'heads_up_dismissed' then
    if exists (select 1 from heads_up_dismissed where workspace_id = new.workspace_id and person_id = new.person_id and key = new.key) then return new; end if;
    select count(*) into n from heads_up_dismissed where workspace_id = new.workspace_id and person_id = new.person_id;
    if n >= 2000 then raise exception 'heads_up_choice_cap' using errcode = '23514'; end if;
  else
    if exists (select 1 from heads_up_mutes where workspace_id = new.workspace_id and person_id = new.person_id and metric_id = new.metric_id) then return new; end if;
    select count(*) into n from heads_up_mutes where workspace_id = new.workspace_id and person_id = new.person_id;
    if n >= 500 then raise exception 'heads_up_choice_cap' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger heads_up_dismissed_cap before insert on heads_up_dismissed for each row execute function heads_up_choice_cap();
create trigger heads_up_mutes_cap before insert on heads_up_mutes for each row execute function heads_up_choice_cap();

-- A mute names a Metric of its own Workspace only.
create or replace function heads_up_mutes_same_workspace() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from metrics where id = new.metric_id and workspace_id = new.workspace_id) then
    raise exception 'A mute must name a Metric of its own Workspace' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger heads_up_mutes_same_workspace before insert or update on heads_up_mutes for each row execute function heads_up_mutes_same_workspace();

-- A Heads-up message names Metrics of its own Workspace only.
create or replace function deliveries_heads_up_same_workspace() returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from unnest(array[new.heads_up_metric_a, new.heads_up_metric_b]) as m(id) where m.id is not null and not exists (select 1 from metrics where metrics.id = m.id and metrics.workspace_id = new.workspace_id)) then
    raise exception 'A Heads-up message must name Metrics of its own Workspace' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger deliveries_heads_up_same_workspace before insert or update on deliveries for each row when (new.heads_up_metric_a is not null or new.heads_up_metric_b is not null) execute function deliveries_heads_up_same_workspace();

-- Gives back the place of a message that was counted but not sent: removes the person's open row for the key, once (a second
-- call finds none and changes nothing).
create or replace function release_heads_up_message(p_ws uuid, p_person text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('heads_up_told:' || p_ws::text || ':' || p_person));
  delete from heads_up_told where id = (select id from heads_up_told where workspace_id = p_ws and person_id = p_person and key = p_key and ended_at is null order by id desc limit 1);
end $$;
revoke execute on function release_heads_up_message(uuid, text, text) from public, anon, authenticated;
grant execute on function release_heads_up_message(uuid, text, text) to service_role;
