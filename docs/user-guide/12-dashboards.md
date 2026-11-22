<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/page.tsx, apps/web/src/app/dashboards/**, apps/web/src/app/stories/**, apps/web/src/app/v/**, apps/web/src/views/**, apps/web/src/components/dashboard-*.tsx, apps/web/src/components/pool.tsx, apps/web/src/components/preview.tsx, apps/web/src/components/widget-frame.tsx, apps/web/src/components/panel-editor.tsx, apps/web/src/components/story-editor.tsx, apps/web/src/components/template-*.tsx, apps/web/src/components/slot-dialog.tsx, apps/web/src/components/save-*.tsx, apps/web/src/components/new-dashboard-dialog.tsx, apps/web/src/components/snapshot-menu.tsx, apps/web/src/components/present-dashboard.tsx, apps/web/src/components/read-only-frame.tsx, apps/web/src/components/share-sheet.tsx, apps/web/src/components/view-links.tsx, apps/web/src/components/who-can-see.tsx, apps/web/src/components/versions-*.tsx, apps/web/src/components/object-toolbar.tsx, apps/web/src/components/first-run.tsx, apps/web/src/canvas/layout-editor.tsx -->
# Dashboards and Findings

A **Dashboard** is where you watch your Metrics as their values come in. This chapter goes through every screen and option that belongs to dashboards: the list of dashboards, building one, the menus of each Widget, Findings, presenting, sharing, View Links, Snapshots and Versions.

Everyone in a Workspace can open the dashboards they own and those shared with them. Members, Admins and Owners can also create dashboards. A Guest only looks at the dashboards shared with them and creates none. A Guest is never shown who else is in the Workspace: in a dashboard or a Snapshot, owners, Submitters and authors read as "Someone", and a dashboard that is not shared with them says to ask "the owner" without a name. Who may change what is said for each option below.

## The Dashboards list

Choose **Dashboards** in the sidebar to see every dashboard you may open, in two groups:

- **Mine**: the dashboards you made. Each says "Yours".
- **Shared with me**: dashboards a colleague shared with you. Each says who it is from and whether you "can edit it" or "can look at it".

Your Home dashboard carries a small **Home** mark. Each card has a **Pin** button at its right: it pins the dashboard to the sidebar (see [Pinning a dashboard](#pinning-a-dashboard)).

At the top, if you may create dashboards:

| Option | What it does |
| --- | --- |
| **Name of the new dashboard** and **New dashboard** | Makes an empty dashboard with that name and opens it, ready to fill. If Ziffr refuses, for example because your role may no longer create, the reason shows below the field. |
| **From a template…** | Opens the **New dashboard** window, where you can start from a Dashboard Template (see [Creating a dashboard](#creating-a-dashboard)). |

If there is no dashboard yet, the list says "No dashboards yet" and suggests naming one or asking a colleague to share theirs. A Guest sees no **New dashboard**, **From a template…** or **Create dashboard**, and the empty list says "Nothing has been shared with you yet. Ask whoever invited you."

### Your Home dashboard

Ziffr opens on your Home dashboard. You choose it yourself: open the dashboard, open its **⋯** menu and choose **Home dashboard**. The entry then shows a tick until you choose another. If you never chose one, Ziffr opens on the first dashboard you made, or else the first one shared with you. If your Home is no longer shared with you, the same rule picks another. In a new Trial Workspace, Ziffr opens on the Trial Guide instead until you finish or skip it.

### The first-run checklist

In a new Workspace without any dashboard, the start screen shows **Get your workspace ready**: a short list of first steps, ticked off by themselves as you do them. Each open step has a **Start** link.

1. **Describe a metric**: pick one from the Metric Catalog and say who submits it.
2. **Add its first value**: submit it yourself on the Metric's form link, or wait for the first answer.
3. **Invite a teammate** (Owners and Admins only).
4. **Build a dashboard**, with a **Create dashboard** button.
5. **Set the workspace time** (Owners and Admins only): the time zone and hour at which Ziffr asks for values.

Steps that are done stay in the list, crossed out. The demo has no checklist. See also [Getting started](07-getting-started.md).

## Opening a dashboard

A dashboard shows its name as a large heading. Below it, a line says whose it is: "Yours", or "Anna shared this with you as Editor" (or "as Viewer"). If the dashboard has an introduction, it follows.

Every Widget writes its values in the Workspace's **Number Style** with each Metric's unit, such as "118.941 €" or "$1,200". Chart axes step by round numbers (1, 2, 2.5 or 5 times a power of ten) and write all their labels one way, all shortened or all in full; a chart of a single value starts at 0. Axes and labels shorten values from 10,000 on, such as "12.3k", "126k €" or "1.2M", and changes read like "+4.2 %". A negative value or change has the minus sign "−" in front, the unit too: "−1.200 €", "−$12.3k", "−3.5 %". Snapshots, View Links and Previews write numbers the same way, in the style the Workspace has now.

### Pinning a dashboard

For the dashboards you open every day, press **Pin** in the row of buttons above a dashboard, or the pin on its card in the list. The button then reads **Pinned**; press it again to unpin. Pinned dashboards appear in the sidebar under **Dashboards**, in the order you pinned them. You can pin up to eight; with eight pinned, Ziffr says so and asks you to unpin one first.

- **Order**: drag a pinned dashboard up or down in the sidebar. Without a mouse, open the **⋯** menu on its row and choose **Move up** or **Move down**; **Unpin** is there too.
- **A shrunk sidebar** shows each pin as a small tile with its first letter; hover or focus it to see the name.
- **On a phone**, the pinned dashboards are the first thing **More** lists.
- Pins are yours alone, in each Workspace. If a pinned dashboard stops being shared with you, it leaves your sidebar without a message, and it comes back if it is shared with you again and you are still within the eight.
- In the demo nothing is saved, so the **Pinned** entry in the ⋯ menu (and the Pin button on the list of dashboards) shows as off and says "Pinning is off in the demo" when you hover or tap it. The demo's sidebar already has a few pinned dashboards, so you can see what pinning does; they cannot be moved or unpinned there.

### Switching dashboards

The dashboard's name is also a button. Press it to open the switcher:

- **Find a dashboard**: type part of a name to narrow the list.
- **Mine** and **Shared with me**: the same two groups as on the list. The Home dashboard has a house mark; shared ones show their owner's name.
- **New dashboard** (if you may create): opens the New dashboard window.
- **All dashboards**: goes to the Dashboards list.

### A dashboard you may not open

If you follow a link to a dashboard that is not shared with you, Ziffr says "This dashboard isn't shared with you" and offers **Ask Anna for access** (with the owner's name). Ziffr tells the owner, who can grant you Viewer access or decline under **Who can see this**. You hear back either way. The dashboard's name stays hidden until then.

### The toolbar

The buttons to the right of the name are:

| Button | Who sees it | What it does |
| --- | --- | --- |
| **Grid** / **Read** | Everyone | Switches between the two ways a dashboard reads (see [Grid and Read](#grid-and-read)). |
| **Snapshots** | Everyone, once there is a Snapshot; the owner and Editors always | The dashboard as it stood for a past period (see [Snapshots](#snapshots)). |
| **Present** | Everyone | Shows the dashboard on the whole screen (see [Presenting](#presenting)). |
| **Edit** / **Done** | The owner and Editors, in Grid | Switches edit mode on and off. |
| **⋯** (More for this dashboard) | Everyone | Home dashboard and Pinned, then the page's other entries (see below). |

**Home dashboard** and **Pinned** are in the ⋯ menu, each with a tick while it is on. **Home dashboard** makes this your Home dashboard (it cannot be switched off here: choose another dashboard as your Home instead). **Pinned** puts the dashboard in the sidebar or takes it out. In the demo, **Pinned** shows as off and says "Pinning is off in the demo". The switcher's list shows both marks too.
| **Share** | The owner | Opens the Share panel beside the dashboard. The number on it says how many people and Groups have access. |
| **⋯** (More) | Everyone | The menu below. |

The **⋯** menu holds:

| Option | Who sees it | What it does |
| --- | --- | --- |
| **Make a deck** | Everyone who may create | Starts a Deck named after this dashboard and opens it. See [Decks and Themes](14-decks-and-themes.md). |
| **Save as template** | The owner and Editors, once there are Widgets | Saves the dashboard as a team Dashboard Template (see [Saving as a template](#saving-a-dashboard-as-a-dashboard-template)). |
| **Who can see this** | Everyone | Lists everyone with access and why (see [Sharing](#sharing)). |
| **View links…** | The owner | Links for people outside the team (see [View Links](#view-links)). |
| **Theme…** | The owner and Editors | Picks the Theme the dashboard is drawn in. |
| **Versions** | Everyone | The dashboard's history in a panel beside it (see [Versions](#versions)). |

**Theme…** opens a small window with one list. Its first choice is the team's default Theme, marked "(team default)"; the others follow. The **Themes** link next to it leads to the Themes page. A Theme that shows a Pack's logo asks once before it is used, naming whose logo it is. A Theme changes the dashboard's colours and fonts, also when presenting and through View Links. When your Appearance is dark, the dashboard shows the Theme's dark variant, unless the Theme is set to "Always as designed" (see [Decks and Themes](14-decks-and-themes.md#in-a-dark-appearance)); Snapshots and View Links keep the look they were made or shared with. Ziffr's own screens keep their look.

## Creating a dashboard

**New dashboard** in the switcher, **From a template…** on the list, and **Create dashboard** on an empty start screen all open the **New dashboard** window.

1. **Name**: required, up to 120 characters.
2. **Start from**: pick one choice. **Empty dashboard** means you add Widgets from the Pool yourself. Each **Dashboard Template** shows a **Preview** drawn with **Sample Data**, its description and how many Widgets it has; "from Ziffr" marks the built-in ones. The templates are described in [Templates](05-templates.md#dashboard-templates).
3. When you pick a template, it asks for its **Slots**: one list per Slot, such as "Metric", reading **Choose a metric**. A Slot marked "one or more" shows tick boxes instead, for small multiples. A "one or more" Slot that only a Widget of that kind uses can also be filled by choosing **All Metrics tagged …** instead of ticking Metrics; the new Widget then follows the Tag (see [Metrics by Tag](#metrics-by-tag)). One Slot can fill several Widgets, so you choose each Metric only once. If you can see the Metric the template was made with, it is chosen already.
4. Press **Create dashboard**. Ziffr makes the dashboard and opens it.

The new dashboard is yours and independent of the template: changing the template later does not change it. The lists offer only Metrics you can see. If you see none, the window says so. A new deck from a Deck Template asks for its Slots the same way (see [Decks and Themes](14-decks-and-themes.md#the-decks-page)).

## Viewing and editing

A dashboard opens for looking. Its owner and Editors switch into editing on purpose with **Edit**; the button then reads **Done**. An empty dashboard that you may change opens in edit mode right away, since there is nothing to look at yet.

If you may only look, an empty dashboard says "This dashboard is empty." If you may change it, it says "Press Edit to add widgets."

A value that waits for **Approval** shows, marked "not approved yet" next to it, or "unapproved" in a table row; a locked period shows a lock. The Metric's own page marks such a value the same way.

### What edit mode adds

- **The Pool** appears on the left side (below the dashboard on a narrow screen).
- **Name** and **Introduction** fields appear under the heading. The introduction says what the dashboard tells, in a sentence or two, up to 4,000 characters. It is shown above the dashboard and first in its Read view. Once you change either field, a **Save name and introduction** button appears.
- **Widgets can be moved and resized.** Drag a Widget by its title bar (a grip appears when you point at it). Drag its lower right corner to resize it. A Widget is at least 2 columns wide and 3 rows high, out of 12 columns. The new layout is saved as soon as you let go.

Changes are saved for everyone who opens the dashboard. Each one is recorded as a Version.

On a narrow screen, such as a phone, the dashboard becomes one column in reading order, top to bottom and left to right. Widgets cannot be moved there. The toolbar is one row there: **Grid** and **Read**, **Share** and **⋯**; **⋯** opens a sheet from the bottom with the rest (**Home dashboard**, **Pinned**, **Snapshots**, **Present**, **Edit**, and the entries of the ⋯ menu), and the hint about a widget's ⋯ menu is left out.

### The Pool

Metrics that share a name show their owner (or, for one owner, the period and unit) next to the name in the Pool, so you can tell them apart.

A widget that shows an **Archived Metric** keeps drawing its history and is marked **Archived** next to its title; the Pool, a template's Slots and a panel's list of Metrics no longer offer it (a panel keeps one it already shows, so you can take it out).

The **Pool** holds everything you can put on the dashboard. **Filter** at the top narrows all of it by name. It has three parts:

- **Metrics**: every Metric you can see, except **Archived Metrics**. A derived Metric has a Σ mark. Metrics owned by someone else show that person's first name. If you see none yet, the Pool links to **Describe your first one**.
- **My Widgets**: the Widgets you saved (see [Saving a widget](#saving-a-widget)). Each shows its name and its Widget Template. The **×** next to one deletes it from your Pool, without asking; Widgets already placed from it stay.
- **Templates**: the built-in **Widget Templates** in four groups, **Views**, **Analyses**, **Findings** and **Layout**; **The Workspace's View Designs**, when Owners or Admins added some (see [View Designs](13-analyze.md#view-designs)); and then **The team's**: Widget Templates colleagues saved, each with its number of Slots and who made it. The full list of built-in templates is in [Templates](05-templates.md#widget-templates). An Analysis on a dashboard reads as it does in [Analyze](13-analyze.md#reading-the-results): Metrics counted at different periods are compared on the longer one, and the result says so.

To place something, drag it onto the dashboard where you want it, or point at it and press **+** to add it.

- **A Metric** lands as **Number + sparkline**. The sparkline keeps a small, fixed height, also in a tall card on a phone, so small dips do not look dramatic. You can change that afterwards with **Change view**.
- **A saved Widget** lands as a copy. Changing the copy does not change your saved Widget, nor the other way round.
- **A Widget Template** first asks for its Slots (see below), then lands with the chosen Metrics.

Pointing at a template, saved Widget or Metric for a moment shows its Preview beside the Pool. On a touch screen or a narrow window, press the **ⓘ** button on its row instead to see the Preview below it. A template's Preview always uses Sample Data. A saved Widget's or Metric's Preview draws your own values.

**Browse…** next to **Templates** opens **Browse templates**: every template as a larger Preview, grouped as in the Pool, with **Filter** and a **Use** button on each.

A team Widget Template in the Pool has its own **⋯** menu. Everyone sees **Versions…**. Only the person who saved it sees **Rename…** (its name and "What it is for") and **Delete**. Deleting asks first; Widgets made from it stay as they are.

### Filling a Widget Template's Slots

When a template lands, a window named after it asks for each Slot, such as "Metric", "Metric with a breakdown", "First metric" and "Second metric", or "Metrics, one or more". A team template also says which Metrics it was made with ("In the original: …"), as far as you can see them. Once every Slot is filled, a Preview shows the Widget with your Metrics. Press **Add** (built-in templates) or **Use template** (team templates), or **Cancel**.

## A widget's menu

Every **Widget** has a **⋯** button in its title bar. Right-clicking the Widget opens the same menu. A line under the dashboard's name reminds you of this until you have opened a Widget's menu once.

If a Widget's Metric has open questions or tasks, its title bar shows how many are open.  The reminder is remembered in your browser and is not shown on an empty dashboard.

| Option | Who sees it | What it does |
| --- | --- | --- |
| **History** | Everyone | The Metric's history (see below). |
| **Ask a question…** | Everyone | Ask someone about a value, right here. |
| **Assign a task…** | Everyone | Give someone a task about a value. |
| **Change view** | The owner and Editors, in edit mode | Draws the Widget another way (see below). Not offered for Analyses. |
| **Comparisons** | The owner and Editors, in edit mode, for Views | Which Comparisons the Widget shows (see below). |
| **Show by** | The owner and Editors, in edit mode, for Number + sparkline, Line chart, Bars per period, History table and Forecast | Shows the Metric by a longer period, such as quarters or years (see below). |
| **Edit Finding…** | The owner and Editors, in edit mode, for Findings | Opens the Finding editor (see [Findings](#findings)). |
| **Edit layout…** | The owner and Editors, in edit mode, for a Free layout | Opens the layout editor (see [Free layout](#free-layout)). |
| **Versions…** | Everyone | The Widget's own history of changes. |
| **Copy to…** | Everyone | Opens a submenu of the ways to keep a copy of the Widget, below. |
| **For View Designs** | Everyone, for a Widget drawn with a View Design | Opens a submenu with the two entries below. |

Under **Copy to…**:

| Option | Who sees it | What it does |
| --- | --- | --- |
| **Add to dashboard** | When you may change another dashboard | Places a copy on one of your other dashboards. |
| **Add to deck…** | Everyone except Guests | Places a copy on a slide of a deck you own or may edit, or of a new deck named after the Widget: pick the deck, then a slide or **New slide at the end**. The deck opens on that slide; **Go back** in the message returns here. The copy draws only Metrics you see, and changing it leaves this Widget as it is. Also on a Finding of a story. |
| **Save as Widget** | Everyone except Guests | Saves a copy to your Pool. |
| **Save as template…** | The owner and Editors | Saves the Widget as a team Widget Template. Not offered for a Free layout. |

Under **For View Designs**:

| Option | What it does |
| --- | --- |
| **Export View Design** | Downloads the View Design the Widget is drawn with, and a Sample Data file to try it with. Not offered for Findings and Free layouts. |
| **Duplicate as View Design** | The same, with this Widget's settings (how many periods, target band, forecast) as the design's defaults, named after the Widget. |

| Option | Who sees it | What it does |
| --- | --- | --- |
| **Open metric** | Everyone | Opens the Metric's page. With several Metrics, there is one **Open** entry per Metric, with its name. |
| **Quick look** | Everyone | Opens the Widget's Metric in a panel on the right: its latest value, target, trend and owner, with **Open the Metric** at the bottom. A Widget with one Metric also shows a small button for it beside its title. |
| **Remove from dashboard** | The owner and Editors, in edit mode | Takes the Widget off the dashboard, at once. **Versions** of the dashboard keep it. |

If a Widget draws a Metric you may not see, it shows "No access to this metric. Ask its owner to share it." instead.

### History

**History** opens beside the Widget: the Metric's name and how many periods are on record, a small chart of its values (with marks where questions were asked), a table of its Comparisons, its **Questions and tasks** (an Approval reads as a plain question, without the chat words "Reply approve"), any **Superseded values** (with when they were replaced or removed), and every value with its period, how it came in and who sent it.

### Asking a question or assigning a task

**Ask a question…** and **Assign a task…** open the same small form, with **Question** and **Task** to switch between them:

| Field | What it does |
| --- | --- |
| **About** | The period the question is about, with its value. Right-clicking a bar, point or row first picks that period, or that row of a Breakdown. |
| **Ask** / **Assign to** | Who you ask. It starts with whoever submits the Metric, else its owner. |
| The text | A draft question, such as "Why is cost so high in March?" when the value is off target. Change it as you like. |
| **Due** | For a task only: an optional due date. |
| **Who can read** | **Everyone**, or one Group only. |
| **Send via** | The person's own choice, or one Connector just for this time. |

Press **Send question** or **Assign task**. A note says "Question put to …" or "Task put to …", with **Open thread**; it does not say whether the message went out, which the Outbox shows. What happens next is in [Actions](15-actions.md).

### Change view

**Change view** lists the ways this Widget can be drawn. A tick marks the current one. Pointing at a choice shows a Preview of this Widget drawn that way, with its own Metric.

- The **Views** (Number + sparkline, Line chart, Bars per period, Gauge vs. target, History table).
- The **Findings**. Ranked bars, Part of the whole and 7 in 10 are offered only when the Metric has a **Breakdown**.
- **Free layout**.
- The team's Widget Templates, each with "…". Choosing one asks for its Slots, starting with this Widget's Metrics, and then turns the Widget into that template. Its Preview uses Sample Data.
- For **Line chart** and **Bars per period**: **Show target band**, on by default, draws the Metric's **Target Range** behind the values. For **Line chart** only: **Show forecast** adds Ziffr's projection of the next few periods, with a band of how far it may be off. It is the same forecast the Metric page shows.

How many periods a View shows comes with its Widget Template: the last 12 periods for Number + sparkline, Line chart and Bars per period, and the last 6 values for History table. There is no setting to change it.

Each of these Views, and the Analyses (Forecast, Correlation, Correlation matrix, Drivers), is a **View Design**: a file that says what the View draws, which Ziffr draws with one renderer of its own. They look as they always did, except that Drivers, Correlation and the Correlation matrix now say what they compared ("Compared by change, growth removed" where both Metrics grow, otherwise "Compared by value") and have a **Takeaway** (a sentence, a strength word, a plain line when the data makes the reading rough, and one footer) with **Show the numbers**, which gives r and the periods and switches to comparing the values as they are. The Drivers template now asks for two Slots when you place it: the Metric, and the Metrics to compare it with. A View Design of the Workspace can also draw an Analysis Recipe: its results show as lines, bars, a line across the chart or numbers in its words, and in the tooltip (see [Analysis Recipes](13-analyze.md#analysis-recipes)).

### A value's details

Point at a point or bar of a line, bars or forecast chart (tap it on a touch screen), or at the trend line under a number once its Widget has room, to see that value's details beside it: the period, the value, whether it is on target ("On target", "Too high"), whether it waits for Approval or is locked, its Source, who submitted it and how many open Threads there are about it. With the keyboard, move to the chart with Tab, step between points with the arrow keys, and close the details with Escape. You see a submitter's name only where you may see that person (a Guest sees only their own), and only the Threads you may read. View Links and Snapshots show the period, value, target and Approval only.

When a Widget has room and shows a number alone (no trend line yet), the number sits in the middle of the Widget.

### Comparisons

Views show a strip of **Comparisons** under the value. **Comparisons** lets you choose which:

- **vs previous period**, and **DoD**, **WoW**, **MoM**, **QoQ**, **HoH** and **YoY**, as far as they make sense for the Metric's period (a monthly Metric has no DoD or WoW). Quarters and half-years start from the Workspace's fiscal year. A tick marks each one shown. By default a Widget shows **vs previous period** and **YoY**.
- **Full periods instead of to date**: for spans longer than the Metric's period, Ziffr normally compares the span so far with the same stretch before (month to date against the same days last month). Tick this to compare whole periods instead.

When the Metric has a target, the strip starts with its **Attainment**, such as "92 % of target". Where there is no percentage, or it would be below 0 % (a margin of −6.5 % against a target of 13 %, by distance), the strip shows the gap instead, such as "6.5 pts below target" or "8,000 € below target". Point at it to see the target and the method it is computed with, by ratio or by distance (see [Metrics](10-metrics.md#comparisons)). The table in **History** shows the same number. A Snapshot keeps the method it was taken with.

### Show by

A Widget shows a Metric in its own period: a monthly Metric as months. **Show by** shows it by a longer **Display Period** instead: week, month, quarter, half-year or year, as far as it is longer than the Metric's own. A monthly Metric can be shown by quarter, half-year or year; a daily one also by week or month. A tick marks the current choice; **(its own)** goes back to the Metric's period.

- **How values combine.** Each quarter's (or year's) value is the Metric's values in it, combined by its **Aggregation**: added up, averaged or the last one. A Derived Metric is computed from its inputs' quarters: revenue minus cost per quarter, not the sum of its monthly results. If one of its inputs is set to Aggregation none, it has no quarters either: the Widget shows it by its own period and says why. The Comparisons strip combines the same way, so a quarter has the same value in the chart, the table and the strip.
- **Gaps.** A quarter is shown once at least half of its months have values. A past quarter that lacks some of them is marked with how many it holds ("Q2 2026, only 2 of 3 months"). It is hatched in bars, an open dashed point in a line, and the History table gives the count. Its sum would otherwise read as a drop. A week belongs to the month it starts in.
- **To date.** The quarter you are in is not over yet. It is marked **to date**, with how many of its periods it holds ("Q4 26, 2 of 3 months"): hatched in bars, dotted in a line, "to date" in the History table. Its value counts only the months so far.
- **Condensed.** Once a Retention has condensed old periods, a chart or table shows each condensed span as one point, named for what it was made from ("October 2023, condensed from 31 days", or "condensed from 20 of 31 days" when some had no value), with the note under the widget: "Before November 2023 shown by month, condensed from daily values." Shown by that period or a longer one, the numbers are the same as before; shown by a shorter one, the condensed points stay as they are and no days are invented.
- **How many.** The Widget shows as many Display Periods as it showed periods before, such as the last 12 quarters.
- **Targets.** Where every month of a quarter has a value in the Metric's **Target Series**, the quarter's target is those values combined the same way, drawn as a thin grey line. Otherwise the Metric's target range applies if its values are averaged or a last value; a summed Metric has no target by quarter, as a monthly range says nothing exact about three months. A line under the chart says which applies.
- **Forecast.** A forecast is computed on the quarters, a few of them ahead, from the last complete one. Under it, a forecast widget says where the Metric is expected to be, which Method worked it out (a plain trend, or the trend with the yearly pattern), how that Method did on the periods already known, and, when the Metric has a Target and **Show target band** is on, how likely the Target is to be reached. It is worked out in the Metric's own period from its latest 120 periods, so a widget shown by a longer period (**Show by**) draws the forecast but leaves these words out.
- **Rates.** A Metric whose Aggregation is **Does not combine**, such as a rate, cannot be shown by a longer period. **Show by** then greys out the longer periods and says why. If its values can in fact be added up, averaged or taken last, change the Aggregation under **Edit details…** on the Metric's page.

Quarters, half-years and years start from the Workspace's fiscal year. **Change view** to another of these views keeps the setting.

The Widget looks the same wherever it goes: on a deck's slides and in a Free layout, through a View Link, in a Snapshot and in the PowerPoint export. A Snapshot keeps what the Widget showed when its period ended: in a Snapshot of October, the fourth quarter stays "to date, 1 of 3 months", however long after you open it. A frozen View Link counts to date from the day it was made. Through a View Link or in a Snapshot, a Derived Metric whose inputs are not on the dashboard is shown by its own period, with a note, since its quarters are computed from those inputs.

### Metrics by Tag

A Widget that takes a list of Metrics, such as the Correlation matrix, can show **all Metrics tagged** with one Tag instead of a list you pick. In edit mode open its menu, then **Metrics by Tag**, and choose **All Metrics tagged …**; the Tags offered are the ones you see on Metrics you may see. A Metric tagged later appears by itself, and a Tag that is renamed is followed. When two Tags are merged the Widget follows the one that is left. Below the Widget a line says "Metrics tagged …" and, when you see more Metrics than it draws (at most 50, by name), links "and N more" to the Metrics list filtered by that Tag.

**Everyone sees only the tagged Metrics they may see themselves.** The dashboard's Share does not open a Metric through a Tag: if you tag a private Metric, the people the dashboard is shared with still do not see it, and two people may see different Metrics in the same Widget. Nobody is told how many they cannot see. Without any, the Widget says "No Metric tagged … that you can see." If the Tag was removed, the owner and Editors are told so, and the Widget keeps its place until its Tag is changed.

**Keep today's Metrics, stop following the Tag** in the same menu turns the Widget back into a fixed list of the Metrics shown now, and asks first, because those Metrics are then shown to everyone the dashboard is shared with (**Fix the list** in the View links window says the same). Adding such a Widget to a deck, taking a Snapshot and starting a deck from the dashboard record the Metrics you see at that moment, and do not follow the Tag afterwards. Copying the Widget to another dashboard keeps the Tag.

### Saving a widget

**Save as Widget** asks for a name ("Save to your widgets as:") and keeps a copy in **My Widgets** in your Pool. From there you can drag it onto any dashboard or slide. Each placement is an independent copy.

**Save as template…** saves the Widget as a team Widget Template that everyone in the Workspace can use with their own Metrics. Only you can change it later. The window asks:

| Field | What it does |
| --- | --- |
| **Save as** | Shown when you have saved templates before: **A new template**, or **Replace "…" (keeps its versions)**. |
| **Name** | Required. |
| **What it is for** | One line, shown when someone uses it. |
| **Slots** | Each Metric becomes a Slot, filled in when the template is used. Give each a name; the line says whether it takes one Metric or one or more, and which Metric it holds now. The Metric's name in the text becomes the Placeholder {metric}. |
| **Notes tied to one period or row** | A callout or Annotation fixed to "March" or "France" would not fit another Metric. For each, choose a rule it follows instead (**Latest period**, **Highest value**, **Lowest value**, **Biggest change**, **First period shown**; for rows **Largest row**, **Smallest row**), or **Leave out**. |

Press **Save template**. You find it under **Templates** in the Pool, and in **Change view**.

## Findings

A **Finding** is a Widget set as an editorial graphic: a headline that states what happened, a short line under it, the chart, and a source line. Findings read like the sections of an article in a dashboard's Read view, and work well on slides. You place one from the **Findings** group in the Pool:

| Finding | What it draws |
| --- | --- |
| **Finding: ranked bars** | One period's Breakdown, largest first, with one row highlighted. |
| **Finding: part of the whole** | How one period's Breakdown divides the total. |
| **Finding: 7 in 10** | The largest share as ten figures. |
| **Finding: annotated line** | The trend with callouts at the moments that matter. |
| **Finding: composed** | A frame around one or more Panels. |

The first three need a Metric with a Breakdown. Until it has one, the Finding says how to send one in: paste rows on the Metric's web form, or send label and value lines.

### The Finding editor

**Edit Finding…** opens the editor beside the Widget. Every field you leave empty falls back to a suggestion drawn from the data, shown greyed in the field. **Apply** saves your changes.

| Field | Shown for | What it does |
| --- | --- | --- |
| **Kicker** | Composed | A short line above the headline, such as the topic and the period. |
| **Headline** | All | States the finding. Words in braces fill themselves in (see below). |
| **Subline** | All | A short line under the headline. |
| **Panels** | Composed | The charts inside the frame (see below). |
| **Breakdown of** | Ranked bars, Part of the whole, 7 in 10 | Which period's Breakdown is drawn. **Latest** is the default and moves on with new values. |
| **Highlight** | Ranked bars, Part of the whole, 7 in 10 | Which row stands out. **Largest** is the default. |
| **Callouts** | Annotated line | A short note at a moment that matters. **Add callout**, then choose where: one that **Follows the data** (Latest period, Highest value, Lowest value, Biggest change, First period shown) or **One period**. The **×** removes one. |
| **Footnotes** | Composed | Small print at the bottom. |
| **Source line** | All | Where the values come from. The suggestion names the Metric and how its values came in. |

**Words that fill themselves in** lists the **Placeholders** you can write in braces:

| Placeholder | Becomes |
| --- | --- |
| {metric} | The Metric's name |
| {metrics} | All the Finding's Metrics, as a list |
| {period} | The latest period |
| {latest} | The latest value |
| {change yoy} | The change on the year before, in % |
| {change prev} | The change on the period before, in % |
| {top row} | The largest row of the latest Breakdown |
| {target} | The target for the latest period |

Add a number for another Metric of the Finding, such as {metric 2}. A headline such as "{metric} rose {change yoy} on last year" stays right when the values move on, and when someone uses the Finding as a template with another Metric.

### Panels

A **Panel** is one chart inside a composed Finding. **Add panel** adds one (period bars of the change against the previous year, over 6 periods, for the same Metrics as the panel before). The bin button removes one. For each Panel:

| Option | What it does |
| --- | --- |
| Panel type | **Period bars**, **Bridge**, **Annotated line**, **Ranked bars (breakdown)**, **Part of the whole (breakdown)** or **7 in 10 (breakdown)**. |
| **Choose metrics** | Tick the Metrics it draws. Several Metrics are drawn side by side as small multiples, one small chart each. When period bars are too narrow for every label, as on a phone, the highlighted bars keep their values and the others only where there is room; the periods underneath are named every second or third bar, always the last. |
| **Measure** | For period bars and annotated lines: the **Measure** drawn: **Value**, **Change vs previous period, %**, **Change vs previous year, %** or **Attainment of target, %** (by the Metric's method, as in the strip). |
| Periods | For period bars and annotated lines: how many periods to show, from 2 to 36. |
| **Highlight the last period** / **Highlight projections** | For period bars: which bars stand out. |
| **Include projections** | For period bars: also draws **Projections** after the last actual period. |
| **One scale for all metrics** | For period bars with several Metrics: draws all small multiples on the same scale, so their heights compare. |
| Reference line | For period bars and Bridges: **No reference line**, **Target**, **Average** or **A fixed value** (then type the value). |

A **Bridge** walks from a start value through signed steps to an end value. It has two kinds:

- **Rows of one breakdown**: from the first row to the total. Choose the period, or **Latest breakdown**.
- **Change between two periods**: how each row changed between two Breakdowns. Choose the later period and, under **From**, the earlier one (**From the breakdown before** by default).

### Annotations

Period bars, Bridges, ranked bars and annotated lines can carry **Annotations**. **Add annotation**, then choose:

- **Kind**: **Callout** (text with an optional **Arrow**), **Ring** (a highlight around it, no text) or **Note** (quiet text).
- **Attached to**: what it is about. Under **Follows the data**: the highest, the lowest, the last, the first, or the largest step (Bridges only). Or one period, or one row of a Breakdown.
- The text, for a callout or note, such as "Booking error, corrected".

An Annotation stays with what it is about, not with a place in the chart. "The highest" moves when a new record comes in, and an Annotation on a row disappears when that row is gone.

## Free layout

A **Free layout** is a Widget you arrange freely, like a slide: other Widgets, text, arrows and shapes on one artboard the size of the Widget. Place it from the **Layout** group in the Pool, then choose **Edit layout…** in its menu (in edit mode).

The layout editor fills the screen. On the left is a Pool ("Drag widgets onto the artboard; use the toolbar for text, arrows and shapes."). Drag Metrics, saved Widgets and Widget Templates onto the artboard, and use the drawing toolbar for text, arrows and shapes. Links and pages from other sites cannot be placed on it; paste or drop an image file itself instead. Press **Save layout** to keep it, or **Cancel**.

A Free layout cannot be saved as a Widget Template, and is left out when a dashboard is saved as a Dashboard Template.

## Grid and Read

A dashboard reads two ways. Switch with **Grid** and **Read** in the toolbar.

- **Grid** shows the Widgets as arranged, side by side. This is where you edit.
- **Read** shows the name, the introduction, and then every Widget one below the other at full width, in reading order (top to bottom, left to right). It suits a phone, or a dashboard written to explain what happened, where Findings read like the sections of an article. Nothing can be changed in Read; switch to Grid and press **Edit**.

## Presenting

**Present** shows the dashboard in its Theme on the whole screen, without the Pool or menus.

| Option | What it does |
| --- | --- |
| **Overview** | The whole dashboard as arranged, fitted to the screen. On a narrow screen it stacks in reading order. Double-click a Widget to show it alone. |
| **One at a time** | One Widget at a time, as large as the screen allows, with **Previous**, **Next** and a count such as "3 / 8". |
| **Full screen** / **Leave full screen** | Uses the whole screen, without the browser around it. |
| **Close** | Goes back to the dashboard. |

A Widget grows with the space it has: when it is large on a dashboard, and when presenting, its value, the gauge, the table rows, the chart axes and the line under it get larger, so a Widget shown on a big screen reads from across the room. Its parts share the room: the small trend line under a number grows into the free height and, from about Overview size on, names its first and last period, marks the latest value with a dot, labels its highest and lowest value and shows the target as a faint band or dashed line (a target far from the values is named at the edge instead), a table spreads its rows, and what does not grow sits in the middle rather than in a corner. Widgets of the usual size and phones show it at its normal size.

To step through Widgets, use the arrow keys, the space bar, Page Up and Page Down, or swipe. **Home** and **End** jump to the first and last. **Escape** closes presenting (or first leaves full screen).

## Saving a dashboard as a Dashboard Template

**Save as template** in the dashboard's **⋯** menu makes a team Dashboard Template, so the next dashboard can start from this one. You can do this when you may change the dashboard and see every Metric on it; otherwise the window says so.

| Field | What it does |
| --- | --- |
| **Name** | Required; starts with the dashboard's name. |
| **What it is for** | One line, such as "The monthly numbers for one region". |
| **Places to fill** | One Slot for each Metric, however many Widgets show it; a Widget of all Metrics tagged X becomes one "one or more" Slot called "Tagged Metrics" (rename it if you like, but everyone in the Workspace reads the name), since a template names no Tag. "Now:" says which Metric it holds. Give each a name, such as "Revenue metric"; an empty one is called "Metric 1", "Metric 2" and so on. The whole Workspace reads these names, also people who cannot see the Metrics, so the fields start empty. |

A Widget whose Tag you cannot see is left out as well. Free layouts are left out, and the window lists them. Press **Save template**. Anyone in the Workspace can then pick it under **Start from** in the New dashboard window.

## Sharing

Only a dashboard's owner shares it. **Share** opens a panel on the right, over the page, listing the people in the Workspace (not Contacts, who have no login) and, under **Groups, including whoever joins later**, every **Group** with its members. For each, choose:

**Invite someone…** at the bottom of the Share window is for someone who is not in the Workspace yet, such as when you are the only one in it. Owners and Admins enter an email address and choose **Member** or **Guest** (a Guest sees only what is shared with them), and Ziffr invites them the same way as the **Members and Groups** page: it emails the link when mail is set up and shows it to send yourself. A person is shared with once they have joined and appear in the list. Everyone else sees "Ask an Owner or Admin to invite them" (for a dashboard or deck).

- **No access**.
- **Viewer**: can look, inspect history and ask questions, but not change the dashboard.
- **Editor**: can also arrange Widgets, edit Findings, change the name, introduction and Theme, and take Snapshots. Sharing, View Links, automatic Snapshots and deleting a Snapshot stay with the owner.

The choice takes effect at once. A Group share also reaches whoever joins the Group later.

**Sharing a dashboard also lets people see every Metric on it.** When that would show someone a Metric they could not see before, the line under their name says so in colour: "Also shows Cost, Margin and 2 more". Check this before you share.

At the bottom of the window, **Who can see this** and, for the owner, **View links for outsiders** open those windows.

### Who can see this

**Who can see this** (in the **⋯** menu, for everyone who can open the dashboard) lists every person in the Workspace and why they have access: "owner", "shared as Viewer", "Editor through Management", or "No access". A Guest sees only what is shared with them, so people outside it show as "Someone", there and wherever the dashboard names people.

When someone asked for access, the owner sees them first, under **Asking for access**, with **Grant as Viewer** and **Decline**.

## View Links

A **View Link** shows one dashboard to someone outside the team, such as a board member or an investor, without a login. They see this dashboard and nothing else, and cannot change or ask anything. Only the dashboard's owner makes View Links, Guests make none, and the demo makes none.

Open **View links…** in the **⋯** menu:

| Field | What it does |
| --- | --- |
| **For** | Who the link is for, such as "Advisory board, Q4", so you recognise it later. |
| **Works until** | The last day it works: 30 days from today unless you change it, at most 90 days. In a trial it is never later than the trial's last day, and a later date you pick is shortened to it, and it keeps that date if you subscribe: give the link a new end by making a new one. |
| **Freeze today's numbers** | The link keeps the values of today. Otherwise it shows live values until it ends. |
| **Show names** | Off by default. Without it the link shows no one's name: owners, submitters, authors and the people of a Snapshot are left out, and a name written in a title or an introduction reads "Someone". Tick it for an internal link. |

The page a View Link opens is drawn in the dashboard's Theme and says whose numbers they are: a strip with the Theme's logo (or the Workspace's name) under a bar in its accent colour, and the Theme's footer line. A deck shows its logo and footer on every slide, as in the app. Only the Workspace's name goes along with what the link already showed. A logo larger than 256 KB or 512 pixels on a side is not drawn; the Workspace's name stands in its place.

**Make link and copy it** makes the link and puts it on your clipboard. Below, every link of this dashboard is listed with its name, "Live numbers" or "Frozen numbers", and until when it works. **Copy** copies it again; **Revoke** ends it at once. Ended and revoked links are crossed out. **Show names** and **Hide names** switch the names of a link that is already made, which takes effect the next time it is opened; a link made before this option existed has names off.

A dashboard with a Widget of all Metrics tagged X needs its list fixed first: the window says so and offers **Fix the list**, which turns each such Widget into a fixed list of the Metrics you see now, which then no longer follows the Tag. A link shows a list its maker chose, never what a Tag collects for each viewer. A link to a shown Snapshot needs no fixing.

A live link shows only what the dashboard held when the link was made: Widgets added later, and Metrics added later, stay out. A Widget that draws a Metric the owner can no longer see is left out whole.

### What an outside visitor sees

- A dashboard with an introduction opens in its Read view: the name, the introduction and the Widgets top to bottom.
- A dashboard without one opens as when presenting, with **Overview** and **One at a time**, but without **Close**.
- Every Widget shows its values and nothing else: no menus, no history, no way to ask.
- A line says "Numbers as of" the date the values are from.
- People's names appear where a Widget shows them, never their email address or phone.
- When the link has ended or was revoked, the visitor sees "This link does not work any more" and is asked to get a new one from whoever sent it.

Search engines are asked not to list these pages.

## Snapshots

A **Snapshot** keeps what the dashboard showed for one week, month, quarter, half-year or year (quarters, half-years and years of the Workspace's fiscal year, such as "Q1 FY 2026/27" when the year starts in April, or "H2 2026" and "2026" when it starts in January): its layout and the values of every Metric period complete by the period's last day. Its values never change, even when someone corrects one later. Its words (the introduction and each Finding's headline and lines) you write afterwards, such as "What happened in October".

### The Snapshots menu

**Snapshots** in the toolbar lists the dashboard's Snapshots, newest period first (of periods that end on the same day, the longer first: "2026", "H2 2026", "Q4 2026", "December 2026"), under "The dashboard as it stood for a period". A Snapshot still in draft is marked **Draft**. Choose one to open it.

The owner and Editors also see:

- **Take a Snapshot…** (not Guests).
- For the owner only: **Take one by itself…**, or **Takes one every month…** once set (see [Automatic Snapshots](#automatic-snapshots)).

### Taking a Snapshot

**Take a Snapshot…** asks:

- **Period**: **Month**, **Quarter**, **Half-year**, **Year** or **Week**.
- **Which**: one of the last complete periods, the most recent first. Only a period that is over can be taken.

Press **Take Snapshot**. Ziffr keeps the dashboard as it is now, with the values up to the end of that period, and opens the Snapshot so you can write it up. To take one, you must see every Metric on the dashboard. A dashboard has at most one Snapshot per period, at most 500 in all, going back at most ten years.

### Reading and writing a Snapshot

A band at the top of a Snapshot says which period it is, when and by whom it was taken ("by Ziffr for" the owner when it was taken automatically), and **Draft: only the dashboard's owner and Editors see it** while it is a draft. **See it live** goes to the dashboard as it is today. Below, the dashboard reads top to bottom, drawn from the values it kept.

- If you may not see some of its Metrics, the band says how many parts are not shown.
- If a value was corrected or removed since, the band lists it under "Corrected since this Snapshot was taken; it keeps the values it had", with the value then and what it is now.
- Once its words were changed after it was shown, the band says when.

The owner and Editors have these buttons:

| Button | What it does |
| --- | --- |
| **Write** / **Done** | Opens the words to write: the **Introduction** ("What happened in this period, in a sentence or two"), then each part: a **Title**, or for a Finding its **Kicker**, **Headline**, **Subline**, **Footnote** and **Source**. Empty fields fall back to what the data says. **Save words** keeps them. Only the words change; the values, charts and layout stay as they were. |
| **Show to everyone with access** | Ends the draft. From then on, whoever may open the dashboard may open the Snapshot, and sees in it only the Metrics they may see now. |
| **Versions** | Every change to its words (see [Versions](#versions)). Everyone who can open it sees this. |
| **Delete** | The owner only. Asks first; the Snapshot's values and words go for good, the dashboard and its values stay. |

Everyone who may create also has **Make a deck**: it starts a Deck named after the dashboard and the period, with the Snapshot's introduction on the title slide and one slide for each part, drawn from the values the Snapshot kept.

### Example: the annual review

A dashboard "Annual review" shows Revenue by month. In January 2027 its owner opens **Snapshots ▸ Take a Snapshot…**, chooses **Year** and **2026**, and presses **Take Snapshot**. The Snapshot "2026" keeps Revenue's twelve months of 2026 and those before, not January 2027. The owner writes the introduction ("Revenue grew by a quarter; the second half carried it") and shows it. In the Snapshots menu it comes first, above "H2 2026", "Q4 2026" and "December 2026". **Make a deck** on it starts the deck "Annual review, 2026" for the board.

To have it taken by itself next year, choose **Take one by itself…** ▸ **Every year**. The Snapshot "2027" is then taken as soon as every Metric on the dashboard is Locked for all twelve months of 2027, or the set number of days after 31 December.

### Automatic Snapshots

The dashboard's owner can have it take a Snapshot by itself. Choose **Take one by itself…**:

- **Take one**: **Only by hand**, **Every month**, **Every quarter**, **Every half-year**, **Every year** or **Every week**.
- **Wait at most (days)**: from 0 to 60, 5 by default.

Each period's Snapshot is then taken in the owner's name as soon as every Metric on the dashboard is **Locked** for every one of its periods in it (for a year of a monthly Metric, all twelve months), or that many days after the period ends, whichever comes first. Ziffr tells the owner it is ready to write up. It stays a draft until someone shows it. A Snapshot deleted is not taken again.

## Versions

A **Version** is a saved state of something you build, with who made it and when. Dashboards, single Widgets, team Widget Templates, Decks and a Snapshot's words all keep Versions. Edits by one person within ten minutes form one Version.

**Versions** opens a panel on the right with the list, newest first. Each shows its number (such as "v12"), its name or "Current" or "Edited", who made it and when, and what changed.

If you may change the thing (its owner and Editors), you also see:

- **Name this state** and **Save**: names the current state, such as "Board pack Q3, final", so you can find it again.
- **Name** / **Rename** on each Version.
- **Restore** on each earlier Version. Restoring writes the old state back as a new Version, so nothing is lost.

Viewers see the list but cannot restore or name.

A Version keeps how something was built; a Snapshot keeps what a dashboard showed.

## Old story addresses

Earlier, Ziffr had stories as a screen of their own. They are now dashboards with an introduction, read in the Read view. An old address of a story opens that dashboard in its Read view, and the old stories list opens the Dashboards list.

## Panels have their own address

Share, Versions and a Metric's quick look open as panels on the right, over the page; on a phone they fill the screen. The address of the page then ends in `?panel=share`, `?panel=versions` or `?panel=metric-` and the Metric's short name, so you can send the link and whoever opens it sees the page with the panel open. While a panel is open the keys stay inside it; **Esc** or **Close** closes it and puts you back where you were.
