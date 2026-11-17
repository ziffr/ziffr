# 0017 Quarterly and yearly Metrics

**Status:** in progress. **Tracking issue:** #37 (label `tracking`); tickets #38 to #44 carry `spec:0017`.

## Problem Statement

A Metric has a value per day, week or month (`Period = "day" | "week" | "month"`). Many numbers people report do not come that often: the board pack's quarterly figures, a quarterly customer survey's NPS, headcount at quarter end, an annual revenue target, a yearly audit result. Today such a number has to pretend to be monthly: someone enters it in one month and leaves two empty, the Prompts ask every month for a number that does not exist, the Due Date falls a month after the wrong period, and every chart shows two gaps out of three. Or it is not tracked in Ziffr at all, which is what happens.

## Solution

Two more periods for a Metric: **quarter** and **year**, of the workspace's **fiscal year**: a workspace setting **Year starts in** (January unless an Owner or Admin sets another month) decides where quarters, half-years and years begin, for Metrics, Comparisons, Display Periods (spec 0018) and Snapshots (spec 0020) alike. Everything that hangs off a Metric's period understands them: the form and its label ("Q3 2026", "2026"), Prompts ("What's the number for Q3 2026?"), Workflows and their Due Date (working days after the quarter or year ends), Locks and Approvals, Target Series, Comparisons (a quarterly Metric has QoQ, HoH and YoY, no MoM), Snapshots, the API, the SDK, the MCP server and Feeds. A monthly Metric that turns out to be quarterly can change its period while it has no values, as today.

## User Stories

1. As a Metric owner, I want to create a quarterly or yearly Metric, so that a number reported once a quarter or year is tracked as what it is.
2. As a Submitter, I want to be asked once per quarter or year, "What's the number for Q3 2026?", with a form that says which quarter, so that I am not asked for numbers that do not exist.
3. As a Metric owner, I want the Workflow's Due Date to count working days after the quarter or year ends, so that reminders and escalations come at the right time.
4. As a viewer, I want a quarterly Metric's chart and table to show one point per quarter, labelled "Q3 26", without gaps.
5. As a viewer, I want a quarterly Metric's Comparisons to offer the previous quarter, HoH and YoY, and never MoM or WoW.
6. As an Approver and owner, I want Locks, Unusual Values and Approvals to work per quarter or year as they do per month.
7. As a developer, I want the API, SDK, MCP server and Feeds to accept and return `quarter` and `year`, so that a program can send a quarterly number.
8. As an Owner, I want the Metric Catalog to suggest quarterly and yearly Metrics where that is how they are usually reported.
9. As an Owner or Admin of a company whose fiscal year starts in April, I want to set that once for the workspace, so that Q1 means April to June everywhere in Ziffr.
10. As a reader, I want a fiscal year named so it cannot be mistaken for a calendar year ("FY 2026/27"), and a calendar one named plainly ("2026").

## Implementation Decisions

- **The Period type** becomes `"day" | "week" | "month" | "quarter" | "year"`. A year starts on the first day of the workspace's **year start** month, and its quarters (and half-years) every three (six) months from there; with the default, January, these are calendar quarters and years. `period_start` stays a date, the first day.
- **Fiscal year.** `workspaces.year_start_month` (1 to 12, default 1), set by Owners and Admins under Settings ▸ General (**Year starts in**), audited. It can change only to a month under which every period start stored by quarter, half-year or year still starts one: the values and Target Series of quarterly and yearly Metrics, and the Snapshots of quarters, half-years and years. So a yearly Metric with values or an annual Snapshot keeps the month; quarterly ones allow a move by three months (January to April), half-yearly ones by six. Months that are out are greyed out and the page says why. Snapshots of quarters and half-years that still line up take their new names (their stored label is renamed with the change). _Changed in #39:_ the first draft blocked any change once a quarterly Metric had values and ignored quarterly Snapshots, which exist since spec 0013 and would have been split by a move to, say, February; the rule above blocks exactly what would no longer line up. Comparisons, Display Periods and to-date spans are computed, so they follow a change at once. Every period function takes the year start (default January); every caller passes the workspace's, including what the browser draws.
- **Names.** With a January start: "Q3 2026" and "Q3 26", "H2 2026", "2026", as people expect. With another start, a fiscal year is named by both calendar years it spans, which cannot be mistaken for a calendar year: "FY 2026/27" (short "FY26/27"), its quarters "Q1 FY 2026/27" (short "Q1 26/27"), its halves "H1 FY 2026/27". Months, weeks and days keep their calendar names.
- **One place for period arithmetic.** Today `periodStart` and `periodLabel` (format.ts), `shiftPeriod` and `periodEnd` (workflow-rules.ts), `metricPeriodEnd` (snapshot-periods.ts), the comparison grains (compare.ts), sample data and the Feed kit's `periods.ts` each know the periods. They move into one pure module (`periods.ts`: start, end, shift, label short and long, how many of one fit in another, each with the year start), with unit tests, and every place uses it.
- **The database** allows the two periods (`metrics.period` check, the catalog's check) in a new migration. SQL that knows periods (the demo seed, date arithmetic in functions) is checked and taught them where it needs to.
- **Comparisons.** `comparisonsFor` already ranks grains up to year; a quarterly Metric gets prev, QoQ, HoH, YoY; a yearly one prev and YoY (the same thing for a year, so only YoY is offered).
- **Workflows.** The working period is the last one that ended; the Due Date counts working days after the quarter's or year's last day. Prompts and reminders say the quarter or year. Nothing else in the engine depends on the period's length.
- **Forecasts** project a few periods ahead: 2 quarters, 1 year (Holt's method needs at least 4 points, so a yearly Metric shows a forecast only after four years; the chart says so).
- **Unusual Values** compare with the period before, which for a quarter is the quarter before; the "changes more than x %" check is unchanged.
- **Changing the period** stays allowed only while the Metric has no values, as today.
- **API, SDK, MCP, Feeds.** The `period` enums gain `quarter` and `year`; the Feed kit's period helpers learn them; the OpenAPI reference is regenerated. A Feed for a quarterly Metric sends one value per quarter.
- **Catalog.** Some catalog Metrics become quarterly or yearly where that is how they are reported (NPS from a quarterly survey, headcount at quarter end, annual revenue target).
- **Glossary.** New entries: **Period**: "How often a Metric has a value: a day, week, month, quarter or year." **Fiscal Year**: "The year a workspace reports in, starting in the month it sets (January unless set); its quarters, half-years and years are the ones Ziffr uses everywhere." _Avoid_: Financial year, business year.

## Testing Decisions

- `periods.ts` unit tests: start, end, shift and label for every period, around year ends, leap years and ISO weeks, with a January, an April and an October year start.
- The year start: set by an Owner or Admin, refused for a Member, refused once a quarterly Metric has values, audited; Comparisons and labels follow it.
- Comparisons for quarterly and yearly Metrics: which are offered, and their values from known series.
- Database tests: a quarterly Metric created, a Prompt for the right quarter, a Due Date after the quarter, a Lock and an Approval per quarter, a value by the API and a Feed.
- Tried in the running app: a quarterly and a yearly Metric, the form, the chart, the Workflow page.

## Tickets

1. #38 `periods.ts`: one module for period arithmetic and labels, with the year start, every caller moved to it, with tests (no behaviour change: January).
2. #39 The fiscal year: `year_start_month`, the setting under Settings ▸ General, its rule and audit, passed to every period function and to what the browser draws; quarters in Comparisons follow it.
3. #40 Quarter and year as Periods: migration, Metric creation and editing, the form, labels, charts and tables.
4. #41 Workflows, Prompts, Due Dates, Locks and Approvals per quarter and year.
5. #42 Comparisons and forecasts for quarterly and yearly Metrics.
6. #43 API, SDK, MCP server, Feed kit and OpenAPI reference (the workspace's year start readable there); catalog Metrics.
7. #44 Docs: user guide (Metrics, Workflows, Workspace settings), API guide, glossary, release note.

## Out of Scope

Half-yearly Metrics (half-years are offered for display in spec 0018 and Snapshots in spec 0020, which covers most needs); periods of other lengths (two weeks, four-week retail periods); converting a Metric with values to another period.

## Further Notes

- **Fiscal years** are built in from ticket 1 on, because they touch all four specs 0017 to 0020: every period function takes the workspace's year start, rather than every one changing again later. Weeks stay ISO weeks whatever the year start; a fiscal year of 52 or 53 weeks (4-4-5 retail calendars) is out of scope.
- Depends on nothing; specs 0018 to 0020 use `periods.ts` from ticket 1.
