-- Branding beyond the app (ticket #542): the demo Workspace's default Theme gets a logo, so what Ziffr sends and
-- shows outside the app (emails, the form link, View Links) shows a brand in the demo. The demo seeds it the same way
-- after every reset. The logo is a small PNG of a made-up company mark.

update themes set slides = slides || '{"logo":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABQklEQVR42u3cwQ3DIBBFQbeUAlJ5iktqMOD8hR2kPVt6I3FafF2Lzuf9+naaK3m6xS6BInAQQ9AQgohBCOGCCIIFEYQKI4gUBBAoiCBMGEEUAH0BBAkjiAEAgAHQE0CIMIIIAAAYAABME4CZ849vAwAAAMBDgQAA2B9gJhIAAGcAjIYCAOAcgJFYAADsAXAHCgAAAAAeirAaAQCAvQBWIwAAsB/ASgQAAPYEWIUAAMC+ACsQAADoATBzjQFYcI8DAHAuwAwCAABnAIwiAABwDsAIAgAAZwHcRQAA4DyA9LIXAAAA2gOkt64BAKixHggAQG+A9CtMAABqrAcCANAbYAYBAAADAIABAMAA6ADg/9Hh+AAAABADQG8ACOH4AAAAgBCOD6FAfAAFACCE40MoEB9CgfggCoSHUCQ+jALRoTwT+wcITdS6TLg8PwAAAABJRU5ErkJggg==","logo_ratio":1,"logo_width":64}'
where workspace_id = 'd3e00000-0000-4000-8000-000000000001' and name = 'Coral' and is_default and slides->>'logo' is null;

CREATE OR REPLACE FUNCTION public.prototype_seed_themes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare slides jsonb := '{"background_image":null,"logo":null,"logo_ratio":3,"logo_position":"top-right","logo_width":140,"footer":"Northwind Goods, internal","show_slide_number":true,"title_size":56,"body_size":24}';
  -- The demo's default Theme has a logo, so emails, the form link and View Links show a brand (ticket #542).
  branded jsonb := slides || '{"logo":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABQklEQVR42u3cwQ3DIBBFQbeUAlJ5iktqMOD8hR2kPVt6I3FafF2Lzuf9+naaK3m6xS6BInAQQ9AQgohBCOGCCIIFEYQKI4gUBBAoiCBMGEEUAH0BBAkjiAEAgAHQE0CIMIIIAAAYAABME4CZ849vAwAAAMBDgQAA2B9gJhIAAGcAjIYCAOAcgJFYAADsAXAHCgAAAAAeirAaAQCAvQBWIwAAsB/ASgQAAPYEWIUAAMC+ACsQAADoATBzjQFYcI8DAHAuwAwCAABnAIwiAABwDsAIAgAAZwHcRQAA4DyA9LIXAAAA2gOkt64BAKixHggAQG+A9CtMAABqrAcCANAbYAYBAAADAIABAMAA6ADg/9Hh+AAAABADQG8ACOH4AAAAgBCOD6FAfAAFACCE40MoEB9CgfggCoSHUCQ+jALRoTwT+wcITdS6TLg8PwAAAABJRU5ErkJggg==","logo_ratio":1,"logo_width":64}';
begin
  update profiles set is_owner = (id = 'sara') where id in ('sara','ben','anna');
  insert into themes (owner_id, name, is_default, slides, tokens) values
  ('sara', 'Coral', true, branded, '{"canvas":"#F0EBE7","surface":"#FDFBF8","ink":"#221B19","muted":"#615955","rule":"#D9D3CF","accent":"#BB3D31","data":["#312926","#8C7B6E","#C7BFBA","#5E7C6B"],"good":"#21763C","bad":"#BE2323","band":"#E8E1DD","fontHeading":"general-sans","fontBody":"general-sans","fontFigures":"general-sans","radius":8,"cards":"paper"}'),
  ('sara', 'Broadsheet', false, slides || '{"title_size":60}', '{"canvas":"#F3F0E8","surface":"#FFFDF8","ink":"#141414","muted":"#5A5650","rule":"#D8D2C4","accent":"#1F4E79","data":["#2B2B2B","#1F4E79","#8FA9C4","#B9B2A4"],"good":"#2E6B3F","bad":"#A3262A","band":"#EAE5D9","fontHeading":"playfair","fontBody":"libre-franklin","fontFigures":"libre-franklin","radius":0,"cards":"plain"}'),
  ('sara', 'Night', false, slides, '{"canvas":"#0E1015","surface":"#171A21","ink":"#F1F3F7","muted":"#9AA3B2","rule":"#2B303B","accent":"#F2B33D","data":["#7CB8FF","#A78BFA","#5ED3A6","#F2B33D"],"good":"#5ED3A6","bad":"#FF7A7A","band":"#232834","fontHeading":"inter","fontBody":"inter","fontFigures":"ibm-plex-mono","radius":10,"cards":"flat"}'),
  ('sara', 'Print', false, slides || '{"show_slide_number":true}', '{"canvas":"#FFFFFF","surface":"#FFFFFF","ink":"#000000","muted":"#555555","rule":"#C8C8C8","accent":"#000000","data":["#1A1A1A","#7F7F7F","#BFBFBF","#4D4D4D"],"good":"#2E7D32","bad":"#C62828","band":"#EDEDED","fontHeading":"arial","fontBody":"arial","fontFigures":"arial","radius":0,"cards":"plain"}');
end $function$;
