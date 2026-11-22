# Methods

A **Method** is one calculation in Ziffr's library, such as a correlation or a forecast (spec 0041). People see Analyses, Recipes and Takeaways; this page is for analysts and contributors who want to know exactly what a Method does, when to trust it and how it is checked. The picker on the Analysis Canvas and the [Calculation Catalogue](../reference/calculations.md) read the same facts, so they cannot disagree with this page.

Every Method runs the [suitability checks](#the-suitability-checks) on the series it is given, every time. It gives a number, a number with a plain line above it (a caution), a different Method chosen by a written rule, or a refusal in words. It never gives a quiet number, and it never removes, smooths or fills in a value.

## The entry format

Every Method has an entry in this file with these parts, in this order. A Method's pull request adds its entry.

| Part | What it says |
| --- | --- |
| **What it answers** | The question, in the words a person would ask it. |
| **How it is worked out** | One paragraph: the steps, what is exact and what is not. |
| **Use it when** | The situations it suits. The picker shows this text. |
| **Don't use it when** | The situations it does not suit, and what Ziffr does about each (refuse, caution, use another Method). |
| **Minimums and checks** | How many periods it needs, and which suitability checks apply to it. |
| **Worked example** | A small example with real numbers that you can redo by hand. |
| **Reference** | The independent calculation and the outside tool it is held to, and the tolerance. |

## Correlation

Function: `correlate` in `packages/core/src/correlation.ts`; its Takeaway is `correlationTakeaway` in `packages/core/src/takeaways/takeaway.ts`.

**What it answers.** Do these two Metrics move together?

**How it is worked out.** Both Metrics are put on their Common Period (the shorter one combined by its Aggregation) and only complete periods count. Where both series have a clear trend (a straight line through each explains more than half of its variance), each is turned into its change from the period before ("growth removed"); otherwise the values are used. Pearson's r is then worked out on exact fractions of the values' text: r² = Sxy² ÷ (Sxx · Syy), and r is the square root of the nearest double of r², with the sign of Sxy. The strength word comes from |r| and the number of pairs (see [Reading a Takeaway](reading-a-takeaway.md)).

**Use it when.** You want to know whether two Metrics have gone up and down together over a stretch of time, and a straight-line link is a fair picture.

**Don't use it when.**

- The Metrics have hardly changed, or have too few different values: Ziffr refuses and says which.
- Many periods have no value: more than a fifth of the window, or three in a row, is a refusal; fewer is a caution that names how many were left out.
- A few periods are far from the rest and pull the result: Ziffr gives the result and says what it reads without them.
- The link bends (a curve): Ziffr cautions that a straight-line reading is rough.
- The link was different in the first half of the history: Ziffr cautions and says what the latest half reads.
- One is calculated from the other: they are never compared.

**Minimums and checks.** At least 6 pairs of periods (one fewer than the periods when compared by change). Checks that apply: enough periods, enough that vary, gaps, far-off values, skew and ties, changing relationship.

**Worked example.** Revenue (100, 104, 103, 110, 108, 115, 119, 121) and Visits (50, 53, 50, 56, 57, 60, 63, 62), one value a month from January 2025. Both grow in a nearly straight line (a line explains 94 % and 89 % of their variance), so they are compared by change. Revenue's changes are 4, −1, 7, −2, 7, 4, 2 and Visits' are 3, −3, 6, 1, 3, 3, −1: 7 pairs. Then n · Sxy = 350, n · Sxx = 532 and n · Syy = 374, so r² = 350² ÷ (532 · 374) = 4375/7106 and r = 0.78. With 7 pairs, atanh(0.78) · √4 = 2.11 is above 1.96, so the link clears chance, and 0.78 is above 0.7: **strong**. Ziffr says "Revenue and Visits tend to move together over 7 months (strong)." and, under Show the numbers, r = 0.78, 7 pairs of periods, "compared by change, growth removed".

**Reference.** `referencePearson` in `packages/core/src/test/reference/analyses.ts` and `referenceBasis` in `basis.ts` work the same answer out another way. r equals the reference exactly up to the final square root. The basis choice is checked against NumPy and SciPy (`fixtures/basis.py`), the strength thresholds and the chance rule against the normal curve's 97.5 % point from SciPy (`fixtures/suitability.py`).

## Drivers

Function: `rankCorrelations` in `packages/core/src/correlation.ts`; its Takeaway is `driversTakeaway`.

**What it answers.** Which other Metrics move most with this one?

**How it is worked out.** Each other Metric you may see is correlated with the target as above, on its own basis, and the Metrics are ranked by |r|. The Takeaway names up to three whose strength is above "can't tell from chance", and gives each Metric its own strength word and cautions. A Metric whose own checks refuse is listed with the reason and no number.

**Use it when.** You have a Metric you care about and want a short list of where to look first.

**Don't use it when.** You want to know what would happen if one Metric changed, or what drives what: Drivers only shows what has gone together. It is a ranking of pairs, so with many Metrics some will look related by chance; the Takeaway says "can't tell from chance" where the data cannot rule that out.

**Minimums and checks.** As for Correlation, for each pair.

**Worked example.** The demo Workspace, Revenue against four other Metrics over 24 months, compared by change (23 pairs). The ranking is Orders r = 0.95, Operating cost 0.88, Active customers 0.87 and Churn rate 0.75, all strong. Ziffr says "Over 23 months, Orders, Operating cost and Active customers moved with Revenue the most." with one footer line; Churn rate is in the list with its own strength word.

**Reference.** As for Correlation.

## Seasonal forecast (Holt-Winters)

Functions: `holtWinters`, `fitHoltWinters` in `packages/core/src/methods/holt-winters.ts`; the choice is `chooseMethod` and `bestForecast`; its Takeaway is `forecastTakeaway` in `packages/core/src/takeaways/forecast.ts`.

**What it answers.** Where is this Metric heading, with its yearly (for daily Metrics, weekly) pattern?

**How it is worked out.** Holt-Winters, additive, as Hyndman and Athanasopoulos write it (section 8.3): a level, a trend and a pattern, each updated after every value from what the last prediction missed by. The smoothing is fixed (level 1/2, trend 1/10, pattern 3/10), not fitted: with two seasons to learn from a fit would learn the noise, and the same series always gives the same numbers. It starts from the first two seasons (their means give the level and trend, the first season's distance to its straight line gives the pattern), so a series that is exactly a line plus a repeating pattern is recovered with no miss. Everything is exact on the values' text except the square root of the spread. The spread h periods ahead is the root of the mean squared one-step miss times 1 + Σ c(i)², with c(i) = α(1 + iβ), plus γ where i is a whole number of seasons. "Likely between" is the value plus and minus 1.2816 spreads (an 80 % range). A period without a value is not filled in: the level moves on by the trend and no miss is counted. Known limitation: the one-step spread includes the misses of the second season, on which the start was also built, so for a series of little more than two seasons it is a little small (the simulation holds an 80 % range to 77 to 84 % at 24 values). The track record shows how the range held. The plain trend's spread h periods ahead is its own model's, the one-step spread times √(1 + Σ α²(1 + jβ)²), not √h.

**Which Method is used.** Holt-Winters only with two full seasons, and only if on the last third of the series its typical miss is smaller than the plain trend's on the same periods (and at least 3 periods can be compared); otherwise the plain trend (Holt), and the Takeaway says why. A pattern that did not repeat between the first and second half rules it out. This is a written rule, not a search.

**Use it when.** The Metric has a pattern that repeats every year (every week for days) and at least two seasons of values.

**Don't use it when.** There are fewer than two seasons, or a gap in the first two (the plain trend is used and says so); the pattern changes from year to year (the plain trend is used); the level jumped (the checks caution). A forecast can be wrong in ways its range does not show: the track record says how often the range held on the past.

**Minimums and checks.** Two seasons (24 months, 8 quarters, 14 days, 104 weeks); to be chosen over the plain trend, 3 more periods. Checks: enough periods, enough that vary, gaps, far-off values (the forecast without them is run again), seasonality that does not repeat.

**Worked example.** Two values per season, 10, 20, 12, 24, 14, 28. Means 15 and 18, trend starts at 1.5, level at 15.75, pattern −4.25 and +4.25. The misses are −1, 1.55, −1.9525 and 2.328875; the level ends at 22.1205625, the trend at 1.54631875, the pattern at −5.13575 and 5.4136625. One ahead is 22.1205625 + 1.54631875 − 5.13575 = 18.53113125. The spread is √(12.638415015625 ÷ 4) = 1.7777; two ahead it is √(4.1153838894628906) because 1 + 0.55² = 1.3025.

**Reference.** `referenceSeasonal` in `test/reference/forecast.ts` runs the error-correction form (level += α·miss) where the code uses the component form; the spread factor is worked out by running one shock through the recurrences. Python's fractions (`fixtures/forecast.py`) are a third way, NumPy's floats a fourth. Equal exactly (the nearest double), NumPy to 1e-9. A simulation checks that the 80 % range one period ahead holds for 74 to 86 % of 600 simulated series (measured 81 % and 84 %).

## Track record

Function: `backtest`. **What it answers.** How often would this forecast have been right on the periods we already know? Each of the last 12 periods is forecast from the values before it only, one period ahead; the answer is how many fell inside that one-period-ahead 80 % range ("the range for the next month would have held 10 of 12 times") and the typical miss (the mean size of the misses, exact). **Use it when** you want to know how far to trust a forecast. **Don't use it when** you take it for a promise: a forecast cannot be proven by a test, and the past is not the future. **Minimums.** Holt needs 4 values before the first period tested, Holt-Winters two seasons; only values whose period before has a value count. **Reference.** The reference forecasts every prefix again from scratch; the code does it in one pass; they agree exactly.

## Reach chance

Function: `reachChance`. **What it answers.** How likely is the forecast to land where the Target wants it? The share of a normal curve around the forecast value, with its spread, between the Target's two ends (at least the lower end where higher is better, at most the upper where lower is better, both for closer to target). Shown in tenths ("about 7 in 10"), "under 1 in 20" below 5 % and "at least 19 in 20" from 95 %. **Don't use it when** you read it as the chance the Metric really gets there: it is as good as the track record says. A past that fitted with no miss at all gives exactly 1 or 0, and the Takeaway says the chance may be too sure. **Reference.** SciPy's `norm.cdf` and a 150-digit series, to a relative 1e-9.

## Multiple fit (What moves B?)

Functions: `fit`, `fitNumbers`, `fitBasis` and `importance` in `packages/core/src/methods/fit.ts`; the t quantile is `tQuantile` in `packages/core/src/methods/distributions.ts`; the Takeaway is `movesTakeaway` and the Recipe `whatMoves` in `packages/core/src/takeaways/fit-takeaway.ts`.

**What it answers.** Which of several Metrics have gone with B, with the others held the same, and how much of what moved does each account for?

**How it is worked out.** B and its drivers (1 to 6 other Metrics) are put on their Common Period. Where B and at least one driver have a clear trend, each is turned into its change from the period before ("growth removed"); otherwise the values are used. At most the latest 120 periods that all of them have are used, and a period any of them lacks is a gap that is counted and said, never filled. A straight line through all of them is fitted by least squares: the normal equations (sums about the means, their inverse, the effects, the sum of squared misses) are worked out on fractions of the values' text, so they are exact, and only the last step to a double, a square root and the t quantile are not. Each driver's effect is its change in B per one unit of the driver with the other drivers held the same, and its range is the effect plus and minus t times its standard error, t being the 90 % point of the t curve with n − k − 1 degrees of freedom: that is the 80 % range, called "likely between". Each driver's share of what the line explains is found by averaging, over every order in which the drivers can join, how much the explained share rises when that driver joins (LMG); the shares add up to exactly 1. The strength word is read from the driver's partial correlation (its link to B with the others held fixed) over n − k + 1 periods. Effects are said per a power of ten at or below the driver's own spread ("per 1,000 Visits").

**Use it when.** Several Metrics may move B together and you want to know which matter most and by how much, with the others taken into account.

**Don't use it when.**

- You want to know what causes B: a fit only shows what has gone together, and the footer says so.
- The history is short: a fit with k drivers needs 8 + 4k periods and at most one driver per 6 periods (and 6): Ziffr refuses and says how many it has and needs.
- Two drivers move so closely that the line cannot tell them apart (variance inflation above 5, or exactly in step): Ziffr treats them as one, leaves out the one with the weaker link to B, and says so. Three or more that are exactly one refuse, naming them.
- More drivers than the history can carry: Ziffr refuses and says how many can be weighed. The first pass that would choose among them by partial correlation is not built yet.
- The link bends, the misses grow with the level, a few periods are far from the rest, the values are very uneven, or the link was different in the first half of the history: Ziffr gives the answer with a plain line above it, the effect without the far-off periods quoted, and never calls it strong.
- A Metric has Aggregation none beside another period, or one is calculated from another: a refusal naming them.

**Minimums and checks.** 8 + 4 per driver periods. Checks that apply: enough periods, enough that vary, gaps, mixed periods, far-off values, skew and ties (a caution), not a straight line, changing relationship, spread that grows, too many Metrics.

**Worked example.** Twelve months, the Metric B = 2·x + (−1)^x for x = 1 to 12 and one driver x. With n = 12, Sxx = 143 and Sxy = 292, the effect is 292/143 = 2.04, the intercept 13 − 6.5 · 292/143 = −3/11, the sum of squared misses 608 − 292²/143 = 1680/143, and 5329/5434 = 98.1 % of what moved is explained. The typical miss is √(1680/1430) = 1.08, and with 10 degrees of freedom t = 1.372, so the effect is likely between 1.92 and 2.17 per unit.

**Reference.** `packages/core/src/test/reference/fit.ts` works the same answer out another way: the design has a column of ones and no centring, the normal equations are solved by Cramer's rule with every determinant by Laplace expansion, the sum of squared misses is the sum of the squared residuals, every driver's LMG share is the mean over all k! orders, and the variance inflation and the partial link come from fits of their own. Effects, intercept, explained share, shares, inflation and partial links equal the exact fractions' nearest double (the partial link and the typical miss up to their final root); ranges agree to a relative 1e-9 with the reference's t quantile, which integrates the curve's density numerically. NumPy and SciPy fixtures (`fixtures/fit.py`, a test fails when the fixture is not from the script's current text) hold Anscombe's four data sets (intercept 3.0, effect 0.5, 66.7 % explained), a Longley-style set whose GNP and Population are nearly one Metric, an exact relation, and random sets with 1 to 6 drivers, to a relative 1e-9; the t quantile equals SciPy's `t.ppf` for 240 pairs of degrees of freedom and share. An exact linear relation gives its effects back exactly with a range of no width. A simulation of 800 series checks that the 80 % ranges hold the true effect and a new period's value about 80 % of the time.

## Importance

Function: `importance` in `packages/core/src/methods/fit.ts`.

**What it answers.** Which drivers account for most of what moved B?

**How it is worked out.** As the fit above, returning only each driver's share (LMG) and how much the drivers explain together. The explained share of every subset of the drivers is worked out exactly; a driver's share is the mean, over every order of adding the drivers, of the rise when it joins; the shares are divided by what is explained, so they add up to 1. For two drivers with explained shares a, b and a + b together (ab): the first's share is (a + (ab − b)) ÷ 2.

**Use it when.** You want a ranking of drivers that does not depend on the order they are listed in.

**Don't use it when.** As the fit; the shares are of what the line explains, not of B.

**Minimums and checks.** As the fit.

**Worked example.** One driver alone explains 50 % of B, another alone 30 %, and together 70 %. The first's LMG is (0.5 + (0.7 − 0.3)) ÷ 2 = 0.45 and the second's (0.3 + (0.7 − 0.5)) ÷ 2 = 0.25; together 0.70, so the shares of what is explained are 9/14 (64 %) and 5/14 (36 %).

**Reference.** As the fit: the reference averages over all k! orders by listing them. A test checks the two-driver formula above on generated data.

## Predict

Function: `predict` in `packages/core/src/methods/fit.ts`; the Takeaway is `predictTakeaway`.

**What it answers.** What is B likely to be if the drivers are these values?

**How it is worked out.** The fit is worked out again exactly from its periods, then ŷ = ȳ + Σ b·(x − x̄) at the values given, exact. The 80 % range is for a single period, ŷ plus and minus t·σ·√(1 + h), with h = 1/n + (x − x̄)ᵀ·Sxx⁻¹·(x − x̄) the leverage of the values: it widens away from what the drivers have been. Where the fit compared changes, a driver value counts from its latest level and B from its latest level. A value outside what its driver has been gets no range, only the point, and the Takeaway says "treat it as a guess".

**Use it when.** You want to read B off the line for values inside what the drivers have been.

**Don't use it when.**

- The values are outside what the drivers have been: the point is a guess and is said to be one.
- The link looks curved: a straight-line reading is rough, and outside what was seen Ziffr refuses.
- The values are not numbers, or the model is not one `fit` made: a refusal in words.

**Minimums and checks.** As the fit; the lines of its checks that still hold for a value (gaps, a curve, spread that grows) are carried to the answer.

**Worked example.** With the fit above (x from 1 to 12), x = 11 gives −3/11 + 11 · 292/143 = 22.19, and h = 1/12 + 4.5²/143 = 0.225, so the range is 22.19 plus and minus 1.372 · √(1680/1430 · 1.225) = 1.65: likely between 20.54 and 23.83. x = 13 is above the 12 seen: 26.27 as a point, no range.

**Reference.** `referenceValue` and `referenceBandSquared` in `test/reference/fit.ts` take h from the cofactor inverse of the uncentred normal matrix with the intercept in the design; the value equals the nearest double of the exact fraction and the range agrees to a relative 1e-9 with the reference's t. SciPy fixtures hold a value and its range for each data set.

## Needs (What does B need?)

Function: `needs` in `packages/core/src/methods/fit.ts`; the Takeaway is `needsTakeaway` and the Recipe `whatNeeds`.

**What it answers.** B has to reach a goal: what would one driver need to be, with the others at their latest values?

**How it is worked out.** `predict` turned round for one driver: the value that gives the goal is exact, x̄ⱼ + (goal − ȳ − Σ of the others' b·(x − x̄)) ÷ bⱼ. Its range is the set of driver values whose range for a single period holds the goal; that is a quadratic in the driver value, bounded only where the driver's effect is clear (bⱼ² above t²σ²·(Sxx⁻¹)ⱼⱼ). Where it is not clear, or the value is outside what the driver has been, only the point is given and the Takeaway says "treat it as a guess". A goal more than 1,000 times the largest value B has had is not worked out. `predict` at the answer gives the goal.

**Use it when.** You have a goal for B and want to know what to work on, and the driver's effect has been clear.

**Don't use it when.**

- The effect cannot be told from chance, or is exactly 0: only a point, or a refusal ("has not moved with it at all").
- The value is higher or lower than the driver has ever been: the point is a guess, and with a curved link Ziffr refuses.
- You expect the other drivers to change: they are held at their latest values unless you give others.

**Minimums and checks.** As the fit.

**Worked example.** With the fit above, B = 20 needs x = (20 + 3/11) · 143/292 = 9.93, likely between 9.15 and 10.73, inside the 1 to 12 seen. B = 30 would need x = 14.8, above the 12 seen: the point only, "treat it as a guess".

**Reference.** `referenceNeedsRange` finds the ends of the range by halving the band's edge on fractions, from the answer outwards, which shares no step with the quadratic; the ends agree to a relative 1e-9 of the range's size. SciPy's `brentq` on the band's edge gives the fixtures' ends to 1e-7. Generated goals check that `predict` at the answer gives the goal, and an exact relation gives a driver value back exactly.

## The suitability checks

Every Method calls `checkSuitability(method, inputs)` in `packages/core/src/suitability.ts`. The thresholds are one table, `SUITABILITY`, tested one step either side. The checks, in the order they are run; a refusal ends the run, since thin data cannot be judged further:

| Check | Fails when | Result |
| --- | --- | --- |
| Enough periods | fewer than the Method's minimum (fit 8 + 4 per driver, seasonal forecast two full seasons, lag 12, correlation 6, before a date 6, change point 8, usual range 8) | Refusal with how many it has and needs |
| Enough that vary | a series has fewer than 4 different values, or fewer than half its steps change | Refusal |
| Gaps | more than 1/5 of the window has no value, or 3 periods in a row | Refusal; fewer is a caution. Gaps are never filled in. |
| Mixed units or periods | a Metric with Aggregation none beside another period; an input built from another input | Refusal naming them |
| Far-off values | a value is more than 4 median absolute deviations from the median, and leaving out the 1 to 3 most extreme moves the result by more than 1/5 of its range or flips its sign | Caution with the result without them; nothing is removed |
| Skew and ties | skewness above 2, or more than half the values repeat | Ranks instead of values where the Method can, else a caution |
| Not a straight line | the misses, ordered by the fitted value, change sign too rarely (runs test at 5 %) | Caution |
| Changing relationship | the link in the first and last half differs: a flip, or a drop below half | Caution naming the latest half |
| Level shifts | a step in level of 3 typical misses or more | The data after it where the Method can and its minimum remains, else a caution |
| Seasonality that does not repeat | the yearly patterns of the two halves differ by more than half of their size | A plain trend where the Method can, else a caution |
| Spread that grows | rank correlation of level and size of miss above 1/2 | Ranges as a share of the level where positive, else a caution |
| Too many Metrics for the history | more than one driver per 6 periods, or 6 | A first pass where the Method has one, else a refusal |

A Method says which other Methods it can switch to (`canSwitchTo`); where it cannot, the check is a caution (or, for too many drivers, a refusal). A result with a caution is never shown as strong. Not yet used by a Method in the library: rank correlation, the seasonal and the changing-level Methods; the checks are ready for them and tested on their own.

**Reference.** `packages/core/src/test/reference/suitability.ts` works each check out another way: medians and deviations by sorting, skewness from central moments, the runs test by listing every arrangement of the signs, Spearman's r from counted ranks, the step in level from the normal equations by Cramer's rule, the yearly pattern and gaps by walking the series. SciPy and NumPy fixtures (`fixtures/suitability.py`, a test fails when the fixture is not from the script's current text) hold skewness, median and deviation, Spearman's r, the runs tail and the step fit to 1e-9; the decisions themselves are exact. A simulation of 1,000 straight lines with normal noise and no gaps checks that the checks are not too eager.
