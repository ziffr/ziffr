# 0017 Quarterly and yearly Metrics

**Status:** draft. **Tracking issue:** opened when the spec is agreed (label `tracking`); tickets carry `spec:0017`.

## Problem Statement

A Metric has a value per day, week or month (`Period = "day" | "week" | "month"`). Many numbers people report do not come that often: the board pack's quarterly figures, a quarterly customer survey's NPS, headcount at quarter end, an annual revenue target, a yearly audit result. Today such a number has to pretend to be monthly: someone enters it in one month and leaves two empty, the Prompts ask every month for a number that does not exist, the Due Date falls a month after the wrong period, and every chart shows two gaps out of three. Or it is not tracked in Ziffr at all, which is what happens.

## Solution

Two more periods for a Metric: **quarter** and **year** (calendar quarters and years, see Further Notes). Everything that hangs off a Metric's period understands them: the form and its label ("Q3 2026", "2026"), Prompts ("What's the number for Q3 2026?"), Workflows and their Due Date (working days after the quarter or year ends), Locks and Approvals, Target Series, Comparisons (a quarterly Metric has QoQ, HoH and YoY, no MoM), Snapshots, the API, the SDK, the MCP server and Feeds. A monthly Metric that turns out to be quarterly can change its period while it has no values, as today.

## User Stories

1. As a Metric owner, I want to create a quarterly or yearly Metric, so that a number reported once a quarter or year is tracked as what it is.
2. As a Submitter, I want to be asked once per quarter or year, "What's the number for Q3 2026?", with a form that says which quarter, so that I am not asked for numbers that do not exist.
3. As a Metric owner, I want the Workflow's Due Date to count working days after the quarter or year ends, so that reminders and escalations come at the right time.
4. As a viewer, I want a quarterly Metric's chart and table to show one point per quarter, labelled "Q3 26", without gaps.
5. As a viewer, I want a quarterly Metric's Comparisons to offer the previous quarter, HoH and YoY, and never MoM or WoW.
6. As an Approver and owner, I want Locks, Unusual Values and Approvals to work per quarter or year as they do per month.
7. As a developer, I want the API, SDK, MCP server and Feeds to accept and return `quarter` and `year`, so that a program can send a quarterly number.
8. As an Owner, I want the Metric Catalog to suggest quarterly and yearly Metrics where that is how they are usually reported.

## Implementation Decisions

- **The Period type** becomes `"day" | "week" | "month" | "quarter" | "year"`. A quarter starts on 1 January, 1 April, 1 July or 1 October; a year on 1 January. `period_start` stays a date, the first day.
- **One place for period arithmetic.** Today `periodStart` and `periodLabel` (format.ts), `shiftPeriod` and `periodEnd` (workflow-rules.ts), `metricPeriodEnd` (snapshot-periods.ts), the comparison grains (compare.ts), sample data and the Feed kit's `periods.ts` each know the periods. They move into one pure module (`periods.ts`: start, end, shift, label short and long, how many of one fit in another), with unit tests, and every place uses it. Labels: "Q3 2026" and "Q3 26", "2026".
- **The database** allows the two periods (`metrics.period` check, the catalog's check) in a new migration. SQL that knows periods (the demo seed, date arithmetic in functions) is checked and taught them where it needs to.
- **Comparisons.** `comparisonsFor` already ranks grains up to year; a quarterly Metric gets prev, QoQ, HoH, YoY; a yearly one prev and YoY (the same thing for a year, so only YoY is offered).
- **Workflows.** The working period is the last one that ended; the Due Date counts working days after the quarter's or year's last day. Prompts and reminders say the quarter or year. Nothing else in the engine depends on the period's length.
- **Forecasts** project a few periods ahead: 2 quarters, 1 year (Holt's method needs at least 4 points, so a yearly Metric shows a forecast only after four years; the chart says so).
- **Unusual Values** compare with the period before, which for a quarter is the quarter before; the "changes more than x %" check is unchanged.
- **Changing the period** stays allowed only while the Metric has no values, as today.
- **API, SDK, MCP, Feeds.** The `period` enums gain `quarter` and `year`; the Feed kit's period helpers learn them; the OpenAPI reference is regenerated. A Feed for a quarterly Metric sends one value per quarter.
- **Catalog.** Some catalog Metrics become quarterly or yearly where that is how they are reported (NPS from a quarterly survey, headcount at quarter end, annual revenue target).
- **Glossary.** **Period**, if it is not an entry yet, becomes one: "How often a Metric has a value: a day, week, month, quarter or year." Quarters and years are calendar ones.

## Testing Decisions

- `periods.ts` unit tests: start, end, shift and label for every period, around year ends, leap years and ISO weeks.
- Comparisons for quarterly and yearly Metrics: which are offered, and their values from known series.
- Database tests: a quarterly Metric created, a Prompt for the right quarter, a Due Date after the quarter, a Lock and an Approval per quarter, a value by the API and a Feed.
- Tried in the running app: a quarterly and a yearly Metric, the form, the chart, the Workflow page.

## Tickets

1. `periods.ts`: one module for period arithmetic and labels, every caller moved to it, with tests (no behaviour change).
2. Quarter and year as Periods: migration, Metric creation and editing, the form, labels, charts and tables.
3. Workflows, Prompts, Due Dates, Locks and Approvals per quarter and year.
4. Comparisons and forecasts for quarterly and yearly Metrics.
5. API, SDK, MCP server, Feed kit and OpenAPI reference; catalog Metrics.
6. Docs: user guide (Metrics, Workflows), API guide, glossary, release note.

## Out of Scope

Fiscal years that do not start in January (see Further Notes); half-yearly Metrics (half-years are offered for display in spec 0018 and Snapshots in spec 0020, which covers most needs); periods of other lengths (two weeks, four-week retail periods); converting a Metric with values to another period.

## Further Notes

- **Fiscal years.** Many companies report in fiscal years starting in April, July or October, and their "Q1" is not January to March. A workspace setting "Year starts in" would shift every quarter and year (Metrics, Comparisons, Display Periods, Snapshots). It touches all four specs 0017 to 0020 and is best decided before they are built: built in from the start, every period function takes the workspace's year start; added later, every one of them has to change again.
- Depends on nothing; specs 0018 to 0020 use `periods.ts` from ticket 1.
