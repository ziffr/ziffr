-- Totals can now be made and changed (spec 0058, "Team totals", ticket #1225; GLOSSARY: Total). The database holds what
-- must be true however a row is written, and changes a Total's list and its opening in one step each, under a lock.
--
-- Error codes: ZF470 only a Total has parts; ZF471 not a part for this Total; ZF472 a Total takes no values;
-- ZF473 a Total's kind is fixed; ZF474 a Total adds this Metric up; ZF475 too many parts; ZF476 only the owner.

-- A Total is calculated: it holds the mark no formula can name, so that everything that asks whether a Metric has a
-- formula treats it as calculated, and it has no Source and no Workflow.
update metrics set formula = '{-}', sources = '{}', workflow_id = null where total_targets is not null;
alter table metrics add constraint metrics_total_is_calculated
  check (total_targets is null or (formula is not null and formula = '{-}' and cardinality(sources) = 0 and workflow_id is null));

-- It takes no values, and nobody is asked for them.
create or replace function total_takes_no_values() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from metrics where id = new.metric_id and total_targets is not null) then
    raise exception using errcode = 'ZF472', message = 'A Total is calculated and takes no values';
  end if;
  return new;
end;
$$;
create trigger observations_not_of_a_total before insert or update of metric_id on observations
  for each row execute function total_takes_no_values();
create trigger tokens_not_of_a_total before insert or update of metric_id on tokens
  for each row execute function total_takes_no_values();

-- Handing a Total over closes it, whoever writes the new owner; a Total stays one and keeps what its parts share; and a
-- Metric a Total adds up keeps it too, so no Total ever adds up unlike numbers.
create or replace function metrics_total_shape() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    new.total_opened_at := null;
    new.total_opened_by := null;
  end if;
  if old.total_targets is not null then
    if new.total_targets is null or (new.period, new.unit, new.format, new.aggregation) is distinct from (old.period, old.unit, old.format, old.aggregation) then
      raise exception using errcode = 'ZF473', message = 'A Total keeps its period, unit, format and Aggregation';
    end if;
  elsif new.total_targets is not null then
    if exists (select 1 from observations where metric_id = new.id) or exists (select 1 from tokens where metric_id = new.id) then
      raise exception using errcode = 'ZF472', message = 'A Total is calculated and takes no values';
    end if;
  end if;
  if ((new.period, new.unit, new.format, new.aggregation) is distinct from (old.period, old.unit, old.format, old.aggregation)
      or (old.formula is null and new.formula is not null))
     and exists (select 1 from total_parts where part_id = new.id) then
    raise exception using errcode = 'ZF474', message = 'A Total adds this Metric up';
  end if;
  return new;
end;
$$;
create trigger metrics_total_shape before update on metrics
  for each row execute function metrics_total_shape();

-- A part is a Metric of the same Workspace that takes values, counted like its Total; at most 50 of them. The Total's row
-- is locked, so changes of one list follow each other, and the part's, so it cannot change its kind meanwhile.
create or replace function total_parts_check() returns trigger
language plpgsql set search_path = public as $$
declare t record; p record;
begin
  select period, unit, format, aggregation, total_targets into t from metrics where id = new.total_id and workspace_id = new.workspace_id for update;
  if not found or t.total_targets is null then
    raise exception using errcode = 'ZF470', message = 'Only a Total has parts';
  end if;
  select period, unit, format, aggregation, total_targets, formula into p from metrics where id = new.part_id and workspace_id = new.workspace_id for share;
  if not found or p.total_targets is not null or p.formula is not null or p.aggregation = 'none'
     or (p.period, p.unit, p.format, p.aggregation) is distinct from (t.period, t.unit, t.format, t.aggregation) then
    raise exception using errcode = 'ZF471', message = 'A part is a Metric of the same Workspace that takes values, counted like its Total';
  end if;
  if tg_op = 'INSERT' and (select count(*) from total_parts where total_id = new.total_id) >= 50 then
    raise exception using errcode = 'ZF475', message = 'A Total adds up at most 50 Metrics';
  end if;
  return new;
end;
$$;

-- One change of a Total's list: add a part, give it a first and last period, or remove it. While the Total is open, only
-- its owner changes the list, saying they know who learns what; checked under the same lock that opening takes.
create or replace function change_total_part(ws uuid, total int, part int, change text, from_period date, to_period date, actor text, confirmed_open boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select owner_id, total_opened_at into t from metrics where id = total and workspace_id = ws and total_targets is not null for update;
  if not found then raise exception using errcode = 'ZF470', message = 'Only a Total has parts'; end if;
  if t.total_opened_at is not null and (t.owner_id is distinct from actor or confirmed_open is not true) then
    raise exception using errcode = 'ZF476', message = 'Only the owner changes what an open Total adds up';
  end if;
  if change = 'add' then
    insert into total_parts (total_id, part_id, workspace_id, first_period) values (total, part, ws, from_period);
  elsif change = 'window' then
    update total_parts set first_period = coalesce(from_period, first_period), last_period = to_period where total_id = total and part_id = part;
    if not found then raise exception using errcode = 'ZF471', message = 'Not a part of this Total'; end if;
  elsif change = 'remove' then
    delete from total_parts where total_id = total and part_id = part;
    if not found then raise exception using errcode = 'ZF471', message = 'Not a part of this Total'; end if;
  else
    raise exception 'unknown change';
  end if;
end;
$$;

-- Opens a Total for its owner, only if its list is still the one they were shown ("part first last", by part id).
-- Answers false, changing nothing, where it is not.
create or replace function open_total(ws uuid, total int, actor text, shown text[]) returns boolean
language plpgsql security definer set search_path = public as $$
declare t record; now_listed text[];
begin
  select owner_id into t from metrics where id = total and workspace_id = ws and total_targets is not null for update;
  if not found or t.owner_id is distinct from actor then
    raise exception using errcode = 'ZF476', message = 'Only the owner opens a Total';
  end if;
  select coalesce(array_agg(part_id::text || ' ' || first_period::text || ' ' || coalesce(last_period::text, '') order by part_id), '{}')
    into now_listed from total_parts where total_id = total;
  if now_listed is distinct from shown then return false; end if;
  update metrics set total_opened_at = now(), total_opened_by = actor where id = total and total_opened_at is null;
  return true;
end;
$$;

revoke all on function change_total_part(uuid, int, int, text, date, date, text, boolean) from public, anon, authenticated;
revoke all on function open_total(uuid, int, text, text[]) from public, anon, authenticated;
grant execute on function change_total_part(uuid, int, int, text, date, date, text, boolean) to service_role;
grant execute on function open_total(uuid, int, text, text[]) to service_role;
