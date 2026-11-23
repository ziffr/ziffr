# 0050 The side panel: one place for what you work on beside the page, including help

**Status:** draft. **Ticket:** tracking issue #921, tickets #922, #923, #924, #925, #926, #927, #928 (the owner's wish, 2026-11-23).

## Problem Statement

Ziffr uses the right-hand side panel for some things (recording a value, alerts, the quick look at a Metric, versions, sharing) and a centred modal window for about twenty-five others. There is no rule, so the same kind of task opens differently from screen to screen, and a modal hides the page the person is acting on. Help is separate again: the user guide is a set of chapters outside the app. And the "N open" mark on a Widget looks like a button and does nothing.

## Solution

1. **A rule.** Use the **side panel** for anything a person looks at or edits while the page stays in view; use a **modal** only for a confirmation or a single yes or no (delete, archive, discard). Written down in `docs/guides/` and checked in review.
2. **Move the working surfaces** into the side panel, one ticket each, starting with the ones people use most: sharing, View Links, the Slot window ("Use this…"), template browsing and saving, add to deck, edit details, retention, new dashboard and new deck. The confirmations stay modals.
3. **Help in the side panel**: a "?" button opens the user guide chapter for the screen you are on, in the panel, with a search over all chapters. No assistant or model is involved (the owner's decision, 2026-11-23); it is the same Markdown as the user guide, so the chapter and the panel cannot disagree.
4. **The "N open" mark on a Widget becomes a button** that opens that Metric's Actions (Questions and Tasks) in the side panel.

## User Stories

1. As a person sharing a dashboard, I want the share settings beside the dashboard, so that I can see what I am sharing.
2. As a new person, I want help for the screen I am on without leaving it, so that I do not lose my place.
3. As a person who wants to know how something works, I want to search the guide from anywhere, so that I find the chapter without browsing.
4. As a person who sees "3 open" on a Widget, I want to click it and see the three Questions and Tasks, so that I can answer them.
5. As a maintainer, I want one rule for panel or modal, so that new screens are built the same way.

## Implementation Decisions

### Words

No new term. The **side panel** is the one that exists; it gets one name in the guide and the code, and the glossary entry for it if it lacks one.

### One panel, many contents

- One panel host in the app shell with a stack of one: opening something replaces what is open, with a way back. Contents are components; the host handles the width (full width on a phone, a fixed width on a desktop), focus, Escape, and the "keep open until I close it" behaviour the Preview already has.
- The panel is keyboard reachable and announces its title; it never traps a person who cannot use a pointer.
- State in the URL where it helps (a panel for a Metric survives a reload and can be linked).

### Help

- The chapters of `docs/user-guide` are bundled at build time into a search index (title, headings, text) shipped to the browser; searching is local, so nothing a person types leaves the app.
- "The chapter for this screen" comes from a table that maps routes to chapters, checked by a test that every route listed exists and every chapter is reachable.
- The panel links to the full guide for people who want the page.
- Feedback (spec 0049) opens from the same panel where it exists.

### The comments mark

The mark in a Widget header gets a button role, an accessible name ("3 open actions for Revenue"), and opens the Actions panel for that Widget's Metrics, using the Actions already read for the page.

## Testing Decisions

- Component tests for the panel host (open, replace, close, Escape, focus return) and a Playwright pass over the moved screens for the "page stays in view" claim.
- Help: a test that every chapter is indexed, a few searches with expected hits, and the route table test above.
- The comments mark: a test for its name and for what it opens.

## Tickets

1. The rule in `docs/guides/` and the panel host (one place, with the accessibility behaviour). (First.)
2. The comments mark opens the Actions panel.
3. Help panel: the index, the "?" button, the route table, search. (Blocked by 1.)
4. Move sharing and View Links into the panel. (Blocked by 1.)
5. Move the Slot window, template browse and save, add to deck. (Blocked by 1.)
6. Move edit details, retention, new dashboard and new deck. (Blocked by 1.)
7. A review check: a lint or a test that flags a new modal without a confirmation shape. (After 4 to 6.)

## Out of Scope

- An assistant, a model or retrieval over the guide (decided against for now).
- Rewriting the guide's content; only how it is shown.
- Changing the confirmation modals.

## Further Notes

Tickets 4 to 6 are independent of each other and can go in any order, each a small pull request. The user guide chapter for each moved screen is updated with it (the CI check requires it).
