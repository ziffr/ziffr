-- Contacts' details sealed (spec 0028, ticket #246; GLOSSARY: Contact, Workspace Key). A Contact's email address,
-- Slack handle and phone are sealed with the Workspace Key, so the unique indexes on lower(email) and
-- lower(slack_handle) can no longer tell two of them apart. Blind indexes do instead: an HMAC of the normalised value
-- under a key derived from the Workspace Key, equal for equal values within one Workspace and nothing across. Plain
-- rows from before keep the old indexes, which still hold for them, until the re-encryption job seals them (#247).
alter table contacts
  add column email_index text check (email_index ~ '^b1\.[0-9]{1,9}\.[A-Za-z0-9_-]{43}$'),
  add column slack_index text check (slack_index ~ '^b1\.[0-9]{1,9}\.[A-Za-z0-9_-]{43}$');
create unique index contacts_workspace_email_index on contacts (workspace_id, email_index) where email_index is not null;
create unique index contacts_workspace_slack_index on contacts (workspace_id, slack_index) where slack_index is not null;
