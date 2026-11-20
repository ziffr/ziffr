-- Fixes to installing Packs (spec 0030, #275), found in its security review. Catalog names were unique across the
-- Installation, so one Workspace's Pack entry blocked every other Workspace from a Pack with an entry of that name, and
-- told it so. Names are now unique among the entries every Workspace has, and within each Workspace's own part. The
-- View Design limit is counted inside the install step, under a lock per Workspace.
drop index if exists catalog_metrics_name_key;
create unique index catalog_metrics_shared_name_key on catalog_metrics (name) where workspace_id is null;
create unique index catalog_metrics_workspace_name_key on catalog_metrics (workspace_id, name) where workspace_id is not null;

create or replace function public.install_pack(
  p_workspace uuid, p_by text, p_install jsonb, p_catalog jsonb, p_templates jsonb, p_designs jsonb, p_themes jsonb
) returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  install_id bigint;
  item jsonb;
  theme_ids jsonb := '{}'::jsonb;
  new_id bigint;
  body jsonb;
begin
  -- One install at a time per Workspace: the counts below hold for the whole step.
  perform pg_advisory_xact_lock(hashtext('ziffr-pack-install:' || p_workspace::text));
  insert into pack_installs (workspace_id, pack_id, version, license, source, signed, manifest, installed_by)
  values (p_workspace, p_install->>'pack_id', p_install->>'version', p_install->>'license', p_install->>'source',
          coalesce((p_install->>'signed')::boolean, false), p_install->'manifest', p_by)
  returning id into install_id;

  for item in select * from jsonb_array_elements(coalesce(p_themes, '[]'::jsonb)) loop
    insert into themes (workspace_id, owner_id, name, tokens, slides, is_default, pack_install_id, pack_key, pack_hash)
    values (p_workspace, p_by, item->>'name', item->'tokens', item->'slides', false, install_id, item->>'key', item->>'hash')
    returning id into new_id;
    theme_ids := theme_ids || jsonb_build_object(item->>'key', new_id);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_catalog, '[]'::jsonb)) loop
    insert into catalog_metrics (workspace_id, category, name, description, unit, unit_position, format, decimals, period,
      submission_rule, polarity, target_min, target_max, sources, aggregation, industries, segments, formula,
      pack_install_id, pack_key, pack_hash)
    values (p_workspace, item->>'category', item->>'name', item->>'description', item->>'unit', item->>'unit_position',
      item->>'format', (item->>'decimals')::int, item->>'period', item->>'submission_rule', item->>'polarity',
      (item->>'target_min')::numeric, (item->>'target_max')::numeric,
      array(select jsonb_array_elements_text(item->'sources')), item->>'aggregation',
      case when item->'industries' is null or jsonb_typeof(item->'industries') = 'null' then null else array(select jsonb_array_elements_text(item->'industries')) end,
      case when item->'segments' is null or jsonb_typeof(item->'segments') = 'null' then null else array(select jsonb_array_elements_text(item->'segments')) end,
      item->>'formula', install_id, item->>'key', item->>'hash');
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_designs, '[]'::jsonb)) loop
    insert into view_designs (workspace_id, name, body, added_by, pack_install_id, pack_key, pack_hash)
    values (p_workspace, item->>'name', item->'body', p_by, install_id, item->>'key', item->>'hash');
  end loop;

  -- At most 100 View Designs in a Workspace, counted here too, so two installs at once cannot pass it together.
  if (select count(*) from view_designs where workspace_id = p_workspace) > 100 then
    raise exception 'A Workspace keeps at most 100 View Designs.' using errcode = 'check_violation';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_templates, '[]'::jsonb)) loop
    body := item->'body';
    -- A Deck Template's Theme, named by its key in the Pack, is the Theme just installed.
    if item ? 'theme_key' and theme_ids ? (item->>'theme_key') then
      body := jsonb_set(body, '{themeId}', theme_ids->(item->>'theme_key'));
    end if;
    insert into team_templates (workspace_id, owner_id, kind, name, description, view, slots, body, w, h, pack_install_id, pack_key, pack_hash)
    values (p_workspace, p_by, item->>'kind', item->>'name', item->>'description', item->>'kind', item->'slots', body, 0, 0,
            install_id, item->>'key', item->>'hash');
  end loop;

  return install_id;
end;
$function$;
revoke all on function public.install_pack(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
