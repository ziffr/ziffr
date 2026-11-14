-- Themes (GLOSSARY: Theme): the starter theme Coral draws figures in its body font with tabular digits, not in a
-- monospace font, because monospaced numbers on dashboards read like code. Idempotent: only Coral themes that still
-- have the old starter pairing (General Sans text, Geist Mono figures) change; a figures font someone picked stays.

update themes
set tokens = jsonb_set(tokens, '{fontFigures}', '"general-sans"')
where name = 'Coral'
  and tokens->>'fontFigures' = 'geist-mono'
  and tokens->>'fontBody' = 'general-sans';

-- The demo seeds Coral the same way after a reset.
CREATE OR REPLACE FUNCTION public.prototype_seed_themes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare slides jsonb := '{"background_image":null,"logo":null,"logo_ratio":3,"logo_position":"top-right","logo_width":140,"footer":"Northwind Goods, internal","show_slide_number":true,"title_size":56,"body_size":24}';
begin
  update profiles set is_owner = (id = 'sara') where id in ('sara','ben','anna');
  insert into themes (owner_id, name, is_default, slides, tokens) values
  ('sara', 'Coral', true, slides, '{"canvas":"#F0EBE7","surface":"#FDFBF8","ink":"#221B19","muted":"#615955","rule":"#D9D3CF","accent":"#BB3D31","data":["#312926","#8C7B6E","#C7BFBA","#5E7C6B"],"good":"#21763C","bad":"#BE2323","band":"#E8E1DD","fontHeading":"general-sans","fontBody":"general-sans","fontFigures":"general-sans","radius":8,"cards":"paper"}'),
  ('sara', 'Broadsheet', false, slides || '{"title_size":60}', '{"canvas":"#F3F0E8","surface":"#FFFDF8","ink":"#141414","muted":"#5A5650","rule":"#D8D2C4","accent":"#1F4E79","data":["#2B2B2B","#1F4E79","#8FA9C4","#B9B2A4"],"good":"#2E6B3F","bad":"#A3262A","band":"#EAE5D9","fontHeading":"playfair","fontBody":"libre-franklin","fontFigures":"libre-franklin","radius":0,"cards":"plain"}'),
  ('sara', 'Night', false, slides, '{"canvas":"#0E1015","surface":"#171A21","ink":"#F1F3F7","muted":"#9AA3B2","rule":"#2B303B","accent":"#F2B33D","data":["#7CB8FF","#A78BFA","#5ED3A6","#F2B33D"],"good":"#5ED3A6","bad":"#FF7A7A","band":"#232834","fontHeading":"inter","fontBody":"inter","fontFigures":"ibm-plex-mono","radius":10,"cards":"flat"}'),
  ('sara', 'Print', false, slides || '{"show_slide_number":true}', '{"canvas":"#FFFFFF","surface":"#FFFFFF","ink":"#000000","muted":"#555555","rule":"#C8C8C8","accent":"#000000","data":["#1A1A1A","#7F7F7F","#BFBFBF","#4D4D4D"],"good":"#2E7D32","bad":"#C62828","band":"#EDEDED","fontHeading":"arial","fontBody":"arial","fontFigures":"arial","radius":0,"cards":"plain"}');
end $function$;
