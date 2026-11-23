# Writing an Analysis Recipe

An **Analysis Recipe** is an Analysis written as steps of Ziffr's verified functions over the Metrics in its Slots. It holds no code, so every number it gives is one Ziffr computed and verified (spec 0022). This guide is for analysts who want a moving average, a seasonality check or a z-score without changing Ziffr.

The exact formats are the JSON Schemas in [`docs/reference/analysis-recipe.schema.json`](../reference/analysis-recipe.schema.json) (`ziffr.analysis/1`) and [`docs/reference/analysis-recipe-2.schema.json`](../reference/analysis-recipe-2.schema.json) (`ziffr.analysis/2`, described [below](#format-2)). Every function is in the [Calculation Catalogue](../reference/calculations.md#analysis-recipes) with its rule, its reference implementation and its tests.

## A recipe

```json
{
  "format": "ziffr.analysis/1",
  "name": "Smoothed growth",
  "slots": [{ "label": "Metric" }],
  "steps": [
    { "id": "smooth", "fn": "movingAverage", "of": "slot1", "window": 3 },
    { "id": "grow", "fn": "growth", "of": "smooth" },
    { "id": "typical", "fn": "mean", "of": "grow" }
  ],
  "outputs": [
    { "step": "smooth", "label": "Three-month average", "unit": "metric" },
    { "step": "grow", "label": "Growth of the average", "unit": "percent" },
    { "step": "typical", "label": "Average growth", "unit": "percent" }
  ]
}
```

- **`slots`**: up to four. A recipe reads its Slots as `slot1` to `slot4` and nothing else: it cannot name a Metric.
- **`steps`**: up to twelve, in order. Each has an `id` (a letter, then letters and digits), a function `fn`, what it works on (`of`: a Slot or an earlier step), a second series (`with`) where the function takes one, and its parameter.
- **`outputs`**: up to six steps to show, each with a `label` and a `unit`: `metric` (the Metric's unit and decimals), `percent`, or `number` (two decimals).

## The functions

| Function | Gives | Rule |
|---|---|---|
| `movingAverage` (`window` 2 to 60) | a series | The mean of the last n values, from the n-th on. |
| `difference` | a series | Each value minus the one before. |
| `growth` | a series | The change on the one before in %, none from 0. |
| `share` (`with`) | a series | The first series ÷ the second × 100, on the periods both have. |
| `linearTrend` | a series | The least-squares line through the values, at each period. |
| `slope` | a value | How much that line rises per period. |
| `mean` | a value | The mean of the values. |
| `standardDeviation` | a value | The sample standard deviation (n − 1). |
| `zScore` | a series | How many standard deviations each value lies from the mean. |
| `seasonalIndex` (`season` 2 to 53) | a series | Each value's place in the season against the mean of all, in %; needs two full seasons. |
| `correlation` (`with`) | a value | Pearson's r on the periods both have, at least six. |

Every function is exact on the values as they were sent: 0.1 + 0.2 is 0.3. A standard deviation or z-score is the square root of the double nearest to the exact square. A step that gives one value cannot feed a step that needs a series; the checks say so.

New functions come only with Ziffr itself, each with its row in the Calculation Catalogue, an independent reference and generated tests. A recipe can never add one.

## Drawing a recipe

A recipe is drawn by a View Design that carries it under `analysis`. The recipe's Slots are the design's first Metrics, in order, each as the widget shows it: by quarter when it is shown by quarter, as of its day in a Snapshot. Its outputs are shown as `recipe.` and the step:

```json
{ "mark": "line", "show": "recipe.smooth", "tone": "muted", "dash": true }
{ "mark": "rule", "show": "recipe.typical" }
{ "mark": "text", "content": ["Average growth ", { "show": "recipe.typical" }] }
```

A series can be a line or bars; one value can be a rule or a number in words (a series in words shows its latest value). In the Playground, **Start from** offers every built-in recipe inside a design that draws it: moving average, growth, linear trend, seasonality, unusual periods (z-score), correlation and share of a total.

## Format /2

`ziffr.analysis/2` is the format for recipes that use the newer Methods. Ziffr reads `/1` for ever, unchanged, and a recipe that needs nothing new may stay in `/1`; write `/2` when a recipe uses a function that only it has. A file in `/1` that names one of those functions is refused, and says which functions `/1` has.

What a step gives is one of four kinds, and each function says which kind it takes:

- a **series**: values by period;
- one **value**;
- a **table**: rows, each with a label and a number;
- a **fit**: what a fit step holds. A recipe cannot show a fit itself; it can only pass it to `importance`, or show its Takeaway.

```json
{
  "format": "ziffr.analysis/2",
  "name": "What goes with revenue",
  "slots": [{ "label": "Metric" }, { "label": "Compared with" }, { "label": "Held the same" }],
  "steps": [
    { "id": "lags", "fn": "laggedCorrelation", "of": "slot1", "with": "slot2", "maxLag": 3 },
    { "id": "usual", "fn": "usualRange", "of": "slot1" },
    { "id": "model", "fn": "fit", "of": "slot1", "drivers": ["slot2", "slot3"] },
    { "id": "shares", "fn": "importance", "of": "model" }
  ],
  "outputs": [
    { "step": "lags", "label": "By delay", "shows": "table" },
    { "step": "shares", "label": "Shares", "shows": "table" },
    { "step": "usual", "label": "Usual", "shows": "takeaway", "title": "What is usual" },
    { "step": "model", "label": "What moves it", "shows": "takeaway", "note": "Worked out from the history." }
  ]
}
```

The functions of `/1` are all there, and these are new:

| Function | Takes | Gives | Rule |
|---|---|---|---|
| `changes` | a series | a series | Each value's change on the period before. |
| `detrended` | a series | a series | Each value less the series' own straight-line trend. |
| `quantile` (`percent` 1 to 99) | a series | a value | The percentile, by interpolating between neighbours (type 7). |
| `spearman` (`with`) | two series | a value | Rank correlation; none without six pairs or for a series that does not change. |
| `partialCorrelation` (`with`, `controls` 1 to 4) | series | a value | The link of the first two with the others held the same. |
| `laggedCorrelation` (`with`, `maxLag` 0 to 6) | two series | a table | A row for each delay: "Same month", "1 month later", …, each with its r. |
| `usualRange` | a series | a table | Usual low, lower quartile, median, upper quartile, usual high. |
| `fit` (`drivers` 1 to 6) | series | a fit | The target (`of`) and its drivers, each effect with the others held the same. |
| `importance` | a fit | a table | Each driver's share of what the fit explains; the shares add up to 1. |

Each is the Method of the same name in the [Methods guide](methods.md), with its minimums and its refusals: where a Method has no answer for the data, a value is empty, a table has no rows, and a Takeaway says in words what is missing. A change too large to be a number is left out of a series, as everywhere in the library.

**Outputs.** Each output says what it `shows`: `series`, `value`, `table` or `takeaway`. A series or a value also names its `unit` (as in `/1`); a table or a Takeaway has none. A Takeaway is available for `spearman`, `partialCorrelation`, `laggedCorrelation`, `usualRange` and `fit`, and is the Method's own: its sentence, strength, range, cautions and footer are written by Ziffr, in the same words as in the Analysis Canvas, and a recipe adds only a `title` and a `note` in plain text. A Takeaway names Metrics and their units, so it is worked out from Slots, not from another step. A Takeaway always uses the Method's own settings (a lagged correlation Takeaway looks at all six delays, so it needs `maxLag` 6), and compares two Metrics that both grow by their changes, as everywhere.

**Limits.** At most 4 Slots, 12 steps, 6 outputs, 4 controls and 6 drivers; at most 40 inputs named across all steps and 2 fits; a file of at most 32 KiB and 6 levels deep; names, titles and notes in plain text as in `/1` (a title up to 60 characters, a note up to 200). A recipe works on the latest 120 values of each Slot. Metrics of different periods are not compared: every output says to show them by the same period. A series with more than 20 decimal places, or a value above 100,000,000,000,000,000,000, is not worked out exactly in a fair time: this holds for a Slot's values and for what a step makes of them (a difference, a z-score, a line's misses), and every output that depends on it says so in words. A run also has a fixed work budget, counted in work units from the steps and the length and width of the series (never the clock), so the same recipe on the same data stops at the same step everywhere; the steps after it, and any Takeaway, say that the recipe asks for too much. A unit is about 10 microseconds of one core, a recipe's budget is 12,000 units (about 120 ms), and all the recipes drawn on one page (a dashboard, a View Link, a Snapshot) share 50,000 units: once the page has spent its share, the widgets after that, in the order they are drawn, say "Too much analysis on this page to work out at once: open the widget on its own." A series may also not spread more than 1e20 between its largest value and its smallest that is not 0.

**What a step costs.** At 120 values of 6 digits or fewer at one scale (the numbers are exact, so wider numbers cost more: the work grows with (digits ÷ 6)², and a step made of a wide series is charged at its width). Measured on a laptop under load, so the times are on the high side; a calibration check (`recipe-calibration.test.ts`, run with `RECIPE_CALIBRATION=1`, not part of the normal run because wall-clock times are noisy) fails if any kind takes more than three times the median microseconds per unit; run it when a step or the budget changes.

| Kind | Units charged (n values) | Measured |
|---|---|---|
| `changes`, `movingAverage`, `quantile`, and every other step of `/1` | n | about 1 ms |
| `detrended` | 5n | about 5 ms |
| `spearman` | 2n | about 1.5 ms |
| `laggedCorrelation` | n × (delays + 2) | about 6 ms at 6 delays |
| `partialCorrelation` | 1.5n × (controls + 2) | 2 to 6 ms at 2 to 4 controls |
| `fit` | 1.5n × (drivers + 1)² | 6 ms with 1 driver, 15 ms with 3, 65 to 85 ms with 6 (importance included) |
| Takeaway of `spearman` | 5n | about 4 ms |
| Takeaway of `laggedCorrelation` | 55n | about 65 ms |
| Takeaway of `partialCorrelation` | 9n × (controls + 1)² | about 85 ms at 2 controls, about 200 ms at 4 |
| Takeaway of `usualRange` | 83n | about 100 ms |
| Takeaway of `fit` | 10n | about 14 ms |

**Which basis.** `spearman` and `laggedCorrelation` compare two series by their changes where both grow, and by value otherwise, the same rule as their Takeaway; the output names the basis ("compared by change, growth removed"). `partialCorrelation` compares by value, as its own Takeaway says. Two series that grow by exactly the same step each month have no change to compare, and say so.

**Rendering.** A table's rows and a Takeaway's `title` and `note` come from a recipe's author, so a surface that shows them must show them in a plainly separate note style, never beside or in the place of Ziffr's own sentence, strength word or footer. Ticket 9 (the marks) must keep to this.

**What is drawn.** A View Design draws a recipe's series and values with marks, as for `/1`. A table or a Takeaway has no mark yet, and a mark that names one is refused with that said.

## Forecast and correlation

The **Correlation** recipe is the same Pearson's r the Correlation Analysis computes. The Correlation, Correlation matrix and Drivers widgets stay built in: before computing r, they combine a Metric of a shorter period to the other's longer period by its Aggregation, which is not a step on a series. The **Forecast** stays built in too: Holt's method smooths each value into the next, which no composition of these functions writes exactly.

## What Ziffr refuses

Everything a View Design's checks refuse, and also: a function the library does not have, a missing or extra parameter, a step that reads a later step or a Slot the recipe does not have, two steps with one name or a step named like a Slot, a value where a series belongs, and an output of no step. A recipe file is at most 32 KiB.

In `/2` also: an input of the wrong kind (a value where a series belongs, a table where a fit does), a list with a name twice, an output that does not match what its step gives, a Takeaway of a function that has none or of one that works on another step, a `unit` on a table or a Takeaway or none on a series, and more than 40 inputs or 2 fits.
