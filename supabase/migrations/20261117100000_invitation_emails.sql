-- Email invitations (spec 0004, ticket #72; GLOSSARY: Invitation). Whether an invitation by email was really
-- emailed, how often, and why not, for the Team page; at most three sends per invitation.
alter table invitations add column email_sent_at timestamptz;
alter table invitations add column email_sends smallint not null default 0 check (email_sends between 0 and 3);
alter table invitations add column email_error text check (char_length(email_error) <= 200);
