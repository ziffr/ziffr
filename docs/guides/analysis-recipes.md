# Writing an Analysis Recipe

An **Analysis Recipe** is an Analysis written as steps of Ziffr's verified functions over the Metrics in its Slots. It holds no code, so every number it gives is one Ziffr computed and verified (spec 0022). This guide is for analysts who want a moving average, a seasonality check or a z-score without changing Ziffr.

The exact format is the JSON Schema in [`docs/reference/analysis-recipe.schema.json`](../reference/analysis-recipe.schema.json). Every function is in the [Calculation Catalogue](../reference/calculations.md#analysis-recipes) with its rule, its reference implementation and its tests.

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

## Forecast and correlation

The **Correlation** recipe is the same Pearson's r the Correlation Analysis computes. The Correlation, Correlation matrix and Drivers widgets stay built in: before computing r, they combine a Metric of a shorter period to the other's longer period by its Aggregation, which is not a step on a series. The **Forecast** stays built in too: Holt's method smooths each value into the next, which no composition of these functions writes exactly.

## What Ziffr refuses

Everything a View Design's checks refuse, and also: a function the library does not have, a missing or extra parameter, a step that reads a later step or a Slot the recipe does not have, two steps with one name or a step named like a Slot, a value where a series belongs, and an output of no step. A recipe file is at most 32 KiB.
