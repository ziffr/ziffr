<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/metrics/**, apps/web/src/app/paste-values/**, apps/web/src/app/submit/**, apps/web/src/components/target-chip.tsx, apps/web/src/components/compare-strip.tsx, apps/web/src/components/compare-table.tsx, apps/web/src/components/status.tsx -->
# The Metrics screens

Every number your team tracks is a **Metric**. This chapter walks through every screen about Metrics: the list, describing a new one, a Metric's own page with its tabs, and the small form a Submitter opens to send in a value. Open them with **Metrics** in the sidebar.

Not everyone sees the same Metrics. You see a Metric when you own it, when it is shared with you or with one of your **Groups**, when it is on a dashboard or deck shared with you, or when you send in its values. Being an Owner or Admin of the Workspace does not show you every Metric by itself.

## How colours and arrows work

The same rule holds on every Metric screen, and on dashboards too:

- **Green and red only say whether a value is on target.** A small label next to a value reads "On target" (green) or, when it is off target (red), what is wrong: "Too high" for a Metric where lower is better, "Too low" where higher is better, and "Above target" or "Below target" for a target range with no better side. When a Metric has no target, there is no label. A Widget that shows a Metric by quarter or year judges each quarter against that quarter's target; point at the label to see which target applies (see **Show by** in the Dashboards chapter).
- **Arrows and signs show which way a value changed**, such as ↗ +4.2 %. They are never coloured, because a rise is good for revenue and bad for cost.

The Metrics list repeats this in one line above the table. Under a widget on a dashboard, the same comparisons appear as a short line: the **Attainment** ("92 % of target"), then for example "vs prev. ↗ +4.2 %" and "YoY ↘ −1.0 %", or "n/a" when a comparison cannot be made. Point at an entry to see both values it compares. Every percentage change in Ziffr is written this one way: one decimal, a sign, a space and "%".

Every value is written in the Workspace's **Number Style** (see the Workspace settings chapter), with its Metric's unit on the side the Metric says: "118,941 €" in a Workspace that writes 1,234.5, "118.941 €" in one that writes 1.234,5, "$1,200" for a Metric whose unit stands before the number. A negative value has the minus sign in front, the unit too: "−$1,200", "−3.5 %". Chart labels shorten values from 10,000 on, such as "12.3k", "126k €" or "$1.2M".

## The Metrics list

The list shows every Metric you may see, one row each.

| Column | What it shows |
| --- | --- |
| **Metric** | Its name, how often it is counted (Daily, Weekly, Monthly, Quarterly or Yearly) and how its values arrive, such as "via Web form or Mail". A **Derived Metric** says "derived from other metrics" instead. |
| **Latest** | The most recent value, its period and its on-target label, marked "not approved yet" while it waits for **Approval**. "No values yet" when nothing has arrived. |
| **Change** | The change against the period before, as an arrow and a percentage. |
| **Trend** | A small line of the last 30 periods, on wider screens. |
| **Target** | Its **Target Range**, such as "≥ 80,000 €", "≤ 5 %", "40 – 60" or "No target". |
| **Owner** | The **Metric Owner**, on wide screens. |

Click a row to open the Metric's page. **New metric** (top right) starts a new one. **Paste values** opens a page that records many values at once from a spreadsheet (see [Paste values from a spreadsheet](#paste-values-from-a-spreadsheet)). With no Metrics yet, the list says "No metrics yet" and offers **New metric**.

In the [sidebar layout](17-your-settings.md#the-sidebar), each row also has a **Details** button beside the Metric's name (it shows on hover or keyboard focus, and always on a phone). It opens a panel on the right with the latest value and its on-target label, the change, a trend line, the **Target** and **Owner**, and the latest six values, with **Open the Metric** at the bottom. **Esc** or **Close** closes it and you are back in the list.

## Paste values from a spreadsheet

**Paste values** in the Metrics list, or **Paste history** on a Metric's History tab, opens a page for values you already keep in a spreadsheet. Copy the cells in Excel, Google Sheets, LibreOffice or Numbers and press Ctrl+V (⌘V on a Mac) anywhere on the page, or paste them into the text box. Ziffr reads only the cells' text: no add-on and no connection to Microsoft or Google is needed.

Nothing is recorded until you confirm. Ziffr first shows what each value would do.

### From a file

Instead of pasting, drop a file on the box or choose **Or choose a file**: a CSV file (.csv, .tsv or .txt), an Excel workbook (.xlsx, .xls) or an OpenDocument one (.ods). The file is read in your browser, and only its cells are sent, exactly as if you had pasted them, so the preview and the limits are the same. A workbook's first sheet is read, cells as they are shown (a cell formatted as 2.5 % reads as 2.5 %); with several sheets, pick another under **sheet**. A CSV file may hold at most 256 KB and a workbook at most 10 MB.

### The layouts

Ziffr recognises three layouts and says above the preview which one it read, such as "Metrics as rows, periods as columns: 2 Metrics × 3 periods". When a paste fits two layouts, a link offers the other reading.

- **Metrics as rows, periods as columns**, or the other way round. The first cell may be empty:

  |  | Aug 2026 | Sep 2026 | Oct 2026 |
  | --- | --- | --- | --- |
  | Revenue | 1,200 | 1,350 | 1,410 |
  | Signups | 12 | 14 | 15 |

- **One value per row**, with its Metric, period and value in any order of columns. A header row such as "Metric, Period, Value" is skipped. A column between them that is empty everywhere is fine:

  | Metric | Period | Value |
  | --- | --- | --- |
  | Revenue | 2026-09 | 1,350 |
  | Signups | 2026-09 | 14 |

- **Two columns, period and value**, for one Metric. **Paste history** opens the page with its Metric chosen; on the other page, pick it under **Two columns are for**.

A cell names a Metric by its name or its slug, without regard to capitals or extra spaces. When two Metrics you see share a name, the preview asks you to write the slug of the one you mean.

### How periods and numbers are read

- **Periods** are read the way Ziffr reads an answer to a Prompt: "2026-10", "Oct-26", "October 2026", "Q3 2026", "KW 46", "2026-W46", or a date such as "2026-10-15", "15.10.2026" or "10/15/2026" in the order your Workspace writes dates. A date inside a period counts as that period, so "2026-10-15" is October for a monthly Metric. A period of another length than the Metric's (a month for a weekly Metric) is refused, and so is a period that has not begun yet. A spreadsheet's date number such as "46296" is never guessed.
- **Numbers** are read in the Workspace's **Number Style**, as everywhere else. A currency sign or code is taken off when it is the Metric's unit ("€1,200" for a Metric in €), and a percent sign for a percent Metric. A "%" on a Metric whose unit is not a percent is refused, never divided by 100. "(1,200)" in brackets is −1,200. An empty cell is skipped. A spreadsheet error such as "#N/A" or "#DIV/0!" is refused by name.

### The preview

The preview lists every value, grouped by Metric: its cell (such as C7), the period, the value as Ziffr will store it, the outcome, and why. Above it, a summary says how many values would be recorded and how many would not, such as "118 to record (4 of them unusual), 2 locked, 6 refused". The summary is also read out to screen readers.

| Outcome | What it means |
| --- | --- |
| **recorded** | The value is recorded as it stands. |
| **replaces** | The Submission Rule overwrites the value there; the value there now is shown. |
| **adds up**, **kept beside** | The Submission Rule adds it to the value there, or keeps both. |
| **unusual** | It is recorded, and the Metric's Workflow asks for **Approval**, with the reasons. **needs approval** means the Workflow approves every value. |
| **locked** | The period is Locked, so the value goes to the Metric Owner as a proposed Correction. |
| **duplicate** | The period has a value and the rule rejects a second one, or the paste holds two values for the same Metric and period. Both are refused, never one picked. |
| **refused** | With the reason, such as "not a Metric you submit for", a Derived Metric, a Metric that does not take values from the web form, a period in the future, or "not a number". A Metric you cannot see is named in the same words whether it exists or not. |
| **as history** | Recorded as history (below). |

You record values only for Metrics you submit for, through the same rules as the personal form link: the Submission Rule, Locks, the Unusual Value check and Approvals. Pasting is filling in the web form, so a Metric that has turned the web form off takes no pasted values. While you stand in for someone who is Away, you may paste for their Metrics too.

Untick a value to leave it out, or the box beside a Metric's name to leave out all of its values. A line under the summary says when values would ask someone for Approval, such as "14 values would ask Ana for Approval".

### Record as history

The Metric Owner, and an Owner or Admin who submits for the Metric, see **Record as history** for that Metric: "No Unusual Value check, marked as imported". It applies only to past periods that have no value yet. Those values become an **Import**: they skip the Unusual Value check and its Approvals and are marked as imported in the Metric's history. A period that already has a value, the current period, and a Locked period are handled as usual. Nobody else gets the choice, and asking for it any other way changes nothing.

### Recording

**Record … values** records them one after the other, per Metric in period order, so each month is checked against the one before as the paste left it. If something changed since the preview (a colleague recorded a value, a period was Locked), a value gets the outcome it gets now, marked "changed since the preview". The result lists what became of each value, with a link to each Metric. **Paste more** starts again.

### Limits

A paste holds at most 256 KB of text and 2,000 values, and you may paste at most 10,000 values in 24 hours, across all your Workspaces. In the demo, where every visitor acts as the same made-up people, the day's limit is 500. A paste over a limit is refused whole, never cut. The result says how many values you may still paste today.

The list shows the Metrics in use. Once a Metric you may see is archived, two filters appear above the list: **In use** and **Archived** with their number. **Archived** lists only the **Archived Metrics** (see below).

## New metric

**New metric** opens a page with two ways to begin. You can change everything afterwards.

- **Start from scratch**: an empty form, for a number nobody has described before.
- **Metric Catalog**: a library of ready-made descriptions. Picking one copies its description into a new Metric of your own. It is yours from then on and does not follow later changes to the catalog. Besides the entries every Workspace has, it holds those of the Packs your Workspace installed, under each entry's category or the Pack's name (see [Packs](19-packs.md)).

Owners, Admins and Members create Metrics. Guests create nothing. When the Workspace has a **Workspace Limit** and holds as many Metrics as it allows (see [Installation settings](18-installation-settings.md)), the form says so at the top, such as "This Workspace holds 50 Metrics, as many as its Size Small allows. Archive a Metric, or ask an Owner to change the Size.", and creating waits until a Metric is archived or the limit is raised. Values keep arriving for every Metric meanwhile. From 90 % of the limit on, the page shows how many Metrics the Workspace holds of how many, such as "This Workspace holds 48 of 50 Metrics." Guests see neither.

### Finding a Metric in the catalog

| Option | What it does |
| --- | --- |
| **Search** | Finds catalog Metrics by words in their name, description or unit, such as "churn", "margin" or "tickets". |
| **For** your industry | Shows only the Metrics written for your kind of business. It appears once your Workspace has a **Workspace Profile** with an industry (see [Workspace settings](16-workspace-settings.md)). |
| **All** | Shows the whole catalog. |
| A category, such as Finance | Shows only that category. Click it again to show all. |

Each card shows the Metric's name, what it counts, its period, which way is good and its target. Click a card to open the form, already filled in. If nothing matches, try another word or start from scratch.

### The form

The form has three parts. The panel on the right says that you become the **Owner**: "The owner keeps the description up to date and accepts corrections to its values." **Create metric** saves it; **Cancel** goes back to the list.

**What is it?**

| Field | What it does |
| --- | --- |
| **Name** | What everyone will call it, such as "Customer satisfaction". Required. |
| **Description** | What exactly is counted, and what isn't. Would a new colleague understand it? |
| **Format** | **Number**, **Money** or **Percent**. Choosing **Money** fills in the unit of the Workspace Profile's currency: "€" after the number for euros, "$" before it for dollars, otherwise the currency's code before it, such as "CHF ". You can change it. A Percent Metric's values are numbers such as 12.5, not 0.125. |
| **Unit** | What stands next to the number, such as "€", "$", "d", "pc" or "%". Any text up to 20 characters; leave it empty for plain numbers. |
| **Stands** | Whether the unit stands **after** the number ("1.200 €", "12 d", with a space) or **before** it ("$1,200", without one; a unit such as "CHF " keeps the space it ends with). |
| **Decimals** | How many digits after the decimal point, from 0 to 4. A line under these fields shows how a value will read, in the Workspace's Number Style. |

**How do values arrive?**

| Field | What it does |
| --- | --- |
| **Period** | **Daily**, **Weekly**, **Monthly**, **Quarterly** or **Yearly**: one value per period. Quarters and years start from the Workspace's fiscal year (**Workspace → General**), so with a year that starts in April, Q1 is April to June. The period cannot change once the Metric has values, or targets or projections on its Targets tab. |
| **A second value for the same period** | The **Submission Rule**: what happens when another value arrives for a period that already has one. See the table below. |
| **Aggregation** | How values combine into a longer period, for comparisons such as QoQ or YoY and for Widgets shown by quarter or year (**Show by**, see the Dashboards chapter): **Sum** (counts and amounts, such as revenue or deals), **Average** (levels, such as a score or a delivery time), **Last value** (stocks, such as a balance or headcount) or **Does not combine** (rates and ratios). |
| **Sources** | The ways values may arrive: **Slack**, **Mail**, **Telegram**, **Web form** and **API and Feeds**. All are ticked for a new Metric, so each Submitter can use what suits them. A value that arrives another way is refused. In the demo, Slack and Mail are marked "(played in the demo)": nothing is really sent. |
| **Who submits** | The people who send in its values, members and Contacts alike. Each one gets a personal form link for this Metric and a first request for the value. |

The four Submission Rules:

| Rule | What happens to a second value | Good for |
| --- | --- | --- |
| **Reject a second value** | It is refused; the first value is final. | Numbers that must not change once given. |
| **Overwrite with the newer value** | It replaces the first. The first is kept as a **Superseded Value**. | Figures reported again in full, where the latest report wins. |
| **Add up all values** | It is added to the first. Values that arrive at the same moment all count. | Counts reported in pieces: "3 deals", then "2 more". |
| **Keep every value** | Both are kept. | Repeated measurements, such as weight twice a day. |

**Target**

| Field | What it does |
| --- | --- |
| **Which way is good** | The **Polarity**: **Higher is better**, **Lower is better** or **Closer to target is better**. |
| **Target from** | The lower end of the Target Range. Leave it empty for no lower end. |
| **Target to** | The upper end. Leave it empty for no upper end. |
| **Attainment** | How the percentage of target is computed: **As the workspace** (the default, set on **Workspace → General**), **By ratio** or **By distance**. See [Comparisons](#comparisons). |

After **Create metric**, the Metric's page opens with the note "Metric created. It has no values yet." Under it, one sentence says what really happened: who got a form link and a first request and by which way ("Ana got a form link and a first request by email."); that nobody submits it yet, with where to add Submitters; or, when this Ziffr sends no email, that nothing was sent and the request waits in the Outbox. Only the Metric's owner, who made it, sees who was asked.

## A Metric's page

The top of the page shows the Metric's name, a **Derived** badge if it is calculated from other Metrics, and its description. Below are three boxes:

- **Latest**: the most recent value with its period and on-target label.
- **Change vs. previous period**: an arrow and a percentage.
- **Target**: which way is good, and the target that counts for the latest period. If that period has its own value in the **Target Series**, the box shows it and says so; other periods use the Target Range.

Then come five tabs: **Overview**, **Analysis**, **Targets**, **History** and **Description**.

If a Metric is not shared with you, its page says "… isn't shared with you", names its owner, and offers **Ask … for access**. The owner sees your request under **Who can see this** and can let you in as a Viewer.

### The buttons at the top

| Button | What it does | Who sees it |
| --- | --- | --- |
| **Ask me now** | Sends you this period's **Prompt** for the Metric at once, by your own Connector (email, Slack or Telegram), instead of waiting for the Workflow. A message says where it went, why it stayed in the Outbox, or why it could not ask now, such as when it already asked in the last ten minutes. At most once every ten minutes per Metric. | The Metric's owner, when they submit it too |
| **Analyze** | Opens the Metric on an **Analysis Canvas** (see [Analyze](13-analyze.md)). | Everyone who sees the Metric |
| **Alert me…** | Opens your Alerts on this Metric and a form to set another: Ziffr tells you once when the latest value **reaches a share of its target**, **reaches a value** (at or above), **falls below a value**, **changes more than a share** against the period before, or **has no value the day after its Due Date**. Choose a way to be told (your usual way, email, Slack or Telegram) and whether to **Include values not approved yet**; off, you hear only about published or approved values. A kind the Metric cannot give is greyed out with the reason: a share needs a target with a percentage, the Due Date needs a Workflow. The dialog says how many Alerts you hold against the limits (20 in a Workspace, 5 on one Metric) before you hit them. Each Alert can be paused, edited or deleted there. With the preview layout on, it opens as a panel on the right instead of a dialog, with the same content. Not shown in the demo, and not for an Archived Metric. | Everyone with a sign-in who sees the Metric |
| **Duplicate** | Starts a new Metric with the same description (see below). | Owners, Admins and Members; not for a Derived Metric |
| **Add to dashboard** | Places the Metric on one of your dashboards as a widget drawn with the default **Widget Template**. Lists the dashboards you own or may edit. | Everyone; greyed out when you have no such dashboard |
| **Archive…** | Puts the Metric aside, keeping its values and history (see below). | Owners, Admins and the Metric Owner, outside the demo |
| **Bring back** | On an Archived Metric: makes it a Metric in use again (see below). | Owners, Admins and the Metric Owner, outside the demo |
| **Delete…** | Deletes the Metric (see below). | The Metric Owner, outside the demo |
| **Share** | Gives people or Groups access (see below). | The Metric Owner |
| **⋯** → **Who can see this** | Lists everyone with access and why: owner, a Share, a Group, a shared dashboard, or sending in values. | Everyone who sees the Metric |
| **⋯** → **Versions** | Shows earlier states of the description (see below). | Everyone who sees the Metric |

## The Overview tab

### The chart

The chart draws the Metric's values over time. A daily Metric shows its last 90 days. The shaded band is the Target Range, a dashed line is Ziffr's forecast, and a ringed point marks a period that has a question or task.

**Click a point to ask someone about it.** A small box opens, "New Action about" that period, with the value:

| Option | What it does |
| --- | --- |
| **Assign to** | The colleague who should answer. Contacts are not listed. |
| The question | Filled in for you, such as "Why is cost so high in March?" when the value is off target. Change it as you like. |
| **Assign Action** | Sends the **Question** and opens its page, where the **Thread** continues. |

See [Actions](15-actions.md) for what happens next. With no values yet, the chart is replaced by a note saying how values arrive, with a link to see who submits.

### Comparisons

The **Comparisons** box sets the latest value against earlier spans.

At the top it shows the **Value** of the latest period, its **Target** ("(series)" when it comes from the Target Series) and its **Attainment**: how far the value reaches its target, as a percentage where higher is always better. Attainment is green from 100 % up, red below. It is computed one of two ways, set for the Workspace on **Workspace → General** and changed for one Metric under **Edit details…**. Point at the Attainment to see which:

- **By ratio** divides the value by the target, or the target by the value when lower is better. With a target of at least 10, a value of 5 is 50 %; with a target of at most 10, a value of 5 is 200 %. A ratio means nothing for a target at or below 0, or for a value at or below 0 when lower is better, so there the difference to the target is shown instead, such as "3 € above target", or "6.5 pts below target" for a percentage. This is how Ziffr computed Attainment up to version 0.9.0, and what every Workspace uses until an Owner or Admin changes it.
- **By distance** counts the distance to the target in steps of the target's size. With a target of at least 10, a value of 5 is 50 %; with a target of at most 10, a value of 5 is 150 %; with a target of at least −10, a value of −5 is 150 %. Only a target of 0 has no percentage.

For "higher is better" with a target above 0, the two give the same number.

Below is one row per **Comparison** that fits the Metric's period: "vs previous period", DoD, WoW, MoM, QoQ, HoH and YoY (a monthly Metric has no DoD or WoW, a quarterly one has "vs previous period", QoQ, HoH and YoY, and a yearly one only YoY, which is its previous period). Quarters and half-years start from the Workspace's fiscal year (**Workspace → General**), so with a year that starts in April, QoQ in May compares April and May with January and February. Each row shows the two spans with their values, the change, and the change in percent; each figure stays on one line, also on a phone. When a comparison cannot be made, the row says why, such as "No values for the earlier span", or that the Metric does not combine into longer periods (its Aggregation is "Does not combine").

Two buttons choose how spans longer than the Metric's period are compared:

| Option | What it does |
| --- | --- |
| **To date** | The current span so far against the same span before. A monthly Metric in mid-quarter compares this quarter's months so far with the same months of last quarter. |
| **Full periods** | The last complete span against the one before. |

### Breakdown

A **Breakdown** splits one value into labelled rows, such as revenue by country. The box shows the rows of the latest period that has one, largest first. Buttons above it switch between the last six periods with a Breakdown.

When the rows add up to the total, a **Share** column shows each row's part. When they do not, a note says so: the total stays the Metric's value. Rates, for example, never add up. With no Breakdown yet, the box explains how to send one: add rows on the form, or send one line per row, such as "Germany 61,200".

## The Analysis tab

The tab lists the analyses Ziffr offers. In the demo, analyses still to come are shown with a lock and "coming soon"; they do nothing yet.

- **Forecast**: the trend per period and the value expected a few periods ahead (14 days, 6 weeks, 3 months, 2 quarters or 1 year), with a likely range. The forecast is drawn dashed on the Overview chart. It needs at least 4 values, so a yearly Metric has one after four years; until then the chart says so. It is worked out exactly from the values, so the Metric page, a forecast widget and the Analysis Canvas show the same numbers.
- **Correlation**: the other Metric that moves most like this one, how strongly, and over how many periods. A Metric counted at another period is compared on the longer of the two, the shorter combined by its Aggregation, and the sentence then adds "Compared by month (18 months)". Up to five candidates are offered as buttons; pick one to compare with it. A scatter chart shows one dot per common period. When this Metric's Aggregation is none, it is compared only with Metrics of its own period, and the tab says so. Only Metrics you may see are compared. See [Analyze](13-analyze.md#metrics-counted-at-different-periods).

For more analyses, use **Analyze** at the top (see [Analyze](13-analyze.md)).

## The Targets tab

The Target Range applies to every period. On this tab you give single periods a target of their own, such as a monthly budget: the Metric's **Target Series**. You also enter **Projections**, values expected for future periods. Projections are always shown as projections and never count as real values.

The Metric Owner and the Metric's **Editors** change this tab. Everyone else sees a plain table of periods, targets and projections. A Derived Metric has no Target Series of its own: it takes its targets from the Metrics in its formula.

| Option | What it does |
| --- | --- |
| **Targets** / **Projections** | Switches between the two lists. |
| **Add row** | Adds a row for the next period. Choose the month, the day, or for a quarterly or yearly Metric the quarter or year by its name ("Q3 2026"), then type the value. Numbers are read as everywhere in Ziffr, with your Workspace's Number Style settling `1.500` ([How Ziffr reads a number you send](04-connecting.md#how-ziffr-reads-a-number-you-send)). |
| **Paste from a spreadsheet** | Opens a box for two columns copied from a spreadsheet: period and value. Ziffr shows how many rows it read and which lines it skipped. **Add … to the table** puts them in the table; a row for a period already there replaces it. |
| **✕** on a row | Removes the row. A saved one is removed after you confirm. |
| **Note, for everyone who reads it** | A short note saved with the changed rows, such as "Budget 2027". |
| **Save … changes** | Saves the changed rows. Rows without a period or a number are pointed out and not saved. |

## The History tab

**Latest values** lists the last 12 values, oldest on top:

| Column | What it shows |
| --- | --- |
| **Period** | The period the value is for, marked "unapproved" while its value waits for **Approval**. Click it to open the [period's page](#a-periods-page). |
| **Value** | The value. A corrected value shows the earlier one struck through, marked "corrected". A value marked "pasted by …" came from [a paste](#paste-values-from-a-spreadsheet), and the name says who pasted it. A value marked "imported" is an **Import**: a **Feed**'s value for a past period, or a pasted one recorded as history, without the Unusual Value check. It counts at once, unless the Workflow approves every value and it is for the period being closed or later. |
| **From** | The Source it arrived through, such as Web form or Slack. For a value from a program, also the name of the **Access Key** or **Feed Key** it used. |
| **Submitted by** | The person, Contact or Feed who sent it. |

A Derived Metric has no values of its own, so it has no such list. If you submit values for the Metric on the web form, **Paste history** beside the heading opens [Paste values](#paste-values-from-a-spreadsheet) for this Metric.

**Questions and tasks** lists every **Action** on this Metric that you may read, with its status (**Open**, **Answered**, **Done** for a finished task, or **Closed**), its period and its **Assignee**. Click one to open its Thread. With none yet, the tab reminds you to click a point on the chart.

### A period's page

Click a period on the History tab, or **Open this period** after clicking a point on the chart, to open one Metric's page for one period, such as `/metrics/churn-rate/2026-03-01` (a month may also be written `2026-03`). It shows:

- the Metric, the period and its state (for example **Locked** or **Waiting for Approval**), with the value in large figures; after a Correction, the value it was submitted as is struck through;
- **History**: every step of that period's value in order, with the person, the channel and the date: submitted, replaced by a newer value, a Correction proposed, accepted or declined, approved, sent back, published, locked, and unlocked with its reason. A replaced value is struck through;
- **Threads**: the Questions and tasks about the period that you may read, each with its first message and how many replies follow. Click one to open and answer it.

You see the page only for a Metric you see. A Thread you may not read, and the Corrections proposed in it, are left out, as if there were none.

## The Description tab

The Description tab has four boxes: the Metric Description, the Retention, the Workflow, and who submits. A Derived Metric shows only its description.

### Description

The box lists the **Metric Description**: owner, period, format and decimals, which way is good, target and, for a Derived Metric, its **Formula**, written with the names of the Metrics it uses. For other Metrics it also shows how values arrive and what happens to a second value.

**Values arrive by** can be changed right here by the owner and Editors: tick or untick **Web form**, **Mail**, **Slack**, **Telegram** and **API and Feeds**, then **Save**. At least one must stay ticked. From then on, values arriving another way are refused.

**Edit details…** opens the description as a form, for the Metric Owner and Editors:

| Field | Notes |
| --- | --- |
| **Name**, **Description** | As on the new metric form. Links to the Metric keep working when its name changes. |
| **Format**, **Unit**, **Stands**, **Decimals** | As on the new metric form; decimals here go up to 6. |
| **Period** | Fixed once the Metric has values: "duplicate the Metric for another period". |
| **Which way is good** | The Polarity. |
| **Aggregation** | Sum, Average, Last value or Does not combine. |
| **Target from**, **Target up to** | The Target Range, for every period without its own target. The lower end may not be above the upper one. A value Ziffr cannot read as a number is not saved, and Ziffr says so. |
| **Attainment** | **As the workspace**, **By ratio** or **By distance**. Snapshots taken earlier keep the method they were taken with. |
| **A second value for a period** | The Submission Rule. Not shown for a Derived Metric. |

**Save** keeps the change as a new **Version**.

Ziffr has no screen yet for creating a Derived Metric or changing its formula. A Derived Metric's formula is shown here, but not edited.

A formula is read whole or not at all. It may hold `+ - * /`, brackets, numbers such as `12` or `0.5`, and other Metrics. Ziffr refuses a formula with anything else, such as `^`, `%`, `1e3`, `.5` or two values without a sign between them, rather than compute a number from the part it could read. It also refuses inputs counted by different periods, or by another period than the Derived Metric, and inputs set to Aggregation none. If a Derived Metric's inputs are changed later so that they no longer fit, its page and its Widgets say why ("Its inputs are counted by different periods") instead of showing an empty chart.

### Retention

A **Retention** says how long the Metric keeps its values, and what then happens to older ones. The box shows what is in force ("none: values are kept for ever" until someone sets one). Nothing is ever condensed or deleted unless a person turns it on here.

The Metric Owner, Owners and Admins see the form. Choose **Keep values for** 2, 3, 5, 7 or 10 years (or **Other**, in months, at least 13 so that a comparison with last year always has its whole span), and **Then**:

- **Nothing: keep every value**, which turns a Retention off.
- **Condense into longer periods**: values older than the keep time become one **Condensed Value** per week, month, quarter or year (the choice depends on the Metric's period), made with the Metric's Aggregation. Widgets that show the longer period, or any longer one, show the same numbers as before; only the detail below it goes. Quarters and years are those of the fiscal year. A Metric with Aggregation none cannot be condensed, and the form says why; it can be deleted or kept.
- **Delete**: values older than the keep time are deleted with their history.

**Show what it would do** counts what the setting would do today, without changing anything: how many periods and values, how many Condensed Values would be made, from which period to which, the Breakdown rows, earlier values (Superseded Values), Targets and Projections of those periods, locked periods, and how many Snapshots and frozen View Links already show them (named where you may open them). A period that an open question, task, Correction or approval still holds is left alone and counted as held back. Snapshots, decks and View Links keep what they showed, also after a delete; delete those first if they must go too. Ziffr refuses a delete while another Metric is derived from this one, and a condensing into a longer period than a Derived Metric reads by.

**Turn on…** is enabled once the numbers are shown. Turning it on, keeping values for less time, condensing into another period, or going from condensing to deleting needs this confirmation: a dialog repeats the counts, and for a delete you type the Metric's name. If the numbers changed since you looked (new open work, a Lock), Ziffr refuses with "The numbers changed; look again." and you show them again. Making the keep time longer, going from deleting to condensing, and turning it off need no confirmation and take effect at once.

A confirmed Retention does not start at once. It starts on the 8th day, and the box says so, such as "Values before 1 November 2024 will be condensed into months from 28 November 2026." Until then anyone who may set it can press **Cancel**, and nothing has been changed. The Metric's owner and the person who set it get a message when it is scheduled and one the day before. Cancelling and every setting are written in the Audit Log.

#### What the daily run does

Once it has started, a job does the work once a day, in small steps (at most 5,000 values a day for each Metric), so a first run over many years of values takes several days. The box says when it last looked. It holds to these rules:

- **It takes no more than you confirmed.** If more old values have arrived since you looked (an import of old history, say), it does nothing and the box says so: look at the numbers again and confirm again. Values that grow old as time passes are not more than you confirmed; that is what "keep for N months" means.
- **It checks before it deletes.** To condense a span it first makes the Condensed Value, then works out every longer period again from the original values and compares the numbers, and the Targets, exactly. Only when they are the same does it delete the originals. If they differ, the span is left as it is, nothing is lost, and the box says which span.
- **It leaves open work alone.** A period an open question, task, a Correction waiting for a decision (also when its task was closed) or an approval holds is not touched, and is condensed or deleted the day after the work is closed.
- **It stops when it keeps failing.** After three failed runs in a row it stops for that Metric and the box says so. Nothing is lost by a failed run. Confirm the Retention again once the cause is fixed: with the same setting shown, the button reads **Confirm again…**, and the Retention waits its 7 days anew.
- **A delete offers a download first.** In the confirmation, **Download these values** gives a CSV of exactly what would be deleted: the values, the earlier values they replaced, the Breakdown rows and the Targets. The download is written in the Audit Log. Locked periods that are deleted take their Lock with them.

Each run that did something is written in the Audit Log as the Retention run of the Metric, with counts and never a value; a span left alone and a Metric held back or stopped are written too. A Projection of a past period older than the keep time is deleted in both modes: it was never a value. Condensed periods take no more values. When days are condensed into months, a week that starts in one month and ends in the next is left as days. A value that arrives later for a period that was deleted is not refused; it is held to what you confirmed, so the box asks you to look at the numbers again before more is taken. If you change from months to quarters, months condensed already are left as they are. The download before a delete holds every Breakdown row of those values, also the ones replaced since.

A Workspace can have a default Retention, copied into each new Metric when it is made (see [Workspace settings](16-workspace-settings.md#retention)); it waits its 7 days too, and can be cancelled here. The Retention cannot be set through the API or an assistant: they can only read it, with the Metric (`retention`, and `retention_pending` with its first day while it waits), and a Condensed Value in the Metric's values says how many periods it stands for (`condensed_from`). The Usage page suggests a Retention for Metrics with many old values nobody opens (see [Workspace settings](16-workspace-settings.md#usage)); following the suggestion fills this box in and shows its counts, and sets nothing. Not available in the demo. A Derived Metric has none: it stores no values.

### Workflow

A **Workflow** is the path the Metric's value takes each period: who is asked, when they are reminded, who steps in, which values need **Approval**, and when the period locks. This box is described in detail in [Workflows and approvals](11-workflows.md#a-metrics-workflow-box). In short:

- The **Workflow** menu chooses one of the Workspace's Workflows, or **None: values publish as they come**. Only the Metric Owner changes it.
- With a Workflow, the box shows the last period that has ended, its **Due Date**, and where its value is, such as "asked, waiting for the value" or "published and locked", with a link to open the Workflow.
- **Lock** or **Unlock** the last period, for the Metric Owner.
- **Stand-ins**: for each Submitter, who is asked instead when they are **Away** or have not answered. Only the Metric Owner chooses.

### Who submits

The **Submitters** of this Metric: who may send values for it. Ziffr recognises them by their Slack name or mail address, or by their personal form link. Each row shows the person and either **Open form link** (when the Web form is one of the Sources) or the link's code. A Stand-in who has been asked to step in is listed too, with a form link of their own.

A Feed is listed with the word "Feed". The owner and Editors see **Remove** next to it, which stops that Feed sending values. The values it already sent stay.

**Values from a Feed** (for the owner and Editors) adds one of the Workspace's Feeds as a Submitter: pick it and choose **Add**. Its values arrive through the API, so the **API and Feeds** Source is turned on by itself. Owners and Admins create Feeds (see [Connecting Ziffr](04-connecting.md#feeds-numbers-from-other-systems)); a Feed is never sent Prompts. The choice only appears when there is a Feed not yet on the list.

People are chosen as Submitters when the Metric is created or duplicated. This box has no way yet to add or remove a person later.

## Sharing a Metric

**Share** belongs to the Metric Owner. For each person, and for each Group ("including whoever joins later"), choose **No access**, **Viewer** or **Editor**.

| Role | What they can do |
| --- | --- |
| **Viewer** | See the Metric, its history and comparisons, use it on their own dashboards and analyses, and assign questions and tasks about it. |
| **Editor** | Everything a Viewer can, and change its description, its Sources, its Target Series and Projections, and which Feeds submit to it. A Guest is never an Editor of a Metric. |

Deleting the Metric, sharing it, choosing its Workflow and Stand-ins, locking periods, accepting **Corrections** and restoring Versions stay with the Metric Owner. Sharing a dashboard also lets everyone on that Share see the Metrics on it (see [The Dashboard screens](12-dashboards.md)).

## Versions

**⋯** → **Versions** lists the Metric's description as it was after each change, newest first: who changed it, when, and what changed, such as "Changed its description" or "Takes values from the Feed …". Changes by one person within ten minutes form one Version.

The Metric Owner can:

- **Restore** an earlier Version. Restoring adds a new Version, so nothing is lost.
- **Name** a Version, or name the current state, such as "Board pack Q3, final", to find it again later.

Versions keep the description only. Values are never changed by restoring; replaced values live on as Superseded Values.

## Duplicating a Metric

**Duplicate** opens the new metric form, filled in from this Metric, titled "Duplicate …". The name gets "(copy)" added. The duplicate is a new Metric of yours with the same description, Sources and people who submit, and, if the original has one, a ticked **Workflow** box to keep the same Workflow. Values, Shares, Target Series and history stay with the original. Feeds are not copied: choose them again on the new Metric. Confirm with **Create duplicate**.

Duplicating is also the way to count a number in a different period, since a Metric's period is fixed once it has values.

## Archiving a Metric

**Archive…** puts aside a Metric you no longer track, without deleting anything. Confirm with **Archive the Metric**. An **Archived Metric**:

- keeps its description, values, history and Versions, and its page stays readable, marked **Archived** with the day it was archived;
- asks for nothing: its Workflow skips it, so no Prompt, reminder or Escalation goes out for it, and **Ask me now** is gone;
- takes no values: a value sent for it by the form link, email, Slack, Telegram, the API or a Feed is refused with "This Metric is archived". A Feed that also submits to other Metrics keeps working for them;
- is listed only under **Archived** on the Metrics list, not in the Pool or in the lists you pick Metrics from;
- keeps being drawn in the widgets and decks that show it, marked **Archived**;
- does not count towards the Workspace's Metrics when it has a limit.

**Bring back** on its page makes it a Metric in use again: it is asked for and takes values from then on. The **Audit Log** keeps who archived it and who brought it back.

## Deleting a Metric

**Delete…** is for the Metric Owner. To confirm, type the Metric's name and choose **Delete the Metric**. Its values, targets, questions, tasks and form links go with it, and this cannot be undone. The **Audit Log** keeps that you deleted it.

Ziffr refuses to delete a Metric while something still uses it, and says what:

- another Metric is calculated from it (change that formula first),
- it is shown in a widget or a deck (take it out first),
- a **View Link** that still works shows it (revoke the link first).

The demo's Metrics cannot be deleted: the demo can't be changed.

## Locks and corrections on a Metric

A **Lock**ed period takes no more values. When someone sends a value for it anyway, it is not recorded. Instead the Metric Owner gets a question, "… is locked. … sent … late: accept it as a correction?", with **Accept** and **Decline**. The sender sees that their value went to the Metric Owner as a proposed Correction.

Anyone answering a question or task about a value can also propose a Correction in its Thread. It takes effect only when the Metric Owner accepts it. The earlier value is then kept and shown struck through, and the corrected value goes through the Metric's Workflow again, so a locked period is checked and approved anew. See [Workflows and approvals](11-workflows.md#locks).

## The personal form link

Every Submitter who is a person or a Contact has a personal form link for each Metric they submit. It arrives with the first request and with every **Prompt**, and it opens without signing in: the link itself says who is sending. Keep it to yourself: anyone with it can submit.

The form shows:

- "Hi …, please report", then the Metric's name and description.
- **For** the period the value will be recorded for: the period running today. If that period already has a value, the form says so and names the Submission Rule, such as "already has 84,000 € (overwrite with the newer value)".
- The value, labelled with the Metric's name. Type it as you would write it.
- **Breakdown (optional)**: paste two columns from a spreadsheet, one row per line, such as country and revenue, or choose **Load a CSV file**. Ziffr says how many rows it read, reading each number the way your Workspace writes them. If you leave the value empty, it becomes the sum of the rows. If you fill in both and they differ, the value you typed counts.
- **Submit**: sends the value. The form then says what happened, for example that the value was recorded, added up, replaced, refused because the period already has one, or sent to the Metric Owner because the period is locked. If the Metric has a Workflow, it also says what the Workflow does next, such as asking for Approval. The form shows only what Ziffr answered to your own submission: reloading the page or opening a link with extra words in its address shows the empty form again.

When Ziffr cannot read the value, the reason appears under the field, such as "Type a number, such as 88 or 1,250." (the example follows your Workspace's number style). What you typed stays in the field and the cursor returns to it, so you can correct it and submit again. The field is emptied only after a value was recorded.

At the bottom, **Open metric** leads to the Metric's page, for those who may sign in and see it.

Where the Workspace has Telegram on, the form also offers **Connect Telegram**: it gives a link that opens Ziffr's Telegram bot, valid for ten minutes. Tap **Start** there, and requests for numbers then reach you in Telegram as well. Once connected, the form says so. To stop, send `/stop` to the bot in Telegram; only then can the form connect another Telegram account. A form cannot disconnect, so a forwarded form link never moves your messages to someone else's Telegram. Only a Contact sees this on the form: members connect Telegram signed in, on the Connectors page.

A Stand-in's form link works only while they stand in. A Feed has no form link; it sends values with its Feed Key. The form only works when the Web form is one of the Metric's Sources.
