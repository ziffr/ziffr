-- PROTOTYPE, wipe me. Themes (GLOSSARY: Theme): the look of everything that shows numbers.
-- One team default; a dashboard or deck may pick another. Only the workspace owner changes themes.
alter table profiles add column if not exists is_owner boolean not null default false;

create table themes (
  id serial primary key,
  owner_id text not null references profiles(id),
  name text not null,
  tokens jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index themes_one_default on themes (is_default) where is_default;
alter table themes enable row level security;

alter table dashboards add column theme_id int references themes(id) on delete set null;
alter table decks add column theme_id int references themes(id) on delete set null;

alter table versions drop constraint versions_object_type_check;
alter table versions add constraint versions_object_type_check
  check (object_type in ('widget','dashboard','deck','master','metric','template','theme'));

create or replace function prototype_seed_themes() returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set is_owner = (id = 'sara');
  delete from versions where object_type = 'theme';
  update dashboards set theme_id = null;
  update decks set theme_id = null;
  delete from themes;
  perform setval(pg_get_serial_sequence('themes', 'id'), 1, false);
  insert into themes (owner_id, name, is_default, tokens) values
  ('sara', 'Coral', true, '{"canvas":"#F0EBE7","surface":"#FDFBF8","ink":"#221B19","muted":"#615955","rule":"#D9D3CF","accent":"#BB3D31","data":["#312926","#8C7B6E","#C7BFBA","#5E7C6B"],"good":"#21763C","bad":"#BE2323","band":"#E8E1DD","fontHeading":"general-sans","fontBody":"general-sans","fontFigures":"geist-mono","radius":8,"cards":"paper"}'),
  ('sara', 'Broadsheet', false, '{"canvas":"#F3F0E8","surface":"#FFFDF8","ink":"#141414","muted":"#5A5650","rule":"#D8D2C4","accent":"#1F4E79","data":["#2B2B2B","#1F4E79","#8FA9C4","#B9B2A4"],"good":"#2E6B3F","bad":"#A3262A","band":"#EAE5D9","fontHeading":"playfair","fontBody":"libre-franklin","fontFigures":"libre-franklin","radius":0,"cards":"plain"}'),
  ('sara', 'Night', false, '{"canvas":"#0E1015","surface":"#171A21","ink":"#F1F3F7","muted":"#9AA3B2","rule":"#2B303B","accent":"#F2B33D","data":["#7CB8FF","#A78BFA","#5ED3A6","#F2B33D"],"good":"#5ED3A6","bad":"#FF7A7A","band":"#232834","fontHeading":"inter","fontBody":"inter","fontFigures":"ibm-plex-mono","radius":10,"cards":"flat"}'),
  ('sara', 'Print', false, '{"canvas":"#FFFFFF","surface":"#FFFFFF","ink":"#000000","muted":"#555555","rule":"#C8C8C8","accent":"#000000","data":["#1A1A1A","#7F7F7F","#BFBFBF","#4D4D4D"],"good":"#2E7D32","bad":"#C62828","band":"#EDEDED","fontHeading":"arial","fontBody":"arial","fontFigures":"arial","radius":0,"cards":"plain"}');
end $$;
revoke execute on function prototype_seed_themes() from public, anon, authenticated;
grant execute on function prototype_seed_themes() to service_role;
