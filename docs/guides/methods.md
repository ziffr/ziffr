# Methods

A **Method** is one calculation in Ziffr's library, such as a correlation or a forecast (spec 0041). People see Analyses, Recipes and Takeaways; this page is for analysts and contributors who want to know exactly what a Method does, when to trust it and how it is checked. The picker on the Analysis Canvas and the [Calculation Catalogue](../reference/calculations.md) read the same facts, so they cannot disagree with this page.

Every Method runs the [suitability checks](#the-suitability-checks) on the series it is given, every time. It gives a number, a number with a plain line above it (a caution), a different Method chosen by a written rule, or a refusal in words. It never gives a quiet number, and it never removes, smooths or fills in a value.

The footer "This shows what has gone together, not what caused what." is on the Takeaways about two Metrics together (correlation, rank, partial and lagged correlation, Drivers). The usual range, share, Pareto and bridge say nothing about what goes together and carry none. The change point has its own line, "This shows when the numbers changed, not what made them change.", and before and after has its own line, since it compares a Metric with where its trend pointed: "This compares what happened with where the earlier trend pointed; it does not show what made the difference."

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

Functions: `quantile`, `usualRange`, `standing` in `packages/core/src/methods/quantiles.ts`; the Takeaway is `usualRangeTakeaway`. The arithmetic of `quantile` is the Extension `ziffr/quantile` in `extensions/ziffr/quantile/`, which `quantiles.ts` reads through the registry (`packages/core/src/extensions.ts`).

**What it answers.** What is normal for this Metric? Is this value far from it?

**How it is worked out.** The p-quantile is the value at position (n − 1) · p among the n sorted values (counted from 0), or between the two values around it in proportion (Hyndman and Fan's type 7, the default of NumPy and R), worked out exactly on the values' text. The usual range is the middle 80 % of the Metric's own history: the 10th to the 90th percentile, with the median and the quartiles beside it. With a season (12 for months in a year) and a period, only the values at the same place in the season are used. A value is below, within or above the range.

**Use it when.** You want "usually between …" for a Metric, or to ask whether a value is outside what the Metric has been.

**Don't use it when.**

- The Metric has a trend or a step in level: its history is not one population. A step of 3 typical misses or more is found, and only the values since it are used when at least 8 remain (and Ziffr says so), else a caution.
- You want to judge a value by its season but have only two seasons: each place in the season then has two values, and the range is just those; the Takeaway says how many it rests on.

**Minimums and checks.** 8 periods. Checks that apply: enough periods, enough that vary, gaps, level shifts. Give the history without the value you ask about, so it does not judge itself.

**Worked example.** Eleven months of 1 to 11 (in any order): the 10th percentile is at position 1, the value 2; the quartiles are at 2.5 and 7.5, so 3.5 and 8.5; the median is 6; the 90th percentile is 10. Ziffr says "usually between 2 and 10"; a 12 is above that. By season it says "at this place in the season, going by 3 values".

**Reference.** `referenceQuantile` in `packages/core/src/test/reference/methods.ts` is the textbook form, (1 − g) · x[j] + g · x[j + 1] with positions counted from 1, on exact fractions: the result equals it exactly. NumPy's `quantile` and SciPy's `mquantiles` (`fixtures/methods.py`, which checks the two against each other) agree to a relative 1e-12. The Extension's own `reference.ts` is a second textbook form, on fractions, and the Extension Kit holds the Extension to it and to its hand-worked cases (`cases.ts`). One thing differs from the Method as a person sees it: the Extension refuses a single value and values that are all the same, as the Kit asks of every Method, and the core answers for those itself (the quantile of equal values is that value).

## Share of the largest rows and Pareto

Functions: `topShare` and `pareto` in `packages/core/src/methods/concentration.ts`; the Takeaways are `topShareTakeaway` and `paretoTakeaway`. The arithmetic of `topShare` is the Extension `ziffr/top-share` in `extensions/ziffr/top-share/`, which `concentration.ts` reads through the registry (`packages/core/src/extensions.ts`).

**What it answers.** How much of the whole is in a few rows? How few rows make most of it?

**How it is worked out.** The rows are put in order, largest first (the order given on a tie), and the sums are worked out on the rows' text, exactly. The share is the double nearest to the exact part ÷ whole. A Pareto is the fewest rows whose share reaches the share asked for (80 % unless told); "reaches" is decided exactly, so rows that add up to exactly 80 % count. It is arithmetic, not an estimate, and the Takeaway says "worked out". Where a row of the same size as the last one named is left out, Ziffr says which of those rows is named is arbitrary (the count is not).

**Use it when.** The rows are the parts of one whole that adds up (a Breakdown that sums, such as revenue by customer).

**Don't use it when.**

- A row is below zero, or not a number, or the rows add up to nothing: refusal (a row is never dropped or mended).
- There is one row: refusal; a share of everything is 100 %.
- The rows are not parts of one whole (averages, percentages, rates): the Takeaway cannot know it, but a share of an average is not meaningful.

**Minimums and checks.** At least 2 rows. The checks for series do not apply to rows; the refusals above are this Method's checks.

**Worked example.** Eight customers: 40, 25, 12, 8, 6, 5, 3, 1 (total 100). The three largest make up 77 %; the fewest rows that reach 80 % are four (85 %). Ziffr says "Worked out: the 3 largest of 8 rows make up 77.0 %" and "4 of 8 rows make up 85.0 % …, the fewest that reach 80.0 %".

**Reference.** `referenceTopShare` and `referenceParetoCount` in `packages/core/src/test/reference/methods.ts` try every choice of rows, and take the largest sum of n rows, and the fewest rows of which some choice reaches the share: no sorting. The code equals it exactly. NumPy's sort and cumulative sum (`fixtures/methods.py`) agree to a relative 1e-12 where no share is on the line. The Extension's own `reference.ts` picks the largest row n times, on a fraction for each row, and the Extension Kit holds the Extension to it and to its hand-worked cases (`cases.ts`).

## Bridge

Function: `bridge` in `packages/core/src/methods/bridge.ts`; its Takeaway is `bridgeTakeaway`.

**What it answers.** Why did this Metric change from one period to the other: what did each part contribute?

**How it is worked out.** Each part's contribution is its weight (1, or −1 for a part that counts against the whole, such as Cost in Revenue − Cost) times its value after minus its value before, worked out exactly on the values' text. The parts add up to the change exactly (as exact numbers; each is then the double nearest to its exact value). A part with no value on one side counts as 0 there and is named. Where the whole's own change is given it is the change the sentence names (not the parts' sum), and the rest is said as "not in these rows". Decimals are added until no change that is not 0 reads as 0. Largest contribution first.

**Use it when.** The Metric is the sum of its Breakdown rows, or a Derived Metric that adds and subtracts its inputs.

**Don't use it when.** The Derived Metric multiplies or divides its inputs (a price times a volume): how the change splits between the two depends on the order, so Ziffr does not offer one.

**Minimums and checks.** At least 1 part. A value that is not a number, or a weight that is not 1 or −1, is refused.

**Worked example.** Revenue in Germany 120 → 85, Austria 40 → 31, France 22 → 24: −35, −9 and +2, a change of −42. Ziffr says "Worked out: Revenue fell by 42 €: Germany −35 €, Austria −9 €, France +2 €." In doubles 0.3 − 0.1 is 0.19999999999999998; here 0.1 → 0.3 is exactly 0.2.

**Reference.** `referenceBridge` in `packages/core/src/test/reference/methods.ts` works out the whole change another way, as the later values summed less the earlier ones, and the code's parts add up to it exactly. NumPy's differences (`fixtures/methods.py`) agree to a relative 1e-12.
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

## Before and after

Functions: `afterDate` in `packages/core/src/methods/before-after.ts`; its Takeaway is `afterDateTakeaway`; the t curve it reads is `tQuantile` in `packages/core/src/methods/t-curve.ts`.

**What it answers.** Did this Metric run above or below where its own trend pointed after a date, and by how much? ("Did the March campaign work?") With a second Metric that should not have been touched, the same question for it, beside.

**How it is worked out.** The trend is the least-squares straight line through the periods before the date, by their place in the calendar (a period without a value leaves a longer step and is never filled in). The periods that start on or after the date are "after"; the one period that began before the date and runs past it holds both and is left out of both, and the Takeaway says so. The gap is the mean of the values after, less the mean of the line's values there. Sums, means and the line are exact on the values' text; the gap is the double nearest to its exact value. The range is the textbook range for the mean of m new values about a line fitted to n: the gap ± t · s · √(1/m + 1/n + (x̄ₐ − x̄)² ÷ Sxx), with s² the squared misses of the line before the date ÷ (n − 2) and t the point of Student's t curve with n − 2 degrees of freedom below which 90 % lie (so that the range holds 80 %). Where the trend points above 0 the gap and its range are said as a share of it, with the range of the share counting the uncertainty of the level it is a share of: Fieller's interval for the ratio ρ of the mean after to the line's level there, the ρ with (Y − ρE)² ≤ t²s²(1/m + ρ²q), q = 1/n + (x̄ₐ − x̄)² ÷ Sxx, which holds zero exactly where the range of the gap does and is wider and lopsided where the level is not far above 0; where it is not clearly above 0 no share is said, and the gap is in the Metric's unit. The latest 120 periods before the date and the first 120 since it are used, and the Takeaway says when more were given. The sentence says what the range is ("that range leaves out zero" or "includes zero"), and does not call it a finding: with no real change about 1 range in 5 leaves out zero. A Metric set beside it that also ran outside the same range gets a line saying the same, with the same bar and the chance of it. No strength word is given: it is a range, not a verdict. If the misses of the line before the date carry over from one period to the next (below), a caution says the range is too narrow.

**Use it when.** You know when something started and want to see whether the Metric ran away from its own path afterwards, and by how much.

**Don't use it when.**

- You have fewer than 6 periods before the date: refusal, with how many there are.
- The Metric has a strong pattern through the year: the line knows nothing of seasons, so the ups and downs of the season count as spread (the range grows) or, if the periods after fall in another part of the year, can look like a change.
- Something else changed on the same date: the Takeaway says it compares with the earlier trend and does not show what made the difference; a Metric set beside it, which the change should not have touched, helps, and a caution says when it moved too.
- The values before the date lie exactly on a line: the range has no spread to go by (a caution says so).
- The ups and downs carry over from one period to the next (a slow wave, a run of good months): the range counts each period as independent, so it is too narrow. The Takeaway says it assumes they do not, and a caution says when the misses of the line before the date carry over (r₁ above 2 spreads, see Ups and downs that carry over).

**Minimums and checks.** 6 periods before the date (the periods the line is fitted to, counted the same in the sentence, the basis and Show the numbers). Checks that apply: enough periods, enough that vary and gaps (on the whole series, the values before, the period that holds the date and those after); a Method has no far-off or level-shift check, since a step is what it looks for. A date that is not a day, nothing after it, numbers too large to work out a range from, and a difference too small to write out are refusals in words.

**Worked example.** Values 1, 3, 2, 5 before and 8, 9 after, one a month (the Takeaway needs 6 before; the arithmetic is the same). The line is 1.1 + 1.1 · position (positions 0 to 3). The periods after are at 4 and 5, mean 4.5, where the line points to 6.05; they average 8.5, so the gap is 2.45. The line misses by −0.1, 0.8, −1.3 and 0.6: squared 0.01 + 0.64 + 1.69 + 0.36 = 2.7, so s² = 1.35. 1/m + 1/n + (4.5 − 1.5)² ÷ 5 = 0.5 + 0.25 + 1.8 = 2.55. With 2 degrees of freedom the 90 % point is 1.8856, so the range is 2.45 ± 1.8856 · √(1.35 · 2.55) = 2.45 ± 3.50, between −1.05 and 5.95: the periods after are not clearly away from the trend.

**Reference.** `referenceShareRange` finds the ends of the share's range by bisection on the inequality itself, where the code solves the quadratic; `referenceAfter` in `packages/core/src/test/reference/before-after.ts` solves the normal equations by Cramer's rule and sums the misses from the residuals, and gets the variance of the gap from the covariance matrix of the fit, c'(X'X)⁻¹c with c = (1, mean position after), where the code uses the closed form above; the t point is the incomplete beta function by Lentz's continued fraction and bisection, where the code uses the finite sums of Abramowitz and Stegun 26.7.3 and 26.7.4. The code equals the reference exactly in the line, the means and the gap (the double nearest to the exact value) and to a relative 1e-12 in the range. NumPy's `lstsq` and `linalg.inv`, SciPy's `linregress` and `t.ppf` (`fixtures/before-after.py`, with Anscombe's first set, a perfect line, gaps, one period after, a falling trend below 0, tiny values and 60 periods) agree to a relative 1e-9.

## Change point

Functions: `changePoint` in `packages/core/src/methods/change-point.ts`; its Takeaway is `changePointTakeaway`.

**What it answers.** Did something change in this Metric, and when? The one date at which its level or its trend most likely changed, with how it went before and since, or "nothing stands out".

**How it is worked out.** Every date that leaves at least 4 values each side is tried (n − 7 dates for n values). For each, a straight line is fitted to the values before it and another to the values from it on, by their place in the calendar, and the date whose two lines leave the smallest sum of squared misses wins (the earliest on a tie). Sums and lines are exact on the values' text. The step at the date is the later line's value at the date less the earlier line's value there. Whether the best date is a change or only the luckiest of those tried is the chance rule. Two lines against one are four numbers to fit against two, so the gain is judged by the F ratio with (2, n − 4) degrees of freedom, whose chance of being exceeded has a closed form for two degrees of freedom: (SSE₀ ÷ SSE₁)^(−(n − 4)/2), with SSE₀ the misses of one line through everything and SSE₁ the misses of the two lines. Because many dates were looked at, the chance rule is shared among them: the change is called real when that chance is below 1 in 20 divided by the number of dates tried, that is, when (SSE₀ ÷ SSE₁)^(n − 4) > (20 · dates)². This is decided exactly on whole numbers, so a ratio exactly at the bar is not called a change. No misses at all with two lines (and some with one) is a change; none with one line is not. The Takeaway reads "up 5 € a month before, down 3 € a month since", and "its level was 80 € higher than the earlier trend would have given" for the step; it says the date is the one that fits best, that nearby dates may fit almost as well, and that one change only is looked for. The latest 120 periods are used, and the Takeaway says when more were given. No strength word is given. Its footer is "This shows when the numbers changed, not what made them change." Two slopes or a step that differ are written with digits that tell them apart, in the sentence and under Show the numbers.

**Use it when.** You do not know the date, and want to know whether, and when, a Metric's level or trend changed.

**Don't use it when.**

- You have fewer than 8 periods (4 each side): refusal.
- You already know the date: use before and after.
- The Metric changed more than once (it finds the one best date, not several), or has a pattern through the year that is not a change (a season looks like a change in trend).
- One far-off value stands behind the change: the check below asks whether the change is still there without it.
- The ups and downs carry over from one period to the next: a slow wave then looks like a change. In 24 months of noise with a gentle trend and no change, the chance rule calls a change in 4 % of series when the ups and downs are independent, in about 33 % at a carry-over of 0.5 and about 65 % at 0.8. A caution marks about 60 % and 85 % of those false changes (and about half of the real changes, which carry over too, which the caution says); it does not change the answer.

**Minimums and checks.** 8 periods. Checks that apply: enough periods, enough that vary, gaps (a caution below the limit: the periods without a value are left out, and the dates are counted on the values that remain), far-off values. The far-off check is asked of the change point itself: what it reads without the 1 to 3 most extreme values (the change in slope, against 1/5 of its own range, and whether the change is still found at all), and it says so: "without them it reads no change at all" or "a change around January 2025". Nothing is removed. A series so large or with numbers so large that a range cannot be worked out, and a slope or step too small to write out, are refusals in words.

**Worked example.** 2, 2, 2, 2, 10, 11, 12, 13. One line through all 8: SSE₀ = 185.5 − 81² ÷ 42 = 29.29. At the fifth value the two lines are exact (the first is flat at 2, the second goes 10 to 13, one a month): SSE₁ = 0, so it is a change at the fifth period, flat before, up 1 a month since, and the later line is at 10 where the earlier would have given 2: the level was 8 higher. With noise, say 24 values: 17 dates were tried, so the improvement must beat (20 · 17)² = 115,600 as a power of 20 of the ratio of misses, a ratio above 1.79; one date alone would have needed 1.35.

**Reference.** `referenceChange` in `test/reference/before-after.ts` tries every date from scratch, solving each line by Cramer's rule and summing residuals, and applies the chance rule through the F ratio of the improvement; the code works from running sums of x, y, x², xy and y². They agree exactly in the date, the slopes, the step and the verdict. NumPy's `polyfit` and SciPy's `f.sf` and `t.ppf` (`fixtures/before-after.py`: a step in level, a turn, a speed-up, noise only, a straight line, two perfect lines, the least number of values, gaps) agree to a relative 1e-9, the closed form of the F chance against `f.sf` is asserted in the script itself, and a pair of series that differ only in the loudness of their noise stand just either side of the bar (chance ÷ bar 0.96 and 1.04) and are called as SciPy says. A simulation of 600 noisy series with a gentle trend and no change finds a change in at most 5 % (the bar shared among the dates is much stricter), and a planted step of 60 against noise of 7 is found in 99 of 100.

## Ups and downs that carry over

Function: `carriesOver` in `packages/core/src/methods/carry-over.ts`. The range of before and after and the chance rule of the change point take each period's miss as independent of the one before. **How it is worked out.** The first-order autocorrelation of the misses of a fit, r₁ = Σ eₜ·eₜ₊₁ ÷ Σ eₜ², over the pairs of periods that follow one another in the calendar (a gap breaks a pair; nothing is filled in), exact on fractions. Under independence r₁ is about 0 with a spread of 1 ÷ √m for m pairs; the check is r₁ > 0 and m · r₁² > 4 (above 2 spreads). For before and after the misses are those of the line before the date; for the change point they are those of the one line through everything (two lines would take a slow wave up into themselves and read it as white: about 2 to 8 % of the false changes would be marked, against 60 to 85 %). **Use it** as a caution only; it never changes a number.

## Student's t curve

Function: `tQuantile` (and `tCdf`) in `packages/core/src/methods/t-curve.ts`. The 80 % range of before and after and the far-off check of the change point read the point of Student's t curve below which 90 % lie, for a whole number of degrees of freedom from 1 to 100,000. For a whole number of degrees of freedom the chance of a value within ±t has a finite closed form (Abramowitz and Stegun 26.7.3 for an even and 26.7.4 for an odd number), all of whose terms are positive; the point is found by bisection. The lower tail is worked out directly (½ · I_x(ν/2, ½), x = ν ÷ (ν + t²), the incomplete beta function by Lentz's continued fraction), not as 0.5 less half of what lies within, which loses every digit far below 0 (t = −50 at 30 degrees of freedom is 9.4e-31, not 5.6e-17). Accurate to a relative 1e-9 in the quantile for chances from 0.001 to 0.999 and in the chance, tails included; outside that, NaN. Checked against SciPy's `t.ppf` and `t.cdf` at 17 chances and 18 degrees of freedom from 1 to 2000, and every degree of freedom from 1 to 200 for the 90 % point, and against a reference by the incomplete beta function (the chance within ±t, and for a tail its power series, a different route from the continued fraction).

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

A Method says which other Methods it can switch to (`canSwitchTo`); where it cannot, the check is a caution (or, for too many drivers, a refusal). A result with a caution is never shown as strong. Not yet used by a Method in the library: the multiple fit and the changing-level Methods; the checks are ready for them and tested on their own. Before and after and the change point run theirs (the change point asks the far-off check about the change itself). The first part of the library (rank, partial and lagged correlation, usual range) already runs them; the share, Pareto and bridge Methods work on rows, not series, and have the refusals written under their entries.

**Reference.** `packages/core/src/test/reference/suitability.ts` works each check out another way: medians and deviations by sorting, skewness from central moments, the runs test by listing every arrangement of the signs, Spearman's r from counted ranks, the step in level from the normal equations by Cramer's rule, the yearly pattern and gaps by walking the series. SciPy and NumPy fixtures (`fixtures/suitability.py`, a test fails when the fixture is not from the script's current text) hold skewness, median and deviation, Spearman's r, the runs tail and the step fit to 1e-9; the decisions themselves are exact. A simulation of 1,000 straight lines with normal noise and no gaps checks that the checks are not too eager.
