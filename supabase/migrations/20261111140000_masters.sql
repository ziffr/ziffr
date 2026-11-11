-- PROTOTYPE, wipe me. Masters (GLOSSARY: Master): a deck's shared design.
-- Images are stored as data URLs for the prototype; Supabase Storage replaces this later.
create table masters (
  id serial primary key,
  owner_id text not null references profiles(id),
  name text not null,
  background_color text not null default '#F7F4F0',
  background_image text,
  logo text,
  logo_ratio numeric not null default 3,
  logo_position text not null default 'top-right' check (logo_position in ('top-left','top-right','bottom-left','bottom-right')),
  logo_width int not null default 140,
  footer text not null default '',
  show_slide_number boolean not null default true,
  text_color text not null default '#2B2420',
  title_size int not null default 56,
  body_size int not null default 24,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table masters enable row level security;
alter table decks add column master_id int references masters(id) on delete set null;

create or replace function prototype_reset_decks() returns void
language plpgsql security definer set search_path = public as $$
declare mid int;
begin
  truncate decks, masters restart identity cascade;
  insert into masters (owner_id, name, footer, is_default)
    values ('sara', 'Northwind Goods', 'Northwind Goods, internal', true) returning id into mid;
  insert into decks (owner_id, name, master_id)
    values ('sara', 'Board update, ' || to_char(current_date, 'FMMonth YYYY'), mid);
end;
$$;
revoke execute on function prototype_reset_decks() from public, anon, authenticated;
grant execute on function prototype_reset_decks() to service_role;
