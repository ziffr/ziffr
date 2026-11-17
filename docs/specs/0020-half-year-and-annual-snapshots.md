# 0020 Half-year and annual Snapshots

**Status:** in progress. **Tracking issue:** #55 (label `tracking`); tickets #56 to #58 carry `spec:0020`.

## Problem Statement

A Snapshot keeps what a dashboard showed for a week, a month or a quarter (spec 0013), by hand or by itself. The reports people keep longest are the half-year report and the annual review: what the year looked like, with the words written then. Today they are taken as the fourth quarter's Snapshot, which is labelled "Q4 2026", shows the quarter as the period, and cannot be taken by itself at the end of the year as an annual report.

## Solution

Two more Snapshot periods: **half-year** ("H2 2026") and **year** ("2026"), taken by hand or by itself like the others (Snapshots ▸ Take one by itself ▸ Every half-year, Every year). A Snapshot of a year keeps every Metric's values up to the year's last day, like any Snapshot. With spec 0018, its widgets can show the year by quarter or the year as one value, as the dashboard's builder set them.

## User Stories

1. As a dashboard owner, I want to take a Snapshot of a half-year or a year, labelled "H1 2026" or "2026", so that the annual review is kept as what it is.
2. As a dashboard owner, I want the dashboard to take one by itself every half-year or year, once every Metric on it is Locked for every one of its periods in it (or after the set number of days), as monthly ones do.
3. As a reader, I want the Snapshot list to show half-years and years among the others, newest first.
4. As a presenter, I want "Make a deck" from an annual Snapshot to title it "2026".

## Implementation Decisions

- **Snapshot periods** become `"week" | "month" | "quarter" | "half" | "year"` (`snapshot-periods.ts`: start, end, label, `completePeriods`), using `periods.ts` from spec 0017. Halves and years follow the workspace's year start (spec 0017): with the default, a half starts on 1 January or 1 July; quarters of Snapshots follow it too, so a workspace with an April start gets "Q1 FY 2026/27" for April to June.
- **The database** allows the two kinds (`dashboard_snapshots.period_kind`, `dashboards.snapshot_every`) in a new migration.
- **Taking one by itself** (auto-snapshots.ts) works unchanged for the new kinds: a period is taken once, as soon as every Metric on the dashboard is Locked for every one of its periods inside it (`allLocked`: for a yearly Snapshot of monthly Metrics, all twelve months), or the set number of days after it ends. `metricPeriodsIn` walks at most 400 periods, enough for a year of a daily Metric (366); a test keeps it so.
- **Which Metric values a Snapshot keeps** is unchanged: every Metric period that ends on or before the Snapshot period's last day (`inSnapshot`), so a yearly Snapshot of a monthly Metric keeps its twelve months and those before.
- **The demo** keeps its monthly Snapshots; the user guide shows an annual one as an example.

## Testing Decisions

- `snapshot-periods.ts` unit tests for half-years and years: start, end, label, `completePeriods` across year ends.
- Database tests: an annual Snapshot taken by hand, and by itself once all twelve months are Locked and not before, once only; a half-year one likewise.
- Tried in the running app: taking an annual Snapshot, its list entry, Make a deck from it.

## Tickets

1. #56 Half-year and year as Snapshot periods: `snapshot-periods.ts`, the migration, taking by hand, the list, Make a deck.
2. #57 Taking them by itself, the setting's choices, and their tests.
3. #58 Docs: user guide (Dashboards, Snapshots), glossary's Snapshot, release note.

## Out of Scope

Snapshots of a custom span ("1 March to 15 April").

## Further Notes

Depends on spec 0017's `periods.ts` (ticket 1). Independent of quarterly Metrics, and of spec 0018, though annual Snapshots read best with widgets shown by quarter or year.
