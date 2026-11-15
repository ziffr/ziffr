# 0010 Dashboards, stories and decks

**Status:** done. **Tracking issue:** #145 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0010`.

> **Changed course:** stories as their own thing are folded back into dashboards, and a dashboard's Snapshots take over their job (ADR 0007, spec 0013, draft; tracking issue #173).

## Problem Statement

People do three different things with their numbers: watch them, explain them, and present them. Ziffr has a dashboard and a deck, but the line between them is blurred and the middle job has no home.

- **Home is the first dashboard,** and dashboards are tabs across the top of it. With more than a few, or with dashboards shared by others, the tabs do not say which are one's own, and nobody can choose which one opens first.
- **The Pool is always there.** It is the side panel to build a dashboard with, but it takes a quarter of the screen for everyone, also when they only look, and also for Viewers who cannot change anything.
- **"Story" means a widget style,** an editorial graphic with a headline, and "Board stories" in the demo is just a dashboard full of them. Nothing in Ziffr tells what happened in an order, the way a monthly update does.
- **A dashboard cannot become a deck or a story.** Whoever needs the same numbers in a board pack rebuilds them on slides by hand.

## Solution

Three things, each with one job, and an easy way from one to the next:

| | Job | Shape | Read where |
|---|---|---|---|
| **Dashboard** | Watch: always current | a grid of widgets | in Ziffr, on a phone, through a View Link |
| **Story** | Explain: what happened and why | a column of Findings read top to bottom: headline, chart, a few sentences | in Ziffr and through a View Link, on any screen |
| **Deck** | Present: meetings and board packs | 16:9 slides | presented in Ziffr, or exported to PowerPoint and PDF |

- **Home opens your starting dashboard.** You choose it with *Make this my home*; until you do, it is the first dashboard you own, else the first shared with you. A switcher by its title lists every dashboard you can open, *Mine* first, then *Shared with me*, with search. The top bar's *Dashboards*, *Stories* and *Decks* each open a list of yours and those shared with you.
- **Dashboards open to look at.** Full width, no Pool. Owners and Editors press *Edit*: the Pool appears, widgets can be dragged, resized and added; *Done* leaves edit mode. Viewers never see *Edit*.
- **Stories are their own thing.** A story has a title, an introduction, and Findings in order. A Finding is what the Story Widget is today: a headline that states the finding, its chart (one or more panels), a few sentences, footnotes and its source. Stories are shared, versioned and shown through View Links like dashboards and decks.
- **Turning one into another.** A dashboard's ⋯ menu has *Make a story* (one Finding per widget, in reading order, headlines to fill in) and *Make a deck* (one slide per widget). A story's ⋯ menu has *Make a deck* (a title slide, then one slide per Finding). The copy is independent of what it came from; its numbers stay live.
- **Names.** "Board stories" becomes a real story in the demo, named for what it tells. The editorial widget style is called a *Finding* wherever it appears, on a story, a dashboard or a slide.

```
 Home = your starting dashboard                     Story
 ┌──────────────────────────────────────────┐       ┌───────────────────────────┐
 │ Monthly overview ▾   ⌂ home   Share  Edit │       │ October in short          │
 │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │       │ intro sentence …          │
 │ │Rev.  │ │Margin│ │Cost  │ │Tickets│      │       │ ── Finding 1 ───────────  │
 │ └──────┘ └──────┘ └──────┘ └──────┘       │       │ Revenue held up despite … │
 │ ┌───────────────┐ ┌──────────┐            │       │ [chart]                   │
 │ │ Cost (chart)  │ │ Revenue  │            │       │ two sentences, source     │
 │ └───────────────┘ └──────────┘            │       │ ── Finding 2 ───────────  │
 └──────────────────────────────────────────┘       │ …                         │
   ▾ Mine: Monthly overview ⌂, Sales                 └───────────────────────────┘
     Shared with me: Support (Ben)
 Edit mode: the Pool slides in on the left; Done closes it.
```

## User Stories

1. As a member, I want Ziffr to open on the dashboard I look at every day.
2. As a member with many dashboards, I want to find one by name and see which are mine and which were shared with me.
3. As a Viewer, I want a dashboard to use the whole screen, without building tools I cannot use.
4. As a dashboard's owner or Editor, I want to switch into editing on purpose and back out again.
5. As a finance lead, I want to write the month's update as a sequence of findings, each with its number and a sentence, and send a link to it.
6. As a reader on a phone, I want a story to read top to bottom like an article.
7. As a founder preparing a board meeting, I want a deck made from my dashboard or my story, then adjust the slides.
8. As anyone, I want the same words everywhere: a dashboard watches, a story explains, a deck presents.

## Implementation Decisions

- **Starting dashboard:** a nullable `home_dashboard_id` per membership (new migration), set and cleared by the person themselves through the core; a dashboard they can no longer open falls back to the default. `/` redirects to it; `/dashboards` lists dashboards.
- **Switcher and lists:** the core returns the dashboards, stories and decks the person may open, marked as theirs or shared (who shared). Lists show name, owner, last change; search filters in the browser over what was sent.
- **Edit mode:** a page state, not a permission: the core still checks every change. The Pool, dragging, resizing and a widget's editing menus are there only while editing; an empty dashboard its owner or Editor opens starts in edit mode. The Pool lists Metrics the page has anyway (since #125 a page sends only the series it draws), so it is not loaded separately.
- **Stories are kept as dashboards of kind `story`** (migration `20261128100000_stories.sql` adds `kind` and `intro`), not in a table of their own: sharing, Groups, Versions, View Links, the Audit Log and the visibility rules (whoever a story is shared with sees its Metrics; only Metrics the writer sees can be added) are the dashboard's, already tested, and a story's widgets are its Findings, one per row in the order of their place. People never see the difference: stories have their own list, page, top-bar entry and wording. Editing a Finding reuses its editor in the widget's ⋯ menu.
- **Conversions:** core functions copy widget specs into a new story or deck owned by the actor, after checking they see every Metric on it.
- **Finding:** the glossary's *Story Widget* becomes *Finding*; templates and code follow in the same change.

## Tickets (in order)

1. #146 Starting dashboard and the switcher (Home, *Make this my home*, *Mine / Shared with me*, lists for dashboards and decks).
2. #147 View mode and edit mode on dashboards; the Pool only while editing.
3. #148 Stories: table, core, sharing, Versions, View Links, Audit Log; the story page and editor; the demo's "Board stories" made a story.
4. #149 Make a story from a dashboard; make a deck from a dashboard or a story.
5. #150 Words: *Finding* for the widget style, glossary and help texts; the top bar's *Stories*.

## Testing Decisions

DB tests for the starting dashboard (own, shared, lost access), stories (visibility, sharing, View Links, Versions, refusing Metrics the owner does not see) and conversions. Browser checks of Home, the switcher, edit mode, a story on a phone and a story made into a deck.

## Out of Scope

Comments on stories, scheduled story emails, and turning a deck back into a story.
