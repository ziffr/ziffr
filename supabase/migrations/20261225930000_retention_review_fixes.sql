-- Retention, fixes from the security review of spec 0033 (ticket #384; GLOSSARY: Retention, Condensed Value).

-- A period that was condensed is refused with a code of its own (ZF446): ZF441 is also the Workspace limit's, and a path
-- that writes a Metric and its values together would have told people the wrong thing.
create or replace function observations_not_condensed() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value and new.metric_id = old.metric_id
    and new.period_start = old.period_start then return new; end if;
  if exists (select 1 from condensed_values c where c.metric_id = new.metric_id and new.period_start between c.period_start and c.period_end)
    or (tg_op = 'UPDATE' and exists (select 1 from condensed_values c where c.metric_id = old.metric_id and old.period_start between c.period_start and c.period_end)) then
    raise exception using errcode = 'ZF446', message = 'This period was condensed';
  end if;
  return new;
end;
$$;

-- The removal of a condensed span's originals now names the Condensed Value that stands for them and refuses (ZF445)
-- unless that very row is still there, covering exactly the periods, under the Metric's row: a run that took the span
-- over from a stalled one cannot take the Condensed Value back and let the other delete the originals. And a Correction
-- still waiting for a decision holds its period as open work does, also when its Action was closed meanwhile.
drop function retention_remove_values(uuid, int, date, date, date[], int, boolean);
create or replace function retention_remove_values(p_ws uuid, p_metric int, p_from date, p_to date, p_periods date[], p_expected int, p_states boolean, p_condensed uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ids bigint[]; old_ids bigint[]; n_obs int; n_rows int; n_hist int; n_targets int; n_states int := 0;
begin
  perform 1 from metrics where id = p_metric and workspace_id = p_ws for update;
  if not found then raise exception using errcode = 'ZF445', message = 'That Metric was not found'; end if;
  if p_condensed is not null and not exists (select 1 from condensed_values c where c.id = p_condensed and c.workspace_id = p_ws
      and c.metric_id = p_metric and c.period_start = p_from and c.period_end = p_to) then
    raise exception using errcode = 'ZF445', message = 'The Condensed Value is no longer there';
  end if;
  if exists (select 1 from period_states s where s.metric_id = p_metric and s.state in ('asked', 'submitted', 'approval')
      and s.period_start between p_from and p_to and (p_periods is null or s.period_start = any (p_periods)))
    or exists (select 1 from actions a where a.workspace_id = p_ws and a.metric_id = p_metric and a.status in ('open', 'answered')
      and a.period_start between p_from and p_to and (p_periods is null or a.period_start = any (p_periods)))
    or exists (select 1 from actions a join thread_messages t on t.action_id = a.id where a.workspace_id = p_ws and a.metric_id = p_metric
      and t.correction_status = 'proposed' and a.period_start between p_from and p_to and (p_periods is null or a.period_start = any (p_periods))) then
    raise exception using errcode = 'ZF444', message = 'Open work holds a period';
  end if;
  select coalesce(array_agg(o.id), '{}') into ids from observations o
    where o.workspace_id = p_ws and o.metric_id = p_metric and o.period_start between p_from and p_to and (p_periods is null or o.period_start = any (p_periods));
  if coalesce(array_length(ids, 1), 0) <> p_expected then
    raise exception using errcode = 'ZF445', message = 'The values changed since they were counted';
  end if;
  select coalesce(array_agg(distinct h.observation_id), '{}') into old_ids from observation_history h
    where h.workspace_id = p_ws and h.metric_id = p_metric and h.period_start between p_from and p_to and (p_periods is null or h.period_start = any (p_periods));
  delete from breakdown_rows where workspace_id = p_ws and observation_id = any (ids);
  get diagnostics n_rows = row_count;
  delete from breakdown_history where workspace_id = p_ws and observation_id = any (ids || old_ids);
  delete from observations where workspace_id = p_ws and id = any (ids);
  get diagnostics n_obs = row_count;
  delete from observation_history where workspace_id = p_ws and metric_id = p_metric
    and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
  get diagnostics n_hist = row_count;
  delete from series_values where workspace_id = p_ws and metric_id = p_metric and kind = 'target'
    and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
  get diagnostics n_targets = row_count;
  if p_states then
    delete from period_states where metric_id = p_metric and period_start between p_from and p_to and (p_periods is null or period_start = any (p_periods));
    get diagnostics n_states = row_count;
  end if;
  return jsonb_build_object('values', n_obs, 'breakdown_rows', n_rows, 'superseded', n_hist, 'targets', n_targets, 'states', n_states);
end $$;
revoke execute on function retention_remove_values(uuid, int, date, date, date[], int, boolean, uuid) from public, anon, authenticated;
grant execute on function retention_remove_values(uuid, int, date, date, date[], int, boolean, uuid) to service_role;

-- Which confirmation (the id of the Metric's cap) a run worked under, so the cap counts what earlier runs took of it, and
-- of no other confirmation.
alter table retention_runs add column confirmation text;
