# Methods

A **Method** is one calculation in Ziffr's library, such as a correlation or a forecast (spec 0041). People see Analyses, Recipes and Takeaways; this page is for analysts and contributors who want to know exactly what a Method does, when to trust it and how it is checked. The picker on the Analysis Canvas and the [Calculation Catalogue](../reference/calculations.md) read the same facts, so they cannot disagree with this page.

Every Method runs the [suitability checks](#the-suitability-checks) on the series it is given, every time. It gives a number, a number with a plain line above it (a caution), a different Method chosen by a written rule, or a refusal in words. It never gives a quiet number, and it never removes, smooths or fills in a value.

The footer "This shows what has gone together, not what caused what." is on the Takeaways about two Metrics together (correlation, rank, partial and lagged correlation, Drivers). The usual range, share, Pareto and bridge say nothing about what goes together and carry none.

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

## Rank correlation

Function: `spearman` in `packages/core/src/methods/spearman.ts`; its Takeaway is `spearmanTakeaway`.

**What it answers.** Do these two Metrics rise and fall together, by the order of their values rather than their size?

**How it is worked out.** Each series is turned into ranks (the smallest value is rank 1; values that tie share the mean of the ranks they cover), and Pearson's r is worked out on the ranks. The sums of products about the means are exact fractions of the ranks (held as twice the rank, so they stay whole numbers), so r² = Sxy² ÷ (Sxx · Syy) is exact and r is the square root of the double nearest to it, with the sign of Sxy. This is the same code the suitability checks use for "spread that grows" (`rankAssociation`), so there is one implementation. A rank correlation scatters a little more than Pearson's r when there is no link (a variance of 1.06 ÷ (n − 3) against 1 ÷ (n − 3), Fieller, Hartley and Pearson), so the Takeaway reads the "can't tell from chance" rule on 3 + (n − 3) ÷ 1.06 pairs.

**Use it when.** The values are skewed or have a few very large ones, many values repeat, or the link is a steady rise or fall that is not a straight line. It is the Method the checks switch to for skewed values.

**Don't use it when.**

- You want to know how much one changes when the other does (it only knows the order, not the size).
- Many values repeat in both series, so most ranks tie: it still gives a number, but the checks caution about ties.
- The series have hardly changed, too many periods have no value, or a link changed between the halves of the history: refusal or caution as for Correlation.

**Minimums and checks.** At least 6 pairs of periods. Checks that apply: enough periods, enough that vary, gaps, far-off values, changing relationship. Skew and ties do not apply: ranks are not pulled by them.

**Worked example.** Six months of Visits 1, 2, 3, 4, 5, 6 and Revenue 2, 1, 4, 3, 6, 5. The ranks are the values, and every rank differs from its partner by 1, so ρ = 1 − 6 · 6 ÷ (6 · 35) = 29/35 = 0.83. With 6 pairs the rule reads 3 + 3 ÷ 1.06 = 5.83 pairs, and atanh(0.83) · √2.83 = 1.99 is just above 1.96, so the link clears chance, and 0.83 is above 0.7: Ziffr says "Visits and Revenue tend to move together over 6 months (strong)." Under Show the numbers: rank correlation 0.83, 6 pairs of periods, "compared by rank of value". Six pairs is the least it works with.

**Reference.** `referenceSpearman` in `packages/core/src/test/reference/suitability.ts` counts the ranks by comparing every value with every other and works out r² on the ranks as the textbook says. r equals it exactly up to the final square root. SciPy's `spearmanr` (`fixtures/methods.py`: Anscombe's three sets, ties, perfect and reversed curves, a far-off value) agrees to a relative 1e-9.

## Partial correlation

Function: `partialCorrelation` in `packages/core/src/methods/partial-correlation.ts`; its Takeaway is `partialTakeaway`.

**What it answers.** Do these two Metrics still move together once one to four other Metrics are held the same?

**How it is worked out.** What is left of each Metric after the straight-line share of the others is taken out is compared. With S the sums of products about the means, what is left between x and y is S_xy·C = S_xy − S_xC · S_CC⁻¹ · S_Cy, where S_CC⁻¹ is found by Gauss-Jordan elimination on exact fractions. Then r² = S_ab·C² ÷ (S_aa·C · S_bb·C), with the sign of S_ab·C, and r is the root of the double nearest to r². If the Metrics held the same are a mix of each other, there is no inverse and Ziffr says they cannot be told apart. If one Metric is explained completely by them, nothing is left to compare and Ziffr says so.

**Use it when.** Two Metrics look related and you suspect a third explains both ("Visits and Revenue move together, but do they still, with Price held the same?").

**Don't use it when.**

- You want to know what causes what: it shows what is left to go together, not why.
- The Metrics held the same move so closely together that they cannot be told apart: refusal.
- You have more Metrics than the history can carry (one per 6 periods, at most 6 including the pair): refusal.

**Minimums and checks.** As a fit of the Metrics weighed: 8 + 4 periods for each of the two and the Metrics held (16 for one held the same, 20 for two, 24 for three, 28 for four, and 30 for four because at most one Metric per 6 periods is weighed). Checks that apply: enough periods, enough that vary, gaps, far-off values, too many Metrics. The chance rule is read on the pairs less the Metrics held the same.

**Worked example.** Eight months, z = 1 to 8, a = 2, 1, 4, 3, 6, 5, 8, 7 and b = 1, 3, 2, 5, 4, 7, 6, 8. About their means (4.5): Sab = 29, Saa = Sbb = Szz = 42, Sza = 38, Szb = 39. The part left of a and b after z is S_ab·z = 29 − 38 · 39 ÷ 42 = −264/42, S_aa·z = 42 − 38² ÷ 42 = 320/42, S_bb·z = 42 − 39² ÷ 42 = 243/42. r² = 264² ÷ (320 · 243) = 121/135 and r = −0.95: with z held the same, a and b move in opposite directions. (Eight months is under Ziffr's minimum of 16 for a Takeaway; the arithmetic is the same.)

**Reference.** `referencePartial` in `packages/core/src/test/reference/methods.ts` fits each Metric on the others by least squares (the normal equations solved by Cramer's rule) and takes Pearson's r of what is left: a different route to the same number. r equals it exactly up to the root, and so does which refusal it is. NumPy's least squares with SciPy's `pearsonr` (`fixtures/methods.py`, checked there against the textbook formula from the inverse of the matrix of correlations) agree to a relative 1e-9.

## Lagged correlation

Function: `laggedCorrelation` in `packages/core/src/methods/lagged-correlation.ts`; its Takeaway is `laggedTakeaway`.

**What it answers.** Does one Metric tend to move some periods before another? By how many?

**How it is worked out.** Only one direction is tried: the first Metric before the second (the Takeaway says "moves before", never "no delay between"). For each delay from 0 to 6 periods, the first Metric's value in a period is paired with the second's value that many periods later, and Pearson's r is worked out exactly on the pairs (a delay with fewer than 6 pairs is left out). The best delay has the largest |r| (the shorter delay on a tie). Because seven delays are tried, the best of them is likelier to look strong by chance than a single look: the Takeaway reads "can't tell from chance" at a higher bar for the number of delays tried (the normal curve's 1 − 0.025 ÷ tries point: 1.96 for one, 2.69 for seven), and says how many it looked at under Show the numbers.

**Use it when.** You think one Metric leads another ("do Support tickets rise before Churn does?").

**Don't use it when.**

- You have fewer than 12 periods: refusal.
- The Metrics trend: compare them by change (the basis the caller chooses), or the delay found is the delay of the trends.
- You want to say what causes what: a lead is not a cause. The Takeaway says "tends to move before".

**Minimums and checks.** 12 periods the two Metrics share. Checks that apply (all but the first on the pairs of the best delay): enough periods, enough that vary, gaps, far-off values (the best delay's r without them), skew and ties (a caution), changing relationship.

**Worked example.** Tickets 1, 3, 2, 5, 4, 8, 6, 9 and Churn 0, 1, 3, 2, 5, 4, 8, 6. At delay 0 (8 pairs): n · Sxy = 8 · 173 − 38 · 29 = 282, n · Sxx = 8 · 236 − 38² = 444, n · Syy = 8 · 155 − 29² = 399, so r² = 282² ÷ (444 · 399) and r = 0.67. At delay 1 the 7 pairs are the same numbers on both sides and r = 1: Tickets move one month before Churn does.

**Reference.** `referenceLagged` in `packages/core/src/test/reference/methods.ts` pairs by position in a list instead of by period and takes Pearson's r of each delay's pairs. r equals it exactly up to the root; SciPy's `pearsonr` on each shifted pair (`fixtures/methods.py`, including a perfect delay of 2) agrees to a relative 1e-9; the chance bars are SciPy's `norm.ppf`.

## Quantiles and the usual range

Functions: `quantile`, `usualRange`, `standing` in `packages/core/src/methods/quantiles.ts`; the Takeaway is `usualRangeTakeaway`.

**What it answers.** What is normal for this Metric? Is this value far from it?

**How it is worked out.** The p-quantile is the value at position (n − 1) · p among the n sorted values (counted from 0), or between the two values around it in proportion (Hyndman and Fan's type 7, the default of NumPy and R), worked out exactly on the values' text. The usual range is the middle 80 % of the Metric's own history: the 10th to the 90th percentile, with the median and the quartiles beside it. With a season (12 for months in a year) and a period, only the values at the same place in the season are used. A value is below, within or above the range.

**Use it when.** You want "usually between …" for a Metric, or to ask whether a value is outside what the Metric has been.

**Don't use it when.**

- The Metric has a trend or a step in level: its history is not one population. A step of 3 typical misses or more is found, and only the values since it are used when at least 8 remain (and Ziffr says so), else a caution.
- You want to judge a value by its season but have only two seasons: each place in the season then has two values, and the range is just those; the Takeaway says how many it rests on.

**Minimums and checks.** 8 periods. Checks that apply: enough periods, enough that vary, gaps, level shifts. Give the history without the value you ask about, so it does not judge itself.

**Worked example.** Eleven months of 1 to 11 (in any order): the 10th percentile is at position 1, the value 2; the quartiles are at 2.5 and 7.5, so 3.5 and 8.5; the median is 6; the 90th percentile is 10. Ziffr says "usually between 2 and 10"; a 12 is above that. By season it says "at this place in the season, going by 3 values".

**Reference.** `referenceQuantile` in `packages/core/src/test/reference/methods.ts` is the textbook form, (1 − g) · x[j] + g · x[j + 1] with positions counted from 1, on exact fractions: the result equals it exactly. NumPy's `quantile` and SciPy's `mquantiles` (`fixtures/methods.py`, which checks the two against each other) agree to a relative 1e-12.

## Share of the largest rows and Pareto

Functions: `topShare` and `pareto` in `packages/core/src/methods/concentration.ts`; the Takeaways are `topShareTakeaway` and `paretoTakeaway`.

**What it answers.** How much of the whole is in a few rows? How few rows make most of it?

**How it is worked out.** The rows are put in order, largest first (the order given on a tie), and the sums are worked out on the rows' text, exactly. The share is the double nearest to the exact part ÷ whole. A Pareto is the fewest rows whose share reaches the share asked for (80 % unless told); "reaches" is decided exactly, so rows that add up to exactly 80 % count. It is arithmetic, not an estimate, and the Takeaway says "worked out". Where a row of the same size as the last one named is left out, Ziffr says which of those rows is named is arbitrary (the count is not).

**Use it when.** The rows are the parts of one whole that adds up (a Breakdown that sums, such as revenue by customer).

**Don't use it when.**

- A row is below zero, or not a number, or the rows add up to nothing: refusal (a row is never dropped or mended).
- There is one row: refusal; a share of everything is 100 %.
- The rows are not parts of one whole (averages, percentages, rates): the Takeaway cannot know it, but a share of an average is not meaningful.

**Minimums and checks.** At least 2 rows. The checks for series do not apply to rows; the refusals above are this Method's checks.

**Worked example.** Eight customers: 40, 25, 12, 8, 6, 5, 3, 1 (total 100). The three largest make up 77 %; the fewest rows that reach 80 % are four (85 %). Ziffr says "Worked out: the 3 largest of 8 rows make up 77.0 %" and "4 of 8 rows make up 85.0 % …, the fewest that reach 80.0 %".

**Reference.** `referenceTopShare` and `referenceParetoCount` in `packages/core/src/test/reference/methods.ts` try every choice of rows, and take the largest sum of n rows, and the fewest rows of which some choice reaches the share: no sorting. The code equals it exactly. NumPy's sort and cumulative sum (`fixtures/methods.py`) agree to a relative 1e-12 where no share is on the line.

## Bridge

Function: `bridge` in `packages/core/src/methods/bridge.ts`; its Takeaway is `bridgeTakeaway`.

**What it answers.** Why did this Metric change from one period to the other: what did each part contribute?

**How it is worked out.** Each part's contribution is its weight (1, or −1 for a part that counts against the whole, such as Cost in Revenue − Cost) times its value after minus its value before, worked out exactly on the values' text. The parts add up to the change exactly (as exact numbers; each is then the double nearest to its exact value). A part with no value on one side counts as 0 there and is named. Where the whole's own change is given it is the change the sentence names (not the parts' sum), and the rest is said as "not in these rows". Decimals are added until no change that is not 0 reads as 0. Largest contribution first.

**Use it when.** The Metric is the sum of its Breakdown rows, or a Derived Metric that adds and subtracts its inputs.

**Don't use it when.** The Derived Metric multiplies or divides its inputs (a price times a volume): how the change splits between the two depends on the order, so Ziffr does not offer one.

**Minimums and checks.** At least 1 part. A value that is not a number, or a weight that is not 1 or −1, is refused.

**Worked example.** Revenue in Germany 120 → 85, Austria 40 → 31, France 22 → 24: −35, −9 and +2, a change of −42. Ziffr says "Worked out: Revenue fell by 42 €: Germany −35 €, Austria −9 €, France +2 €." In doubles 0.3 − 0.1 is 0.19999999999999998; here 0.1 → 0.3 is exactly 0.2.

**Reference.** `referenceBridge` in `packages/core/src/test/reference/methods.ts` works out the whole change another way, as the later values summed less the earlier ones, and the code's parts add up to it exactly. NumPy's differences (`fixtures/methods.py`) agree to a relative 1e-12.

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

A Method says which other Methods it can switch to (`canSwitchTo`); where it cannot, the check is a caution (or, for too many drivers, a refusal). A result with a caution is never shown as strong. Not yet used by a Method in the library: the multiple fit, the seasonal and the changing-level Methods; the checks are ready for them and tested on their own. The first part of the library (rank, partial and lagged correlation, usual range) already runs them; the share, Pareto and bridge Methods work on rows, not series, and have the refusals written under their entries.

**Reference.** `packages/core/src/test/reference/suitability.ts` works each check out another way: medians and deviations by sorting, skewness from central moments, the runs test by listing every arrangement of the signs, Spearman's r from counted ranks, the step in level from the normal equations by Cramer's rule, the yearly pattern and gaps by walking the series. SciPy and NumPy fixtures (`fixtures/suitability.py`, a test fails when the fixture is not from the script's current text) hold skewness, median and deviation, Spearman's r, the runs tail and the step fit to 1e-9; the decisions themselves are exact. A simulation of 1,000 straight lines with normal noise and no gaps checks that the checks are not too eager.
