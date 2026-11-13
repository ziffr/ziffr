-- Sign-in (ADR 0003; spec 0001 ticket 6, #7): a signed-in account belongs to one person. People who sign up
-- have no Slack handle yet, so the handle becomes optional.
alter table profiles add column auth_user_id uuid unique references auth.users(id) on delete set null;
alter table profiles alter column slack_handle drop not null;
