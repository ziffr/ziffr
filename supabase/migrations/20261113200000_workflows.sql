-- PROTOTYPE, wipe me. Workflows (GLOSSARY: Workflow, Due Date, Stand-in, Away, Escalation, Unusual Value, Approval, Lock).
create table workflows (
  id serial primary key,
  owner_id text not null references profiles(id),
  name text not null,
  -- {"dueWorkingDays":3,"steps":[{"type":"remind","daysBefore":2}, {"type":"escalate","to":"stand-in","daysAfter":0}, ...]}
  config jsonb not null,
  updated_at timestamptz not null default now()
);
alter table workflows enable row level security;
alter table metrics add column workflow_id int references workflows(id) on delete set null;

-- Who is asked instead of a submitter, per metric, and when people are away.
alter table tokens add column stand_in_id text references profiles(id) on delete set null;
create table away (
  user_id text primary key references profiles(id) on delete cascade,
  starts date not null,
  ends date not null,
  check (ends >= starts)
);
alter table away enable row level security;

-- Where each metric's period is in its workflow.
create table period_states (
  metric_id int not null references metrics(id) on delete cascade,
  period_start date not null,
  state text not null check (state in ('asked','submitted','approval','published','locked')),
  done_steps int[] not null default '{}',
  approval_step int,
  note text,
  updated_at timestamptz not null default now(),
  primary key (metric_id, period_start)
);
alter table period_states enable row level security;

-- An approval request or an escalation is an Action like any other, so it travels through Connectors.
alter table actions add column purpose text check (purpose in ('approval','escalation'));
alter table versions drop constraint versions_object_type_check;
alter table versions add constraint versions_object_type_check
  check (object_type in ('widget','dashboard','deck','master','metric','template','theme','workflow'));

create or replace function prototype_seed_workflows() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from period_states;
  delete from away;
  update metrics set workflow_id = null;
  delete from workflows;
  delete from versions where object_type = 'workflow';
  perform setval(pg_get_serial_sequence('workflows', 'id'), 1, false);
  insert into workflows (owner_id, name, config) values
  ('sara', 'Monthly finance close', '{"dueWorkingDays":3,"steps":[{"type":"remind","daysBefore":2},{"type":"escalate","to":"stand-in","daysAfter":0},{"type":"escalate","to":"owner","daysAfter":2},{"type":"check","changePct":30,"outsideTarget":true},{"type":"approve","approvers":["ben","sara"]},{"type":"publish","lock":true}]}'),
  ('ben', 'Operations, monthly', '{"dueWorkingDays":2,"steps":[{"type":"remind","daysBefore":1},{"type":"escalate","to":"stand-in","daysAfter":1},{"type":"check","changePct":40,"outsideTarget":false},{"type":"approve","approvers":["ben"]},{"type":"publish","lock":false}]}');
  update metrics set workflow_id = 1 where slug in ('revenue', 'orders', 'cost');
  update metrics set workflow_id = 2 where slug in ('support-tickets', 'return-rate');
  update tokens set stand_in_id = case submitter_id when 'sara' then 'ben' when 'ben' then 'anna' when 'anna' then 'sara' end;
end $$;
revoke execute on function prototype_seed_workflows() from public, anon, authenticated;
grant execute on function prototype_seed_workflows() to service_role;
