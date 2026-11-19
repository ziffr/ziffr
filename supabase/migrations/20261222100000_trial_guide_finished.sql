-- The Trial Guide reopens until it is finished (ticket 193; GLOSSARY: Trial Guide): a new trial's home and Try it
-- lead to it while this is empty. Set once, when its Owner reaches Done or skips the guide; after that it opens only
-- from the trial's bar. Trials made before the guide (no step kept) never had it and are never sent to it.
alter table workspaces add column trial_guide_finished_at timestamptz;
