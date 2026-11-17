<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/analyze/**, apps/web/src/analyses/** -->
# Analyze

**Analyze** in the top bar opens the **Analysis Canvas**: a place to put a few Metrics side by side and ask simple questions of them. Where is this heading? Do these two move together? What moves most with this one? Each method is an **Analysis**, and its result can go onto a dashboard.

Everyone in the Workspace can use Analyze, with the Metrics they can see. The page needs no setup and changes nothing for anyone else.

## The screen

The screen has three parts:

- **The Pool** on the left (below on a narrow screen), with the Metrics you can see. Here it holds only Metrics, no saved Widgets or Widget Templates. **Filter** narrows it by name.
- **Recipes** at the top: ready-made Analyses that run with one click.
- **The Analysis canvas**, with the Metrics on it, the Analyses you can run, and below it the results.

## Putting Metrics on the canvas

Drag a Metric from the Pool onto the canvas, or point at it and press **+**. You can also open a Metric's own page and choose **Analyze** there: Ziffr opens this screen with that Metric already on the canvas.

Each Metric on the canvas shows its name and how often it is counted, such as "monthly". The **×** next to it takes it off. **Clear** empties the canvas and its results. The number next to **Analysis canvas** says how many Metrics are on it.

When there is more than one Metric, the first one carries a **Target** mark. It is the Metric the **Drivers** Analysis explains.

The Metrics on your canvas stay there until you take them off, also when you leave and come back. The canvas is yours alone; colleagues have their own.

An empty canvas reminds you what to drop: "One metric → forecast. Two → correlation. More → drivers and a matrix."

## The Analyses

Under the Metrics, one button per Analysis. A button you cannot use yet is greyed out and says what it needs, such as "Drop exactly two metrics".

| Analysis | Needs | What it does |
| --- | --- | --- |
| **Forecast** | One Metric or more | Projects each Metric a few periods ahead. With several Metrics, you get one forecast for each. |
| **Correlation** | Exactly two Metrics | Shows whether the two move together. |
| **Drivers** | Two Metrics or more | Ranks the other Metrics by how closely they move with the first one, the Target. |
| **Correlation matrix** | Three Metrics or more | Shows how every pair moves together, at once. |

In the demo, two more are shown as **coming soon**: **Clustering** (groups periods that behave alike) and **Impact analysis** (how much one Metric moves another). They cannot be run yet, and a real Workspace does not show them.

Running an Analysis adds its result at the top of the results. Running the same one again on the same Metrics moves it back to the top instead of adding a second.

## Recipes

A **Recipe** is a ready-made Analysis that runs with one click. Ziffr offers:

| Recipe | What it does |
| --- | --- |
| **What drives Cost?** | Puts Cost and every other Metric you can see on the canvas and runs **Drivers** for Cost. |
| **Where is Revenue heading?** | Puts Revenue on the canvas and runs **Forecast**. |
| **Do support tickets drive returns?** | Puts Return rate and Support tickets on the canvas and runs **Correlation**. |

A Recipe replaces what is on the canvas with its own Metrics. Each one appears only when you can see the Metrics it needs. When none fits, the screen says "Recipes appear once the metrics they need are shared with you."

## Reading the results

Each result is a Widget with a title saying what it compares, such as "Forecast: Revenue", "Return rate vs. Support tickets", "Drivers of Cost" or "Correlation matrix (5 metrics)".

### Forecast

A line of the Metric's last 18 periods, continued a few periods ahead: two quarters for a quarterly Metric, one year for a yearly one, three months for a monthly Metric, six weeks for a weekly one, fourteen days for a daily one. A shaded band around the continued line shows how far the actual values will likely be from it; it widens the further ahead it looks. Above the line, one sentence sums it up, such as "Expected €1.2M by June 2027 (likely €1.0M–€1.4M)".

The forecast follows the recent trend of the values. It knows nothing of plans, seasons or events, so read it as "where this is heading if nothing changes". It needs at least four values, so a yearly Metric has one after four years.

Placed on a dashboard, a forecast can be shown by quarter, half-year or year with **Show by** (see the Dashboards chapter): it then continues the quarters two ahead (a year one ahead), starting from the last complete one, so a quarter still running does not pull it down.

### Correlation

A dot for each period, placed by the two Metrics' values, and one sentence such as "strong positive relationship, r = 0.82 over 18 months".

- **r** runs from −1 to 1. Near 1, the two rise and fall together. Near −1, one rises when the other falls. Near 0, there is no clear link.
- The word before it says how clear the link is: **strong** (above 0.7, either way), **moderate** (above 0.4), **weak** (above 0.2), or **no clear** relationship.

Only periods where both Metrics have a value count, and at least six are needed. Otherwise the result says how many there are, such as "Not enough months in common (4 of 6)." Two Metrics that move together do not prove that one causes the other; use it to know whom to ask.

### Metrics counted at different periods

Two Metrics counted at different periods, such as weekly support tickets and monthly churn, are compared on the longer of the two, their **Common Period**. The shorter one is combined by its **Aggregation** (see [Metrics](10-metrics.md)): weekly tickets are added up to monthly tickets, an average is averaged, a last value is taken from the period's last week. A daily Metric against a weekly one is compared by week, and so on.

- Only complete periods count. The month still running is left out, as it would compare part of a month with whole ones.
- The result says so under the sentence: "Compared by month (18 months)". Nothing is added when both are counted at the same period.
- A Metric whose Aggregation is **none** cannot be combined, so it is compared only with Metrics of its own period. Where that leaves a pair out, the result says why, such as "Aggregation none: Visitors is compared only with weekly Metrics."
- A yearly Metric rarely has the six years a correlation needs; the result then says how many it has.

### Drivers

A list of the other Metrics, the one that moves most closely with the Target first. Each has a bar for how strong the link is and its r. A bar in the data colour means they move the same way; a bar in the warning colour means they move opposite ways. Below the list, a sentence names the strongest one ("Shipping cost moves most with Cost (strong positive).") and a dot chart shows the two.

Metrics of every period are compared, each on the longer of its own period and the Target's (see above). One combined to another period says so after its name, such as "· by month", and pointing at it shows "Compared by month (18 months)". Below the list, Ziffr names the Metrics it left out and why: an Aggregation of none, or too few periods in common. A derived Metric made from the Target, or one the Target is made from, is left out without a note, since it would move with it by its formula. If nothing is left to compare, the result says so.

### Correlation matrix

A grid with every Metric on both sides. Each square holds the r of that pair. The stronger the link, the deeper its colour; pairs that move opposite ways are shaded in the warning colour. A pair counted at different periods (monthly against weekly) is compared on the longer one. Pointing at a square shows its r and, for such a pair, "Compared by month (18 months)". A pair with no result shows "–", and pointing at it says why, such as "Not enough months in common (4 of 6)." Below the grid, Ziffr names every Metric kept to its own period by an Aggregation of none.

## Saving a result

Results are not kept when you leave the screen; save the ones you want. Each result has a **⋯** menu, which right-clicking also opens:

| Option | What it does |
| --- | --- |
| **History** | The first Metric's history: its values, Comparisons, questions and tasks. |
| **Ask a question…** / **Assign a task…** | Ask someone about a value of the first Metric. See [Actions](15-actions.md). |
| **Save as Widget** | Saves the result to **My Widgets** in your Pool, under a name you choose, so you can place it on any dashboard or slide later. Not for Guests. |
| **Add to dashboard** | Places the result on one of the dashboards you may change, at once. Shown only when there is one. |
| **Open metric** | Opens the Metric's page; with several Metrics, one entry for each. |

A result placed on a dashboard keeps working there: it is drawn again from the latest values each time the dashboard opens. You can also place an Analysis on a dashboard directly, from the **Analyses** group of Widget Templates in the dashboard's Pool. See [Dashboards and Findings](12-dashboards.md#the-pool).
