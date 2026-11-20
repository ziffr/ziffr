-- An update says where its file came from (spec 0030, #278): a Pack updated from an uploaded file is no longer shown
-- as from the Marketplace, and one updated from the Marketplace with its signature checked is. Found in the security
-- review of the Marketplace connection. Otherwise as before (20261225200000_pack_updates.sql).
create or replace function public.update_pack(p_workspace uuid, p_install bigint, p_by text, p_install_row jsonb, p_ops jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  item jsonb;
  theme_ids jsonb := '{}'::jsonb;
  new_id bigint;
  new_body jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('ziffr-pack-install:' || p_workspace::text));
  if not exists (select 1 from pack_installs where id = p_install and workspace_id = p_workspace) then
    raise exception 'No such install.' using errcode = 'no_data_found';
  end if;
  -- Templates and Themes replaced or deleted must be as the core read them: an edit made meanwhile stops the step.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_ops->'guard', '[]')) gd
    where (gd->>'table' = 'templates' and not exists (select 1 from team_templates t where t.id = (gd->>'id')::bigint and t.workspace_id = p_workspace
             and t.updated_at is not distinct from (gd->>'updated_at')::timestamptz))
       or (gd->>'table' = 'themes' and not exists (select 1 from themes t where t.id = (gd->>'id')::bigint and t.workspace_id = p_workspace
             and t.updated_at is not distinct from (gd->>'updated_at')::timestamptz))
  ) then
    raise exception 'Changed meanwhile.' using errcode = 'serialization_failure';
  end if;

  -- Copies that leave: deleted, or kept without their mark. Only rows of this install in this Workspace.
  delete from catalog_metrics where workspace_id = p_workspace and pack_install_id = p_install and id in (select (jsonb_array_elements_text(coalesce(p_ops->'catalog'->'delete', '[]')))::bigint);
  delete from team_templates where workspace_id = p_workspace and pack_install_id = p_install and id in (select (jsonb_array_elements_text(coalesce(p_ops->'templates'->'delete', '[]')))::bigint);
  delete from view_designs where workspace_id = p_workspace and pack_install_id = p_install and id in (select (jsonb_array_elements_text(coalesce(p_ops->'designs'->'delete', '[]')))::bigint);
  delete from themes where workspace_id = p_workspace and pack_install_id = p_install and id in (select (jsonb_array_elements_text(coalesce(p_ops->'themes'->'delete', '[]')))::bigint);
  update catalog_metrics set pack_install_id = null, pack_key = null, pack_hash = null, pack_offer = null where workspace_id = p_workspace and pack_install_id = p_install and id in (select (jsonb_array_elements_text(coalesce(p_ops->'catalog'->'unmark', '[]')))::bigint);
  update team_templates set pack_install_id = null, pack_key = null, pack_hash = null, pack_offer = null where workspace_id = p_workspace and pack_install_id = p_install and id in (select (jsonb_array_elements_text(coalesce(p_ops->'templates'->'unmark', '[]')))::bigint);
  update view_designs set pack_install_id = null, pack_key = null, pack_hash = null, pack_offer = null where workspace_id = p_workspace and pack_install_id = p_install and id in (select (jsonb_array_elements_text(coalesce(p_ops->'designs'->'unmark', '[]')))::bigint);
  update themes set pack_install_id = null, pack_key = null, pack_hash = null, pack_offer = null where workspace_id = p_workspace and pack_install_id = p_install and id in (select (jsonb_array_elements_text(coalesce(p_ops->'themes'->'unmark', '[]')))::bigint);

  -- Themes first: a Deck Template names one by key.
  for item in select * from jsonb_array_elements(coalesce(p_ops->'themes'->'replace', '[]')) loop
    update themes set name = item->>'name', tokens = item->'tokens', slides = item->'slides', pack_hash = item->>'hash', pack_offer = null, updated_at = now()
     where id = (item->>'id')::bigint and workspace_id = p_workspace and pack_install_id = p_install;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(p_ops->'themes'->'insert', '[]')) loop
    insert into themes (workspace_id, owner_id, name, tokens, slides, is_default, pack_install_id, pack_key, pack_hash)
    values (p_workspace, p_by, item->>'name', item->'tokens', item->'slides', false, p_install, item->>'key', item->>'hash');
  end loop;
  select coalesce(jsonb_object_agg(pack_key, id), '{}'::jsonb) into theme_ids from themes where workspace_id = p_workspace and pack_install_id = p_install;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'catalog'->'insert', '[]') || coalesce(p_ops->'catalog'->'replace', '[]')) loop
    if item ? 'id' then
      update catalog_metrics set category = item->>'category', name = item->>'name', description = item->>'description', unit = item->>'unit',
        unit_position = item->>'unit_position', format = item->>'format', decimals = (item->>'decimals')::int, period = item->>'period',
        submission_rule = item->>'submission_rule', polarity = item->>'polarity', target_min = (item->>'target_min')::numeric,
        target_max = (item->>'target_max')::numeric, sources = array(select jsonb_array_elements_text(item->'sources')), aggregation = item->>'aggregation',
        industries = case when jsonb_typeof(item->'industries') = 'array' then array(select jsonb_array_elements_text(item->'industries')) end,
        segments = case when jsonb_typeof(item->'segments') = 'array' then array(select jsonb_array_elements_text(item->'segments')) end,
        formula = item->>'formula', pack_hash = item->>'hash', pack_offer = null
       where id = (item->>'id')::bigint and workspace_id = p_workspace and pack_install_id = p_install;
    else
      insert into catalog_metrics (workspace_id, category, name, description, unit, unit_position, format, decimals, period,
        submission_rule, polarity, target_min, target_max, sources, aggregation, industries, segments, formula, pack_install_id, pack_key, pack_hash)
      values (p_workspace, item->>'category', item->>'name', item->>'description', item->>'unit', item->>'unit_position',
        item->>'format', (item->>'decimals')::int, item->>'period', item->>'submission_rule', item->>'polarity',
        (item->>'target_min')::numeric, (item->>'target_max')::numeric, array(select jsonb_array_elements_text(item->'sources')), item->>'aggregation',
        case when jsonb_typeof(item->'industries') = 'array' then array(select jsonb_array_elements_text(item->'industries')) end,
        case when jsonb_typeof(item->'segments') = 'array' then array(select jsonb_array_elements_text(item->'segments')) end,
        item->>'formula', p_install, item->>'key', item->>'hash');
    end if;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'designs'->'insert', '[]') || coalesce(p_ops->'designs'->'replace', '[]')) loop
    if item ? 'id' then
      update view_designs set name = item->>'name', body = item->'body', pack_hash = item->>'hash', pack_offer = null
       where id = (item->>'id')::bigint and workspace_id = p_workspace and pack_install_id = p_install;
    else
      insert into view_designs (workspace_id, name, body, added_by, pack_install_id, pack_key, pack_hash)
      values (p_workspace, item->>'name', item->'body', p_by, p_install, item->>'key', item->>'hash');
    end if;
  end loop;
  if (select count(*) from view_designs where workspace_id = p_workspace) > 100 then
    raise exception 'A Workspace keeps at most 100 View Designs.' using errcode = 'check_violation';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'templates'->'insert', '[]') || coalesce(p_ops->'templates'->'replace', '[]')) loop
    new_body := item->'body';
    if item ? 'theme_key' and theme_ids ? (item->>'theme_key') then
      new_body := jsonb_set(new_body, '{themeId}', theme_ids->(item->>'theme_key'));
    end if;
    if item ? 'id' then
      update team_templates set name = item->>'name', description = item->>'description', slots = item->'slots', body = new_body,
        pack_hash = item->>'hash', pack_offer = null, updated_at = now()
       where id = (item->>'id')::bigint and workspace_id = p_workspace and pack_install_id = p_install and kind = item->>'kind';
    else
      insert into team_templates (workspace_id, owner_id, kind, name, description, view, slots, body, w, h, pack_install_id, pack_key, pack_hash)
      values (p_workspace, p_by, item->>'kind', item->>'name', item->>'description', item->>'kind', item->'slots', new_body, 0, 0, p_install, item->>'key', item->>'hash');
    end if;
  end loop;

  -- The newer version beside a copy the Workspace changed.
  update catalog_metrics c set pack_offer = o.value->'offer' from jsonb_array_elements(coalesce(p_ops->'catalog'->'offer', '[]')) o
   where c.id = (o.value->>'id')::bigint and c.workspace_id = p_workspace and c.pack_install_id = p_install;
  update team_templates c set pack_offer = o.value->'offer' from jsonb_array_elements(coalesce(p_ops->'templates'->'offer', '[]')) o
   where c.id = (o.value->>'id')::bigint and c.workspace_id = p_workspace and c.pack_install_id = p_install;
  update view_designs c set pack_offer = o.value->'offer' from jsonb_array_elements(coalesce(p_ops->'designs'->'offer', '[]')) o
   where c.id = (o.value->>'id')::bigint and c.workspace_id = p_workspace and c.pack_install_id = p_install;
  update themes c set pack_offer = o.value->'offer' from jsonb_array_elements(coalesce(p_ops->'themes'->'offer', '[]')) o
   where c.id = (o.value->>'id')::bigint and c.workspace_id = p_workspace and c.pack_install_id = p_install;

  update pack_installs set version = p_install_row->>'version', license = p_install_row->>'license', manifest = p_install_row->'manifest',
    source = coalesce(p_install_row->>'source', source), signed = coalesce((p_install_row->>'signed')::boolean, signed),
    item_keys = array(select jsonb_array_elements_text(coalesce(p_install_row->'item_keys', '[]'::jsonb))), updated_at = now()
   where id = p_install and workspace_id = p_workspace;
end;
$function$;
revoke all on function public.update_pack(uuid, bigint, text, jsonb, jsonb) from public, anon, authenticated;
