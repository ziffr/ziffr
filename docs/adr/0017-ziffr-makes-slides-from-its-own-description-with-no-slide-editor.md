# Ziffr makes the slides from its own description; there is no slide editor for them

A deck Ziffr makes is stored as Ziffr's own description (`ziffr.deck/1`): which Slide Types, in which order, reading which Metrics, with a few bounded options, a person's own headline and typed answers. It holds no numbers and no positions. Pure code of Ziffr's own turns it into drawing objects that the screen, the PDF and the downloads all read, and a person fills a form: there is no editor that places things on a slide. Changes by hand are made in the downloaded file, in a slide tool, and do not come back. The slide editor Ziffr uses today needs its maker's license key to show on an `https://` address, and a deck that looks professional should not depend on its author drawing it. The owner decided this on 2026-11-27; Spec 0069 (`docs/specs/0069-own-deck-viewer.md`) has the details.

## Considered Options

- **Keep the slide editor and ask every Installation for a key:** rejected. Without a key a self-hosted Ziffr shows a notice where decks should be, and Slide Elements still leave the design of a whole deck to its author.
- **An editor of our own, or another open-source one:** rejected. The owner holds that decks are for viewing more than editing, and a slide tool already edits well. An editor is a large product to build and keep, on a phone above all.
- **Slides as free documents (positions and words stored):** rejected. Stored positions keep a deck from being drawn again in another design or Theme, and stored words and numbers would reach people who may not see the Metric behind them. A description by Metric lets a slide go out whole or not at all.
- **Writing PowerPoint files only, with no viewer:** rejected. People open a deck on a phone, present it and share it by link in Ziffr, with their own visibility.

## Consequences

- **No free placement** in these decks: no drawing, free text boxes, own pictures, arbitrary Widgets, or charts with editable data in PowerPoint. A new kind of slide is code in Ziffr.
- **The description is a format Ziffr must read for ever** once decks are stored in it: it travels in Versions and View Links, and later in Workspace Exports. A change that an older reading cannot take is a new format.
- **Old decks are not converted** and their documents are never rewritten; from the second release they offer to be made again. The slide editor stays in the product for Free layouts where an Installation has a key.
- **Screen and file must agree**, so text widths come from font tables built ahead of time, and a Theme font without a table is drawn in Arial.
- **Creating the slides again makes a new file**; Ziffr never writes back from a file or overwrites one a person may have edited.
