-- PROTOTYPE, wipe me. Submission reminders (GLOSSARY: Prompt) go out through Connectors like everything else.
alter table deliveries add column prompt_id int references prompts(id) on delete cascade;
alter table deliveries drop constraint deliveries_kind_check;
alter table deliveries add constraint deliveries_kind_check
  check (kind in ('question','task','reminder','reply','correction','decision','closed','done','prompt'));
