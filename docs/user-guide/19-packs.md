<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/settings/packs/** -->
# Packs

A **Pack** is a file of ready-made things for a Workspace: Metric Catalog entries, Dashboard and Deck Templates, Workflow Templates, View Designs, Analysis Recipes and Themes. It holds no code. Open **Workspace → Packs**.

## The installed Packs

**Installed in this Workspace** lists each Pack with its version, author and license, whether it was an uploaded file, when and by whom it was installed, and what it added: its Metric Catalog entries, templates, designs and Themes. A Pack's own page and help page open as plain links, when it has them; for a Pack that came as a file, not from the Marketplace, the link names its site and says the Marketplace did not check it. Owners, Admins and Members see the list; Guests see no Packs.

Each Pack shows "by" its author, with its logo when it has one, in a bordered box next to the name, and says who vouches for both. A Pack installed from the Marketplace says **Published through the Marketplace as @handle. Checked by program. No person reviewed it.** The last sentence is left out only when the Marketplace signed that a person looked at that version. The signature shows where the file came from, and the checks run on every Pack are the protection. A Pack installed from a file says **Uploaded file. The Marketplace did not check it. Its name and logo are what the file says about itself.**, shows the id as the file writes it, and, when the id begins with `ziffr/`, adds **This file says it is from Ziffr. It is not signed by the Marketplace.** There is no badge: read the lines. The logo is shown only here, in the install preview and on the update page, never anywhere else in Ziffr.

## Who does what in a Pack

A Pack may name **Positions**, such as "Sales lead" or "Salesperson": places that people fill when the Pack is set up. It names no person. It may also have **Repeats**: parts that are made once for each line of a list, such as each salesperson or site.

The preview of such a Pack shows this before you install it, and the installed Pack keeps it under **Who does what**:

| Section | What it shows |
| --- | --- |
| **Made once for each line of a list (Repeats)** | Each Repeat in the Pack's words, the most lines it takes, and the Metrics, dashboards and Workflows each line gets. |
| **Who does what (Positions)** | Each Position, whether one person or several fill it (also once per line), and what it does: which Metrics it submits or stands in for, where it approves, which Checklist Items it is told or ticks off, and which Snapshot it gets. |
| **Shares it proposes** | Each Position the Pack proposes to share Metrics or dashboards with, as Viewer or Editor. Installing shares nothing and sends nothing. |

An item you removed after installing is left out, and so are the Positions of a Workflow Template kept from another version of the Pack. [Set up from this Pack](#set-up-with-positions) asks who fills each Position.

## Ziffr's own Packs

**Ziffr's own Packs** lists the thirteen Packs that come with this version of Ziffr, for Owners and Admins. Each shows its name, version and summary and what it brings as counts (for example "13 Metrics, 2 dashboards, 2 Workflows"). It works on any Installation, also a self-hosted one with no Marketplace: nothing is downloaded and nothing leaves your server.

Choose **Preview with Sample Data** to open the Pack's Preview. It is a view of its own beside the list, and on a phone it covers the whole screen. **Back to the list**, the close button or Escape take you back and install nothing. From the top it shows:

1. The Pack's name, version and one sentence about it, with its author and who vouches for them.
2. Its first dashboard, drawn with Sample Data and never your own values. On a phone you see the dashboard's first three widgets, one below the other, and how many more there are.
3. **Install**, with whatever you have to confirm first, the license and the Pack's links.
4. **How it works**, the Pack's [guide](#a-packs-guide). It stays closed until you choose it.
5. **What it brings**: how many items, [where the numbers come from](#where-a-packs-numbers-come-from), who does what, and every item.

Its Dashboard Templates show made-up numbers under the Pack's own Metric names; a Metric made once for each line of a Repeat is drawn for three made-up lines, such as “Commit, Salesperson A”. Under each Metric it shows its description and, where the Pack has one, **How it is calculated**: what counts, where the figure comes from and which adjustments are made. A Metric you set up from the Pack gets that text, and it is yours to change. These Packs need no confirmation about where they came from; texts aimed at assistants, if one ever had any, would still be listed and need a tick. Choose **Install** to add it. Nothing installs until you do, and the Audit log records it as installed from Ziffr's own Packs. A Pack that holds a Theme, such as SaaS metrics, Board meeting and Sales forecast, needs an Owner. A Pack that is installed already shows its version instead of a Preview.

When a newer Ziffr brings a newer version of a Pack you installed, that Pack shows **Version … comes with this Ziffr…**, which shows what an update changes before it is done, as under Updating a Pack. It is never applied by itself.

## Made-up numbers in a Practice Workspace

In a [Practice Workspace](18-installation-settings.md#practice-workspace), a Pack you set up can be filled at once, so its dashboards and slides have something to show. After **Set up** choose **Fill with made-up numbers**; the same button stays on the installed Pack. It fills the Metrics your Set ups made, a few at a time, and says how far it is.

- **Values** for every period from the start of the previous Fiscal Year, and never less than 13 months back (at least 8 quarters and 3 years for quarterly and yearly Metrics), so year on year, year to date against last year and the period before all work. They follow a mild trend and season in the Metric's unit, and are marked as imports.
- **Where a Metric has a Submitter, the latest two periods stay empty:** the one that ended last, which is the one a request asks for, and the running one. So you can try the Workflow: **Run today's steps now** asks for last week's figures, you answer, and the Approver approves. A period a Workflow already asked for is left alone too.
- **A Metric with no Submitter** is filled up to and including the period that ended last, so figures a system would send, such as **Closed this quarter** and **Pipeline value** in the Sales forecast, are not a week behind. The running period stays empty. Where the Metric follows a Workflow, that last value counts as through it (published, and locked where the Workflow locks), and an open request to follow it up is closed. To send such a figure yourself instead, [add a Submitter](10-metrics.md#adding-and-removing-a-person) before you fill.
- Made-up numbers start no Approval, task or message.
- **They belong together** in Ziffr's own Packs: a part is never more than its whole (overdue invoices within open invoices, orders in line with revenue). In the [Sales forecast](#the-sales-forecast-pack) each salesperson's Closed this quarter grows through the quarter and starts again with the next, Closed is never above Commit nor Commit above Best case, every open deal of the Best case is in the Pipeline value, and some salespeople are above their quota and some below.
- **Targets:** a Metric where higher or lower is better gets a Target Series for the previous and the whole current Fiscal Year, periods still to come included, some a little above its values and some below. In the Sales forecast only **Commit** gets targets: the salesperson's quota, the same in every week of a quarter. A quota you set yourself stays and gives the quarter's other weeks the same one.
- Calculated Metrics and Totals work themselves out, and keep their Target Range as their only target. A Metric with a target range to stay inside keeps it, no Metric gets a Breakdown, and **nothing that is there is replaced**: a period with a value keeps it, and a target keeps its week. Outside the Sales forecast's quota, a Metric with a Target Series gets no more targets.

The button is offered only to you, only in your Practice Workspace.

## Whom a Pack is for

Each of Ziffr's own Packs says whom it is for: the industries, the kinds of customers, the Business Functions, the sizes and the countries it was made for. Ziffr uses this only to suggest first the Packs that fit what your Workspace and the people who manage it have told it, with the reason ("your industry", "your function"). It never hides a Pack: every one stays in the list. A Pack from a file or the Marketplace may say it too. What you answered about your Workspace and your function stays in your Workspace; nothing is sent anywhere to rank Packs.

## Installing from a file

On a phone the Packs page says at the top that it is easier on a larger screen; see [Screens made for a larger screen](07-getting-started.md#screens-made-for-a-larger-screen).

Ziffr makes thirteen starting Packs: SaaS metrics, Online shop, Agency or freelancer, Sports club and a Board meeting deck; five for the functions of a business that any company can use (Sales, Finance, People and HR, Customer support, and Operations and fulfilment); [Sales forecast](#the-sales-forecast-pack), for the weekly forecast meeting; and two for Ziffr's own figures (Workspace usage and Ziffr operations). Each brings its Metrics, a dashboard and a Workflow, and names the ready n8n templates that can fill them. They come with Ziffr: install one from **Ziffr's own Packs**, above, with no download. Their files are also in the `packs` folder of Ziffr's repository, to read or to install as a file.

**SaaS metrics** is the fullest: 13 Metrics with Tags, a monthly management report (a dashboard and a deck), a quarterly board deck, Workflows for the monthly and the quarterly close, an Analysis Recipe with its View Design, and a Theme that shows the Pack's logo. It holds a Theme, so an Owner installs it. **Set up from this Pack** makes its Metrics, the monthly dashboard and a close Workflow in one go; the decks start from **From a Deck Template** on the Decks page, with the Pack's Theme already chosen.

**Install a Pack from a file** is for Owners and Admins. A Pack that holds Themes needs an Owner, since only Owners change Themes. The demo installs no Packs and opens none.

1. Choose **Choose a Pack file…** and pick the Pack's file (at most 1 MiB). Ziffr checks the whole file before it shows anything. If something in it is wrong, it lists every problem with its line, and installs nothing.
2. Ziffr opens the Pack's Preview, laid out as for [Ziffr's own Packs](#ziffrs-own-packs): name, version, summary, author with its logo and who vouches for them, the first dashboard, **Install** with the license, **How it works** and, under **What it brings**, every item the Pack adds. A Theme that comes with the Pack's logo says so. Dashboard Templates and View Designs are drawn with Sample Data, never your own values; Themes show their colours.
3. It says **Uploaded file. The Marketplace did not check it.** Tick **I install a file the Marketplace did not check.**
4. If any text in the Pack reads like an instruction to an AI assistant, such as "ignore your instructions", Ziffr lists each one. Assistants connected to the Workspace read Metric descriptions, but can only do what their key allows. Read them, then tick **I read the words aimed at assistants.**
5. Choose **Install**, which works once you ticked what is asked. The view closes, and the list shows the Pack. The Pack is installed whole or not at all, and the Audit log records it.

Installing makes no Metric, Workflow, dashboard or deck, sends nothing and changes nothing already in the Workspace. Its Metric Catalog entries appear under **New metric** (a Derived Metric's entry only through **Set up from this Pack**, below), its templates where you start a dashboard, deck or Workflow, its View Designs under **Workspace → Library** (an Analysis Recipe as a View Design that draws it), and its Themes on the Themes page. Two Packs may describe the same Metric, such as Revenue: the Metric Catalog then lists both, each under its Pack. A Pack that is installed already is not installed again: update it instead.

The [Setup Guide](07-getting-started.md#the-setup-guide) offers the same Packs in its **Starting point** step, ranked for your Workspace, with the same Preview, Install and **Set up from this Pack**; there the form starts with only the first three Metrics ticked, so your first Metrics exist quickly, and a second press makes nothing twice.

## The Sales forecast Pack

**Sales forecast** is for a team that calls its quarter every week. It is a Pack of its own: the monthly **Sales** Pack stays as it is, and you can have both. It has two [Positions](#who-does-what-in-a-pack), **Sales lead** and **Salesperson**, and a [Repeat](#who-does-what-in-a-pack) of up to 30 salespeople. **Set up from this Pack** asks you to list each salesperson and to say who the sales lead is, and makes:

| What | What it does |
| --- | --- |
| **Commit** and **Best case**, one for each salesperson | The week's two forecast calls for the quarter, deals already won included. Each salesperson sends their own; the sales lead stands in for them. The target of a salesperson's **Commit** is their quota, one for each week. |
| **Closed this quarter**, **Pipeline value**, one for each salesperson | What they won since the quarter began, and their open deals that can still close in it. A CRM sends them, so nobody is asked unless you choose it. |
| **Team commit**, **Team best case**, **Team closed this quarter**, **Team pipeline value** | [Totals](10-metrics.md#adding-up-metrics-a-total) that add up the figures of all salespeople. Nobody sends them. |
| **Quota** | Worked out, not sent: [the target](10-metrics.md#reading-a-target) of **Team commit** for the week. That is the salespeople's weekly targets on **Commit** added up, unless you give the team a quota of its own. |
| **Commit gap to quota**, **Commit as share of quota** | Team commit minus the quota, and Team commit as a percentage of it. 0 or more, and 100 % or more, cover the quota. |
| **Pipeline coverage** | Team pipeline value divided by what is still missing (the quota minus Team closed this quarter). 3 times means the open deals are worth three times what is missing. |
| The dashboard **Weekly forecast meeting** | This week's call against quota and the change on last week, then the last 13 weeks, and each salesperson's commit against their quota. On a phone the call against quota comes first. |
| The Workflow **Weekly sales forecast** | Asks each salesperson on Monday for the week just ended. The values are due on Tuesday, with a reminder that day; the Metric Owner is told on Wednesday about a value still missing. A change of more than 25 % is marked unusual. The sales lead approves every value, which is then published and locked. Once the week is finished it sends the dashboard's Snapshot to the sales lead. |

That is 4 Metrics for each salesperson and 8 for the team: ten salespeople make 48. All are weekly. Those that people send, and their sums, have the **Aggregation** last value, so a widget shown by quarter shows each quarter's latest figure, never the weeks added up.

**Who sees what.** Each salesperson sees their own figures. The check before you set up proposes to share every figure with the sales lead: choose **Tick all for** them. A team figure is shown only to someone who sees [every salesperson's figure it adds up](10-metrics.md#who-sees-its-numbers); its owner can show it to others on its page.

**Sharing the dashboard** shows its Metrics too. A salesperson you share **Weekly forecast meeting** with sees every salesperson's **Commit** and quota, and with them **Team commit**, **Quota**, the gap and the share of quota. The **Share** panel warns of this, naming what else it shows. Share the dashboard only with people who may see all of that.

**The team's quota.** To begin with it is the salespeople's quotas added up: weekly targets on each salesperson's **Commit**, which is the only place you set them. A week has a team quota only when every salesperson has a target for it.

To give the team a quota of its own instead, such as one with a margin on top (the owner or an Editor of **Team commit**; only the owner while it is open):

1. Open **Team commit** and, on the **Overview** tab, find **What it adds up**.
2. Under **Target**, choose **Its own target**.
3. Open the **Targets** tab. **Add row** for each week, or **Paste from a spreadsheet** with two columns, the week and the quota.
4. Give every week of the quarter the team's quota for the quarter, also past weeks you still read, and press the **Save** button below the rows.

**Quota**, the gap, the share and the coverage then use the team's own quota, on the dashboard and the slides; a week without one has none of these, past weeks too. The slide with the gap by salesperson stays as it was: each row compares a salesperson with their own quota, so the rows need not add up to the team's gap. For one quota that holds in every week, use **Edit details…** on the **Description** tab and **Target from** instead; it keeps no history, so changing it changes past weeks too.

To go back, choose **Its Metrics’ targets added up** under **Target** on the **Overview** tab. This removes a **Target from** or **Target up to** set on **Team commit**. The weekly quotas you entered for it are kept but not used, and count again if you choose **Its own target** later.

**A new salesperson** joins with **Add a Salesperson** under the installed Pack (see [Add a line](#add-a-line)): tick the team figures that should count them, then set their quota. **Someone who leaves:** archive their Metrics, choosing up to which week each team figure counts them; earlier weeks stay.

The Pack also has a Deck Template, **Weekly forecast meeting**, drawn from [Slide Elements](14-decks-and-themes.md#slide-elements), so every colour and font follows the deck's Theme and the words fill themselves in each week:

| Slide | What it shows |
| --- | --- |
| Cover | The deck's title, the week of the quarter and the agenda. |
| The call | "The commit covers … of quota with … left", the team's Commit, Quota, Best case and Pipeline coverage as figures, and the weeks of the quarter as columns against the quota. |
| Where the gap sits | A [gap table of the Total](14-decks-and-themes.md#gap-table-of-a-total) **Team commit**: each salesperson's quota and commit with the gap as bars. Each reader gets the rows of the figures they may see. Write what you ask the meeting for in the line below. |
| Change since last week | Every team figure with last week's, the change and an 8-week trend. |
| The weeks of the quarter | Best case and commit by week against the quota. |
| Pipeline coverage | Coverage by week, with **What happened**, **Why** and **Decision needed** beside it. |
| Risks, and what we need | **Deals at risk** and **Could still move in** as numbered rows, and **What we need** under them, to write in. |

Three Themes come with the Pack, **Forecast Navy** (the deck starts with it), **Forecast Coral** and **Forecast Forest**: switch the deck's Theme under **⋯ → Theme…**. Each shows a dashed **Your logo** box until you add your logo to the Theme on the Themes page, or delete the box from the slides. A footer you type for the deck, such as "Confidential", follows each slide's source line. Start the deck on the Decks page with **From a Deck Template** and pick the Metric for each Slot. The slides claim only what your figures say: a headline asks a question while a figure it needs is missing, and what only you know, such as why the pipeline moved or what you ask for, is a question to write over. Headlines that make a judgement are yours to write.

**Which week a figure belongs to.** Each week holds the figures as they stood at the end of that week. A reply to Monday's request counts for the week just ended. The form link in it starts at that week while the request is unanswered, and you can pick the running week under **For** instead (see [While a request waits](10-metrics.md#while-a-request-waits)). Once a value is in for the week, the link no longer offers it: to change that figure, also one sent back at **Approval**, sign in, choose **Record a value** and pick the week. In a week that spans two quarters, send the figures of the quarter the week starts in, as Ziffr counts that week to it. Earlier weeks can be brought in with [Paste values](10-metrics.md#paste-values-from-a-spreadsheet), and the team's figures count them: a team figure starts at the first week one of its salespeople has a value, and a week has a sum once everyone counted in it has one.

**Set the quotas.** What Set up made begins with **Next: set the targets**, with a link to each salesperson's [Targets tab](10-metrics.md#the-targets-tab). Give every week of the quarter their quarter's quota (**Paste from a spreadsheet** takes the weeks in one go) and press **Save**. At the start of a new quarter, add its weeks. The targets are changed by a Commit's owner, who is whoever set the Pack up, and its [Editors](10-metrics.md#sharing-a-metric). A sales lead who did not set the Pack up only sees the figures: to let them set quotas, the owner opens each **Commit**, chooses **Share** and makes them **Editor**.

**Pasting earlier weeks.** [Paste values](10-metrics.md#paste-values-from-a-spreadsheet) takes only Metrics you submit values for and refuses the others, even to their owner. First [add yourself](10-metrics.md#adding-and-removing-a-person) under **Who submits** on each of those Metrics, with **Ask them for the current value now** unticked; as their owner, tick **Record as history** so that nobody is asked to approve old weeks; then remove yourself again.

**A set-up made with an earlier version of the Pack** keeps working as it is: its Metrics, formulas and decks are your own. To change to figures for each salesperson, update the Pack and set it up again.

**Empty or below 0.** A team figure has no value in a week while one salesperson's figure is missing: someone with nothing sends 0. A calculated Metric has no value while one of its figures, or the quota it reads, is missing. Pipeline coverage also has none when exactly the quota is closed, and is below 0 when more is closed: then nothing is left to cover. The Pack sets no Target Range for coverage; set your own on the Metric's page with **Edit details…**.

**In a Workspace of one**, nobody else can approve, so every value waits for your own check. Change the Approve step to **Unusual values only** if that is more than you want.

**From your CRM.** Instead of asking people, n8n can send each salesperson's **Closed this quarter** and **Pipeline value** every Monday from HubSpot, Salesforce or Pipedrive, and from the first two also **Commit** and **Best case** if you like. Choose **Fill from n8n** on one of these Metrics and a forecast template, leave its settings for the team's figures empty, since those are Totals and take no values, and give each salesperson a line in its **Owners** node ([what they send and when](../automations/crm-forecast-feeds.md)). A figure that came from the CRM is approved like any other, but its first value is not checked for being unusual. The Pack marks **Closed this quarter** and **Pipeline value** as sent by a CRM, so **Set up from this Pack** asks nobody for them; a salesperson is proposed as their Viewer instead.

**Without a CRM** or a sheet, add a person who sends them: open each **Closed this quarter** and **Pipeline value**, go to the **Description** tab and, under [Who submits](10-metrics.md#adding-and-removing-a-person), choose **Add a person**, pick the salesperson and choose **Add…**.

**The Snapshot.** Set up connects the Workflow's **Send Snapshot** step with the dashboard and the sales lead. To send it to others too, open the Workflow, add them in the step (see [The steps](11-workflows.md#the-steps)) and share the dashboard with them, or the link is not sent to them.

## Where a Pack's numbers come from

The preview of a Pack shows, under **What it brings**, a table **Where the numbers come from**. Metrics with the same answer share a row. A number reaches Ziffr in one of two ways: Ziffr asks a person, or another system sends it through a [Feed](16-workspace-settings.md#feeds).

| The row says | What it means |
| --- | --- |
| **Ask a person** | Ziffr asks by the ways the line under it names, such as web form, email, Slack or Telegram. |
| **Ask a person, or another system sends it** | The Pack leaves the choice to you. A system sends it with n8n, a SQL Feed or another program. |
| **Ask a person, or fill it from** a system **(template included)** | The Pack comes with an n8n template for that system, which you connect. |
| **Another system sends it** | The Metric takes no value from a person. Where the creator named the kind of system, it follows, such as CRM. |
| **Ziffr calculates it** from other Metrics | Nothing to do. |
| **The target** of another Metric | You set it on that Metric's **Targets** tab. |
| **The targets** of each Metric named, **added up** | The number is a [Total](10-metrics.md#adding-up-metrics-a-total)'s target: you set targets on each of the Metrics it adds up, such as each salesperson's quota on their **Commit**. |

The creator may say who or what sends a number and add a note; where they say nothing, the row names the ways the Metric accepts.

Under it, **Included** lists what installing brings, its Workflows with what each does and the templates delivered, and **What you still need** lists what is yours to provide: people to ask, connections to other systems, targets to set, Approvers, who gets a Snapshot, and an Owner where the Pack holds a Theme.

Both are in Help with an installed Pack, also one without a guide (the Pack then shows **What it needs**). **Set up from this Pack** shows the same table and **What you still need**. Nobody is asked for a number another system sends or one set as a target: **Make me the Submitter of their values** covers only the other numbers, and whoever holds a Position submits only those too. **Ask me also for …** makes you the Submitter of the other ones where you would submit them; nobody else is asked for them either way. You can add Submitters later on each Metric's page. A Pack installed before Ziffr kept this shows it after an update to a newer version.

## A Pack's guide

A Pack may carry a **Pack Guide**: what its creator tells you about it. The Preview holds it under **How it works**, closed until you choose it, for a file, one of Ziffr's own Packs and a Pack from the Marketplace, also in the Setup Guide.

Each of Ziffr's own Packs has one; read **First steps**, which begins with **Start here**. A Pack of one of them installed from an earlier version of Ziffr gets its guide when you update it.

It has up to five sections, always under these titles: **What it's for**, **Before you start**, **First steps**, **Each part** and **Questions**. A guide shows only the sections its creator filled. **What it's for** and **First steps** are open when the guide appears (when it has neither, its first section is); choose a title to open or close a section.

The words are the creator's, not Ziffr's. They are headings, paragraphs, lists and bold words only: a guide holds no link, picture or code, and Ziffr refuses a file whose guide has one, before it shows anything. Words in a guide that read like instructions to an AI assistant are listed with the others. A Pack without a guide shows none.

**After installing,** the guide is in Help. The installed Pack shows **Read its guide**, and the message that says a Pack was installed offers the same. In Help, **Guides from your Packs** lists every installed Pack that has one: at the top on the Packs screen and in the list of chapters, further down on other screens. Everyone who sees the installed Packs reads their guides: Owners, Admins and Members, not Guests. A guide changes nobody's rights and is never part of a Snapshot, a View Link or a message. Updating a Pack replaces its guide with the new version's, or removes it when that one has none; uninstalling removes it. A Pack installed before Ziffr kept guides has none until it is updated to a newer version. A Workspace Export does not hold the installed Packs, so it holds no guide.


Installing adds only entries and templates. **Set up from this Pack**, under an installed Pack, turns them into things you use. It is for Owners and Admins.

The form opens with the whole Pack chosen: every Metric ticked, the dashboard and the Workflow picked when the Pack has exactly one of each, and, when you are the only member of the Workspace, you as the Approver when its Approve step asks for just one. Press **Set up** to take it all, or untick and change what you do not want. Setting up sends no request for values unless you tick **Send the first requests now**. When the Workspace has other members, Approvers start empty: you pick them.

| Control | What it does |
| --- | --- |
| **Metrics to make** | One box per Metric Catalog entry of the Pack. A Derived Metric, such as Average order value, is computed from other entries; ticking it ticks those too, and they are made first. A [Total](10-metrics.md#adding-up-metrics-a-total), such as the team's commit, adds up one entry of every line of a Repeat; ticking it ticks that entry too. |
| **Tags on an entry** | An entry may bring up to 5 Tags, shown under its name. The Metric made from it gets them, matched by name with the Tags the Workspace has (so `finance` and `Finance` are one Tag, in its first spelling) and new ones made. If a limit is reached (10 Tags on a Metric, 200 in the Workspace) the Metric is still made, and the result says which Tags stayed off it: merge or delete Tags you do not need, then add them by hand. |
| **Make me the Submitter of their values** | Makes you the Submitter of the Metrics that take values. It sends nothing by itself. Untick it to add Submitters later under [Who submits](10-metrics.md#who-submits) on each Metric's page. |
| **Values come from the Feed** | Shown when the Workspace has a Feed. Makes that Feed the Submitter of every Metric that takes values and turns on the API Source, so a program such as the [Usage Feed](../guides/usage.md) fills them and nobody is asked. Only Feeds of this Workspace are offered. |
| **Dashboard** | One of the Pack's Dashboard Templates, or none. Each Slot is filled with the Metric made from the entry it suggests; a Slot whose entry you do not make asks you to pick one of your Metrics. |
| **Workflow** | One of the Pack's Workflow Templates, or none. If its Approve step asks for Approvers, pick each one, members of the Workspace. The Metrics that take values follow this Workflow. |
| **Send the first requests now** | Starts unticked, and says how many messages would go to whom, such as "13 messages to you": one for each Metric and Submitter. Ticked, each request asks for the period that ended last (last week for a weekly Metric), as the Workflow's own run does, which then does not ask a second time. Unticked, nothing is sent when you set up: the Metrics' Workflow asks at its next run. Without a Workflow nothing asks by itself; open a Metric you submit and choose **Ask me now** in its menu, or give it a Workflow. The result page says how many requests went out and names the Metrics nothing asks for. |
| **How many Metrics it makes** | A line at the top of the form, which changes with every box: "Makes 18 Metrics: 20 of 50 left in Size Small afterwards." The Metrics made for a Derived Metric are counted. If the set goes past what the Size holds but within its room, the line says by how many, and that the 14 days over the limit start. If it does not fit at all, the line says how many do, and **Set up** waits: untick some entries, archive Metrics you no longer track, or follow **change the Size** to [Size and usage](16-workspace-settings.md#size-and-usage). Where the limit has no Size name (a trial's 25, or one your Installation Admin set), the line says "the limit". |
| **Set up** | Makes it all. Ziffr checks everything first: if anything cannot be made, such as more Metrics than the Workspace's limit (see [Size and usage](16-workspace-settings.md#size-and-usage)) or a trial's 25, nothing is made and it says why. |

### Set up with Positions

For a Pack that names Positions or Repeats, the form has more parts. A Pack without them looks as above.

1. **Lists.** For each Repeat, **List each …** takes one line per salesperson, site or company: type its name, such as "Munich", and pick the people for its Positions. **Add a line** adds one; **Paste a list of names**, or pasting a column into a name box, adds many at once. A name is never filled in from a person's name. A line's name appears in the names of its Metrics ("Incidents, Munich"), which everyone who sees them reads, Guests included. A Repeat takes at most 50 lines, or fewer when the Pack says so.
2. **Dashboard** and **Workflow** are picked once for the whole set and once **for each** line of a Repeat, one of each. A line's Metrics follow its line's Workflow, else the one for the whole set. A dashboard for the whole set takes every line's Metric in a Slot for several Metrics, and shows all of them to whoever it is shared with.
3. **Who does what.** One question per Position, such as **Who is the Sales lead?**; a Position for several people lets you tick several. Only people who may fill every place the Position takes in what you chose are offered, and **Why is someone missing?** says why: a Contact cannot approve, be told or be shared with, and a Guest cannot stand in. Invite a person on the Members page first; Set up invites nobody and changes no role. In a Workspace of one, you are filled in.
4. **Check before you set up.** How many Metrics, dashboards and Workflows are made; **Who will see what**, with each person's Metrics and why (submits it, shared with them, on a dashboard); and the **Shares the Pack proposes**, each with its own box. A Share that would show someone a Metric they would not see otherwise, or lets them change something, starts unticked. One kind starts ticked although it shows more: where someone's Position submits a number they are not asked for, a Viewer Share lets them see it all the same. Only ticked Shares are made.
5. **Messages.** The check names who is not asked for which number, and why. A Contact who is not asked for a number sees nothing of it, as a Contact cannot be shared with. Nobody, you included, is sent a request when you set up, unless you tick **Send the first requests now**, which starts unticked and says how many messages would go to whom: one for each Metric and Submitter. Otherwise they are asked at the Workflow's next run. A Metric that follows no Workflow asks nobody by itself, and the result page names it.

A **Total** of the Pack, such as the commit of all salespeople, is made over the Metrics of every line, with the target the Pack names for it: its own, or the targets of those Metrics added up. Those Metrics count from the first period one of them has a value, also one that comes later, such as history you paste after setting up or last week's replies. It takes no values, so nobody is asked for it. It is never open: a proposed Share of it shows its sums only to someone who also sees every Metric it adds up, and **Who will see what** says "no sums" for anyone else. Only its owner can open it, on its page.

An empty Position leaves the place open: no Submitter, "nobody yet" on a Task, nobody told. A Workflow with an Approve step is not made while one of its Approvers is empty. Where someone submits values and approves them, the rules of Approval apply: nobody approves their own value. A Send Snapshot step gets its dashboard when that is made in the same go; a recipient the dashboard is not shared with gets nothing from it, and the form says so.

Afterwards everything is ordinary: change who does what on each Metric, Workflow and dashboard. Ziffr keeps a record of what was made; it decides nothing, uninstalling the Pack deletes it, and a Workspace Export leaves it out. **Large sets.** One Set up makes at most 200 Metrics. The whole set is checked against the Workspace's limit before anything is made. It then makes the Metrics a few at a time and says how far it is; keep the page open. The dashboards and Shares come last. If it stops on the way, it says what was made, keeps that, and does not go on: archive or delete what you do not want, or set up the missing lines again.

### Add a line

Once something of a Repeat was set up, the installed Pack offers **Add a …** in the Repeat's own word, such as **Add a Salesperson** or **Add a Site**. It makes only that one line: give it a name no other line has and pick its people. What each line got so far is chosen, and the people of the other Positions are those of your last Set up; change any of it. The check is the same as for Set up, and also lists:

- **Add to what is set up**, each with its own box: the new Metrics joining the Workflow made for the whole set, when it is yours (ticked), the widgets of several Metrics that show most lines' Metrics, on dashboards you may change, and the Totals of the set that you own. Whoever such a dashboard is shared with sees what a widget shows, so each widget says who would newly see the new Metrics and starts unticked where anyone would, or where the dashboard is shared with a Group, whose later members would see them too. Tick it to add them; **Who will see what** then names those people.
- A ticked **Total** counts the new Metric from the period of **A day in the first period it counts**, today's to begin with. Earlier totals stay as they were. From then on a period of the Total is shown only to people who also see the new Metric.
- An **open** Total starts unticked: ticking it puts the new Metric's numbers inside the sums that people who do not see it can read. If a Total is opened while you look at the check, your tick is dropped and the Total is listed again.
- **Left to do by hand:** what Ziffr does not change, such as a Workflow, dashboard or Total of someone else, a Workflow step that names the new person's Position, or a Share the Pack proposes of something made before.

Nothing else made before changes. Removing a line is not automated: archive its Metrics. For a Metric that a Total counts, archiving asks up to which period it counts, and earlier totals stay.

When Set up has made Metrics that take values, its result page offers **Fill from n8n** for them: the same download as under a Metric's **Who submits**, for all those Metrics at once, with a starter sheet naming each Metric's slug. When the Pack says which template fills which of its entries, the page reads "HR Pack says Google Sheets can fill Headcount, Attrition" with the template already chosen, one button per template. Metrics computed from others are left out, since they take no values.

What it makes are ordinary Metrics, a dashboard and a Workflow, as if you made them by hand: each counts towards the limit, is in the Audit Log, and stays as it is whatever happens to the Pack later. A Metric remembers the Pack's entry it came from. The same holds for a Metric you start from a Pack's entry under **New metric**: it gets the entry's Tags, and the Metric's page says if a limit kept some off.

## From the Marketplace

When an Installation Admin turned on the Marketplace connection, Owners and Admins see **From the Marketplace**. It shows the newest free Packs as soon as the page opens, in two parts: **From Ziffr**, the Packs published under `ziffr/`, and **Community**, everyone else's. A search by a word narrows both. A Pack says **New creator** while its creator has published only recently (or a report against them was upheld), and **Installed, version …** when your Workspace has it already, also when it came with Ziffr or from a file.

Choose **See what it adds** to open a Pack's [Preview](#ziffrs-own-packs), drawn with Sample Data. Ziffr first checks that the Marketplace signed exactly that file; a file that fails is not shown. The Preview says who published it, **Checked by program**, and **No person reviewed it** unless one did. It needs no warning about where it came from; texts aimed at assistants are still listed and need a tick. Installing works as from a file.

Opening the page asks the Marketplace for the newest Packs from your server; a search sends the words you typed, and opening a Pack names it and its version. Nothing about your Workspace or you is sent. Once a day Ziffr asks which installed Packs have newer versions; an installed Pack with one shows **Version … on the Marketplace…**, which shows what an update changes before it is done.

## Reporting a Pack

While the Marketplace connection is on, a Pack from the Marketplace shows **Report this Pack**, on its Preview and under it in **Installed in this Workspace**. It opens the Marketplace's report form in a new tab, with the Pack and version filled in. The Marketplace is not told which page you came from, and your Ziffr server sends nothing: what you write there goes to the Marketplace from your browser. Use it for content that is illegal, that uses someone else's work or name, that is harmful or misleading, or spam. Reporting changes nothing in your Workspace; to remove a Pack, uninstall it.

## A withdrawn Pack

A Marketplace can withdraw a Pack, for example when it copied someone's work or turned out to mislead. Ziffr learns this with its daily question about newer versions, which it asks when an Owner or Admin opens the Packs page. The Pack in **Installed in this Workspace** then says **Withdrawn from the Marketplace**, with the reason and **What you installed stays as it is.** Everyone who sees the installed Packs sees the line. Nothing is removed or changed: your Metrics, templates and Themes stay. No update is offered, and the Pack cannot be installed from the Marketplace again. If you no longer want it, **Uninstall…** it as any other Pack. Ziffr believes a withdrawal only when the Marketplace signed it. The line goes when an answer carries the Marketplace's signed word that it takes the withdrawal back; an answer that merely says nothing about the Pack changes nothing.

## Updating a Pack

Owners and Admins see **Update from a file…** on each installed Pack (an Owner, when it holds Themes). Choose the newer file: its version must be higher than the one installed. Ziffr checks the whole file and lists every item with what the new version does to it (added, changed, removed or the same) and what happens here:

- an item nobody changed is replaced by the new version;
- an item you changed, such as a renamed Dashboard Template or an edited Theme, stays as you made it, and the new version is offered beside it;
- an item the new version drops is removed, or kept without being marked as from the Pack when you changed it or something uses it;
- an item you removed is not added again.

When the new version has another logo, or none, the update page says **The logo changed** and shows the old and the new one side by side. A Theme nobody changed here gets the new logo with the replacement; one you changed keeps what it has, and a logo you set yourself is never replaced, also when you take the new version. Where you removed the Pack's logo, it stays removed.

A new major version, such as 2.0.0 after 1.4.0, says first that it may change how things look or work. Confirm the same warnings as when installing and choose **Update to …**. The update happens whole or not at all, and the Audit log records it. Metrics, dashboards, decks and Workflows made from the Pack never change.

**New versions offered**, at the top of the page, lists the items you changed that have a newer version waiting. **Take the new version** replaces yours with it; yours stays in its **Versions**, so you can bring it back.

## Uninstalling a Pack

**Uninstall…** first lists what goes and what stays. It removes every item nobody changed and nothing uses. It keeps, no longer marked as from the Pack, every item you changed and every Theme a dashboard, a deck or the Workspace's default uses. Metrics made from its catalog entries, and everything else made from the Pack, stay as they are. When a kept Theme still shows the Pack's logo, the window says so and offers **Also remove the author's logo from this Theme**, ticked by default: the Pack that brought the logo is gone. A logo you chose yourself always stays. The Audit log records it, with how many Themes lost the logo.
## Export as Pack

**Export as Pack…** is for everyone but Guests. Pick Metrics, Metric Catalog entries from Packs, Dashboard, Deck and Workflow Templates, View Designs and Themes; name the Pack, give it an id such as `northwind/saas-metrics`, a version, a summary, an author and a license; then choose **Next: describe it**, and **Download Pack** (see [Describe your Pack](#describe-your-pack)). The file holds descriptions and layouts, never a value or a person, and only Metrics you see. **How it is calculated** goes with each Metric, on one line and up to 1,000 characters; a longer one, or one with a web address, is left out whole and listed, and the Metric still goes in. A Pack with such a text is read only by a Ziffr that knows it; an older one says which formats it reads. Tags of the Metrics you pick go in too, up to 5 per entry and only Tags you see on those Metrics, never a Tag of a Metric you did not pick; untick **Carry the Tags of the Metrics you pick** to leave them out. Anything a Pack may not hold, such as a description with a web address or a drawing on a slide, stays out, and the window lists it with the reason.

The **Author** starts as your name; change it to your company's if the Pack is theirs. It is the publisher the Pack is shown with. Under **Logo (optional)** you can take the logo of one of your Themes or upload a picture (PNG, JPEG or plain SVG, at most 128 KB and 512 pixels on a side); the window shows it in a box, as the Packs page will. Themes that use that logo carry it into the Pack; a Theme with another logo keeps it out of the file, and the window says so. Use only a logo you may share: it stays yours, and the Pack's license does not cover it. See [Writing a Pack](../guides/packs.md) and [For creators](../guides/pack-creators.md).

### Describe your Pack

The second step asks **Where the numbers come from** and writes the Pack's [guide](#a-packs-guide); whoever gets the file reads both before installing and afterwards in Help.

For each number that takes values choose **Ask a person** (chosen to begin with, or what the installed Pack it came from said), **Another system sends it**, with the **Kind of system** such as CRM, or **Set once as a target**; add a short note if it helps. [Calculated numbers](#where-a-packs-numbers-come-from) are not asked. A Pack with Metrics is therefore made in the newer format, which older versions of Ziffr do not install.

The guide is optional.

There is a field for each section: **What it's for**, **Before you start**, **First steps**, **Each part** and **Questions**. **Each part** starts with the names of what goes into the file, and only those: write beside them what each does, or replace them. A field you leave empty leaves its section out. When you go back and change what goes into the file, the list follows, unless you changed the field.

| You write | The guide shows |
| --- | --- |
| A line | A paragraph |
| `- ` before a line | An entry of a list; an empty line starts a new list |
| `1. `, `2. ` before lines | Numbered steps; `1.` after an empty line starts anew |
| `# ` before a line | A heading, at most 80 characters |
| `**` before and after words | Those words **bold** |

**Put this guide into the Pack** decides whether the guide goes into the file. It ticks itself as soon as you write in a field, and you can tick it to take the list as it is. Without it, or with every field empty, the Pack has no guide. A Pack with a guide, or with Metrics, needs a Ziffr that knows the newer format.

A guide holds no link, web or email address, image, HTML or code, a paragraph or list entry has at most 600 characters, a list 20 entries, a section 60 headings, paragraphs and lists, and the whole guide 32,768 bytes. **Download Pack** names what does not fit under its field, with the line, and makes no file until it is changed.

When what you picked came from an installed Pack that has a guide, or the id you gave is that Pack's, the step offers **Use its guide**: it fills the fields with that guide, for you to change. The words are their author's, so take them over only if you may.
