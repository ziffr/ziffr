# Ziffr

An app that collects numbers from anywhere, keeps them over time, and lets people visualize, analyze, discuss and act on them.

## Language

### Metrics

**Metric**:
A named, fully described number tracked over time. It must be defined before any value can be recorded for it.
_Avoid_: Number, KPI, measure, series

**Metric Description**:
Everything that defines a metric: name, description, unit and format, period, submission rule, sources, target range, polarity, owner and, for a derived metric, its formula.
_Avoid_: Settings, config, schema

**Derived Metric**:
A metric computed by a formula from other metrics. It never receives observations directly.
_Avoid_: Calculated field, formula metric

**Aggregation**:
How a metric's values combine into a longer period: summed (revenue, deals), averaged (a score), the last value (a balance), or not at all (a rate).
_Avoid_: Roll-up, rollup method, combine rule

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
_Avoid_: Threshold, goal, limits

**Metric Owner**:
The user responsible for a metric's description and for accepting corrections to its observations.
_Avoid_: Admin, maintainer

**Metric Catalog**:
A library of predefined metric descriptions. Picking one copies its description into a new metric of your own, with no link back to the catalog.
_Avoid_: Template library, presets

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
How far a value reaches its target, as a percentage where higher is always better, whichever way the metric's polarity runs.
_Avoid_: Achievement, target fulfilment, performance

### Input

**Connector**:
A link between Ziffr and an outside system, such as Slack, email, WhatsApp, a ticket system or the web form, and what it can do there: receive values, send reminders, send questions and tasks, bring replies back, keep a task's status in step.
_Avoid_: Integration, plugin, channel

**Source**:
A Connector used to receive observations, such as mail, a messenger, Slack or a web form.
_Avoid_: Input, integration

**Submitter**:
A user allowed to record observations for a given metric.
_Avoid_: Reporter, contributor

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
A named, reusable path a metric's value takes each period: ask the submitter, remind, escalate, check, approve, publish and lock. Several metrics can share one, such as "Monthly finance close". Its owner can close a period for all of them at once.
_Avoid_: Process, pipeline, flow

**Due Date**:
When a period's value must be in, counted in working days after the period ends, e.g. the 3rd working day.
_Avoid_: Deadline, cut-off

**Stand-in**:
The person asked instead of a submitter who is Away, or who has not answered by the Due Date.
_Avoid_: Deputy, backup, substitute

**Away**:
The dates a person is not available. While someone is away, Prompts meant for them go to their Stand-in.
_Avoid_: Absence, out of office, leave

**Escalation**:
A Workflow step that, when a value is still missing, asks the Stand-in or tells the metric owner.
_Avoid_: Alert, warning

**Unusual Value**:
A value that changes more than a set share against the period before, or falls outside the target. Only unusual values need Approval.
_Avoid_: Outlier, anomaly

**Approval**:
Confirming an Unusual Value, by each Approver in order. An approver can approve it, send it back to the submitter with a comment, or correct it. Until it is approved the value shows, marked as not approved yet.
_Avoid_: Sign-off, review, verification

**Lock**:
A published period of a metric that takes no more values. A late value or a correction becomes a proposal that needs Approval again; only the metric owner unlocks it, with a reason.
_Avoid_: Freeze, finalize, close

### Presentation

**View**:
A way of drawing a metric, such as a number with sparkline, a line chart, bars, a gauge or a history table.
_Avoid_: Chart type, visualization plugin

**Story Widget**:
A widget set as an editorial graphic: a frame of kicker, headline stating the finding, subline, footnotes and source, around one or more panels.
_Avoid_: Infographic, chart card, editorial chart

**Panel**:
One chart inside a story, such as ranked bars, period bars, a bridge or an annotated line, showing one measure of one or more metrics. Several metrics in one panel are drawn side by side as small multiples.
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
A starting point for a new widget or story: a view, its settings and, when the team saved it, its words and annotations, with the metrics left open as Slots. Ziffr ships built-in templates; anyone can save a widget as a team template, which only its creator edits. If none is chosen, the default template is used.
_Avoid_: Preset, widget type, blueprint

**Slot**:
A place in a Widget Template that is filled with a metric when the template is used. A slot takes exactly one metric, or one or more for small multiples.
_Avoid_: Variable, parameter, input

**Placeholder**:
A word in a template's text that is filled in from the data when the template is used, such as the metric's name, the latest period or the change against last year.
_Avoid_: Token, variable, merge field

**Widget**:
One metric drawn with a view and its settings, such as time window, target band or visible history. A saved widget can be reused; placing it on a dashboard places an independent copy.
_Avoid_: Tile, card, panel, chart

**Pool**:
The side panel that holds everything a user can drag onto a canvas: the metrics they can see and their saved widgets.
_Avoid_: Library, palette, sidebar

**Dashboard**:
A canvas of widgets that a user arranges and can share.
_Avoid_: Board, report, page

**Analysis Canvas**:
A workspace where a user drops one or more metrics and runs analyses on them.
_Avoid_: Workbench, lab, playground

**Analysis**:
A statistical method run on one or more metrics, such as forecast, correlation, clustering or impact analysis. Its result can be saved as a widget.
_Avoid_: Stats, model, insight

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
The values a widget shows at the moment a deck is exported, stamped with that date. An exported deck never changes when observations do.
_Avoid_: Copy, freeze, export data

### Sharing

**Share**:
Giving another user or a Group access to a metric or a dashboard. Sharing a dashboard also gives view access to every metric on it.
_Avoid_: Invite, publish

**Group**:
A named set of users, such as Management or Sales, that things are shared with or a Thread is limited to. Whoever joins a group gets what was shared with it. The workspace owner manages groups.
_Avoid_: Team, role, department

**Viewer**:
A user a dashboard or metric is shared with who can look at it, inspect history and assign actions, but not change it.
_Avoid_: Reader, guest

**Editor**:
A user a dashboard is shared with who can also arrange its widgets.
_Avoid_: Collaborator, co-owner

### Governance

**Version**:
A saved state of something people build (a widget, story, dashboard, deck, master or metric description) with its author, time and an optional message or name. Edits by one person within ten minutes form one version; restoring a version creates a new one.
_Avoid_: Revision, snapshot, commit, backup

**Superseded Value**:
An earlier value of an observation or breakdown row, kept when an overwrite or correction replaced it, with the time it was replaced.
_Avoid_: Old value, previous version, overwritten value

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
The replies between asker and assignee on an action. Everyone can read it, unless the asker limits it to a Group; the people on it can always read it.
_Avoid_: Conversation, chat, comments

**Correction**:
A change to an observation proposed in an action's thread, which takes effect once the metric owner accepts it.
_Avoid_: Fix, edit, amendment

**Delivery**:
One message Ziffr sends through a Connector to one person: a new question or task, a reminder, a reply, a proposed correction or a closed task. Answers to it come back into the Thread.
_Avoid_: Notification, outbox item, message

**Outbox**:
Every Delivery, newest first, with what it said and where it went.
_Avoid_: Sent items, log

**Delivery Preference**:
Where a person wants to get questions, tasks, reminders and replies. The team sets a default; whoever sends may choose another for one message.
_Avoid_: Notification settings, routing
