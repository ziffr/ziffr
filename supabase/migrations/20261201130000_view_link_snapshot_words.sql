-- A View Link to a Snapshot keeps the Snapshot's words as they were when its owner made it (spec 0013, second
-- security review): Editors may still change the words in Ziffr, but not what someone outside reads under the
-- owner's link. The numbers are the Snapshot's own and never change anyway. Idempotent.
alter table view_links add column if not exists snapshot_words jsonb check (snapshot_words is null or (jsonb_typeof(snapshot_words) = 'object' and pg_column_size(snapshot_words) <= 400000));
