# The Calculation Catalogue

Every calculation Ziffr does on values, with its rule in plain words, the code that does it, the reference it is held to and the tests that hold it there (spec 0022, "Verification is the first requirement"). How the tests work, and how to add one, is in [the calculation tests guide](../guides/calculation-tests.md).

**What is checked.** `packages/core/src/catalogue.test.ts` fails when an exported function of a calculation module (`packages/core/calculation-modules.json`) has no row here, when a module has no section, and when a mutant that mutation testing leaves out has no line under "Mutants that cannot matter". So a new calculation cannot slip in untested.

**How to read a row.** _Code_ names the module and its functions. _Reference_ is a file in `packages/core/src/test/reference/`, written apart from the code and checked by its own hand-worked tests. _Tests_ are files in `packages/core/src/`. "Exact" means the double nearest to the exact decimal result, ties to the even one, never a floating-point neighbour.

**What every module gets.** Each calculation module is held to 100 % of lines and branches by coverage. Stryker mutation testing holds it to a score of at least 95 %.

## Combining periods (Aggregations and Display Periods)

| Calculation | Rule | Code | Reference | Tests |
|---|---|---|---|---|
| A series by a Display Period | Sum, average or last value of each span's Metric periods. A Metric period belongs to the span its first day falls in, so a week belongs to the month its Monday is in. A period given twice counts once, with the value given last. A span shows once it holds a value and at least half of its periods, rounded up. The span today falls in counts up to its latest value. Aggregation none never combines. Sums and averages are exact. | `src/display-periods.ts`: `seriesBy`, `latestOfEach`, `periodCount`, `valueOver`, `combines`, `displayPeriodsFor`, `isLonger`, `isDisplayPeriod` | `combine.ts`, `calendar.ts`, `exact.ts` | `aggregations.test.ts`, `aggregations-generated-*.test.ts`, `display-periods.test.ts` |
| What a widget shows | The Metric's own periods, or its series by the chosen Display Period when it combines. Otherwise its own periods, with the reason (Aggregation none, inputs not shared). | `src/display-periods.ts`: `shownSeries`, `resolverFrom` | `combine.ts` | `display-periods.test.ts`, `same-number.db.test.ts` |
| A span's name and how full it is | "Q4 2026 to date, 2 of 3 months" for a span not over yet. "Q2 2026, only 2 of 3 months" for one that is over but has gaps. Otherwise the period's name. | `src/display-periods.ts`: `pointName`, `heldText`, `isPartial`, `spanCount`, `dayAfter` | — (words) | `display-periods.test.ts` |
| Target Series combined | A span's target is the Target Series combined by the Aggregation over every Metric period the span counts, where each has one. Otherwise it is the Target Range, unless the values are added up. Otherwise there is none. | `src/display-periods.ts`: `targetsBy` | `combine.ts` (`referenceTargets`) | `aggregations-targets.test.ts`, generated tests |
| Exact sums and averages | Values are read from their shortest text as BigInt fractions, added and divided once, and turned into the nearest double. | `src/exact.ts`: `exactTotal`, `scaled`, `fractionOf`, `fractionOfText`, `nearestDouble`, `nearest`, `lowestTerms`, `bitLength`, `plus`, `minus`, `times`, `over` | `exact.ts` | `exact.test.ts`, every generated test |
| Periods and the Fiscal Year | Weeks start on Monday (ISO). Quarters, halves and years start in the Workspace's first month. A period is named by its first day. | `src/periods.ts`: `periodStart`, `periodEnd`, `shiftPeriod`, `periodsBetween`, `periodStartsIn`, `isPeriodStart`, `periodLabel`, `monthName`, `isYearStart`, `toYearStart` | `calendar.ts` | `periods.test.ts`, every generated test |
| Snapshot and View Link values | A Snapshot keeps the Metric periods that are over by its last day, and is combined as of the day after. A frozen View Link keeps what it showed. | `src/snapshot-periods.ts`: `snapshotPeriod`, `periodContaining`, `completePeriods`, `inSnapshot`, `metricPeriodsIn`, `cutPoints`, `dataAsOfEach`, `dataAsOf` | `combine.ts` (`referenceKept`) | `aggregations-snapshots.test.ts`, `snapshot-periods.test.ts`, `same-number.db.test.ts` |

## Comparisons, changes and Attainment

| Calculation | Rule | Code | Reference | Tests |
|---|---|---|---|---|
| Comparisons | The latest period against the one before (prev), a calendar span to date or in full (DoD, WoW, MoM, QoQ, HoH), or the year before (YoY). YoY is 52 weeks back for a weekly Metric. The Comparison cut puts every span at the same point. | `src/compare.ts`: `compare`, `comparisonsFor`, `resolverFrom` | `combine.ts` | `aggregations-compare.test.ts`, `compare.test.ts` |
| A change and its percentage | The difference of the two values, and that ÷ \|earlier value\| × 100, worked out exactly on the values' text; there is no percentage from 0. It is good when it goes the way the polarity likes, and neither for "closer to target" or no change. | `src/compare.ts`: `compare`; `src/exact.ts`: `difference`, `changePct` | `change.ts` (`referenceChangeOf`) | `changes.test.ts`, `aggregations-compare.test.ts` |
| Attainment | By ratio: value ÷ target (target ÷ value when lower is better), with no percentage for a target at or below 0, or a value at or below 0 when lower is better. By distance: 100 % plus the distance to the target in steps of \|target\|, with none for a target of 0. A range is 100 % inside it. Both are exact. | `src/compare.ts`: `attainment`, `summary`, `targetFor`, `attainmentText`; `src/exact.ts`: `percentOf`, `distancePct` | `attainment.ts` | `changes.test.ts`, `compare.test.ts`, `attainment.test.ts` (reference) |
| The difference to a target | The value minus the bound it is measured against, exactly. Shown where Attainment has no percentage. | `src/compare.ts`: `targetGap` | `change.ts` | `changes.test.ts` |
| Which Attainment method | The Metric's own, else the Workspace's. A Snapshot made before the choice existed keeps ratio. | `src/attainment-method.ts`: `methodFor`, `keptMethod`, `isAttainmentMethod`, `attainmentMethodNote` | — (a choice) | `attainment-method.test.ts`, `attainment-method.db.test.ts` |
| Target status and health | Below the lower bound, above the upper bound, or on the target. Health is bad outside the range, good inside it, and neutral without a range or without a finite value. A bound kept as text reads the same. | `src/format.ts`: `targetStatus`, `health`, `targetText` | `change.ts` (`referenceStatus`, `referenceHealth`) | `changes.test.ts`, `format.test.ts` |
| The Unusual Value check | Unusual when the change in % is larger in size than the step, decided exactly (a change of exactly the step is not). Any change away from 0 is unusual. When the step says so, a value outside the target is unusual too. | `src/workflow-rules.ts`: `unusualReasons`; `src/exact.ts`: `changeBeyond` | `change.ts` (`referenceUnusual`) | `changes.test.ts`, `workflow-rules.test.ts` |
| Due dates and Workflow words | A Due Date is n working days after a period's end, skipping weekends. A Workflow works on the last period that has ended. | `src/workflow-rules.ts`: `addWorkingDays`, `dueDate`, `workingPeriod`, `stepLabel` | — (dates by hand) | `workflow-rules.test.ts` |

## Derived Metrics

| Calculation | Rule | Code | Reference | Tests |
|---|---|---|---|---|
| A formula | + − × ÷, brackets, unary minus, numbers such as 12 or 0.5, and {slug}. Anything else, a missing or extra bracket, two values side by side, or `.5` and `1e3`, is refused. It is exact on the inputs' text. A division by zero or a missing input gives no value. Bounds: at most 500 characters, 50 operations (+ − × ÷ and minus signs) and 20 digits in a number, each refused with its reason. Every step is kept in lowest terms. A numerator or denominator past 8,192 bits gives no value: with values as Ziffr keeps them, no formula within the bounds gets near that. | `src/formula.ts`: `evaluate`, `checkFormula`, `formulaInputs` | `formula.ts` (shunting-yard, exact) | `derived.test.ts` (generated trees, formulas broken on purpose, bounds), `formula.test.ts` |
| A Derived Metric per period | The formula on the latest value of each input, for periods where every input has one. | `src/series.ts`: `buildSeries` | `derived.ts` (`referenceDerivedPeriods`) | `derived.test.ts` |
| A Derived Metric over a span | Each input is combined by its own Aggregation, and counts when it holds at least half of the span. The formula is worked out on those values as they are held (the nearest double). Spans are looked for wherever an input has a value. A span holds what the input with the fewest values holds. | `src/display-periods.ts`: `seriesBy`, `valueOver` | `derived.ts` (`referenceDerivedSeries`) | `derived.test.ts`, for every combination of the inputs' Aggregations, Display Periods and Fiscal Year starts |
| Refusals | Inputs of different periods, or of another period than the Metric's, an input set to Aggregation none, or an input that is a Derived Metric itself are refused with the reason, when the formula is written and wherever the Metric is shown. | `src/formula.ts`: `inputsProblem`, `inputsNotCombined`, `checkFormula` | — (reasons) | `derived.test.ts`, `formula.test.ts`, `formula.db.test.ts` |

## Values as they arrive

| Calculation | Rule | Code | Reference | Tests |
|---|---|---|---|---|
| Reading a number | Either convention, with an optional + or − (both signs), grouping by `.`, `,`, a space or `'`, and k or M. A number with both marks, or a group that is not three digits, reads one way only. A single mark followed by exactly three digits is settled by the Number Style. Anything else is null, and so is a number larger than 10^15. | `src/numbers.ts`: `readNumber`, `numbersIn` | `write.ts` (a generated round trip) | `numbers.test.ts` |
| Reading an answer | Period words come out first. A lone year beside another period word is the value. A year right after a period with no other number in the answer asks back. The named period is checked against the Metric's and the Prompt's. Exactly one number left is the value. | `src/numbers.ts`: `readAnswer`, `findPeriodWords`; `src/numbers/period-words.ts`: `findPeriodWords`, `wordsFor` | — (the sentence table) | `numbers.test.ts`, `answer-languages.db.test.ts`, `submissions.db.test.ts` |
| Answer Languages | English and the languages of the Workspace's country. Only languages with a word file are tried. A US date puts the month first. | `src/numbers/languages.ts`: `answerLanguagesForCountry`, `monthFirstIn`, `checkAnswerLanguages` | — (a table) | `numbers.test.ts` |
| Breakdowns and Target Series lines | "label value" lines read with `readNumber`. A total row is taken as the total. Two rows make a Breakdown. | `src/parse.ts`: `parseBreakdown`; `src/series-lines.ts`: `parseSeriesLine`, `parseSeriesText` | — (the reading table) | `numbers.test.ts`, `series-lines.test.ts` |
| Submission Rules and Breakdown totals | One database call, under a lock on the Metric's period. Overwrite replaces the latest value. Add adds to it, rounded to 6 decimals. Keep both stores another value. Reject keeps the first. The Breakdown goes in with the value: under add, a label already there (in any case) is added to. A Breakdown's total is the value; the sum of its rows is used when it has none. | `record_observation` and `add_to_observation` in `supabase/migrations`; `src/submissions.ts` calls them | — (the rules on concurrent submissions) | `submissions.db.test.ts`, `api-submissions.db.test.ts` |

## Writing values

| Calculation | Rule | Code | Reference | Tests |
|---|---|---|---|---|
| A value with its unit | Rounded to the Metric's decimals, half away from zero, on the value's exact text. Grouped in the Number Style. A unit before has no space; a unit after has one. No minus on a value that rounds to 0. "–" for no number. | `src/format.ts`: `formatValue`, `formatNumber`, `formatPercent` | `write.ts` | `writing.test.ts`, `format.test.ts` |
| A percentage change | One decimal, then " %", signed "+", "−", or "±" when it rounds to zero. | `src/format.ts`: `formatChange` | `write.ts` (`referenceChange`) | `writing.test.ts` |
| Short values | From 10,000 on, k or M with one decimal below 100, never "1000k". Below 10,000, as `formatValue` writes it. | `src/format.ts`: `compactValue` | `write.ts` (`referenceCompact`) | `writing.test.ts` |
| Value axes | About five ticks a step of 1, 2, 2.5 or 5 times a power of ten apart, covering the data; one value gets an axis from 0 (or to 0 when negative). The labels use one notation: all k or M once the largest reaches 10,000, else all in full with the decimals the step needs, never more than the Metric's. | `src/format.ts`: `niceAxis`, `axisLabels` | — (steps by hand) | `format.test.ts` |
| Dates | "4 Nov 2026", from a day, a timestamp or a Date; "–" for an invalid one. | `src/format.ts`: `formatDate` | — (dates by hand) | `format.test.ts` |
| The Number Style and units | The four styles, the style a country usually writes, the unit a money Metric starts with, the side a typed unit is usually written on, and the unit an old Snapshot's Metric shows. | `src/number-style.ts`: `isNumberStyle`, `numberStyleForCountry`, `effectiveNumberStyle`, `numberStyleExample`; `src/units.ts`: `moneyUnit`, `keptUnit`, `isUnitPosition`, `suggestedSide` | — (tables) | `number-style.test.ts`, `format.test.ts`, `units.test.ts` |

## Analyses and exports

| Calculation | Rule | Code | Reference | Tests |
|---|---|---|---|---|
| Correlation | Pearson's r on the periods both Metrics have, at least six of them. The shorter period is combined to the longer, complete periods only. r² = Sxy² ÷ (Sxx · Syy) is exact, and r is ±√ of its nearest double. A series that does not change has none. The strength words go by \|r\| (above 0.7, 0.4, 0.2). | `src/correlation.ts`: `correlate`, `pearson`, `pairUp`, `strength`, `commonPeriod`, `builtFrom`, `comparedBy`, `rankCorrelations`, `periodWord`, `periodCountLabel` | `analyses.ts` (`referencePearson`) | `analyses.test.ts`, `correlation.test.ts` |
| The forecast | Holt's linear trend with α = 1/2 and β = 3/10, exact. The value h periods ahead is level + h · trend. The band is 1.96 · sd · √h, with sd the root of the mean squared one-step error. | `src/forecast.ts`: `forecast` | `analyses.ts` (`referenceHolt`) | `analyses.test.ts`, `forecast.test.ts` |
| Deck export values | The slide's change is the widget's first Comparison, written as `formatChange` writes it. Chart values are rounded as the display rounds them. The chart number format carries the unit on its side. | `src/export-values.ts`: `exportedChange`, `chartValue`, `chartFormatCode` | `write.ts` | `analyses.test.ts`, `export-values.test.ts`, `same-number.db.test.ts` |
| CSV export | The Number Style's decimal mark, no group marks, and every decimal the value has (at most 6). ";" is the separator when the decimal mark is a comma. | `src/export-values.ts`: `csvNumber` | `write.ts` | `analyses.test.ts`, `same-number.db.test.ts` |
| The same number everywhere | A widget, a Snapshot, a live and a frozen View Link, a Comparison, the deck export, the CSV download, the API and the MCP Server all show the reference's number for the same Metric and span; so does an Analysis Recipe in a View Design, in a widget, a Snapshot and a View Link. | all of the above | `combine.ts`, `change.ts`, `write.ts` | `same-number.db.test.ts` (core and web) |

## Analysis Recipes

The functions an Analysis Recipe can use (spec 0024), and running a recipe. Each takes a series in its order (the periods a widget shows) and is exact on the values' text; where there is a square root, it is taken of the double nearest to the exact square, as for Pearson's r.

| Calculation | Rule | Code | Reference | Tests |
|---|---|---|---|---|
| Moving average | The mean of the last n values (2 to 60) at each period, from the n-th value on. Exact. | `src/recipe-functions.ts`: `movingAverage` | `recipes.ts` (`refMovingAverage`) | `recipe-functions.test.ts` |
| Difference | Each value minus the one before, from the second value on. Exact. | `src/recipe-functions.ts`: `difference` | `recipes.ts` (`refDifference`) | `recipe-functions.test.ts` |
| Growth | The change on the period before ÷ \|the one before\| × 100, as a Comparison's percentage; none from 0. Exact. | `src/recipe-functions.ts`: `growth` | `recipes.ts` (`refGrowth`) | `recipe-functions.test.ts` |
| Share | One series ÷ another × 100 on the periods both have; none where the whole is 0. Exact. | `src/recipe-functions.ts`: `share` | `recipes.ts` (`refShare`) | `recipe-functions.test.ts` |
| Linear trend and slope | The least-squares line through the values against their place 0, 1, 2, …: slope Σ(x − x̄)(y − ȳ) ÷ Σ(x − x̄)², through the means. Its value at each period, and the slope alone. None for fewer than two values. Exact. | `src/recipe-functions.ts`: `linearTrend`, `slope` | `recipes.ts` (`refLine`) | `recipe-functions.test.ts` |
| Mean | The values' sum ÷ their count; none for no values. Exact. | `src/recipe-functions.ts`: `mean` | `recipes.ts` (`refMean`) | `recipe-functions.test.ts` |
| Standard deviation | The sample standard deviation, √ of the double nearest to the exact variance Σ(y − ȳ)² ÷ (n − 1); none for fewer than two values. | `src/recipe-functions.ts`: `standardDeviation` | `recipes.ts` (`refVariance`) | `recipe-functions.test.ts` |
| z-score | (y − ȳ) ÷ the standard deviation for each value, as ±√ of the double nearest to the exact z²; none when the values do not vary. | `src/recipe-functions.ts`: `zScore` | `recipes.ts` (`refZ`) | `recipe-functions.test.ts` |
| Seasonal index | The mean of the values in the same place of the season (every L-th value, L from 2 to 53) ÷ the mean of all × 100, for each value. Needs two full seasons and a mean that is not 0. Exact. | `src/recipe-functions.ts`: `seasonalIndex` | `recipes.ts` (`refSeasonal`) | `recipe-functions.test.ts` |
| Correlation in a recipe | Pearson's r as the Correlation Analysis computes it (see above), on the periods both series have; none without six pairs or for a series that does not change. | `src/recipe-functions.ts`: `correlation` | `analyses.ts` (`referencePearson`) | `recipe-functions.test.ts`, `analyses.test.ts` |
| A recipe's output | Its steps in order, each the library's function on a Slot's series or an earlier step's; a Slot left empty gives an empty series. A recipe reaches nothing but its Slots' series. | `src/recipe-run.ts`: `runRecipe` | the rows above | `analysis-recipe.test.ts`, `recipe-functions.test.ts` |

## Mutants that cannot matter

Mutation testing changes the code on purpose and expects a test to fail. A change that leaves every result the same cannot fail a test. Such a mutant is left out in the code with a `// Stryker disable next-line <mutator>: <reason>` comment, and listed here as `file` · mutator · reason. The catalogue test fails when a comment has no line here.

<!-- mutants: one line per disabled mutant, "- `src/file.ts` · Mutator · reason" -->
- `src/exact.ts` · EqualityOperator · The size of a BigInt, `n < 0 ? -n : n`: with `<=`, 0 becomes −0, which for a BigInt is the same number.
- `src/exact.ts` · EqualityOperator · In `nearestDouble`, a first quotient of exactly 2^53 gives the same double whether or not it is divided again: 2^53 + 1 is no double and rounds back to 2^53.
- `src/exact.ts` · EqualityOperator · `over` never divides by 0, so testing the divisor with `<=` instead of `<` changes nothing.
- `src/formula.ts` · Regex · Reading white space one character at a time instead of a run at a time leaves the same tokens, as white space is left out either way.
- `src/formula.ts` · EqualityOperator · The 8,192-bit bound is a safety limit, not a rule of results: no value Ziffr keeps, in a formula within the bounds, comes to exactly 8,192 bits, so `>=` and `>` give the same.
- `src/formula.ts` · ConditionalExpression · A numerator past 8,192 bits with a denominator within the bound is a value past the doubles, which `evaluate` gives no value for anyway; checking the numerator keeps the work small, and leaving it out changes no result.
- `src/format.ts` · EqualityOperator · In `signed`, `v < 0` as `v <= 0` differs only at 0, whose digits hold no 1-9, so no minus is written either way.
- `src/format.ts` · EqualityOperator · In `compactValue`, `x < 100` as `x <= 100` differs only at exactly 100, where both sides give 100.
- `src/format.ts` · EqualityOperator · In `compactValue`, `v < 0` as `v <= 0` cannot differ: a value there is at least 10,000 in size, so it is never 0.
- `src/format.ts` · EqualityOperator · In `formatChange`, `pct > 0` as `pct >= 0` cannot differ: a change of 0 has no 1-9 in its digits and is written "±" before the sign is asked.
- `src/format.ts` · StringLiteral · `formatPercent` puts "%" on the side "after"; every side but "before" stands after, so an empty side writes the same.
- `src/parse.ts` · Regex · In `parseBreakdown`, the line pattern without its `^` finds the same first match: a match that starts later in the line also starts at 0, because the lazy label `(.+?)` takes any prefix.
- `src/numbers/period-words.ts` · EqualityOperator · Two period words never touch, so one never starts at the position where another ends: every pattern ends with a lookahead that forbids a letter or digit right after it, and every pattern starts with a digit or a letter (the words a pattern can start with are checked to start with a letter in `numbers.test.ts`). So `<` and `<=` keep the same words.
- `src/compare.ts` · ConditionalExpression · Attainment by distance where higher is better: without a lower bound the percentage is null either way, as `pct` gives null for a target that is not a finite number and Number.isFinite(null) is false.
- `src/compare.ts` · ConditionalExpression · Attainment by distance where lower is better: without an upper bound the percentage is null either way, for the same reason.
- `src/compare.ts` · EqualityOperator · The difference to a target range: a value exactly on the lower bound is 0 from it, which is what inside the range gives too.
- `src/compare.ts` · EqualityOperator · The difference to a target range: a value exactly on the upper bound is 0 from it, which is what inside the range gives too.
- `src/correlation.ts` · EqualityOperator · The sign word of a correlation: an r of 0 is "no clear" before the sign is named, so `r >= 0` and `r > 0` never differ.
- `src/display-periods.ts` · ConditionalExpression · A Derived Metric's value over a span: `evaluate` gives none for a formula missing an input, so stopping at the first input without a value only saves the work.
- `src/display-periods.ts` · EqualityOperator · A span to date is cut at the latest value: a latest value on the span's last day cuts it on that day with `<=` and `<` alike.
- `src/display-periods.ts` · ArrayDeclaration · A widget's targets without a Target Series: targetsBy keeps only targets on a Metric period's first day, so a list holding anything else is the empty list.
- `src/workflow-rules.ts` · EqualityOperator · An Unusual Value's direction: the change is 0 % only for an unchanged value, and the check takes a step below 0 % as 0 %, so it never calls an unchanged value unusual and `pct > 0` and `pct >= 0` never differ.
- `src/workflow-rules.ts` · EqualityOperator · A change from 0: the value is not 0 on that line, so `value > 0` and `value >= 0` never differ.
- `src/workflow-rules.ts` · ConditionalExpression · An Unusual Value without an earlier value: `changeBeyond` is false for one that is not a finite number, so the check that there is one only keeps the types right.
- `src/compare.ts` · EqualityOperator · Whether a change is good: a change of 0 is neither before the sign is read, so `abs > 0` and `abs >= 0` never differ.
- `src/recipe-functions.ts` · ArithmeticOperator · The common scale of the values only needs to be a multiple of every denominator: a scale ten times larger makes every value ten times larger and gives the same results.
- `src/recipe-functions.ts` · EqualityOperator · A seasonal index of values that add up to 0 returns nothing before the sign is read, so `all <= 0` and `all < 0` never differ.
- `src/recipe-run.ts` · StringLiteral · The kind of a Slot's result is never read: `seriesOf` takes its points.
- `src/recipe-run.ts` · ArrayDeclaration · A Slot left empty is an empty series; a series holding something that is no value gives the same, as every function leaves out what is not a finite value.
