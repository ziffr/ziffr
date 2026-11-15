# 0013 Dashboard Snapshots

**Status:** draft. **Tracking issue:** #173 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0013`. **Decision:** ADR 0007. **Replaces** the story as its own thing from spec 0010.

## Problem Statement

Spec 0010 gave Ziffr three things: a dashboard to watch, a story to explain and a deck to present. A story is stored as a dashboard, and what tells it apart is a column instead of a grid and words on its widgets. Both are live and show the same numbers.

- **People cannot tell them apart.** Explaining when to make a story rather than a dashboard did not work, not even for the people who designed it.
- **A story's words go stale.** "Revenue held up in October" sits next to a chart that shows November a month later, and nobody notices.
- **Nothing keeps what was reported.** A monthly update is sent, and in March nobody can see what the team said and knew in January. Versions keep how something was built, not what it showed. A frozen View Link keeps values, but only for whoever has the link.

## Solution

One thing to watch, the dashboard, and a way to fix it to a period, the **Snapshot**:

| | Job | Numbers | Words |
|---|---|---|---|
| **Dashboard** | Watch | live | an introduction and Findings, optional |
| **Snapshot** | Record and explain one period | fixed at the period | written after it is taken, then kept |
| **Deck** | Present | live until exported | free, on slides |

- **Read a dashboard two ways.** *Grid* is how a dashboard looks today. *Read* shows its introduction, then its widgets one below the other in reading order (top to bottom, left to right), sized for a phone. Findings read like the sections of an article.
- **Take a Snapshot.** In a dashboard's ⋯ menu, Owners and Editors choose *Take a Snapshot*, name the period (it suggests the last complete one, e.g. "October 2026") and get a copy of the dashboard as it is now: layout, introduction, Findings, and the values up to the end of that period.
- **Write it up.** A Snapshot starts as a **draft** that only the dashboard's Owner and Editors see. They edit its words (introduction, headlines, sentences, footnotes) but not its numbers, layout or Metrics. *Show to everyone with access* ends the draft. Words can still be corrected afterwards: each change is a Version (who, when, before and after), and the Snapshot's band then says "Words changed after it was shown", linked to its Versions, so readers know what they read may differ from what was first reported.
- **Take them automatically.** A dashboard's settings offer *Take a Snapshot every week*, *month* or *quarter*. It is taken as soon as every Metric on the dashboard is Locked for the period, or a set number of days after the period ends (5 by default), whichever comes first. The Owner gets a message that a draft is ready to write up.
- **Find them again.** By a dashboard's title, *Snapshots* lists them newest first. A Snapshot shows a band: "October 2026, taken 5 Nov by Sara" with a link to the live dashboard.
- **Corrections stay visible.** If a value in a Snapshot is corrected later, the Snapshot keeps the value it had and marks it "corrected since", with the new value on hover.
- **On from there.** *Make a deck* works from a Snapshot (one slide per widget, values of that period). A frozen View Link shows a Snapshot: choosing *frozen* takes one, or picks one that exists.

```
 Monthly overview ▾  ⌂   Grid | Read    Snapshots ▾   Share  Edit
                                        ┌──────────────────────────────┐
                                        │ Draft: November 2026  ✎      │
                                        │ October 2026     5 Nov, Sara │
                                        │ September 2026   4 Oct, auto │
                                        │ Take a Snapshot…             │
                                        └──────────────────────────────┘
 Snapshot, Read view:
 ┌──────────────────────────────────────────────────────┐
 │ October 2026 · taken 5 Nov by Sara · see it live →   │
 │ Monthly overview                                     │
 │ Revenue grew on the year again, but cost grew faster.│
 │ ── Revenue held up despite fewer orders ───────────  │
 │ [chart, values to 31 Oct]                            │
 │ Two sentences. Source: Finance.                      │
 └──────────────────────────────────────────────────────┘
```

## User Stories

1. As a member, I want one place for a set of numbers, and not to choose between a dashboard and a story before I start.
2. As a finance lead, I want to fix last month's numbers and then write what happened, without the numbers moving under my sentences.
3. As a founder, I want October's update to say October forever, and November's to be a new one.
4. As a reader on a phone, I want to read a dashboard or a Snapshot top to bottom like an article.
5. As a dashboard's Owner, I want a draft Snapshot to be taken by itself once the month's numbers are complete.
6. As anyone with access, I want to look up what was reported for a past period, and see where a value was corrected since.
7. As a founder preparing a board meeting, I want a deck with exactly the numbers of the month I reported.

## Implementation Decisions

- **Stories fold back into dashboards** (new migration): every row with `kind = 'story'` becomes `dashboard`, and its widgets keep their place. The `intro` column stays and now belongs to every dashboard. `/stories` and `/stories/[id]` redirect to the dashboard. The top bar's *Stories*, the stories list and *Make a story* go. The demo's "October in short" becomes a dashboard with Snapshots for September and October. The existing migration is not edited.
- **Read view** is a way of showing, not stored data: the widgets of the dashboard ordered by `y`, then `x`, each at full width. A Free Layout widget keeps its proportions.
- **Snapshots are stored** in a new table `dashboard_snapshots`: workspace, dashboard, period label and period end, taken by (a person, or the dashboard's Owner for automatic ones), taken at, draft or shown, and the payload. The payload is what a frozen View Link keeps today (`ViewPayload`: widgets, introduction, theme, and the series of the Metrics on it up to the period end), with the same size limit.
- **Snapshot periods** are week, month and quarter ("Q3 2026"). A quarter is a Snapshot period only; Metrics keep their periods of day, week and month.
- **Cut-off for mixed periods:** a Metric by month shows the months up to the end of the named period (for a quarter, its three months); by week, the weeks that end in it; by day, the days in it. Values recorded later for those periods are not in the Snapshot.
- **Core operations** take the Actor first: `takeSnapshot`, `listSnapshots`, `openSnapshot`, `editSnapshotWords`, `showSnapshot`, `deleteSnapshot`. Taking needs Owner or Editor and that the actor sees every Metric on the dashboard. Editing words checks that only words change; the payload's numbers, Metrics and layout are refused. Deleting stays with the dashboard's Owner, like deleting the dashboard.
- **Who sees a Snapshot: one visibility system.** A Snapshot has no audience of its own. Whoever may open the dashboard, once the Snapshot is no longer a draft, may open it, and the visibility carries all the way through (decided on #193): each reader sees in it only the Metrics they may see now, as on the live dashboard. A widget that draws any other Metric is left out whole, and the Snapshot says how many parts are not shown. A Metric no longer visible to someone, also one taken off the dashboard since, goes from their Snapshots too; decks made from a Snapshot and View Links to it follow the same rule (for a link, the dashboard's owner). Losing access to the dashboard loses access to its Snapshots. A smaller audience gets a View Link to the Snapshot (outside the team) or a dashboard of its own (inside). *Needs a security review before building.*
- **Limits** (from the security review of #175): only a period that is over, in the workspace's time zone, and not more than ten years back; at most 500 Snapshots per dashboard. Readers who are not the dashboard's owner or Editors see only the Versions made since the Snapshot was shown, in its Version list and on the Activity page, never the draft's.
- **Words changed after showing** are Versions of the Snapshot, like any other Version. They are not Audit Log events: the Audit Log records who may see or do what and decisions on numbers, not wording.
- **Automatic Snapshots** run on the same clock as Workflows (spec 0005): per dashboard a period (week, month or quarter) and a wait in days. "Every Metric Locked" means Locked for every Metric period inside the Snapshot period. A period is taken once; a deleted automatic Snapshot is not taken again.
- **Corrections** are found when a Snapshot is opened: the core compares its values with the current ones for the Metrics the reader may see, and marks the differences.
- **Audit Log:** `snapshot.taken` (by hand or automatic), `snapshot.shown`, `snapshot.deleted`, with the dashboard and the period, never values.
- **Glossary** (in ticket 1 and 2): **Story** is removed. **Dashboard** gains its introduction and the *Read* view. **Snapshot** is widened to "a dashboard or deck as it stood at a moment or for one period: layout, words and values, stamped with it". **Finding** stays and loses "a story is made of Findings". **Version** keeps how something was built; a Snapshot keeps what it showed.

## Tickets (in order)

1. #174 Fold stories back into dashboards: migration, the introduction and the *Read* view on dashboards, redirects, remove *Stories* and *Make a story*, the demo, glossary.
2. #175 Snapshots by hand: table, core, drafts, editing words, Versions, the Snapshots list and band, visibility, Audit Log, glossary (blocked by #174).
3. #176 Automatic Snapshots: the dashboard setting, taking on Lock or after the wait, the message to the Owner (blocked by #175).
4. #177 Corrections marked in Snapshots (blocked by #175).
5. #178 *Make a deck* from a Snapshot, and frozen View Links that show a Snapshot (blocked by #175).

## Testing Decisions

DB tests for: folding stories (rows, Findings, View Links still working); taking a Snapshot (Owner, Editor, refused for a Viewer and for a Metric the actor does not see); the cut-off for day, week and month Metrics in week, month and quarter Snapshots; Versions for words changed after showing; editing words only; drafts hidden from Viewers; access after a Metric is removed from the dashboard and after the dashboard's share is removed; automatic Snapshots taken once, on Lock or after the wait; corrections found. Browser checks of *Read* on a phone, taking and writing up a Snapshot, and a deck made from one.

## Settled Questions

- **Words after showing:** stay editable; every change is a Version and the band says so.
- **Quarter:** yes, as a Snapshot period.
- **Audience per Snapshot:** no. One visibility system: the dashboard's. A smaller audience gets a View Link or its own dashboard.
- **Metrics a reader does not see** (#193): the visibility carries all the way through. A reader sees only the Metrics they may see now, never more than on the live dashboard, whoever took or showed the Snapshot.

## Out of Scope

Comments on Snapshots, sending a Snapshot by email on a schedule, comparing two Snapshots side by side, and Snapshots of decks beyond the export that exists.
