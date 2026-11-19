-- Setting a Metric's Target Series or Projections in one step (ticket #215; GLOSSARY: Target Series, Projection): a
-- program's call sets some periods and removes others, and both happen in this one function, so a failure leaves
-- nothing half written. The core checks who may change the Metric and every item before it calls this.
create or replace function set_series_values(p_metric int, p_kind text, p_saves jsonb, p_removes date[], p_note text)
returns table (saved int, removed int) language plpgsql security definer set search_path = public as $$
declare
  n_saved int := 0;
  n_removed int := 0;
begin
  if p_kind not in ('target', 'projection') then raise exception 'unknown series %', p_kind; end if;
  insert into series_values (metric_id, kind, period_start, value, note)
    select p_metric, p_kind, (s->>'period')::date, (s->>'value')::numeric, nullif(left(coalesce(p_note, ''), 120), '')
    from jsonb_array_elements(coalesce(p_saves, '[]'::jsonb)) s
  on conflict (metric_id, kind, period_start) do update set value = excluded.value, note = excluded.note;
  get diagnostics n_saved = row_count;
  delete from series_values where metric_id = p_metric and kind = p_kind and period_start = any(coalesce(p_removes, '{}'::date[]));
  get diagnostics n_removed = row_count;
  return query select n_saved, n_removed;
end $$;
revoke execute on function set_series_values(int, text, jsonb, date[], text) from public, anon, authenticated;
grant execute on function set_series_values(int, text, jsonb, date[], text) to service_role;
