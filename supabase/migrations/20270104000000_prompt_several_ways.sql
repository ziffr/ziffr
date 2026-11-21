-- A Prompt on several ways at once (#613; GLOSSARY: Prompt, Delivery Preference). A person's way for Prompts becomes an
-- ordered list: position 0 is the first way (the only one that sends reminders). The one way every row had so far is a list
-- of one. Nothing else about the other kinds changes: they keep one way (position 0).
alter table delivery_preferences add column if not exists position int not null default 0 check (position between 0 and 2);
alter table delivery_preferences drop constraint if exists delivery_preferences_workspace_user_kind_key;
alter table delivery_preferences add constraint delivery_preferences_workspace_user_kind_position_key unique nulls not distinct (workspace_id, user_id, kind, position);
-- The same way is never in a list twice.
alter table delivery_preferences add constraint delivery_preferences_workspace_user_kind_connector_key unique nulls not distinct (workspace_id, user_id, kind, connector);

-- What a Delivery of a Prompt takes as an answer: the Source its reply counts on (web_form: only the form link answers).
-- Rows made before this have none and fall back to the Prompt's own Source.
alter table deliveries add column if not exists answer_source text check (answer_source in ('slack','mail','telegram','web_form'));
-- Which Source brought the first accepted value, so the other Deliveries of the Prompt can say where it was answered.
alter table prompts add column if not exists answered_source text check (answered_source in ('slack','mail','telegram','web_form','api'));
