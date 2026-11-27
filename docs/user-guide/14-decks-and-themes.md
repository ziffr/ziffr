<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/decks/**, apps/web/src/app/themes/**, apps/web/src/decks/**, apps/web/src/canvas/**, apps/web/src/components/theme-picker.tsx, apps/web/src/components/theme-scope.tsx -->
# Decks and Themes

A **Deck** is a set of slides you build from your Widgets, text, arrows and shapes. You can present it in Ziffr, or export it as PowerPoint or PDF for a board meeting. A **Theme** decides how your dashboards and decks look: colours, fonts, cards and what every slide shows.

Open **Decks** in the sidebar. Owners, Admins and Members can make decks. Guests only see decks that someone shared with them: they get no **New deck** and no **Themes** link, and an empty list says "Nothing has been shared with you yet. Ask whoever invited you." The **Themes** page opens from the **Themes** link on the Decks page, or next to the theme picker on any deck or dashboard. Everyone can look at it, but only Owners and Admins change themes.

If slides show the notice **Slides and free layouts cannot be shown here**, this Ziffr has no license key that the slide editor accepts. The person who runs it can [add one](18-installation-settings.md#slide-editor); the notice gives them a link there, also where the Installation settings have an [address of their own](18-installation-settings.md#an-address-of-its-own).

## The Decks page

The page lists every deck you made and every deck someone shared with you. Each card shows the deck's name, how many slides it has and when it was last changed. On a deck from someone else, the card also says who it is from and what you may do: "you can edit it" or "you can present it".

- **Open a deck** by choosing its card. If you may change it, the deck opens in the editor. If you may only present it, it opens for presenting.
- **Make a new deck**: type a name in **Name of the new deck** and choose **New deck**. The deck opens in the editor and starts with one title slide.
- **Make a deck from a Deck Template**: choose **From a Deck Template**, pick a template, and pick a Metric for each of its Slots, once even when several slides show it. The button shows when your team has saved a Deck Template. The new deck is yours: it starts with the template's slides, whose values are [filled each time a slide is shown](#live-values-in-text-boxes), and the template's Theme if the Workspace still has it. Changing the deck never changes the template.
- **Make a deck from a dashboard or a Snapshot**: on a dashboard, open the **⋯** menu and choose **Make a deck…**; on a Snapshot, choose **Make a deck…**. A panel asks which numbers the deck shows (see [Live numbers or a Snapshot's](#live-numbers-or-a-snapshots)).

If you follow a link to a deck that is not shared with you, Ziffr says "This deck isn't shared with you" and lets you ask its owner for access.

## Live numbers or a Snapshot's

**Make a deck…** offers two kinds of deck, and you choose one before it is made:

| Choice | What you get | The default on |
|---|---|---|
| **Live numbers** | A title slide with the dashboard's name and introduction, then one slide for each Widget of the dashboard as it is now, in its reading order, titled with the Widget's own title or else its Metric's name. You can change the Widgets, and their numbers change as values are recorded or corrected. | a dashboard, and a Snapshot that is still a draft |
| **A Snapshot's numbers** | A slide with the Snapshot's opening part (the dashboard's name, the period and the introduction), then one slide for each part of the Snapshot. The numbers never change. The deck is named after the dashboard and the period. | a Snapshot that has been shown |

From a dashboard you pick which Snapshot; only Snapshots that have been shown are offered. While there is none, the panel says to take one and show it.

### Adding a Snapshot to a deck

On a Snapshot that has been shown, **Add to a deck…** puts its slides at the end of a deck that exists: pick a deck you own or may edit, or **New deck**. Nothing already on the deck changes. You need to be able to create things in the Workspace (Guests cannot) and to open the Snapshot; any role on its dashboard is enough. Parts you may not see are left out, and Ziffr says how many. Adding the same Snapshot twice adds it twice. A deck holds at most 100 such parts from at most 20 Snapshots.

### Slides that keep numbers

Each of these slides holds a **Snapshot Part**: one part of the Snapshot. A line says whose numbers it shows, such as "Numbers as of 5 Oct 2026 · Sales, Q3 2026" (the day the Snapshot was taken). It is shown in the editor, when presenting, and in PDF and PowerPoint.

- **The numbers stay.** Values, Targets, comparisons, Breakdowns, Projections and figures computed from them are what the Snapshot kept. A value corrected or recorded later, a changed target or a new start of the Fiscal Year changes nothing on the slide. How numbers are written follows the Workspace's Number Style, and colours and fonts follow the deck's Theme. If a value was corrected since, the line adds "Corrected since: see the Snapshot".
- **The words follow the Snapshot.** Titles, headlines and the introduction are the Snapshot's words as they are now. Change them on the Snapshot, not on the deck; you can move, resize and delete a part.
- **Everything on such a slide keeps numbers.** A Widget or Slide Element you add to it, and the [live values of a text box](#live-values-in-text-boxes), draw the Snapshot's numbers too, never live ones; a text box whose Snapshot does not give you all its Metrics leaves its values empty. For a live number, use another slide. Moving a Widget or text box off the slide, or deleting what keeps it there, makes it live again; you can only save that when you see its Metrics.
- **Each person sees only what the Snapshot would show them.** Sharing the deck opens none of it: someone sees a part only if they may open that dashboard, the Snapshot is shown, and they may see every Metric the part draws. Otherwise the slide says "This part is not available to you." (or, for a Widget or element beside a part, "These numbers are not shown to you: this slide keeps a Snapshot's numbers."). To let an audience see the parts, ask each dashboard's owner to share it with them.
- **A deleted Snapshot takes its numbers with it.** Its parts say "This Snapshot was deleted." to whoever may open the dashboard. To change a number, the dashboard's owner deletes the Snapshot and takes it again; then add the new one.
- **Not carried elsewhere.** View Links leave these parts and numbers out; send an exported file to someone outside. Slide layouts, Deck Templates, Packs and the Workspace Export keep no parts, and a part cannot be placed on a dashboard or in a free layout.

Decks made from a Snapshot before decks kept numbers stay as they were: their numbers are **live**, drawn for the periods complete by the Snapshot's last day. The editor says so above the deck, and each such slide says "Live numbers, periods up to" that day, also when presenting and exported.

If two people edit a deck at the same time, the last save wins. Let one person add the Snapshots to a deck others are working on.

## The deck editor

The editor is made for a larger screen. On a phone a note at the top says "This is easier on a larger screen." and offers **Send me the link** and **Look at it**, which presents the deck (see [Screens made for a larger screen](07-getting-started.md#screens-made-for-a-larger-screen)); the editor stays below it, fits the width and can still be used, with a shorter canvas so the page scrolls around it.

A deck that came in with a [Workspace Export](16-workspace-settings.md#from-a-workspace-export) starts empty. The first time you open it, the editor lays out its slides, as for a deck made from a Deck Template, and saves them.

The editor has three parts: a row of buttons at the top, a side panel on the left, and the deck canvas, where your slides sit.

Changes save by themselves a moment after you make them. Next to the deck's name you see **Saved**, **Saving…** or **Unsaved changes**. To rename the deck, click its name at the top and type. On a narrow screen the buttons move to a second line before the name is cut short.

The panel of colours, sizes and fonts opens at the top right of the canvas only while something is selected or a drawing tool such as the rectangle is chosen; with nothing selected the slide stays clear.

### The buttons at the top

| Option | What it does |
|---|---|
| **+ Slide** | Adds a new slide at the end. Pick a layout (see below) or one of your team's layouts. |
| **Element** | Adds a [Slide Element](#slide-elements) to the slide you are looking at: words or a chart that follow the deck's Theme. |
| **Present** | Shows the deck one slide at a time, filling the screen. On a phone **Look at it** in the note at the top does the same. |
| **Share** | Opens a panel on the right to share the deck with people or Groups. Only the deck's owner sees this button. |
| **Export** | Opens a menu: **PowerPoint** downloads the deck as a PowerPoint file, **PDF** prepares a PDF to print or save. |
| **⋯** (More for this deck) | Opens a menu with the rarer things, below. |

The **⋯** menu holds:

| Entry | What it does |
|---|---|
| **Theme…** | Chooses the deck's Theme. **(team default)** follows whatever theme the team uses by default. |
| **Who can see this** | Opens a panel on the right that lists everyone who can open the deck, and why. |
| **View links…** | Opens a panel on the right to make a link for someone outside the team. Only the deck's owner sees this entry. |
| **Versions** | Opens a panel on the right with earlier states of the deck, and lets you go back to one. |
| **Save as Deck Template…** | Saves every slide as a team Deck Template (see below). Only the deck's owner sees this entry. |
| **Delete…** | Below a rule, in red. Deletes the deck after you confirm: its slides, Shares and View Links go with it. Widgets and Metrics stay. Only the deck's owner sees this entry. |

**Group** and **Ungroup** are in the side panel, in a box that shows while something selected can be grouped or ungrouped. They keep several selected things on one slide together, or split a group again. Only things on the same slide can be grouped. The shortcuts are Ctrl+G and Ctrl+Shift+G (⌘G and ⌘Shift+G on a Mac).

### Slide layouts

**+ Slide** offers these layouts. Each one only places starting text, which you can change or delete.

| Layout | What you get |
|---|---|
| **Title slide** | A title and a subtitle. |
| **Title and content** | A title over one large area for a Widget. |
| **Two widgets** | A title over two side-by-side areas. |
| **Section header** | One large line that opens a section. |
| **Blank** | Nothing but the slide. |

Below them, under **Team layouts**, you find slides that people in your team saved (see [Saving a slide as a layout](#saving-a-slide-as-a-layout)). Each shows who made it. If a team layout has Slots, Ziffr first asks which Metrics should fill them. Its values are then [filled each time the slide is shown](#live-values-in-text-boxes).

### Slides and their order

A **Slide** is one 16:9 page of the deck. New slides go below the last one. You can drag slides around on the canvas like any other object.

The order of the slides is their position on the canvas: left to right, then top to bottom. That order is used when you present, when you export and for the slide numbers. To move a slide earlier, drag it above or to the left of the slide it should come before.

### Adding Widgets

The **Pool** on the left holds the Metrics you can see, your saved Widgets and the Widget Templates. Drag one onto a slide, or choose **+** next to it to add it to the slide you are looking at. It lands in the first free space on that slide, next to what is already there; if the slide is full, it is made smaller to fit.

- A Metric dropped on a slide becomes a line chart. You can change that afterwards.
- A Widget Template asks for its Metrics first.
- A Widget shows live numbers: whenever a new value arrives, the slide shows it (except on a [slide that keeps numbers](#slides-that-keep-numbers)). A Widget's title may use Placeholders such as {latest} and {change yoy}, which fill in from the same numbers, on the slide and in the PowerPoint export.

You can only place Metrics you may see. Everyone you share the deck with can see the Metrics its slides draw live, in Widgets, Slide Elements and the values of text boxes; what a slide keeps from a Snapshot is not opened by the share.

From a dashboard or a story, without opening the deck first: open a Widget's or a Finding's **⋯** menu and choose **Add to…** → **Deck…**. A panel opens beside the page: pick a deck you own or may edit (or **New deck**), then a slide, or **New slide at the end**, which gets the Widget's name as its title. The deck opens on that slide with the copy in the first free space, and is saved. A deck you may only view is not offered. Only your own choice in the menu adds it, once: opening the deck again, or a link someone sends you, adds nothing.

### Slide Elements

A **Slide Element** is a part of a slide that draws itself in the deck's Theme: change the Theme and its colours and fonts change with it. Choose **Element** at the top and pick one:

| Element | What it shows |
|---|---|
| **Words** | Text in a Theme colour and font, such as a headline. It can have a lead-in in its own colour, such as "Ask for the meeting:". |
| **Box** | A rectangle in a Theme colour, to put behind other things. |
| **Figure** | A Metric's latest value, large, with a label and a line under it. **Emphasised** puts it on the Theme's cover colour. |
| **Column chart** | A Metric period by period (a weekly Metric: the weeks of the quarter so far). A second Metric can fill part of each column, such as what is closed of what is committed, and a third can draw a line across, such as the quota. |
| **Gap table** | The latest breakdowns of two Metrics row by row, such as commit and quota by salesperson, with the difference as bars. Both need a breakdown for the same period with the same lines. It can carry a headline above it and a closing line under it, which move with the table however long the headline is. With [one Total](#gap-table-of-a-total) it shows a row for each Metric the Total adds up instead. |
| **Metric table** | One row per Metric: this period, the one before, the change, a small trend, and whether it is on target. |
| **Definitions** | For an appendix: each Metric with its description and **How it is calculated**, as they are today. Up to 12 Metrics; the letters get smaller to fit, from four Metrics on in two columns, and what still does not fit is counted as "and 3 more" (use a second element on another slide). On a View Link only the names are shown, because neither text leaves the Workspace. A Metric the viewer may not see is left out, name and all |
| **Numbered list** | A heading with numbered rows, such as an agenda. One row per line; text after \| stands at the right. |
| **Logo place** | The Theme's logo. While the Theme has none, a dashed box with words such as "Your logo", also when presenting and exporting; delete it if you want neither. |
| **Cover art** | Rings and a rising line, for a cover. |

Select an element to change its words, colours, size and Metrics in the side panel; drag it or its corners to move and resize it.

**You pick every Metric.** A new element has none, and Ziffr never chooses one for you, because whoever the deck is shared with, and whoever opens its View Link, sees what is on the slide. A Figure, Column chart, Gap table, Metric table or Definitions reads **Pick a Metric** until its Metrics are chosen under **Metrics**; **Add a Metric…** adds one more. When you switch on a column chart's filled part and it already has a reference line, pick the line's Metric again after the part's. An element with a Metric still to pick is left out when a deck is saved as a file or put in a Pack.

#### Gap table of a Total

Tick **One Total: a row for each Metric it adds up, against its target** and pick the [Total](10-metrics.md#adding-up-metrics-a-total) under **Metrics**, such as the team's commit. The tick is offered once you see a Total. The table then shows, for the latest period one of those Metrics has a value in:

- one row for each Metric counted in that period, with its target for the period (its Target Series value, else a Target Range with one number), its value and the gap, the largest surplus first. The column of targets is headed **Target**, or what you type under **Heading of a Total's targets**, such as Quota;
- "–" for a Metric with no value yet, and no gap for one without a single target number;
- at most 30 rows; the rest are counted below the table.

Where the names begin alike up to a comma, as "Commit, Anna" and "Commit, Ben" do, that beginning heads the column and each row shows the rest.

Each person gets the rows of the Metrics they see, with the line "Other Metrics of this Total are not shown to you." where there are more. Nothing is added up from the rows; the Total's own figures elsewhere on the slide follow the [rules for who sees its numbers](10-metrics.md#who-sees-its-numbers). A **View Link** shows rows only for Metrics the deck shows in some other part too, and a slide that keeps a Snapshot's numbers has no rows. Saved as a Deck Template or put in a Pack, the table keeps reading one Total, which its Slot takes.

**Words that stay current.** An element fills its words from the data every time the slide is shown, from the Metrics listed under **Metrics** in the panel. {metric 2} or {latest 2} means the second of them.

| Placeholder | What it becomes |
|---|---|
| {latest}, {metric}, {period}, {target}, {change yoy} | As in [Words that fill themselves in](12-dashboards.md#findings). |
| {change} | The change on the period before, in the Metric's unit, such as +0.12 M€. |
| {difference 2 3} | The second Metric minus the third, for the second one's latest period. |
| {left 2 3} | What is left of the second Metric after the third, never below 0, such as what is still to close. |
| {gap 2 1} | The second Metric against the first: "0.19 M€ short", or "0.18 M€ above quota". |
| {quarter}, {quarter week}, {quarter weeks}, {weeks left} | The quarter of the latest week ("Q4"), the week's number in it, how many weeks it has, and how many are left ("five weeks"). The number and the weeks are for weekly Metrics. |
| {scale} | The unit the element writes in, such as M€. |
| {slide} | The slide's page number. |

While a value is missing, words show their line **While a value is missing** instead, if they have one, and a Figure leaves its line out. Large values are written short: from a million as "3.01 M€", from ten thousand as "640 k€". Whoever may not see one of an element's Metrics gets none of its figures, and no name or value of it.

### Text, arrows, shapes and images

The toolbar at the bottom of the canvas has the tools for text, arrows, lines, shapes, sticky notes and free drawing. Text and lines start in plain type with solid lines.

You can paste or drop an image file onto a slide. Links cannot go on a slide: Ziffr shows "Links can't go on a slide", because a link would load from another site every time the slide is shown. Paste or drop the image itself instead.

### Live values in text boxes

Text typed with the toolbar, the words in a box or a note and an arrow's label can show live values, filled each time the slide is shown: in the editor, when presenting, on a View Link and in PDF and PowerPoint.

Choose **Insert value** at the top. With one text box selected, the value goes to the end of its words (or to the cursor while you are typing in it); with none, a new text box appears on the slide you are looking at. A panel opens beside the slide:

| Field | What it does |
|---|---|
| **Metric** | Which Metric. Ziffr never chooses one for you: whoever the deck is shared with, and whoever opens its View Link, sees it. |
| **What to show** | **Value** (the latest), **Name**, **Period**, **Target**, **Change** (since the period before, in the Metric's unit), **Change in %** (such as "up 4.0 %"), **Change on a year before**, or **Difference** to a second Metric. |
| **Compared with** | The second Metric of a **Difference**. |

While the box is selected it shows its words with the **Placeholders** in braces that stand for the values, such as {latest} or {change prev 2}; click elsewhere to read the values. The panel on the left shows what the box **Reads now** and which Metrics it takes them from. Delete a Placeholder and its value is gone, with the Metric if nothing else in the box asks for it. You may also type the words in braces from the [table above](#slide-elements) into a box that already holds a value; a number names the box's Metrics in the order you inserted them. One text box names 9 Metrics at most. Words in braces in a box without an inserted value stay as written.

- **Each person reads only what they may see.** Someone who may not see one of a box's Metrics gets no name and no value of it: its place stays empty. A View Link leaves out a whole text box that names a Metric the link does not show.
- **Saving checks them.** You can only add a Metric you may see.
- **Older decks keep their words.** Words that were filled in when a slide was made from a template or layout stay as they are. Replace them with **Insert value** to keep them current.

### The side panel

What the side panel shows depends on what you have selected.

**A Widget selected.** The **Visualization** list changes how the Widget draws its Metric, with the same choices as on a dashboard. The note below it reminds you which ones become editable charts in PowerPoint. A Widget drawn by one of the Workspace's View Designs keeps its design on the slide, titled by the design's name when it is an Analysis. When the Widget is a **Finding**, its editor opens below, so you can change its headline, words and panels.

**A slide selected.** Click the edge or the name of a slide to select it.

| Option | What it does |
|---|---|
| **Hide logo, footer and number on this slide** | Leaves this slide without the logo, footer and slide number that the Theme puts on every slide. Useful for full-bleed title or image slides. |
| **Cover slide** | The slide shows no logo, footer or number of the Theme and is not counted in page numbers. |
| **Save slide as layout…** | Saves this slide for the whole team (see below). |

**Always shown: Footer on every slide.** Type a footer for this deck only, such as "Board meeting, confidential". Leave it empty to use the footer of the deck's Theme. The logo, slide numbers and type sizes always come from the Theme.

A slide with a **Logo place**, a page number ({slide}) or a **Footer line** of its own does not show the Theme's second copy of it. A words element marked **Footer line** shows the deck's footer after its own words.

### Saving a slide as a layout

Select a slide and choose **Save slide as layout…**; a panel opens beside the slide. Snapshot Parts are left out, and the panel says so. Give it a name and, if you like, a description. The Metrics on the slide, those of its text boxes' values too, become Slots, so others can fill the layout with their own Metrics. Everyone in the team can use the layout from **+ Slide**, under **Team layouts**. Only you can change it.

A layout is read by the whole team, so numbers and Breakdown rows typed into its text boxes are left out and written as "…". The panel lists them; tick **Keep the numbers and row names typed into text boxes** to keep them as typed. Values you added with **Insert value** are not typed words and stay live.

### Saving a deck as a Deck Template

A **Deck Template** keeps a whole deck: every slide with its Widgets, words and boxes, with the Metrics left open as Slots. Choose **Save as Deck Template…** at the top; a panel opens beside the deck. A Metric shown on several slides becomes one Slot, which you can name, such as "Revenue". The Metrics of text boxes' values become Slots too, and numbers and Breakdown rows typed into text boxes are left out unless you keep them, as for a [layout](#saving-a-slide-as-a-layout). Its name in the words becomes {metric}; in the words of a [Slide Element](#slide-elements) this happens for the Metrics listed on that element, and any other name stays as you typed it. Notes tied to one period or row can follow a rule instead, or are left out, as for a layout. Images and links stay behind. You can do this for a deck of your own once it is saved, when you see every Metric on it. Everyone in the team can then start a deck from it on the Decks page; only you can change or replace it.

## Presenting

Choose **Present** to show the deck one slide at a time, filling the screen, with live numbers and, on slides that keep them, the numbers of their Snapshot as you may see them. Nobody can change the deck while it is presented.

- **Next slide**: the right arrow, down arrow, Page Down or the space bar, a click on the right part of the slide, a swipe, or **›** at the bottom.
- **Previous slide**: the left arrow, up arrow, Page Up, a click on the left part of the slide, a swipe, or **‹**.
- **First and last slide**: Home and End.
- **Full screen**: the button at the bottom right; a browser that cannot do it, such as Safari on an iPhone, does not show it. **Stop presenting** (the **×**) or Escape takes you back to the editor, or to the Decks page if you may only present the deck.

The bar at the bottom shows the deck's name and which slide you are on, such as "3 / 12".

On a phone held upright the slide is as wide as the screen, the deck's name stands above it and below it Ziffr says "Turn your phone sideways for a larger slide, or pinch to zoom." While you are zoomed in, a finger moves around the slide; zoom out to swipe between slides again.

People you shared the deck with as Viewers always open it this way.

## Exporting to PowerPoint and PDF

An exported deck is a **Snapshot**: it holds the values its Widgets show at the moment you export. Every slide carries the stamp "Data as of" and that day's date, so readers know how old the numbers are, except a [slide that keeps numbers](#slides-that-keep-numbers), which carries its "Numbers as of" line instead. The file holds what you may see: a part you may not see is exported as its sentence. A file you have exported keeps its numbers, also after the Snapshot is deleted or unshared. The deck in Ziffr stays as it is.

Slides are exported in their order on the canvas. Each export is noted in the workspace's Audit Log.

Widgets in a deck that show condensed periods (see Dashboards, Show by) draw them as the app does, with points such as "October 2023, condensed from 31 days"; a Snapshot or deck keeps what it showed.

### Export PowerPoint

Choose **Export PowerPoint**. Your browser downloads a file named after the deck.

- Text, shapes and arrows become normal PowerPoint objects you can edit.
- Line and bar Widgets, and Findings with ranked bars, become real PowerPoint charts you can edit. Their values are rounded to the Metric's decimals the way Ziffr shows them: 1.005 at two decimals is 1.01.
- Number Widgets become text, and history tables become tables. Values are written as in Ziffr, in the Workspace's Number Style with the Metric's unit. Under the value stands the Widget's first comparison, exactly as the Widget shows it, such as "vs prev. +4.2 %". When the Widget shows "n/a", for example because the period before has no value, the slide shows no change.
- Chart values are rounded to the Metric's decimals and labelled with its unit, a negative one with the minus sign "−" as in Ziffr. PowerPoint writes their digits the way the computer that opens the file does. The values behind the chart stay plain numbers, so editing its data in PowerPoint works as usual.
- A Widget shown by quarter or year (**Show by**, see the Dashboards chapter) exports the same quarters or years, with the one still running labelled "to date", and a past one that lacks some of its values labelled "only 2 of 3 months" (shown without a change against it).
- Gauges, analyses, a bridge and a range, and everything else go in as pictures, with the numbers the Widget shows. Ziffr decides this from what the Widget's View Design draws, so a View Design your Workspace added becomes an editable chart, text or table by the same rules: a single line or bars of the values, the latest value with its period, or a list of values.
- The Theme's background, logo, footer and slide number are set up once for the whole file, so changing them in PowerPoint changes every slide.
- The Theme's fonts are named so PowerPoint can find them. If a computer does not have a font, PowerPoint uses a similar one.

### PDF

Choose **PDF**. Ziffr opens the deck in a new browser tab and starts printing. Choose "Save as PDF" in the print window to keep a file. Each page shows "Data as of", the date and the slide number; a page of a slide that keeps numbers shows its own line instead of the date. If nothing opens, allow pop-ups for Ziffr in your browser.

If an export fails, Ziffr says "Export failed". Try again, or remove the last thing you added.

## Sharing a deck

Sharing a deck works like sharing a dashboard. [Dashboards and Findings](12-dashboards.md) explains Shares, View Links and Versions in full. In short:

- **Share** gives people or Groups a role on the deck. A **Viewer** can present it. An **Editor** can also change its slides, name, footer and Theme. Only the owner shares the deck and makes View Links.
- **Who will not see what.** On a deck with [slides that keep numbers](#slides-that-keep-numbers), the Share panel says under each person and Group, before and after you share, such as "Cannot see 3 Snapshot Parts (Sales, Q3 2026). Ask the dashboard's owner to share it." A Group is listed when any member cannot. The panel names only what you may see yourself, and counts other parts without saying what they are.
- **Invite someone…** at the bottom of the Share panel invites a person who is not in the Workspace yet, by email, as **Member** or **Guest**; only Owners and Admins see it, others are told "Ask an Owner or Admin to invite them".
- **View link** lets someone outside the team watch the deck slide by slide, without signing in. Under **For**, say who it is for; under **Works until**, choose when it ends (at most 90 days ahead). Tick **Freeze today's numbers** to keep the values as they are now; otherwise the link shows live numbers until it ends. A View Link shows no Snapshot Part and nothing of a slide that keeps numbers; the panel says how many are left out. You can copy or revoke each link.
- **Versions** keeps earlier states of the deck. Going back to one makes a new version.

## The Themes page

The page shows every Theme of the Workspace on the left. The one marked **team default** is used everywhere a dashboard or deck has not picked another. Choose a theme to see and change it.

Below your Themes, **Standard Themes** lists the six that come with Ziffr: Ziffr Light, Ziffr Dark, Tokyo (dark, vivid colours), Paris (warm, serif headlines), Oslo (cool and restrained) and Print (black on white, for PDF and PowerPoint). Choose one to see it on real Widgets, then **Add to this Workspace**: it becomes a Theme of your own, which you can pick for dashboards and decks and change like any other. Every standard Theme keeps text readable on cards (WCAG AA) and keeps Good and Bad apart for people with red-green colour blindness. A standard Theme you added never changes when Ziffr improves the original.

On the right, a preview shows a sample slide and real Widgets drawn with the first Metrics you can see, so you judge a theme on what it will really show. The preview changes as you edit, before you save. When the Theme has a dark variant, **As designed** and **In a dark Appearance** above the preview switch between the two.

If you are not an Owner or Admin, the page says "Only owners and admins of the workspace change themes. You can pick one for your dashboards and decks." You can still look at every theme and its Versions.

### Outside the app

The team default Theme also dresses what Ziffr sends and shows outside the app (it is not the same as a person's **Appearance**, which only changes Ziffr's own screens):

- **Emails** (Prompts, reminders, Alerts, invitations, the usage digest, Share Proposals) get the Theme's logo or the Workspace's name, a bar in its accent, its footer and its fonts, in a layout that stays readable when the reader's mail app is dark. Only a PNG or JPEG logo of up to about 150 KB is attached; for any other, the Workspace's name stands in its place. The plain text is always sent too. Links never show as long addresses: the main one is a button, such as **Open your form** or **Open in Ziffr**, in the Theme's accent; the others are a few words, with the unsubscribe link at the foot of the email. A link in words a person wrote shows where it leads, as the site's name and the start of the rest, and never becomes a button. In the plain-text version every link Ziffr added stands whole on a line of its own, between angle brackets. The brand never replaces Ziffr's own identity: the From name is always "<Workspace> via Ziffr", and the footer always says "Sent by Ziffr for …"; in an invitation or a shared dashboard it names the person who sent it and their email address. Sign-in emails are never branded.
- **The form link** and **View Link** pages show the logo or name under a bar in the accent (see [The personal form link](10-metrics.md#the-personal-form-link) and [View Links](12-dashboards.md#view-links)).
- **Slack** messages get a side bar in the accent. Block Kit has no other colours.

Every colour is checked for contrast (WCAG AA) when it is used: an accent that is too pale to read on the cards is replaced by a darker shade of it. Under the sample Widgets, the **Email** preview shows the layout in light and dark colours and changes as you edit. A Theme that came with a Pack may show the Pack's logo; **Make team default**, and picking it for one dashboard or deck, then asks once, naming whose logo it is, because the team default also dresses your emails, forms, View Link pages and Slack messages. Installing a Pack never makes a Theme the team default. A logo may be at most 256 KB and 512 × 512 pixels, as a PNG, JPEG or SVG (not WebP); Ziffr refuses a bigger one. An SVG is accepted only when it is a plain drawing: one with a script, an event handler, a link to another site or embedded content is not kept.

### Name and colours

| Option | What it colours |
|---|---|
| **Name** | The theme's name, as shown in the theme picker. |
| **Behind the cards** | The background behind Widgets. |
| **Cards and slides** | The Widgets' cards and the slides. |
| **Text and values** | Text and numbers. |
| **Labels and axes** | Labels and chart axes. |
| **Lines and grid** | Lines and grid lines. |
| **Highlight** | Things picked out for attention. |
| **Good** | Values that are good, according to the Metric's Polarity. |
| **Bad** | Values that are bad. |
| **Target band** | The band that shows the Target Range. |
| **Data, first for single series** | Four colours for the lines and bars of charts. The first is used when a chart shows only one Metric. |
| **Cover**, **Cover text**, **Cover accent**, **Soft accent** (under **On slides**) | Used by [Slide Elements](#slide-elements): a dark panel, the words and accent on it, and a pale accent. Until you set one it is worked out from the colours above; **Auto** goes back to that. |

### In a dark Appearance

When someone's [Appearance](17-your-settings.md#appearance) is dark, dashboards and decks in a Theme can go dark with it. The setting **In a dark Appearance** (under the Cards option) decides:

| Option | What it does |
|---|---|
| **Follows the viewer's Appearance** | The default. Dark viewers see the Theme's dark variant, everyone else the Theme as designed. This also holds in Present mode. |
| **Always as designed** | The Theme looks the same for everyone: for brand decks, or when the Theme must show your colours exactly. |

Every Theme has a dark variant. The Standard Themes carry one that was designed with them (Ziffr Dark and Tokyo are dark already and look the same in every Appearance). For any other Theme, Ziffr works out a dark variant from its colours and checks it for contrast (WCAG AA); if that fails, the colours of Ziffr Dark are used. The note under the setting says which one a Theme has. Fonts, corners and cards stay as they are.

Snapshots, View Links and exports (PowerPoint, PDF) keep the look they were made or shared with, in whatever Appearance the viewer has. A Theme file holds the colours as designed; the setting is not part of it.

### Fonts and cards

| Option | What it does |
|---|---|
| **Headlines** | The font for headlines. |
| **Text** | The font for ordinary text. |
| **Figures** | The font for numbers. |
| **Corners** | How round the corners of cards are, from 0 to 16 pixels. |
| **Cards** | How cards are drawn: **Paper, soft shadow**, **Flat, hairline edge** or **Plain, no edge**. |

The fonts to choose from are General Sans, Inter, IBM Plex Sans, Libre Franklin, Source Serif, Playfair Display, Georgia, Arial, Geist Mono and IBM Plex Mono.

### Slides

These settings decide what every slide of a deck in this theme shows. A slide can hide them with **Hide logo, footer and number on this slide**, and a deck can set its own footer.

| Option | What it does |
|---|---|
| **Add logo** / **Replace logo** | Puts your logo on every slide. Use a PNG, JPEG or plain SVG of at most 256 KB and 512 × 512 pixels (not WebP). The bin icon removes it. |
| Logo position | **Top left**, **Top right**, **Bottom left** or **Bottom right**. Shown once there is a logo. A logo at the bottom left takes the footer's place, and a logo at the bottom right takes the slide number's place. |
| **Logo width** | How wide the logo is, from 40 to 400 pixels. |
| **Background image** / **Replace background** | An image behind every slide, filling it. Use a PNG, JPEG, WebP or SVG image under 2 MB. The bin icon removes it. |
| **Footer** | A line at the bottom left of every slide, such as "Company name, internal". |
| **Numbers** | Shows the slide number at the bottom right. |
| **Title px** | The size of slide titles, from 24 to 96. |
| **Body px** | The size of body text, from 12 to 48. |

The type sizes apply to new slides you add. Slides that already exist keep the size their text has.

### Saving and managing themes

| Option | What it does |
|---|---|
| **Save theme** | Saves your changes. Every dashboard and deck using this theme changes with it. |
| **Discard** | Throws away the changes you have not saved. |
| **Make team default** | Makes this theme the one used everywhere nothing else was picked. |
| **Duplicate** | Makes a copy of this theme. This is how you start a new theme. |
| **Export as file** | Downloads the theme as a `.ziffr-theme.json` file: colours, fonts, cards and slide settings, never a logo or an image. Open to everyone, and for standard Themes too. |
| **Import a Theme file** | Above the list of standard Themes. Paste a file or upload it; problems are shown with their line, and the file is checked again on Ziffr's side. **Add to the Workspace** makes it a new Theme. It is written in the Audit Log. |
| **Versions** | Shows earlier states of the theme and lets you go back to one. Open to everyone. |
| **Delete** | Deletes the theme after you confirm. Dashboards and decks that used it switch to the team default. The team default itself cannot be deleted: make another theme the default first. |

Only Owners and Admins see **Save theme**, **Make team default**, **Duplicate**, **Delete**, **Add to this Workspace** and **Import a Theme file**. A Workspace keeps at most 50 Themes. How to write a Theme file by hand, and how to share Themes as a Pack, is in the [Themes guide](../guides/themes.md).

Ziffr's own screens, such as menus, settings and this guide, keep their look whatever theme you pick; they follow your Appearance.

## Picking a theme for a dashboard or deck

Every dashboard and deck has a theme picker, shown with a palette icon. The first choice is the team default, shown with its name and "(team default)". A dashboard or deck on that choice follows the team default, even when the default changes later. Any other choice sticks to that one theme.

Whoever may change the dashboard or deck may pick its theme: its owner and its Editors. Viewers see it in the theme that was picked. The **Themes** link next to the picker opens the Themes page.

In the demo, where visitors may change it, a deck that the demo started fresh without sends you to its new copy.

In the demo, where visitors may change it, you may copy a Theme, add a standard one, shape it, pick it for your own dashboards and delete it. A Theme the demo came with keeps its colours and name, the team default cannot be changed, and no logo or background picture can be added.

In the demo, where visitors may change it, you may make decks of your own (new, from a dashboard, from a Snapshot, from a Deck Template, or with **Add to deck…** and **Add to a deck…**), lay out their slides, rename them, give them a footer and a Theme, name, save and restore their Versions, and save a deck as a Deck Template or a slide as a layout. Slides take plain words only: the demo refuses web addresses, email addresses and markup, and no picture, video or embedded page can be added. A deck may be up to 512 KB, and the demo holds a limited number of them at once. The decks the demo came with are kept as they are and say so ("Everyone sees this one as it is. Make your own to change it."). What you make is seen by every visitor who looks as the same made-up person and is gone when the demo starts fresh. Sharing, View Links and the PowerPoint and PDF files are not available in the demo. Where the setting is off the demo saves nothing, as before.
