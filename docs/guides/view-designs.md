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
- **`options`**: what a person may change when placing it. The keys are fixed: `window` and `rows` (counts from 1 to 120), `showTarget` and `showForecast` (true or false), `display` (Show by).
- **`empty`**: what the design says while a Slot is empty.
- **`parts`**: what it draws, top to bottom.

### Parts

| Part | What it draws |
|---|---|
| `text` | Words and values. `content` is a list of plain texts and `{ "show": … }` values; `style` is `headline`, `value`, `caption`, `body` or `note`. A value can have `before` and `after` words and be `strong`. |
| `group` | Parts side by side (`direction: "row"`) or stacked (`"column"`), `align: "center"` to centre them. |
| `plot` | A chart. `axes`: `none`, `compact` or `regular`. `x`: `period` (default) or `value` for pairs. `grid`: `none`, `horizontal`, `both`. `scale`: `padded`, `auto` or `tight`. `marks` are drawn in order. |
| `gauge` | Where the latest value sits against the target. |
| `rows` | Table rows: `values` (the latest values, `limit` rows), `correlations` (Metrics ranked by how they move with the first), `matrix` (every pair) or `reasons` (why a Metric was left out). |
| `polar` | Values around a circle: `show` is `values` (the Metric's last periods) or `recipe.` and a step of the analysis that gives a series. The periods are the angles, oldest first from the top, and the distance from the centre is the value, with 0 at the centre. It starts at the first period with a value and draws 3 to 12 periods; a period without a value is a gap (never a 0), and a period still running is written but not placed and does not set the rim. The line joins the last period to the first only for one whole cycle (12 months, 4 quarters) with a value at both ends. The scale always starts at 0 (a real zero), so a Metric that stays high looks like a circle; when the values are within 30 % of the highest the chart says so. It refuses a value below 0, which a line shows better. Use it for a pattern that repeats, such as the months of a year. |
| `radar` | Several Metrics as spokes on one shape, in the order of the design's Slots, 3 to 12 of them (a Slot of several with `min`: 3, or three Slots). `show` is `latest`. Each spoke has **its own scale**, as the Metrics are not counted in the same unit: its lowest value of the periods shown is on a small inner ring (never at the centre, so it does not look like no value) and its highest at the rim, and further out means a higher value, not a better one, so the shape says where each value sits in its own range, not which Metric is larger. The chart says so in words, and its text alternative lists every value in spoke order. `against: "previous"` adds the period before as a dashed shape with square dots. A Metric with no value in the periods shown is a gap, never its older value; a period still running or with gaps in it says so in its label; one with the same value in every period has no range, and is written but not placed. |
| `heatmap` | One Metric's periods as a grid of squares shaded by value, `show` is `values`. A Metric by **day** has weeks in columns (oldest to newest, the week starting Monday) and the weekdays in rows; by **week**, ISO years in rows and ISO weeks 1 to 53 in columns (week 53 only in a year that has one); by **month**, years of the Workspace in rows and the twelve months from its year start in columns. A Metric by quarter or year is refused in words. The option `window` counts weeks for a daily Metric (default 26) and years for the others (at its default, 3 years by week and 5 by month; at most 20). Years or weeks before the Metric's first value are not drawn. Colour is the data tone in five steps by each value's rank among the squares drawn, so a few large values do not wash out the rest; **darker is a higher value, never a better one**, also for a Metric where lower is better, and the heatmap never uses the colours of on or off target. A period with no value is an empty outline (never a 0); a place that is no period is not drawn. A constant series is one step and says "All values are the same". Under the grid, a legend gives the lowest and highest value in the Metric's own format, and the text alternative names the five highest and five lowest squares. |

### Marks in a plot

| Mark | Shows |
|---|---|
| `line` | `values`, `forecast`, `target.line` (a Target Series by its spans), or a recipe's series. `detail: "full"` draws points and spans still running dotted. `weight`: `light`, `regular`, `strong`. `dash`: true. |
| `area` | `forecast.range`, the forecast's band. |
| `bar` | `values` (one bar per period), or a recipe's series. |
| `point` | `pairs` (the first Metric against the second) or `drivers.pairs`. |
| `band` | `target`, the Target Range. |
| `rule` | `target.min`, `target.max`, or one value of a recipe. |

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
