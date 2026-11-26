<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/metrics/**, apps/web/src/app/paste-values/**, apps/web/src/app/metric-values/**, apps/web/src/components/metric-export-bar.tsx, apps/web/src/app/submit/**, apps/web/src/components/target-chip.tsx, apps/web/src/components/metric-quick-look.tsx, apps/web/src/components/compare-strip.tsx, apps/web/src/components/compare-table.tsx, apps/web/src/components/status.tsx, apps/web/src/components/tag-chips.tsx, apps/web/src/lib/tag-filter.ts -->
# The Metrics screens

Every number your team tracks is a **Metric**. This chapter walks through every screen about Metrics: the list, describing a new one, a Metric's own page with its tabs, and the small form a Submitter opens to send in a value. Open them with **Metrics** in the sidebar.

Not everyone sees the same Metrics. You see a Metric when you own it, when it is shared with you or with one of your **Groups**, when it is on a dashboard or deck shared with you, or when you send in its values. Being an Owner or Admin of the Workspace does not show you every Metric by itself.

## How colours and arrows work

The same rule holds on every Metric screen, and on dashboards too:

- **Green and red only say whether a value is on target.** A small label next to a value reads "On target" (green) or, when it is off target (red), what is wrong: "Too high" for a Metric where lower is better, "Too low" where higher is better, and "Above target" or "Below target" for a target range with no better side. When a Metric has no target, there is no label. A Widget that shows a Metric by quarter or year judges each quarter against that quarter's target; point at the label to see which target applies (see **Show by** in the Dashboards chapter).
- **Arrows and signs show which way a value changed**, such as ↗ +4.2 %. They are never coloured, because a rise is good for revenue and bad for cost.

The Metrics list repeats this in one line above the table. Under a widget on a dashboard, the same comparisons appear as a short line: the **Attainment** ("92 % of target"), then for example "vs prev. ↗ +4.2 %" and "YoY ↘ −1.0 %", or "n/a" when a comparison cannot be made. Point at an entry to see both values it compares. On a large Widget, and when presenting, this line and the label grow with the Widget (see Presenting in the Dashboards chapter). Every percentage change in Ziffr is written this one way: one decimal, a sign, a space and "%".

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

Under a Metric's name, its **Tags** show as small chips, at most three and then "+2". Above the list, the **Tag** row offers the Tags of the Metrics you may see, each with how many Metrics of this view carry it (Archived Metrics count under **Archived** only). Click a Tag to show only the Metrics that carry it; click a second one to narrow further, so "finance" and "monthly" show the Metrics that carry both. **Clear** shows all again. The picked Tags are in the page address, so a filtered list can be bookmarked or sent to someone, who sees only the Metrics they may see themselves. You are offered a Tag only through a Metric you may see; a Tag that only Metrics out of your sight carry is not in the row.

On a phone (under 640 px wide) each Metric is a small card instead of a table row: its name with the quick-look button, how often and where its values come from, the target, then the latest value with its status and date, and the change as an arrow and a signed percentage. Nothing is cut off at the side, text is at least 14 px, and the whole card is one tap. In the **Metric Catalog** on **New metric**, the category chips are one row that scrolls sideways, so the first entries stay on screen. On **Paste values** the labels sit above their fields and the fields and buttons are 44 px tall. Click a row to open the Metric's page. **New metric** (top right) starts a new one. **Paste values** opens a page that records many values at once from a spreadsheet (see [Paste values from a spreadsheet](#paste-values-from-a-spreadsheet)). With no Metrics yet, the list says "No metrics yet" and offers **New metric**.

Each row also has a **Quick look** button beside the Metric's name (it shows on hover or keyboard focus, and always on a phone). It opens a panel on the right, over the list, with the latest value and its on-target label, the change, a trend line, the **Target** and **Owner**, **How it is calculated** where it is written down (closed until you open it; for a Derived Metric with its formula) and the latest six values, with **Open the Metric** at the bottom. For a Metric you submit, the panel also has **Record a value**, the same form as on the Metric's page (see below). The same button sits beside a Widget's title on a dashboard. **Esc** or **Close** closes it and you are back where you were; while it is open the keys stay inside it, and on a phone it fills the screen, with a long owner name or address wrapping onto a second line. The page address ends in `?panel=metric-` and the Metric's short name, so a link to it opens the panel.

### Download values

Each row has a checkbox (on a phone, in the card's top right corner). Tick the Metrics you want and a bar appears at the foot of the screen with how many are selected, **Download values** and **Clear**. **Download values** gives you one CSV file with every value of those Metrics, one row per value, oldest first for each Metric. The box at the head of the table (on a phone, **Select all** in the bar) ticks every Metric the list shows, after the Tag and Archived filters; under **Archived** you can download Archived Metrics, whose values are kept. One file holds at most 50 Metrics and 250,000 values; over that, Ziffr says so, you download them in parts, and nothing is cut short.

The columns are `metric` (the Metric's slug), `name`, `period`, `period_start`, `value`, `unit`, `source`, `recorded_at`, `period_end`, `condensed_from` and `state`; `period_end` and `condensed_from` are filled only for a [Condensed Value](#retention), which is one row for its span. Numbers are written in your Workspace's **Number Style** without group marks, and where that style writes a decimal comma the columns are separated by semicolons, as a spreadsheet there expects. The file is UTF-8 and starts with a byte-order mark, as every CSV file Ziffr gives you does, so Excel shows umlauts and other letters rightly; a program of your own that reads it should skip that mark. `state` says **final** or **not approved yet**: a value that waits for **Approval**, or was sent back to its Submitter, is in the file and reads **not approved yet**, as does every other value of that period. Filter on **final** to work with final values only. A Metric without a **Workflow** has final values. Where a Metric keeps both values of a period, both are rows; of a corrected value only the corrected number is in the file. A Derived Metric has no values of its own and adds no rows, and the bar says so when one is ticked.

Anyone who signs in can download the values of the Metrics they may see, a Guest those shared with them; a Metric you may not see is never in the file. The History tab of a single Metric has **Download values** beside **Paste history** for that Metric alone. Each download is written in the [Audit Log](16-workspace-settings.md) as a count of Metrics and values, never their names or numbers. The demo does not offer it, and programs read values through the API instead.

## Paste values from a spreadsheet

**Paste values** in the Metrics list, or **Paste history** on a Metric's History tab, opens a page for values you already keep in a spreadsheet. Copy the cells in Excel, Google Sheets, LibreOffice or Numbers and press Ctrl+V (⌘V on a Mac) anywhere on the page, or paste them into the text box. Ziffr reads only the cells' text: no add-on and no connection to Microsoft or Google is needed.

Nothing is recorded until you confirm. Ziffr first shows what each value would do.

### From a file

Instead of pasting, drop a file on the box or choose **Or choose a file**: a CSV file (.csv, .tsv or .txt), an Excel workbook (.xlsx, .xls) or an OpenDocument one (.ods). The file is read in your browser, and only its cells are sent, exactly as if you had pasted them, so the preview and the limits are the same. A workbook's first sheet is read, cells as they are shown (a cell formatted as 2.5 % reads as 2.5 %); with several sheets, pick another under **sheet**. A CSV file may hold at most 256 KB and a workbook at most 10 MB.

### A template to fill in

Under the box, **Download a template** saves a CSV file that already names your Metrics, so you only type the numbers. Pick one of three:

- **One value per row**: the columns `metric`, `period` and `value`, one row for each Metric you may paste for, with its own current period filled in.
- **Metrics down, periods across**: your Metrics of one period length (the most common one, or pick another next to it) and the last 12 periods as columns, oldest first.
- **One Metric's periods without a value**: two columns, `period` and `value`, listing the periods in the last two years that have no value yet. Choose the Metric next to it.

Metrics are named by their slug, so two Metrics with one name cannot be mixed up, and periods are written as days (`2026-10-01`) so Excel does not turn them into numbers. Where your Workspace writes numbers with a decimal comma, the columns are separated by semicolons, as a spreadsheet there expects. Open the file, fill in the `value` cells, and drop it back on the page or paste its cells: Ziffr reads it like any other paste and shows what each value would do. Downloading it records nothing.

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

In the demo, the personal form link of a Metric the demo came with opens only in a demo visit; a Metric you made there has none to open for anyone else.

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

On a phone the page says at the top that it is easier on a larger screen; see [Screens made for a larger screen](07-getting-started.md#screens-made-for-a-larger-screen).

**New metric** opens a page with two ways to begin. You can change everything afterwards.

- **Start from scratch**: an empty form, for a number nobody has described before.
- **Metric Catalog**: a library of ready-made descriptions. Picking one copies its description into a new Metric of your own. It is yours from then on and does not follow later changes to the catalog. Besides the entries every Workspace has, it holds those of the Packs your Workspace installed, under each entry's category or the Pack's name (see [Packs](19-packs.md)). A Pack's entry may carry Tags, shown as small chips on its card; the Metric you make from it gets them, and if a Tag limit kept some off, the Metric's page says which right after you create it.

When you arrive from **Explore on my own** in the [Setup Guide](07-getting-started.md#the-setup-guide), the page shows **Back to the Setup Guide** on top, and the Metric you create there becomes the guide's first Metric and takes you back to the guide.

Owners, Admins and Members create Metrics. Guests create nothing: they see no **New metric**, **Paste values** or Metric Catalog, and the Metrics list says "Nothing has been shared with you yet" when nothing is. When the Workspace has a **Workspace Limit** and holds as many Metrics as it allows (see [Installation settings](18-installation-settings.md)), the form says so at the top, such as "This Workspace holds 50 Metrics, as many as its Size Small allows. Archive a Metric, or ask an Owner to change the Size.", and creating waits until a Metric is archived or the limit is raised. Values keep arriving for every Metric meanwhile. From 90 % of the limit on, the page shows how many Metrics the Workspace holds of how many, such as "This Workspace holds 48 of 50 Metrics." Guests see neither.

### Finding a Metric in the catalog

| Option | What it does |
| --- | --- |
| **Search** | Finds catalog Metrics by words in their name, description or unit, such as "churn", "margin" or "tickets". |
| **For** your industry | Shows only the Metrics written for your kind of business. It appears once your Workspace has a **Workspace Profile** with an industry (see [Workspace settings](16-workspace-settings.md)). |
| **All** | Shows the whole catalog. |
| A category, such as Finance | Shows only that category. Click it again to show all. |

When you open the catalog from the Setup Guide (**Explore on my own**) and your Workspace has an industry, the Metrics written for your business come first under "For" and your industry, and every other Metric follows under **All other Metrics**; nothing is hidden. A line above the list says: pick single Metrics here, while a Pack gives you a set of Metrics, a sample dashboard and a Workflow that asks for them in one go.

Each card shows the Metric's name, what it counts, its period, which way is good and its target. Click a card to open the form, already filled in. If nothing matches, try another word or start from scratch.

### The form

The form is short: three parts, and **More options** below them for what you rarely change. The panel on the right says that you become the **Owner**: "The owner keeps the description up to date and accepts corrections to its values." **Create metric** saves it; **Cancel** goes back to the list.

**What is it?**

| Field | What it does |
| --- | --- |
| **Name** | What everyone will call it, such as "Customer satisfaction". Required. |
| **Description** | What the number is and why it matters. Would a new colleague understand it? |
| **How it is calculated** | The **Calculation Note**: exactly what counts and what does not, where the figure comes from and which adjustments are made. For annual recurring revenue, say what happens to one-off fees, discounts and contracts that have not started. Optional, up to 2,000 characters; line breaks are kept. |
| **Format** | **Number**, **Money** or **Percent**. Choosing **Money** fills in the unit of the Workspace Profile's currency: "€" after the number for euros, "$" before it for dollars, otherwise the currency's code before it, such as "CHF ". You can change it. A Percent Metric's values are numbers such as 12.5, not 0.125. |
| **Unit** | What stands next to the number, such as "€", "$", "d", "pc" or "%". Any text up to 20 characters; leave it empty for plain numbers. |

**How do values arrive?**

| Field | What it does |
| --- | --- |
| **Period** | **Daily**, **Weekly**, **Monthly**, **Quarterly** or **Yearly**: one value per period. Quarters and years start from the Workspace's fiscal year (**Workspace → General**), so with a year that starts in April, Q1 is April to June. The period cannot change once the Metric has values, or targets or projections on its Targets tab. |
| **Who submits** | The people who send in its values, members and Contacts alike. Each one gets a personal form link for this Metric and a first request for the value. You are ticked to start with when you create a Metric; a copy starts with the original's Submitters. |

**Target**

| Field | What it does |
| --- | --- |
| **Which way is good** | The **Polarity**: **Higher is better**, **Lower is better** or **Closer to target is better**. |
| **Target from** | The lower end of the Target Range. Leave it empty for no lower end. |
| **Target to** | The upper end. Leave it empty for no upper end. |

**More options**

A folded section below Target. Opening it shows the fields below; leave it closed and Ziffr uses the defaults named in the table, which is what the form always used. While it is closed, its heading names every value that is not the default, such as "2 decimals · Aggregation: Average". It opens by itself when a Metric you duplicate, or one from the Catalog, has values that are not the defaults, and when a value in it is not valid.

| Field | What it does |
| --- | --- |
| **Stands** | Whether the unit stands **after** the number ("1.200 €", "12 d", with a space) or **before** it ("$1,200", without one; a unit such as "CHF " keeps the space it ends with). |
| **Decimals** | How many digits after the decimal point, from 0 to 4. A line under Format and Unit shows how a value will read, in the Workspace's Number Style. |
| **A second value for the same period** | The **Submission Rule**: what happens when another value arrives for a period that already has one. See the table below. |
| **Aggregation** | How values combine into a longer period, for comparisons such as QoQ or YoY and for Widgets shown by quarter or year (**Show by**, see the Dashboards chapter): **Sum** (counts and amounts, such as revenue or deals), **Average** (levels, such as a score or a delivery time), **Last value** (stocks, such as a balance or headcount) or **Does not combine** (rates and ratios). |
| **Sources** | The ways values may arrive: **Slack**, **Mail**, **Telegram**, **Web form** and **API and Feeds**. All are ticked for a new Metric, so each Submitter can use what suits them. A value that arrives another way is refused. In the demo, Slack and Mail are marked "(played in the demo)": nothing is really sent. |
| **Attainment** | How the percentage of target is computed: **As the workspace** (the default, set on **Workspace → General**), **By ratio** or **By distance**. See [Comparisons](#comparisons). |

Defaults: the unit stands where its sign suggests (before a "$", after a "%" or "d"), **Decimals** 0, **A second value** overwrites, **Aggregation** is Sum, all **Sources** are ticked, and **Attainment** follows the Workspace.

The four Submission Rules:

| Rule | What happens to a second value | Good for |
| --- | --- | --- |
| **Reject a second value** | It is refused; the first value is final. | Numbers that must not change once given. |
| **Overwrite with the newer value** | It replaces the first. The first is kept as a **Superseded Value**. | Figures reported again in full, where the latest report wins. |
| **Add up all values** | It is added to the first. Values that arrive at the same moment all count. | Counts reported in pieces: "3 deals", then "2 more". |
| **Keep every value** | Both are kept. | Repeated measurements, such as weight twice a day. |

After **Create metric**, the Metric's page opens with the note "Metric created. It has no values yet." Under it, one sentence says what really happened: who got a form link and a first request and by which way ("Ana got a form link and a first request by email."); that nobody submits it yet, with where to add Submitters; or, when this Ziffr sends no email, that nothing was sent and the request waits in the Outbox. Only the Metric's owner, who made it, sees who was asked. In the demo, where nothing is really sent, the note ends with **Go to Sources**, which opens the **Sources** tab of **Connectors** so you can answer the request there.

## A Metric's page

The top of the page shows the Metric's name, a **Derived** badge if it is calculated from other Metrics (**Total** if it [adds up a list of them](#adding-up-metrics-a-total)), and its description. Under it, **How it is calculated** opens the Metric's **Calculation Note** and, for a Derived Metric, its formula written with the names of the Metrics it uses; it is not shown when there is neither. If the formula uses a Metric that is not shared with you, the page says so instead of writing the formula. Below that are three boxes:

- **Latest**: the most recent value with its period and on-target label.
- **Change vs. previous period**: an arrow and a percentage.
- **Target**: which way is good, and the target that counts for the latest period. If that period has its own value in the **Target Series**, the box shows it and says so; other periods use the Target Range.

Then come five tabs: **Overview**, **Analysis**, **Targets**, **History** and **Description**. On a phone the three boxes sit two to a row, and the tabs do not all fit: swipe them sideways, a fade at the edge shows where more are, and the open tab is brought into view.

### Handing a Metric over

Next to **Owner** in a Metric's Description, the Metric's owner, Owners and Admins see **Hand over…**. Pick the Member who takes it over, then **Hand over**. The Metric's owner can pick only people who already see the Metric (share it first otherwise); Owners and Admins can hand any Metric to any Member. Guests, Contacts and Access Keys never take a Metric over or hand one over: a program cannot change who owns a Metric.

Handing over a [Total](#adding-up-metrics-a-total) closes it: its new owner decides anew whether to open it. The new owner is told through their way of being reached, and not during their Quiet Hours. The previous owner stays on as **Editor**, so they still see the Metric and can fill in values until the new owner takes that away. Corrections, unlocking, Retention notices and Escalations now go to the new owner, and so do the open Questions that waited on the old owner as the Metric's owner. When an Owner or Admin hands a Metric over, the previous owner is told too. If the previous owner's Share is later taken away, their Derived Metrics, Alerts and Personal Webhooks on the Metric stop. The Metric stays on its Workflow, which stays with the Workflow's owner: the new owner can choose another Workflow, or ask that owner to hand theirs over. A Member who owns Metrics can't be made a Guest, and a Guest can't be given one. The Audit Log records who handed which Metric from whom to whom.

If a Metric is not shared with you, its page says "… isn't shared with you", names its owner (for a Guest who is not shown the owner: "Its owner can share it with you"), and offers **Ask … for access**. The owner sees your request under **Who can see this** and can let you in as a Viewer.

### The buttons at the top

A Metric's page has one main button, and the rest sit in the **⋯** menu.

| Button | What it does | Who sees it |
| --- | --- | --- |
| **Record a value** | Opens a form (a slide-over) to type this Metric's value for the current period, or for one of the eleven before it, optionally with a **Breakdown** (**Add a breakdown**). It goes the way a value sent by your form link does: the Metric's **Submission Rule**, **Locks**, **Workflow** (checks and **Approvals**) and **Retention** apply, and the answer is written in plain words, such as "Replaced 100 with 120" or that the period is locked and the value went to the Metric Owner as a proposed correction. The period shows what it already holds. | Whoever submits the Metric (holds a form link for it, or stands in for someone who does) while it takes values on the web form; not for a Derived Metric or an Archived one. Nobody else sees it, Owners and Admins included. In the demo it says so and records nothing |
| **Share** | Gives people or Groups access (see below). | The Metric Owner |
| **⋯** → **Ask me now** | Sends you this period's **Prompt** for the Metric at once, by your own Connector (email, Slack or Telegram), instead of waiting for the Workflow. A message says where it went ("Sent to you on Slack", with a note when that is not your usual way because the Metric does not accept values that way), why it stayed in the Outbox, or why it could not ask now, such as when it already asked in the last ten minutes. At most once every ten minutes per Metric. | The Metric's owner, when they submit it too |
| **⋯** → **Alert me…** | Opens a panel on the right (on a phone, from the bottom) with your Alerts on this Metric and a form to set another: Ziffr tells you once when the latest value **reaches a share of its target**, **reaches a value** (at or above), **falls below a value**, **changes more than a share** against the period before, or **has no value the day after its Due Date**. Choose a way to be told (your usual way, email, Slack or Telegram) and whether to **Include values not approved yet**; off, you hear only about published or approved values. A kind the Metric cannot give is greyed out with the reason: a share needs a target with a percentage, the Due Date needs a Workflow. The dialog says how many Alerts you hold against the limits (20 in a Workspace, 5 on one Metric) before you hit them. Each Alert can be paused, edited or deleted there. With the preview layout on, it opens as a panel on the right instead of a dialog, with the same content. Not shown in the demo, and not for an Archived Metric. | Everyone with a sign-in who sees the Metric If you have a Personal Webhook, the form also offers **Also send to** with your Webhooks, so a ticked one gets an `alert.fired` message each time the Alert fires (see [Your Alerts](17-your-settings.md#your-alerts)). |
| **⋯** → **Fill past periods…** | Opens one list of the ways to bring a Metric's past values in, easiest first: **Paste or upload a spreadsheet** (opens Paste history for this Metric), **Fill in a template** (downloads a file that lists the periods without a value, to fill in and bring back to Paste history), **Ask my assistant** (the text described next) and **Send from another system** (opens Connectors → Send values). Paste and template are offered when the Metric takes the web form and you submit it; the assistant and the other system when you submit it at all. | Everyone who submits the Metric |
| **Ask my assistant** (in the list above) | Opens a text to copy into your own assistant (one connected to Ziffr that can read where your numbers are) that fills in the Metric's last 12 periods once, from the place you name. It tells the assistant to look at which periods already have a value and never record over one, to show you a table of what it found before it records anything, to record each value through Ziffr's tools, and to stop and ask when a number looks off. It is not a schedule: use [Fill from n8n](#who-submits) for numbers that keep coming. Ziffr does not run the text, sends it nowhere and gives the assistant no key; what it records is recorded as you, by the Metric's own rules (an unusual value may wait for Approval). The Metric's name, description and **Calculation Note** are in the text as quoted data, which the text tells the assistant never to obey. | Everyone who submits the Metric |
| **⋯** → **Analyze** | Opens the Metric on an **Analysis Canvas** (see [Analyze](13-analyze.md)). | Everyone who sees the Metric |
| **⋯** → **Duplicate** | Starts a new Metric with the same description (see below). | Owners, Admins and Members; not for a Derived Metric |
| **⋯** → **Add to dashboard** | Places the Metric on one of your dashboards as a widget drawn with the default **Widget Template**. Lists the dashboards you own or may edit, and, below them, **New dashboard with this Metric**: it makes a dashboard named for the Metric, puts the Metric on it and opens it (rename it there). | Everyone who may make dashboards (not Guests); a Guest sees the list only, and nothing when they have no such dashboard |
| **⋯** → **Archive…** | Puts the Metric aside, keeping its values and history (see below). | Owners, Admins and the Metric Owner, outside the demo; in a demo that visitors may change, for a Metric a visitor made |
| **⋯** → **Bring back** | On an Archived Metric: makes it a Metric in use again (see below). | Owners, Admins and the Metric Owner, outside the demo; in a demo that visitors may change, for a Metric a visitor made |
| **⋯** → **Delete…** | Deletes the Metric (see below). | The Metric Owner, outside the demo |
| **⋯** → **Who can see this** | Opens a panel on the right that lists everyone with access and why: owner, a Share, a Group, a shared dashboard, or sending in values. For a Guest, people outside what is shared with them show as "Someone". | Everyone who sees the Metric |
| **⋯** → **Versions** | Shows earlier states of the description and of how it is calculated (see below). | Everyone who sees the Metric |

On a phone, **⋯** stays beside the Metric's name when it is the only button. The **Fill past periods** dialogs fit the screen: the title and **Close** stay where they are, the rest scrolls inside the dialog, and each button sits under its text.

## The Overview tab

### The chart

The chart draws the Metric's values over time. A daily Metric shows its last 90 days. The shaded band is the Target Range, a dashed line is Ziffr's forecast, and a ringed point marks a period that has a question or task.

**Click a point to ask someone about it.** A small box opens, "New Action about" that period, with the value:

| Option | What it does |
| --- | --- |
| **Assign to** | The colleague who should answer. Contacts are not listed. The first other person is suggested. |
| The question | Filled in for you, such as "Why is cost so high in March?" when the value is off target. Change it as you like. |
| **Assign Action** | Sends the **Question** and opens its page, where the **Thread** continues. |

See [Actions](15-actions.md) for what happens next; the Questions and Tasks you asked also show on your Schedule under **Asked by me**, where finished ones are grey with a tick, never red. On a Metric's page and its period page, an Approval in the list of Actions reads as a plain question ("Approve Revenue for Oct 2026: 118,941 €, below target."), without the chat words "Reply approve"; opening it shows the buttons. With no values yet, the chart is replaced by a note saying how values arrive, with a link to see who submits.

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

A row can be a **part** of another row of the same Breakdown, such as a city of a country: paste a third column headed **Parent** with the name of the row it belongs to (see **Breakdown (optional)** below), or send `parent` with the row through the API. A Breakdown may go down 4 levels and hold 200 rows, every name is used once, and a row cannot be a part of itself or of its own parts; Ziffr refuses a list that breaks one of these and says which row is the problem. This box shows the rows at the top, which are the ones that add up to the value; a View Design's **tree** mark (see **Dashboards**) draws every level.

## The Analysis tab

The tab is what Ziffr already knows about this one Metric, in three parts from top to bottom.

**Ready for the Metric** has a card for each analysis of the Metric alone that its history allows, worked out when you open the tab, each with its Takeaway. A card appears only when its analysis can answer: with too few values, or nothing to reach, there is no card and nothing is said about it. At most four analyses run for the page.

- **Where is the Metric heading?** comes first and is the largest card: the history with the forecast dashed after it and its likely range as a band, the Takeaway (the sentence, which Method worked it out, how it did on the periods already known, the footer "This carries the past forward; it is not a promise."), and **Save as widget** to keep it in your widgets and place it on a dashboard. It needs at least 4 values, so a yearly Metric has one after four years; until then the Overview chart says so. With two full seasons of values (24 months, 8 quarters) the forecast also follows the yearly pattern when that would have missed less on the last third of the history; the card says which it used. The forecast is also drawn dashed on the Overview chart. Values that need more than 40 decimal places, or spread more than 30 orders of magnitude, cannot be worked out exactly in reasonable time: there is then no forecast and the Overview chart says "No forecast: the values are too fine or too wide to work out exactly."
- **What is usual for the Metric?**: the range it has usually been in.
- **Will the Metric reach its Target?**: only when it has a Target Range; how likely it is to end in it, with **Save as widget** (the forecast with its Target).
- **Did the Metric change, and when?**: only when one day stands out.

**What moves with the Metric** lists the five other Metrics you can see that move most like it, each with a strength word (strong, moderate, weak, or can't tell from chance) and what it was compared on, by change or by the values as they are. Choose one to see its Takeaway and a chart with one dot per period. If a few points are far from the rest and stretch the chart, a line under it says so ("Two months are far from the rest and stretch this chart."); the points stay on it. The Takeaway has a sentence first, then what it is based on, then a plain line when the data makes the reading rough, and the footer that this shows what has gone together, not what caused what. Metrics counted at another period are compared at the longer of the two where that can be done; a note names the ones that could not be.

**Ask about the Metric** opens Analyze with this Metric on the canvas as the one to explain and the methods panel open, so you can ask for more: what moves it, what it would take to reach a value, what if it changed. A Metric you cannot see is ignored: Analyze then opens as it would without it.

For more, use **Analyze** at the top (see [Analyze](13-analyze.md)).

## The Targets tab

The Target Range applies to every period. On this tab you give single periods a target of their own, such as a monthly budget: the Metric's **Target Series**. You also enter **Projections**, values expected for future periods. Projections are always shown as projections and never count as real values.

The Metric Owner and the Metric's **Editors** change this tab. Everyone else sees a plain table of periods, targets and projections. A Derived Metric has no Target Series of its own. A formula can read the targets set here: see [Reading a target](#reading-a-target).

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
| **Submitted by** | The person, Contact or Feed who sent it. A value that someone else entered for them (see [Filling in a value for someone](#filling-in-a-value-for-someone)) says "entered by" and the name of who typed it; a Guest is not told that someone entered it. A value that came in with a [Workspace Export](16-workspace-settings.md#from-a-workspace-export) shows the name the file gave, with "(imported)" after it, and the name of who entered it, if the file had one; Guests do not see these names. |

A Derived Metric has no values of its own, so it has no such list. If you submit values for the Metric on the web form, **Paste history** beside the heading opens [Paste values](#paste-values-from-a-spreadsheet) for this Metric.

**Questions and tasks** lists every **Action** on this Metric that you may read, with its status (**Open**, **Answered**, **Done** for a finished task, or **Closed**), its period and its **Assignee**. Click one to open its Thread. With none yet, the tab reminds you to click a point on the chart.

### A period's page

Click a period on the History tab, or **Open this period** after clicking a point on the chart, to open one Metric's page for one period, such as `/metrics/churn-rate/2026-03-01` (a month may also be written `2026-03`). The Metric's name on it leads to the Metric, and on a phone it is large enough to tap with a thumb. The page shows:

- the Metric, the period and its state (for example **Locked** or **Waiting for Approval**), with the value in large figures; after a Correction, the value it was submitted as is struck through;
- **History**: every step of that period's value in order, with the person, the channel and the date: submitted, entered by someone for the person ("Entered 42 by Ben for Sara"), replaced by a newer value, a Correction proposed, accepted or declined, approved, sent back, published, locked, and unlocked with its reason. A replaced value is struck through, and a value entered for someone that they replaced stays in the list with who entered it;
- **Fill in for …** under the value, for those who may (see [Filling in a value for someone](#filling-in-a-value-for-someone));
- **Threads**: the Questions and tasks about the period that you may read, each with its first message and how many replies follow. Click one to open and answer it.

You see the page only for a Metric you see. A Thread you may not read, and the Corrections proposed in it, are left out, as if there were none.

## The Description tab

The Description tab has four boxes: the Metric Description, the Retention, the Workflow, and who submits. A Derived Metric shows only its description.

### Description

The box lists the **Metric Description**: owner, Tags, **How it is calculated** (the formula of a Derived Metric, written with the names of the Metrics it uses, and the **Calculation Note**; if the formula reads a Metric that is not shared with you, a line says so instead of naming it; "Not written down yet." when there is neither), period, format and decimals, which way is good and target. For other than Derived Metrics it also shows how values arrive and what happens to a second value.

**Values arrive by** can be changed right here by the owner and Editors: tick or untick **Web form**, **Mail**, **Slack**, **Telegram** and **API and Feeds**, then **Save**. At least one must stay ticked. From then on, values arriving another way are refused. The note under it says it is about the ways an answer is accepted: a request for a value goes only by one of them, and which of them a person gets is their own choice under **Who gets what, where**.

**Tags** are free words such as `finance` or `weekly review` that group Metrics. The Metric Owner and Editors add them in the **Tags** row of this box: type a word and press **Enter** or **Add** (several words may be separated by commas); the Tags of the Workspace that you can see are offered as you type, and a new word is accepted as it is. Click the **×** on a chip to take a Tag off. A Metric has at most 10 Tags and a Workspace at most 200, and the page says what to do when a limit is reached. A Guest who is an Editor uses only Tags they can already see. People who may not change the Metric see its Tags as chips. A Tag is shown to you only through a Metric you may see and never shares anything or changes who sees a Metric. Adding or removing a Tag is a change in the Metric's **Versions**. Owners and Admins rename, merge and delete Tags under **Workspace → Tags** (see [Workspace settings](16-workspace-settings.md#tags)).

**Edit details…** opens the description as a form, for the Metric Owner and Editors:

When you name a new Metric, or rename one, and a Metric you can see already has that name, a note appears once you leave the field: "There is already a Metric called … owned by …: open it, or use another name." It is a warning only: you can keep the name.

| Field | Notes |
| --- | --- |
| **Name**, **Description**, **How it is calculated** | As on the new metric form. Links to the Metric keep working when its name changes. A change of how it is calculated is named in the Metric's **Versions**, so everyone can see when it changed. |
| **Format**, **Unit**, **Stands**, **Decimals** | As on the new metric form; decimals here go up to 6. |
| **Period** | Fixed once the Metric has values: "duplicate the Metric for another period". |
| **Which way is good** | The Polarity. |
| **Aggregation** | Sum, Average, Last value or Does not combine. |
| **Target from**, **Target up to** | The Target Range, for every period without its own target. The lower end may not be above the upper one. A value Ziffr cannot read as a number is not saved, and Ziffr says so. |
| **Attainment** | **As the workspace**, **By ratio** or **By distance**. Snapshots taken earlier keep the method they were taken with. |
| **A second value for a period** | The Submission Rule. Not shown for a Derived Metric. |

**Save** keeps the change as a new **Version**.

A Derived Metric's formula is shown here, but not edited: to change it, make a new Derived Metric (see below).

### Calculated from other Metrics

A **Derived Metric** is a number worked out from other Metrics, such as a margin, or the kilometres driven per day from a weekly odometer reading. Nobody is asked for it: it has a value in each period in which the Metrics it is made of have one.

To make one, choose **New metric**, then **Calculated from other Metrics**:

1. Give it a **Name**, and if you like a **Description**.
2. Build the **Formula**: click a Metric in the list to put it into the formula (it is written as its slug in curly brackets, such as `{revenue}`), and type `+ - * /`, brackets and numbers between them. The buttons **change( )**, **prev( )** and **target( )** are explained below. For example `({revenue} - {cost}) / {revenue} * 100`.
   Below the formula, **In words (optional)** takes what the formula cannot say, such as what its inputs leave out: the Metric's **Calculation Note**.
3. Under **How is it shown?**, set a **Unit**, **Decimals**, **Period** or **Which way is good**, or leave them empty: Ziffr takes the period of the Metrics it is calculated from, their unit where a sum or difference keeps it, and two decimals where the formula divides. The page of the new Metric says nothing of this; the Description box shows what was chosen, and **Edit details...** changes it.
4. **Create metric**.

You can only pick Metrics you own or edit. Someone who is only shown a Metric cannot calculate from it, because a calculated Metric shows its inputs' values to whoever it is shared with: ask its owner to make you an Editor, or to make the Metric. If you later lose the right to edit one of its Metrics, the calculated Metric shows no values ("Its owner can no longer share one of the Metrics it is calculated from") until you may again. An Editor who changes its formula may use only Metrics its owner may share as well. A formula that names a Metric you may not use is refused, as if it did not exist when you cannot see it at all. Ziffr refuses a formula with Metrics counted by different periods, with a Derived Metric among them, or with an input set to Aggregation none (except in the two functions below), and says why; nothing is made then.

**Compared with the period before.** Two functions reach back one period:

| Write | It means | Example |
|---|---|---|
| `change({odometer})` | this period's value minus the previous period's | `change({odometer}) / 7`: kilometres per day from a weekly odometer reading |
| `prev({odometer})` | the previous period's value | `{sales} - prev({sales})` is the same as `change({sales})` |

Press **change( )** or **prev( )** in the form, then pick the Metric to put it inside. The previous period is the one right before, counted by the Metric's own period. If the previous period has no value, there is no value for this one either: Ziffr never works out a change across a gap. The first period has no change yet. A Derived Metric that uses `change` or `prev` is shown by its own period only: by month, quarter or year it says "Shown by its own period" and why, because "the previous quarter" of a monthly Metric would be a different number than the one you asked for. It also has no Comparison to date (MoM, QoQ) but the previous period and the year before work.

#### Reading a target

`target({commit})` is the target of another Metric for the period, so a number you have set once need not be sent in again. For example `target({commit}) - {commit}` is what is still missing, and `{commit} / target({commit}) * 100` the share reached. Press **target( )** in the form, then pick the Metric.

| The Metric has, for the period | `target( )` gives |
|---|---|
| a value in its **Target Series** | that value |
| no value there, and a Target Range with one bound ("at least 500" or "at most 40") | that number |
| no value there, and a range whose two ends are the same number | that number |
| no value there, and a range with two different ends | nothing: Ziffr picks neither end and no middle |
| neither | nothing |

Where `target( )` gives nothing, the period stays empty, never 0. A Metric page and its Widgets say so when no period at all can be worked out. The Metric needs a **value** in the period too, as every Metric in a formula does: a week without a Commit has no gap, even though its target is known.

**Keep a target that changes in the Target Series.** A Derived Metric is worked out afresh each time it is shown, so changing a Target Range changes the results of **past** periods as well: a new quarter's quota typed into the range rewrites last quarter's gap. Give each period its own value on [the Targets tab](#the-targets-tab) (paste a column for the whole quarter), and every period keeps the target that was true for it. A Lock holds values, not targets. A Snapshot keeps what it showed.

**By month, quarter or year** the target is the one the chart shows for that span: the Target Series combined by the Metric's Aggregation when every period counted has a value. If only some of them have one, there is nothing for that span. If none has, the Target Range's number counts for an average or a last value, and not for a sum, since "at least 100 a month" is not a number for a quarter. A span that holds [values condensed](#retention) by a Retention has none.

The same rights apply as for values: you can read only the target of a Metric you own or edit, and a Derived Metric shows what it works out to whoever it is shared with. The Metric you read a target of cannot be deleted while the formula names it. **What if** does not follow a formula that reads a target.

A formula is read whole or not at all. It may hold `+ - * /`, brackets, numbers such as `12` or `0.5`, other Metrics, and `change( )`, `prev( )` and `target( )` of one Metric. Ziffr refuses a formula with anything else, such as `^`, `%`, `1e3`, `.5` or two values without a sign between them, rather than compute a number from the part it could read. It also refuses inputs counted by different periods, or by another period than the Derived Metric, and inputs set to Aggregation none. If a Derived Metric's inputs are changed later so that they no longer fit, its page and its Widgets say why ("Its inputs are counted by different periods") instead of showing an empty chart.

### Adding up Metrics (a Total)

A **Total** is a sum over a list of Metrics it keeps, such as the Commit of every salesperson. Unlike a formula it does not name its Metrics in writing: you add and end them on its page, and past totals stay as they were.

To make one, choose **New metric**, then **Calculated from other Metrics**, then **Add up Metrics**:

1. Give it a **Name**.
2. Tick the Metrics under **Which Metrics does it add up?** You can add up 1 to 50 Metrics that you own or edit, that take values and that share a period, unit, number format and **Aggregation**. A Metric with Aggregation **Does not combine** (a rate) cannot be added up. Once you tick one, those that do not go with it are greyed out. The Total takes all four from them.
3. **Count them from**: the first period they count in. Left at **First period with a value**, that is the first period one of them has a value.
4. **Target**: either **Its own target**, such as the team's quota, or **The targets of its Metrics, added up**. Added up, a period has a target only when every Metric counted in it has one target number for it (see [Reading a target](#reading-a-target)).
5. **Create metric**.

A period has a sum only when **every Metric counted in it has a value**. Ziffr never shows a smaller sum in its place and never counts a missing value as 0: someone with nothing sends 0. A sum in which a value still waits for Approval, or was sent back, is marked **Not approved** until each is final. A formula may read a Total, `target( )` of it included. Over a month, quarter or year a Total combines its own periods by its Aggregation, like any Metric.

#### Who sees its numbers

A part of a total is often one person's number, so a Total's numbers are held more tightly than a calculated Metric's:

- A period is shown only to a person who may see **every Metric counted in it**. Anyone else you share the Total with sees its name, description and own target, and for the period "Not shown: you do not see every Metric it adds up." A formula that reads it shows them nothing for that period either.
- Its owner must own or edit every Metric it adds up. If they no longer do, it shows no values to anyone.
- Which Metrics it adds up is listed to each person only as far as they may see them.

Its owner can open it: **Also show this total to people who do not see every Metric…** on its page first lists what it adds up, who will newly see its numbers, whether one of them can then work out a single Metric's numbers, and the View Links, Snapshots and formulas that show it. After **Show it to them**, everyone who sees the Total sees its sums, past periods included, though never a name or value of a Metric they do not see. If one of those lists changed in the meantime, Ziffr shows them again. **Stop showing it to them** closes it at once; files already made cannot be taken back. Only the owner opens a Total, in the app: not an Editor, not an Admin, no program or assistant, and not in the demo. Handing it over closes it. The Audit Log records both.

The same rule holds everywhere, judged at the time of reading:

- A **Snapshot** keeps with each period which Metrics it counted. Whoever opens it gets a period if they may see every one of those now, or the Total is open now. So closing a Total also hides it in older Snapshots.
- A **View Link** shows a Total's numbers only while it is open, or where the link itself shows every Metric counted. Frozen links too. Before you make a link, the panel says which numbers would stay empty.
- An **Alert** about a Total works with the numbers you may see, and waits until every value counted is approved, also if it asks for values not approved yet. A **Heads-up** about one Metric does the same; Heads-ups that compare two Metrics leave Totals out.
- The **API** and the **MCP Server** give a program the periods its key's creator may see, and say that a Total is open and whether periods are left out. No program makes, changes, opens or closes one.

#### Changing what it adds up

Under **What it adds up** on the Total's page, its owner and Editors:

- see how the latest periods stand: the sum, or how many of its values are in ("4 of 5 in", for someone who sees every one counted);
- **add** a Metric, counted from a period they pick (they need to own or edit it, and so must the Total's owner);
- **end** one with **Up to …**: it counts up to that period and no longer after; **Counts from now on** takes the end away;
- **remove** one altogether, which changes past totals too;
- choose its **Target**.

While a Total is open, only its owner changes the list, and confirms that those who see it learn the change, and through it a single Metric's numbers.

A Metric that a Total adds up cannot be deleted, and its period, unit, number format and Aggregation stay until it is removed from the Total. A Total takes no values and has no Breakdown, Sources, Workflow or Retention of its own. A [Workspace Export](16-workspace-settings.md) carries a Total where it holds every Metric the Total adds up; imported, it is closed. A Pack does not carry Totals yet, and **Download values** leaves them out as it leaves out calculated numbers.

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
- **Stand-ins**: for each Submitter, who is asked instead when they are **Away** or have not answered. Only the Metric Owner chooses. A Guest cannot be chosen as a Stand-in; one chosen before keeps being asked, and the list says "A Guest cannot fill in for Sara: choose another Stand-in."
- **Fill in for …**, for the Metric Owner and the Workflow's owner (see [Filling in a value for someone](#filling-in-a-value-for-someone)).

### Who submits

The **Submitters** of this Metric: who may send values for it. Ziffr recognises them by their Slack name or mail address, or by their personal form link. Each row shows the person and either **Open form link** (when the Web form is one of the Sources) or the link's code. A Stand-in who has been asked to step in is listed too, with a form link of their own.

Under each person a line says where their next **Prompt** will go and why, for example "Next request: by Slack", or "Can't reach: link Slack" when none of the ways this Metric accepts reaches them. The owner and Editors see it for everyone; anyone else who submits sees their own line. On your own line the fix is a link: **Link Slack** or **Connect Telegram** on **Connectors**, or **Add an email address** in your profile. A request goes only by a way the Metric accepts values by (see **Values arrive by**) and that reaches the person: if your usual way is not one, the line names the way it goes instead and why. When nothing reaches the person the request waits in the **Outbox** as "Not sent: …", is never sent by email or anywhere else instead, and the owner gets one message about it.

A Feed is listed with the word "Feed". The owner and Editors see **Remove** next to it, which stops that Feed sending values. The values it already sent stay.

**Fill from n8n** is under the Feeds, for Owners and Admins who may change this Metric's Submitters (not in the demo, and not for a Derived Metric). Choose which template to read from (**Google Sheets**, **Microsoft Excel**, **Stripe**, **HubSpot**, **BigQuery** or **Snowflake**), which Feed sends the values (one you have, or **A new Feed…** with a name), and whether to **Make a Feed Key for it and show it once**, then **Download the workflow**. You get an n8n workflow with your Ziffr's address already in it, and the Feed becomes a Submitter of the Metric. The Stripe and HubSpot templates send a few fixed figures once a month, for the month that has ended, so you type the slug of the Metric each figure is for into the workflow's Settings node (the page lists the slugs of the Metrics you picked). The BigQuery and Snowflake templates run a query once a month for the month that has ended; you write that query in the workflow's **Your query** node, returning a row with the columns `metric` (a slug from that list), `value` and `period` for each figure. For a template that reads rows from a sheet or an Excel table, the page also offers a **starter sheet**: a `metric,value,period` header with this Metric's slug, to paste into your sheet. The key is shown once, beside the download, and is never written into the file: n8n keeps it in a credential named Ziffr Feed Key, as the template's guide says ([Google Sheets](../automations/google-sheets-feed.md), [Microsoft Excel](../automations/excel-feed.md), [Stripe](../automations/stripe-feed.md), [HubSpot](../automations/hubspot-feed.md), [BigQuery](../automations/bigquery-feed.md), [Snowflake](../automations/snowflake-feed.md)). You add the other system's login in n8n; Ziffr never sees it and never runs the workflow. The Audit log records that the template was downloaded, never the file.

**Values from a Feed** (for the owner and Editors) adds one of the Workspace's Feeds as a Submitter: pick it and choose **Add**. Its values arrive through the API, so the **API and Feeds** Source is turned on by itself. Owners and Admins create Feeds (see [Connecting Ziffr](04-connecting.md#feeds-numbers-from-other-systems)); a Feed is never sent Prompts. The choice only appears when there is a Feed not yet on the list.

People are chosen as Submitters when the Metric is created or duplicated. This box has no way yet to add or remove a person later.

#### Fill from a data warehouse

If your numbers sit in BigQuery or Snowflake, there are two ways to fill a Metric from them, and neither gives Ziffr your warehouse login ([ADR 0006](../adr/0006-feeds-run-outside-ziffr.md)): the query runs where you put it, with an identity you own, and only the figures it returns are sent.

| You want | Use |
| --- | --- |
| A command-line Feed in a file you keep in git, run by cron, a container or a scheduled job; a query for each Metric, with an optional Breakdown | The SQL Feed, below |
| To run nothing yourself, and you already use n8n | **Fill from n8n** with the **BigQuery** or **Snowflake** template, one query for all your Metrics, once a month ([BigQuery](../automations/bigquery-feed.md), [Snowflake](../automations/snowflake-feed.md)) |

For the SQL Feed, an Owner or Admin first makes a Feed and a Feed Key under **Settings, Feeds**, and each Metric's owner adds the Feed under **Who submits**. You install the warehouse's own package next to the Feed yourself (`npm install @google-cloud/bigquery` or `npm install snowflake-sdk`); Ziffr does not ship them, and a file that asks for one that is missing stops with a message naming it. The file holds one query per Metric slug. Write `:period_start` (the period's first day) and `:period_end` (the day after its last); the Feed turns them into the warehouse's own bound parameters, so nothing is pasted into the query. A query returns one row whose first column is the value; no row, or null, means no value yet. Only a single `select` (or `with ... select`) is accepted.

**BigQuery.** Save this as `warehouse.yaml`:

```yaml
name: Warehouse
dialect: bigquery
project: my-company-data
max_bytes_billed: 10737418240 # optional; 10 GB is the default
metrics:
  monthly-revenue:
    value: |
      select sum(amount) from `my-company-data.sales.orders`
      where order_date >= :period_start and order_date < :period_end
```

The Feed signs in with the Google Cloud application default credentials of the machine that runs it, so set `GOOGLE_APPLICATION_CREDENTIALS` to a service account's key file (or run it as an identity the machine already has). The project can instead come from `GOOGLE_CLOUD_PROJECT`.

```sh skip="needs a Feed Key and a BigQuery project"
export ZIFFR_URL=https://ziffr.example.com ZIFFR_FEED_KEY=zk_...
export GOOGLE_APPLICATION_CREDENTIALS=/secure/ziffr-feed.json
npx @ziffr/feed-sql run warehouse.yaml --dry-run
npx @ziffr/feed-sql run warehouse.yaml --backfill 24
```

`--dry-run` runs the queries and shows what would be sent without sending anything; `--backfill 24` also fills the 24 periods before the current one that have no value yet (the first run). To keep it going, schedule `npx @ziffr/feed-sql run warehouse.yaml` once a month with cron, a GitHub Action or any scheduled job, with the same environment variables ([the Feeds guide](../guides/feeds.md) has an example).

- **The role:** give the service account BigQuery Data Viewer on the datasets it reads and BigQuery Job User on the project, nothing that can write.
- **The cost cap:** BigQuery bills by bytes scanned. Every query is dry-run first; if the estimate is above `max_bytes_billed` (10 GB unless you set it) the Feed stops with a message naming the estimate and the limit, and otherwise runs the job with the same limit. Filter on the table's partition column, as the example does, to stay far below it. The cap is a safety stop, not your bill: Ziffr does not know your prices.

**Snowflake.** Save this as `warehouse.yaml`:

```yaml
name: Warehouse
dialect: snowflake
warehouse: FEED_WH
role: ZIFFR_FEED_RO
database: ANALYTICS
metrics:
  monthly-revenue:
    value: select sum(amount) from orders where paid_at >= :period_start and paid_at < :period_end
```

Login is by key pair and comes from the environment only; the file names the warehouse, role, database and schema, never a secret. Create the key with `openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out ziffr_feed.p8` and attach its public half to the Snowflake user with `alter user ZIFFR_FEED set rsa_public_key=...`.

```sh skip="needs a Feed Key and a Snowflake account"
export ZIFFR_URL=https://ziffr.example.com ZIFFR_FEED_KEY=zk_...
export SNOWFLAKE_ACCOUNT=myorg-myaccount SNOWFLAKE_USER=ZIFFR_FEED
export SNOWFLAKE_PRIVATE_KEY_PATH=/secure/ziffr_feed.p8
npx @ziffr/feed-sql run warehouse.yaml --dry-run
npx @ziffr/feed-sql run warehouse.yaml --backfill 24
```

Use `SNOWFLAKE_PRIVATE_KEY` for the key's text instead of a path, and `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE` if the key is encrypted. The two options and the schedule work as for BigQuery.

- **The role is the real control:** give the user a role that may only read, for example `usage` on the warehouse and the database and `select` on the tables it needs. The Feed's own check (one `select` statement, no batches) is a backup, not a substitute.
- **Warehouse size:** point the Feed at an X-Small warehouse with auto-suspend, so a monthly run costs little.
- **Timeout:** each query stops after 30 seconds unless you set `statement_timeout_ms` in the file.

The Feed's [README](../../packages/feed-sql/README.md) has every setting of the file.

## Sharing a Metric

**Share** belongs to the Metric Owner. For each person, and for each Group ("including whoever joins later"), choose **No access**, **Viewer** or **Editor**.

**Invite someone…** at the bottom of the Share window is for someone who is not in the Workspace yet, such as when you are the only one in it. Owners and Admins enter an email address and choose **Member** or **Guest** (a Guest sees only what is shared with them), and Ziffr invites them the same way as the **Members and Groups** page: it emails the link when mail is set up and shows it to send yourself. A person is shared with once they have joined and appear in the list. Everyone else sees "Ask an Owner or Admin to invite them" (for a dashboard or deck).

| Role | What they can do |
| --- | --- |
| **Viewer** | See the Metric, its history and comparisons, use it on their own dashboards and analyses, and assign questions and tasks about it. |
| **Editor** | Everything a Viewer can, and change its description, its Sources, its Target Series and Projections, and which Feeds submit to it. A Guest is never an Editor of a Metric. |

Deleting the Metric, sharing it, choosing its Workflow and Stand-ins, locking periods, accepting **Corrections** and restoring Versions stay with the Metric Owner. Sharing a dashboard also lets everyone on that Share see the Metrics on it (see [The Dashboard screens](12-dashboards.md)).

## Versions

**⋯** → **Versions** opens a panel on the right that lists the Metric's description as it was after each change, newest first: who changed it, when, and what changed, such as "Changed its description", "Changed how it is calculated" or "Takes values from the Feed …". A change of how the Metric is calculated is always a Version of its own, so you can see when the number began to mean something else and what it said before. Changes by one person within ten minutes form one Version.

The Metric Owner can:

- **Restore** an earlier Version. Restoring adds a new Version, so nothing is lost.
- **Name** a Version, or name the current state, such as "Board pack Q3, final", to find it again later.

Versions keep the description only. Values are never changed by restoring; replaced values live on as Superseded Values.

## Duplicating a Metric

**Duplicate** opens the new metric form, filled in from this Metric, titled "Duplicate …". The name gets "(copy)" added. The duplicate is a new Metric of yours with the same description, Sources and people who submit, and, if the original has one, a ticked **Workflow** box to keep the same Workflow. Values, Shares, Target Series and history stay with the original. Feeds are not copied: choose them again on the new Metric. Confirm with **Create duplicate**.

Duplicating is also the way to count a number in a different period, since a Metric's period is fixed once it has values.

## Archiving a Metric

**Archive…** puts aside a Metric you no longer track, without deleting anything. Confirm with **Archive the Metric**. If a [Total](#adding-up-metrics-a-total) you may change adds it up, the same dialog asks up to which period it counts there (proposed: the last one it has a value for). An **Archived Metric**:

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

The demo's Metrics cannot be deleted: the demo can't be changed. Where visitors may change the demo, they can define Metrics of their own, change their details, Sources, targets and projections, tag, archive and bring them back, but not delete or hand them over, and not change the names and descriptions of the Metrics the demo started with (see [Trying Metrics, questions and sharing in a demo that can be changed](07-getting-started.md#trying-metrics-questions-and-sharing-in-a-demo-that-can-be-changed)).

## Filling in a value for someone

When a Submitter has not sent a value, the **Metric Owner** or the owner of the Metric's **Workflow** can enter it for them. The value is recorded as the Submitter's, counts for them in their Schedule, the period's progress and the reports, and always shows who typed it: "Entered by Ben for Sara".

**Fill in for …** appears under the value on the [period's page](#a-periods-page) and in the Workflow box of the Metric's page, for the period the box shows, and on the Workflows page, under each Metric in **Metrics on it**, for the period the Workflow is working on. It is there only for someone who may fill in, and only for a Submitter who holds a Token for the Metric. Before the **Due Date** it is greyed out, with the reason beside it; it opens after the Due Date has passed, or at any time while the Submitter is **Away**. A Metric without a Workflow has no Due Date, so it can be filled in only while the Submitter is Away. It is not offered for a Guest, a Feed, a period that already has a value, a locked or condensed period, a Derived or archived Metric, or a Metric whose Submission Rule adds up or keeps both values.

**Fill in for …** opens a form with the person (when there are several), the value and an optional **Breakdown**, as on **Record a value**. The Metric's checks and Workflow apply as to any value: an Unusual Value is flagged, and nobody approves a value they entered or one entered for them. The Submitter is told by their Delivery Preference and can replace the value with their own until the period is locked: they send a value as usual (their form link, **Record a value**, a reply), and the value entered for them stays in the history, struck through, with who entered it. In a locked period their value becomes a proposed Correction.

A **Stand-in** who is asked for a value in someone's place does not use **Fill in for …**: they answer the request, and the answer is the Submitter's value entered by the Stand-in. Their form link says so ("You answer in place of Sara"), and works only for the periods they were asked about.

Guests never fill in for anyone, and are not told that a value was entered for someone: it reads as the submitter's own. View Links and Snapshots show no names at all. Each Filled-in Value is in the [Audit Log](16-workspace-settings.md#audit-log).

## Locks and corrections on a Metric

A **Lock**ed period takes no more values. When someone sends a value for it anyway, it is not recorded. Instead the Metric Owner gets a question, "… is locked. … sent … late: accept it as a correction?", with **Accept** and **Decline**. The sender sees that their value went to the Metric Owner as a proposed Correction.

Anyone answering a question or task about a value can also propose a Correction in its Thread. It takes effect only when the Metric Owner accepts it. The earlier value is then kept and shown struck through, and the corrected value goes through the Metric's Workflow again, so a locked period is checked and approved anew. See [Workflows and approvals](11-workflows.md#locks).

## The personal form link

Every Submitter who is a person or a Contact has a personal form link for each Metric they submit. It arrives with the first request and with every **Prompt**, and it opens without signing in: the link itself says who is sending. Keep it to yourself: anyone with it can submit.

The page is drawn in the look of the Workspace's team default Theme: a header row inside the form's card with its logo and the Workspace's name above an accent line, its colours and fonts, and its footer line at the bottom. If the Theme's accent is too pale to read on its cards, Ziffr uses a darker shade of it. Only that look reaches the page, never the Theme itself.

The form shows:

- "Hi …, please report", then the Metric's name and description. **How it is calculated** is not on the form link: it is for the people the Metric is shared with.
- **For** the period the value will be recorded for. With no request waiting, it is the period running today. While Ziffr's request for an earlier period is unanswered, **For** is a list that starts at that period, marked **asked for** (see [While a request waits](#while-a-request-waits)). If the period shown already has a value, the form says so and names the Submission Rule, such as "already has 84,000 € (overwrite with the newer value)".
- When the request for the running period went by several ways and was already answered on Slack, Telegram or email, a note says **Already answered on** that way while the running period is picked. A new value here still follows the Submission Rule.
- The value, labelled with the Metric's name. Type it as you would write it.
- **Breakdown (optional)**: paste two columns from a spreadsheet, one row per line, such as country and revenue, or choose **Load a CSV file**. Add a third column headed **Parent** (or **Eltern**) with the name of another row, and the row is a part of it (leave the cell empty for a row at the top; without that heading a third cell is read as it always was); a CSV file may use commas for the three columns. Ziffr says how many rows it read, reading each number the way your Workspace writes them. If you leave the value empty, it becomes the sum of the rows. If you fill in both and they differ, the value you typed counts.
- **Submit**: sends the value. The form then says what happened, for example that the value was recorded, added up, replaced, refused because the period already has one, or sent to the Metric Owner because the period is locked. If the Metric has a Workflow, it also says what the Workflow does next, such as asking for Approval, without giving a reason or saying who is asked. The form shows only what Ziffr answered to your own submission: reloading the page or opening a link with extra words in its address shows the empty form again.

When Ziffr cannot read the value, the reason appears under the field, such as "Type a number, such as 88 or 1,250." (the example follows your Workspace's number style). What you typed stays in the field and the cursor returns to it, so you can correct it and submit again. The field is emptied only after a value was recorded.

At the bottom, **Open metric** leads to the Metric's page, for those who may sign in and see it.

### While a request waits

A form link records the current period or one you were asked for. A Workflow usually asks for the period that has just ended. As long as you have not answered, your form link records that period, as a reply to the request does.

- **For** lists every period you were asked for that still waits, newest first, and the running period, marked such as **this week**. It starts at the newest period asked for. Pick another one before you press **Submit**. If only the running period was asked for, there is no list, and **For** says "(asked for)".
- A period waits while Ziffr asked you (this link) for it, you have not answered, and its value is still due: no value is in for it, from you or anyone else who submits the Metric (a value sent back at **Approval** counts as in), and it is not too old. Too old means a Due Date more than 90 days ago or, for a Metric without a Workflow, a period before the one that ended last.
- A waiting period is never shown with a value. A **Locked** one is listed too, and what you send for it goes to the Metric Owner as a proposed Correction.
- After you record a value for a waiting period, **For** moves to the next one that waits, or back to the running period. Check it before you send another value.
- The form records the period shown under **For** only. If what you type names another period, such as "September 5", nothing is recorded and the form says so. With no list, no earlier period waits, so a value that names one is not recorded either.
- If a period stopped waiting while the form was open, for example because you answered on Slack in the meantime, nothing is recorded and the form asks you to check **For**.
- A Stand-in's form link lists the periods the Stand-in was asked for in that person's place.
- For any other period, sign in and use **Record a value** on the Metric's page.

### On a phone

On a phone (under 640 px wide) the same link opens a shorter screen: the Metric's name, the period, one large number field and **Submit**. **Add a breakdown (optional)** shows the Breakdown field. After a value is recorded, one message says what happened and the field gives way to **Send another value**.

If you are also signed in, and the link is your own, the screen adds what the link alone does not show:

- **Last value**, with its period: the newest value before the period picked under **For**, if one of the periods Record a value lists has one.
- After saving, **Next: …** with the Metric and the period of your next value that is due (the most overdue first, from your **Schedule**), or "No other value of yours is due now." It opens that value's screen for that period, and **For** names it, or starts at it when it is a list; a period named this way that no request waits for, such as one that already has a value, is added to your list. A value saved for a period named this way is recorded as with **Record a value** on the Metric's page. The address of that screen keeps the period, so it shows the same period on a larger screen.

Someone who has the link but is not signed in as you sees and can do only what the form above offers. This needs the Workspace you have open to be the one the link belongs to.

Where the Workspace has Telegram on, the form also offers **Connect Telegram** to a Contact. Members do not see it: they connect Telegram signed in, on the Connectors page. Connecting takes three steps:

1. Choose **Connect Telegram**, then **Open Telegram**: the link opens Ziffr's Telegram bot and is valid for ten minutes. Tap **Start** there.
2. The bot answers with a four-digit number. Ziffr sends an email, **Confirm Telegram for Ziffr**, to the address the Workspace keeps for you, with the name of the Telegram account. The number is not in the email.
3. If you started this yourself, open the link in the email, type the number your own Telegram chat shows and choose **Confirm** within 30 minutes. Never type a number someone else gave you. If you did not start it, ignore the email: nothing is connected.

Until you confirm, Ziffr sends that Telegram account nothing and takes no answer from it. Once you have, requests for numbers reach you in Telegram as well, the form says that you are connected, and Ziffr emails you that it is done. The link works once. After three wrong numbers it stops working. Starting again ends the link before, and Ziffr sends at most three of these emails in an hour and five in a day. You get this email also if you have stopped requests for numbers by email, because you ask for it. When Ziffr cannot send it, the bot says so, with who can help.

The form cannot connect Telegram, and says so with who can help, when the Workspace has no email address for you, when this Ziffr sends no email, or in a trial, which sends nothing to Contacts.

To stop, send `/stop` to the bot in Telegram; only then can the form connect another Telegram account. A form cannot disconnect.

A Stand-in's form link works only while they stand in, and for the periods they were asked about; its page says whom they answer for. A Feed has no form link; it sends values with its Feed Key. The form only works when the Web form is one of the Metric's Sources.
