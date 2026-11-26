-- A Calculation Note in Metric Catalog entries (spec 0060, ticket #1200; GLOSSARY: Calculation Note, Metric Catalog,
-- Pack): an entry a Pack brings may say how its Metric is calculated, which a Metric made from the entry gets. Like the
-- entry's description it is the Pack's own public text, so it is stored as it is; the core has checked it (plain text
-- without markup or web addresses, at most 1000 characters) before a Pack is installed. Entries every Workspace has
-- carry none (null). No demo row is touched.
alter table catalog_metrics add column calculation_note text constraint catalog_metrics_calculation_note_length check (calculation_note is null or char_length(calculation_note) <= 1000);

-- Installing and updating write it in the same step as the Tags, inside the same transaction and under the same lock: the
-- two functions as in 20270110500000, with the note added.
create or replace function public.install_pack(
  p_workspace uuid, p_by text, p_install jsonb, p_catalog jsonb, p_templates jsonb, p_designs jsonb, p_themes jsonb
) returns bigint
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  install_id bigint;
begin
  install_id := install_pack_untagged(p_workspace, p_by, p_install, p_catalog, p_templates, p_designs, p_themes);
  update catalog_metrics c set tags = array(select t.x from jsonb_array_elements_text(i.value->'tags') with ordinality t(x, n) order by t.n)
    from jsonb_array_elements(coalesce(p_catalog, '[]'::jsonb)) i
   where jsonb_typeof(i.value->'tags') = 'array' and jsonb_array_length(i.value->'tags') > 0
     and c.workspace_id = p_workspace and c.pack_install_id = install_id and c.pack_key = i.value->>'key';
  update catalog_metrics c set calculation_note = i.value->>'calculation_note'
    from jsonb_array_elements(coalesce(p_catalog, '[]'::jsonb)) i
   where i.value->>'calculation_note' is not null
     and c.workspace_id = p_workspace and c.pack_install_id = install_id and c.pack_key = i.value->>'key';
  return install_id;
end;
$function$;

create or replace function public.update_pack(p_workspace uuid, p_install bigint, p_by text, p_install_row jsonb, p_ops jsonb)
 returns void
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform update_pack_untagged(p_workspace, p_install, p_by, p_install_row, p_ops);
  -- An entry that is inserted or replaced takes the Tags of its new version, none when it brings none.
  update catalog_metrics c set tags = case when jsonb_typeof(i.value->'tags') = 'array' and jsonb_array_length(i.value->'tags') > 0
                                           then array(select t.x from jsonb_array_elements_text(i.value->'tags') with ordinality t(x, n) order by t.n) end
    from jsonb_array_elements(coalesce(p_ops->'catalog'->'insert', '[]'::jsonb) || coalesce(p_ops->'catalog'->'replace', '[]'::jsonb)) i
   where c.workspace_id = p_workspace and c.pack_install_id = p_install and c.pack_key = i.value->>'key';
  -- And its Calculation Note, none when the new version brings none.
  update catalog_metrics c set calculation_note = i.value->>'calculation_note'
    from jsonb_array_elements(coalesce(p_ops->'catalog'->'insert', '[]'::jsonb) || coalesce(p_ops->'catalog'->'replace', '[]'::jsonb)) i
   where c.workspace_id = p_workspace and c.pack_install_id = p_install and c.pack_key = i.value->>'key';
end;
$function$;

