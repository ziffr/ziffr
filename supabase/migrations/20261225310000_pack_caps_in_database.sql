-- A Workspace holds at most 25 Packs, 1000 Metric Catalog entries and 1000 templates (packs.ts PACK_CAPS), now counted in the
-- database too, inside the same step and under the Workspace's Pack lock: the app-side check gives the friendly
-- message, but two installs at once, or an update, could pass it together (security review of spec 0030).
-- The existing steps are kept as they are, renamed; the wrappers below run them, then count. A Workspace already over a
-- cap may still shrink or stay the same; only a step that makes a count grow past the cap is refused, and refusing
-- rolls the whole step back.
alter function public.install_pack(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) rename to install_pack_uncapped;
alter function public.update_pack(uuid, bigint, text, jsonb, jsonb) rename to update_pack_uncapped;

create or replace function public.pack_caps_before(p_workspace uuid) returns int[]
 language sql stable security definer set search_path to 'public'
as $$ select array[(select count(*) from catalog_metrics where workspace_id = p_workspace)::int,
                   (select count(*) from team_templates where workspace_id = p_workspace)::int,
                   (select count(*) from pack_installs where workspace_id = p_workspace)::int] $$;

create or replace function public.pack_caps_check(p_workspace uuid, p_before int[]) returns void
 language plpgsql stable security definer set search_path to 'public'
as $$
declare
  entries int := (select count(*) from catalog_metrics where workspace_id = p_workspace);
  templates int := (select count(*) from team_templates where workspace_id = p_workspace);
  installs int := (select count(*) from pack_installs where workspace_id = p_workspace);
begin
  if installs > 25 and installs > p_before[3] then
    raise exception 'A Workspace keeps at most 25 Packs.' using errcode = 'check_violation';
  end if;
  if entries > 1000 and entries > p_before[1] then
    raise exception 'A Workspace keeps at most 1000 Metric Catalog entries.' using errcode = 'check_violation';
  end if;
  if templates > 1000 and templates > p_before[2] then
    raise exception 'A Workspace keeps at most 1000 templates.' using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.install_pack(
  p_workspace uuid, p_by text, p_install jsonb, p_catalog jsonb, p_templates jsonb, p_designs jsonb, p_themes jsonb
) returns bigint
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  before int[];
  install_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ziffr-pack-install:' || p_workspace::text));
  before := pack_caps_before(p_workspace);
  install_id := install_pack_uncapped(p_workspace, p_by, p_install, p_catalog, p_templates, p_designs, p_themes);
  perform pack_caps_check(p_workspace, before);
  return install_id;
end;
$function$;

create or replace function public.update_pack(p_workspace uuid, p_install bigint, p_by text, p_install_row jsonb, p_ops jsonb)
 returns void
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  before int[];
begin
  perform pg_advisory_xact_lock(hashtext('ziffr-pack-install:' || p_workspace::text));
  before := pack_caps_before(p_workspace);
  perform update_pack_uncapped(p_workspace, p_install, p_by, p_install_row, p_ops);
  perform pack_caps_check(p_workspace, before);
end;
$function$;

revoke all on function public.pack_caps_before(uuid), public.pack_caps_check(uuid, int[]) from public, anon, authenticated;
revoke all on function public.install_pack(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_pack(uuid, bigint, text, jsonb, jsonb) from public, anon, authenticated;
