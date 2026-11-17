# 0019 Analyses across periods

**Status:** draft. **Tracking issue:** opened when the spec is agreed (label `tracking`); tickets carry `spec:0019`.

## Problem Statement

Correlation, the correlation matrix, Drivers and the scatter plot only look at Metrics of the same period: `rankCorrelations` drops every Metric whose period differs, and `pearson` pairs values only for periods both series have. A weekly "support tickets" and a monthly "churn" are never compared, though "do tickets move with churn?" is exactly the question. On the Analysis Canvas, such a pair says nothing, and the person does not learn why. The same applies across days and weeks, and, once spec 0017 is in, to quarters.

## Solution

Two Metrics of different periods are compared on the **longer** of the two: the shorter one is combined to it by its Aggregation (spec 0018's `seriesBy`), so weekly tickets become monthly tickets and are paired with monthly churn. The result says on which period it was compared ("compared by month: 18 months") and needs the same minimum of pairs as today. A Metric whose Aggregation is "none" cannot be combined, so it is compared only with Metrics of its own period, and the analysis says why the others are missing.

## User Stories

1. As an analyst, I want Drivers to consider Metrics of every period, combined to the longer one, so that a weekly Metric can explain a monthly one.
2. As an analyst, I want a correlation between a weekly and a monthly Metric to say it was compared by month, and on how many months.
3. As an analyst, I want the correlation matrix to fill the pairs of different periods, each on its common period, and say so on hover.
4. As an analyst, I want to be told why a Metric is left out ("Aggregation none: compared only with monthly Metrics"), not to find it silently missing.
5. As an analyst, I want the scatter plot of two Metrics of different periods to show one dot per common period.

## Implementation Decisions

- **The common period** of two Metrics is the longer of their periods; both series go through `seriesBy` to it (the longer one unchanged). Only complete periods count: a "to date" period is left out, as it would compare a part with wholes.
- **Pairs and thresholds** stay as today: `pearson` needs at least 6 common periods; with fewer, the pair is shown as "not enough months in common (4 of 6)".
- **Aggregation "none"** keeps a Metric to its own period. The Drivers list and the matrix name why such pairs are missing.
- **Derived Metrics** keep their exclusion: a Metric is not compared with a Derived Metric built from it, or the other way round, at any period.
- **Where.** `correlation.ts` (`pearson`, `rankCorrelations`), the Drivers and matrix widgets, the scatter plot, and the Analysis Canvas and its recipes. Forecast is unchanged: it works on one Metric (spec 0018 lets it work by a Display Period).
- **Wording.** "Compared by month (18 months)" under every result that combined a Metric; nothing when both are of the same period, as today.

## Testing Decisions

- Unit tests: a weekly and a monthly Metric correlated on months from known series; a "to date" month left out; fewer than 6 common months refused with the count; Aggregation "none" kept to its own period with the reason; the Derived Metric exclusion across periods.
- Tried in the running app: the demo's weekly and monthly Metrics in Drivers, the matrix and a scatter plot.

## Tickets

1. Correlation on the common period in `correlation.ts`, with unit tests (builds on spec 0018, ticket 1).
2. Drivers, the matrix, the scatter plot and the Analysis Canvas: results across periods, with the period and reasons shown.
3. Docs: user guide (Analyze), release note.

## Out of Scope

Lagged correlation ("tickets this month, churn next month"); causal or impact analysis (#5); clustering (#4); comparing at a period longer than both (both monthly, compared by quarter).

## Further Notes

Depends on spec 0018 (`seriesBy`). With spec 0017, quarterly and yearly Metrics join in the same way; a yearly Metric rarely has the six years a correlation needs, and is told so.
