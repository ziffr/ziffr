# 0069 Ziffr makes the slides: its own deck generator and viewer

**Status:** in progress (2026-11-27). Tracking issue #1360, tickets #1361 to #1371 (first release). Changes specs 0057 and 0061 for new decks.

## Problem

The slide editor Ziffr uses today shows only with a license key from its maker; without one, an `https://` Ziffr shows a notice where decks should be. And a deck should be consulting-grade without its author drawing it: one design through the whole deck, independent of the Theme.

The owner, 2026-11-27, on replacing "the editor with our own directly, if the output is good enough": "it is more about viewing something than editing.. edits could be done in the slide tool. and we would have to include one slide that explains how the slides are technically built, that regenerating them overwrites data etc". On the plan below: "yes go ahead with this planning basis".

## Solution

Ziffr **makes** a deck from Metrics, **shows** it in its own viewer and lets people **download** it. A person chooses and answers; they do not draw.

1. View and present in Ziffr: phone too, private, View Links.
2. Download PowerPoint that also works in Keynote and Google Slides.
3. The last slide, **About these slides**, written by Ziffr: made by Ziffr, the date and which numbers; changes made in the file stay in the file and do not go back to Ziffr; creating the slides again makes a **new** file with current numbers (Ziffr never overwrites a file a person may have edited) and changes are not carried over; charts are drawn as shapes, so numbers are changed in Ziffr; where each number comes from, with a link.
4. Later: **Open in Google Slides**, with access to that one new file only (`drive.file`).

Software holds the form: grid, type scale, direct labels, source line, nothing clipped. Headline rules say what the numbers say and never a cause. Whether the message is the right one stays a person's work.

Not available in a deck Ziffr makes: free placement, drawing, free text boxes, own pictures, arbitrary dashboard Widgets, charts with editable data in PowerPoint, a Theme's background image and logo position.

## The deck description: `ziffr.deck/1`

Content only: **no numbers and no positions**. Defined and checked in `packages/pack`; stored in `decks.document` and told apart by `format`, so Versions and frozen View Links carry it without a migration.

```json
{ "format": "ziffr.deck/1", "design": "band", "emphasis": "strong",
  "slides": [ { "id": "sl_a1", "type": "chart", "metrics": [12],
    "options": { "periods": 12, "target": true }, "headline": null, "hidden": false,
    "answers": [ { "question": "What puts the commit at risk?", "text": "", "writtenOn": null } ] } ] }
```

Order is list order. A **Deck Design** (`band`: headline band; `column`: side column at the left) says where things stand; the Theme says colours, fonts, logo and footer words. Limits: 40 slides, 12 Metrics a slide, 512 KB. A table or gap table that does not fit continues on a second slide; nothing is dropped silently.

**A slide reads only the Metrics in its `metrics`.** If a formula or a Total later reads a Metric the slide does not list, the slide says so and offers to be made again. It never widens by itself.

## Slide types

First release, all filled from numbers alone except the answers:

| Type | Shows | From |
| --- | --- | --- |
| `cover` | name, period, agenda made from the headlines | the deck |
| `summary` | up to 4 figures and 1 chart | Metrics, targets |
| `chart` | 1 or 2 charts, columns or line; target, filled part, reference | Metrics, Target Series |
| `table` | every figure: latest, before, change, trend, on or off target | Metrics |
| `gap-table` | two Breakdowns, or a Total and its parts, with the difference | as today's gap table |
| `bridge` | the change since the period before, a step per part, and what the parts leave out | a Breakdown, a Total, or a Derived Metric that adds and subtracts (Method `bridge`) |
| `mosaic` | columns as wide as their share, cut into their parts | a Breakdown with parents, no negative numbers; small parts as "Other" |
| `driver-tree` | a Derived Metric and what its formula reads, up to 3 levels | the Formula Tree's rules |
| `questions` | up to 3 questions with typed answers | a person |
| `definitions` | each Metric and how it is calculated | Metric Descriptions |
| `about` | About these slides; always last, cannot be changed, hidden or moved | the deck |

A slide whose data cannot carry it is not made, and the maker says why. If data stops carrying it later, the slide stays and says so in a sentence.

Second release: `assessment` and `roadmap`, each filled through a short form with fixed limits.

## What a person enters

A form, never an editor: the deck's name, design, Theme and footer; per slide, show or hide and an optional own headline (140 characters; empty means Ziffr's); on question slides up to 3 answers (plain text, 400 characters, at most 4 lines). The owner and Editors write; Viewers read. An answer shows the day it was written once a newer period has begun, and **Clear answers** readies the next meeting. Adding single slides and reordering come later.

## Visibility

One core operation, `readDeck(actor, id)`, returns what this person gets: the description with only their slides, the data of only those slides' Metrics, and how many slides are left out. The viewer, PDF and both downloads are made from that answer and nothing else.

- **A slide goes out whole or not at all.** Unless the viewer gets every Metric it lists, no headline, answer, row or title of it goes out. Page numbers and agenda are counted after that. Totals keep today's rule for periods and parts.
- A deck's **Share** opens the Metrics its slides list, as today. Saving checks that the saver sees every Metric newly named. A document of a form no reader knows opens nothing and cannot be saved.
- **View Links:** only slides and Metrics agreed when made; no descriptions or Calculation Notes; names read "Someone", also in answers, unless **Show names**; a frozen link keeps a sealed copy. No download through a View Link.
- **Downloads:** whoever may open the deck, Viewers included, recorded in the Audit Log as today. The file holds what that person sees.
- **About, where numbers come from:** each Metric's name, kind of source (typed in, from a connected system, calculated), latest period and a link that asks for sign-in. No people, Feed names or email addresses. Through a View Link there are no links.
- The demo and a Practice Workspace keep their rules.

## Drawing, screen, file and PDF

Pure drawing turns what `readDeck` returns into one list of objects. The screen and the file both read that list, so they say the same in the same places. Text widths come from font tables built ahead of time (the Theme fonts with openly licensed font files, and fonts with the same widths as Arial and Georgia), so browser, tests and file break lines alike. A Theme whose fonts have no table is drawn in Arial.

- Slides are always drawn as designed: no dark-Appearance variant.
- **Two downloads:** **PowerPoint or Keynote** (fonts any computer has) and **Google Slides** (Theme fonts, with its own line spacing and bullets). Headlines are bold.
- Charts are shapes in groups; tables are tables; headlines sit in title placeholders; colours and fonts come from the file's theme and slide master. Ziffr uses PptxGenJS and writes the slides' XML itself.
- **PDF:** the same slides printed by the browser at 13.333 by 7.5 in, text selectable. Chromium is proven by a local proof; Safari and Firefox are checked and the guide says the result.

## Untrusted input

A closed schema checks the description on every write and again on read: known types and options, integer ids, capped plain strings; no markup, address, image or code. Typed words are not filled as Placeholders. The file writer escapes XML and drops characters XML forbids; the only links are Ziffr's own, built from the configured address and the Metric. The screen renders text as text.

## Quality

In CI: every slide type in both designs, with several Themes and both font sets, the longest names in the shipped Packs, and empty, hidden and negative data: nothing outside its region, clipped or overlapping; headlines at most two lines; fixed type scale; units, source and page number; contrast; screen and file within 2 px; Microsoft's Open XML validator on the files; database tests for every visibility rule.

By eye: pictures of all slides in each drawing pull request. A validator does not promise that PowerPoint opens a file cleanly, so **the owner opens two sample files in PowerPoint and Keynote before the PowerPoint ticket is merged, and nothing is switched on before that.**

## Contract between the tickets

Built behind one constant that is off; nothing links to the new screens until the last ticket.

| Where | Holds | Ticket |
| --- | --- | --- |
| `packages/pack/src/deck-description.ts` | `DeckDescription`, `SlideDescription` (the fields above), limits, `checkDeckDescription` | #1361 |
| `packages/core/src/deck-drawing/` | pure: drawing objects, designs, Theme roles, text measures, the shared frame, charts as shapes, a registry with one file per slide type | #1362 |
| `packages/core/src/deck-headlines.ts` | pure: headline proposals from a Metric's values and targets | #1363 |
| `packages/core/src/deck-read.ts` | `readDeck(actor, id)` returning `{ deck, data, leftOut }`, where `data` is a `CanvasData` cut to those slides | #1364 |

A slide type is two pure steps: `fill(slide, data)` gives its content, and `draw(content, region)` gives objects.

## Existing decks and other work

- Old decks are **not converted** and their documents are never deleted or rewritten. From the second release an old deck says it was made with the old editor, lists its typed words, and offers **Make the slides again**. Until then old decks work as today.
- **Free layouts** are not retired or converted: #1359 offers them only where the slide editor has a key. The editor stays in the product for those installations. No deck uses it after the second release.
- **Spec 0068:** goes on. "Make each deck" stays behind one core operation, which later writes a description, so slides are filled at once and **Open the slides** works on a phone.
- **#1340** (decks for ten Packs) waits for #1370.
- 0.21.0 does not wait for this spec.

## First release

| Ticket | What | Needs first | Security review |
| --- | --- | --- | --- |
| #1361 | Description format, glossary, ADR | | Opus |
| #1362 | Drawing base, font tables, screen renderer, cover, checks | | Sonnet |
| #1363 | Headline rules | | Sonnet |
| #1364 | Core: store, read, answers, visibility, make a deck | #1361 | Opus |
| #1365 | Slide types: summary, chart, table, questions, definitions, about | #1361, #1362, #1363 | Sonnet |
| #1366 | Slide types: gap table, bridge, mosaic, driver tree | #1361, #1362 | Opus |
| #1367 | Viewer, Present, deck page with the form | #1362, #1364, #1365 | Sonnet |
| #1368 | PowerPoint: two downloads, validator. **Merged only after the owner's check** | #1362, #1365, #1366 | Opus |
| #1369 | View Links and PDF | #1364, #1367 | Opus |
| #1370 | `ziffr.deck-template/4`, forecast and board meeting templates | #1364, #1365, #1366, #1342 | Opus |
| #1371 | Switch on, user guide, release note | all, and the owner's check | Opus, the whole |

#1361, #1362 and #1363 start at once. Then #1364, #1365 and #1366; then #1367, #1368 and #1370.

**Done when:** a person makes the forecast deck on a phone, presents it, shares it and downloads it; both files open without a repair prompt in PowerPoint and Keynote and the Google file looks as the screen does; someone who may not see a Metric finds no trace of its slides on any path.

## Later releases

Ticketed after the first release.

- **Second:** Snapshot slides (a slide with a Snapshot draws only its numbers, under spec 0061's rules: the Share opens nothing, View Links leave it out), with **Make a deck** and **Add to a deck**; `assessment` and `roadmap` with their forms; a converter that reads `ziffr.deck-template/1` to `/3` for ever and says what it left out; Save as Deck Template, Pack export, Workspace Export and Import; every shipped Pack's deck, #1340 included; the demo; old decks and old View Links; removal of the old deck editor and its export, the editor then loaded only for Free layouts where there is a key.
- **After that:** **Open in Google Slides** (a trial of the conversion first; whoever runs their own Ziffr needs their own Google client); more slide types.

## Out of scope

A slide editor, PowerPoint import, editable chart data, animations, speaker notes, co-editing, writing back from a file, PDF made on the server.
