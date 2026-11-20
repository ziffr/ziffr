-- Approving a value is a person's check (ticket #427): an assistant's connection never holds the scope values:approve,
-- whatever asks for it. The core already refuses it where connections are made; this is the backstop in the database.
alter table access_keys add constraint access_keys_assistant_never_approves check (kind = 'program' or not ('values:approve' = any (scopes)));
