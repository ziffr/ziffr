<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/analyze/**, apps/web/src/app/settings/library/** -->
# Analyze

**Analyze** in the sidebar opens the **Analysis Canvas**: a place to put a few Metrics side by side and ask simple questions of them. Where is this heading? Do these two move together? What moves Cost? You choose a **method** by what you want to know, and its result can go onto a dashboard.

Three steps are all it takes: drop Metrics on the canvas, pick a question, read the answer. An empty canvas says so, and offers one question to try.

Everyone in the Workspace can use Analyze, with the Metrics they can see. The page needs no setup and changes nothing for anyone else.

## The screen

On a phone a note at the top says Analyze is easier on a larger screen; see [Screens made for a larger screen](07-getting-started.md#screens-made-for-a-larger-screen).

From the top, the screen has these parts:

- **Heads-ups**, one slim line under the title: "3 Heads-ups for you. **Look**", or "No Heads-ups right now." **Look** opens the list in the side panel (see [Heads-ups](#heads-ups)).
- **The Analysis canvas**, large, with the Metrics on it and which of them is the one to explain. Left of it is **The Pool** (below it on a narrow screen), with the Metrics you can see. Here it holds only Metrics, no saved Widgets or Widget Templates. **Filter** narrows it by name.
- **Choose a method**, the button above the canvas: the one way to run an analysis here. It opens the **methods panel**, a list of questions grouped by what you want to know (see [Choose a method](#choose-a-method)).
- **The results**, directly under the canvas: the answer to the question you asked, newest first.

## The empty canvas

When nothing is on the canvas, it tells you what to do:

1. Drop Metrics here (or click **+** in the Pool).
2. Pick a question.
3. Read the answer.

Under the steps, **Try: What moves Cost?** is one question picked for you from the Metrics you can see. Choosing it puts those Metrics on the canvas, marks the one to explain and opens the question in the methods panel, ready to **Work it out**. The Metrics in it differ from Workspace to Workspace. When there are too few Metrics, or too few values, for any question to fit, the example is not shown.

## Putting Metrics on the canvas

Drag a Metric from the Pool onto the canvas, or point at it and press **+**. **Archived Metrics** are not in the Pool, and the Drivers suggestion leaves them out. To see what a Metric is before you drop it, press the **ⓘ** on its row: a small card opens beside it with the Metric's name, how often it is counted and in which unit, its description, its latest value with the period, and a small line of its recent values. The list stays as it is; press **ⓘ** again, press Escape or tap elsewhere to close the card. You can also open a Metric's own page and choose **Analyze** there: Ziffr opens this screen with that Metric already on the canvas.

Each Metric on the canvas shows its name and how often it is counted, such as "monthly". The **×** next to it takes it off. **Clear** empties the canvas and its results. The number next to **Analysis canvas** says how many Metrics are on it.

The Metrics on your canvas stay there until you take them off, also when you leave and come back. The canvas is yours alone; colleagues have their own. In the demo nothing is saved: the canvas works the same way, but starts over when you leave the page.

The methods panel opens only when you ask for it, or when you come from a Metric's page; once there are Metrics on the canvas it starts with the questions that fit them.

### The Metric to explain

Some questions are about one Metric: **What moves B?**, **What does B need to reach a value?**, **What if A changes?** and **Did it work?**. Ziffr calls it **the one to explain**. When there are two or more Metrics on the canvas, each chip says its role in words: the one to explain carries a filled mark, **The one to explain**, and the others read **Compared with** and have a button, **Make this the one to explain**. The mark is its own choice: the order in which you dropped the Metrics does not decide it. With one Metric on the canvas, it is the one to explain.

Choose another Metric's button and nothing is taken off the canvas; the list starts its questions on the new one. If you take the marked Metric off, the mark moves to the next Metric on the canvas (to the one before it when it was the last). The choice is kept with the canvas. The questions in **Choose a method** start on it: they are worded with its name ("What moves Cost?"), "Which Metric do you want to explain?" shows the marked one, and you can still change it there. The mark is called the one to explain, never the Target, which is the range a Metric aims for.

## Choose a method

**Choose a method**, above the canvas, is the one way to run an analysis: it is for when you know what you want to know and not which Method gives it. It opens the **methods panel** at the right of the page. On a wide screen the panel sits beside the canvas, so the canvas and the Pool stay usable while it is open: drag a Metric from the Pool onto the canvas, then pick a question. On a narrow screen it covers the page from the right and closes when you ask a question, so that the answer is in view. **Esc** or the close button closes it, and the address `?panel=methods` opens it from a link.

The panel lists the questions grouped by what you want to know: **Where is it heading?**, **What moves with what?**, **What would it take?**, **What would happen if?**, **What changed?**, **What is usual?** and **Where is it concentrated?**. To start with there are only the headings and the questions under them, in the Metrics' own words ("What moves Cost?").

**Choose a question** and it opens in place: what it is in plain words, the technical name in small type, **Use it when** and **Don't use it when** (the same words as the Methods guide), what it needs of the canvas and the fields that set it up. One question is open at a time; choose it again to close it. The list fits the canvas, and what fits comes first: groups with a question that fits are above the others, and inside a group the ones that fit are above the greyed ones. The questions use the Metrics' own names: with Cost on the canvas as the one to explain you see "What moves Cost?" instead of "What moves B?", "What does Revenue need to reach 1.2m?" once you type the value, and "What if we change Support tickets by 10 %?" once you give the change. Where nothing is chosen yet the general words stay. A Method that cannot work on what is on the canvas now stays in the list, greyed, with the reason in one line beside it: "Revenue has no Target Range, so there is nothing to reach.", "Needs 3 Metrics on the canvas; there are 2." With nothing on the canvas every entry says "Drop a Metric on the canvas first." The list names only Metrics you can see.

Where the only thing missing is history, the line says how close you are, counted in the Metric's own period: "1 of 4 days. Ready on 30 Nov 2026 if you add one each day." For a week, a month or longer it says by which day: "Ready by …". A day is named only where it is certain: for a question about one Metric whose values someone adds, with no period missing between its values or since its latest one. Otherwise, and for **Did it work?** (which counts the periods before and after your day separately), the line says how many more are needed: "Revenue has 5 of 8 months. 3 more needed."

**Add earlier values** under such a line opens [Fill past periods](10-metrics.md) for that Metric, with the ways that take pasted or uploaded values. The paste page has **Back to Analyze** at the top. The button is shown only if you may paste values for the Metric: you submit it, and it takes values by the web form.

The fields of an open question ask for what it needs, in words, with the canvas filling in what it can: which Metric you want to explain, which might move it, the day it started, the value you want it to reach. Each question says what it takes (a day that exists, a number, a whole number from 1 to 10). **What if A changes?** asks for the Metric to change, the Metrics that might follow it, and the change as an amount or as a percent (one of the two). **Work it out** gives a Takeaway, under the canvas, in the same words, ranges, strength words and footers as a Recipe's: picking a Method yourself turns none of that off, and a Method that does not apply (too little history, a flat Metric) says so in the same words as a Recipe does.

**How do these Metrics move together?**, under **What moves with what?**, takes three to twelve Metrics from the canvas (all of them are chosen at the start) and compares every pair as **Does A move with B?** does. Its Takeaway has the sentence of the pair that moved together most closely, with that pair's strength word, what it was compared on and the footer; **Show the numbers** lists every pair with its link number r, its strength word and what it was compared on, and says why a pair could not be compared. Any plain line about the data of a pair is given, naming its Metrics. Its chart is a grid of every pair, each cell with the link number and its strength word, and it cannot be saved as a widget from here.

### The results

The answer is not in the panel but directly under the canvas, so you read the Metrics and what Ziffr says about them together. Its title is the question with the names of the Metrics it is about ("About Cost, Visits and Price"), and above the Takeaway is a chart of the result. The page keeps the last three answers, newest first; each can be folded away with its title. Take a Metric off the canvas and its answers stay until you leave the page or press **Clear**, which empties the canvas and its answers. Nothing is kept for later until you save it as a widget.

**The chart above the words.** Every answer that has numbers to draw shows them as a chart above its Takeaway, so you see how the finding looks over time and not only read it. The chart draws the very numbers the words are written from (nothing else is worked out for it), so the picture and the sentence cannot disagree; a Method with nothing honest to draw shows no chart and says nothing about it. Where two Metrics are in different units, each line has its own axis, named in the legend, and the lines differ in marker and dashes as well as colour. A period with no value is a gap in a line, never a 0. A long daily history is thinned for drawing only (a very long run is cut to 200 places that keep each line's lowest and highest value, every gap and the ends); the 120 periods most Methods read, and so 156 weekly ones, are all drawn. The Takeaway is the chart's text alternative, and a chart can be reached with the keyboard. What each shows:

- **Where is it heading? / Will we reach the Target?** The values so far, the dashed forecast with the range the sentence gives (the same chart as on the Metric page) and, for the Target, its Target Range.
- **Does A move with B? / Do A and B rise and fall in step?** The two Metrics over time, each on its own axis (the changes from the period before where the answer compared by change), and a dot for each period they have in common.
- **Do A and B still move together when C is held the same?** The two Metrics over the periods all of them have. There is no scatter, since the link with C held the same is not the one a scatter shows.
- **Does A come before B?** A bar for the correlation at each delay, the best delay solid and named "best delay".
- **What moves B?** B as it was and as the fit expects it (dashed) over the periods the fit used, and each Metric's share of what moved B as a bar with its strength word, in the order the sentence names them.
- **What does B need?** The same fit; where it was made on the values themselves, the value you want to reach as a level.
- **What if A changes?** One row for the change you asked for and one for each Metric it reaches, each in its own unit and on its own scale (the Metrics are not compared by length), with the range it is likely between.
- **Did it work?** The values with the day marked and two levels over the periods since: where the earlier trend pointed and where the Metric was, both on average.
- **Did something change, and when?** The values with the date marked and the two straight lines the Method fitted, one before the date and one from it on; where nothing stands out, the values alone.
- **Why did it change from last period?** A bar for what each row added or took away, going up to the right and down to the left (hatched), what the rows leave unexplained where they do not come to the Metric's change, and the total change.
- **What is usual?** The values with the usual range as a band, the median and, where you gave one, your value.
- **How much do the biggest rows make up? / Which few rows make up most of it?** A bar for every row's share, largest first, the rows the sentence names solid and the others hatched, with the running total as a line.
- **How do these Metrics move together?** A grid with a cell for every pair: the link number and its strength word.

Under a result, **Save as widget** keeps it in your widgets where the Method has a widget of its own (the forecast, with its Target, and the correlation); the others say "You can’t save this one as a widget yet." **Download as Analysis Recipe** gives the Method as a file with its Slots left open, for the ones an Analysis Recipe can say (rank correlation, partial correlation, lagged correlation, the usual range and What moves B?). An Owner or Admin adds the file to the Workspace from the [Playground](#playground), and exports it in a Pack under Settings.

### Did it work?

Pick **Did it work?** or **Did something change, and when?** from **What changed?** in **Choose a method**. 
The answer is a range, not a verdict: "After 1 Mar 2026, Signups ran about 12.0 % above where its trend pointed (likely between +8.1 % and +16.2 %; that range leaves out zero)." The trend is a straight line through the periods before the day you named, so Ziffr needs at least six of them; the latest 120 are used, and the first 120 periods since the day. A period that began before the day and runs past it is left out, and the result says so. "Likely between" is the range the answer holds about four times in five.

- Both ends of the range on the same side of zero: the Metric did run away from its trend, by about that much. Ziffr does not say why: other things may have changed on the same day.
- The range holds zero: the sentence adds "that range includes zero". A range that leaves out zero is no proof: with no real change, about 1 range in 5 does by chance.
- With a metric set beside it, the result also says how that one ran against its own trend. If it ran outside the same range around its own trend, which chance alone gives about 1 time in 5, a line under the sentence says that something else may have moved both, or that it is chance.

The result carries its basis, what it assumes, and the footer "This compares what happened with where the earlier trend pointed; it does not show what made the difference." **Show the numbers** has the trend, where it pointed, what the values were and the typical miss of the line. Where Ziffr cannot answer it says why in words: a day that is not a day, fewer than six periods before it, nothing on or after it, a Metric that has hardly changed, or too many periods without a value.

**Leave the day empty** and Ziffr looks for the day a Metric changed instead, with no day to start from: "Around March 2026, Signups changed: before, it went up 5 € a month; since, down 3 € a month; and at that point its level was just where the earlier trend would have put it." It is the day that fits best; nearby days may fit almost as well. It says so only when the change stands out from what luck would give among all the days it tried (at least eight periods are needed); otherwise it says nothing stands out. See [Reading a Takeaway](../guides/reading-a-takeaway.md).

## Heads-ups

Under the title of Analyze, a slim line says how many **Heads-ups** there are for you: "3 Heads-ups for you." With none it reads "No Heads-ups right now."; with Heads-ups turned off for yourself it says so and where to turn them on; if they cannot be read just now it says that and nothing more. **Look** opens the list in the side panel, so it never pushes the canvas down, and `?panel=headsups` opens it from a link. The list shows what Ziffr noticed in the Metrics you can see, without being asked. There are five kinds:

- **Two Metrics have started moving together** ("A and B have started moving together: when A rises, B follows one month later (strong, over 18 months)"), or **used to and have stopped** ("A and B used to move together. Over the last 6 months, they have not.").
- **A Metric turned around** ("Signups turned around in January 2026: up 3 a month before, down 9 a month since").
- **A Target looks out of reach** ("Revenue is unlikely to reach 1,500 € or more in January 2027 (under 1 in 20)"), for a Metric with a Target Range.
- **A value is unusual for the time of year** ("Visits's 116 in October 2026 is high for this time of year: it is usually between 77 and 83"). This needs several years of the same Metric, so it is rare.

Each one reads as a short sentence, says what it is based on, and ends with the line of its kind: "This shows what has gone together, not what caused what." for two Metrics, "This shows when the numbers changed, not what made them change." for a turn, "This carries the past forward; it is not a promise." for a Target, and "This compares the value with the earlier ones at this time of year; it does not show what made it differ." for a season. **Show the numbers** opens the numbers behind it. The strongest come first. See [Reading a Takeaway](../guides/reading-a-takeaway.md#heads-ups).

Ziffr looks again every few hours and says nothing when nothing stands out: then the line reads "No Heads-ups right now." That is a result, not a fault: a Heads-up is only shown when it stands out from what chance alone gives among everything Ziffr looked at, so in a Workspace with many Metrics only a clear link is reported. A Heads-up about two Metrics is shown only if you can see both; one about a Metric, only if you can see it. It never asks anyone to approve anything and never changes a value.

Under each Heads-up in the panel:

- **Not useful** hides that Heads-up for you, for good. Nobody else's list changes.
- **Mute** and the name of a Metric hide every Heads-up about that Metric, in the list and by message. You can undo it under **Your Deliveries**, where the muted Metrics are listed.

You can turn Heads-ups off for yourself, or have the strongest ones sent to you by message, under **Heads-ups** on [Your Deliveries](17-your-settings.md#heads-ups). By message you get at most 3 a week, each one once, by your Delivery Preference for replies and updates, and not during your Quiet hours. The rest wait here. In the demo the list is read-only.

## Reading the results

The Analyses Forecast, Correlation, Drivers and Correlation matrix are also Widgets, which you add to a dashboard from the **Analyses** group of [Add widget](12-dashboards.md#adding-a-widget); the results of **Choose a method** say the same things in a Takeaway. A Widget has a title saying what it compares, such as "Forecast: Revenue", "Return rate vs. Support tickets", "Drivers of Cost" or "Correlation matrix (5 metrics)".

### Forecast

A line of the Metric's last 18 periods, continued a few periods ahead: two quarters for a quarterly Metric, one year for a yearly one, three months for a monthly Metric, six weeks for a weekly one, fourteen days for a daily one. A shaded band around the continued line shows how far the actual values will likely be from it; it widens the further ahead it looks. Above the line, one sentence sums it up, such as "Expected €1.2M by June 2027 (likely €1.0M–€1.4M)".

The forecast follows the recent trend of the values. It knows nothing of plans, seasons or events, so read it as "where this is heading if nothing changes". It needs at least four values, so a yearly Metric has one after four years. The trend and the values ahead are worked out exactly from the Metric's values, the same as on its page.

Placed on a dashboard, a forecast can be shown by quarter, half-year or year with **Show by** (see the Dashboards chapter): it then continues the quarters two ahead (a year one ahead), starting from the last complete one, so a quarter still running does not pull it down.

### Correlation

A dot for each period, placed by the two Metrics' values, and a **Takeaway** behind the Widget's **⋯** menu (**Takeaway…**): one sentence in the Metrics' own words, such as "Visits and Revenue tend to move together over 18 months (strong)."

- The word in brackets says how clear the link is: **strong**, **moderate**, **weak**, or **can't tell from chance**. The last one means the pattern is no clearer than what luck alone could give, so do not lean on it. Read more in [Reading a Takeaway](../guides/reading-a-takeaway.md).
- Above the sentence, a plain line appears when something about the data makes the reading rough: a few periods far from the rest that pull the result ("without them it reads moderate"), values that are very uneven or repeat a lot, periods with no value that were left out, or a link that was stronger earlier than it has been since. A result with such a line is never called strong.
- Under it, a footer: "This shows what has gone together, not what caused what." for a link between Metrics, and "This carries the past forward; it is not a promise." for a Forecast.
- **Show the numbers** opens the details for those who want them: the Method, the link number r (from −1 to 1), how many pairs of periods and which, and what the Metrics were compared on. The choice of comparing the values as they are, not their change, is there too.

Only periods where both Metrics have a value count, and at least six are needed. Where Ziffr cannot give a result it says why, in words and with no number: "Not enough months in common (4 of 6).", or that a Metric has hardly changed, so there is nothing to compare. It never turns a refusal into a number because you ask again.

### Metrics counted at different periods

Two Metrics counted at different periods, such as weekly support tickets and monthly churn, are compared on the longer of the two, their **Common Period**. The shorter one is combined by its **Aggregation** (see [Metrics](10-metrics.md)): weekly tickets are added up to monthly tickets, an average is averaged, a last value is taken from the period's last week. A daily Metric against a weekly one is compared by week, and so on.

- Only complete periods count. The month still running is left out, as it would compare part of a month with whole ones.
- The result says so under the sentence: "Compared by month (18 months)". Nothing is added when both are counted at the same period.
- A Metric whose Aggregation is **none** cannot be combined, so it is compared only with Metrics of its own period. Where that leaves a pair out, the result says why, such as "Aggregation none: Visitors is compared only with weekly Metrics."
- A yearly Metric rarely has the six years a correlation needs; the result then says how many it has.

### Drivers

A list of the other Metrics, the one that moves most closely with the one to explain first. Each has a bar for how strong the link is and its link number, r (from −1 to 1; the further from 0, the closer the two move together). A bar in the data colour means they move the same way; a bar in the warning colour means they move opposite ways. Below the list, a Takeaway names up to three that moved with the one to explain the most ("Over 18 months, Shipping cost and Returns moved with Cost the most.") and a dot chart shows the two. Each Metric in the list has its own Takeaway behind **Show the numbers**, with its strength word and any plain line about its data. A Metric whose data cannot be compared (it has hardly changed, or has too many periods without a value) is listed under the bars with the reason, and shows no number. The footer says once that this shows what has gone together, not what caused what.

Metrics of every period are compared, each on the longer of its own period and the one to explain's (see above). One combined to another period says so after its name, such as "· by month", and pointing at it shows "Compared by month (18 months)". Below the list, Ziffr names the Metrics it left out and why: an Aggregation of none, or too few periods in common. A derived Metric made from the one to explain, or one it is made from, is left out without a note, since it would move with it by its formula. If nothing is left to compare, the result says so.

**Growth removed.** Two Metrics that both grow over time look closely related even when nothing links them. So where both have a clear trend (a straight line through each explains more than half of how it moves), Drivers, the Correlation matrix and the Metric page compare how each changed from the period before, and say so: "Compared by change, growth removed". Otherwise they compare the values and say "Compared by value". The dot chart then shows each period's change, not its value. **Show the numbers** under the list (and on a Metric's Analysis tab) shows the link number and the periods for each Metric, and lets you compare on the values as they are instead, the way Ziffr used to.

### Correlation matrix

Add it to a dashboard from the **Analyses** group of [Add widget](12-dashboards.md#adding-a-widget). A grid with every Metric on both sides. Each square holds the link number r of that pair. The stronger the link, the deeper its colour; pairs that move opposite ways are shaded in the warning colour. A pair counted at different periods (monthly against weekly) is compared on the longer one. Pointing at a square shows its link number, whether growth was removed ("Compared by change, growth removed" or "Compared by value") and, for such a pair, "Compared by month (18 months)". A pair with no result shows "–", and pointing at it says why, such as "Not enough months in common (4 of 6)." Below the grid, Ziffr names every Metric kept to its own period by an Aggregation of none.

## View Designs

**Workspace → Library** (Settings) is where View Designs, Analysis Recipes and the Playground are kept. They are for people who build things, so they are not on the Analyze screen. The old addresses (`/analyze/designs` and `/analyze/playground`) lead on to the Library. The **View Designs** part of the Library lists the designs. A **View Design** is a View written as a file: which Metrics it takes, what it draws and in which Theme colours. It holds no code. Ziffr checks the file and draws it with its own renderer, and every number in it is one Ziffr computes.

- **The Workspace's View Designs**: the designs Owners and Admins added. Everyone in the Workspace finds them under **The Workspace's View Designs**, in a dashboard's **Add widget** and a deck's Pool, and places them like a built-in View.
- **Built-in View Designs**: every built-in View and Analysis, drawn with Sample Data.
- **Export** downloads the design's file and a Sample Data file that fits it. Neither holds any of your Workspace's values. The file starts with a `$schema` line, so an editor such as VS Code gives you completion and help on every field.
- **How to write a View Design** at the top right of the Library opens the guide in a new tab: every field, with examples.

Owners and Admins see **Add a View Design**: paste the file or upload it. Ziffr checks it as you paste and names every mistake with its line, such as "Line 12: parts[0].marks[1].tone must be one of “data”, “muted”…". **Add to the Workspace** checks it again on the server. A file with web addresses, markup, fields Ziffr does not know, or more than the limits allow is refused. **Remove** takes a design out of the Workspace; Widgets already drawn with it keep it. Adding and removing are in the Audit Log. The demo keeps no View Designs.

## Playground

The **Playground**, opened from the Library (**Open the Playground**, shown to Owners and Admins) or from **Write your own method** at the bottom of **Choose a method** (also Owners and Admins only), is where you work on a View Design's file. The file is on the left, the drawing on the right.

- **Start from** loads a built-in View's design; **Upload** loads a file. You can also paste or type.
- The file is in a code editor with colours. While you type, it offers the fields and values the format allows at the cursor (press Ctrl+Space to ask for them) and says what a field means when you rest the pointer on it or its value. The editor does not take the Tab key, so Tab moves on to the next control. If the editor cannot load, the file stays a plain text box. **How to write a View Design** at the top right of the Library opens the guide in a new tab.
- Ziffr checks the file as you type. Every mistake is listed above the file with its line, such as "Line 3: name must be plain text, without markup or web addresses". Click one to select that line. While the file has mistakes, the drawing keeps the last version that passed.
- **Sample Data** draws the design with made-up Metrics. **My Metrics** asks for a Metric for each Slot, from those you can see and use (not Archived Metrics), and draws your values.
- **Download with Sample Data** saves the file and a Sample Data file. For Owners and Admins, **Add to the Workspace** adds the design, checked again on the server, as in the Library.

Nothing you type in the Playground is kept unless it is added to the Workspace.

### Analysis Recipes

The Library lists the built-in recipes by name. Everyone but Guests sees the list; only Owners and Admins are shown the way into the Playground to write one. On a phone the designs and the recipes stand one under the other, each card as wide as the screen.

An **Analysis Recipe** is an Analysis written as steps of Ziffr's own functions: moving average, difference, growth, share, linear trend and slope, mean, standard deviation, z-score, seasonal index and correlation. A View Design can carry one under `analysis` and draw its results: as a line or bars (`recipe.` and the step's name), as a rule across a plot for one value, or as a number in its words. The recipe works on the Metrics in the design's first Slots, as the Widget shows them (by quarter, when it is shown by quarter), and on nothing else. Every number it gives is computed by Ziffr's verified functions, so it is as trustworthy as any other number in Ziffr.

**Start from** also lists the built-in recipes (moving average, growth, linear trend, seasonality, unusual periods, correlation, share of a total), each inside a design that draws it. Once added to the Workspace, a design with a recipe is placed like any other, and goes onto dashboards, Snapshots, View Links, decks and the PowerPoint export, where it becomes a picture.

A recipe can also be written in the newer format, `ziffr.analysis/2`, which adds rank, partial and lagged correlation, the usual range, percentiles and a fit with its importance as steps. A design draws the series and single values such a recipe gives as before. Two of its tables have a mark of their own: **bridge** draws what changed as steps (a start, each part going up or down, and an end; a part that went down hangs down, is hatched and is written with its minus, so it reads without colour), and **range** draws each driver's effect as a range, "likely between" its low and high end, with its middle value marked. Each says its numbers in words beside the drawing and to a screen reader (a part with no value in one period is marked with a star and named; each range row is drawn on its own scale from 0, because effects are in different units), and a table that cannot be drawn honestly (a low end above its high end, a missing start or end, too many rows) is named as not drawn instead of drawn wrongly. Any other table, and every Takeaway, is not drawn by a mark yet, and a design that names one is refused with that said. A forecast's likely range can also be drawn as a bar from low to high at each period with a **range** mark in a chart. Recipes in the first format work exactly as before. Packs and the [analysis recipes guide](../guides/analysis-recipes.md) describe the format.

## Saving a result

Results are not kept when you leave the screen; save the ones you want. A result of **Choose a method** has **Save as widget** under it (see [The results](#the-results)). A Widget on a dashboard has a **⋯** menu, which right-clicking also opens:

| Option | What it does |
| --- | --- |
| **History** | The first Metric's history: its values, Comparisons, questions and tasks. |
| **Ask a question…** / **Assign a task…** | Ask someone about a value of the first Metric. See [Actions](15-actions.md). |
| **Save as Widget** | Saves the result to **My Widgets**, under a name you choose, so you can place it on any dashboard or slide later. Not for Guests. |
| **Add to dashboard** | Places the result on one of the dashboards you may change, at once. Shown only when there is one. |
| **Open metric** | Opens the Metric's page; with several Metrics, one entry for each. |

A result placed on a dashboard keeps working there: it is drawn again from the latest values each time the dashboard opens. You can also place an Analysis on a dashboard directly, from the **Analyses** group in the dashboard's **Add widget** panel. See [Dashboards and Findings](12-dashboards.md#adding-a-widget).

