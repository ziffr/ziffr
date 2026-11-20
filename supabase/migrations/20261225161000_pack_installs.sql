-- Installing Packs from an uploaded file (spec 0030, ticket #275; GLOSSARY: Pack, Metric Catalog). An install is a
-- row of pack_installs; each item becomes a row of the table it lives in today, marked with the install, its key and a
-- hash of the item as installed, so updating (#276) can tell unchanged from changed. The Metric Catalog gains a part
-- of each Workspace: entries with a workspace_id are that Workspace's own, from its Packs.
-- Read and written only through the core (service role); no browser reaches these tables.
create table pack_installs (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pack_id text not null check (char_length(pack_id) between 3 and 100),
  version text not null check (char_length(version) between 5 and 20),
  license text not null check (license in ('CC-BY-4.0', 'MIT', 'Ziffr-Pack-1.0')),
  source text not null check (source in ('upload', 'marketplace')),
  -- Whether the Marketplace's signature held: where the file came from, not whether it is safe (the checks are).
  signed boolean not null default false,
  -- The manifest as installed, without its contents: what the Packs page shows of it.
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object' and octet_length(manifest::text) <= 16384),
  installed_by text references profiles(id) on delete set null,
  installed_at timestamptz not null default now(),
  unique (workspace_id, pack_id)
);
create index on pack_installs (workspace_id);
alter table pack_installs enable row level security;

-- The Workspace's part of the Metric Catalog, and a Derived Metric's formula over other entries of its Pack, by key.
alter table catalog_metrics add column workspace_id uuid references workspaces(id) on delete cascade;
alter table catalog_metrics add column formula text check (formula is null or char_length(formula) <= 500);
create index on catalog_metrics (workspace_id);

-- The marked copies: which install an item came from, its key in the Pack and the hash of it as installed. Removing
-- the install's row (uninstalling, #276) leaves a kept item unmarked.
do $$
declare t text;
begin
  foreach t in array array['catalog_metrics', 'team_templates', 'view_designs', 'themes'] loop
    execute format('alter table %I add column pack_install_id bigint references pack_installs(id) on delete set null', t);
    execute format('alter table %I add column pack_key text check (pack_key is null or pack_key ~ ''^[a-z][a-z0-9-]{0,39}$'')', t);
    execute format('alter table %I add column pack_hash text check (pack_hash is null or pack_hash ~ ''^[0-9a-f]{64}$'')', t);
    execute format('create index on %I (pack_install_id)', t);
  end loop;
end $$;

-- Installs a Pack in one step: the install, then its Themes (a Deck Template names one by key), then everything else.
-- Any failure undoes all of it, so a Pack is installed whole or not at all. The core has checked every item and the
-- actor's right to install; this only writes what it is given, into the one Workspace named.
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

-- A Metric made from a catalog entry is an independent copy: an entry that goes (a Pack uninstalled, #276) leaves the
-- Metric as it is, without the reference.
alter table metrics drop constraint if exists metrics_from_catalog_id_fkey;
alter table metrics add constraint metrics_from_catalog_id_fkey foreign key (from_catalog_id) references catalog_metrics(id) on delete set null;
