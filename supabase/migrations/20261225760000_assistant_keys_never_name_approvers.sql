-- Naming who approves a Workflow and who its Tell steps tell is a person's decision (ticket #433): an assistant's
-- connection never holds the scope workflows:people, whatever asks for it. The core already refuses it where
-- connections are made; this is the backstop in the database, widened from the one that guards values:approve and view-links:write.
alter table access_keys drop constraint access_keys_assistant_never_approves;
alter table access_keys add constraint access_keys_assistant_never_approves check (kind = 'program' or not (scopes && array['values:approve', 'view-links:write', 'workflows:people']));
