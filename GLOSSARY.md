# Ziffr

The record of your numbers. Define any number you care about. Ziffr asks people for its values when they are due, or people and systems send them in on their own. Every value is kept with its history and the discussion about it, so people and AI assistants can look it up, share it and discuss it over time. For one person, a team or a business.

## Language

### Metrics

**Metric**:
A named, fully described number tracked over time. It must be defined before any value can be recorded for it.
_Avoid_: Number, KPI, measure, series

**Metric Description**:
Everything that defines a metric: name, description, unit and which side of the number it stands on, format, period, submission rule, sources, target range, polarity, how its Attainment is computed (or the Workspace's way), owner, its Tags and, for a derived metric, its formula.
_Avoid_: Settings, config, schema

**Period**:
How often a Metric has a value: a day, week, month, quarter or year. Weeks run Monday to Sunday; quarters and years are those of the Fiscal Year. A period is named by its first day ("Week of 9 Nov 2026", "October 2026", "Q3 2026", "FY 2026/27").
_Avoid_: Frequency, interval

**Fiscal Year**:
The year a workspace reports in, starting in the month it sets (January unless set); its quarters, half-years and years are the ones Ziffr uses everywhere. One that does not start in January is named by both calendar years it spans, such as "FY 2026/27".
_Avoid_: Financial year, business year

**Derived Metric**:
A metric computed by a formula from other metrics. It never receives observations directly. Its inputs are counted by its own period and combine by an Aggregation other than none; a formula Ziffr cannot read whole is refused. It is made from a Pack, in the new-Metric flow ("Calculated from other Metrics") or by a program, only from Metrics its maker owns or edits, since it shows their values to whoever it is shared with; while its owner may not share one of them, it shows no values. A formula may reach one period back: `prev({x})` is the input's value in the period before, `change({x})` this period's value minus that one. Such a Derived Metric is shown by its own period only.
_Avoid_: Calculated field, formula metric

**Aggregation**:
How a metric's values combine into a longer period: summed (revenue, deals), averaged (a score), the last value (a balance), or not at all (a rate).
_Avoid_: Roll-up, rollup method, combine rule

**Display Period**:
The period a widget shows a Metric by: its own, or a longer one, with the Metric's values combined by its Aggregation.
_Avoid_: Granularity, grain, bucket, roll-up

**Target Series**:
Target values for individual periods, such as a monthly budget, uploaded like observations. Where a period has none, the metric's target range applies.
_Avoid_: Budget, plan, goal series

**Running total**:
A Metric that adds up (its Aggregation is sum) added up from the start of its Fiscal Year, restarting each year, drawn against the running total of its Target Series (or of a one-sided target range, each period) and against last year's.

**Projection**:
A value for a future period, from an outside forecast or Ziffr's own, uploaded like an observation and always shown as a projection, never as an observation.
_Avoid_: Forecast value, estimate, prediction

**Polarity**:
Which direction is good for a metric: higher is better, lower is better, or closer to target is better.
_Avoid_: Direction, trend preference

**Target Range**:
The band of values a metric should stay within.
_Avoid_: Threshold, goal, limits, expected range

**Metric Owner**:
The Member responsible for a Metric's description and for accepting Corrections to its observations; the Corrections, unlocking a Lock, Retention notices and the Escalation that "tells the Metric Owner" all follow whoever owns it now. Whoever creates a Metric owns it first. The Metric Owner can hand it over to another Member who already sees it, and an Owner or Admin can hand any Metric to any Member who can own things: never to a Guest, a Contact or an Access Key, and never by a program. The new owner is told through their Delivery Preference, after Quiet Hours; the previous owner stays on as Editor (told too, when an Owner or Admin did it), so they keep seeing and filling in the Metric until its new owner changes that, and if that Share ends their Derived Metrics, Alerts and Personal Webhooks on it stop; the Metric's Workflow stays with the Workflow's owner, and the open Questions waiting on the old owner as owner move to the new one; the Audit Log records from, to and by whom. A Metric never stays with someone who is no longer a Member: removing someone hands everything they own to the person picked in the removal screen (the Workspace's Owner is offered first), and a Member who owns Metrics cannot be made a Guest before they are handed over.
_Avoid_: Admin, maintainer

**Metric Catalog**:
A library of predefined metric descriptions: the entries every Workspace has, and the Workspace's own part, from the Packs it installed. Picking one copies its description into a new metric of your own, with no link back to the catalog.
_Avoid_: Template library, presets

**Tag**:
A free word of a Workspace that people put on Metrics to find and group them, such as "finance" or "weekly review". Anyone who may change a Metric's description adds Tags to it; Owners and Admins rename, merge and delete them. Tags filter the Metrics list, Search and what programs read, and a widget that takes several Metrics may take all those tagged with one. A person is shown a Tag only through a Metric they may see, and a Tag never shares anything. Not a Group, which is a set of people; not an industry or segment key, which Ziffr sets on Metric Catalog entries; not a Breakdown's labels, which split one value.
_Avoid_: Label, category, folder, hashtag, keyword

**Archived Metric**:
A Metric kept with its description, values and history that asks for nothing and takes no values, shown only under Archived. It does not count towards the Workspace Limit; bringing it back counts again. Not a Snapshot, which keeps what a dashboard showed; that is why "archive" belongs to Metrics and a Snapshot is never called an archived copy.
_Avoid_: Deleted metric, inactive metric, hidden metric

**Retention**:
How long a Metric's values are kept, set per Metric with a default for the Workspace: none (the default, so nothing is ever lost unasked), or after a number of months either condensed into a Condensed Value or deleted. Condensing needs an Aggregation other than none. A confirmed Retention starts after 7 days that can be used to cancel it; then a daily job does it in small steps, never takes more than the counts the person confirmed, checks each Condensed Value against the original values before deleting them, and leaves periods that open work holds. Only Owners set the Workspace's default, which is copied into new Metrics. Snapshots, decks and View Links keep what they showed; the Audit Log has its own keeping. The Usage page suggests one for Metrics with many old values nobody opens, which only fills in the form; the API and the MCP Server read it, never set it. Not archiving, which sets a whole Metric aside.
_Avoid_: Expiry, TTL, clean-up, purge, archiving

**Condensed Value**:
The one value, with its target, that stands for a longer period (a month for its days) after the periods inside it were condensed by the Metric's Aggregation. It keeps the exact sum and count, so any longer period still comes out as it did before, and is shown as "condensed from daily values". It takes no more values.
_Avoid_: Roll-up, summary value, compaction, downsampled value

**Observation**:
One value of a metric for one period.
_Avoid_: Number, entry, data point, upload

**Breakdown**:
Labelled values that split one observation, such as revenue by country for October, uploaded with it. Labels are free text; the observation's value stays the metric's number even when the rows do not add up to it. A row may name another row of the same Breakdown as its parent, by its label (a part of it, such as a city of a country: at most 4 levels down and 200 rows, every label used once, no cycles), which makes the Breakdown a tree; without parents it stays a flat list. A row's number is its own, as it was given, and its parts may add up to another number. Whoever may see the Metric sees every row, parts included; a flat chart reads only the rows at the top, so no row is counted twice.
_Avoid_: Dimension, segment, table, drill-down

### Comparing

**Comparison**:
A metric's latest value against an earlier span: the previous period, or the same span one day, week, month, quarter, half-year or year earlier (DoD, WoW, MoM, QoQ, HoH, YoY), as an absolute and a relative change. Spans longer than the metric's period compare to date against the same span before, unless a widget asks for full periods.
_Avoid_: Delta, variance, period over period

**Appearance**:
How Ziffr's own screens are drawn for one person: System (light or dark as the device is set), Light, Dark, or High contrast (black on white, or white on black when the device is set to dark, with strong outlines). It is a personal choice, kept with the person so it follows them to every device and Workspace, and chosen in Your settings. It does not change a Theme, but a Theme may follow it: a dashboard or deck in a Theme that follows the viewer's Appearance is drawn in the Theme's dark variant while the viewer's Appearance is dark. Snapshots, View Links, exports and what a Theme says is "always as designed" keep the look of their Theme.
_Avoid_: Dark mode (as the name of the setting), skin, colour scheme

**Attainment**:
How far a value reaches its target, as a percentage where higher is always better, whichever way the metric's polarity runs. It is computed one of two ways. **By ratio**: value ÷ target, or target ÷ value when lower is better, as Ziffr did up to 0.9.0; it has no percentage for a target at or below zero, or a value at or below zero when lower is better. **By distance**: 100 % plus the distance to the target in steps of the target's size, so 100 % is on target also for targets below zero; a target of 0 has no percentage. Where there is no percentage, or the percentage would be below 0 %, the difference to the target is shown instead. The Workspace sets the default method, a Metric may choose its own in its Metric Description, and Snapshots and frozen View Links keep the method they were made with.
_Avoid_: Achievement, target fulfilment, performance

### Input

**Connector**:
A link between Ziffr and an outside system, such as Slack, email, Telegram, WhatsApp, a ticket system or the web form, and what it can do there: receive values, send reminders, send questions and tasks, bring replies back, keep a task's status in step. Some, such as Slack, are connected per Workspace by an Owner or Admin, to one workspace of that system, and reach a person only once they are found there by their proven address or link themselves; Telegram, turned on per Workspace, reaches only those who linked their own account.
_Avoid_: Integration, plugin, channel

**Source**:
A Connector used to receive observations, such as mail, a messenger, Slack or a web form. Programs with an Access Key and Feeds use the API Source, which a metric turns on separately from the personal form link.
_Avoid_: Input, integration

**Submitter**:
A person allowed to record observations for a given metric: a Member, a Guest, a Contact without a login, or a Feed.
_Avoid_: Reporter, contributor

**Feedback Prompt**:
A small card in the corner of the app that asks a signed-in person "Enjoying Ziffr?". A yes opens the Ziffr repository on GitHub in a new tab, where they star it themselves: Ziffr cannot star for anyone and tells GitHub nothing. A no asks "What is missing?", and the words are kept without the person's name and read only by Installation Admins. It appears only to Owners, Admins and Members after they have submitted values on at least 3 different days, never in the demo, for Guests, Contacts or on View Links; at most 3 times (after 30 days, then 60), and never again after a star or "Don't ask again". Whether it is asked is an Installation Setting: on for hosted Ziffr, off elsewhere. Not a Prompt, which asks a submitter for a value.
_Avoid_: Popup, survey, rating, nag

**Feedback**:
A message from a signed-in person to the Ziffr team, on hosted Ziffr only: a kind (a problem, an idea or a question), their words, and the page and app version it was sent from, kept with a status (waiting for review, open, answered, closed) and its own conversation. It lives outside every Workspace, is never added to a Workspace Export, carries no Metric name, value or other Workspace data, and is seen only by the person who sent it (My feedback) and by the Ziffr team. Feedback is posted directly (the default) or, when an Installation Admin of the central version sets review first, waits in the review queue: they approve it, edit its words (the person is told) or reject it with a reason the person reads. Not a Finding (an observation about numbers), a Question or a Task (asked of a person in their Workspace), nor the Feedback Prompt (the card that asks whether people like Ziffr).
_Avoid_: Ticket, support request, report, review

**Feed**:
A program outside Ziffr that brings in values for some metrics from another system, such as a CRM or a data warehouse. It belongs to the Workspace, not to a person, and only Owners and Admins create one. It is a Submitter of its own, uses a Feed Key, is never sent Prompts, and keeps working when the person who created it leaves. Ziffr never runs its code or holds its credentials for the other system. An n8n or Zapier flow that sends values is an automation, never a Workflow.
_Avoid_: Integration, sync, pipeline, connector, workflow

**Import**:
Values recorded for past periods that had none yet, by a Feed (such as two years of history when it is first connected) or by a paste that its Metric Owner, or an Owner or Admin, chose to record as history. They skip the Unusual Value check and are marked as imported in the metric's history.
_Avoid_: Backfill, migration, sync

**Token**:
The standing permission that links one submitter to one metric. Every incoming value is checked against a token, which is usually invisible and implied by who sent the value and where.
_Avoid_: Key, code, credential

**Submission Rule**:
Part of a metric's description that sets its period and what happens when a second value arrives for the same period: reject, overwrite, add up, or keep both.
_Avoid_: Dedup rule, overwrite policy

**Prompt**:
A scheduled message asking a submitter for a metric's value for the current period, e.g. "How many deals today?" It goes out through the submitter's Connectors: one Delivery for each way they chose (up to three, in order, all at once), but only ways the Metric accepts answers by (its Sources). Otherwise it goes by the first way both allow where the person can be reached (Slack, Telegram, then email), and never with a form link for a Metric that refuses the Web form. Where a way receives values, answering it records the value, elsewhere it carries the personal form link. The first accepted value on any way closes the Prompt: the other Deliveries are updated where their way allows ("Answered on Telegram: 3"), and a later answer follows the Submission Rule and is never dropped silently. A reminder goes only by the first way. When no allowed way reaches the person it waits in the Outbox as "Not sent" and the Metric's owner is told once.
_Avoid_: Reminder, nudge

**Workflow**:
A named, reusable path a metric's value takes each period: ask the submitter, remind, escalate, check, approve, tell, publish and lock, with Checklist Items for what is not a number and a Send Snapshot step once the period is finished. Several metrics can share one, such as "Monthly finance close". Its owner can close a period for all of them at once, and can give it an Asking Schedule of its own days and hour.
_Avoid_: Process, pipeline, flow

**Asking Schedule**:
When a Workflow runs by itself: the time of day (a whole hour) and the days (every day, weekdays, chosen weekdays, every n-th day from a starting day, or a day of the month), in the Workspace's time zone. Without one, a Workflow runs with the Workspace's daily run. It decides only when Ziffr asks, reminds and escalates: a Due Date never moves with it, and a step that falls on a day the Workflow does not run goes out on the next run day. A run asks for the last period that ended, so a schedule sparser than a Metric's period skips the periods in between. Not the **Schedule** (what one person has to do), not a Metric's Period, and not carried by Workflow Templates or Packs.
_Avoid_: Cron, recurrence, frequency, timer

**Checklist Item**:
A Workflow step its owner writes as a short text, of one of two kinds. For information: sent on its working day after the period ends to named people and Groups, through each person's Delivery Preference and waiting out their Quiet Hours; it asks nothing and cannot be answered. To tick off: each period it gives its Assignee a Task about the Workflow's period (no Metric), due a number of working days after the period ends, given to the item's Stand-in while the Assignee is Away, reminded and escalated by the Workflow's Remind and Escalate steps, counted in the period's progress and ticked off with an optional note. Its words are read by everyone who may look at the Workflow, unless kept to a Group; a Guest sees only what is given or sent to them. A Workflow holds at most 20. Not a Tell, which waits for a value to cross a level, nor an Action someone asks by hand.
_Avoid_: To-do, note, instruction, manual step, reminder

**Finished Period**:
A Workflow's period once every value it asks for is published and locked and every Task its Checklist Items gave for it is done. It is what a Send Snapshot step waits for. Not a period that is over or complete (a Snapshot's word for one that has ended), nor "Close the period", which locks values only.
_Avoid_: Complete period, closed period, signed off, done

**Send Snapshot**:
A Workflow step that, once a period is finished, takes and shows the period's Snapshot of one dashboard in the Workflow owner's name (or uses the one already shown) and sends a link to it to named people and Groups, once per period. Only people who may open the dashboard get it, each sees in it only the Metrics they may see, and the message holds no value or Metric name; the others are skipped and the owner is told. It never shares the dashboard or makes a View Link. Only the Workflow's owner adds it, for a dashboard they own or edit and fully see, and only when the Publish step locks.
_Avoid_: Pack, board pack, report, distribution, mailing

**Period Timeline**:
What happened in one period of a Workflow, in order: who was asked and reminded, which values came in (marked when someone entered one for its submitter) and which Checklist Items were sent, given and ticked off ("5 of 6 in" counts values and those Tasks together), Approvals and Actions, what published and locked, when the period finished, and the Snapshots made and sent. It records nothing of its own and shows each person only what they may see: a Metric they cannot see is only a count ("1 value"), and a Thread's words appear only as first words, for a Thread they may read. On the Workflow page, and as the `period_status` tool.
_Avoid_: Activity feed, audit trail, history

**Workflow Template**:
A starting point for a new Workflow: its steps, Due Date and reminders, Checklist Items and a Send Snapshot step, with the people (and the dashboard to send) left open to be picked when it is used. A Workflow made from one is an independent copy.
_Avoid_: Preset, blueprint, process template

**Due Date**:
When a period's value must be in, counted in working days after the period ends, e.g. the 3rd working day.
_Avoid_: Deadline, cut-off

**Schedule**:
What one person has to do in a Workspace, day by day (the To do view of the Schedule page, which also has Asked by me and a Timeline): values to submit by their Due Dates, Approvals waiting for them, and Tasks (a Checklist Item's among them) and Questions assigned to them, upcoming and overdue. It holds only their own duties, and only about Metrics they may see; while someone is Away, what they are asked for is in their Stand-in's Schedule.
_Avoid_: Agenda, to-do list, inbox, calendar

**Stand-in**:
The person asked instead of a submitter who is Away, or who has not answered by the Due Date. Also whoever a Checklist Task is given to while its Assignee is Away, and whom an Escalation hands it to. Their answer to a Prompt asked in the submitter's place is a Filled-in Value for that submitter, only for the periods they were asked about, and never through an Access Key. A Guest cannot be one.
_Avoid_: Deputy, backup, substitute

**Away**:
The dates a person is not available. While someone is away, Prompts meant for them go to their Stand-in.
_Avoid_: Absence, out of office, leave

**Filled-in Value**:
A value one person enters for a Submitter who has not sent it: their Stand-in answering the Prompt asked in their place, or, in the app, the Metric's owner or the owner of its Workflow. Only once the period's Due Date has passed or while the Submitter is Away, only for a period with no value that is not locked, only for a Metric that keeps one value per period, never for a Feed, never by a Guest or an Access Key. It is recorded and counted as the Submitter's (Schedule, progress, reports) and always marked with who entered it ("Entered by Ben for Sara") on the value, the Period Record, the Period Timeline and in the Audit Log. The Submitter is told, and can replace it with their own until the period locks; it then stays as a Superseded Value. It is checked and approved like any value, never by who entered it nor by the Submitter.
_Avoid_: Proxy value, on-behalf value, delegated value, substitute value, override, estimate, backfill, placeholder

**Quiet Hours**:
The hours of the day and the whole days when Ziffr sends a person no Prompt, reminder, Alert or Workflow message (a Checklist Item for information, a sent Snapshot), nor word that a value was entered for them, in their time zone. A person sets their own; Owners and Admins set the Workspace's default for everyone who has set none (an empty set of their own opts out of it). A message that falls inside waits and goes out when the Quiet Hours end, and is never dropped; they delay only the message, never a Due Date or an Approval's deadline, and not other messages such as a question someone asks. Not Away, which hands a person's Prompts to their Stand-in for whole dates.
_Avoid_: Do not disturb, silent hours, mute

**Escalation**:
A Workflow step that, when a value is still missing, asks the Stand-in or tells the metric owner.
_Avoid_: Warning. Not an Alert, which a person sets for themselves and which asks nobody for anything

**Unusual Value**:
A value that changes more than a set share against the period before, or falls outside the target. Only unusual values need Approval. An Import is not checked.
_Avoid_: Outlier, anomaly

**Approval**:
Confirming a value before it counts, by each Approver in order: an Unusual Value, or every value where the Workflow's Approve step says so. An Import of a Feed's history does not wait for it. An approver can approve it, send it back to the submitter with a comment, or correct it. Until it is approved the value shows, marked as not approved yet. Nobody approves their own value, nor a Filled-in Value they entered or that was entered for them: when nobody else could, the Approve step says whether a Self-check takes its place or the value counts without Approval, with a note saying so.
_Avoid_: Sign-off, review, verification

**Self-check**:
The submitter checking their own value when an Approval is needed but nobody else could give it, as in a Workspace of one person: they confirm it or correct it. For a Filled-in Value it is the submitter it is for, never who entered it. It is recorded as confirmed by the submitter, never as an Approval, and it is the Approve step's default for that case. As soon as someone else could approve, Approval applies again.
_Avoid_: Self-approval, own approval

**Period Record**:
One Metric's page for one period (`/metrics/churn-rate/2026-03-01`): its value and state, every step the value went through in order (submitted, entered by someone for its submitter, replaced, Correction proposed and decided, approved, sent back, published, locked, unlocked with its reason) with person, channel and date, and the Threads about it that the person may read. Only for people who see the Metric.
_Avoid_: Value page, audit trail, timeline (a Workflow's timeline lists many periods)

**Search**:
Finding things from the sidebar's Search field (⌘K or Ctrl+K): a Metric (also by its Tags), dashboard, deck, Workflow, person, Group or page by name (and by a few plain words for pages: "invite" finds Members and Groups), a Metric's value for a period by words such as "churn march 2026" (the period words are read like replies, in the Workspace's Answer Languages, and lead to the Period Record), and commands such as New metric, Invite someone, Record a value for a Metric the person submits, Switch Workspace and Toggle sidebar. Opened empty it lists recent items (kept in the browser, per person) and the commands. It only finds what the person may see and do, in their own Workspace: a Guest finds only themselves, their own Groups and the Workflows of what is shared with them; Archived Metrics are marked. Programs use the MCP tool `find` and `GET /api/v1/find`, which return Metrics and periods only.
_Avoid_: Global search, omnibox, command palette

**Lock**:
A published period of a metric that takes no more values. A late value or a correction becomes a proposal that needs Approval again; only the metric owner unlocks it, with a reason.
_Avoid_: Freeze, finalize, close

### Presentation

**View**:
A way of drawing a metric, such as a number with sparkline, a line chart, bars, a gauge or a history table. Ziffr ships its own Views; more can be added to a Workspace as View Designs.
_Avoid_: Chart type, visualization plugin

**Slide-over**:
A panel that opens on the right over the current page (full screen on a phone) for one job: Share, Version history, Alert me… or a Metric's Quick look. It has its own address (`?panel=…`), keeps the keys inside it, and Escape closes it. One host in the app shell shows it (`useSlideOver`), and the ? button opens Help in it: the user guide chapter for the screen, with a search that runs in the browser; when to use one and when a modal is in `docs/guides/side-panel.md`. Specs and tickets also call it the side panel; in code and screen text it is the Slide-over.
_Avoid_: Drawer, side panel, modal, dialog (a dialog is a small window for a decision, such as a confirmation)

**Quick look**:
A Slide-over with a Metric's latest value, target, trend and owner, opened from the Metric's name in a list or on a Widget without leaving the page. _Avoid_: Peek, Details

**View Design**:
A View written as a file: its Slots, its marks and what each shows, and its Theme colours. Ziffr checks it and draws it with its own renderer; it holds no code. Every built-in View that draws Metrics or an Analysis is one; Findings and the Free layout are drawn by code of their own.
_Avoid_: Chart plugin, visualization plugin, custom widget

**Finding**:
A widget set as an editorial graphic: a frame of kicker, headline stating the finding, subline, footnotes and source, around one or more panels. Findings sit on dashboards, where they read like the sections of an article in the Read view, and on slides.
_Avoid_: Story widget, infographic, chart card, editorial chart

**Panel**:
One chart inside a Finding, such as ranked bars, period bars, a bridge or an annotated line, showing one measure of one or more metrics. Several metrics in one panel are drawn side by side as small multiples.
_Avoid_: Chart, subplot, facet

**Measure**:
What a panel draws from a metric: its value, a comparison, its attainment or a share of a breakdown.
_Avoid_: Field, calculation, KPI

**Annotation**:
A callout, highlight ring or note in a panel, attached to what it is about (the highest bar, the last period, the France row) rather than to a position, so it follows the data or disappears when its target is gone.
_Avoid_: Label, comment, sticker, markup

**Bridge**:
A panel that walks from a start value through signed steps to an end value, either from one breakdown's rows or from the change between two periods, row by row.
_Avoid_: Waterfall, walk, cascade

**Widget Template**:
A starting point for a new widget or Finding: a view, its settings and, when the team saved it, its words and annotations, with the metrics left open as Slots. Ziffr ships built-in templates; anyone can save a widget as a team template, which only its creator edits. If none is chosen, the default template is used.
_Avoid_: Preset, widget type, blueprint

**Dashboard Template**:
A starting point for a new dashboard: its widgets with their views, settings, words and layout, with the metrics left open as Slots. One Slot can fill several widgets. Ziffr ships built-in ones; anyone who may change a dashboard and sees every metric on it can save it as a team template, which only its creator changes. A dashboard made from one is an independent copy. "Template" alone is never used in UI text without what it is a template of: Widget, Dashboard, Deck or Workflow.
_Avoid_: Preset, blueprint, starter dashboard

**Deck Template**:
A starting point for a new deck: its slides with their widgets, words and layout, with the metrics left open as Slots. A deck made from one is an independent copy.
_Avoid_: Preset, blueprint, master

**Slot**:
A place in a Widget Template or Dashboard Template that is filled with a metric when the template is used. A slot takes exactly one metric, or one or more for small multiples.
_Avoid_: Variable, parameter, input

**Placeholder**:
A word in braces in a text that is filled in from the data, such as the metric's name, the latest period or the change against last year. It works in a Finding's words, a widget's title, the texts of a View Design and a deck slide, and shows only what the viewer may see.
_Avoid_: Token, variable, merge field

**Widget**:
One metric drawn with a view and its settings, such as time window, target band or visible history. A saved widget can be reused; placing it on a dashboard places an independent copy.
_Avoid_: Tile, card, panel, chart

**Free Layout**:
A widget that holds an artboard of its own, laid out like a slide: widgets from the Pool, text, arrows, shapes and drawings placed freely. On a dashboard it shows read-only with live numbers; its owner or Editors change it with *Edit layout…*. What is drawn stays where it was placed, so it says when its Metrics have newer periods than when it was drawn.
_Avoid_: Canvas, drawing, board, freeform widget

**Pool**:
The side panel that holds everything a user can drag onto a canvas: the metrics they can see, their saved widgets and the Widget Templates.
_Avoid_: Library, palette, sidebar

**Preview**:
A Widget Template, Dashboard Template, saved widget or metric drawn small before it is placed, without its menus. A template's Preview draws Sample Data; a saved widget's draws the viewer's own data. A metric's Preview is a small card from the viewer's own data: what it counts (period, unit, description), its latest value and a sparkline.
_Avoid_: Thumbnail, mock-up

**Sample Data**:
Made-up metrics and values that a template's Preview draws, because a template has no metrics of its own. The same for everyone and never a workspace's data.
_Avoid_: Dummy data, fake data, demo data

**Dashboard**:
A canvas of widgets that a user arranges and can share, to watch numbers as they come in. It has a name and may have an introduction, and reads two ways: *Grid*, as arranged, and *Read*, the introduction and then its widgets one below the other in reading order, for a phone or to explain what happened. Ziffr opens on a person's Home dashboard, which they choose.
_Avoid_: Board, report, page, story

**Pinned Dashboard**:
A Dashboard a person keeps in the sidebar under Dashboards, for the ones they open every day. Pins are the person's own, per Workspace, at most eight, in the order they chose (by drag, or Move up and Move down). A pin never gives sight: a Dashboard that is no longer shared with the person drops out of their sidebar without a word. In the demo nothing can be pinned, except where visitors may change it: there a pin is kept in the visitor's own browser.
_Avoid_: Favorite, bookmark, starred

**Analysis Canvas**:
A workspace where a user drops one or more metrics and runs analyses on them. One of them is marked as **the one to explain**: the Metric that Drivers, What moves B?, What does B need?, What if A changes? and Did it work? are about, kept with the canvas and independent of the order of the Metrics; the others are compared with it. Not a Target Range: that word is only for the range a Metric aims for.
_Avoid_: Workbench, lab

**Playground**:
The page under Analyze where a View Design or an Analysis Recipe is pasted or uploaded, checked as it is typed, with every mistake named by its line, and drawn at once with Sample Data or with the person's own Metrics. Nothing typed there is kept unless an Owner or Admin adds it to the Workspace. Not the Analysis Canvas, where Metrics are analysed.
_Avoid_: Editor, sandbox, studio

**Analysis**:
A statistical method run on one or more metrics, such as forecast, correlation, drivers or which periods look alike. Its result can be saved as a widget. Ziffr ships its own Analyses; more can be written as Analysis Recipes.
_Avoid_: Stats, model, insight

**Method**:
One statistical calculation in Ziffr's library, such as a rank correlation, a usual range or a bridge. Used in documents and code; a person sees Analyses, Recipes and Takeaways. Each Method runs its suitability checks on every call, is worked out exactly on the values' text where arithmetic allows, and has an entry in the Methods guide with when to use it and when not.
_Avoid_: Algorithm, model, test

**Method picker**:
The list in the side panel opened by **Choose a method** on the Analysis Canvas, where a person who knows what they want picks a Method by what they want to know (where it is heading, what moves with what, what changed). It shows the questions as titles; choosing one opens it in place with its plain sentence, when to use it and when not (the Methods guide's words) and its fields, and a title is greyed with its reason when the Method cannot work on what is on the canvas. The answer appears under the canvas, not in the panel. A picked Method runs through the same Takeaway layer as its Recipe, with the Slots and settings asked in words, and sees only Metrics the person may see.
_Avoid_: Wizard, analysis chooser

**Extension**:
A Method, or later a mark that draws one kind of View Design, written by someone other than Ziffr as a folder of a fixed shape under `extensions/<author>/<name>`: a manifest, one pure file that Ziffr reads in full, a second implementation worked out another way, hand-worked cases, its entry for the Calculation Catalogue, its Takeaway wording and a LICENSE of its own. It is never loaded at run time. It is submitted as a pull request, read, checked and shipped inside a Ziffr release, and the registry lists the Extensions built into that release. Ziffr's own `quantile` and `topShare` are built in the same shape. It is not a Pack, which holds no code.
_Avoid_: Plugin, add-on, integration, script, module

**Extension Kit**:
The MIT package `@ziffr/extension-kit`, which an author writes an Extension against and checks it with on their own computer: its shape, its static rules, and then, by running it in a process of its own, determinism, a time and memory budget, refusals, its comparison with its reference, coverage and a mutation check. CI runs the same checks.
_Avoid_: Plugin framework, SDK (the SDK is for programs that talk to Ziffr)

**Takeaway**:
The result of an Analysis as Ziffr says it: one sentence in the Metrics' own words and units, a strength in four words (strong, moderate, weak, "can't tell from chance"), what it was compared on, and one footer line of its kind ("This shows what has gone together, not what caused what." for a link between Metrics, "This carries the past forward; it is not a promise." for a forecast, "This compares what happened with where the earlier trend pointed; it does not show what made the difference." for a before-and-after look, "This shows when the numbers changed, not what made them change." for a change point) Where the data does not suit the Method it carries one plain line above the sentence (a caution; a result with one is never strong) or, with too little data, is a refusal in words with no number. **Show the numbers** opens the numbers behind it. Every place a result is shown writes the same Takeaway. A forecast's Takeaway says where the Metric is expected to be with a "likely between" range (an 80 % range), with a Target how likely it is to be reached (in tenths), which Method worked it out and how its range for the next period would have held on the periods already known (its track record). A Takeaway about one Metric's own values, or a sum worked out exactly, makes no claim about what goes together and carries none.
_Avoid_: Answer (an Answer is what someone replies to a Prompt), insight, verdict

**Likely between**:
The range a Takeaway gives for a number that has doubt: it holds the true number about four times in five (an 80 % range), and is worked out by the Method, never as a statistical level a person must choose. A number outside what its driver has been has no range, only the number and "treat it as a guess".
_Avoid_: Confidence interval, margin of error, error bars

**What-if**:
A Takeaway about what a change in one Metric has gone with in others: "If Visits goes up by 1,000: Signups is estimated to go up by about 20 (likely between 17 and 22). Revenue is estimated to go up by about 960 € (likely between 700 € and 1,200 €), through Signups.". It follows at most two steps and 12 Metrics, and keeps two kinds of number apart: **worked out** (a Derived Metric's formula, exact, no range) and **estimated** (from what has gone together, with a "likely between" range that is cut wider the more estimated effects it rests on, so that, for links as given, it holds without assuming they are independent; links picked for standing out from chance tend to be overstated). A value beyond what a Metric has been is only a point to "treat as a guess". It reads what has gone together, never a promise or what would be caused.
_Avoid_: Scenario, simulation, forecast (a forecast carries the past forward in time), what-if analysis

**Driver**:
A Metric that moved with another in an Analysis (the Metric it is compared with is the target). A fit says what each Driver's share of the movement was and what an effect has been "with the others held the same"; Drivers that move so closely that they cannot be told apart are "treated as one".
_Avoid_: Cause, factor, predictor, independent variable


**Heads-up**:
Something Ziffr noticed in Metrics a person may see and tells that person, once, without being asked about that Metric: two Metrics that have started moving together ("Support tickets and Churn have started moving together: when tickets rise, churn follows two months later (strong, over 18 months)") or have stopped ("Visits and Revenue used to move together. Over the last 6 months, they have not."), or one Metric whose trend turned around ("Signups turned around in October: up 20 € a month before, down 11 € a month since."), whose Target is likely out of reach ("Revenue is unlikely to reach 600 € or more in March 2023 (about 2 in 10).") or whose latest value is unusual for its season ("Visits's 120 € in October 2028 is high for this time of year: it is usually between 78 € and 84 €."). It is worked out from final values only (nothing waiting for Approval), judged against everything that was looked at (every pair, or every Metric and kind) so that Ziffr stays quiet when nothing stands out, and it says what went together or what the Metric did, never what caused it. A person's Heads-ups are made only from Metrics they may see: one about two Metrics exists only for people who may see both, the count of what was looked at is their own, and a Metric hidden, archived or deleted is gone from them at once. The **pair table** that the Heads-up job fills once per Workspace is derived data that nobody but the core reads. A person sees them in the list called Heads-ups, which opens in the side panel from a one-line hint under the title of the Analyze page, can mark one **Not useful** or mute a Metric, and may switch on being told by message (by their Delivery Preference, at most 3 in 7 days, each once). A Heads-up never asks anyone to approve anything and never changes a value. Not an Alert (a person's own standing request on one Metric), nor an Unusual Value (a value that needs Approval).
_Avoid_: Insight, notification, alert, anomaly
**Change point**:
The one date at which a Metric's level or its trend most likely changed, found by trying every date that leaves at least four values each side, with how the Metric went before and since and the step in level at that date. It is called a change only when it beats what the dates tried would give by luck (the chance rule is shared among them); otherwise the Takeaway says nothing stands out. Used for the question "did something change, and when?". A "before and after" look is the same question with the date given: it compares the periods after a date with where the Metric's own trend pointed, and gives a range, not a verdict.
_Avoid_: Breakpoint, inflection, anomaly, outlier
**Look-alike**:
The Analysis "Which months look alike?" (in the Period's own word: weeks, quarters): it puts the periods in which 2 to 6 Metrics all have a value (the latest 60) into 2 to 4 **kinds** by how the Metrics stood in them, each Metric on its own scale and, where it clearly trends, read for its distance from its trend. It uses Ward's method, which has no random start and a written rule for ties, so the same values always give the same kinds, and a kind is only made of at least a sixth of the periods (at least 3). The person picks 2, 3 or 4 kinds, or leaves it to Ziffr, which takes the count whose kinds stand furthest apart and says so. A **kind** (of period) is one of the sets of periods it puts together ("months with high Returns and high Support tickets"), numbered by its earliest period and named by at most two Metrics on which its periods lie clearly above or below the other periods (Cliff's count: how often a period of the kind is higher than one outside it, less how often lower), or "close to the usual on every Metric". A kind that keeps to the same time of year says so. The **gap** between kinds is how far apart two kinds stand: the distance between their middles, counted in the typical spread of their periods along the line that joins the middles (a bell-shaped cloud of noise cut in two has a gap of about 2.65); it is worked out exactly and used in documents and **Show the numbers**. A later step checks whether the kinds are clearer than shuffled Metrics would give; it describes which periods look alike, never why.
_Avoid_: Clustering, segmentation, cluster analysis (for kind: cluster, group, segment, class, cohort, bucket)

**Analysis Recipe**:
An Analysis written as steps of Ziffr's verified functions over the Metrics in its Slots. It holds no code, so every number it gives is verified. In format `ziffr.analysis/2` a step may also give a table (rows with a label and a number) or what a fit holds, and an output may be a Takeaway, written by the Method's own words: a recipe's author writes no sentence about statistics. Format `/1` is read for ever.
_Avoid_: Script, model, custom analysis, formula

**Formula Tree**:
The formula of a Derived Metric drawn as boxes by a View Design's `tree` mark: the Metric's value for its own newest period at the top, and under it each part of the formula (the terms of a sum, the factors of a product or a ratio, a bracket as a box with parts of its own), every box an exact number. The parts of a sum share the width of their box by size, a part taken away is hatched, and the factors of a product are laid side by side, equal and not to scale. It is drawn only from inputs the person may see; with one hidden, the whole tree is refused, never drawn with a rest.
_Avoid_: Driver tree (a Driver is a Metric that moved with another, which a formula's parts do not say), decision tree, treemap

**Common Period**:
The period two Metrics are compared on in an Analysis: the longer of their own periods, the shorter Metric combined to it by its Aggregation ("compared by month"). A Metric whose Aggregation is none has no Common Period with Metrics of another period.
_Avoid_: Shared grain, joint period

**Recipe**:
A ready-made analysis setup that runs with one click, e.g. "What drives Cost?", "What moves Revenue?" or "What does Revenue need?"
_Avoid_: Preset analysis, template

### Decks

**Deck**:
An ordered set of slides that a user designs from widgets, text, arrows and shapes, and exports as a presentation.
_Avoid_: Presentation, slideshow, report

**Slide**:
One 16:9 page of a deck. Its order follows its position on the deck canvas, left to right and top to bottom.
_Avoid_: Page, frame, board

**Theme**:
A named look for everything that shows numbers: colours for text, surfaces, data, good, bad and the target band, the fonts for headlines, text and figures, how cards are drawn, and what every slide shows (logo, footer, slide number, background image, type sizes). The team has one default theme; a dashboard or deck may use another, and a deck may set its own footer. A slide may hide the logo, footer and number. Ziffr's own screens are drawn by the person's Appearance, not by a Theme. Owners and Admins change Themes. The team default Theme also dresses what Ziffr sends and shows outside the app: emails, the form link, View Link pages and the side bar of Slack messages show its logo (or the Workspace's name), accent, footer and fonts, with every colour checked for contrast. A Theme can be written as a file and read back from one; a Theme in a Pack may use the Pack's logo. Every Theme has a **dark variant**, the colours it wears when the viewer's Appearance is dark: a Standard Theme carries a designed one, any other Theme gets one worked out from its own colours and checked for contrast (WCAG AA), falling back to Ziffr Dark's colours if that fails; a Theme that is dark already has none. Its setting **In a dark Appearance** is "Follows the viewer's Appearance" (the default) or "Always as designed", for brand decks and anything that must look the same for everyone. Fonts, corners and cards are the same in both.
_Avoid_: Master, skin, style, brand kit, palette

**Standard Theme**:
One of the Themes Ziffr delivers (Ziffr Light, Ziffr Dark, Tokyo, Paris, Oslo, Print), each with a designed dark variant unless it is dark already (Ziffr Dark, Tokyo). It is part of Ziffr, not of a Workspace: an Owner or Admin looks at it on the Themes page and adds it, which makes a Theme of the Workspace's own that can be changed like any other. Ziffr changing a Standard Theme later never changes a Theme already added.
_Avoid_: Preset, built-in theme, template theme

**Snapshot**:
What something showed, fixed so it never changes when observations do. A dashboard's Snapshot keeps the dashboard as it stood for one week, month, quarter, half-year or year (quarters, half-years and years of the Fiscal Year, such as "Q1 FY 2026/27", "H2 2026" or "2026"): its layout and the values of every Metric period complete by the period's last day. Its numbers never change, and a value corrected since is shown with a note of what it is now; its words (the introduction, each Finding's headline and sentences) are written after it is taken, and every change is a Version. It is a draft for the dashboard's owner and Editors until one of them shows it; then whoever may open the dashboard may open it, and sees in it only the Metrics they may see now. Its owner may have the dashboard take one of every week, month, quarter, half-year or year by itself, once every Metric on it is Locked for each of its periods inside it (for a year of a monthly Metric, all twelve months) or a set number of days after it ends. A Workflow's Send Snapshot step takes and shows one when its period is finished. A deck's Snapshot is the values its widgets show at the moment it is exported, stamped with that date.
_Avoid_: Copy, freeze, archived copy, export data

### Sharing

**Workspace**:
One team's own space in Ziffr, with its people, metrics, dashboards, decks, themes and connectors. A person can belong to several and switches between them; nothing is shared across workspaces.
_Avoid_: Tenant, organisation, account, company

**Trial Workspace**:
A Workspace on hosted Ziffr that a person or a team makes to try Ziffr for a set number of days; only an Installation with Ziffr Cloud offers them. Its Owner may invite colleagues within the Trial Limits, and every Connector reaches those who accepted, but Contacts stay simulated. At its end it is subscribed to (a Size, everything kept) or closed, its Owner takes a Workspace Export, and it is deleted after a set number of days. It starts with the Test Metric only, a Workflow that asks its Owner for it each day and a small dashboard showing it: nothing made up, so its first value is the Owner's own.
_Avoid_: Sandbox, test workspace, free trial

**Trial Limit**:
One of the numbers that bound every Trial Workspace: people, invitation emails a day, Metrics, messages a day, keys, Feeds, assistants, Webhooks, View Links, and the days a trial lasts and its data stays. Ziffr Cloud or an Installation Admin of hosted Ziffr sets them, each within a range, and a change applies to running trials at once. Lowering one never deletes or stops what a trial has: only what is new waits. Not a Workspace Limit, which counts Metrics of an ordinary Workspace, nor a Sending Limit, which is the same for every Workspace.
_Avoid_: Plan limit, quota, entitlement

**Workspace Export**:
The file a Workspace's Owner downloads that holds the Workspace as the Owner may see it (its Metrics and their values, dashboards, decks, Workflows, Themes, Groups, Shares and people as invitations, but no secret, key or Connector link), so that another Installation can import it as a new Workspace (a Workspace made by an import is marked importing, and invisible to its Owner, until it is complete: a failed import deletes it with its key). It asks for a sign-in from the last 10 minutes, is made while it downloads and is never stored. What its format cannot carry is left out and said, never cut short. The people in it become invitations on hold, sent only when the new Owner presses Invite everyone. Not an Archived Metric, nor a Pack, which holds no values.
_Avoid_: Backup, dump, archive

**Setup Guide**:
The five steps that set up a Workspace (About you, Starting point, Ways in and out, First Metric, Team), opened by itself at a person's first sign-in and reopened from Help or the Setup line at the top of each page. Each step ticks from what the Workspace has, never from a flag a click sets, and each can be skipped. Its progress is the Workspace's, shared by its Owners and Admins; hiding it is each person's own. A Member sees the steps about themselves, a Guest none, and the demo never. What a person answers in it stays in the Workspace and is sent nowhere.
_Avoid_: Wizard, onboarding, tour, checklist

**Trial Guide**:
The Setup Guide as a Trial Workspace has it: the same steps, with the Test Metric as its First Metric and the Trial Limits on the steps that count something. Try it stays as the reference of every way.
_Avoid_: Wizard, onboarding, tour

**Business Function**:
The part of a business a person works in, picked by that person from a fixed list (sales, marketing, finance, operations, customer support, people and HR, product and engineering, management, something else). Set per Workspace, optional, and seen only by the person and the Workspace's Owners and Admins. Ziffr uses it to suggest Packs and who is asked for what.
_Avoid_: Department, team (that is a Group), role (that is a Workspace Role), job title

**Test Message**:
A Delivery a person sends to themselves through one Connector (email, Slack or Telegram) to see that it reaches them. It asks for nothing, cannot be answered, and never goes to anyone else.
_Avoid_: Ping, test notification

**Test Metric**:
The Metric a Trial Workspace has for the Setup Guide of a trial to ask for: Cups of coffee, asked of the Owner daily, answered by hand and without history, so the first value it holds is the Owner's own.
_Avoid_: Demo metric, sample metric

**Installation**:
One running Ziffr: its app, its database and its keys, reached at one address. It can hold many workspaces, and whoever runs it decides its settings, such as whether it offers the demo. Only hosted Ziffr offers Trial Workspaces.
_Avoid_: Instance, deployment, server, tenant

**Installation Admin**:
A person who runs an Installation as a whole: they open its Installation Settings and add or remove other Installation Admins, never the last one. It is not a Workspace Role: an Owner of every Workspace is not one, and being one shows no Workspace's data. The first one claims the Installation with a one-time setup code that Ziffr writes to its server log while it has none; the server's settings can also name them by address.
_Avoid_: Superadmin, root, system administrator

**Installation Settings**:
What an Installation talks to, such as its mail server, set by an Installation Admin on a page of its own instead of in the server's environment. A value set in the environment wins and is shown as set on the server; secret values are sealed and never shown again. Settings of a Workspace are not Installation Settings.
_Avoid_: Admin settings, system settings, global config

**Sending Limit**:
One of the abuse safeguards of an Installation that an Installation Admin may move within a range, as an Installation Setting named `ZIFFR_LIMIT_*`: emails, chat messages, Alerts, values, calls, Webhooks, sign-in links, Contacts and Snapshots per day, hour or minute. None can be switched off; they are the same for every Workspace whatever its Size, and Ziffr Cloud never sets them. Lowering one never deletes or stops what exists: only what is new waits. Not a Workspace Limit, which counts Metrics.
_Avoid_: Rate limit setting, quota

**Settable Limit**:
A value with a range that is set one level at a time, each level only going down from the level above: the Installation (its range, and for the two Alert limits the ceiling an Installation Admin sets as a Sending Limit), then the Workspace (set by its Owners and Admins), then a person for themselves where it concerns them. The value in effect is the lowest of the three. The Workspace sets how many Alerts and Alert messages a person gets, how long a View Link may live, the share of daily emails Alerts may use and when a Metric counts as unused; a person sets their own Alert messages a day, how far back the overdue list reaches and the window of their Calendar Link. Lowering one never deletes or stops what exists: only what is new waits. Not a Sending Limit, which only an Installation Admin moves, nor a Workspace Limit, which counts Metrics.
_Avoid_: Quota, preference, cap

**Workspace Limit**:
The most Metrics a Workspace may hold, Archived Metrics not counted, set for it by an Installation Admin or by Ziffr Cloud, or else the Installation's default; without any there is no limit, as on most self-hosted Installations. A Workspace over it keeps everything working and keeps collecting values; only new Metrics wait, after 14 days with room for 10 % more; those 14 days come at most once in 90 days.
_Avoid_: Quota, cap, allowance, plan

**Size**:
What a Workspace on hosted Ziffr is booked for, named by how many Metrics it may hold: Small, Team, Business, or larger on request. There is no Free Size: whoever wants Ziffr for free runs it themselves. Every Size has every feature and any number of members. In Ziffr itself a Size is a Workspace Limit with a name; its price is known only to Ziffr Cloud.
_Avoid_: Plan, tier, package, edition, subscription

**Ziffr Cloud**:
The private service that runs hosted Ziffr's billing: Sizes, prices, payments, invoices and the Marketplace. It sets Workspace Limits and Trial Limits through an API of its own, which can read a Workspace's count of Metrics and nothing of its data.
_Avoid_: Billing service, SaaS, hosted edition

**Pack**:
A file of things to add to a Workspace, with no code: Metric Catalog entries, Dashboard and Deck Templates, View Designs, Analysis Recipes, Workflow Templates and Themes, with its name, version, author, license and optionally a logo. Installing one copies each thing into the Workspace, marked with the Pack and version; it makes no Metric until a person sets it up. New versions are offered, never applied by themselves, and uninstalling removes what nobody changed. Ziffr's own Packs (the twelve of the `packs` folder) come with each release and are installed from the Packs page by an Owner or Admin with no download and no Marketplace; they are recorded as installed from Ziffr's own Packs. It may say whom it is for (its Pack Audience), which ranks it in the Setup Guide.
_Avoid_: Plugin, add-on, integration, app, bundle

**Pack Audience**:
The optional part of a Pack's manifest that says whom the Pack is for: industries, segments, Business Functions, employee bands, revenue bands and countries, each from Ziffr's fixed lists. Ziffr ranks Packs by it and never hides one for it.
_Avoid_: Target group, persona, category

**Marketplace**:
Ziffr's catalogue of Packs, checked before they are listed, and of programs outside Ziffr that work with it, such as Feeds. Packs are installed from it into a Workspace; programs outside Ziffr are only listed, and their creators bill for them themselves.
_Avoid_: Store, app store, gallery, hub

**Webhook**:
An address that a Workspace's Owner or Admin sets so that Ziffr sends it signed messages about what happens there, such as a task given, a task done or a value recorded, for a program to pass on to another system. It belongs to the Workspace, like a Feed, and sees only what every Member sees; other things reach it with their words left out. It can mark a task done, reply to a thread or answer a question, as the Webhook, but only for tasks that were sent to it, and it can say which task in the other system an Action is (an _external id_, kept per Webhook, with an optional link shown on the Action as "Also in"). Not a Connector, which reaches a person. The app heads these **Workspace Webhooks** where it also lists Personal Webhooks; "Webhook" alone means this kind.
_Avoid_: Callback, trigger, integration, subscription

**Personal Webhook**:
A Webhook that one person adds for themselves in one Workspace, once an Owner or Admin allows it, and that acts as that person: it hears the Tasks and Questions given to or asked by them, the values of Metrics they pick and their own Alerts, each in full and only if they may see it at the moment it is sent, and it can mark their tasks done as them. It ends when they leave the Workspace. Not a Delivery Preference way, which reaches the person, not a program (spec 0037).
_Avoid_: My webhook, user webhook, private webhook

**Automation Template**:
An importable file for an automation tool such as n8n that joins Ziffr to another system, in one direction or the other: out, from a Webhook to Microsoft To Do, Google Tasks, Slack, Asana or Todoist; or in, from a system such as Google Sheets, Stripe or HubSpot through a Feed, to fill Metrics. It lives in the repository; Ziffr never runs it or holds the other system's credentials. A person may download one from Ziffr with their Ziffr's address and their Metrics already in it.
_Avoid_: Recipe (that is an Analysis Recipe), plugin, integration, flow

**Workspace Key**:
The key a Workspace's sensitive data is encrypted with in the database: its values, the words people write and its Contacts' details. Each Workspace has its own, kept only wrapped by the Installation's key, and deleting the Workspace destroys it, so what is left of the Workspace can no longer be read. It is not end-to-end encryption: the Installation reads the data to check, combine and send it. The demo has none. Data written before a Workspace had a key is sealed by a job, which Installation Admins can follow on the Installation Settings page: they see how far it is and which key versions each Workspace has, never a key. An Installation Admin can change a Workspace's key, after an incident or when an Owner asks: a new key version takes over, and the old one is destroyed once nothing is sealed under it.
_Avoid_: Tenant key, encryption key, data key, customer key

**Installed app**:
Ziffr added to a phone's home screen or a computer's dock from the browser, so it opens in a window of its own. It is the same Ziffr as in the browser, needs a connection and keeps no Workspace data on the device; there is no native app. Not an Installation, which is a running Ziffr on a server.
_Avoid_: PWA, native app, mobile app, offline mode

**Workspace Profile**:
What kind of business a Workspace belongs to: its industry, who it sells to (B2B, B2C, B2B2C, public sector, non-profit), its country and currency, and how many people and how much revenue it has, each picked from a fixed list. Ziffr uses it to suggest Metrics; teams within a workspace are Groups, not part of it. It is asked in the Setup Guide's About you step; it stays in the Workspace and is sent nowhere.
_Avoid_: Classification, company profile, firmographics, tenant settings

**Number Style**:
How a Workspace writes numbers: how digits are grouped and which mark is the decimal, such as 1,234.5 or 1.234,5. It also settles how an ambiguous number such as 1.500 is read.
_Avoid_: Locale, number format, regional settings

**Answer Language**:
A language whose words Ziffr understands in an answer, such as "last week" or "letzte Woche" naming the period. A Workspace reads answers in the ones it chooses: English and its country's languages unless an Owner or Admin picks others.
_Avoid_: Locale, input language

**Workspace Role**:
What a person may do in a Workspace as a whole. A Workspace Owner manages settings, themes, groups, members and billing; a Workspace Admin does the same except billing and removing owners; a Member creates and shares metrics, dashboards and decks; a Guest only sees what is shared with them, answers questions and submits values, and creates nothing. A Guest never sees who else is in the Workspace: no names, emails, handles or Groups of other people, in pages, search, Versions, Threads, the API or MCP; they read as "Someone". A workspace can have several owners.
_Avoid_: Permission level, admin rights

**Invitation**:
An offer to join a Workspace with a Workspace Role, made by an Owner or Admin. One sent to an email address is accepted once, by that address; a link works for anyone who has it until it ends or is revoked. Inviting a Contact makes them a member who keeps their history. In a Trial Workspace the email and the accept page say it is a trial, until when and what follows. Every invitation email has a one-click **Do not invite me again** link that stops invitation emails to that address from every Workspace on the Installation.
_Avoid_: Invite code, access grant

**Domain Joining**:
A Workspace setting, off by default, that lets people with a verified address at the company's domain ask to join; an Owner or Admin lets each one in.
_Avoid_: Auto-join, SSO

**Contact**:
A person known to a Workspace who has no login, such as a field worker or an outside bookkeeper who submits values by Slack, email or the form. A contact can be invited later and then becomes a Member or Guest.
_Avoid_: External user, anonymous submitter

**Access Key**:
A secret a person creates so a program can use the API on their behalf, limited to some actions (reading metrics, submitting values, creating metrics owned by that person, changing the Target Range, Target Series, Projections, Sources and Submitters of the metrics that person owns or edits and the Unusual Value check of the Workflows they own, reading dashboards, building dashboards and taking Snapshots as that person, and, only for a program's key and never an assistant's, approving values making View Links to that person's dashboards, sharing what that person owns, managing Groups and inviting or removing people as that person's role allows), bound to one Workspace and ending on a set date. Owners can see and revoke every access key in their workspace; Admins can see every key and its Access Log. An assistant that connects by address, such as Claude.ai, holds an access key of the kind assistant: made when a person approves it on Ziffr's consent screen, and used through short-lived OAuth tokens instead of a secret anyone sees; disconnecting it revokes the key. An assistant may also hold the scope to propose sharing, which only prepares a Share Proposal. Not to be confused with a Token, which lets a submitter record values for one metric.
_Avoid_: API token, personal access token, credential

**Feed Key**:
An Access Key that acts for a Feed instead of a person. It can only record values for the metrics that Feed submits to, and see their descriptions and which periods already have a value, never the values themselves or the workspace's people. Owners and Admins create and revoke it.
_Avoid_: Service account, bot token, connector key

**MCP Server**:
The program that lets an AI assistant read a workspace's metrics, submit values, change targets and Projections and build dashboards through the API, with an access key. It runs on the person's own computer, or at the Installation's own address `/mcp` for assistants that connect over the internet, and sees no more than the key does.
_Avoid_: AI integration, plugin, connector (a Connector is how Ziffr reaches people)

**Starter**:
A ready-made request the MCP Server offers an assistant, which a person picks instead of writing it themselves, such as a weekly review of the Metrics, recording values from a sentence, or proposing a dashboard or sharing numbers. It is only words for the assistant: it reaches Ziffr through the same tools and access key, so it can do nothing the person could not ask for. MCP calls it a prompt. Not a Dashboard Template, which a dashboard is built from.
_Avoid_: Prompt (a Prompt asks a submitter for a value), template, preset, recipe

**Access Log**:
The record of every call a program made with an access key: when, what it asked for, and whether it worked. Owners and Admins see it for every key in their workspace, a person for their own keys.
_Avoid_: Audit trail, request log, API history

**Demo Mode**:
A visit to the demo workspace: a made-up company anyone can look around without an account, switching between its made-up people to see each one's view. Where this Ziffr is a public demo and nothing else, and its setting allows it, visitors may also try the everyday work (values, dashboards, decks, Snapshots, Metrics, Threads, sharing among the made-up people); what they change is seen by every visitor, held to limits, and gone at the next Demo Reset, and the demo's own examples and the words it came with stay as they are. Nothing is ever sent, and nothing reaches outside the demo: what would is refused with one sentence that points to a Trial Workspace. Elsewhere, and until that setting is on, the demo is read-only. It sits next to real workspaces and never reaches them, and an installation can switch it off. Its Connectors are all simulated and it has no Access Keys; trying them for real is what a Trial Workspace is for.
_Avoid_: Sandbox, test mode

**Demo Reset**:
The demo returning to its seed as one step: every 15 minutes when a visitor changed it, and once a day (nightly where visitors may not change it) so that its periods reach up to today. What visitors made or changed is gone, and a page open at the time follows the demo's own dashboards and decks to their new versions. The screens say "starts fresh" ("the demo starts fresh at 14:25"), which is this term in plain words, not a second term.
_Avoid_: Wipe, refresh, restore (a Version is restored), starting over

**Share**:
Giving another user or a Group access to a metric or a dashboard. Sharing a dashboard also gives view access to every metric on it.
_Avoid_: Invite, publish

**View Link**:
A link that shows one dashboard or deck to someone outside the team, without logging in and without being able to change or ask anything. It expires on a set date (in a Trial Workspace no later than the trial's last day) and can be revoked. It shows live numbers; for a deck, numbers frozen when it was made; for a dashboard, one of its Snapshots once shown, which ends the link when it is deleted. It shows no person's name (owners, submitters, authors, the people of a Snapshot, and any name written in its words, which read "Someone") unless the person who made it ticked **Show names**, which they can change later.
_Avoid_: Public link, guest access, embed

**Share Proposal**:
A sharing an assistant or program only prepares, which waits in the person's Actions for 7 days until they confirm it in Ziffr with their own sign-in. It names a dashboard the person owns (or one of its shown Snapshots) and either a View Link to an email address with an end date and an optional message, or a Share to a Member or a Group. It shows what the recipient would see, with the address and message in plain words. Only on confirming does Ziffr make the View Link or give the Share, and email the link and message to the address; declining or letting it run out shares and sends nothing. Never confirmed through an assistant's token, and never for people or Approvals. Not a Share, which already gives access, nor a Correction, which proposes a value.
_Avoid_: Draft share, pending share

**Calendar Link**:
A secret address that shows one person's Schedule in a calendar app, as all-day entries that link into Ziffr. Anyone with the address sees what it shows, so it can leave out the Metrics' names; it shows only what its person may see now, ends when they leave the Workspace, and can be revoked by them or an Owner or Admin. Not a View Link, which shows a dashboard or deck, and not a Feed, which sends values.
_Avoid_: iCal feed, calendar feed, calendar subscription, ICS link

**Group**:
A named set of users, such as Management or Sales, that things are shared with or a Thread is limited to. Whoever joins a group gets what was shared with it. The workspace owner manages groups. Every workspace also has the group Everyone in the workspace: all its members except guests, kept up to date by itself.
_Avoid_: Team, role, department

**Viewer**:
A user a dashboard or metric is shared with who can look at it, inspect history and assign actions, but not change it. Viewer is a role on one shared thing; Guest is a role in the whole Workspace.
_Avoid_: Reader

**Editor**:
A user a dashboard, deck or metric is shared with who can also change it: arrange a dashboard's widgets or a deck's slides, or a metric's targets, description and Sources. Deleting it and sharing it stay with its owner.
_Avoid_: Collaborator, co-owner

### Governance

**Version**:
A saved state of something people build (a widget, dashboard, deck, master, metric description or a Snapshot's words) with its author, time and an optional message or name. Edits by one person within ten minutes form one version; restoring a version creates a new one. A Version keeps how something was built; a Snapshot keeps what a dashboard showed.
_Avoid_: Revision, snapshot, commit, backup

**Superseded Value**:
An earlier value of an observation or breakdown row, kept when an overwrite or correction replaced it, with the time it was replaced and, for a Filled-in Value, who entered it.
_Avoid_: Old value, previous version, overwritten value

**Audit Log**:
The record of who changed who may see or do what in a Workspace, and of the decisions taken on numbers: roles, removals, invitations, joining, Shares, Groups, View Links, Access Keys, Locks, Approvals, Corrections, Filled-in Values, Snapshots taken, shown and deleted, settings, exports and sign-ins. Each event names the person, the kind, the object as it was named then, the time and small details such as the old and new role, never a value or a message. Nothing in it can be changed or removed; it keeps two years. Owners and Admins read and export it. Not the Access Log, which records a program's calls, nor a Version, which keeps what something looked like.
_Avoid_: Audit trail, activity log, event log, history

**Changes**:
The page that lists, newest first, every change to what people build (Widgets, dashboards, decks, Metric Descriptions, Themes, Workflows, the words of a Snapshot) and every value that was replaced, each person seeing only what they may see. Nothing on it can be edited. Not the Audit Log, which records who may see or do what, nor a Version, which keeps what something looked like.
_Avoid_: Activity, activity feed, history

### Collaboration

**Action**:
A question or task about a specific observation or time range of a metric that one user assigns to another, or a Task a Checklist Item gives about a Workflow's period, which has no metric. It moves from open to answered to closed, and can be reopened.
_Avoid_: Ticket, request, to-do

**Schedule views**:
The Schedule is one page with three views, switched at the top. To do is the Schedule itself, what the person has to do, overdue first. Asked by me lists the Questions and Tasks they asked: answered ones waiting for them to close, open ones, and Done (closed, folded, grey and ticked, never red). The Timeline says what happened, newest first, by day: the Period Timelines of the Workflows and the Actions on Metrics no Workflow asks for, each person seeing only what they may see. The old Actions page is no longer a page of its own; Action stays the word for a Question or Task.
_Avoid_: Actions page, Inbox, Kanban, activity feed

**Question**:
An action that is done once the assignee has answered it, e.g. "Why is cost so high this month?"
_Avoid_: Inquiry

**Task**:
An action that is done once the assignee has carried it out, e.g. "Renegotiate the shipping rate", optionally with a due date. A Checklist Item gives one each period, about the Workflow's period, ticked off with an optional note.
_Avoid_: To-do, job

**Assignee**:
The user an action is assigned to.
_Avoid_: Owner, responsible

**Thread**:
The replies between asker and assignee on an action. Everyone who sees its Metric can read it, unless the asker limits it to a Group; the people on it and the Metric's owner can always read it.
_Avoid_: Conversation, chat, comments

**Correction**:
A change to an observation proposed in an action's thread, which takes effect once the metric owner accepts it.
_Avoid_: Fix, edit, amendment

**Held Reply**:
A reply by email that no provider vouched for, which changes nothing until the person it went to confirms it with a one-time link Ziffr emails to the address the Workspace keeps for them (never the address it came from). The link works once, for 48 hours, and shows the reply and what it would do before its Confirm button takes it. Replies a provider vouched for are taken at once. Not an Approval, which is never taken by email unvouched.
_Avoid_: Quarantined reply, pending reply

**Delivery**:
One message Ziffr sends through a Connector to one person: a new question or task, a reminder, a reply, a proposed correction or a closed task. Answers to it come back into the Thread.
_Avoid_: Notification, outbox item, message

**Outbox**:
Every Delivery, newest first, with what it said and where it went. An email, Slack or Telegram one also shows whether it was really sent, is waiting or failed; the other Connectors only record it.
_Avoid_: Sent items, log

**Tell**:
A Workflow step, set by the Workflow's owner, that tells named people and Groups when a Metric of the Workflow reaches a share of its target, reaches or falls below a value, or changes more than a share against the period before. It works like an Alert for a team: once per crossing, only for published or approved values, never for an Import, each person told through their Delivery Preference and only if they can see the Metric at that moment, the rest skipped silently. A Group is expanded to its people, never a channel. An Owner or Admin may also name a Webhook, which gets `alert.fired` (Metric, period, value, target, condition, link) only for a Metric Everyone sees; a personal Alert never reaches one (it may name its person's own Personal Webhook instead). A Workflow holds at most three Tell steps, each tells at most 20 people, and each person can stop it for a Workflow ("stop telling me"). Not an Alert, which is a person's own request, nor an Escalation, which acts on a missing value; its messages cannot be answered.
_Avoid_: Notify, notification

**Alert**:
A person's own standing request, on one Metric they may see, to be told through their Delivery Preference when its latest value reaches a share of its target, reaches or falls below a value, changes more than a share against the period before, or is still missing after its Due Date. It fires once per crossing, only about values that are published or approved (unless the person includes the rest), never for an Import, and stops silently when the person can no longer see the Metric. It can also be sent to one of the person's own Personal Webhooks. It asks nobody for anything and cannot be answered. Not an Unusual Value, which needs Approval, nor an Escalation, which acts on a missing value for the people responsible. A team is told by a Workflow's Tell step, never by Alerts set for others.
_Avoid_: Notification, subscription, trigger, watch, threshold

**Delivery Preference**:
Where a person wants to get questions, tasks, reminders and replies. The team sets a default; whoever sends may choose another for one message. For Prompts it is an ordered list of up to three ways, used all at once; every other kind has one way.
_Avoid_: Notification settings, routing

**Usage**:
What a Workspace or an Installation is used for, as counts: what is looked at, which Metrics have values, what arrives by which Source. It never says who looked. A Workspace's Owners and Admins see theirs on the Usage page; an Installation Admin sees only totals across all Workspaces.
_Avoid_: Analytics, telemetry, tracking, statistics, activity

**Usage Digest**:
The monthly email to a Workspace's Owners that says how many dashboards, decks, Metrics and Submitters are unused, with at most five names a list and a link to the Usage page. It holds no values, goes only when something is unused, and each Owner can switch it off for all their Workspaces.
_Avoid_: Newsletter, report, alert

**View Count**:
How many times a dashboard, deck or Metric was opened on one day, kept only as a number per day: never by whom, and nothing in the demo. It is what lets the Usage page say a dashboard was not opened for 90 days.
_Avoid_: Page views, hits, visitors, tracking

**Usage Key**:
A secret an Installation Admin makes on the Installation Settings page. It reads the Installation's Usage totals and nothing else: no Workspace, Metric or person, and it is not an Access Key.
_Avoid_: Admin key, telemetry key, API token

**Usage Feed**:
The Feed, in Ziffr's own repository, that reads an Installation's Usage totals and records them as Metrics in the operator's own Workspace. It runs outside Ziffr, from the Docker clock or any cron, only when its keys are set. With `--workspace` it reads one Workspace's own figures with an Access Key that has "Read usage figures" (an Owner's or Admin's, a program's only) and records them in that Workspace, as the Workspace usage Pack lays them out.
_Avoid_: Telemetry, phone-home, reporting job
