-- Tags in Metric Catalog entries (spec 0038, ticket 6; GLOSSARY: Tag, Metric Catalog, Pack): an entry a Pack brings may carry up
-- to 5 Tags, which a Metric made from the entry gets. The words are the Pack's own public text, not a Workspace's Metric
-- names, so they are stored as they are; the core has normalised and checked them (the same rules as a Tag typed in the
-- app) before a Pack is installed. Entries every Workspace has carry none (null).
create function catalog_tags_ok(t text[]) returns boolean language sql immutable as
$$ select t is null or (cardinality(t) between 1 and 5 and not exists (select 1 from unnest(t) w where w is null or char_length(w) not between 1 and 32)) $$;
alter table catalog_metrics add column tags text[] check (catalog_tags_ok(tags));

-- Installing and updating write the column in the same step as the rest of the entry. The steps of 20261225310000 are kept as
-- they are, renamed, and the wrappers below run them, then set the Tags of the entries that bring some, inside the same
-- transaction and under the same lock, so a Pack installs whole or not at all.
alter function public.install_pack(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) rename to install_pack_untagged;
alter function public.update_pack(uuid, bigint, text, jsonb, jsonb) rename to update_pack_untagged;

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
end;
$function$;

revoke all on function public.install_pack(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_pack(uuid, bigint, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.install_pack_untagged(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_pack_untagged(uuid, bigint, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.install_pack(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.update_pack(uuid, bigint, text, jsonb, jsonb) to service_role;
-- Only the wrappers above run the steps they wrap: nothing else may skip the Tags.
revoke all on function public.install_pack_untagged(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from service_role;
revoke all on function public.update_pack_untagged(uuid, bigint, text, jsonb, jsonb) from service_role;
