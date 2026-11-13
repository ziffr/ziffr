-- PROTOTYPE, wipe me. Groups (GLOSSARY: Group): share with, and limit threads to, several people at once.
create table groups (
  id serial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);
create table group_members (
  group_id int not null references groups(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  primary key (group_id, user_id)
);
alter table groups enable row level security;
alter table group_members enable row level security;

-- A share names a person or a group.
alter table shares alter column user_id drop not null;
alter table shares add column group_id int references groups(id) on delete cascade;
alter table shares add constraint shares_one_subject check (num_nonnulls(user_id, group_id) = 1);

-- A question or task is read by everyone, or by one group (and always by the people on it).
alter table actions add column read_group_id int references groups(id) on delete set null;

create or replace function prototype_seed_groups() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from shares where group_id is not null;
  delete from groups;
  perform setval(pg_get_serial_sequence('groups', 'id'), 1, false);
  insert into groups (name) values ('Management'), ('Operations'), ('Sales');
  insert into group_members (group_id, user_id) values (1, 'sara'), (2, 'sara'), (2, 'ben'), (3, 'sara'), (3, 'anna');
end $$;
revoke execute on function prototype_seed_groups() from public, anon, authenticated;
grant execute on function prototype_seed_groups() to service_role;
