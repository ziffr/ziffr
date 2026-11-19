-- Self-check (ticket 263, GLOSSARY: Self-check): when nobody but its submitter could approve a value, they may check
-- it themselves with a task of its own purpose, so it is never taken for an Approval (approve() takes only those).
alter table actions drop constraint actions_purpose_check;
alter table actions add constraint actions_purpose_check check (purpose in ('approval', 'escalation', 'self_check'));
