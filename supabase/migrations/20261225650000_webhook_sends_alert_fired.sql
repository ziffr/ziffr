-- alert.fired for Webhooks (spec 0034, ticket #408; GLOSSARY: Webhook, Tell): a send row of this type points at the Tell
-- step that fired (its Workflow and the step's id), the Metric and the period, and holds no value: the message is built
-- when it is sent, from the value as it counts then, so a value sent back meanwhile or a Metric made private is not told.
-- The type 'alert.fired' is already allowed by the check of the table. No new table, so nothing for the demo guard.
alter table webhook_sends
  add column workflow_id bigint references workflows(id) on delete cascade,
  add column tell_step_id text check (char_length(tell_step_id) <= 40);
