<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/analyze/**, apps/web/src/analyses/** -->
# Analyze

**Analyze** in the sidebar opens the **Analysis Canvas**: a place to put a few Metrics side by side and ask simple questions of them. Where is this heading? Do these two move together? What moves most with this one? Each method is an **Analysis**, and its result can go onto a dashboard.

Everyone in the Workspace can use Analyze, with the Metrics they can see. The page needs no setup and changes nothing for anyone else.

## The screen

The screen has three parts:

- **The Pool** on the left (below on a narrow screen), with the Metrics you can see. Here it holds only Metrics, no saved Widgets or Widget Templates. **Filter** narrows it by name.
- **Recipes** at the top: ready-made Analyses that run with one click.
- **The Analysis canvas**, with the Metrics on it, the Analyses you can run, and below it the results.

## Putting Metrics on the canvas

Drag a Metric from the Pool onto the canvas, or point at it and press **+**. **Archived Metrics** are not in the Pool, and the Drivers suggestion leaves them out. To see what a Metric is before you drop it, press the **ⓘ** on its row: a small card opens beside it with the Metric's name, how often it is counted and in which unit, its description, its latest value with the period, and a small line of its recent values. The list stays as it is; press **ⓘ** again, press Escape or tap elsewhere to close the card. You can also open a Metric's own page and choose **Analyze** there: Ziffr opens this screen with that Metric already on the canvas.

Each Metric on the canvas shows its name and how often it is counted, such as "monthly". The **×** next to it takes it off. **Clear** empties the canvas and its results. The number next to **Analysis canvas** says how many Metrics are on it.

When there is more than one Metric, the first one carries a **Target** mark. It is the Metric the **Drivers** Analysis explains.

The Metrics on your canvas stay there until you take them off, also when you leave and come back. The canvas is yours alone; colleagues have their own. In the demo nothing is saved: the canvas works the same way, but starts over when you leave the page.

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
| **Will we reach the Target?** | Puts Revenue on the canvas and runs **Forecast**; when Revenue has a Target, the Takeaway says how likely it is to be reached ("about 7 in 10"). |
| **Do support tickets drive returns?** | Puts Return rate and Support tickets on the canvas and runs **Correlation**. |
| **Did it work?** | Asks about the first Metric on the canvas (it is greyed out until there is one). A card opens under the Recipes: pick the **day it started**, and Ziffr compares the periods after it with where the Metric's own trend pointed. Optionally pick **a metric it should not have touched** from the others on the canvas that are counted at the same period, and Ziffr shows the same for it beside. |

A Forecast says where the Metric is expected to be, with the range it is likely between, and which Method worked it out: a plain trend, or the trend with the yearly pattern when the Metric has two seasons of values and the pattern would have missed less on the last third of its history. It also says how that Method did on the periods already known ("the range for the next month would have held 10 of 12 times"). Show the numbers has the details. A forecast is not a promise; it assumes the pattern of the past carries on.

Except **Did it work?**, a Recipe replaces what is on the canvas with its own Metrics. Each one appears only when you can see the Metrics it needs. When none fits, the screen says "Recipes appear once the metrics they need are shared with you."

### Did it work?

The answer is a range, not a verdict: "After 1 Mar 2026, Signups ran about 12.0 % above where its trend pointed (likely between +8.1 % and +16.2 %; that range leaves out zero)." The trend is a straight line through the periods before the day you named, so Ziffr needs at least six of them; the latest 120 are used, and the first 120 periods since the day. A period that began before the day and runs past it is left out, and the result says so. "Likely between" is the range the answer holds about four times in five.

- Both ends of the range on the same side of zero: the Metric did run away from its trend, by about that much. Ziffr does not say why: other things may have changed on the same day.
- The range holds zero: the sentence adds "that range includes zero". A range that leaves out zero is no proof: with no real change, about 1 range in 5 does by chance.
- With a metric set beside it, the result also says how that one ran against its own trend. If it ran outside the same range around its own trend, which chance alone gives about 1 time in 5, a line above says that something else may have moved both, or that it is chance.

The result carries its basis, what it assumes, and the footer "This compares what happened with where the earlier trend pointed; it does not show what made the difference." **Show the numbers** has the trend, where it pointed, what the values were and the typical miss of the line. Where Ziffr cannot answer it says why in words: a day that is not a day, fewer than six periods before it, nothing on or after it, a Metric that has hardly changed, or too many periods without a value.

**Leave the day empty** and Ziffr looks for the day a Metric changed instead, with no day to start from: "Around March 2026, Signups changed: before, it went up 5 € a month; since, down 3 € a month; and at that point its level was just where the earlier trend would have put it." It is the day that fits best; nearby days may fit almost as well. It says so only when the change stands out from what luck would give among all the days it tried (at least eight periods are needed); otherwise it says nothing stands out. See [Reading a Takeaway](../guides/reading-a-takeaway.md).

## Reading the results

Each result is a Widget with a title saying what it compares, such as "Forecast: Revenue", "Return rate vs. Support tickets", "Drivers of Cost" or "Correlation matrix (5 metrics)".

### Forecast

A line of the Metric's last 18 periods, continued a few periods ahead: two quarters for a quarterly Metric, one year for a yearly one, three months for a monthly Metric, six weeks for a weekly one, fourteen days for a daily one. A shaded band around the continued line shows how far the actual values will likely be from it; it widens the further ahead it looks. Above the line, one sentence sums it up, such as "Expected €1.2M by June 2027 (likely €1.0M–€1.4M)".

The forecast follows the recent trend of the values. It knows nothing of plans, seasons or events, so read it as "where this is heading if nothing changes". It needs at least four values, so a yearly Metric has one after four years. The trend and the values ahead are worked out exactly from the Metric's values, the same as on its page.

Placed on a dashboard, a forecast can be shown by quarter, half-year or year with **Show by** (see the Dashboards chapter): it then continues the quarters two ahead (a year one ahead), starting from the last complete one, so a quarter still running does not pull it down.

### Correlation

A dot for each period, placed by the two Metrics' values, and a **Takeaway** behind the Widget's **⋯** menu (**Takeaway…**): one sentence in the Metrics' own words, such as "Visits and Revenue tend to move together over 18 months (strong)."

- The word in brackets says how clear the link is: **strong**, **moderate**, **weak**, or **can't tell from chance**. The last one means the pattern is no clearer than what luck alone could give, so do not lean on it. Read more in [Reading a Takeaway](../guides/reading-a-takeaway.md).
- Above the sentence, a plain line appears when something about the data makes the reading rough: a few periods far from the rest that pull the result ("without them it reads moderate"), values that are very uneven or repeat a lot, periods with no value that were left out, or a link that was stronger earlier than it has been since. A result with such a line is never called strong.
- Under it, a footer: "This shows what has gone together, not what caused what." for a link between Metrics, and "This carries the past forward; it is not a promise." for a Forecast.
- **Show the numbers** opens the details for those who want them: the Method, r, how many pairs of periods and which, and what the Metrics were compared on. The choice of comparing the values as they are, not their change, is there too.

Only periods where both Metrics have a value count, and at least six are needed. Where Ziffr cannot give a result it says why, in words and with no number: "Not enough months in common (4 of 6).", or that a Metric has hardly changed, so there is nothing to compare. It never turns a refusal into a number because you ask again.

### Metrics counted at different periods

Two Metrics counted at different periods, such as weekly support tickets and monthly churn, are compared on the longer of the two, their **Common Period**. The shorter one is combined by its **Aggregation** (see [Metrics](10-metrics.md)): weekly tickets are added up to monthly tickets, an average is averaged, a last value is taken from the period's last week. A daily Metric against a weekly one is compared by week, and so on.

- Only complete periods count. The month still running is left out, as it would compare part of a month with whole ones.
- The result says so under the sentence: "Compared by month (18 months)". Nothing is added when both are counted at the same period.
- A Metric whose Aggregation is **none** cannot be combined, so it is compared only with Metrics of its own period. Where that leaves a pair out, the result says why, such as "Aggregation none: Visitors is compared only with weekly Metrics."
- A yearly Metric rarely has the six years a correlation needs; the result then says how many it has.

### Drivers

A list of the other Metrics, the one that moves most closely with the Target first. Each has a bar for how strong the link is and its r. A bar in the data colour means they move the same way; a bar in the warning colour means they move opposite ways. Below the list, a Takeaway names up to three that moved with the Target the most ("Over 18 months, Shipping cost and Returns moved with Cost the most.") and a dot chart shows the two. Each Metric in the list has its own Takeaway behind **Show the numbers**, with its strength word and any plain line about its data. A Metric whose data cannot be compared (it has hardly changed, or has too many periods without a value) is listed under the bars with the reason, and shows no number. The footer says once that this shows what has gone together, not what caused what.

Metrics of every period are compared, each on the longer of its own period and the Target's (see above). One combined to another period says so after its name, such as "· by month", and pointing at it shows "Compared by month (18 months)". Below the list, Ziffr names the Metrics it left out and why: an Aggregation of none, or too few periods in common. A derived Metric made from the Target, or one the Target is made from, is left out without a note, since it would move with it by its formula. If nothing is left to compare, the result says so.

**Growth removed.** Two Metrics that both grow over time look closely related even when nothing links them. So where both have a clear trend (a straight line through each explains more than half of how it moves), Drivers, the Correlation matrix and the Metric page compare how each changed from the period before, and say so: "Compared by change, growth removed". Otherwise they compare the values and say "Compared by value". The dot chart then shows each period's change, not its value. **Show the numbers** under the list (and on a Metric's Analysis tab) shows r and the periods for each Metric, and lets you compare on the values as they are instead, the way Ziffr used to.

### Correlation matrix

A grid with every Metric on both sides. Each square holds the r of that pair. The stronger the link, the deeper its colour; pairs that move opposite ways are shaded in the warning colour. A pair counted at different periods (monthly against weekly) is compared on the longer one. Pointing at a square shows its r, whether growth was removed ("Compared by change, growth removed" or "Compared by value") and, for such a pair, "Compared by month (18 months)". A pair with no result shows "–", and pointing at it says why, such as "Not enough months in common (4 of 6)." Below the grid, Ziffr names every Metric kept to its own period by an Aggregation of none.

## View Designs

**View Designs** at the top right of Analyze opens the list of designs. A **View Design** is a View written as a file: which Metrics it takes, what it draws and in which Theme colours. It holds no code. Ziffr checks the file and draws it with its own renderer, and every number in it is one Ziffr computes.

- **The Workspace's View Designs**: the designs Owners and Admins added. Everyone in the Workspace finds them in the Pool, under **The Workspace's View Designs**, and places them like a built-in View.
- **Built-in View Designs**: every built-in View and Analysis, drawn with Sample Data.
- **Export** downloads the design's file and a Sample Data file that fits it. Neither holds any of your Workspace's values.

Owners and Admins see **Add a View Design**: paste the file or upload it. Ziffr checks it as you paste and names every mistake with its line, such as "Line 12: parts[0].marks[1].tone must be one of “data”, “muted”…". **Add to the Workspace** checks it again on the server. A file with web addresses, markup, fields Ziffr does not know, or more than the limits allow is refused. **Remove** takes a design out of the Workspace; Widgets already drawn with it keep it. Adding and removing are in the Audit Log. The demo keeps no View Designs.

## Playground

**Playground** at the top right of Analyze is where you work on a View Design's file. The file is on the left, the drawing on the right.

- **Start from** loads a built-in View's design; **Upload** loads a file. You can also paste or type.
- Ziffr checks the file as you type. Every mistake is listed above the file with its line, such as "Line 3: name must be plain text, without markup or web addresses". Click one to select that line. While the file has mistakes, the drawing keeps the last version that passed.
- **Sample Data** draws the design with made-up Metrics. **My Metrics** asks for a Metric for each Slot, from those you can see and use (not Archived Metrics), and draws your values.
- **Download with Sample Data** saves the file and a Sample Data file. For Owners and Admins, **Add to the Workspace** adds the design, checked again on the server, as on the View Designs page.

Nothing you type in the Playground is kept unless it is added to the Workspace.

### Analysis Recipes

An **Analysis Recipe** is an Analysis written as steps of Ziffr's own functions: moving average, difference, growth, share, linear trend and slope, mean, standard deviation, z-score, seasonal index and correlation. A View Design can carry one under `analysis` and draw its results: as a line or bars (`recipe.` and the step's name), as a rule across a plot for one value, or as a number in its words. The recipe works on the Metrics in the design's first Slots, as the Widget shows them (by quarter, when it is shown by quarter), and on nothing else. Every number it gives is computed by Ziffr's verified functions, so it is as trustworthy as any other number in Ziffr.

**Start from** also lists the built-in recipes (moving average, growth, linear trend, seasonality, unusual periods, correlation, share of a total), each inside a design that draws it. Once added to the Workspace, a design with a recipe is placed like any other, and goes onto dashboards, Snapshots, View Links, decks and the PowerPoint export, where it becomes a picture.

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
