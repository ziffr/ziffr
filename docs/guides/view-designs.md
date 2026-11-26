# Writing a View Design

A **View Design** is a View written as a file: which Metrics it takes, what it draws, which value each mark shows and in which Theme colours. It holds no code. Ziffr checks the file and draws it with its own renderer, the one that draws every built-in View. This guide is for designers who want a View Ziffr does not have.

The exact format is the JSON Schema in [`docs/reference/view-design.schema.json`](../reference/view-design.schema.json), generated from the definition the checks run. This page explains it with examples.

## Start from something that works

- **Export a built-in View.** On **Workspace → Library**, every built-in View has **Export**. You get two files: `line-chart.view.json`, the design, and `line-chart.sample.json`, Sample Data that fits its Slots. Neither holds any of your Workspace's values.
- **Duplicate a widget.** A widget's **⋯** menu has **Save as…** → **View Design**, and **Download View Design file** for the design as it is. You get the same files, with the widget's settings (how many periods, target band, forecast) as the design's defaults.
- **Use the Playground.** the Playground in **Workspace → Library** shows the file and its drawing side by side. **Start from** loads any built-in View, or an Analysis Recipe inside a design that draws it. Its editor offers the fields and values the format allows at the cursor (Ctrl+Space asks for them) and shows what a field means when you point at it, all read from the schema below. Both **Workspace → Library** and the Playground link to this guide.

## Help in your own editor

Every file Ziffr writes starts with a `$schema` line:

```json
{
  "$schema": "https://docs.ziffr.net/schemas/ziffr.view-1.json",
  "format": "ziffr.view/1",
```

Editors such as VS Code read it and give completion, hover help and warnings on their own. The address is stable and belongs to the format (`ziffr.view/1`), and the same schema is [`docs/reference/view-design.schema.json`](../reference/view-design.schema.json). `$schema` is the one extra top-level field Ziffr accepts: it must be a string of at most 200 characters, it is never fetched, Ziffr does not keep it in the design it checks, and writing a design out always puts Ziffr's own address there. Every other unknown field is still refused.

## The built-in Views as designs

Every built-in View below is itself a View Design, so you can export it from **Workspace → Library** and change it. A test fails when a built-in design is missing from this table. "Needs" is what the data must hold; when it does not, the Metric is not offered for the View, or the widget says so in words.

| View | Made of | Needs |
| --- | --- | --- |
| Number + sparkline (`number`) | `text`, `text`, `plot` with a `line` of `values` | One Metric. |
| Line chart (`line`) | `plot` with `band`, `area`, `line` marks (target, forecast, values), `text` | One Metric. |
| Bars per period (`bars`) | `plot` with a `band` of the target and `bar` of `values`, `text` | One Metric. |
| Gauge vs. target (`gauge`) | `group`, `gauge` (`latest`), `text` | One Metric. |
| History table (`table`) | `rows` with `show: "values"`, `text` | One Metric. |
| Forecast (`forecast`) | `text`, `plot` with `line` of `forecast` and an `area` of `forecast.range` | One Metric with at least 4 values. |
| Correlation (`correlation`) | `text`, `plot` with a `point` mark of `pairs` | Two Metrics with at least 6 periods in common. |
| Correlation matrix (`matrix`) | `rows` with `show: "matrix"`, `rows` with `show: "reasons"` | At least 2 Metrics; a pair with fewer than 6 periods in common is listed under the reasons. |
| Drivers (`drivers`) | `rows` with `show: "correlations"`, `text`, `rows` with `show: "reasons"`, `plot` with `point` of `drivers.pairs` | One Metric and several to compare it with, each with at least 6 periods in common. |
| Scoreboard (`scoreboard`) | `scoreboard` with `show: "latest"` | 3 to 12 Metrics. |
| Progress against target (`progress`) | `progress` with `show: "latest"` | Up to 12 Metrics; one without a target is drawn plain and says "No target". |
| Stacked bars over time (`stacked`) | `stacked` with `show: "breakdown"` | A Metric with a Breakdown with no negative row; it is offered only for such Metrics. |
| Pareto (`pareto`) | `pareto` with `show: "latest"` | A Metric with a Breakdown with positive rows ("Pareto needs positive rows"); it is offered only for such Metrics. |
| Slope chart (`slope`) | `slope` with `show: "latest"` | 2 to 12 Metrics in one unit, or a Metric with a Breakdown. |
| Running total against target (`running-total`) | `cumulative` with `show: "year"` | One Metric whose Aggregation is sum, or it says so in words. |
| Bump chart (`bump`) | `bump` with `show: "breakdown"` | A Metric with a Breakdown over several periods; it is offered only for such Metrics. |
| Heatmap (`heatmap`) | `heatmap` with `show: "values"` | One Metric by day, week or month (by quarter or year it says so in words). |

**What a design cannot do.** The parts and marks above are fixed building blocks: a design arranges and combines them, and it cannot add a chart type, a colour or a font (colours are Theme tones, so a design fits every Theme). Numbers that Ziffr does not already compute go through an [Analysis Recipe](analysis-recipes.md), which a design draws with `recipe.` shows. Findings and the Free layout are not View Designs: they stay built in (spec 0024).

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
| `text` | Words and values. `content` is a list of plain texts and `{ "show": … }` values; `style` is `headline`, `value`, `caption`, `body` or `note`. A value can have `before` and `after` words and be `strong`. A plain text (and a `before` or `after`) may hold **Placeholders** such as `{metric}`, `{latest}` or `{change yoy}`, filled in from the widget's data when it is drawn, with the same list and rules as a Finding's words (see "Words that fill themselves in" in the user guide); `{metric 2}` is the design's second Metric. A Metric the viewer may not see leaves its Placeholder empty, and one Ziffr cannot fill stays as written. |
| `group` | Parts side by side (`direction: "row"`) or stacked (`"column"`), `align: "center"` to centre them. |
| `plot` | A chart. `axes`: `none`, `compact` or `regular`. `x`: `period` (default) or `value` for pairs. `grid`: `none`, `horizontal`, `both`. `scale`: `padded`, `auto` or `tight`. `marks` are drawn in order. |
| `gauge` | Where the latest value sits against the target. |
| `range` | One bar per row, from its low to its high end, with its middle value: a driver's effect with its range. `show` is `recipe.` and the step of a `effects` step of the design's analysis (format `ziffr.analysis/2`). |
| `bridge` | Steps from a start, each part going up or down, and an end. `show` is `recipe.` and the step of a `bridge` step of the design's analysis. |
| `rows` | Table rows: `values` (the latest values, `limit` rows), `correlations` (Metrics ranked by how they move with the first), `matrix` (every pair) or `reasons` (why a Metric was left out). |
| `polar` | Values around a circle: `show` is `values` (the Metric's last periods) or `recipe.` and a step of the analysis that gives a series. The periods are the angles, oldest first from the top, and the distance from the centre is the value, with 0 at the centre. It starts at the first period with a value and draws 3 to 12 periods; a period without a value is a gap (never a 0), and a period still running is written but not placed and does not set the rim. The line joins the last period to the first only for one whole cycle (12 months, 4 quarters) with a value at both ends. The scale always starts at 0 (a real zero), so a Metric that stays high looks like a circle; when the values are within 30 % of the highest the chart says so. It refuses a value below 0, which a line shows better. Use it for a pattern that repeats, such as the months of a year. |
| `radar` | Several Metrics as spokes on one shape, in the order of the design's Slots, 3 to 12 of them (a Slot of several with `min`: 3, or three Slots). `show` is `latest`. Each spoke has **its own scale**, as the Metrics are not counted in the same unit: its lowest value of the periods shown is on a small inner ring (never at the centre, so it does not look like no value) and its highest at the rim, and further out means a higher value, not a better one, so the shape says where each value sits in its own range, not which Metric is larger. The chart says so in words, and its text alternative lists every value in spoke order. `against: "previous"` adds the period before as a dashed shape with square dots. A Metric with no value in the periods shown is a gap, never its older value; a period still running or with gaps in it says so in its label; one with the same value in every period has no range, and is written but not placed. |
| `tree` | The formula of a Derived Metric as boxes, a **Formula Tree**: `show` is `formula`, and the design's first Slot is the Derived Metric. The first box is the Metric's value for its own newest period (as it is shown, up to a Snapshot's day), and each part is that part's value over the same span, so a running period adds up as the Metric does; under it are the parts of its formula, and a bracket of another kind (a product inside a sum, or the reverse) has parts of its own, at most 4 levels and 24 boxes. Every box is a number worked out exactly from the values' text, never from rounded parts, and written in its Metric's unit with as many decimals as it takes for a number that is not 0 never to read 0. **The parts of a sum** share the width of the box above them by their size, so a box's width is its share of the size of the parts (for a sum of positive parts, its value's share of the whole) and the shares add up to exactly 1; a part that is taken away (a cost in revenue minus cost) is **hatched**, carries a − and counts by its size, and says so in the text under the chart, as its share is of the size of the parts, not of the total. **The factors of a product or a ratio** (visits times conversion times price) are not parts of a sum, so they are laid side by side, equal, with × or ÷ between them, and the chart says they are not to scale: a product is not the sum of its factors. A part with no value is a dashed gap, named, and so is everything made of it, never a 0; a period still running or with gaps in it is marked on every box built on it. A number written as a box in the formula is a box named Number. **Who may see what:** only Metrics in the widget's data are drawn, so a formula with an input the person may not see, or that a View Link or a Snapshot leaves out (they carry only the Metrics on the dashboard's or deck's widgets, so a tree is drawn there only when its inputs are on it too), is refused whole in words, without naming the input. It is never drawn with an "other parts" box either: when one input is hidden, the Metric's value minus the parts shown would be that input's value, and with several hidden, their sum. A target the formula reads (`target`) is a box of its own, "Target of …". A formula that reaches back a period (`prev`, `change`), inputs counted by different periods, an input that is a Derived Metric itself, and Condensed Values are refused in words too. A box too narrow for its words is listed in full under the chart; every box has its words in the text alternative, in tree order. With `show` as `breakdown` it draws the rows of the Metric's newest Breakdown instead (to a Snapshot's day): the Metric's own value for that period as the first box, then the top rows, and under a row the rows that name it as their parent, at most 4 levels of rows. A row's number is its own as it was given; where its parts add up to another number both are said under the drawing and in the text version, and no box stands for the difference. Parts share the width of the box above by their size, a negative row is hatched, and past 24 boxes the smallest rows of a box are one **Other rows** box with their exact total, each still named in the text version. A Metric with no Breakdown, or whose Breakdown the viewer may not see, says so in words. |
| `progress` | One compact bar per Metric of the design's Slots, in order, up to 12 (a Slot of several). `show` is `latest`. Each bar is filled from 0 to the latest value on a scale that ends a little past the highest of the value and the target, so a target is always on the bar: a lighter band for a range, a tick for one limit. The name, the value and, in words, the Attainment ("92 % of target", or the distance where there is no percentage) sit beside it, and an off-target value says which way ("too low"). Green or red says only whether the value is on target; a Metric without a target is drawn plain and says "No target", one without a value says "No value yet". The target is the Target Series' value of the latest period if there is one, else the Metric's Target Range. |
| `scoreboard` | One table for several Metrics, a row each in the order of the design's Slots, 3 to 12 of them (a Slot of several with `min`: 3, or three Slots). `show` is `latest`. A row has the Metric's name, its latest value in the Workspace's Number Style and the Metric's unit, the change against the previous period (an arrow and a signed percent, in the text colour: colour only ever means on or off target), the on or off target chip in words, and a small trend of the periods set by the `window` option. A Metric with no value yet says so in its row; one whose latest period is not the newest, or is still running, says which period it is. |
| `stacked` | One bar per period of the Metric's **Breakdown**: `show` is `breakdown`. The largest rows of the newest period (at most 5) are segments of their own, in that order and with the same colour in every bar; every other row, and any row the newest period does not have, is one muted **Other** segment. A bar's height is the sum of its rows, which need not add up to the Metric's value (it says when they do not). A period without a Breakdown is left out, and the chart says how many; a Breakdown with a negative row is refused in words. The `window` option counts the periods, 12 by default. |
| `pareto` | The rows of the Metric's latest Breakdown as bars from largest to smallest with a line of the running share of the total (0 to 100 %) and a reference at 80 %. `show` is `latest`. At most 10 rows are drawn; the rest are one muted "Other" bar at the end, which is not sorted among the rows and where the line reaches 100 %. A caption says how many rows make up 80 % ("3 of 12 rows make up 80 %"), counted over all rows. Only positive rows count (a row of 0 is left out); a Breakdown with a negative row is refused in words ("Pareto needs positive rows"). The Metric of the first Slot is used; one without a Breakdown says so. |
| `slope` | Two points per row joined by a line, on two vertical axes (before on the left, now on the right), up to 12 rows. `show` is `latest`. The option `slope` chooses what is compared: the rows of the first Metric's Breakdown in the latest period against the period before (`previous`) or the same period a year earlier (`year`); several Metrics (`metrics`, 2 to 12, all in one unit, each Metric's latest value against its own previous period); or `auto`, which follows what was placed (several Metrics, else the rows of a Breakdown). Both axes share one scale, from the lowest value to the highest, which is not 0, and the chart says so. Every line is in the data tone; only the row with the largest rise and the one with the largest fall take the accent, and both say so in words ("Largest rise", "Largest fall"). Each end has a label with its value, the right one also the change ("+1,200 € (+8.0 %)"), and labels that would touch are moved apart. A row in only one of the two periods is "new" or "gone", never a 0. With more than 12 rows the 12 with the most at stake are drawn, and it says so. Metrics in different units are refused ("Slope charts compare Metrics in one unit"); one Metric without a Breakdown asks for a Metric with a Breakdown or several in one unit. |
| `cumulative` | The running total of the design's Metric since the start of its Fiscal Year, restarting each year; `show` is `year`. It draws a line for the year so far, a dashed one for the target (the running total of the Metric's Target Series, or, without one, of its target when that has a single bound, each period; with a range or no target it says "No target set"; switched off with the option `showTarget`) and a lighter one for last year, with the value at the end of each line and, for the year so far, in words how it stands against the target ("ahead of target by 1,200 €", "92 % of target, 800 € behind"). The Metric's Aggregation must be sum, or it says so in words. A period without a value is a gap named under the chart, not a 0, and a period still running is drawn but not compared. |
| `bump` | The order of the Metric's **Breakdown** rows over its periods: `show` is `breakdown`. One line per row; the vertical axis is the **rank** (1 at the top, the highest value of that period), not the value, with a dot per row per period and the row's name, latest rank and latest value written at the right end of its line. Rows with the same value share the better rank; a negative value ranks like any other. At most 8 rows are drawn (the best average rank, ties by the latest value) and the chart says how many were not. A row a period does not have gets no dot and the line has a gap, and the chart says so (never a last place). The row that gained the most places from the first to the last period drawn is in the accent colour and says "up 3 places" in its label; the other lines are muted, and colour never carries the meaning alone. A period without a Breakdown is left out and counted, and one with a Breakdown in fewer than 2 periods or fewer than 2 rows is refused in words. The `window` option counts the periods, 12 by default. |
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
- has a text with `<` or `>`, braces other than a Placeholder, brackets, a backslash, a line break, or a web address or scheme (`://`, `www.`, `javascript:`, `data:`, `url(`);
- is in a format version this Ziffr does not read;
- breaks a limit: 4 Slots, 12 parts at the top and in a group, 12 marks in a plot, 12 pieces in a text, 48 parts and marks in all, names up to 80 characters, descriptions 300, labels 60, texts 200;
- uses an option it does not declare, pairs or correlations with one Metric, or a recipe output it does not have.

Ziffr runs the same checks in the Playground as you type and on the server whenever a design is saved.

## Bringing it back

Owners and Admins add a design on **Workspace → Library** (paste or upload) or from the Playground. Everyone in the Workspace then finds it in the Pool under **The Workspace's View Designs**. A widget keeps its own copy of the design, so removing the design from the Workspace changes no widget already placed.

In PowerPoint, a design whose only drawn mark (besides the target and the forecast) is the values as a line or bars becomes an editable chart; rows of values become a table; the latest value with its period and status becomes text; anything else becomes a picture.
