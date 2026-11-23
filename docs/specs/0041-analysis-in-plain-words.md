# 0041 Analysis in plain words: what drives a number, what it would take, what happens if, and a heads-up when something stands out

**Status:** in progress. **Tracking issue:** #693 (label `tracking`); tickets #694 to #710 carry `spec:0041`, in the order of the Tickets section. The owner's wish of 2026-11-22; the owner accepted the decisions the same day.

## Problem Statement

Ziffr answers three analysis questions today: where is a Metric heading (Forecast), do two Metrics move together (Correlation), and which other Metrics move most with this one (Drivers). Real questions are bigger and they have several Metrics in them:

- "B has to reach 120. How much must A improve, given that C and D also move B?"
- "If we push A up by 10 %, what happens to B, C and D?"
- "Did the campaign in March do anything?"
- "Why did revenue fall this month?"
- "Will we hit the target in December, and how sure are we?"
- "Is something going on that I should know about?"

The people who ask are not analysts. They cannot read a p-value, a coefficient table or an R², and should not have to. And two things in today's analyses mislead a non-analyst without telling them:

1. **Drivers ranks Metrics by Pearson's r on their levels** (`correlation.ts`, `pairUp` takes the values as they are). Two Metrics that both grow over time correlate strongly whether or not they have anything to do with each other: revenue and the number of employees, ice cream sales and the year. A reader takes "0.95" as "moves with". It must compare how the Metrics change from one period to the next (or around their trend), and say which.
2. **A pair is never judged against how many pairs were looked at.** Ranking 100 Metrics against one always puts something near the top. Nothing says "this could be chance".

Spec 0024 gave third parties a way to compose new analyses from a fixed library of verified functions, with no code of theirs run. That library has eleven functions and cannot express any of the questions above: none of them fits a line through several Metrics at once, inverts it, or says how sure it is. This spec adds the methods, and, more important, the layer that turns their results into sentences a non-analyst can act on.

## Solution

Five things, in this order:

1. **A bigger verified library** (the Methods below), all written like the existing functions: exact on the values' text where arithmetic allows, a reference implementation of its own, generated tests, a row in the Calculation Catalogue (spec 0022).
2. **The plain-words layer.** Every method returns, besides its numbers, one **Takeaway**: a sentence in the Metric's own words and units, a range instead of a point where there is doubt, a strength in a word (strong, moderate, weak, "can't tell from chance"), what it is based on ("24 months"), and, where it applies, one line saying what it assumes. The wording is Ziffr's, in one place, tested as a table of cases. A person never sees a p-value, a coefficient, a confidence level, "R²" or "OLS". An analyst can open **Show the numbers** for those.
3. **Recipes** (the glossary's one-click Analyses, the ones a non-analyst starts from): "What moves B?", "What does B need?", "What if A changes?", "Did it work?", "Why did B change?" and "Will we reach the target?". Each is a question in plain words, asks only what it must ("B, and the value you want"), fills in the rest, and ends in an Takeaway and a chart.
4. **Heads-ups.** Ziffr looks through the Metrics a person may see on a schedule and tells them, in the same plain words, when something stands out: two Metrics that have started moving together, a pattern that broke, a change in direction, a Target that is likely out of reach. Every Heads-up is judged against everything that was looked at, so that Ziffr stays quiet when there is nothing.

5. **Choose the method yourself.** The same Methods, reachable without a question: on the Analysis Canvas a person who knows what they want picks a Method from a list in plain language, and it runs through the same Takeaway layer. A question is the way in for someone who does not know which Method to use; the picker is the way in for someone who does.

So there are three layers over one library: a **question** (Ziffr picks the Method and says what it assumed), the **picker** (the person picks, and Ziffr says when it does not fit), and **Analysis Recipes** (an author composes Methods in a file). Nothing is hidden behind a question; the Takeaway always names the Method under **Show the numbers**.

New ways to draw the results (a radar chart, treemap and driver tree, a range mark) are in the Marks section.

### Words

| Word | Meaning | Not |
| --- | --- | --- |
| **Takeaway** | The result of an Analysis as Ziffr says it: a sentence, a range, a strength word, its basis and its assumptions. | Insight, conclusion, finding (a Finding is an editorial widget) |
| **Heads-up** | Something Ziffr noticed in Metrics a person may see and tells that person, once, without being asked about that Metric. | Insight, notification, alert (an Alert is a person's own standing request on one Metric), anomaly |
| **Method** | One statistical calculation in Ziffr's library, such as a multi-Metric fit or a seasonal forecast. Used in documents and code; a person sees Analyses, Recipes and Takeaways. | Algorithm, model, test |

`GLOSSARY.md` gets **Takeaway** and **Heads-up** in the ticket that first uses each. **Analysis**'s _Avoid_ list ("Stats, model, insight") stays, and Heads-up exists because "insight" may not be used.

## The questions people ask and the Methods behind them

The first wave is chosen by the question, not by the Method. Each row is a question, the Method that answers it, and how the Takeaway reads.

| The person asks | Method (internal) | The Takeaway says |
| --- | --- | --- |
| What moves B? Which of A, C, D matters most, with the others held the same? | Multiple linear regression on period-to-period changes; each driver's share of what is explained, by averaging over every order of adding the drivers (LMG) | "Over 24 months, Visits and Price moved Revenue the most. Visits explains about half of what moved, Price about a third, Support tickets little." Strength word per driver. |
| By how much does B change when A changes? | The same fit; the driver's effect with a range, in B's unit per unit of A | "When Visits go up by 1,000, Revenue has gone up by about 2,400 € (between 1,800 and 3,000), with Price held the same." |
| B has to reach x. What does A need to be? | The fit inverted for one driver, others held at their latest values or the values the person gives, with the range | "To reach 120 k €, Visits would need to be around 54,000 a month (between 49,000 and 61,000), 12 % above today. This is higher than Visits has ever been (max 51,000), so treat it as a guess." |
| If A moves by 10 %, what happens to B, C, D? | The fits of each affected Metric on A and its other drivers, followed at most two steps; paths through a Derived Metric are plain arithmetic and said to be exact | "Revenue +4 % (3 to 5), Support tickets +6 % (2 to 10). Margin +0.4 points: worked out from Revenue and Cost, not estimated." The picture separates exact from estimated. |
| Is the link real or an accident of both growing? | Correlation of changes; partial correlation with the other Metrics held fixed; rank correlation when values are skewed | "Visits and Revenue move together even when growth is removed (strong)." or "They only look related because both grew; changes in one do not follow the other." |
| Does A lead B? By how long? | Lagged correlation of changes, 0 to 6 periods | "Support tickets tend to rise two months before Churn does (moderate)." |
| Did the March campaign work? | Compare the periods after a date with where the Metric's own trend pointed, and with a Metric the person names as unaffected, if any | "After 1 March Signups ran about 12 % above where their trend pointed (between 4 % and 20 %). Visits, which the campaign did not touch, ran 1 % above." |
| Why did B change from last period? | Contribution of each Breakdown row, or of each input of a Derived Metric, to the change (a bridge) | "Revenue fell 42 k €: Germany −35 k, Austria −9 k, France +2 k." Exact. |
| Will we reach the Target? How sure? | Seasonal forecast with its band; the chance that the band reaches the Target; how well the same Method did on the periods that are already known | "At this pace Revenue reaches 1.2 M € in December: about 7 in 10. Over the last 12 months, the range for the next month would have held 10 times." |
| Did something change, and when? | The single most likely change in level or trend (a change point) | "Signups changed direction around March: up 2 % a month before, down 1 % after." |
| What is normal for B? | Median, quartiles and the usual range by the Metric's own history, by season where it has one | "Usually between 410 and 520. This month's 640 is far above." |
| Where is it concentrated? | Share of the top n, Pareto | "Three customers make up 71 % of revenue." |

**Out of the first wave, on purpose:** clustering (grouping rows or periods), principal components, causal discovery, logistic regression, neural nets. Each is either hard to say in a sentence without being wrong or needs data most Workspaces do not have. They can come as Extensions (spec 0042).

## What every Takeaway must hold to

These are the rules that make it safe for a non-analyst, and the tests check each of them.

1. **No Takeaway without enough data, and it says what is missing.** Minimums are per Method: a fit with k drivers needs at least 8 + 4·k periods; a seasonal forecast needs two full seasons; a lag needs 12 periods. Below that: "Not enough months yet: 9 of 16 needed." Never a number with a footnote.
2. **Changes, not levels, unless the Metric does not trend.** Where both series have a clear trend (their linear trend explains more than half of their variance), the relation is worked out on the change from the period before, and the Takeaway says "growth removed". Otherwise on the values. The basis is always named.
3. **A range, never a bare point,** wherever the Method gives one. The range is the 80 % range, called "likely between". Nothing says "confidence" or "significant".
4. **Strength in four words**, from fixed thresholds written down once: strong, moderate, weak, "can't tell from chance". The fourth is what a non-analyst most needs to read; it is shown as often as the others.
5. **Went together is not caused.** Ziffr never writes "causes", "drives" as a fact, "because" or "due to" about a statistical Takeaway. "Moves with", "tends to", "has gone with". Each kind of Takeaway has one short footer line of its own, in the person's language, once: for a link between Metrics "This shows what has gone together, not what caused what."; for a forecast, which is not about things that went together, "This carries the past forward; it is not a promise." for a change point "This shows when the numbers changed, not what made them change."; for a before-and-after look "This compares what happened with where the earlier trend pointed; it does not show what made the difference." A Takeaway about one Metric's own values read as they are, or a sum worked out exactly, has none. The Recipe called "What drives Cost?" keeps its name, since it is the person's question; its Takeaway does not claim.
6. **Held-fixed is said.** An effect from a fit says what it held the same ("with Price held the same"). Drivers that move together so closely that the fit cannot tell them apart (variance inflation above 5) are said as one: "Visits and Sessions move so closely that Ziffr cannot tell which matters; treated as one." This is for a pair (linked by r² above 4/5, or exactly in step). Where the inflation is high only for a group of three or more with no such pair, between 5 and 10 the fit is kept and the Takeaway names the crowded drivers (their ranges show how much less certain each effect is, and nothing is called strong); above 10 the fit is refused, naming every driver that loads on the near-dependency (the direction of least variance of the correlation matrix; a driver loads on it from 5 % of that direction, so a driver with an inflation under 5 can still be named, and one at 4.7 % is not). An exact mix of three or more is refused naming all of them: "one is exactly the others added up".
7. **Outside what was seen is said.** A goal or a what-if that asks for a value outside the range the driver has had gets the sentence above ("higher than Visits has ever been"), and a range that is not offered, only the point and "treat as a guess".
8. **Few drivers, honestly.** At most one driver per 6 periods, and at most 6. More Metrics than that go through a first pass and the Takeaway says how many were considered and which were left out and why. The first pass ranks the candidates by the marginal correlation of their changes with the target (Pearson's r, exact; ties by Metric id) and keeps the most the history allows; as it looks at each Metric alone it can miss one that only shows beside another (a partial-correlation pass, forward by forward, is a follow-up).
9. **Exact where the question is arithmetic.** A bridge, a Derived Metric's what-if, a share and a Pareto are exact, worked out on the values' text (spec 0022), and the Takeaway says "worked out", not "estimated".
10. **The same words everywhere.** One module writes every Takeaway; a Dashboard widget, a View Link, a deck, an email, the API and a Heads-up all show the same sentence. Wording is data keyed by case so it can be translated; the number slots take the Workspace's Number Style and each Metric's unit.
11. **Only what the person may see.** An Analysis names and uses only Metrics the person may see (rule 3 of `AGENTS.md`). A Metric they cannot see is not in a driver list, not as a name, not as "another Metric".

12. **Every Method says when it does not suit the data, and the data is checked every time.** Beyond the minimums of rule 1, each Method declares its **suitability checks** (below). When one fails, the Takeaway is one of three things, never a quiet number: a **refusal** ("Not enough months yet: 9 of 16 needed"), a **caution** (the answer is given with one plain line above it: "Two months are far from the rest and pull this result; without them it reads +1,900 € per 1,000 Visits"), or a **different Method** where the rule picks one (rank correlation instead of Pearson's r for skewed values, and it says so). A Takeaway that passed every check says nothing extra; one that passed with a caution is never shown as strong.

## When the data does not suit a Method

Rules 1 and 12 need checks the Method can run on the series it is given. They are part of the Method, written once, tested like the Method, and shown on the Method's catalogue entry as **Use it when** and **Don't use it when** (spec 0041's picker reads the same text). The first wave:

| Check | Applies to | Fails when | Result |
| --- | --- | --- | --- |
| Enough periods | every Method | fewer than the Method's minimum (fit: 8 + 4 per driver; seasonal forecast: 2 full seasons; lag: 12; before and after: 6 before the date) | Refusal, with how many it has and needs |
| Enough that vary | every Method | a series is constant, or has fewer than 4 different values, or fewer than half its periods differ from the one before | Refusal: "Support tickets has hardly changed, so there is nothing to compare" |
| Gaps | every Method | more than 20 % of the periods in the window have no value, or a gap of 3 or more in a row; gaps are never filled in | Refusal above the limit, caution below it ("3 of 24 months have no value and were left out") |
| Far-off values | fits, correlations, forecasts, change points | a value lies further than 4 median absolute deviations from the median, and leaving out the 1 to 3 most extreme changes the result by more than a fifth of its own range or flips its sign | Caution, giving the result without them next to it; never removes a value by itself |
| Skew and ties | Pearson's r, fit | the values are strongly skewed (skewness above 2) or mostly ties | Rank correlation is used instead of Pearson's r, and it says so; for a fit, a caution |
| Not a straight line | fit, predict, needs, what-if | the fit's misses show a curve (the misses, ordered by the fitted value, change sign fewer than expected: a runs test at 5 %) or a quadratic term explains a clear further share | Caution: "The link looks curved, so a straight-line reading is rough"; **needs** and **what-if** refuse outside the range seen (rule 7) and are marked rough inside it |
| Changing relationship | fit, correlation, lag | the relation in the first and second half of the history differs by more than their ranges allow (a change of sign, or a drop of more than half) | Caution: "This link was stronger in 2025 than since"; the Takeaway reports the latest half as well |
| Level shifts | forecast, trend, usual range | a change point of 3 typical misses or more lies in the window | The Method uses only the data after it when at least its minimum remains, and says so; otherwise caution |
| Seasonality that does not repeat | seasonal forecast | the seasonal pattern of the first and second year differs more than a set share | The plain Holt forecast is used, and it says so |
| Spread that grows | fit, ranges | the misses get larger as the level grows (a rank correlation of size and misses above 0.5) | Caution that the ranges are rough; ranges are worked out on percentages of the level where the Metric is always positive |
| Mixed units or periods | what-if, fit | a Metric has Aggregation none and another period, or an input is a Derived Metric built from another input | Refusal naming it, as spec 0019 does |
| Too many Metrics for the history | fit, Drivers | more drivers than rule 8 allows | A first pass chooses, and says which were left out |

The thresholds are written in one table (the Takeaway layer's), reviewed with two analysts, tuned by ticket 17's trial, and each is tested at the threshold, one step either side.

**What never happens:** Ziffr never removes, smooths or fills in a value without saying so; never lowers a Method's minimum to give an answer; never shows a result as strong that passed only with a caution; and never turns a refusal into a number because the person asked again or picked the Method by hand (the picker obeys the same checks).

All are pure functions in `packages/core`, in new files beside `recipe-functions.ts`, taking series of `Point`s as the existing ones do. Each has: a reference in `test/reference/` that works the answer out another way, generated tests, 100 % coverage of its path, and a row in the Calculation Catalogue.

**Arithmetic.** Sums, means, covariances, the normal equations of a fit and its inverse are worked out on exact fractions (`exact.ts`, BigInt), in the order the references say. Only the last step to a double, a square root, and the lookup of a distribution are not exact.

**Distributions.** The t, F and normal quantiles that give a range are the one thing exact fractions cannot give. They are computed by a documented series or continued fraction in doubles, and checked against a table of values produced by R and SciPy, committed with the script that made them (`test/reference/fixtures/`, generated outside CI, which needs neither). A Method equals its reference when they agree to a relative 1e-9 where a distribution is used, and exactly where one is not. Same rule as the forecast's band today.

First wave:

| Method | In the library as | Takes → gives |
| --- | --- | --- |
| Changes | `changes` | A series → its change on the period before (a series); `detrended` as the alternative, the series minus its linear trend |
| Rank correlation | `spearman` | Two series → r (value) |
| Partial correlation | `partialCorrelation` | A, B and 1 to 4 others → r of A and B with the others held fixed |
| Lagged correlation | `laggedCorrelation` | Two series, lags 0 to 6 → each lag's r and the best |
| Multiple fit | `fit` | A target and 1 to 6 drivers → the effects with their ranges, the share each explains, how well it fits, the periods used |
| Importance | `importance` | The same → each driver's share (LMG) |
| Predict and invert | `predict`, `needs` | A fit and values for the drivers → a value with its range; a fit and a goal for the target → the driver value with its range |
| What-if chain | `whatIf` | A set of fits, a driver and a change → the effect on each Metric reached, at most two steps |
| Seasonal forecast | `holtWinters` | A series with at least two seasons → values ahead with a band, as `forecast.ts` does for Holt |
| Track record | `backtest` | A Method and a series → how many of the last n periods fell in the band and the typical miss |
| Reach chance | `reachChance` | A forecast and a Target → the chance the band reaches it |
| Change point | `changePoint` | A series → the most likely period of a change in level or trend, and the size, or none |
| Before and after | `afterDate` | A series, a date, optionally a comparison series → the gap to the trend with its range |
| Bridge | `bridge` | A change and its parts (Breakdown rows or a Derived Metric's inputs) → each part's contribution, exact |
| Quantiles | `quantile`, `usualRange` | A series → median, quartiles and the usual range, optionally by season |
| Concentration | `topShare`, `pareto` | Breakdown rows → the share of the top n; the rows that make 80 % |

The existing `forecast` (Holt) stays; `holtWinters` is chosen where two seasons exist and `backtest` says it does better than Holt on the periods already known, and the Takeaway says which was used. Choosing is a rule written down, not a search: the Method with the smaller typical miss on the last third of the series.

### Analysis Recipe format

The functions above do not all give a series or a single value: `fit` gives a model, `changePoint` gives a period and a size, `bridge` gives rows. The format becomes `ziffr.analysis/2`: a step's output is a **series**, a **value**, a **table** (rows with a label and a value or range), or a **model** (what a fit holds), and a step names which kind it expects as input. Ziffr reads `/1` for ever and writes `/2` once a recipe uses a new function. An Analysis Recipe can show a model only through its Takeaway, so a recipe author does not write sentences about statistics; the **Takeaway** is produced by the Method's own wording, and a recipe can add a title and a plain-text note. That keeps rule 5 above out of recipe authors' hands.

## Heads-ups

### What Ziffr looks for

| Heads-up | Condition (all must hold) | Reads like |
| --- | --- | --- |
| Moving together | Changes of two Metrics correlate with \|r\| ≥ 0.7 on at least 12 periods, in both halves of the history, and stay significant after correcting for the number of pairs tried (Benjamini-Hochberg at 10 %); a lag from 0 to 3 periods is tried and the best reported | "Support tickets and Churn have started moving together: when tickets rise, churn follows two months later (strong, over 18 months)." |
| Stopped moving together | A pair whose history before the last 6 periods would itself have been reported as moving together (it must pass the same conditions and the same correction; "strong for 12 periods" alone is not enough) drops under 0.3 over the last 6, and the drop passes the same correction among the pairs that had been moving together | "Visits and Revenue used to move together. Over the last 6 months they have not." |
| Change of direction | `changePoint` finds a change of trend in the last 3 periods that passes a threshold of 2 typical misses | "Signups turned around in October: up 2 % a month before, down 1 % since." |
| Target out of reach | `reachChance` for a Metric with a Target in the Display Period is under 20 % with 2 or more periods left, or a Metric was on pace and now is not | "Revenue is unlikely to reach its December Target (about 1 in 5)." |
| Unusual for the season | A value outside the usual range for its season by `usualRange`, once the Metric has two seasons | "October's 640 is high even for a season that is normally strong." |

An Unusual Value (the glossary's value that needs Approval) is unchanged; a Heads-up never asks anyone to approve anything and never changes a value.

**Decided in ticket 13 (owner, 2026-11-23):** the earlier history must itself pass the correction, instead of "strong for 12 periods" alone. Without it, pairs that were strong only by chance among thousands would be tested for a drop. A false alarm costs more trust than a missed stop. Measured on the seeded simulation (150 Metrics): a stop in noise is found in about 30 to 50 % of cases, because over 6 pairs two unrelated Metrics have |r| of 0.3 or more more than half the time; with the last 6 periods exactly uncorrelated it is found in at least 19 of 20; a pair that carries on is called stopped in at most 1 of 20. A pair's chance is the weakest of the whole history and each half, since the correction at 10 % alone lets a false report through in roughly 1 run in 10 when nothing is related.

**What the thresholds really are (ticket 13).** "|r| at least 0.7 on at least 12 periods" is a floor, not what is needed: a pair is only reported if the chance of each half on its own also passes the correction for the pairs looked at, and with 12 pairs a half has 6. The |r| each half needs (before allowing for the Metrics following their own past, and before the best of 7 delays): with 2 Metrics (1 pair) 0.73 at 6 pairs a half and 0.70 from 12; with 10 Metrics (45 pairs) 0.96 at 6, 0.79 at 12, 0.70 from 18 pairs a half; with 50 Metrics (1,225 pairs) 0.99 at 6, 0.90 at 12, 0.80 at 18, 0.72 at 24; with 150 Metrics (11,175 pairs) 0.998 at 6, 0.93 at 12, 0.85 at 18, 0.77 at 24, 0.70 from 60. So in a big Workspace, 12 periods can only ever show a near-perfect link. Quiet is a result.

**Decided in ticket 15 (change of direction, Target out of reach, unusual for the season).** Each of the three is a test of one Metric's own final values, computed per person, and the three share one correction over everything looked at (the Metrics the person sees, three kinds each), at **1 %** and not the 10 % of the pairs: they look at every Metric one by one, and a pooled 1 % lets a false report through in about 1 run in 100 when nothing happens, if each chance holds (the simulation below is the evidence, not a proof). A condition about the Metric alone (the thresholds of the table, the suitability checks of the Method, that its latest period is within 6 periods of today) is applied before the correction, and a Metric that does not meet it counts among those looked at with a chance of 1. The words of the table are met as follows.

- *Change of direction.* "In the last 3 periods" is read as the last 3 dates the change point can try, because it needs 4 values each side: the later part has 4, 5 or 6 values. "A threshold of 2 typical misses" is the gap between the two straight lines at the latest period. A direction that turned means one slope up and the other down. The chance is the change point's own, with the periods worth fewer where the misses of the two lines follow their own past, and the larger of that and the chance that the mean change per period differs before and after the date: a series that wanders (a running total) has two lines through it that look like a change, and the simulation of 150 Metrics did not pass at 99 in 100 without this second chance.
- *Target out of reach.* "The Display Period" is the forecast's default horizon (14 days, 6 weeks, 3 months, 2 quarters, 2 half years, 1 year): a Target Series with its own value for a period is **not** yet read, only the Target Range (still to do). "Was on pace and now is not" is read as: with fewer than 2 periods left, the straight line without the latest value met the Target and the chance is now under 20 %. It needs the line to be below the Target now by more than its own uncertainty allows, which a single late value rarely does, so it fires rarely; that is a result, not a fault. The reach chance of the Takeaway (under 20 %) is a forecast's chance, not a chance by luck, and a Holt forecast on noise says "unlikely" far more often than 1 in 100; the correction therefore reads the chance of a straight line through the latest 24 periods being as far below the Target as it is (Student's t, exact), taking the larger of that and the same read from the changes alone (a series that wanders has a line that looks like a trend and independent changes), and the forecast's 20 % is a second condition.
- *Unusual for the season.* "Outside the usual range" is outside the 10th to 90th percentile of the earlier values at the same place in the season, and the chance is that of a new value against those values (Student's t with k - 1 degrees of freedom): the usual range alone would flag about 1 value in 5 of a Metric with nothing happening. "Once the Metric has two seasons" is read as at least 2 earlier values at the same place. A yearly Metric (a season of 1) has none. The earlier values at a place are taken as independent, which a wandering Metric only roughly allows. A change of direction or a Target out of reach is told once for the Metric: a later one is not told unless the first has ended. With few earlier years the distance needed is huge (2 earlier values: 78 sample deviations alone, 780 among 10 checks), so in practice a season's Heads-up needs 5 or more years; the table is in `docs/guides/methods.md`.
- *Footers.* A change of direction says "This shows when the numbers changed, not what made them change.", a Target out of reach "This carries the past forward; it is not a promise.", and a season "This compares the value with the earlier ones at this time of year; it does not show what made it differ." (a Heads-up by message is only sent with a footer). A change of direction and a Target out of reach are told once per Metric until they have ended and returned; so is a value unusual for its season (its key holds the Metric alone: a key names Metrics only).

Measured on the seeded simulation (150 Metrics, 100 runs of each of independent noise, trends and random walks, autocorrelated noise and a steady yearly pattern, each with a Target met about as often as not): none of the three kinds in at least 99 of the 100 runs; a planted turn five periods ago, a Target missed, and a spike among eight earlier Octobers are found.

### How it stays useful

- **Multiple pairs are the risk.** With 150 Metrics there are 11,000 pairs; at 5 % chance some 500 would look related. Hence the correction and the minimums above. The jobs examine at most 200 Metrics per Workspace (a Workspace with more is told the scan covers the 200 most recently updated, and an Owner may pick which), and pairs are limited to Metrics whose Common Period is the same span or one step apart.
- **Each one is said once.** A Heads-up carries a stable key (kind, the Metrics, the period it was first noticed). It is delivered once per person, and not again unless it has ended and returned.
- **Few.** At most 3 delivered per person per week, ranked by strength; the rest wait in the app, in a list called **Heads-ups** on the Analyze page.
- **Plainly dismissable.** Each can be marked **Not useful** (that pair or kind is not shown to that person again) or **Mute this Metric**. A person can turn Heads-ups off for themselves in their profile.
- **Quiet is a result.** A Workspace where nothing stands out has an empty list that says so. Ziffr does not make up something to say.

### Who gets one (visibility)

This is the part that must not leak.

- A Heads-up is computed **per person** over the Metrics that person may see (their Shares, Groups, Tokens, Stand-ins); one about two Metrics is made only for people who may see both. It is not computed once for the Workspace and filtered, so that the existence or the name of a Metric a person cannot see is in nothing they receive. The same holds for the pair counts used in the correction: a person's correction counts only the pairs of their own visible Metrics.
- Because per-person computation can be costly, the correlations of all pairs are computed once per Workspace and kept (**pair table**, columns: the two Metrics, period, lag, r, n, the date). A person's Heads-ups read the rows whose both Metrics they may see, through a core function that takes the Actor first. The pair table itself is never read by a browser, a Connector or a View Link.
- A Heads-up is sent to **Metric owners and people who opted in**. Default: shown in the app to everyone with a visible pair; sent by Delivery Preference only to people who turned it on. **Owner's decision, below.**
- A deleted, archived or hidden Metric disappears from Heads-ups and from the pair table the same day; nothing says why.

## Choose the method yourself

Today the Analysis Canvas decides the Analysis from how many Metrics are on it (one: forecast, two: correlation, more: Drivers and a matrix). The new Methods would be reachable only through Recipes. The picker adds a direct way.

- **Where.** On the Analysis Canvas, next to the suggested Analysis: **Choose a method**. It opens a list grouped by what the person wants to know (see where something is heading, what moves with what, what would happen if, what changed, what is usual), not by statistical family.
- **Each entry** has its plain name ("Does A come before B?" rather than "lagged correlation", with the technical name in small type after it), one sentence of what it tells you, **Use it when** and **Don't use it when** (from the Calculation Catalogue entry, written for non-analysts), and how many Metrics and how many periods it needs.
- **Fit to the canvas.** The list shows only Methods that fit what is on the canvas, by number of Metrics, their periods and how much history they have. A Method that does not fit is shown greyed with the reason ("needs 12 months, this Metric has 7"), never silently missing, as spec 0019 does for left-out Metrics.
- **Slots by name.** Picking a Method asks for its Slots in words ("Which Metric do you want to explain? Which might move it?"), filling them from the canvas where it can. A Metric on the canvas is the Target mark's as today.
- **Same rules.** The result is a Takeaway like any other: the same minimums, basis choice, range, strength word, held-fixed and outside-what-was-seen lines, footer and **Show the numbers**. Picking a Method yourself does not turn any of that off. A Method that does not apply (too little data, a flat series) refuses in the same words as a Recipe.
- **Same Methods as the Recipes.** A Recipe is a picked Method with its Slots and settings filled in for a question, so there is one implementation and one set of tests. An Extension (spec 0042) appears in the list once it is shipped, with the author's name, without any change to the picker.
- **What it keeps.** The picked Method and its settings can be saved as a widget, as any Analysis result can, and become a View Design with an Analysis Recipe on **Add to Workspace**. That is how a person goes from using a Method to sharing one, in a Pack, without writing a file by hand: **Export as Pack** (spec 0030) takes it.
- **Settings in words.** A setting that the Method has (how many periods ahead, how far back to look for a lead, the date to compare from) is asked as a plain question with a default and its range; nothing takes a free number the Method cannot use.

## Marks

New marks for View Designs (spec 0024), each drawn by the one renderer and taking its numbers only from verified functions. Geometry is the renderer's, and is tested: a treemap's rectangle areas are proportional to their values within a pixel.

| Mark | Draws | Needs |
| --- | --- | --- |
| `range` | A bar or dot with a band of doubt: a driver's effect with its range, a forecast's reach, a tornado chart of what-if effects | Values with low and high from `fit`, `predict`, `whatIf` |
| `polar` plot and `radar` | One or more series on spokes, for comparing a few Metrics' attainment or a Breakdown's rows (a radar chart) | 3 to 12 spokes, each a Metric or a row; a polar plot has no hierarchy |
| `tree` | A treemap, icicle or sunburst of nested parts | A tree: see below |
| `bridge` | Steps from a start value through signed parts to an end value (the waterfall that Findings have, as a mark) | `bridge`'s rows |

**Where a hierarchy comes from.** A Breakdown's labels are free text with no structure (glossary). Two sources are needed, and the first is the one that matters most:

1. **A driver tree from Derived Metrics.** Revenue = price × volume; margin = revenue − cost. The tree is the formulas, so every box is a number Ziffr already computes, the shares are exact and "where did it change" is a bridge down the tree. No new data. First ticket.
2. **A Breakdown with parents.** A Breakdown row may name a **parent row** (an optional field, validated: the parent must be a row of the same Breakdown, no cycles, depth at most 4, at most 200 rows). The upload's text format gets a `parent` column; the API and the paste from a spreadsheet (spec 0026) accept it. This needs a migration (add-only) and is the second ticket. A Breakdown without parents keeps being flat.

**Not in this spec:** heat maps (the correlation matrix remains), Sankey, network graphs, geographic maps. Each is a mark of its own and can wait for demand.

## User Stories

1. As someone who owns a Metric, I want to say "Revenue" and the value I want and be told what Visits would need to be, so that I know what to work on.
2. As them, I want the Takeaway to say how sure it is, and when it is a guess, so that I do not plan on a number Ziffr itself does not trust.
3. As a manager, I want to move one Metric by a share and see what happens to the Metrics that follow, with the exactly worked-out ones set apart from the estimated ones.
4. As someone who ran a campaign, I want to ask "did it work?" by naming a date and get a range, not a verdict.
5. As someone who is not an analyst, I want no word I would have to look up: no p-value, coefficient, R², regression or confidence interval.
6. As an analyst, I want **Show the numbers** on every Takeaway, with the Method, the periods used and the exact values, so that I can check and cite it.
7. As anyone, I want Drivers to stop showing two Metrics as related only because both grew, and to say whether it compared values or changes.
8. As anyone who sees many Metrics, I want a Heads-up when two Metrics start moving together or stop, and I want none when nothing does.
9. As them, I want each Heads-up once, a limited number a week, and a way to say it is not useful.
10. As anyone, I want never to be told about a Metric I may not see, not even by its name inside another's Heads-up.
11. As someone presenting, I want the Takeaway's sentence and chart on a dashboard, in a Snapshot, in a deck and on a View Link, saying the same.
12. As a designer, I want a radar chart, a treemap, a driver tree and a range mark in the View Design format.
13. As someone writing a Pack, I want a Takeaway-giving Analysis Recipe without writing a sentence about statistics.
14. As someone who knows which method they want, I want to pick it on the Analysis Canvas without writing a file, and be told when it does not fit what I have put there.
15. As an analyst, I want a method I picked to be held to the same rules as a Recipe (minimums, basis, ranges, the footer), so that choosing myself cannot give me a number Ziffr would not give a beginner.
16. As someone who made a useful analysis with the picker, I want to save it, put it on a dashboard and export it in a Pack, so that I can share it without writing code.

## Documentation

Each ticket ships its own documentation in the same pull request; ticket 17 completes and checks the whole. What exists when this spec is done:

| For | Document | Written in |
| --- | --- | --- |
| People using Ziffr | `docs/user-guide/13-analyze.md`: Recipes by question, how to read a Takeaway, Show the numbers, Choose a method, Heads-ups, with screenshots from the guide-screens script | The ticket that changes the screen; checked by `docs-audit` |
| Anyone reading a Takeaway | `docs/guides/reading-a-takeaway.md`: what the four strength words mean, what "held the same" and "outside what was seen" mean, why Ziffr never says "causes", what a caution and a refusal mean and what to do about each | Ticket 2, completed in 17 |
| Analysts | `docs/guides/methods.md`: one entry per Method (what it answers, how it is worked out in a paragraph, **Use it when**, **Don't use it when**, its minimums and suitability checks, a worked example with real numbers, the reference it is checked against). The picker and the Calculation Catalogue read the same entries, so they cannot disagree | Each Method's ticket adds its entry |
| Pack authors | `docs/guides/analysis-recipes.md` for format `/2`, `docs/guides/view-designs.md` for the new marks, `docs/guides/packs.md` where a Pack gains something | Tickets 8 to 12 |
| Everyone checking numbers | The Calculation Catalogue (generated into `docs/reference/calculations.md`, never edited by hand) and the schemas in `docs/reference/` | Generated by each Method's ticket |
| Programs | `docs/guides/api.md` and `docs/guides/mcp.md` say that analyses are not in the API or MCP yet (the core takes the Actor first, so adding them later is a small step) | Ticket 17 |
| Operators | `docs/guides/jobs.md` for `POST /api/jobs/heads-ups`, the Workspace Limits and the pair table's retention | Ticket 13 |
| Contributors | A module header naming its glossary term and a one-line doc comment on every export (AGENTS.md rule 7); `GLOSSARY.md` for Takeaway and Heads-up | Every ticket |
| Releases | A changeset in `.changeset/` for everything people notice | Every ticket |

**Written for non-analysts, and tested that way:** the user guide and `reading-a-takeaway.md` use no word that the forbidden-word test lists; ticket 17's trial includes reading them. `methods.md` may use the technical names, and says them in plain words first.

## Implementation Decisions

- **Where.** Methods in `packages/core/src/methods/` (one file per Method, pure), wording in `packages/core/src/takeaways/` (pure, keyed by case and language), operations that take an Actor first in `packages/core/src/analyze.ts` (`runAnalysis(actor, …)`, `listHeadsUps(actor)`), jobs under `/api/jobs/` (`POST /api/jobs/heads-ups`, called hourly, like Workflows; spec docs in `docs/guides/jobs.md`). UI, API and MCP call only the core.
- **Basis choice (rule 2)** is a function of the two series and nothing else (`basisFor`), so a Metric's page, Drivers, a Heads-up and a Recipe agree, and it is tested with generated trending, flat and seasonal series.
- **Drivers is fixed first** (ticket 1): it uses `basisFor` and says which basis; the old level-based ranking is kept as a choice under **Show the numbers** only. A widget that stored its result is recomputed, not migrated.
- **Limits** (Workspace Limits style, spec 0029): the series length used is the latest 120 periods; at most 6 drivers; a what-if chain of at most 2 steps and 12 Metrics; a Heads-up scan of at most 200 Metrics and 20,000 pairs; an Analysis answers within a time budget and says so if it did not finish ("too much to compare at once; pick fewer Metrics"). The budgets are set from a measurement in the ticket, and a security review checks them, as spec 0024's found one for recipes.
- **Untrusted input.** The Metrics, the goal value, the date and the change in a Recipe are validated on the server (shapes, sizes, ids, never built into a filter from strings). A goal outside a sane range (more than 1,000 times the Metric's largest value) is refused.
- **Pair table** is a new table with the usual Workspace row-level policies, written only by the job and read only through the core; a migration, add-only. Kept for 90 days.
- **No model is trained on anything and no data leaves Ziffr.** Everything runs in the core, deterministic: the same series give the same Takeaway on every machine. A Heads-up's wording may be rewritten by an assistant over MCP; Ziffr itself never sends a number to a language model for this.
- **Documentation.** A new chapter in `docs/user-guide/13-analyze.md` (the Recipes and Takeaways), a guide `docs/guides/reading-a-takeaway.md` for people (what the four strength words mean, what the footer means, what "held the same" means), the Calculation Catalogue rows and the analysis-recipes guide for the new format.

## Testing Decisions

- **Methods:** a reference per Method in `test/reference/`, checked itself by hand-worked cases; generated inputs (fast-check) including flat series, perfectly collinear drivers, one far-off value, the same value everywhere, n at the minimum and one below it, trending and seasonal series; equality as above. 100 % coverage of each path, and the mutation check from `calculation-tests.md`.
- **Against the outside world:** fixtures from R and SciPy for `fit`, `spearman`, `partialCorrelation`, `holtWinters` and the distributions' quantiles, produced by committed scripts, run offline; a test fails if a fixture was not produced by its script's current version.
- **Takeaways:** a table of cases per sentence (each strength word at each threshold, each refusal, "outside what was seen", "cannot tell them apart", the footer), per language that exists; a test that **no Takeaway in any language contains** a word from a forbidden list ("cause", "because", "significant", "p-value", "regression", "R²", "coefficient", "confidence"), and a test that a number in the sentence equals the Method's number to the Metric's decimals.
- **Basis choice:** two Metrics with a shared trend and nothing else (a spurious pair) must come out "can't tell from chance" and not "strong".
- **Heads-ups:** a simulation with 150 Metrics of independent noise and trends must produce zero "moving together" Heads-ups in at least 99 of 100 runs (the false-discovery check), and a planted lagged pair must be found. A visibility test in the database suite: a person who sees A but not B is never given a Heads-up naming B, nor one that changes when B changes, and a Metric hidden after a Heads-up is gone from the list.
- **Same-number test** (spec 0024's): an Takeaway's number is the same on a widget, a Snapshot, a View Link and in the deck export.
- **Marks:** the comparison test of spec 0024 for each new mark with Sample Data; treemap areas proportional to values; radar spokes in the order given.
- **Suitability:** each check has hand-made data that fails it by one step and passes it by one step (n at the minimum and one below; 20 % gaps and one more; a far-off value that changes the result and one that does not; a straight line and a plain curve; a relation that flips between halves; a level shift; seasonality that stops repeating; growing spread; the five Methods' refusals in words). A generated test checks the invariants: a refusal never carries a number; a result with a caution is never labelled strong; the same series gives the same verdict twice; and removing nothing from the input removes nothing from the output (no silent clean-up). A simulation checks that the checks are not too eager: 1,000 well-behaved simulated series (straight line, normal noise, no gaps) get no caution in at least 95 % of runs and no refusal above their minimum.
- **Picker:** a table of canvas states against the list it shows (one Metric, two, a weekly and a monthly, a Metric with 7 months, one with Aggregation none, a Metric the person may not see): each Method is listed, greyed with its reason, or absent exactly as the table says; a Method picked by hand and the Recipe that uses it give the same Takeaway on the same input (they are one implementation); and no Method reachable through the picker can skip a Takeaway rule (a test lists every registered Method and runs it through the Takeaway layer on the hostile inputs of the Methods' tests). A Metric the person may not see is never offered in a Slot.
- **Trial by non-analysts:** before the Recipes are released, five people who have not studied statistics are given each Recipe and the Takeaway, and asked to say in their own words what it means and what they would do. Anything misread by two of five is reworded. The results are kept in `docs/reviews/`.

## Tickets

Each is one pull request; blocked-by in brackets.

1. **Basis choice and a fixed Drivers.** `changes`, `detrended`, `basisFor`; Drivers and the correlation matrix use it and say so; the level-based view under Show the numbers.
2. **Takeaway layer and suitability checks.** The word table, strength thresholds, ranges, footer, forbidden-word test, and the suitability checks of "When the data does not suit a Method" (one module that each Method calls, with the threshold table); **Show the numbers**. Glossary: Takeaway. [1]
3. **Library, part one.** `spearman`, `partialCorrelation`, `laggedCorrelation`, `quantile`, `usualRange`, `topShare`, `pareto`, `bridge`: references, fixtures, catalogue. [1]
4. **Fit.** `fit`, `importance`, `predict`, `needs`, with the exact normal equations, the minimums and rules 6 to 8; the Recipe "What moves B?" and "What does B need?". [2, 3]
5. **What-if.** `whatIf`, the exact and estimated paths, the Recipe "What if A changes?". [4]
6. **Seasonal forecast and track record.** `holtWinters`, `backtest`, `reachChance`; the Recipe "Will we reach the Target?"; Forecast widgets choose between Holt and Holt-Winters. [2]
7. **Before and after, change point.** `afterDate`, `changePoint`; the Recipe "Did it work?". [2, 3]
8. **Analysis Recipe format `/2`.** Table and model outputs, the checks, the guide, Playground. [4]
9. **Marks, part one.** `range` and `bridge`; used by the Recipes' charts. [4, 8]
10. **Marks, part two.** `polar` and `radar`. [8]
11. **Driver tree** (`tree` mark from Derived Metrics). [8, 9]
12. **Breakdown with parents**, the `tree` mark from it, the upload, API and paste support. Migration. [11]
13. **Pair table and the Heads-up job.** Pair table, the "moving together" and "stopped moving together" kinds, the visibility tests, the simulation. Glossary: Heads-up. [1, 3]
14. **Heads-ups in the app and by message.** The list under Analyze, Not useful, Mute, the profile switch, delivery by Delivery Preference with the weekly cap. [13]
15. **More Heads-up kinds.** Change of direction, Target out of reach, unusual for the season. [6, 7, 13]
16. **The method picker.** **Choose a method** on the Analysis Canvas: the list by want, the fit to the canvas and the greyed-out reasons, Slots and settings asked in words, the **Use it when** and **Don't use it when** text per Method, saving as a widget and **Export as Pack**. Every Method that exists at the time is listed; later ones appear by registering. [4, 6, 7, 8]
17. **Trial by non-analysts, documents and release note.** The review (now also of the picker: can five people tell which Method to pick from its description, and do they pick a different one than the Recipe would?), the user guide chapter, `reading-a-takeaway.md`, the changeset. [all]

## Out of Scope

- Methods that cannot be said in a sentence without being wrong: clustering, principal components, causal discovery, neural nets. Third parties can offer some as Extensions (spec 0042).
- Anything that sends numbers to a language model. An assistant over MCP may read an Takeaway and explain it; Ziffr does not.
- Letting a person run a Method with the Takeaway rules turned off, or writing their own Method in the picker. Both are out: the first would undo the point of this spec, the second is an Extension (spec 0042).
- Saved what-ifs and shared scenarios, and a Driver Map that a person draws and confirms (A influences B), which would let a what-if rest on stated knowledge and not on fitted ones. A good follow-up.
- Causal claims of any kind.
- Heat maps, Sankey, network and map marks.

## Decisions

The owner accepted every recommendation on 2026-11-22 and added the method picker (ticket 16). The recommendation of each point is what is decided.

1. **Heads-ups by default.** Recommended: shown in the app to everyone with a visible pair, delivered by message only to those who switch it on, and at most 3 a week. The stronger option, delivered to Metric owners by default, raises Ziffr's usefulness and its chance to annoy; it should wait until the false-discovery rate has been seen on real Workspaces.
2. **The Method that the Takeaway picks.** Recommended: rule-based (smaller typical miss on the last third). A search across many Methods overfits small series and is hard to explain in a sentence.
3. **Hierarchy source.** Recommended: driver tree first (no new data), Breakdown parents second. If the second is not wanted, a treemap of a flat Breakdown still works.
4. **Strength thresholds.** Recommended: the values written in the Takeaway layer's table in ticket 2, reviewed with two analysts and tuned by the review of ticket 16. A wrong threshold teaches people to ignore Takeaways.
5. **Languages.** Which languages the Takeaways are written in first (`answer-languages.md` is about reading replies, not writing text, so this is a new list to settle). Recommended: the product's own languages, with the wording table ready for more.
