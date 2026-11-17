# 0018 Display Periods: a Metric shown by quarter or year

**Status:** in progress. **Tracking issue:** #45 (label `tracking`); tickets #46 to #50 carry `spec:0018`.

## Problem Statement

Every widget shows a Metric in its own period: a monthly Metric as months, always. Its only setting is how many periods it shows (`window`). The questions people bring to a board meeting are different: "revenue per quarter this year against last", "orders per year since we started", "this quarter so far". Today the answer is a calculator next to a chart of twelve months. Ziffr knows how to combine a Metric's periods: every Metric has an **Aggregation** (sum, average, last value, none), and the comparison engine already adds months up to quarters, halves and years by it (`valueOver` in compare.ts). Only the widgets do not use it.

## Solution

A widget setting **Show by**: the Metric's own period (as today), or a longer **Display Period**: week, month, quarter, half-year or year, as far as it is longer than the Metric's own. The widget then shows one value per Display Period, combined by the Metric's Aggregation, the same way Comparisons combine them, so a chart, a table and a Comparison never disagree. The current Display Period, not over yet, is marked "to date". A Metric with Aggregation "none" (a rate) cannot be shown by a longer period; the setting says why. It works for line charts, bars per period, the history table, number + sparkline, and in decks, View Links, Snapshots and the PowerPoint export.

## User Stories

1. As a dashboard builder, I want to show a monthly Metric by quarter or year, so that I answer "revenue per quarter" without a calculator.
2. As a viewer, I want the current quarter marked "to date", so that a half-finished quarter is not read as a drop.
3. As a viewer, I want a quarter's value to be the same in the chart, the table and the Comparison strip.
4. As a dashboard builder, I want targets shown by quarter too: the Target Series combined the same way, or the target range where there is none.
5. As a builder of a Metric that is a rate or a score with Aggregation "none", I want to be told why it cannot be shown by quarter, and how to change its Aggregation.
6. As a presenter, I want a deck slide and a Snapshot to keep the Display Period, and the PowerPoint export to show the same numbers.
7. As a builder, I want a Derived Metric shown by quarter to be computed from its inputs' quarters (revenue minus cost per quarter), not by adding up its own months.

## Implementation Decisions

- **One function for every Display Period.** `seriesBy(metric, resolve, display, opts)` in the core (pure, next to compare.ts) turns a Metric's points into one point per Display Period, reusing `valueOver`: the same Aggregation, the same rule that a span counts once at least half of it has values, the same formula path for Derived Metrics. Comparisons, widgets and the export all call it, so nothing can disagree.
- **Widget setting.** `WidgetSettings.display?: Period | "half"`, absent meaning the Metric's own period. Offered only for templates that draw a series (number, line, bars, table, forecast) and only longer than the Metric's period. `window` counts Display Periods.
- **To date.** The latest Display Period is marked "to date" when today is inside it, with how many of its periods it holds ("Q4 26, 2 of 3 months"). It is drawn hatched in bars and dotted in lines, and labelled so in tables.
- **Aggregation "none".** The setting is disabled with "Combined only for Metrics whose Aggregation is sum, average or last value; this one is set to none."
- **Targets.** A Display Period's target is the Target Series combined by the Metric's Aggregation where every period in it has one; else the target range for a Metric whose Aggregation is average or last value, and none for a sum (a monthly range of 100 to 120 says nothing exact about a quarter of uneven months). The chart says which applies.
- **Forecast.** A forecast shown by a Display Period is computed on the combined series, a few Display Periods ahead.
- **Where it travels.** Dashboards, the widget Pool, saved Widgets and Widget Templates keep the setting; decks and the free layout draw it; View Links and Snapshots show it (a Snapshot keeps what the widget showed, as today); the PowerPoint and PDF export draw the same points. The API's dashboard reads and writes include `display`.
- **Fiscal year.** Quarters, half-years and years are those of the workspace's year start (spec 0017), passed with the data a widget draws; labels follow spec 0017's names.
- **Glossary.** A new term **Display Period**: "The period a widget shows a Metric by: its own, or a longer one, with the Metric's values combined by its Aggregation." _Avoid_: Granularity, grain, bucket, roll-up.

## Testing Decisions

- `seriesBy` unit tests: sum, average and last value by quarter and year; a half-filled span skipped; to date; a Derived Metric by its inputs; Aggregation "none" refused; weeks into months (weeks across a month's edge belong to the month they start in, as Comparisons count them).
- The same quarter's value equals the QoQ Comparison's current value for a series (one engine).
- Database or route tests for saving the setting through dashboards, templates and the API.
- Tried in the running app: a monthly Metric by quarter and year in each widget, a deck slide, a View Link, a Snapshot, the PowerPoint export.

## Tickets

1. #46 `seriesBy` in the core, with Comparisons moved onto it, and unit tests.
2. #47 The setting **Show by** and its drawing in line, bars, table, number and forecast; to date; targets.
3. #48 Decks, free layout, View Links, Snapshots, PowerPoint and PDF export.
4. #49 The API's dashboard reads and writes, the MCP tools that build dashboards, the OpenAPI reference.
5. #50 Docs: user guide (Dashboards, Metrics), glossary, release note.

## Out of Scope

Showing a Metric by a shorter period than its own (a monthly value cannot be split into weeks); a Breakdown shown by quarter (Breakdowns stay per period); custom spans ("the last 90 days").

## Further Notes

- Builds on `periods.ts` from spec 0017, ticket 1; works without quarterly Metrics, as it combines the existing day, week and month periods. Specs 0019 and 0020 use `seriesBy`.
- "Half-year" is a Display Period here but not a Metric period (spec 0017): it combines months and quarters, which is what people ask for in half-year reports.
