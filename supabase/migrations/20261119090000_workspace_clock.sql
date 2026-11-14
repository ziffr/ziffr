-- A workspace's clock (spec 0005, ticket #84; GLOSSARY: Workflow, Due Date): the time zone its days are counted in,
-- and the hour its Workflows run each morning. Owners and Admins set them; UTC and 8 o'clock until they do.
alter table workspaces add column time_zone text not null default 'UTC' check (char_length(time_zone) between 1 and 64);
alter table workspaces add column run_hour smallint not null default 8 check (run_hour between 0 and 23);
