-- PROTOTYPE, wipe me. Masters merge into Themes (GLOSSARY: Theme): a theme also says what every slide shows
-- (logo, footer, slide number, background image, type sizes). A deck picks one theme and may set its own footer.
alter table themes add column slides jsonb not null default
  '{"background_image":null,"logo":null,"logo_ratio":3,"logo_position":"top-right","logo_width":140,"footer":"","show_slide_number":true,"title_size":56,"body_size":24}';
alter table decks add column footer text;

-- Existing masters become the slide part of the default theme, then go.
update themes t set slides = jsonb_build_object(
  'background_image', m.background_image, 'logo', m.logo, 'logo_ratio', m.logo_ratio, 'logo_position', m.logo_position,
  'logo_width', m.logo_width, 'footer', m.footer, 'show_slide_number', m.show_slide_number, 'title_size', m.title_size, 'body_size', m.body_size)
from masters m where m.is_default and t.is_default;
alter table decks drop column master_id;
drop table masters cascade;
delete from versions where object_type = 'master';

create or replace function prototype_reset_decks() returns void language plpgsql security definer set search_path = public as $$
begin
  truncate decks restart identity cascade;
  insert into decks (owner_id, name) values ('sara', 'Board update, ' || to_char(current_date, 'FMMonth YYYY'));
end $$;
revoke execute on function prototype_reset_decks() from public, anon, authenticated;
grant execute on function prototype_reset_decks() to service_role;

create or replace function prototype_seed_themes() returns void language plpgsql security definer set search_path = public as $$
declare slides jsonb := '{"background_image":null,"logo":null,"logo_ratio":3,"logo_position":"top-right","logo_width":140,"footer":"Northwind Goods, internal","show_slide_number":true,"title_size":56,"body_size":24}';
begin
  update profiles set is_owner = (id = 'sara');
  delete from versions where object_type = 'theme';
  update dashboards set theme_id = null;
  update decks set theme_id = null;
  delete from themes;
  perform setval(pg_get_serial_sequence('themes', 'id'), 1, false);
  insert into themes (owner_id, name, is_default, slides, tokens) values
  ('sara', 'Coral', true, slides, '{"canvas":"#F0EBE7","surface":"#FDFBF8","ink":"#221B19","muted":"#615955","rule":"#D9D3CF","accent":"#BB3D31","data":["#312926","#8C7B6E","#C7BFBA","#5E7C6B"],"good":"#21763C","bad":"#BE2323","band":"#E8E1DD","fontHeading":"general-sans","fontBody":"general-sans","fontFigures":"geist-mono","radius":8,"cards":"paper"}'),
  ('sara', 'Broadsheet', false, slides || '{"title_size":60}', '{"canvas":"#F3F0E8","surface":"#FFFDF8","ink":"#141414","muted":"#5A5650","rule":"#D8D2C4","accent":"#1F4E79","data":["#2B2B2B","#1F4E79","#8FA9C4","#B9B2A4"],"good":"#2E6B3F","bad":"#A3262A","band":"#EAE5D9","fontHeading":"playfair","fontBody":"libre-franklin","fontFigures":"libre-franklin","radius":0,"cards":"plain"}'),
  ('sara', 'Night', false, slides, '{"canvas":"#0E1015","surface":"#171A21","ink":"#F1F3F7","muted":"#9AA3B2","rule":"#2B303B","accent":"#F2B33D","data":["#7CB8FF","#A78BFA","#5ED3A6","#F2B33D"],"good":"#5ED3A6","bad":"#FF7A7A","band":"#232834","fontHeading":"inter","fontBody":"inter","fontFigures":"ibm-plex-mono","radius":10,"cards":"flat"}'),
  ('sara', 'Print', false, slides || '{"show_slide_number":true}', '{"canvas":"#FFFFFF","surface":"#FFFFFF","ink":"#000000","muted":"#555555","rule":"#C8C8C8","accent":"#000000","data":["#1A1A1A","#7F7F7F","#BFBFBF","#4D4D4D"],"good":"#2E7D32","bad":"#C62828","band":"#EDEDED","fontHeading":"arial","fontBody":"arial","fontFigures":"arial","radius":0,"cards":"plain"}');
end $$;
revoke execute on function prototype_seed_themes() from public, anon, authenticated;
grant execute on function prototype_seed_themes() to service_role;
