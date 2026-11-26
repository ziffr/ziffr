# 0062 A formula can read a Metric's target: `target({commit}) - {commit}`

**Status:** in progress. **Tracking issue:** #1221 (label `tracking`); tickets #1222 (the formula) and #1223 (the forecast Pack). **Approved** by the owner on 2026-11-26. The decisions at the end were taken while writing it and accepted by the owner the same day. Builds on the formulas of Derived Metrics (spec 0022 holds their rules).

## Problem Statement

A Metric has a target: a Target Series for single periods, else its Target Range. Ziffr draws it, colours values by it and computes Attainment from it, but a formula cannot read it. So whoever wants "how much is missing" makes a second Metric for the number they already set: the weekly sales forecast Pack has a Metric Quota that somebody must send every week, unchanged, or the week has no gap and no pipeline coverage. The quota then lives in two places, and the two can disagree.

## Solution

A formula may say `target({commit})`: the target of the Metric Commit for the period being worked out. The sales forecast Pack uses it, so the quota is set once, as Commit's target.

## User Stories

1. As a sales lead, I set the quota once for the quarter as Commit's target, and the gap, the share of quota, the pipeline coverage and the slides follow it.
2. As them, when a period's target differs (a new quarter, a Target Series), the numbers of each period use that period's target.
3. As anyone reading a number, I never see one worked out from a guessed target.
4. As a Metric Owner, a formula reading my target needs the same rights as one reading my values.
5. As someone with a set-up that has a Quota Metric, nothing changes unless I change it.

## Implementation Decisions

### The rule

`target({slug})` takes one Metric and nothing else (no arithmetic inside, not `prev`). It stands where a value stands: `{pipeline} / (target({commit}) - {closed})`.

For one period of that Metric it is:

| The Metric has | `target()` gives |
| --- | --- |
| A Target Series value for the period | that value |
| No value in the series, a Target Range with one bound (“at least 500”, “at most 40”) | that bound, whatever the Metric's direction |
| No value in the series, a range whose two bounds are the same number | that number |
| No value in the series, a range with two different bounds | no value: a band is not a number, and Ziffr takes neither end and no middle |
| Neither | no value |
| A Target Series value that cannot be read | no value, never the range instead |

**And the Metric needs a value in the period too.** `target({commit})` is part of what Commit says about a period; as for every input, a period in which Commit has no value has no result, even where the formula reads only the target. So a Derived Metric has the periods its inputs have, a formula made of targets alone is well defined, and a period whose values Retention removed can never be worked out from today's range.

No value is no value: the period stays empty, never 0. A Metric page says why when a Derived Metric is empty because an input has no usable target.

### An input like any other

The Metric inside `target()` is an input of the formula in every respect:

- **Who may use it:** only a Metric the maker owns or edits; the Derived Metric's owner must keep that right, or it shows no values. A Metric the person may not see answers as one that does not exist.
- **Who sees it:** a result reveals the target to whoever the Derived Metric is shared with, as it reveals values. The formula's text is shown only to those who see every input.
- **What it may be:** the same period as the Derived Metric, with an Aggregation other than none (unless the formula uses `prev` or `change`), never a Derived Metric and never the Metric itself. So a formula still cannot reach itself, however far round, and no new cycle is possible.
- **Deleting and Retention:** the Metric cannot be deleted while a formula reads it, its values cannot be deleted by a Retention, and they cannot be condensed into longer periods than the Derived Metric's.

### Longer periods, comparisons and Display Periods

A Derived Metric combines through its inputs. Over a longer span, `target({x})` is the target Ziffr draws for x over that span, and it is stricter where the span is mixed:

1. Each of x's periods counted in the span (up to the cut, for a span to date) has a Target Series value: they are combined by x's Aggregation (sum, average, last value).
2. Some have one and some do not: no value. Ziffr does not mix a series with a range.
3. None has one: the Target Range's one number for an average or a last value; none for a sum, since "at least 100 a month" is not a number for a quarter.
4. A span of exactly one period follows the rule for one period, whatever the Aggregation.
5. A span that overlaps a Condensed Value of x has no value.
6. Aggregation none: no value over more than one period.

As before, x's own values count for a span once at least half of its periods have one, and a formula with `prev` or `change` is shown by its own period only.

### History: a changed target changes derived values

Derived values are not stored. They are worked out when they are shown.

| | What happens |
| --- | --- |
| A target changed | Every period that reads it shows the new result at once, past periods included. A Target Range has no history, so a target that changes over time, such as a quota, is best kept as a Target Series, one value per period: the guide says so. |
| A Lock | Locks values, not targets: a locked period's derived value follows the target. |
| A Snapshot | Keeps the values it showed, derived ones included, with the targets as they were when it was taken. Where today's result differs, it says so as for any changed value. |
| A View Link | A live one follows; a frozen one keeps what it showed. |
| Retention | As above: an input keeps its periods; a condensed period has no target to read. |
| Alerts, Tell steps | A changed target does not run them again; they run when values arrive, as today. |

### Where else it shows

- **Formula Tree:** `target({commit})` is a box "Target of Commit" with its number.
- **What if** does not follow a formula that reads a target; it names the Metric as left out, as it does for `prev`.
- **API, MCP Server:** a formula is the same text; the descriptions name `target()`.
- **Workspace Export and import:** carry the formula as written; Target Series and Target Ranges are exported already.
- **Packs:** a formula of a Metric Catalog entry may read `target({key})` of another entry, under the same rules.
- **Calculation Catalogue:** a row per rule, a reference implementation and hand-worked cases.
- **Older versions** refuse in words and make nothing: a formula in the app or a Pack answers `"t" cannot be read: a formula has + - * /, brackets, numbers and {metric}` (in a Pack file `{key}`).
- No migration: formulas are text.

### The weekly sales forecast Pack

- **Quota** becomes a calculated Metric, `target({commit})`: nobody sends it, and every dashboard widget and slide that shows Quota follows Commit's target.
- **Gap** `{commit} - target({commit})`, **share** `{commit} / target({commit}) * 100`, **coverage** `{pipeline} / (target({commit}) - {closed-quarter})`.
- **Set the quota as Commit's Target Series,** one value for each week of the quarter, entered or pasted in one go. This is what the Pack and the guide recommend: each week then keeps the quota that was true for it. A Target Range "at least <quota>" is quicker for a first try, but it has no history: changing it rewrites the gap, share and coverage of every past week that has no series value.
- **The gap by salesperson** needs a quota per person, which one target cannot hold. An optional Metric **Quota by salesperson**, sent with a Breakdown, fills that slide and nothing else, until each salesperson has Metrics of their own (spec 0058, team totals).
- **Existing set-ups** with a Quota Metric keep working: their formulas and decks are their own copies. The guide says how to switch: set Commit's target and change the three formulas.

## Testing Decisions

- The reference implementation reads `target()` apart from the code; hand-worked cases for every row of both tables.
- Server series, Display Periods, comparisons and the Formula Tree agree for the same data.
- Database tests: making and changing such a Derived Metric needs the right to share the input; a viewer of the Derived Metric alone gets its values and never the formula or the input; losing the right empties it; deletion and Retention are refused.
- A security review of the diff before it is done.

## Tickets

| Ticket | What | Blocked by |
| --- | --- | --- |
| #1222 | `target()` in formulas: core, screens, Pack format, docs | |
| #1223 | The sales forecast Pack reads Commit's target | #1222, pull request #1175 |

## Out of Scope

- A target's lower and upper bound as two functions (`targetMin`, `targetMax`).
- Reading a Derived Metric's target.
- A history of Target Ranges.
- `prev(target({x}))`.
- Team totals over a Repeat (spec 0058).

## Decided by the owner (2026-11-26)

1. A two-sided range gives no value, also for "higher is better", where Attainment would take the lower bound.
2. `target({x})` needs x's value for the period too: coverage is empty in a week without a Commit.
3. Over a longer span, a Target Series that covers only some periods gives no value, although the chart then falls back to the range.
4. A Lock does not freeze targets, and a changed Target Range rewrites past periods' results.
5. The Pack keeps an optional "Quota by salesperson" for the gap slide until Repeats are built.
6. A quota is kept as a Target Series per period; the guide and the Pack recommend it and say why.
