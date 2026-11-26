# 0057 Slides that look designed: a slide format with brand colours everywhere and more layout elements

**Status:** in progress. **Ticket:** tracking issue #1158, tickets #1159, #1160, #1161, #1162, #1163 (the owner's approval, 2026-11-26).

## Problem Statement

A Deck Template can put Widgets, words and simple boxes on a slide. The words take one of a dozen fixed drawing colours and one clean font; the boxes take the same fixed colours. Only the Widgets, the slide's background and its title size follow the deck's Theme. So a Pack cannot bring a deck that looks designed: no brand colour on a panel or a headline, no headline font, no figure tiles, no chart that answers a meeting's question, no table of salespeople, no cover. The words of a slide made from a template are filled in once, so a weekly headline is stale a week later.

The owner approved a design for the weekly sales forecast (a cover, the call against quota with four figures and weekly columns, a gap table by salesperson, in three brands) and asked for the format, the editor and the renderer to change as far as that design needs.

## Solution

A slide may hold **Slide Elements**: parts that draw themselves in the deck's Theme and fill their words from today's data. The Sales forecast Pack ships a deck built from them and three Themes (navy, coral, forest).

## User Stories

1. As a sales lead, I set the deck up from the Pack once and open it each Monday with this week's figures, headline included.
2. As an Owner, I switch the deck between brand Themes and every element changes colour and font with it.
3. As an Editor, I select an element and change its words, colour, size or Metrics, and I add new ones.
4. As a Viewer or View Link visitor, I see only figures of Metrics the deck may show me.
5. As someone who sends the deck on, I export PDF or PowerPoint and it looks like the slides.
6. As a Pack author, I write these slides in the Deck Template format, and an older Ziffr refuses them in words.

## Implementation Decisions

### A Slide Element is a widget on a slide

An element is stored as a widget on a slide (`template: "slide"`) whose settings hold `element`, a checked structure, and whose Metric list holds every Metric it reads. So everything that already keeps hidden Metrics out of decks, View Links, Snapshots, templates, exports, version history and the demo applies to elements without a second path. Elements are for slides only: a dashboard refuses them. The editor never puts a Metric on an element that the person did not pick: a new element starts with none and says "Pick a Metric", and no change of a setting adds one.

The server checks every `element` wherever widget settings are stored, with the same schema the file checks use: known kinds and fields only, bounded lengths and counts, colours named by Theme role only. No element holds an address, an image or code.

### The kinds

| Element | What it draws |
| --- | --- |
| Words | Paragraphs with a Theme colour, the headline or text font, size, weight, letter spacing, capitals, alignment and an optional lead-in in its own colour and weight. |
| Box | A rectangle filled or edged in a Theme colour. |
| Figure | A label, one large value and a line under it, plain or emphasised (on the cover colour). |
| Column chart | Weekly (or monthly) columns of one Metric, optionally with a part of each filled darker and a reference line from a third Metric, with a title and a legend. |
| Gap table | The rows of two Metrics' latest Breakdowns side by side (such as commit and quota by salesperson) with the difference drawn as bars either side of zero. |
| Metric table | One row per Metric: latest value, the one before, the change, a small trend and whether it is on target. |
| List | Numbered rows with a heading, such as an agenda. |
| Logo place | The Theme's logo, or a dashed box with words until the Theme has one. |
| Cover art | A fixed ornament (rings and a rising line) in Theme colours. |

### Theme colours

Elements name colours by role, never by value: ink, muted, rule, surface, canvas, band, accent, good, bad, data, and four new ones: **cover** (a dark panel), **cover text**, **cover accent** and **soft** (a pale accent). The four are optional in a Theme; without them they are worked out from the others, so every existing Theme works. The Theme editor edits them.

### Words that stay current

An element's words are filled when the slide is drawn, not once. To the existing Placeholders it adds, for slides only: `{quarter}`, `{quarter week}`, `{quarter weeks}`, `{weeks left}`, `{change}` (the change in the Metric's unit), `{difference A B}`, `{left A B}` (the difference, never below 0), `{gap A B}` ("0.19 M€ short" or "0.18 M€ above quota"), `{scale}` (the unit the element writes in, such as M€) and `{slide}` (the page number). Elements write large values short and in one scale per element: from a million as "3.01 M€", from ten thousand as "640 k€", below that as the Metric writes them. What lies between two percentages is written in points ("+4 pts").

A Pack's deck claims nothing its Metrics do not say. Words may carry an `empty` line, such as a question, shown while a Placeholder in them has no value; a figure leaves out the line under it. What only the presenter knows is a question to write over.

A slide may be a **cover**: it shows no logo, footer or number of the Theme and is not counted in the page numbers. A slide with a logo place, a page number or a footer line of its own does not draw the Theme's second copy of it.

### Formats

`ziffr.deck-template/2` adds the element shapes and the cover mark; `ziffr.theme/2` adds the four colours. Ziffr reads `/1` for ever and writes `/1` whenever a file uses nothing new. An older Ziffr refuses a `/2` file naming the formats it reads. Limits stay: 12 Slots, 40 slides, 40 shapes a slide; a Metric table takes at most 12 Metrics, a Gap table shows at most 30 rows, a List 8.

### Exports

PDF draws the slides as shown, always in the designed colours. PowerPoint gets each element as native text boxes and shapes at the places the slide has them; fonts are named, not embedded, so a computer without them substitutes its own, and a chart arrives as shapes, not as an editable chart.

## Testing Decisions

Unit tests for the format checks (old files still pass, hostile elements are refused, older formats refuse in words), for the figures an element writes (scale, gap words, quarter weeks) and for Theme colours. A database test that a deck made from the new template draws only Metrics its viewer sees. The Pack's deck is compared at 1280 by 720, in the three brands, against the approved design.

## Out of Scope

Free-form images in templates, custom fonts, editable native charts in PowerPoint, elements on dashboards, animation, a second page size.

## Decisions for the owner to check

1. The Pack now holds Themes, so only an Owner installs it.
2. A logo place without a logo shows the dashed "Your logo" box also when presenting, exporting and on View Links. Deleting the element removes it.
3. Large values are written short (M, k) on slide elements only; Widgets and dashboards are unchanged.
4. Headlines that state a judgement ("Two salespeople are short") are written by the presenter; the template's defaults fill in only what the data decides.
5. In PowerPoint the charts are shapes, not editable charts.
