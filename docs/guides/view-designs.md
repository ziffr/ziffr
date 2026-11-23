# Writing a View Design

A **View Design** is a View written as a file: which Metrics it takes, what it draws, which value each mark shows and in which Theme colours. It holds no code. Ziffr checks the file and draws it with its own renderer, the one that draws every built-in View. This guide is for designers who want a View Ziffr does not have.

The exact format is the JSON Schema in [`docs/reference/view-design.schema.json`](../reference/view-design.schema.json), generated from the definition the checks run. This page explains it with examples.

## Start from something that works

- **Export a built-in View.** On **Analyze → View Designs**, every built-in View has **Export**. You get two files: `line-chart.view.json`, the design, and `line-chart.sample.json`, Sample Data that fits its Slots. Neither holds any of your Workspace's values.
- **Duplicate a widget.** A widget's **⋯** menu has **Duplicate as View Design**. You get the same files, with the widget's settings (how many periods, target band, forecast) as the design's defaults.
- **Use the Playground.** **Analyze → Playground** shows the file and its drawing side by side. **Start from** loads any built-in View, or an Analysis Recipe inside a design that draws it.

## The file

```json
{
  "format": "ziffr.view/1",
  "name": "Bars with the target's top",
  "description": "Bars per period, with the upper end of the target range as a line.",
  "kind": "metric",
  "slots": [{ "label": "Metric", "metrics": "one" }],
  "size": { "w": 6, "h": 6 },
  "options": {
    "window": { "label": "Periods", "default": 12 },
    "showTarget": { "label": "Show target", "default": true },
    "display": { "label": "Show by" }
  },
  "parts": [
    {
      "mark": "plot", "axes": "compact", "scale": "auto",
      "marks": [
        { "mark": "band", "show": "target", "when": ["showTarget"] },
        { "mark": "bar", "show": "values", "tone": "status" },
        { "mark": "rule", "show": "target.max", "tone": "accent" }
      ]
    },
    { "mark": "text", "style": "note", "when": ["hasNote"], "content": [{ "show": "target.note" }] }
  ]
}
```

- **`format`** is always `ziffr.view/1`. Ziffr keeps reading every version it has published.
- **`kind`**: `metric` for a View of one Metric, `analysis` for one that compares Metrics.
- **`slots`**: the Metrics it takes, in order. Each is `one` Metric or `several` (with `min` for how many it needs).
- **`size`**: grid columns (1 to 12) and rows (2 to 24) when placed.
- **`options`**: what a person may change when placing it. The keys are fixed: `window` and `rows` (counts from 1 to 120), `showTarget` and `showForecast` (true or false), `display` (Show by), `slope` (what a slope mark compares: `auto`, `previous`, `year` or `metrics`).
- **`empty`**: what the design says while a Slot is empty.
- **`parts`**: what it draws, top to bottom.

### Parts

| Part | What it draws |
|---|---|
| `text` | Words and values. `content` is a list of plain texts and `{ "show": … }` values; `style` is `headline`, `value`, `caption`, `body` or `note`. A value can have `before` and `after` words and be `strong`. |
| `group` | Parts side by side (`direction: "row"`) or stacked (`"column"`), `align: "center"` to centre them. |
| `plot` | A chart. `axes`: `none`, `compact` or `regular`. `x`: `period` (default) or `value` for pairs. `grid`: `none`, `horizontal`, `both`. `scale`: `padded`, `auto` or `tight`. `marks` are drawn in order. |
| `gauge` | Where the latest value sits against the target. |
| `range` | One bar per row, from its low to its high end, with its middle value: a driver's effect with its range. `show` is `recipe.` and the step of a `effects` step of the design's analysis (format `ziffr.analysis/2`). |
| `bridge` | Steps from a start, each part going up or down, and an end. `show` is `recipe.` and the step of a `bridge` step of the design's analysis. |
| `rows` | Table rows: `values` (the latest values, `limit` rows), `correlations` (Metrics ranked by how they move with the first), `matrix` (every pair) or `reasons` (why a Metric was left out). |
| `polar` | Values around a circle: `show` is `values` (the Metric's last periods) or `recipe.` and a step of the analysis that gives a series. The periods are the angles, oldest first from the top, and the distance from the centre is the value, with 0 at the centre. It starts at the first period with a value and draws 3 to 12 periods; a period without a value is a gap (never a 0), and a period still running is written but not placed and does not set the rim. The line joins the last period to the first only for one whole cycle (12 months, 4 quarters) with a value at both ends. The scale always starts at 0 (a real zero), so a Metric that stays high looks like a circle; when the values are within 30 % of the highest the chart says so. It refuses a value below 0, which a line shows better. Use it for a pattern that repeats, such as the months of a year. |
| `radar` | Several Metrics as spokes on one shape, in the order of the design's Slots, 3 to 12 of them (a Slot of several with `min`: 3, or three Slots). `show` is `latest`. Each spoke has **its own scale**, as the Metrics are not counted in the same unit: its lowest value of the periods shown is on a small inner ring (never at the centre, so it does not look like no value) and its highest at the rim, and further out means a higher value, not a better one, so the shape says where each value sits in its own range, not which Metric is larger. The chart says so in words, and its text alternative lists every value in spoke order. `against: "previous"` adds the period before as a dashed shape with square dots. A Metric with no value in the periods shown is a gap, never its older value; a period still running or with gaps in it says so in its label; one with the same value in every period has no range, and is written but not placed. |
| `progress` | One compact bar per Metric of the design's Slots, in order, up to 12 (a Slot of several). `show` is `latest`. Each bar is filled from 0 to the latest value on a scale that ends a little past the highest of the value and the target, so a target is always on the bar: a lighter band for a range, a tick for one limit. The name, the value and, in words, the Attainment ("92 % of target", or the distance where there is no percentage) sit beside it, and an off-target value says which way ("too low"). Green or red says only whether the value is on target; a Metric without a target is drawn plain and says "No target", one without a value says "No value yet". The target is the Target Series' value of the latest period if there is one, else the Metric's Target Range. |
| `scoreboard` | One table for several Metrics, a row each in the order of the design's Slots, 3 to 12 of them (a Slot of several with `min`: 3, or three Slots). `show` is `latest`. A row has the Metric's name, its latest value in the Workspace's Number Style and the Metric's unit, the change against the previous period (an arrow and a signed percent, in the text colour: colour only ever means on or off target), the on or off target chip in words, and a small trend of the periods set by the `window` option. A Metric with no value yet says so in its row; one whose latest period is not the newest, or is still running, says which period it is. |
| `stacked` | One bar per period of the Metric's **Breakdown**: `show` is `breakdown`. The largest rows of the newest period (at most 5) are segments of their own, in that order and with the same colour in every bar; every other row, and any row the newest period does not have, is one muted **Other** segment. A bar's height is the sum of its rows, which need not add up to the Metric's value (it says when they do not). A period without a Breakdown is left out, and the chart says how many; a Breakdown with a negative row is refused in words. The `window` option counts the periods, 12 by default. |
| `pareto` | The rows of the Metric's latest Breakdown as bars from largest to smallest with a line of the running share of the total (0 to 100 %) and a reference at 80 %. `show` is `latest`. At most 10 rows are drawn; the rest are one muted "Other" bar at the end, which is not sorted among the rows and where the line reaches 100 %. A caption says how many rows make up 80 % ("3 of 12 rows make up 80 %"), counted over all rows. Only positive rows count (a row of 0 is left out); a Breakdown with a negative row is refused in words ("Pareto needs positive rows"). The Metric of the first Slot is used; one without a Breakdown says so. |
| `slope` | Two points per row joined by a line, on two vertical axes (before on the left, now on the right), up to 12 rows. `show` is `latest`. The option `slope` chooses what is compared: the rows of the first Metric's Breakdown in the latest period against the period before (`previous`) or the same period a year earlier (`year`); several Metrics (`metrics`, 2 to 12, all in one unit, each Metric's latest value against its own previous period); or `auto`, which follows what was placed (several Metrics, else the rows of a Breakdown). Both axes share one scale, from the lowest value to the highest, which is not 0, and the chart says so. Every line is in the data tone; only the row with the largest rise and the one with the largest fall take the accent, and both say so in words ("Largest rise", "Largest fall"). Each end has a label with its value, the right one also the change ("+1,200 € (+8.0 %)"), and labels that would touch are moved apart. A row in only one of the two periods is "new" or "gone", never a 0. With more than 12 rows the 12 with the most at stake are drawn, and it says so. Metrics in different units are refused ("Slope charts compare Metrics in one unit"); one Metric without a Breakdown asks for a Metric with a Breakdown or several in one unit. |

### Marks in a plot

| Mark | Shows |
|---|---|
| `line` | `values`, `forecast`, `target.line` (a Target Series by its spans), or a recipe's series. `detail: "full"` draws points and spans still running dotted. `weight`: `light`, `regular`, `strong`. `dash`: true. |
| `area` | `forecast.range`, the forecast's band. |
| `bar` | `values` (one bar per period), or a recipe's series. |
| `point` | `pairs` (the first Metric against the second) or `drivers.pairs`. |
| `band` | `target`, the Target Range. |
| `rule` | `target.min`, `target.max`, or one value of a recipe. |
| `range` | `forecast.range`: the forecast's likely range at each period as a bar from low to high; `centre: true` marks the forecast in it. |

### Values in words

`metric.name`, `latest.value`, `latest.period`, `latest.status` (on or off target), `latest.approval`, `target.note`, `forecast.value`, `forecast.period`, `forecast.low`, `forecast.high`, `correlation.strength`, `correlation.r`, `correlation.over`, `drivers.name`, `drivers.strength`, `drivers.over`, and `recipe.` with a step of the design's Analysis Recipe. Every one is written by Ziffr in the Workspace's Number Style, never computed by the design.

### When a part is drawn

`when` lists conditions that must all hold: the options `showTarget` and `showForecast`, and `hasForecast`, `hasNote` (Ziffr has a note about the target, such as a span with gaps) and `manyValues` (two or more values).

### Colours

`tone` is always a Theme role: `data`, `muted`, `ink`, `good`, `bad`, `accent`, or `status` (by the target: bad when off target). So a design fits every Theme. There is no way to name a colour, a font or a size.

## What Ziffr refuses

A file is refused, with every problem named by its path and line, when it:

- is not JSON, is larger than 64 KiB, or is nested more than 10 deep;
- has a field Ziffr does not know, or a field twice;
- has a text with `<` or `>`, braces, brackets, a backslash, a line break, or a web address or scheme (`://`, `www.`, `javascript:`, `data:`, `url(`);
- is in a format version this Ziffr does not read;
- breaks a limit: 4 Slots, 12 parts at the top and in a group, 12 marks in a plot, 12 pieces in a text, 48 parts and marks in all, names up to 80 characters, descriptions 300, labels 60, texts 200;
- uses an option it does not declare, pairs or correlations with one Metric, or a recipe output it does not have.

Ziffr runs the same checks in the Playground as you type and on the server whenever a design is saved.

## Bringing it back

Owners and Admins add a design on **Analyze → View Designs** (paste or upload) or from the Playground. Everyone in the Workspace then finds it in the Pool under **The Workspace's View Designs**. A widget keeps its own copy of the design, so removing the design from the Workspace changes no widget already placed.

In PowerPoint, a design whose only drawn mark (besides the target and the forecast) is the values as a line or bars becomes an editable chart; rows of values become a table; the latest value with its period and status becomes text; anything else becomes a picture.
