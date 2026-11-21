-- A Derived Metric made through createDerivedMetric (ticket #619) is calculated only from Metrics its owner may share
-- (owns or edits). `inputs_checked` marks those, so the rule also applies later: it shows no values while its owner
-- no longer may share one of its inputs (ticket #625). Derived Metrics made before (Packs, the demo's seed) are not
-- marked and keep working as they did. Add-only.
alter table metrics add column inputs_checked boolean not null default false;

-- Derived Metrics made or changed through the core since #619 merged carry no mark yet: their history says so (the
-- version notes createDerivedMetric and setMetricFormula write, also with a key's note after them). Marks them; the
-- function stays so a database test can run exactly this statement. The demo has no such Metric; its guard is
-- switched off for the update all the same, as for any migration that writes metrics.
create function backfill_derived_inputs_checked() returns integer language plpgsql as $$
declare n integer;
begin
  perform set_config('ziffr.demo_seed', 'on', true);
  update metrics m set inputs_checked = true
   where m.formula is not null and not m.inputs_checked
     and exists (select 1 from versions v where v.object_type = 'metric' and v.object_id = m.id
                   and (v.message like 'Calculated from other Metrics%' or v.message like 'Changed its formula%'));
  get diagnostics n = row_count;
  perform set_config('ziffr.demo_seed', 'off', true);
  return n;
end $$;
revoke all on function backfill_derived_inputs_checked() from public, anon, authenticated;
select backfill_derived_inputs_checked();
