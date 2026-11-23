-- The Metric to explain on a person's Analysis Canvas (GLOSSARY: Analysis Canvas; ticket #988): which of the Metrics on the
-- canvas the analyses that explain one Metric (Drivers, What moves B?, What does B need?, What if A changes?, Did it work?) are
-- about. It was the leftmost Metric; it is now its own mark, so the order of the Metrics does not change it. At most one Metric of
-- a person's canvas in a Workspace carries it; none marked means the first one. The existing row-level security of the table covers
-- the column (a person reads and writes only their own canvas); no demo row is touched.
alter table analysis_canvas add column explains boolean not null default false;
create unique index analysis_canvas_one_explains on analysis_canvas (user_id, workspace_id) where explains;
