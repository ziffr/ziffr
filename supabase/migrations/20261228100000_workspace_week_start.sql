-- A workspace's first day of the week (ticket #520; GLOSSARY: Workspace, Schedule): 1 is Monday, which every
-- existing Workspace keeps, 0 is Sunday. It only changes how weeks are shown (the Schedule's week and month views and
-- its default span); Metric periods stay Monday to Sunday, so no stored value moves.
alter table workspaces add column week_start smallint not null default 1 check (week_start in (0, 1));
