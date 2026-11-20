# Ziffr

A metric tracker. Define any number you care about. Ziffr asks people for its values when they are due, or people and systems send them in on their own. Then see, share and discuss them over time. For one person, a team or a business.

## Language

### Metrics

**Metric**:
A named, fully described number tracked over time. It must be defined before any value can be recorded for it.
_Avoid_: Number, KPI, measure, series

**Metric Description**:
Everything that defines a metric: name, description, unit and which side of the number it stands on, format, period, submission rule, sources, target range, polarity, how its Attainment is computed (or the Workspace's way), owner and, for a derived metric, its formula.
_Avoid_: Settings, config, schema

**Period**:
How often a Metric has a value: a day, week, month, quarter or year. Weeks run Monday to Sunday; quarters and years are those of the Fiscal Year. A period is named by its first day ("Week of 9 Nov 2026", "October 2026", "Q3 2026", "FY 2026/27").
_Avoid_: Frequency, interval

**Fiscal Year**:
The year a workspace reports in, starting in the month it sets (January unless set); its quarters, half-years and years are the ones Ziffr uses everywhere. One that does not start in January is named by both calendar years it spans, such as "FY 2026/27".
_Avoid_: Financial year, business year

**Derived Metric**:
A metric computed by a formula from other metrics. It never receives observations directly. Its inputs are counted by its own period and combine by an Aggregation other than none; a formula Ziffr cannot read whole is refused.
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
The user responsible for a metric's description and for accepting corrections to its observations.
_Avoid_: Admin, maintainer

**Metric Catalog**:
A library of predefined metric descriptions: the entries every Workspace has, and the Workspace's own part, from the Packs it installed. Picking one copies its description into a new metric of your own, with no link back to the catalog.
_Avoid_: Template library, presets

**Archived Metric**:
A Metric kept with its description, values and history that asks for nothing and takes no values, shown only under Archived. It does not count towards the Workspace Limit; bringing it back counts again. Not a Snapshot, which keeps what a dashboard showed; that is why "archive" belongs to Metrics and a Snapshot is never called an archived copy.
_Avoid_: Deleted metric, inactive metric, hidden metric

**Retention**:
How long a Metric's values are kept, set per Metric with a default for the Workspace: none (the default, so nothing is ever lost unasked), or after a number of months either condensed into a Condensed Value or deleted. Condensing needs an Aggregation other than none. Snapshots, decks and View Links keep what they showed; the Audit Log has its own keeping. Not archiving, which sets a whole Metric aside.
_Avoid_: Expiry, TTL, clean-up, purge, archiving

**Condensed Value**:
The one value, with its target, that stands for a longer period (a month for its days) after the periods inside it were condensed by the Metric's Aggregation. It keeps the exact sum and count, so any longer period still comes out as it did before, and is shown as "condensed from daily values". It takes no more values.
_Avoid_: Roll-up, summary value, compaction, downsampled value

**Observation**:
One value of a metric for one period.
_Avoid_: Number, entry, data point, upload

**Breakdown**:
Labelled values that split one observation, such as revenue by country for October, uploaded with it. Labels are free text; the observation's value stays the metric's number even when the rows do not add up to it.
_Avoid_: Dimension, segment, table, drill-down

### Comparing

**Comparison**:
A metric's latest value against an earlier span: the previous period, or the same span one day, week, month, quarter, half-year or year earlier (DoD, WoW, MoM, QoQ, HoH, YoY), as an absolute and a relative change. Spans longer than the metric's period compare to date against the same span before, unless a widget asks for full periods.
_Avoid_: Delta, variance, period over period

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
A scheduled message asking a submitter for a metric's value for the current period, e.g. "How many deals today?" It goes out through the submitter's Connector; where that Connector receives values, answering it records the value, elsewhere it carries the personal form link.
_Avoid_: Reminder, nudge

**Workflow**:
A named, reusable path a metric's value takes each period: ask the submitter, remind, escalate, check, approve, tell, publish and lock. Several metrics can share one, such as "Monthly finance close". Its owner can close a period for all of them at once.
_Avoid_: Process, pipeline, flow

**Period Timeline**:
What happened in one period of a Workflow, in order: who was asked and reminded, which values came in ("5 of 6 in"), Approvals and Actions, what published and locked, and the Snapshots made. It records nothing of its own and shows each person only what they may see: a Metric they cannot see is only a count ("1 value"), and a Thread's words appear only as first words, for a Thread they may read. On the Workflow page, and as the `period_status` tool.
_Avoid_: Activity feed, audit trail, history

**Workflow Template**:
A starting point for a new Workflow: its steps, Due Date and reminders, with the people left open to be picked when it is used. A Workflow made from one is an independent copy.
_Avoid_: Preset, blueprint, process template

**Due Date**:
When a period's value must be in, counted in working days after the period ends, e.g. the 3rd working day.
_Avoid_: Deadline, cut-off

**Schedule**:
What one person has to do in a Workspace, day by day: values to submit by their Due Dates, Approvals waiting for them, and Tasks and Questions assigned to them, upcoming and overdue. It holds only their own duties, and only about Metrics they may see; while someone is Away, what they are asked for is in their Stand-in's Schedule.
_Avoid_: Agenda, to-do list, inbox, calendar

**Stand-in**:
The person asked instead of a submitter who is Away, or who has not answered by the Due Date.
_Avoid_: Deputy, backup, substitute

**Away**:
The dates a person is not available. While someone is away, Prompts meant for them go to their Stand-in.
_Avoid_: Absence, out of office, leave

**Escalation**:
A Workflow step that, when a value is still missing, asks the Stand-in or tells the metric owner.
_Avoid_: Warning. Not an Alert, which a person sets for themselves and which asks nobody for anything

**Unusual Value**:
A value that changes more than a set share against the period before, or falls outside the target. Only unusual values need Approval. An Import is not checked.
_Avoid_: Outlier, anomaly

**Approval**:
Confirming a value before it counts, by each Approver in order: an Unusual Value, or every value where the Workflow's Approve step says so. An Import of a Feed's history does not wait for it. An approver can approve it, send it back to the submitter with a comment, or correct it. Until it is approved the value shows, marked as not approved yet. Nobody approves their own value: when nobody else could, the Approve step says whether a Self-check takes its place or the value counts without Approval, with a note saying so.
_Avoid_: Sign-off, review, verification

**Self-check**:
The submitter checking their own value when an Approval is needed but nobody else could give it, as in a Workspace of one person: they confirm it or correct it. It is recorded as confirmed by the submitter, never as an Approval, and it is the Approve step's default for that case. As soon as someone else could approve, Approval applies again.
_Avoid_: Self-approval, own approval

**Period Record**:
One Metric's page for one period (`/metrics/churn-rate/2026-03-01`): its value and state, every step the value went through in order (submitted, replaced, Correction proposed and decided, approved, sent back, published, locked, unlocked with its reason) with person, channel and date, and the Threads about it that the person may read. Only for people who see the Metric.
_Avoid_: Value page, audit trail, timeline (a Workflow's timeline lists many periods)

**Search**:
Finding a Metric, dashboard or deck by name from the top bar (⌘K or Ctrl+K), or a Metric's value for a period by words such as "churn march 2026": the period words are read like replies, in the Workspace's Answer Languages, and lead to the Period Record. It only finds what the person may see, in their own Workspace; Archived Metrics are marked. Programs use the MCP tool `find` and `GET /api/v1/find`.
_Avoid_: Global search, omnibox, command palette

**Lock**:
A published period of a metric that takes no more values. A late value or a correction becomes a proposal that needs Approval again; only the metric owner unlocks it, with a reason.
_Avoid_: Freeze, finalize, close

### Presentation

**View**:
A way of drawing a metric, such as a number with sparkline, a line chart, bars, a gauge or a history table. Ziffr ships its own Views; more can be added to a Workspace as View Designs.
_Avoid_: Chart type, visualization plugin

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
A word in a template's text that is filled in from the data when the template is used, such as the metric's name, the latest period or the change against last year.
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
A Widget Template, Dashboard Template, saved widget or metric drawn small before it is placed, without its menus. A template's Preview draws Sample Data; a saved widget's or a metric's draws the viewer's own data.
_Avoid_: Thumbnail, mock-up

**Sample Data**:
Made-up metrics and values that a template's Preview draws, because a template has no metrics of its own. The same for everyone and never a workspace's data.
_Avoid_: Dummy data, fake data, demo data

**Dashboard**:
A canvas of widgets that a user arranges and can share, to watch numbers as they come in. It has a name and may have an introduction, and reads two ways: *Grid*, as arranged, and *Read*, the introduction and then its widgets one below the other in reading order, for a phone or to explain what happened. Ziffr opens on a person's Home dashboard, which they choose.
_Avoid_: Board, report, page, story

**Analysis Canvas**:
A workspace where a user drops one or more metrics and runs analyses on them.
_Avoid_: Workbench, lab

**Playground**:
The page under Analyze where a View Design or an Analysis Recipe is pasted or uploaded, checked as it is typed, with every mistake named by its line, and drawn at once with Sample Data or with the person's own Metrics. Nothing typed there is kept unless an Owner or Admin adds it to the Workspace. Not the Analysis Canvas, where Metrics are analysed.
_Avoid_: Editor, sandbox, studio

**Analysis**:
A statistical method run on one or more metrics, such as forecast, correlation, clustering or impact analysis. Its result can be saved as a widget. Ziffr ships its own Analyses; more can be written as Analysis Recipes.
_Avoid_: Stats, model, insight

**Analysis Recipe**:
An Analysis written as steps of Ziffr's verified functions over the Metrics in its Slots. It holds no code, so every number it gives is verified.
_Avoid_: Script, model, custom analysis, formula

**Common Period**:
The period two Metrics are compared on in an Analysis: the longer of their own periods, the shorter Metric combined to it by its Aggregation ("compared by month"). A Metric whose Aggregation is none has no Common Period with Metrics of another period.
_Avoid_: Shared grain, joint period

**Recipe**:
A ready-made analysis setup that runs with one click, e.g. "What drives Cost?"
_Avoid_: Preset analysis, template

### Decks

**Deck**:
An ordered set of slides that a user designs from widgets, text, arrows and shapes, and exports as a presentation.
_Avoid_: Presentation, slideshow, report

**Slide**:
One 16:9 page of a deck. Its order follows its position on the deck canvas, left to right and top to bottom.
_Avoid_: Page, frame, board

**Theme**:
A named look for everything that shows numbers: colours for text, surfaces, data, good, bad and the target band, the fonts for headlines, text and figures, how cards are drawn, and what every slide shows (logo, footer, slide number, background image, type sizes). The team has one default theme; a dashboard or deck may use another, and a deck may set its own footer. A slide may hide the logo, footer and number. Ziffr's own screens keep their look. Only the workspace owner changes themes.
_Avoid_: Master, skin, style, brand kit, palette

**Snapshot**:
What something showed, fixed so it never changes when observations do. A dashboard's Snapshot keeps the dashboard as it stood for one week, month, quarter, half-year or year (quarters, half-years and years of the Fiscal Year, such as "Q1 FY 2026/27", "H2 2026" or "2026"): its layout and the values of every Metric period complete by the period's last day. Its numbers never change, and a value corrected since is shown with a note of what it is now; its words (the introduction, each Finding's headline and sentences) are written after it is taken, and every change is a Version. It is a draft for the dashboard's owner and Editors until one of them shows it; then whoever may open the dashboard may open it, and sees in it only the Metrics they may see now. Its owner may have the dashboard take one of every week, month, quarter, half-year or year by itself, once every Metric on it is Locked for each of its periods inside it (for a year of a monthly Metric, all twelve months) or a set number of days after it ends. A deck's Snapshot is the values its widgets show at the moment it is exported, stamped with that date.
_Avoid_: Copy, freeze, archived copy, export data

### Sharing

**Workspace**:
One team's own space in Ziffr, with its people, metrics, dashboards, decks, themes and connectors. A person can belong to several and switches between them; nothing is shared across workspaces.
_Avoid_: Tenant, organisation, account, company

**Trial Workspace**:
A Workspace on an Installation that offers trials, made by one person to try Ziffr. Its Connectors are real but reach only its Owner, nobody can be invited to it, and a set number of days after it was made it is deleted, or, where the Installation keeps trials, becomes an ordinary Workspace with the Installation's default Workspace Limit. On such an Installation every Workspace is one. It starts with the Test Metric only, a Workflow that asks its Owner for it each day and a small dashboard showing it: nothing made up, so its first value is the Owner's own.
_Avoid_: Sandbox, test workspace, free trial

**Trial Guide**:
The few steps a new Trial Workspace opens on, one at a time: where Ziffr should ask its Owner, connecting those ways, Ask me now on the Test Metric, and its first value arriving. Each step can be skipped; until its Owner reaches the end or skips the whole guide, the trial's home and Try it lead back to it at the step reached. It sets the one way the Owner is asked each day: the first picked of Telegram, Slack and email. At its end it shows the ways in that need no asking: an assistant through the MCP Server, and a program through a Feed it can make with its Feed Key. Try it stays as the reference of every way.
_Avoid_: Wizard, onboarding, tour

**Test Metric**:
The Metric a Trial Workspace has for the Trial Guide to ask for: Cups of coffee, asked of the Owner daily, answered by hand and without history, so the first value it holds is the Owner's own.
_Avoid_: Demo metric, sample metric

**Installation**:
One running Ziffr: its app, its database and its keys, reached at one address. It can hold many workspaces, and whoever runs it decides its settings, such as whether it offers the demo and whether it offers Trial Workspaces.
_Avoid_: Instance, deployment, server, tenant

**Installation Admin**:
A person who runs an Installation as a whole: they open its Installation Settings and add or remove other Installation Admins, never the last one. It is not a Workspace Role: an Owner of every Workspace is not one, and being one shows no Workspace's data. The first one claims the Installation with a one-time setup code that Ziffr writes to its server log while it has none; the server's settings can also name them by address.
_Avoid_: Superadmin, root, system administrator

**Installation Settings**:
What an Installation talks to, such as its mail server, set by an Installation Admin on a page of its own instead of in the server's environment. A value set in the environment wins and is shown as set on the server; secret values are sealed and never shown again. Settings of a Workspace are not Installation Settings.
_Avoid_: Admin settings, system settings, global config

**Workspace Limit**:
The most Metrics a Workspace may hold, Archived Metrics not counted, set for it by an Installation Admin or by Ziffr Cloud, or else the Installation's default; without any there is no limit, as on most self-hosted Installations. A Workspace over it keeps everything working and keeps collecting values; only new Metrics wait, after 14 days with room for 10 % more.
_Avoid_: Quota, cap, allowance, plan

**Size**:
What a Workspace on hosted Ziffr is booked for, named by how many Metrics it may hold: Free, Small, Team, Business, or larger on request. Every Size has every feature and any number of members. In Ziffr itself a Size is a Workspace Limit with a name; its price is known only to Ziffr Cloud.
_Avoid_: Plan, tier, package, edition, subscription

**Ziffr Cloud**:
The private service that runs hosted Ziffr's billing: Sizes, prices, payments, invoices and the Marketplace. It sets Workspace Limits through an API of its own, which can read a Workspace's count of Metrics and nothing of its data.
_Avoid_: Billing service, SaaS, hosted edition

**Pack**:
A file of things to add to a Workspace, with no code: Metric Catalog entries, Dashboard and Deck Templates, View Designs, Analysis Recipes, Workflow Templates and Themes, with its name, version, author and license. Installing one copies each thing into the Workspace, marked with the Pack and version; it makes no Metric until a person sets it up. New versions are offered, never applied by themselves, and uninstalling removes what nobody changed.
_Avoid_: Plugin, extension, add-on, integration, app, bundle

**Marketplace**:
Ziffr's catalogue of Packs, checked before they are listed, and of programs outside Ziffr that work with it, such as Feeds. Packs are installed from it into a Workspace; programs outside Ziffr are only listed, and their creators bill for them themselves.
_Avoid_: Store, app store, gallery, hub

**Webhook**:
An address that a Workspace's Owner or Admin sets so that Ziffr sends it signed messages about what happens there, such as a task given, a task done or a value recorded, for a program to pass on to another system. It belongs to the Workspace, like a Feed, and sees only what every Member sees; other things reach it with their words left out. It can mark a task done, reply to a thread or answer a question, as the Webhook, but only for tasks that were sent to it. Not a Connector, which reaches a person.
_Avoid_: Callback, trigger, integration, subscription

**Automation Template**:
An importable file for an automation tool such as n8n that joins a Webhook to another system, such as Microsoft To Do, Google Tasks, Slack, Asana or Todoist. It lives in the repository; Ziffr never runs it or holds the other system's credentials.
_Avoid_: Recipe (that is an Analysis Recipe), plugin, integration, flow

**Workspace Key**:
The key a Workspace's sensitive data is encrypted with in the database: its values, the words people write and its Contacts' details. Each Workspace has its own, kept only wrapped by the Installation's key, and deleting the Workspace destroys it, so what is left of the Workspace can no longer be read. It is not end-to-end encryption: the Installation reads the data to check, combine and send it. The demo has none.
_Avoid_: Tenant key, encryption key, data key, customer key

**Installed app**:
Ziffr added to a phone's home screen or a computer's dock from the browser, so it opens in a window of its own. It is the same Ziffr as in the browser, needs a connection and keeps no Workspace data on the device; there is no native app. Not an Installation, which is a running Ziffr on a server.
_Avoid_: PWA, native app, mobile app, offline mode

**Workspace Profile**:
What kind of business a Workspace belongs to: its industry, who it sells to (B2B, B2C, B2B2C, public sector, non-profit), its country and currency, and how many people and how much revenue it has, each picked from a fixed list. Ziffr uses it to suggest Metrics; teams within a workspace are Groups, not part of it.
_Avoid_: Classification, company profile, firmographics, tenant settings

**Number Style**:
How a Workspace writes numbers: how digits are grouped and which mark is the decimal, such as 1,234.5 or 1.234,5. It also settles how an ambiguous number such as 1.500 is read.
_Avoid_: Locale, number format, regional settings

**Answer Language**:
A language whose words Ziffr understands in an answer, such as "last week" or "letzte Woche" naming the period. A Workspace reads answers in the ones it chooses: English and its country's languages unless an Owner or Admin picks others.
_Avoid_: Locale, input language

**Workspace Role**:
What a person may do in a Workspace as a whole. A Workspace Owner manages settings, themes, groups, members and billing; a Workspace Admin does the same except billing and removing owners; a Member creates and shares metrics, dashboards and decks; a Guest only sees what is shared with them, answers questions and submits values, and creates nothing. A workspace can have several owners.
_Avoid_: Permission level, admin rights

**Invitation**:
An offer to join a Workspace with a Workspace Role, made by an Owner or Admin. One sent to an email address is accepted once, by that address; a link works for anyone who has it until it ends or is revoked. Inviting a Contact makes them a member who keeps their history.
_Avoid_: Invite code, access grant

**Domain Joining**:
A Workspace setting, off by default, that lets people with a verified address at the company's domain ask to join; an Owner or Admin lets each one in.
_Avoid_: Auto-join, SSO

**Contact**:
A person known to a Workspace who has no login, such as a field worker or an outside bookkeeper who submits values by Slack, email or the form. A contact can be invited later and then becomes a Member or Guest.
_Avoid_: External user, anonymous submitter

**Access Key**:
A secret a person creates so a program can use the API on their behalf, limited to some actions (reading metrics, submitting values, creating metrics owned by that person, changing the Target Range, Target Series, Projections, Sources and Submitters of the metrics that person owns or edits and the Unusual Value check of the Workflows they own, reading dashboards, building dashboards as that person), bound to one Workspace and ending on a set date. Owners can see and revoke every access key in their workspace; Admins can see every key and its Access Log. An assistant that connects by address, such as Claude.ai, holds an access key of the kind assistant: made when a person approves it on Ziffr's consent screen, and used through short-lived OAuth tokens instead of a secret anyone sees; disconnecting it revokes the key. Not to be confused with a Token, which lets a submitter record values for one metric.
_Avoid_: API token, personal access token, credential

**Feed Key**:
An Access Key that acts for a Feed instead of a person. It can only record values for the metrics that Feed submits to, and see their descriptions and which periods already have a value, never the values themselves or the workspace's people. Owners and Admins create and revoke it.
_Avoid_: Service account, bot token, connector key

**MCP Server**:
The program that lets an AI assistant read a workspace's metrics, submit values, change targets and Projections and build dashboards through the API, with an access key. It runs on the person's own computer, or at the Installation's own address `/mcp` for assistants that connect over the internet, and sees no more than the key does.
_Avoid_: AI integration, plugin, connector (a Connector is how Ziffr reaches people)

**Starter**:
A ready-made request the MCP Server offers an assistant, which a person picks instead of writing it themselves, such as a weekly review of the Metrics, recording values from a sentence, or proposing a dashboard. It is only words for the assistant: it reaches Ziffr through the same tools and access key, so it can do nothing the person could not ask for. MCP calls it a prompt. Not a Dashboard Template, which a dashboard is built from.
_Avoid_: Prompt (a Prompt asks a submitter for a value), template, preset, recipe

**Access Log**:
The record of every call a program made with an access key: when, what it asked for, and whether it worked. Owners and Admins see it for every key in their workspace, a person for their own keys.
_Avoid_: Audit trail, request log, API history

**Demo Mode**:
A visit to the demo workspace: a made-up company anyone can look around without an account, switching between its made-up people to see each one's view. Nothing a visitor does changes it or is saved; every change is refused with one sentence that points to a Trial Workspace. It sits next to real workspaces and never reaches them, and an installation can switch it off. Its Connectors are all simulated and it has no Access Keys; trying them for real is what a Trial Workspace is for.
_Avoid_: Sandbox, test mode

**Share**:
Giving another user or a Group access to a metric or a dashboard. Sharing a dashboard also gives view access to every metric on it.
_Avoid_: Invite, publish

**View Link**:
A link that shows one dashboard or deck to someone outside the team, without logging in and without being able to change or ask anything. It expires on a set date and can be revoked. It shows live numbers; for a deck, numbers frozen when it was made; for a dashboard, one of its Snapshots once shown, which ends the link when it is deleted.
_Avoid_: Public link, guest access, embed

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
An earlier value of an observation or breakdown row, kept when an overwrite or correction replaced it, with the time it was replaced.
_Avoid_: Old value, previous version, overwritten value

**Audit Log**:
The record of who changed who may see or do what in a Workspace, and of the decisions taken on numbers: roles, removals, invitations, joining, Shares, Groups, View Links, Access Keys, Locks, Approvals, Corrections, Snapshots taken, shown and deleted, settings, exports and sign-ins. Each event names the person, the kind, the object as it was named then, the time and small details such as the old and new role, never a value or a message. Nothing in it can be changed or removed; it keeps two years. Owners and Admins read and export it. Not the Access Log, which records a program's calls, nor a Version, which keeps what something looked like.
_Avoid_: Audit trail, activity log, event log, history

### Collaboration

**Action**:
A question or task about a specific observation or time range of a metric that one user assigns to another. It moves from open to answered to closed, and can be reopened.
_Avoid_: Ticket, request, to-do

**Question**:
An action that is done once the assignee has answered it, e.g. "Why is cost so high this month?"
_Avoid_: Inquiry

**Task**:
An action that is done once the assignee has carried it out, e.g. "Renegotiate the shipping rate", optionally with a due date.
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

**Delivery**:
One message Ziffr sends through a Connector to one person: a new question or task, a reminder, a reply, a proposed correction or a closed task. Answers to it come back into the Thread.
_Avoid_: Notification, outbox item, message

**Outbox**:
Every Delivery, newest first, with what it said and where it went. An email, Slack or Telegram one also shows whether it was really sent, is waiting or failed; the other Connectors only record it.
_Avoid_: Sent items, log

**Tell**:
A Workflow step, set by the Workflow's owner, that tells named people and Groups when a Metric of the Workflow reaches a share of its target, reaches or falls below a value, or changes more than a share against the period before. It works like an Alert for a team: once per crossing, only for published or approved values, never for an Import, each person told through their Delivery Preference and only if they can see the Metric at that moment, the rest skipped silently. A Group is expanded to its people, never a channel. A Workflow holds at most three Tell steps, each tells at most 20 people, and each person can stop it for a Workflow ("stop telling me"). Not an Alert, which is a person's own request, nor an Escalation, which acts on a missing value; its messages cannot be answered.
_Avoid_: Notify, notification

**Alert**:
A person's own standing request, on one Metric they may see, to be told through their Delivery Preference when its latest value reaches a share of its target, reaches or falls below a value, changes more than a share against the period before, or is still missing after its Due Date. It fires once per crossing, only about values that are published or approved (unless the person includes the rest), never for an Import, and stops silently when the person can no longer see the Metric. It asks nobody for anything and cannot be answered. Not an Unusual Value, which needs Approval, nor an Escalation, which acts on a missing value for the people responsible. A team is told by a Workflow's Tell step, never by Alerts set for others.
_Avoid_: Notification, subscription, trigger, watch, threshold

**Delivery Preference**:
Where a person wants to get questions, tasks, reminders and replies. The team sets a default; whoever sends may choose another for one message.
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
The Feed, in Ziffr's own repository, that reads an Installation's Usage totals and records them as Metrics in the operator's own Workspace. It runs outside Ziffr, from the Docker clock or any cron, only when its keys are set.
_Avoid_: Telemetry, phone-home, reporting job
