-- Which decks Ziffr made (spec 0069, GLOSSARY: Deck, Deck Description). Only makeDeckFromDashboard sets the mark, and
-- only a marked deck's document is read as a description. Every deck that exists stays unmarked: adding the column with
-- its default writes no row.
alter table decks add column made boolean not null default false;
