# What each analysis needs of the data, and what the demo has (ticket #987)

The owner's report of 23 November 2026: on the demo, the Drivers tile for Margin said "No other metric with enough periods in common with Margin" (2 of 6 months), and some entries of the method picker were greyed for lack of data. This page lists what every analysis needs, what the demo, the trial and the Sample Data had, and what was added. The acceptance test is `packages/core/src/demo-analyses.db.test.ts` (the demo) and `packages/core/src/sample-data-analyses.test.ts` (Sample Data).

## Why Drivers of Margin was empty

Margin is a monthly Derived Metric. The six weekly Metrics of the "Weekly numbers" Workflow (Support tickets, Refunds, New leads, Cancellations, Trial sign-ups, Orders shipped) had 13 weeks, which is 2 whole months. A weekly Metric is compared with a monthly one on months, and only whole months count (`correlate`, `seriesBy`), so the pair had 2 months in common against a minimum of 6. The seed's monthly Metrics had 18 months, short for a fit with several drivers (8 + 4 per driver), for a lag (12 pairs of changes) and for two seasons.

## The demo before and after

The seed's own values are untouched: `prototype_seed_history` only adds periods before the first one, and two Metrics.

| Metric | Period | Before | After | Shape of the added periods |
|---|---|---|---|---|
| Revenue, Orders, Cost, Support tickets | month | 18 months | 42 months (May 2023 on) | the seed's own formulas, with the December peak (Nov +18 %, Dec +32 %, Jan −12 %), growth 1.6 % a month |
| Return rate | month | 17 months | 41 months | rises and falls with the month's tickets, as in the seed |
| Gross margin | month | 12 months | 42 months | about 41.6 %, a little lower when returns are high |
| Churn rate | month | 13 months | 42 months | about 3 %, following the tickets of two months before |
| Support tickets, Refunds, New leads, Cancellations, Trial sign-ups, Orders shipped | week | 13 weeks | 156 weeks (Nov 2023 on) | yearly pattern in Orders shipped (peak in weeks 48 to 51); Refunds follow Support tickets by one week; Trial sign-ups rise and fall with New leads; New leads and sign-ups step up on 1 September 2025 (the autumn campaign); Cancellations kept apart |
| Revenue by country, Orders by payment method, Return rate by category | Breakdown | 18 months | 42 months | as the seed makes them |
| Revenue by country | Breakdown with parts | none | every month | Germany has the parts Online shop, Retail partners and Wholesale; Austria has Online shop and Retail partners; the top-level rows are unchanged |
| Revenue budget (Target Series) | month | 21 months | 45 months | the seed's formula |
| Marketing spend | month | (new) | 42 months | steady growth with noise; owned by Sara, shared with nobody |
| New customers | month | (new) | 42 months, Target Range 450 or more | follow the spend for 36 months, then keep to their line while the spend goes its own way; owned by Sara, shared with nobody |
| Deals closed | day | 407 days | unchanged | a daily Metric; a year is enough for the picker's entries, and it is left alone |

Who sees what is unchanged: no share, group or token was added. The two new Metrics belong to Sara (the Owner) and are shared with nobody, so only she and the Admin see them; the Guest still sees Cost, Margin, Orders, Revenue and Support tickets through the Monthly overview, as before (the test checks both).

The noise is a hash of the Metric name and the period (`prototype_noise`), never `random()`, so every Installation holds the same numbers. The function does nothing twice (it stops when Revenue has 30 or more months) and nothing where the demo has no Revenue.

## What each analysis needs

Minimums are from `suitability.ts` (`SUITABILITY`) and the Methods guide. "Common periods" are the periods two Metrics have in common on the longer of their periods; a pair of changes needs two values in a row.

### The tiles

| Tile | Needs | Demo canvas in the test |
|---|---|---|
| Forecast | 4 periods (Holt); 2 full seasons for Holt-Winters (24 months, 104 weeks) | Revenue: 42 months, a December peak |
| Correlation | 2 Metrics, 6 common periods, both varying (4 different values, half of the steps change), under 1 gap in 5 | Support tickets and Refunds (weekly); Margin with a weekly Metric (35 months in common); Revenue and Orders |
| Drivers | one Metric and 2 or more others with 6 common periods each | Margin with Orders, Support tickets and Refunds; Margin with every other Metric (13 ranked, none left out) |
| Correlation matrix | 4 Metrics, 6 common periods for each of the 12 pairs | Revenue, Orders, Cost, Support tickets; four weekly; Margin, Orders, Return rate, Support tickets (weekly) |

### The 15 entries of the method picker

| Entry | Needs | Demo canvas (test) | Takeaway it gives |
|---|---|---|---|
| Where is it heading? (forecast) | 4 periods; Holt-Winters 2 full seasons | Revenue | expected January 2027, with a range |
| Will we reach the Target? | a Target Range, 4 periods | Revenue (120,000 or more) | the chance of reaching it |
| Does A move with B? (correlation) | 6 common periods | Support tickets, Refunds | move together, strong |
| Rank correlation | 6 common periods | New leads, Trial sign-ups | move together |
| Partial correlation | 8 + 4 periods per Metric held, 3 or more Metrics | New leads, Trial sign-ups, Orders shipped held | held the same |
| Lagged correlation | 12 pairs of changes, delays 0 to 6 | Support tickets, Refunds (Refunds follow by 1 week) | "1 week before Refunds" |
| What moves B? (fit) | 8 + 4 periods per driver, at most 1 driver per 6 periods | Trial sign-ups with New leads and Support tickets | New leads moved with sign-ups the most |
| What does B need? | the same, and a value | Trial sign-ups reaching 160, through New leads | what leads must be |
| What if A changes? | the same | New leads +10 %, Trial sign-ups follow | an estimated change |
| Did it work? (before and after) | a day with 6 periods after it; optionally a Metric set beside, at the same period | New leads from 1 Sep 2025, Cancellations beside | about 46 % above the trend, Cancellations roughly where they were |
| Did something change, and when? (change point) | 8 periods (2 segments of 4) | New leads (a step at the campaign) | around 1 September 2025 |
| Why did it change? (bridge) | a Breakdown for the latest period and the one before | Revenue by country | which countries added or took away |
| What is usual? (usual range) | 8 periods | Orders, a value to check | usual range, where 1,500 stands |
| How much do the biggest rows make up? | a Breakdown for the latest period | Revenue by country | the 3 largest rows make up 77 % |
| Which few rows make up most of it? (Pareto) | a Breakdown for the latest period | Revenue by country | the rows that reach the share |

### The built-in Recipes

| Recipe | Needs | Demo Metric |
|---|---|---|
| Moving average | 3 periods | Revenue |
| Growth | 2 periods | Revenue |
| Linear trend | 2 periods | Orders |
| Seasonality | 2 years of monthly values | Revenue (3.5 years) |
| Unusual periods (z-score) | 2 periods | Cost |
| Correlation | common periods | Support tickets, Refunds |
| Share of a total | a part and a total over the same periods | Return rate, Support tickets |

### The marks

| Mark | Needs | Demo |
|---|---|---|
| Polar | 1 or more periods of non-negative values (a year of months fills the circle) | Revenue, 12 months |
| Radar | 3 to 12 Metrics, latest values (a spoke has its own scale) | Revenue, Orders, Support tickets, Return rate |
| Range | rows that have a "likely between", such as the effect of each driver of a fit or a what-if | What moves Trial sign-ups: New leads and Support tickets |
| Bridge | a Breakdown for the latest period and the one before | Revenue by country |
| Formula Tree | a Derived Metric whose inputs the person sees | Margin: a difference, a ratio and a product by 100 (Revenue and Cost); Average order value: a ratio |
| Breakdown tree | a Breakdown with parts in the latest period | Revenue by country, parts under Germany and Austria |

### The Heads-up kinds

A Heads-up is held to everything it looked at (Benjamini-Hochberg), and a pair has to pass every check cleanly: 12 pairs of changes, a strong link in each half, no run of repeated values (more than half repeating is "ties"), no far-off change, no seasonal jump. Counts and weekly values of 190 to 210 repeat too much for a link to pass, which is why the weekly Support tickets vary by about 10 %. Seasonal Metrics such as Revenue and Orders do not pass either, and that is right: the demo says little, not a flood (3 Heads-ups in the test, at most 8 allowed).

| Kind | Needs | Demo |
|---|---|---|
| Moving together | 2 Metrics, 12 pairs of changes, strong in both halves, clean checks | Support tickets and Refunds, one week apart (looked at on 23 November 2026, the day of the weekly data) |
| Stopped moving together | a pair that met the conditions before the last 6 periods, and a link under 0.3 in them | Marketing spend and New customers |
| Target out of reach | a Target Range, a clean straight line in the latest periods, under 1 in 5 for the forecast | New customers (450 or more) |
| Change of direction | a change point at one of the last 3 dates, the trend turned | not on the demo (see below) |
| Unusual for the season | at least two earlier values at the same place in the season, and a small chance by luck | not on the demo (see below) |

## What the demo does not have, and why

- **Change of direction and unusual for the season** have no planted example. The first needs a clean trend that turns within the last three dates of a Metric whose latest values the landing examples already fix; the second needs five or more earlier values of one place in the season to pass a correction at 1 % (three years give two or three, and a chance by luck of one in a few hundred at best). Both run on the demo, so a person who adds such a Metric sees them; neither is forced, because the demo should not look like it finds something in everything.
- **A "stopped moving together" and a Target out of reach on Revenue or Orders**: not planted; those carry the December peak, which a Heads-up rightly reads as seasonal.
- **The Heads-up job never scans the demo.** The demo's reset (`resetDemoWorkspace`) now looks at the demo's pairs once a night, as the job would look at a Workspace, so the pairs appear on the Analyze page. A demo filled only by SQL (Docker's first start, `supabase/seed.sql`) shows the Heads-ups about one Metric at once and the pairs after the first nightly reset.
- **Dates.** The weekly Metrics and Gross margin and Churn rate have fixed dates (the landing examples), the other monthly Metrics end last month. A Heads-up counts a Metric as current for 6 periods, so the weekly pair stands for about six weeks after 16 November 2026 unless the seed is brought forward; the test looks at it on 23 November 2026 for that reason.

## The trial

The Trial Workspace holds "Cups of coffee" and nothing made up: the first value it holds is the Owner's own (spec 0021, the user guide's chapter 7, and `trial-seed.db.test.ts` asserts it). A made-up history would sit in the person's own Workspace, in their own Metric, feeding their own forecasts. It is not added. The Analyze page of a trial says in words what a Metric still needs (the same minimums as the table above), and the Playground draws every analysis with Sample Data without touching the Workspace.

## Sample Data

Sample Data (`sample-data.ts`) has five Metrics of 24 periods at every period a Preview can be drawn at: Revenue with a Breakdown, Orders and Operating cost that share a swing, Active customers, and Churn rate with a Target Range. Every entry of the picker already gives a Takeaway on it at months, weeks, days and quarters, and none is greyed, so nothing was changed there. `sample-data-analyses.test.ts` holds it to that.
