-- PROTOTYPE, wipe me. Connectors outbound (GLOSSARY: Connector, Delivery, Outbox, Delivery Preference).
-- Nothing leaves the machine: deliveries are recorded and shown in the Outbox, replies are simulated.
alter table profiles add column if not exists phone text;

create table delivery_preferences (
  id serial primary key,
  user_id text references profiles(id) on delete cascade, -- null: the team default
  kind text not null check (kind in ('question','task','reminder','update')),
  connector text not null check (connector in ('slack','email','whatsapp','tickets')),
  unique nulls not distinct (user_id, kind)
);
alter table delivery_preferences enable row level security;

create table deliveries (
  id bigserial primary key,
  connector text not null check (connector in ('slack','email','whatsapp','tickets')),
  recipient_id text not null references profiles(id) on delete cascade,
  sender_id text references profiles(id) on delete set null,
  kind text not null check (kind in ('question','task','reminder','reply','correction','decision','closed','done')),
  action_id int references actions(id) on delete cascade,
  subject text not null,
  body text not null,
  external_ref text,
  status text not null default 'sent' check (status in ('sent','answered','closed')),
  created_at timestamptz not null default now()
);
create index on deliveries (created_at desc);
create index on deliveries (action_id);
alter table deliveries enable row level security;

create or replace function prototype_seed_connectors() returns void language plpgsql security definer set search_path = public as $$
begin
  truncate deliveries restart identity;
  delete from delivery_preferences;
  update profiles set phone = case id when 'sara' then '+49 151 0000001' when 'ben' then '+49 151 0000002' when 'anna' then '+49 151 0000003' end;
  insert into delivery_preferences (user_id, kind, connector) values
    (null, 'question', 'slack'), (null, 'task', 'slack'), (null, 'reminder', 'email'), (null, 'update', 'slack'),
    ('ben', 'task', 'tickets'),
    ('anna', 'question', 'whatsapp'), ('anna', 'task', 'whatsapp'), ('anna', 'reminder', 'whatsapp'), ('anna', 'update', 'whatsapp');
end $$;
revoke execute on function prototype_seed_connectors() from public, anon, authenticated;
grant execute on function prototype_seed_connectors() to service_role;
