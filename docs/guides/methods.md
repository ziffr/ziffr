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

A Method says which other Methods it can switch to (`canSwitchTo`); where it cannot, the check is a caution (or, for too many drivers, a refusal). A result with a caution is never shown as strong. Not yet used by a Method in the library: rank correlation, the multiple fit, the seasonal and the changing-level Methods; the checks are ready for them and tested on their own.

**Reference.** `packages/core/src/test/reference/suitability.ts` works each check out another way: medians and deviations by sorting, skewness from central moments, the runs test by listing every arrangement of the signs, Spearman's r from counted ranks, the step in level from the normal equations by Cramer's rule, the yearly pattern and gaps by walking the series. SciPy and NumPy fixtures (`fixtures/suitability.py`, a test fails when the fixture is not from the script's current text) hold skewness, median and deviation, Spearman's r, the runs tail and the step fit to 1e-9; the decisions themselves are exact. A simulation of 1,000 straight lines with normal noise and no gaps checks that the checks are not too eager.
