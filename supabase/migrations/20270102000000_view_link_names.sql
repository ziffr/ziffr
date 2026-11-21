-- View Links show no people's names unless the person who made the link ticks "Show names" (ticket #590). Every link
-- that exists now gets the default: off. The column is read when a link is opened, so a frozen link, which keeps
-- the names it was made with, can still be switched on or off.
alter table view_links add column if not exists show_names boolean not null default false;
update view_links set show_names = false;
