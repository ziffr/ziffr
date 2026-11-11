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

### Input

**Source**:
A channel through which observations arrive, such as mail, a messenger, Slack or a web form.
_Avoid_: Input, integration, connector

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
A scheduled message asking a submitter for a metric's value for the current period, e.g. "How many deals today?"
_Avoid_: Reminder, nudge

### Collaboration

**Action**:
A question or task about a specific observation or time range of a metric that one user assigns to another, e.g. "Why is cost so high this month?" It moves from open to answered to closed, and can be reopened.
_Avoid_: Task, ticket, request, to-do

**Assignee**:
The user an action is assigned to.
_Avoid_: Owner, responsible

**Thread**:
The replies between asker and assignee on an action.
_Avoid_: Conversation, chat, comments

**Correction**:
A change to an observation proposed in an action's thread, which takes effect once the metric owner accepts it.
_Avoid_: Fix, edit, amendment
