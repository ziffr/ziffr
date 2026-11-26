# 0060 How a Metric is calculated

**Status:** done. **Ticket:** tracking issue #1198, tickets #1199 and #1200 (the owner's approval, 2026-11-26).

## Problem Statement

A Metric has one text, its description. It has to answer two different questions: what the number is and why it matters, and exactly how it is counted. In practice it answers the first, so two people read the same Annual recurring revenue and mean different numbers: whether one-off fees are in it, what a discount does, whether a signed contract that has not started counts. When someone changes the rule, nobody can see when it changed.

## Solution

A Metric gets a second text, the **Calculation Note**, shown as **How it is calculated**.

- **Description:** what the number is and why it matters.
- **How it is calculated:** exactly what counts and what does not, where the figure comes from, and which adjustments are made. For annual recurring revenue: one-off fees, discounts, contracts not yet started.

It is not a formula. A Derived Metric keeps its formula, and the Calculation Note stands beside it and says in words what the formula cannot.

## User Stories

1. As a Metric Owner, I write down what counts, so everyone who reads the number means the same thing.
2. As someone looking at a number, I open How it is calculated on its page or in its Quick look without asking anyone.
3. As anyone who sees the Metric, I find in its history when the definition changed and what it said before.
4. As a Pack author, I ship each Metric with its Calculation Note, so it arrives with the numbers a team sets up.
5. As a sales lead, I put the definitions of the numbers in an appendix of my quarterly review deck, and they stay current.
6. As a program or an assistant, I read and write the Calculation Note where I read and write the description.

## Implementation Decisions

### One more field of the Metric Description

- Plain text, up to 2000 characters, line breaks kept, empty by default. Never markup, never followed as a link.
- Its owner and its Editors change it, as the description. A program with `metrics:edit` may change it too, as its creator.
- **Protected as the description is, and never shown more widely.** It is sealed with the Workspace Key for its Metric's row and covered by the re-encryption job. It goes to whoever the Metric is shared with. It does not go out with a View Link or a Snapshot shared outside the Workspace, and the personal form link does not receive it.
- **History.** Each change is a Version of the Metric Description. The Version's message says that how it is calculated changed, so a reader of the history sees when the definition changed. Restoring a Version restores the text; a Version from before the field existed restores an empty one.
- **Demo.** A visitor's text passes the demo's text rules; the words of a seeded Metric stay.

### Where it shows

The Metric's page shows **How it is calculated** under the description, closed until opened, and in the Description tab. The Quick look shows it too. For a Derived Metric the formula stands beside it, written with the inputs' names, and only for someone who sees every one of them. The new-Metric forms and Edit details have the field.

### Files and programs

- The API, the SDK, the MCP Server and the prompt for an assistant that fills past periods carry `calculation_note`.
- The Metric file format gets `ziffr.metric/2`, which adds `calculationNote`. Ziffr writes `/2` only for a Metric that has a note and `ziffr.metric/1` otherwise, so an older Ziffr reads everything that uses nothing new and refuses a `/2` document in words, naming the formats it reads. `/1` is read for ever.
- Workspace Export and import carry it (up to 2000 characters, the app's text rules).
- A Pack's Metric Catalog entry may carry it (up to 1000 characters, plain text without markup or web addresses, the same assistant-words check as the description).

### Slides

The Placeholder `{calculation note}` (with a number for another Slot) is filled where a widget's, a Finding's or a Slide Element's words are drawn for the person looking. It is never filled into words that are saved: a slide's own text and boxes, made from a Deck Template or a layout, keep it as written, and a file may not hold it there. A **Definitions** Slide Element lists up to 12 Metrics with their description and Calculation Note for an appendix. Both show nothing of a Metric the viewer may not see. A View Link carries no Calculation Note: the Placeholder is empty there and the element shows only the names.

### Content

The demo's Metrics and the Metric Catalog entries of Ziffr's own Packs get plain, correct texts of one to three sentences.

## Testing Decisions

Unit tests for the format (old files still pass, `/2` with and without a note, an older reader refuses in words) and for the Placeholder and element. A database test that only owners and Editors change it, that people without the Metric do not get it, that View Links and form links never carry it, that each change is a Version and restores, that it is sealed, and that export and import keep it.

## Out of Scope

- Marking changes of the definition on charts (a later ticket).
- Formatting, links or pictures in the text.
- A review or Approval step for definition changes.
- Translating the texts.

## Decisions for the owner to check

1. The glossary term is **Calculation Note**; screens say "How it is calculated". "Definition" was avoided because it reads as the whole Metric Description.
2. View Links and Snapshots shared outside show no Calculation Note, as they show no description. A Definitions slide is therefore empty for a View Link visitor.
3. The personal form link does not show it, though it shows the description.
