# 0033 Retention per Metric: how long values are kept, and condensing old ones

**Status:** draft. **Ticket:** #360 (the owner's wish, 2026-11-20); the tracking issue and the sub-issues labelled `spec:0033` are made once the owner has read this spec.

## Problem Statement

Ziffr keeps every value forever. Only the Audit Log has a retention (730 days). For most Metrics that is right: a monthly revenue figure costs nothing to keep. For a Metric that gets a value every day, or an hour, from a Feed, ten years of daily values is a pile nobody reads, while the months and years are what people look at. For some data there is also a reason to let go: a privacy promise, a contract, or plain tidiness.

Letting go is the one thing in Ziffr that cannot be undone, so it must never happen by surprise, never to a number somebody still depends on, and never differently from how Ziffr already adds numbers up (spec 0022).

## Solution

A **Retention** is a setting on a Metric (and a default for new Metrics in the Workspace): **keep values for N months, then condense them or delete them.**

- **None** is the default and stays so: nothing is ever changed unless a person turns it on.
- **Condense:** a period older than the Retention is replaced by one **Condensed Value** for a longer period (days into months, weeks into quarters), made with the Metric's Aggregation. The numbers a widget shows by that longer period, or any longer one, stay exactly the same; only the detail below it goes.
- **Delete:** a period older than the Retention is deleted with its history.

Before anything is turned on, the page shows what it would do, in counts. A person confirms, it starts after 7 days that can be used to cancel it, and a daily job does it in small steps, writing every step in the Audit Log.

## User Stories

1. As the owner of a Metric a Feed fills every day, I want daily values older than two years to become months, so that the history stays readable and small.
2. As a Metric Owner, I want to see before I turn it on how many values would go, what stays, and what would show differently, so that I never find out afterwards.
3. As a Metric Owner of a Metric that is a rate or a ratio, I want Ziffr to say that it cannot be condensed, and let me only delete or keep, so that a made-up average never replaces real values.
4. As a reader of a chart, I want the old part to say "condensed from daily values", so that nobody takes a month for a day.
5. As an Owner, I want a Workspace default, so that every new Metric starts with the rule we agreed, and a Metric that needs another says so.
6. As an Owner, I want deleting to need more than a click, a download first and a delay I can use to change my mind, so that one wrong click cannot lose our history.
7. As someone who relies on a Snapshot, a deck or a View Link, I want it to keep what it showed, so that closing last year's report does not change it.
8. As a Metric Owner, I want locked periods condensed, not dropped, so that what we published stays in the numbers.
9. As someone with an open Question, Task, Correction or Approval about an old period, I want it to hold that period's values until it is done, so that retention never pulls the ground away.
10. As an Owner, I want the Audit Log to record every setting, every run and what it did in counts, and never what the values were, so that I can answer for it.
11. As an Owner who must keep to a promise ("we delete after 5 years"), I want to know exactly what deletion covers and does not cover (backups, Snapshots), so that I promise only what is true.
12. As an Owner, I want Ziffr to suggest a Retention for Metrics nobody has looked at in a long time, so that tidying is easy, without Ziffr ever doing it by itself.

## Implementation Decisions

### Words

- **Retention** is new: how long a Metric's values are kept, and what then happens. It is not the Audit Log's keeping (the Audit Log "keeps two years" and stays as it is) and not **Archived Metric**: archiving puts a whole Metric aside with its values; a Retention works on the values of a Metric that stays in use. "Archive" is not used for old values, since it belongs to Metrics (and the Snapshot's _Avoid_ list).
- **Condensed Value** is new: the one value (with its Target) that stands for a longer period after the periods inside it were condensed. _Avoid_: roll-up (an _Avoid_ word of Aggregation), summary value, compaction, downsampled value.
- The verbs are **condense** and **delete**. Not "purge", "expire", "clean up".

### The setting

- **Where:** one column on the Metric, `retention`, null for none, or `{ keep_months, then: "condense" | "delete", into? }`. The Workspace has `default_retention` in Workspace settings (Owners only).
- **Keep:** a whole number of months, at least **13**, so that a year-over-year Comparison and last year's span are always whole. The form offers 2, 3, 5, 7 and 10 years and "other". The age of a period is measured from its last day.
- **Condense into:** the form offers the longer periods that make sense for the Metric's own period (day into week, month, quarter or year; week into month, quarter or year; and so on), as Display Periods are. Quarters and years are those of the Fiscal Year; a week belongs to the month its Monday is in, as everywhere (spec 0022).
- **The default is copied** into a new Metric at its creation, like a Metric Catalog entry's description, with no link back. Changing the Workspace default changes nothing that exists. The Workspace page offers **Apply to existing Metrics**, which is the same dry-run-and-confirm as a single Metric, for all Metrics that have none (decided).
- **Who may set it:** a Metric's Retention by its Metric Owner, an Owner or an Admin; the Workspace default by Owners only. A Member who only submits cannot. A **Derived Metric** has none (its values are not stored).
- **Not in the API or MCP in the first version** beyond reading: `get_metric` shows the Retention, and nothing changes it. Setting a rule that deletes data needs the page, the counts and the confirmation; an assistant that sets one on a sentence is exactly the accident this spec fears.
- **The demo** has none and cannot set one (read-only, spec 0029).

### What each Aggregation allows

| Aggregation | Condense | Condensed Value holds | Delete |
| --- | --- | --- | --- |
| Summed | yes | the exact sum and the count of periods | yes |
| Averaged | yes | the exact sum and the count of periods, so the average is exact for any longer span | yes |
| Last value | yes | the last value of the span and the day it was for | yes |
| None (a rate) | **no**, and the form says why | | yes, or keep |

- **Why sum and count for an average:** an average of monthly averages is wrong when months have different numbers of days. Keeping the exact sum and the count (read from the values' text, exact as spec 0022 does) lets a later quarter or year combine them exactly, which a single month average cannot.
- **Gaps:** a span with fewer values than periods is condensed from what exists, with `held` and `of` kept, so "October 2023, only 20 of 31 days" survives as the Display Periods' note already says it (`heldText`).
- **Only complete spans:** a span is condensed only when every period in it is older than the Retention, so a month is never condensed while its last day is still inside the keep time.

### What is affected

- **Observations and their history:** the originals and their **Superseded Values** of a condensed period are deleted when the Condensed Value is written; of a deleted period, with it. The Condensed Value has no history: it is made at a moment and never edited.
- **Breakdowns:** deleted with their period, in both modes (decided). Labels are free text; adding them up per label is not a guarantee Ziffr can make (the observation's value is the Metric's number even when the rows do not add up). The preview counts them.
- **Target Series:** the Target of a condensed span is made with the same rule the Display Periods use (the Target Series combined by the Aggregation over every period the span counts, otherwise the Target Range) and stored in the Condensed Value, so a condensed month still has its Attainment. In delete mode they go with the period.
- **Projections:** a Projection is for the future, so a Projection of a past period older than the Retention is deleted in both modes; it was never an Observation.
- **Corrections, Questions and Tasks:** their text and Threads stay. A thread about a period that was condensed or deleted keeps its words and says "the value this was about is no longer kept as a single value". **Open** Actions, Corrections and Approvals about a period hold that period back: it is not condensed or deleted until they are closed (below).
- **Locks:** a Lock on a period is recorded on its Condensed Value (locked when every period in the span was locked). **Locked periods are condensed, never silently dropped** (decided): a locked period is published and may be what a Snapshot or a report agreed on; the Condensed Value keeps what it added up to. Delete mode on a Metric with locked periods is allowed, but the confirmation says how many locked periods will go. A period that was condensed takes no more values, as if locked for good.
- **Snapshots, decks and View Links:** they keep what they showed. A Snapshot is what something showed, fixed; Retention never changes it, so a Snapshot made last year still holds last year's daily numbers. The consequence is said in the confirmation for delete: "Snapshots and decks that already show these values keep them. Delete those first if they must go too." The preview lists how many Snapshots, decks and frozen View Links hold the Metric's affected periods, by name for those the person may see. A Snapshot's note of "a value corrected since" says "no longer kept" for a deleted value. Live dashboards and decks show what remains.
- **Derived Metrics:** a Derived Metric reads its inputs by its own period. Delete is refused while another Metric is derived from this one (the same rule that refuses deleting a Metric that is used); condense is refused if a Derived Metric's period is shorter than the period condensed into; otherwise the Derived Metric's old history shows by the longer period (the Display Period rule).
- **The Audit Log:** untouched, with its own 730 days. It never holds a value.
- **Workspace Keys (spec 0028):** Condensed Values are sealed like values. Deleting a value deletes the row; copies in backups remain as long as the Installation keeps backups (hosted Ziffr: 30 days; a self-hoster's own). The words everywhere are "deleted from Ziffr", never "unreadable". The one thing that makes data unreadable in backups is deleting the whole Workspace and destroying its key.
- **Imports and the API:** a value, Import, paste or Feed row for a period inside the condensed or deleted range is refused with "This period was condensed on 3 December 2026" (API code `period_condensed`, 409), row by row like other Import refusals. A Metric's Retention is shown in the paste preview if the history reaches into it.
- **Alerts (spec 0032), Comparisons and Prompts** look at the latest periods only and are unaffected, which the 13-month floor secures.

### How it shows

- A chart or table over a condensed range draws one point per condensed span, in the same line, with the point's name "October 2023, condensed from 31 days" and a note under the widget: "Before November 2023 shown by month, condensed from daily values." The History table marks the rows the same way, and the Metric page names the Retention and the date it reached.
- A Display Period at or above the condensed one shows the **same numbers** as before (the invariant below); a Display Period below it shows the condensed points with the note, never invented days.
- CSV, the API and the MCP Server mark a Condensed Value with `condensed_from` (the count) and `period` as the span, so a program never mistakes it for a day.

### Preview, confirmation and the delay

- **The preview** is `retentionPreview(actor, metricId or workspace, setting)` in the core: counts only. For each Metric: how many periods and values are affected, how many Condensed Values would be made, Breakdown rows, Superseded Values, Targets, locked periods, periods held back by open work, Derived Metrics that read it, the Snapshots, decks and View Links that hold affected periods, and the first and last period affected. It shows no value and no name the person may not see.
- **The page** shows the preview next to the setting (Metric page, **Retention**; Workspace settings for the default), updating as the person changes N. "Turn on" is disabled until the preview has been shown.
- **Confirming:** a dialog with the counts; for delete, the person types the Metric's name (or, for the Workspace page, the word "delete") and is offered **Download these values** (a CSV of exactly what would go, through the core's export, written in the Audit Log like any export). Making a Retention shorter, or from condense to delete, needs a fresh preview and confirmation; making it longer or turning it off needs none.
- **The server action rechecks** the counts it was shown: if they have changed (new open work, a Lock), it refuses with "The numbers changed; look again."
- **The delay:** a confirmed Retention starts on the 8th day (decided). Until then the Metric page says "Values before 1 November 2024 will be condensed from 28 November. Cancel." Its owner and the person who set it get one Delivery when it is scheduled and one the day before. Cancelling is one click by anyone who may set it.
- **Audit Log:** `metric.retention_set` (old and new setting, who, the first run day) and `metric.retention_cancelled`; the Workspace default `workspace.retention_default_set`; each run writes `retention.run` per Metric with counts. Details name the Metric as it was named then, never a value.

### The job

- **`POST /api/jobs/retention`** with the job secret, called daily by the Docker clock (`docker/clock.mjs`, at a time of its own, away from the other jobs) and by whoever runs Ziffr elsewhere, like `trial-cleanup`. Without a Retention anywhere it does nothing.
- **Batching:** per Metric and day, claimed in `retention_runs(metric_id, day)` before work starts, so repeated or parallel calls run once. A Metric's run takes the Metric's row lock, works in batches of at most 5,000 original values per transaction and at most 60 seconds in all, and carries on the next day where it stopped. A first run on ten years of daily values takes days, not one night, by design.
- **Condense in one transaction per span:** write the Condensed Value, **recompute the Display Period's value from the originals and compare it with the one just written** (the same `shownSeries` the widgets use, exact), and only when they are equal delete the originals and their history. On a difference the span is left alone, the run writes `retention.mismatch` with the Metric and span, and Owners see it on the Retention page. This is how spec 0022's calculations stay the one truth.
- **A value arriving during the run** is safe: the Metric's lock serialises it with the job; one for a span being condensed is refused as above.
- **What it never touches:** a period held back by open work, a Metric's period that its Workflow still has open; a Derived Metric's inputs as the rules above say. (Archived Metrics are not spared: they take no values, so their Retention runs as any other, recommendation.)
- **What was confirmed bounds the run:** a waiting Retention stores `counted`, the periods and values the person was shown (`retention_pending`, #381). The job takes no more than that without a new preview and confirmation: values that arrived during the 7 days, or a default copied into a new Metric (which counted nothing), hold the Metric back and tell its Owners. The job calls `settleRetentions` first, for the first day and the day-7 reminder.
- **Failure:** a failed batch is rolled back and tried the next day; three failures in a row stops that Metric and shows Owners the reason. Nothing deletes without its Condensed Value (condense) or without having been shown in a preview (delete).

### Interplay

- **Archived Metrics (spec 0029):** archiving takes a Metric out of use and keeps its values; a Retention thins values of a Metric in use or archived. They compose: an archived Metric with a Retention gets lighter by itself. Deleting archived Metrics after a time is a different wish, listed in Out of Scope.
- **Usage (spec 0031):** the Usage page lists the Metrics that hold the most values and nobody has looked at, and suggests **Set a Retention** next to **Archive these N Metrics**, opening this spec's page with its preview, suggestion only: nothing is set, condensed or deleted because of Usage. Blocked by 0031.
- **Size and limits (spec 0029):** a Retention frees no Metric count and changes no price; values and storage are not what a Size is made of.

## Testing Decisions

- **The invariant, as a property test:** for random series, every period kind, every Aggregation that can condense, gaps, weeks across months and fiscal years, and uneven months: the series by every Display Period at or above the condensed one is identical before and after condensing, exactly, against the references of spec 0022. The Attainment of a condensed span equals the one shown before.
- **Aggregation none** cannot be condensed (form and core refuse); delete works.
- **Delete** removes exactly the affected periods, Breakdowns, Superseded Values, Targets and Projections and nothing else, counted by the preview with the same number.
- **Hold-backs:** an open Action, Correction or Approval holds its period; closing it frees it the next day. A Derived Metric input refuses delete and condense where specified. Locked periods are condensed with the Lock kept.
- **Snapshots, decks and View Links** keep every number; a live widget shows the condensed points with the note.
- **Refusals:** a value, Import, paste or Feed row for a condensed period is refused with `period_condensed`, row by row.
- **The job:** claimed once on two calls; resumes after a stop at a batch boundary; a mismatch leaves the span alone and writes the event; a failed batch rolls back; a value arriving during a run is serialised; a Metric without Retention is never read.
- **Permissions and confirmation:** a Member cannot set one; a Metric Owner sets it only on their Metric; the action refuses changed counts; shortening needs a new preview; the delay holds; cancel works; the API and MCP cannot set one.
- **Sealing and export:** Condensed Values are sealed; the export before deleting holds exactly what the preview counted and is audited.
- The core against the database (`*.db.test.ts`), nothing inside it mocked; the calculation rows join the catalogue (`docs/reference/calculations.md`) with their reference tests, and mutation testing holds the new module to the same score as the others. Tried in the running app with a seeded Metric of three years of daily values.

## Out of Scope

- Deleting Archived Metrics, or whole Metrics, after a time.
- Retention of anything but values: dashboards, Snapshots, decks, Threads, Contacts, the Outbox and the Access Log. (The Outbox and the Access Log have their own keeping and may deserve a spec; they hold words and calls, not values.)
- Condensing Breakdowns by label.
- Setting a Retention through the API or MCP.
- A per-Metric export or "move to cold storage".
- Making deleted data unreadable in backups (that is deleting a Workspace, spec 0028).
- Paid features and `ee/`.

## Decisions (2026-11-20, by the owner)

The owner accepted every recommendation of the draft. They are written into the sections above and are:

1. Delete ships in the first version, with the preview, the typed name, the download and the delay.
2. A confirmed Retention starts on the 8th day, for condense and delete alike.
3. The floor is 13 months.
4. Snapshots, decks and View Links keep what they showed, also after a delete.
5. The Workspace default is copied at creation, with the explicit **Apply to existing Metrics**.
6. Archived Metrics follow their Retention.
7. Breakdowns are deleted with their period, also when condensing.
8. The API and MCP only read a Retention in the first version.
9. **Only Owners set the Workspace default**, since it affects every Metric created afterwards and deletion cannot be undone. (An Owner or Admin or the Metric Owner still sets one Metric's Retention.)

## Tickets

1. Words and rules: the glossary (Retention, Condensed Value), the pure condensing rule by Aggregation (sum, count, last, held and of) reusing the Display Period code, the catalogue rows and reference tests, the property test. Not blocked.
2. Storage: the Condensed Values table (sealed), `shownSeries` reading them, the refusals for condensed periods in the submit path, Import, paste and the API, the words in charts, tables, CSV and the API. Blocked by 1 and spec 0028's sealing.
3. The setting and its preview: the column and Workspace default, the core's operations and `retentionPreview`, the Metric page and Workspace settings, the confirmation, the delay, permissions, the Audit Log events and the Deliveries. Blocked by 2.
4. The job: the route, the clock entry, claiming, batching, the check before deleting, the hold-backs, the export before deleting, the failure rules. Blocked by 3.
5. Usage suggestions: **Set a Retention** next to the archive suggestions; `get_metric` and the API show the Retention. Blocked by 3 and spec 0031.
6. Docs and a security review of the whole spec: the user guide chapters (Metrics, Workspace settings), the self-hosting guide on the job and backups, release notes, and the permission and deletion paths. Blocked by 4 and 5.
