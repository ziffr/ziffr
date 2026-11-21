-- A View Link publishes data outside the workspace (ticket #435), and approving a value is a person's check (ticket
-- #427): an assistant's connection holds neither scope, whatever asks for it. The core refuses it where connections are
-- made; this is the backstop in the database, widened from the one that guarded values:approve alone.
alter table access_keys drop constraint access_keys_assistant_never_approves;
alter table access_keys add constraint access_keys_assistant_never_approves check (kind = 'program' or not (scopes && array['values:approve', 'view-links:write']));
