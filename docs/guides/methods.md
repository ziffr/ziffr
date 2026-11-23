# Methods

A **Method** is one calculation in Ziffr's library, such as a correlation or a forecast (spec 0041). People see Analyses, Recipes and Takeaways; this page is for analysts and contributors who want to know exactly what a Method does, when to trust it and how it is checked. The picker on the Analysis Canvas and the [Calculation Catalogue](../reference/calculations.md) read the same facts, so they cannot disagree with this page.

Every Method runs the [suitability checks](#the-suitability-checks) on the series it is given, every time. It gives a number, a number with a plain line above it (a caution), a different Method chosen by a written rule, or a refusal in words. It never gives a quiet number, and it never removes, smooths or fills in a value.

The footer "This shows what has gone together, not what caused what." is on the Takeaways about two Metrics together (correlation, rank, partial and lagged correlation, Drivers). The usual range, share, Pareto and bridge say nothing about what goes together and carry none. The Heads-ups about one Metric carry the footer of their own kind: a change of direction the change point's line, a Target out of reach the forecast's, and a value unusual for its season none. The change point has its own line, "This shows when the numbers changed, not what made them change.", and before and after has its own line, since it compares a Metric with where its trend pointed: "This compares what happened with where the earlier trend pointed; it does not show what made the difference."

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

## Multiple fit (What moves B?)

Functions: `fit`, `fitNumbers`, `fitBasis` and `importance` in `packages/core/src/methods/fit.ts`; the t quantile is `tQuantile` in `packages/core/src/methods/distributions.ts`; the Takeaway is `movesTakeaway` and the Recipe `whatMoves` in `packages/core/src/takeaways/fit-takeaway.ts`.

**What it answers.** Which of several Metrics have gone with B, with the others held the same, and how much of what moved does each account for?

**How it is worked out.** B and its drivers (1 to 6 other Metrics) are put on their Common Period. Where B and at least one driver have a clear trend, each is turned into its change from the period before ("growth removed"); otherwise the values are used. At most the latest 120 periods that all of them have are used, and a period any of them lacks is a gap that is counted and said, never filled. A straight line through all of them is fitted by least squares: the normal equations (sums about the means, their inverse, the effects, the sum of squared misses) are worked out on fractions of the values' text, so they are exact, and only the last step to a double, a square root and the t quantile are not. Each driver's effect is its change in B per one unit of the driver with the other drivers held the same, and its range is the effect plus and minus t times its standard error, t being the 90 % point of the t curve with n − k − 1 degrees of freedom: that is the 80 % range, called "likely between". Each driver's share of what the line explains is found by averaging, over every order in which the drivers can join, how much the explained share rises when that driver joins (LMG); the shares add up to exactly 1. The strength word is read from the driver's partial correlation (its link to B with the others held fixed) over n − k + 1 periods. Effects are said per a power of ten at or below the driver's own spread ("per 1,000 Visits"), always written to at least two significant digits, so that a number above 0 is never written as 0.

**Use it when.** Several Metrics may move B together and you want to know which matter most and by how much, with the others taken into account.

**Don't use it when.**

- You want to know what causes B: a fit only shows what has gone together, and the footer says so.
- The history is short: a fit with k drivers needs 8 + 4k periods and at most one driver per 6 periods (and 6): Ziffr refuses and says how many it has and needs.
- Two drivers move so closely that the line cannot tell them apart (a pair linked by r² above 4/5, which is an inflation above 5, or exactly in step): Ziffr treats them as one, leaves out the one with the weaker link to B (on a tie the Metric with the lower id, so the order they are listed in changes nothing), and says so and whose unit the effect is in. Where inflation is high only for a group of three or more with no such pair (one about the sum of the others): between 5 and 10 the fit is kept and the Takeaway names the crowded drivers (at least two), with a caution that their separate effects are less certain and the ranges show how much, and nothing is called strong; above 10, or where they are exactly one, it is refused, naming every driver that loads on the near-dependency (found as the direction of least variance of the correlation matrix). A driver counts as loading on that direction from 5 % of it (the square of its entry in the direction): a driver with an inflation under 5 can still be named as crowded when it loads, and one just under the cut is not. An exact mix is refused naming all its drivers ("one is exactly the others added up"). A crowded driver is never called strong.
- More Metrics than the history can carry (one per 6 periods, at most 6): the Recipes first narrow them by how closely each one's changes follow B (Pearson's r of the changes, taken one Metric at a time, so it can miss one that only shows beside another; ties by Metric id, then name) and say how many there were, how many were kept and which were left out. A fit given more drivers directly is refused in words.
- Metrics of different periods are all compared by the longest period among them, the others combined by their Aggregation; the Takeaway says which were combined. Where a value is missing and the fit compares changes, it names the months with no value (up to four, then how many more) and says the changes into and out of them were left out.
- The link bends, the misses grow with the level, a few periods are far from the rest, the values are very uneven, or the link was different in the first half of the history: Ziffr gives the answer with a plain line above it, the effect without the far-off periods quoted, and never calls it strong.
- A Metric has Aggregation none beside another period, or one is calculated from another: a refusal naming them.

**Minimums and checks.** 8 + 4 per driver periods. Checks that apply: enough periods, enough that vary, gaps, mixed periods, far-off values, skew and ties (a caution), not a straight line, changing relationship, spread that grows, too many Metrics.

**Worked example.** Twelve months, the Metric B = 2·x + (−1)^x for x = 1 to 12 and one driver x. With n = 12, Sxx = 143 and Sxy = 292, the effect is 292/143 = 2.04, the intercept 13 − 6.5 · 292/143 = −3/11, the sum of squared misses 608 − 292²/143 = 1680/143, and 5329/5434 = 98.1 % of what moved is explained. The typical miss is √(1680/1430) = 1.08, and with 10 degrees of freedom t = 1.372, so the effect is likely between 1.92 and 2.17 per unit.

**Reference.** `packages/core/src/test/reference/fit.ts` works the same answer out another way: the design has a column of ones and no centring, the normal equations are solved by Cramer's rule with every determinant by Laplace expansion, the sum of squared misses is the sum of the squared residuals, every driver's LMG share is the mean over all k! orders, and the inflation (how well the other drivers account for a driver; 1 is not at all) and the partial link come from fits of their own. Effects, intercept, explained share, shares, inflation and partial links equal the exact fractions' nearest double (the partial link and the typical miss up to their final root); ranges agree to a relative 1e-9 with the reference's t quantile, which integrates the curve's density numerically. NumPy and SciPy fixtures (`fixtures/fit.py`, a test fails when the fixture is not from the script's current text) hold Anscombe's four data sets (intercept 3.0, effect 0.5, 66.7 % explained), a Longley-style set whose GNP and Population are nearly one Metric, an exact relation, and random sets with 1 to 6 drivers, to a relative 1e-9; the t quantile equals SciPy's `t.ppf` for 240 pairs of degrees of freedom and share. An exact linear relation gives its effects back exactly with a range of no width. A simulation of 800 series checks that the 80 % ranges hold the true effect and a new period's value about 80 % of the time.

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

**What it answers.** B has to reach a value wanted: what would one driver need to be, with the others at their latest values?

**How it is worked out.** `predict` turned round for one driver: the value that gives the value wanted is exact, x̄ⱼ + (value wanted − ȳ − Σ of the others' b·(x − x̄)) ÷ bⱼ. Its range is the set of driver values whose range for a single period holds the value wanted; that is a quadratic in the driver value, bounded only where the driver's effect is clear (bⱼ² above t²σ²·(Sxx⁻¹)ⱼⱼ). Where it is not clear, or the value is outside what the driver has been, only the point is given and the Takeaway says "treat it as a guess". A value wanted more than 1,000 times the largest value B has had is not worked out. `predict` at the answer gives the value wanted.

**Use it when.** You have a value wanted for B and want to know what to work on, and the driver's effect has been clear.

**Don't use it when.**

- The effect cannot be told from chance, or is exactly 0: only a point, or a refusal ("has not moved with it at all").
- The value is higher or lower than the driver has ever been: the point is a guess, and with a curved link Ziffr refuses.
- You expect the other drivers to change: they are held at their latest values unless you give others.

**Minimums and checks.** As the fit.

**Worked example.** With the fit above, B = 20 needs x = (20 + 3/11) · 143/292 = 9.93, likely between 9.15 and 10.73, inside the 1 to 12 seen. B = 30 would need x = 14.8, above the 12 seen: the point only, "treat it as a guess".

**Reference.** `referenceNeedsRange` finds the ends of the range by halving the band's edge on fractions, from the answer outwards, which shares no step with the quadratic; the ends agree to a relative 1e-9 of the range's size. SciPy's `brentq` on the band's edge gives the fixtures' ends to 1e-7. Generated value wanteds check that `predict` at the answer gives the value wanted, and an exact relation gives a driver value back exactly.


## Heads-ups: moving together and stopped moving together

Functions: `pValueOfR` in `packages/core/src/methods/p-value.ts`; `benjaminiHochberg` and `adjustedChances` in `false-discovery.ts`; `scanPair`, `scanPairs`, `effectiveCount`, `autocorrelations`, `strongInBoth` and `exactAtLeast` in `pair-scan.ts`; `headsUpsFrom` in `heads-up.ts`. The job that fills the pair table and the one function that reads it for a person are `scanWorkspace`, `headsUpJob` and `listHeadsUps` in `packages/core/src/heads-ups.ts` (not a calculation module: it reads and writes, it does not calculate).

**What it answers.** Which pairs of Metrics have started moving together, and which have stopped, with nothing said when nothing stands out?

**How it is worked out.** For every pair of a Workspace's Metrics on their Common Period (the same Period, or one step apart), always on how each Metric changed from the period before (growth removed), over the latest 120 periods:

1. *Delays.* For each delay from 3 periods either way to none (7 in all, the first Metric moving first for a positive delay) the pairs are "the leader's change that many periods before the follower's"; a delay needs at least 12 pairs and both series changing. r is Pearson's r in two passes over the centred values.
2. *Pairs that count.* A Metric that follows its own past (a running total, a moving average) makes pairs of changes worth fewer than they look. Bartlett's rule gives the effective count: n ÷ (1 + 2·Σ ρx(k)·ρy(k)) over the first n ÷ 3 delays (at most 12), the autocorrelations ρ read from each whole series, never more than n.
3. *The chance by luck* of r over that many pairs is the two-sided chance of Student's t with count − 2 degrees of freedom, worked out as the regularized incomplete beta function I at x = 1 − r² (`pValueOfR`). The best delay has the smallest chance; the pair's chance after the delays is that chance times the number of delays looked at, at most 1 (`pDelays`).
4. *Both halves.* The pairs of the best delay in time order are cut in two. The pair's chance `p` is the largest of `pDelays` and the chance of each half on its own: a link is only as sure as its weaker half. This is what the correction reads.
5. *Conditions.* A pair "meets" the conditions that do not depend on the other pairs when its `p` is at most 10 %, |r| is at least 0.7 over all the pairs and in each half, all on the same side of 0 (decided exactly, on the values' text, wherever a pair comes near 0.7), and every suitability check of a lag passes with nothing to say: a pair with a gap, a far-off value or very uneven values is left out, not shown with a caution.
6. *The history before.* The same is worked out for the history before the last 6 periods (it needs 12 pairs again), and the correlation at that delay over the last 6 periods, with the chance that the link dropped: the drop of Fisher's z against the spread of both (one-sided, the normal curve).
7. *The correction for the number of pairs looked at* is Benjamini and Hochberg's step-up rule at 10 %: with m chances sorted, find the largest rank k whose chance is at most 0.1·k ÷ m and report everything at or below it. **m is the number of rows the person may see**, not the Workspace's (see below). A pair is reported as moving together when it meets the conditions, is reported by the correction and its strength word is not "can't tell from chance"; as stopped when its history before would have been reported, its last 6 periods have |r| under 0.3 and the chance that the link dropped is reported by the same rule among the pairs that had been moving together. A pair that stopped is not also reported as moving together.

**Use it when.** You want Ziffr to say, without being asked, that two Metrics have started or stopped moving together.

**Don't use it when.**

- You want to know whether two Metrics you picked move together: that is a correlation, which answers for any two Metrics and any history of 6 periods or more.
- A Metric has seasons the other shares: the changes of two Metrics with the same yearly pattern correlate, and that is true and not new. Ziffr reports it as moving together.
- You want what causes what: a Heads-up says what has gone together. The footer says so.

**Minimums and checks.** 12 pairs of changes at a delay; both series changing; the two series end no more than 3 periods apart and the pair's last period is no more than 6 periods before today; at most 200 Metrics and 20,000 pairs a scan. The Heads-up needs a link of at least 0.7, so a weaker one is never reported however sure.

**What is not the person's to see.** The pair table is computed once per Workspace and nobody but the core reads it. A person's Heads-ups read only the rows whose two Metrics they may see, and the correction counts only those rows: the same pair is reported or not whatever the person cannot see, and a Metric hidden, archived or deleted is gone at once. Nothing in a sentence, a count, the order or the chance under Show the numbers depends on a Metric they may not see: which pairs are related (a Derived Metric and what it is worked out from) is judged over the Metrics they see, and in a Workspace with more than 200 Metrics their pairs are scanned over their own Metrics, so the cap cannot drop a pair of theirs for another person's Metric.

**Worked example.** (1) Over 4 pairs with r = 0.9 the chance by luck is exactly 1 − 0.9 = 0.1 (with 2 degrees of freedom the chance is 1 − |r|), and over 3 pairs r = 0.5 gives 2/3. (2) Twelve pairs of two series that each have ρ1 = 0.5 and nothing at the other delays are worth 12 ÷ (1 + 2 · 0.25) = 8 pairs. (3) The chances 0.005, 0.01, 0.03 and 0.04 at 10 % have the bounds 0.025, 0.05, 0.075 and 0.1, and all four are reported; 0.03 and 0.2 have the bounds 0.05 and 0.1, so only 0.03 is; 0.06 and 0.07 have the same bounds, the first is over its own bound and the second is within its, and a later rank rescues an earlier one, so both are reported.

**Reference.** `test/reference/heads-up.ts`: the chance by the integral of cos^(ν−1) over the angle with sin = |r| (Gauss-Legendre, Stirling for ln Γ), the closed finite sums of Abramowitz and Stegun for whole degrees of freedom, and the cases above worked by hand; Benjamini and Hochberg's rule decided on exact fractions; the effective count from exact autocorrelations; each delay's pairs by position in a list and r from the exact r². SciPy and NumPy (`fixtures/heads-up.py`: Student t, `pearsonr`, `false_discovery_control`, `np.correlate`, `np.corrcoef`) agree to a relative 1e-9, and the whole scan of a pair is written out again in the script and agrees on every delay, chance, half and drop. `heads-up-simulation.test.ts`: 150 Metrics of independent noise, of trends and random walks, and of noise that follows its own past (autoregressive, moving averages up to 12 months, running totals of running totals) give no Heads-up in at least 99 of 100 runs each, a planted pair is found at every delay from 3 either way, and a pair that carries on is not said to have stopped.
## Heads-ups about one Metric: change of direction, Target out of reach, unusual for the season

Functions in `packages/core/src/methods/heads-up-single.ts`: `singleHeadsUpsFrom` (the Heads-ups), `changeChance` and `shiftChance` (a change of direction), `lineAt`, `lineBelow`, `lineAbove`, `driftBelow`, `driftAbove` and `reaches` (a Target), `newValueChance` (a season), `recentDate`, `turned`, `farApart`, `unlikelyToReach`, `onTheSide` (the conditions), `twoLinesMisses` and `targetHeadsUp`. They read the Method of the change point (`change-point.ts`), the forecast and its reach chance (`takeaways/forecast.ts`, `reach-chance.ts`), the usual range (`quantiles.ts`) and the correction of the pairs (`false-discovery.ts`). `listHeadsUps` in `heads-ups.ts` gives each person the Heads-ups of all kinds.

**What it answers.** Has one Metric done something that stands out, with nothing said when nothing does? Each Metric is judged on its own values, in its own Period, and only on values that are final (nothing waiting for Approval or sent back: `value-state.ts`, the rule Alerts read too).

**How it is worked out.**

1. *Change of direction.* The change point of the latest 120 periods is at one of the last 3 dates it can try (the later part has 4, 5 or 6 values), the trend turned (one slope up and the other down), the two straight lines are at least 2 typical misses apart at the latest period, every suitability check of a change point passes with nothing to say, and the misses of the two lines do not carry over from one period to the next. Its chance by luck is the larger of two: the change point's own (the F ratio of two lines against one, `(SSE₁ ÷ SSE₀)^((n − 4) ÷ 2)`, times the dates tried, with the periods worth n · (1 − ρ) ÷ (1 + ρ) where the misses follow their own past with first autocorrelation ρ), and the chance that the mean change from one period to the next differs before and after the date (Student's t, pooled variance, exact on the values' text, times the dates tried). The first holds for a Metric around a line, the second for one that wanders, a running total, which a straight line's misses cannot tell from a change.
2. *Target out of reach.* The Metric has a Target Range (higher is better: at least the lower end; lower is better: at most the upper; closer to target: both). The forecast of the Takeaway (a plain trend or the trend with the yearly pattern, by the rule of `forecast-choice.ts`, with no caution) gives a reach chance under 20 % for the period the forecast looks ahead to by default (14 days, 6 weeks, 3 months, 2 quarters, 2 half years, 1 year), with 2 or more periods left, or with fewer where one period ago the straight line without the latest value met the Target. The straight line through the latest 24 periods (at least 8), read at the same period, is below the Target's end by more than the line's own uncertainty allows: its chance is Student's t with n − 2 degrees of freedom at (line − end) ÷ √(s² · (1/n + (x₀ − x̄)² ÷ Sxx)), where the misses follow their own past the variance is (1 + ρ) ÷ (1 − ρ) times larger and the degrees of freedom are n · (1 − ρ) ÷ (1 + ρ) − 2, rounded down; where the line's chance is not the one that counts: the Target's chance is the larger of the line's and the chance read from the changes alone, Student's t with changes − 1 degrees of freedom at (mean change − (end − last value) ÷ periods ahead) ÷ (s ÷ √changes), which is the one that holds for a series that wanders (a line's misses are not independent there, a series' changes are). For a Target with both ends it is twice the smaller of the two. A line whose misses carry over, or follow their own past by more than 0.2 (first autocorrelation), is not used, and neither is a Target period that is already over.
3. *Unusual for the season.* The latest value is outside the usual range (10th to 90th percentile) of the earlier values at the same place in the season (12 for months, 4 quarters, 7 days, 52 weeks, 2 half years; not for yearly Metrics), at least 2 of them, on the side of their mean that "high" or "low" says, and the checks of the usual range (periods, variation, gaps, level shift) pass with nothing to say. Its chance by luck is the two-sided chance of Student's t with k − 1 degrees of freedom at |latest − mean| ÷ (s · √(1 + 1/k)) over the k earlier values.
4. *The correction.* The conditions about the Metric alone (all of the above except the chance) are applied first: a Metric that does not meet them has a chance of 1 and still counts. The chances of all Metrics and all three kinds are then corrected together with Benjamini and Hochberg's step-up rule at **1 %**, not the 10 % of the pairs: these kinds look at every Metric on its own, and Ziffr must stay quiet on noise (at 10 % a Workspace of noise would give a false Heads-up about one run in ten). m is the number of tests worked out for the Metrics the person may see.
5. *Said once.* A change of direction and a Target out of reach carry the key of the kind and the Metric, a value unusual for its season also its period.

**Use it when.** You want Ziffr to say, without being asked, that a Metric turned around, that its Target is likely out of reach, or that its latest value is unusual for the time of year.

**Don't use it when.**

- You want to know about one Metric you picked: use the change point, the Recipe "Will we reach the Target?" or the usual range, which answer for any Metric and a shorter history.
- You want the latest value judged against what is normal for the Metric as a whole, ignoring the season: that is the usual range without a season.
- You want what made it turn: the footer says it shows when, not why. A Target Heads-up says it carries the past forward and is no promise. The Heads-up about a season has no footer: it says nothing about what goes with what.

**Minimums and checks.** A change of direction needs 8 periods (the change point), a Target 8 periods and a Target Range, a season at least 2 earlier values at the latest value's place in the season (so 2 years of months before the latest, 3 in all) and 8 periods in all. The latest period must be no more than 6 periods before today. The chances and the thresholds make the smaller Heads-ups mostly quiet in a big Workspace, as intended: for a value to be unusual for its season with the correction over m checks, its distance from the earlier values at the place, in their sample deviations, must be at least

| earlier values | m = 1 | m = 10 | m = 100 | m = 450 |
| --- | --- | --- | --- | --- |
| 2 | 78 | 780 | 7,800 | 35,000 |
| 3 | 11.5 | 36 | 116 | 245 |
| 5 | 5.0 | 9.4 | 17 | 25 |
| 8 | 3.7 | 5.7 | 8.4 | 10.5 |
| 12 | 3.2 | 4.6 | 6.2 | 7.3 |

(for the best of the checks; the others need more). So with 2 or 3 earlier years a spike has to be far outside to be told; with 5 or more years it is a few deviations. Quiet is a result.

**What is not the person's to see.** Nothing is kept: a person's Heads-ups of these kinds are worked out when they are asked for, from the final values of the Metrics they may see and in use, and the correction counts only those Metrics' tests. No Metric they may not see, its values, its name, or the number of Metrics in the Workspace, goes into a sentence, a count, the order or a chance under Show the numbers. A Metric hidden, archived or deleted is gone at once.

**Worked example.** A line through 1, 3, 2, 4 at the places 0 to 3 has the slope 4/5; its sum of squared misses is 9/5, so s² = 9/10; read at place 4 its value is 4.5 and its variance 9/10 · (1/4 + (5/2)² ÷ 5) = 27/20. Earlier values 10 and 12 and a latest value 20 are 9 ÷ (√2 · √(3/2)) = 3√3 sample deviations out: with 1 degree of freedom the chance is 1 − (2/π) · atan(3√3) = 0.121, far above 1 %.

**Reference.** `test/reference/heads-up-single.ts`: a line by the normal equations on exact fractions with no centring, Student's t from the density (Gauss-Legendre, `heads-up.ts`), the two-sample chance from the definition, and every date of a change point tried by the normal equations. SciPy and NumPy (`fixtures/heads-up-single.py`: `np.polyfit`, `scipy.stats.t.cdf` (the line and the changes) and `t.sf`, `scipy.stats.f.sf` for the change point's F ratio, `scipy.stats.ttest_ind`) agree to a relative 1e-9 (1e-8 for the chances of a change). `heads-up-single-simulation.test.ts`: 150 Metrics where nothing happens (independent noise, trends and random walks, noise that follows its own past, a steady yearly pattern), each with a Target it meets about as often as not, give none of these Heads-ups in at least 99 of 100 runs; a planted turn, a Target missed and a spike are found and named alone.

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

Function: `tQuantile` (and `tCdf`) in `packages/core/src/methods/t-curve.ts`. The 80 % range of before and after and the far-off check of the change point read the point of Student's t curve below which 90 % lie, for a whole number of degrees of freedom from 1 to 100,000. For a whole number of degrees of freedom the chance of a value within ±t has a finite closed form (Abramowitz and Stegun 26.7.3 for an even and 26.7.4 for an odd number), all of whose terms are positive; the point is found by bisection. The lower tail is worked out directly (½ · I_x(ν/2, ½), x = ν ÷ (ν + t²), the incomplete beta function by Lentz's continued fraction), not as 0.5 less half of what lies within, which loses every digit far below 0 (t = −50 at 30 degrees of freedom is 9.4e-31, not 5.6e-17). Accurate to a relative 1e-9 in the quantile for chances from 0.001 to 0.999 and in the chance, tails included (against SciPy to a relative 1.3e-12, and the two tails of a point add to 1 within 1e-13); outside that, NaN. Checked against SciPy's `t.ppf` and `t.cdf` at 17 chances and 18 degrees of freedom from 1 to 2000, and every degree of freedom from 1 to 200 for the 90 % point, and against a reference by the incomplete beta function (the chance within ±t, and for a tail its power series, a different route from the continued fraction).

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
