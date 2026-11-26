-- Totals in a Pack (spec 0058 "Team totals", ticket #1226; GLOSSARY: Total, Pack, Metric Catalog, Repeat): an entry a
-- Pack brings may be a Total over one entry of a Repeat, such as the commit of all salespeople. The entry keeps which
-- entry it adds up and where its target comes from, so that Set up makes a Total of it and no step ever makes an
-- ordinary Metric that takes values. Nothing here opens a Total: a Pack cannot say that.
create function catalog_total_ok(t jsonb) returns boolean language sql immutable as
$$ select t is null or coalesce(jsonb_typeof(t) = 'object' and t->>'targets' in ('own', 'parts') and jsonb_typeof(t->'of') = 'string' and t->>'of' ~ '^[a-z][a-z0-9-]{0,39}$', false) $$;
alter table catalog_metrics add column total jsonb check (catalog_total_ok(total) and (total is null or formula is null));

-- Installing and updating write the column in the same step as the rest of the entry, as for Tags (20270110500000): the
-- functions as they are keep their steps under another name, and the wrappers below run them, then set the new column,
-- in the same transaction and under the same lock.
alter function public.install_pack(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) rename to install_pack_untotalled;
alter function public.update_pack(uuid, bigint, text, jsonb, jsonb) rename to update_pack_untotalled;

create or replace function public.install_pack(
  p_workspace uuid, p_by text, p_install jsonb, p_catalog jsonb, p_templates jsonb, p_designs jsonb, p_themes jsonb
) returns bigint
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  install_id bigint;
begin
  install_id := install_pack_untotalled(p_workspace, p_by, p_install, p_catalog, p_templates, p_designs, p_themes);
  update catalog_metrics c set total = i.value->'total'
    from jsonb_array_elements(coalesce(p_catalog, '[]'::jsonb)) i
   where jsonb_typeof(i.value->'total') = 'object' and c.workspace_id = p_workspace and c.pack_install_id = install_id and c.pack_key = i.value->>'key';
  return install_id;
end;
$function$;

create or replace function public.update_pack(p_workspace uuid, p_install bigint, p_by text, p_install_row jsonb, p_ops jsonb)
 returns void
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  -- A replaced entry that stops being a Total gets a formula in the step below, which the column's check refuses while
  -- the old value is there: it is taken off first, under the same lock the step takes.
  perform pg_advisory_xact_lock(hashtext('ziffr-pack-install:' || p_workspace::text));
  update catalog_metrics c set total = null
    from jsonb_array_elements(coalesce(p_ops->'catalog'->'replace', '[]'::jsonb)) i
   where c.workspace_id = p_workspace and c.pack_install_id = p_install and c.id = (i.value->>'id')::bigint and c.total is not null;
  perform update_pack_untotalled(p_workspace, p_install, p_by, p_install_row, p_ops);
  -- An entry that is inserted or replaced is a Total exactly when its new version says so.
  update catalog_metrics c set total = case when jsonb_typeof(i.value->'total') = 'object' then i.value->'total' end
    from jsonb_array_elements(coalesce(p_ops->'catalog'->'insert', '[]'::jsonb) || coalesce(p_ops->'catalog'->'replace', '[]'::jsonb)) i
   where c.workspace_id = p_workspace and c.pack_install_id = p_install and c.pack_key = i.value->>'key';
end;
$function$;

revoke all on function public.install_pack(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_pack(uuid, bigint, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.install_pack_untotalled(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_pack_untotalled(uuid, bigint, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.install_pack(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.update_pack(uuid, bigint, text, jsonb, jsonb) to service_role;
-- Only the wrappers above run the steps they wrap: nothing else may skip a step.
revoke all on function public.install_pack_untotalled(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from service_role;
revoke all on function public.update_pack_untotalled(uuid, bigint, text, jsonb, jsonb) from service_role;
