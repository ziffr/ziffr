-- A View Link to a deck remembers the deck's shapes when it is made (GLOSSARY: View Link): a live link shows the
-- current numbers on those shapes only, never text or slides added later. Empty for older links and for dashboards.
alter table view_links add column shape_ids text[];
