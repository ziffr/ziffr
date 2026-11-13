-- PROTOTYPE, wipe me. A stand-in submits with a Token of their own, marked as standing in, never with the
-- submitter's; and a period knows its one current approval task.
alter table tokens add column stands_in_for text references profiles(id) on delete cascade;
alter table period_states add column approval_action_id int references actions(id) on delete set null;

-- A stand-in's Token lasts while they are the stand-in, and 14 days after they were last asked.
alter table tokens add column expires_at date;
