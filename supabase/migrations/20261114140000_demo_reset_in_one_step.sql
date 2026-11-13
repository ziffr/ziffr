-- The demo's reset in one step (ADR 0005). Anyone visiting the demo may reset it, so it runs as one locked
-- transaction (never two at once, never half done), at most once a minute, and the shared catalog is only set up
-- when it was empty. The comparisons seed no longer touches the catalog.
CREATE OR REPLACE FUNCTION public.prototype_seed_comparisons()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rev int; d date; i int; m0 date := (date_trunc('month', current_date) - interval '18 months')::date;
begin
  update metrics set aggregation = case slug
    when 'return-rate' then 'none' when 'margin' then 'none' when 'average-order-value' then 'none' else 'sum' end
    where workspace_id = 'd3e00000-0000-4000-8000-000000000001';

  -- A monthly revenue budget: 120k, higher before Christmas, lower in January.
  select id into rev from metrics where slug = 'revenue' and workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  for i in 0..20 loop
    d := (m0 + make_interval(months => i))::date;
    insert into series_values (metric_id, kind, period_start, value, note) values
      (rev, 'target', d, round(105000 * power(1.012, i) * case extract(month from d) when 11 then 1.15 when 12 then 1.3 when 1 then 0.88 else 1 end), 'Budget 2025/26');
  end loop;
  -- An outside projection for the next three months.
  for i in 0..2 loop
    d := (date_trunc('month', current_date) + make_interval(months => i))::date;
    insert into series_values (metric_id, kind, period_start, value, note) values
      (rev, 'projection', d, round(124000 * case extract(month from d) when 11 then 1.12 when 12 then 1.28 when 1 then 0.9 else 1 end), 'Sales plan, November 2026');
  end loop;
end;
$function$;

-- Empties the demo workspace and seeds it again; false when it was reset less than `min_gap` ago.
create or replace function demo_reset(min_gap interval default interval '1 minute') returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare fresh_catalog boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ziffr-demo-reset'));
  if exists (select 1 from workspaces where id = 'd3e00000-0000-4000-8000-000000000001' and created_at > now() - min_gap) then
    return false;
  end if;
  fresh_catalog := not exists (select 1 from catalog_metrics);
  perform prototype_reset();
  perform prototype_seed_breakdowns();
  perform prototype_seed_comparisons();
  perform prototype_seed_stories();
  perform prototype_reset_decks();
  perform prototype_seed_templates();
  perform prototype_seed_themes();
  perform prototype_seed_connectors();
  perform prototype_seed_groups();
  perform prototype_seed_workflows();
  perform prototype_seed_memberships();
  if fresh_catalog then
  update catalog_metrics set aggregation = case
    when name in ('Customer satisfaction','Net Promoter Score','Average delivery time','Body weight') then 'average'
    when name in ('Monthly recurring revenue','Inventory value','Headcount','Cash balance') then 'last'
    when format = 'percent' then 'none' else 'sum' end;
  end if;
  return true;
end $$;

revoke execute on function demo_reset(interval) from public, anon, authenticated;
grant execute on function demo_reset(interval) to service_role;
revoke execute on function prototype_seed_comparisons() from public, anon, authenticated;
grant execute on function prototype_seed_comparisons() to service_role;
