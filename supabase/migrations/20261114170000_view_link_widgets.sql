-- View Links (GLOSSARY: View Link) remember which widgets the dashboard had when the link was made: a live link shows
-- the current numbers of those widgets only, never widgets added later. Empty for older links and for decks.
alter table view_links add column widget_ids int[];
