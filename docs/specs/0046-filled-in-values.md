# 0046 Filled-in Values: someone fills in the blank, the value stays the submitter's

**Status:** draft. **Tracking issue:** #799 (label `tracking`); tickets #800 to #803 carry `spec:0046`. Built after spec 0045 (its last ticket, #794) and after #798 (handing over a Metric, PR #804).

## Problem Statement

A Workflow asks the submitter, reminds them, and on the Due Date asks their Stand-in or tells the Metric's owner. When the number still does not come, the close stalls: "5 of 6 in" stays at 5 until someone chases the person. In practice the controller or a colleague knows the number, or can look it up, and would type it in for them. Ziffr gives them no good way to do it. The owner, in his words: "something in the system that helps us fill in the blank. If somebody for whatever reason does not submit a value, somebody else will, but that number will then still count towards the ownership of the submitter."

### What exists today

Read from the code on `main` (2026-11-22):

- **Only someone with a Token records a value.** The Metric's owner, the Workflow's owner, an Owner or Admin who does not submit the Metric cannot record a value for the current period (`record-own-value.ts`: "an Owner or Admin who does not submit it does not record it here either"). The one way around it is a paste recorded as history (`paste-values.ts`, `mayRecordHistory`): an Import, only for a past period with no value, which skips the Unusual Value check and is marked as imported. An Import is not the submitter's value and is not meant for this.
- **A Stand-in answers with a Token of their own.** Asking a Stand-in (`deliverPrompt` in `deliveries.ts`) creates or reopens a Token with `submitter_id` = the Stand-in and `stands_in_for` = the submitter, valid for 14 days and only while they are still the Stand-in (`tokens.ts`). The Prompt row names the Stand-in (`prompts.submitter_id`), not whom they stand in for.
- **A Stand-in's answer is recorded as the Stand-in's own value.** `takeValue` (`submissions.ts`) writes `observations.submitter_id` = the sender, the Stand-in. Nothing on the value says it was entered for someone else: only the Stand-in's Token row knows, and that link is lost once the Token lapses or another Stand-in is chosen. The Period Record (`period-record.ts`), the Period Timeline (`period-timeline.ts`), the Metric's History tab, the widget's history panel and the Workspace Export (`submittedBy`) all name the Stand-in as the submitter.
- **The "5 of 6 in" count treats it as in.** The Period Timeline counts a Metric as in once it has any value for the period (`inNow` in `period-timeline.ts`), whoever sent it. The Schedule (`schedule.ts`, `has`) and the Workflow's reminders and Escalations (`latestValue` in `workflow-engine.ts`) also look only at whether the Metric has a value for the period. So the count, the Schedule and the reminders already behave as if the value were in: only the name on it is wrong.
- **Reports count it for the Stand-in.** The Usage page's idle submitters (`usage-report.ts`) count values by `observations.submitter_id`: the absent submitter looks idle for that period, and the Stand-in's Token is not counted as an assignment at all.
- **Approval excludes only the Stand-in.** `onValue` and `approversFor` (`workflow-engine.ts`) leave out the value's `submitter_id`, the Stand-in. The person it was entered for, if they are a named Approver, could approve the value entered for them; and the Self-check, when nobody else could approve, goes to the Stand-in.
- **The API and MCP accept a Stand-in's value.** A Stand-in's Token counts for their Access Key like their own (`candidates` in `takeValue`), so a Stand-in can send the value through `submit_value` today.
- **A Guest can be a Stand-in.** `setStandIn` accepts any member or Contact of the Workspace (`assertSubmittersIn`), Guests included.

### Depends on

- **Spec 0045** (#790, last ticket #794): the period's progress and Period Timeline this spec marks values in.
- **#798, handing over a Metric** (PR #804): with it every Metric always has an owner who is still in the Workspace, because ownership moves to another Member and never ends with someone who leaves. This spec relies on that: the Metric's owner is one of the three who may fill in, and the owner fallback for Approval skips whoever entered the value. Without #798 a Metric whose owner left would have nobody but the Stand-in and the Workflow's owner to fill in, and `mayFillIn` would have to handle an owner who is gone.

## Solution

1. **Filled-in Value.** A value one person enters for a Submitter who has not sent it. It is recorded as the Submitter's value and counts for them everywhere a value counts for its submitter: the Schedule, the period's progress, Approvals, reports and exports. It always carries who entered it, shown as "Entered by Ben for Sara" on the value, in the Period Record, in the Period Timeline and in the Audit Log. It is never hidden that someone else entered it.
2. **Who may fill in:** the submitter's Stand-in when Ziffr asked them for that period, the Metric's owner, and the owner of the Metric's Workflow. Only once the period's Due Date has passed, or at any time while the submitter is Away. Never a Guest, never an Access Key, the API or the MCP Server (for now).
3. **The submitter is told** through their Delivery Preference, waiting out their Quiet Hours, and can replace the value with their own until the period locks. The Filled-in Value stays in the history as a Superseded Value, with who entered it.
4. **Checks as for any value:** the Unusual Value check and the Workflow's Approve step apply. Nobody approves a value they entered, nor a value entered for them.
5. **A Stand-in's answer becomes a Filled-in Value** (decided by the owner, 2026-11-22): when a Stand-in answers the Prompt Ziffr sent them in someone's place, the value is the submitter's, entered by the Stand-in.

## User Stories

1. As a Workflow's owner, I want to enter the missing cost figure for Sara after the Due Date, so that the close goes on without chasing her.
2. As a Metric's owner, I want to enter a value for a submitter who is Away, so that the dashboard is not empty for two weeks.
3. As a Stand-in, I want my answer to count as Sara's value, so that the record says whose number it is and that I only typed it in.
4. As a submitter, I want to be told when someone entered a value for me, with the number and who did it, so that I can check it.
5. As a submitter, I want to replace a value entered for me with my own until the period locks, so that my number is the one that counts.
6. As a submitter, I want a value entered for me to count as mine in my Schedule and in the reports, so that I am not shown as someone who did not deliver.
7. As an Approver, I want a Filled-in Value checked like any other, and never to be asked to approve a value I entered myself.
8. As a Member reading the Period Record or the Period Timeline, I want to see "Entered by Ben for Sara", so that nothing about who typed a number is hidden.
9. As an Owner or Admin, I want each Filled-in Value in the Audit Log, so that I can answer "who put that number in".
10. As a Guest, I want to see names on values only as I see them today, and never to fill in for anyone.
11. As a demo visitor, I want to see one value entered by a Stand-in for a colleague who was Away, and one that the submitter later replaced.

## Implementation Decisions

### Words (glossary, in this spec's pull request)

- **Filled-in Value** (new): a value one person enters for a Submitter who has not sent it, recorded and counted as the Submitter's, always marked with who entered it. _Avoid_: proxy value, on-behalf value, delegated value, substitute value, override, estimate, backfill (an _Avoid_ of Import), placeholder (a template word).
  - Why this name: it is the owner's own picture ("fill in the blank"), and it follows the glossary's pattern for kinds of value (Unusual Value, Superseded Value, Condensed Value). The verb on buttons is "Fill in for Sara…", the mark is "Entered by Ben for Sara".
  - Rejected: **Fill-in** as a noun, because in English a fill-in is a person who substitutes, which is the Stand-in; **Entered-for value**, which reads badly as a noun and in lists ("3 entered-for values"); **Proxy**, which suggests the value is an estimate standing for the real one. It is the real value, just typed by someone else.
  - The person who typed it needs no term of its own: "who entered it".
- Changed entries: **Stand-in** (their answer to a Prompt asked in someone's place is a Filled-in Value; never a Guest), **Approval** (nobody approves a value they entered or one entered for them), **Self-check** (for a Filled-in Value, the submitter it is for), **Period Record** (the "entered for" step), **Period Timeline** (the mark on a value that came in), **Audit Log** (Filled-in Values), **Quiet Hours** (the "entered for you" message waits them out), **Superseded Value** (keeps who entered it). The **Submitter** and **Schedule** entries need no change: a Filled-in Value is the submitter's.

### Who may fill in, and when

| Who | Where | For whom | When |
| --- | --- | --- | --- |
| The submitter's **Stand-in** | Answering the Prompt Ziffr sent them in the submitter's place, by any way a Prompt is answered (reply, Slack, Telegram, the form link, Record a value in the app) | The submitter they were asked for | Only for a Metric and period they were asked about (a Prompt exists for it). Ziffr asks them only while the submitter is Away or after the Due Date, so the conditions below hold by construction; a Stand-in's value for another period is refused: "You stand in for Sara only for the periods you were asked about." |
| The **Metric's owner** | In the app: **Fill in for …** on the Period Record and in the Metric page's Workflow box | Any person who submits the Metric (holds a Token of their own for it) | Once the period's Due Date has passed, or while the submitter is Away |
| The **Workflow's owner** | In the app: **Fill in for …** on a missing value in the Workflow page's period view and on the Period Record | Any person who submits a Metric of their Workflow that they see | Same |

The rules, in one pure function (`fill-in-rules.ts`, `mayFillIn`), and checked again in the core for every way in:

- **Due Date passed:** the Workflow's Due Date for that period (working days after the period ends, as the Schedule counts it), in the Workspace's time zone. A Metric without a Workflow has no Due Date, so it can be filled in only while the submitter is Away.
- **Away:** the submitter is Away on the day of entering, in the Workspace's time zone. Then the current period can be filled in too.
- **The period has no value yet,** and is not locked (a locked period takes a Correction, as today), not condensed, and the Metric is not Derived or Archived.
- **The Metric's Submission Rule is "reject" or "overwrite"** (one value per period). "Add up" and "keep both" combine several people's values in one period and do not keep whose part is whose; filling in for them is out of scope.
- **A person, never a Feed.** A Feed's missing value is the Metric owner's to fix (spec 0012); it has no ownership to keep.
- **Never for oneself:** a submitter's own value is their own, not a Filled-in Value. A Stand-in who also submits the Metric themselves records their own value through their own Prompt; the Prompt they got in someone's place records a Filled-in Value (the Prompt remembers whom it asks for, below).
- **Never a Guest**, even as a Metric's owner or Stand-in; **never an Access Key**, so neither the API nor the MCP Server fills in. Owners and Admins fill in only when they are one of the three above: being an Admin is not a reason to type a number in someone's name.
- **Never in the demo** (read-only, as everywhere).
- **Guests as Stand-ins:** from now on `setStandIn` refuses a Guest ("A Guest cannot stand in for someone"). A Guest already chosen keeps being asked as today, and their answer is recorded as their own value, not as a Filled-in Value; the Metric owner sees "A Guest cannot fill in for Sara: choose another Stand-in" on the Stand-ins list. (Flagged for the owner: the alternative is to remove existing Guest Stand-ins in the migration.)

### Recording it

- **Database (one new migration, add-only):**
  - `observations.entered_by text null`: the person who entered it, when that is not the submitter; with a check that it differs from `submitter_id`. Not sealed: it is a person id like `submitter_id`.
  - `observation_history.entered_by text null`, and `keep_observation_history()` replaced (`create or replace`) to copy it, so a Superseded Value keeps who entered it.
  - `observations.entered_by_name text null`: for an Import from a Workspace Export, the name of who entered it, sealed with the Workspace Key like `submitted_by_name` (spec 0040); `seal_table` and `sealed-labels.ts` learn the column.
  - `prompts.stands_in_for text null`: whom a Stand-in's Prompt asks for. Set by `deliverPrompt` when it uses the Stand-in's Token. The answer to a Prompt uses this, never a guess from the Tokens, so a person who both submits and stands in records each answer under the right name.
- **Core:** a new operation `fillInValue(actor, { metricId, period, for, value, breakdown? })` in `packages/core/src/fill-in.ts` (Actor first, Workspace and `mayFillIn` checked) for the Metric owner and the Workflow owner; it goes through `takeValue` with `row = { submitter_id: for, entered_by: actor.personId }`, so the Submission Rule, the Lock, the Unusual Value check, Approvals, Tells, Alerts and Personal Webhooks run as for any value. The Stand-in path in `takeValue` and `recordOwnValue` sets `submitter_id` to the submitter and `entered_by` to the Stand-in when the Token used is a Stand-in's (`stands_in_for`) or the Prompt answered has `stands_in_for`. A value from an Access Key on a Stand-in's Token is refused ("Values for someone else are entered in the app or by answering the Prompt").
- **Source:** the way it came in, as today (the web form for the app, Slack, Telegram, email), plus `entered_by`. A Filled-in Value is never an Import.
- **Prompts close:** a Filled-in Value closes the open Prompts for that Metric and period, the submitter's and the Stand-in's, and updates their Deliveries where the way allows ("Entered by Ben for Sara: 42").

### The submitter replaces it

- While the period is not locked, the submitter's own value replaces the Filled-in Value for them, whatever the Submission Rule (also under "reject"): the Filled-in Value becomes a Superseded Value with its `entered_by`. Their answer says so: "Replaced 42, entered by Ben for you, with 40."
- In a locked period, the submitter's value becomes a proposed Correction as any late value does (GLOSSARY: Lock).
- A second person cannot fill in over a Filled-in Value: the period has a value. They use a Correction, or an Approver corrects it.
- The person who entered it is not told when it is replaced: the Period Record shows it. (A message to them is out of scope.)

### Telling the submitter

- A new Delivery kind `filled_in`, sent once per Filled-in Value to the submitter through their Delivery Preference (one way, as for every kind but Prompts), and added to the kinds Quiet Hours hold (`HELD_KINDS` in `quiet-hours.ts`). It is sent while they are Away too: it waits for them, it asks nothing.
- What it carries (rule 3: what they need to check it, nothing more): the Metric's name, the period, the value in the Metric's format, who entered it (by the name rules below), and a link: the Period Record for someone who signs in, their personal form link for a Contact. Only while they still hold their Token and see the Metric; otherwise it is skipped silently.
- In the Outbox like every Delivery. Not sent from the demo.

### Unusual Value, Approval, Self-check

- The Unusual Value check applies as for any value.
- **Nobody approves a value they entered, nor one entered for them.** `approversFor` and the Approval's `from` (`period_states.approval_for`, line `state.approval_for ?? value?.submitter_id` in `workflow-engine.ts`) exclude both the submitter and `entered_by`. The fallback to the Metric's owner and then the Workflow's owner skips them the same way: the Metric owner who filled in does not approve it; the Workflow's owner may, if they did not enter it.
- When nobody else could approve, the Approve step's choice applies as today. A Self-check goes to the submitter it is for, never to who entered it: the submitter did not type it, so checking it is a real check, and it stays recorded as a Self-check, never an Approval. (Flagged for the owner.)
- `valueOutlook` (the preview before recording) uses the same exclusions, so "Ben will approve it" is never said to Ben.

### Where it shows, and who sees the name

A Filled-in Value counts as the submitter's; the mark "Entered by X for Y" goes wherever a value names its submitter today:

- **Period Record:** a step "entered by Ben for Sara" (kind `filled_in`), and on a replaced one "entered by Ben for Sara, replaced by Sara". The **Fill in for …** button for those who may (above).
- **Period Timeline:** the value's line reads "Revenue came in: 42, entered by Ben for Sara"; a group of values says "3 values came in, 1 entered for someone"; `period_status` returns `entered_by` beside the person on such lines. The count ("5 of 6 in", with 0045's Checklist Tasks) is unchanged: it was already per Metric.
- **Metric page History tab, the widget's history panel (`widget-frame.tsx`), the Changes page:** the submitter's first name with "entered by Ben" beside it.
- **Schedule:** unchanged in its rule (the due value leaves both the submitter's and the Stand-in's list as soon as the period has a value). The value counts as the submitter's delivered value.
- **Usage page:** idle submitters count Filled-in Values as the submitter's (they are by `submitter_id`), and the row says how many of them someone else entered in the window ("3 values, 2 entered by others"), so an Admin can still see who keeps needing help.
- **API and MCP (read only):** each value in `get_metric` and `GET /api/v1/metrics/{slug}` gains `entered_by` (a person id and name, by the rules below) beside its submitter; the MCP tool descriptions say what it means. Nothing new to write.
- **Workspace Export and Import:** a value record gains `enteredBy` (a name, as `submittedBy`); the import seals it into `entered_by_name`, which only the Metric page shows, never to Guests, exactly like `submitted_by_name`. An older export without it imports as before; an importer that does not know the key ignores it (checked in the format's tests).
- **Webhooks:** no change. `value.recorded` and `value.unusual` carry no submitter today and carry no `entered_by` either.

**Visibility, checked against the existing rules for submitter names** (AGENTS.md rule 3):

- **Guests** see only their own name (`peopleFor`, `systemTextFor`): a Guest reads "Entered by Someone for Someone", or their own name where it is theirs. A Guest who submits a Metric and was filled in for is told "A colleague entered 42 for you".
- **View Links and Snapshots** carry no submitter at all: `shownData` sends Points (`period`, `value`) and empty `submitters`, for both. So `entered_by` never goes out with them; a test proves it for a View Link with and without **Show names** and for a Snapshot.
- **The import's sealed names:** `entered_by_name` is sealed and shown like `submitted_by_name` (Metric page only, not for Guests).
- **Period Timeline:** a Metric the viewer cannot see stays a count, without names (unchanged).
- **Period Record:** only for people who see the Metric; Feeds' names hidden from Guests (unchanged).
- **Audit Log:** Owners and Admins only, as today.
- **Calendar Link:** unchanged; it lists due values and never who entered one.

### Audit Log

New kind in `audit-kinds.ts`: `value.filled_in`: "filled in a value for", object the Metric, details `{ period, for: <person id>, as: "stand_in" | "metric_owner" | "workflow_owner" }`. Never the value (the Audit Log never holds values). The submitter replacing it is a value like any other, shown on the Period Record, not an Audit Log event.

### Workflow Templates and Packs

Nothing new travels. Filling in is not a step or a setting; a Workflow Template carries no people, and who may fill in follows from the Metric's and Workflow's owners. (A per-Workflow switch to turn filling in off is out of scope until someone asks for it.)

### Demo

The demo stays read-only. A new migration (setting `ziffr.demo_seed` for its transaction) adds, in the monthly finance Workflow, one past period where Ben, Sara's Stand-in, entered her value while she was Away (an Away row for those dates, the Prompt with `stands_in_for`, the value with `entered_by`), and one where the Workflow's owner filled in after the Due Date and the submitter later replaced it (a Superseded Value with `entered_by`), with the matching Audit Log rows. The upgrade test proves it on an Installation with the demo. Nothing is sent from the demo.

### Today's Stand-in answers: decided

**Decided by the owner (2026-11-22):** a Stand-in's answer to a Prompt asked in someone's place is a Filled-in Value for that submitter. If Mia stands in for Jonas, the value is Jonas's number, and it always shows who really entered it: "Entered by Mia for Jonas". A Stand-in is asked for someone else's number by definition, so recording it as theirs is what this spec stops. It needs no new step for the Stand-in, and it closes the Approval gap above (the person it was for could approve it).

- **What follows from it:** a Stand-in's Token takes values only for the periods they were asked about, and no longer through the API or MCP, as decisions 1 and 6 say (the Stand-in fills in when asked; no Access Key fills in).
- **Existing values are not rewritten** (decided by the lead, 2026-11-22, following the owner's rule that values are not rewritten). Values Stand-ins recorded before this change stay recorded as the Stand-in's own. The link to the absent submitter lives only on the Stand-in's Token and is lost once that Token lapses or another Stand-in is chosen, so a rewrite could not be done reliably for all of them, and doing it only for some would be inconsistent. The Period Record keeps showing them as before.

## Testing Decisions

- **Rules, as a table** (`fill-in-rules.test.ts`, pure): each of the three roles, before and after the Due Date, Away and not, a Metric without a Workflow, a period with a value, locked, condensed, Derived, Archived, "add up" and "keep both", a Feed, oneself, a Guest, an Owner or Admin who is none of the three, the demo.
- **Against the database** (`fill-in.db.test.ts`): `fillInValue` by the Metric owner and the Workflow owner records `submitter_id` = the submitter and `entered_by`; refused for each case above with its message; a Workflow owner who cannot see the Metric refused; the Stand-in's reply, Slack answer and form link record a Filled-in Value; a Stand-in for a period they were not asked about refused; a Stand-in's Access Key refused; a person who both submits and stands in records each answer under the right name (via `prompts.stands_in_for`); open Prompts closed; the submitter's own value replaces it under "reject" before the Lock and becomes a Correction after; `observation_history` keeps `entered_by`; the Audit Log row; the `filled_in` Delivery sent once, held by Quiet Hours, skipped when the submitter lost sight or Token, never from the demo.
- **Approval** (`approval-guards.db.test.ts`, extended): the person who entered it and the person it is for are never Approvers, also through the owner fallbacks; the Self-check goes to the submitter; `valueOutlook` agrees with `onValue`.
- **Visibility** (`fill-in-visibility.db.test.ts`): Period Record, Period Timeline, `period_status`, `get_metric`, History tab data and the Changes page for the Metric owner, a Member, a Member who does not see the Metric, a Guest submitter and a Guest bystander; a View Link with and without Show names and a Snapshot carry no `entered_by`; the Workspace Export round trip seals `entered_by_name` and the Metric page hides it from Guests.
- **Usage report:** a Filled-in Value counts for the submitter and in the "entered by others" count.
- **Demo:** the seed shows both periods; the upgrade test.
- **Pages,** tried in the running app: **Fill in for …** on the Period Record and the Workflow page (shown only to those who may, disabled with the reason before the Due Date), the mark on the Period Record, the timeline, the History tab and the widget's history panel, the message in the Outbox.

## Out of Scope

- **Filling in through the API or the MCP Server**, for anyone, and assistants entering values for a person. The owner's decision is to start in the app and by Prompt; a program that types a number in a person's name is a separate decision about Access Keys (scopes, and who the key's person may fill in for).
- Metrics whose Submission Rule is "add up" or "keep both".
- Filling in for a Feed.
- Filling in over a Filled-in Value, or in a locked period (a Correction does that).
- Rewriting earlier Stand-in values as Filled-in Values.
- Telling the person who entered it when the submitter replaces it.
- A per-Workflow or per-Workspace switch to turn filling in off.
- Checklist Tasks (spec 0045) ticked off by a Stand-in: they stay recorded as done by the Stand-in in the Task's Thread, as 0045 says. This spec is about values.

## Further Notes

- The threat model (`docs/security/threat-model.md`) gains an entry: a value entered in someone else's name, kept honest by the `entered_by` mark on every surface, the Audit Log row, the message to the submitter and the Approval exclusions; and the Stand-in Token narrowed to asked periods and the app.
- A release note for each ticket that people notice (tickets 1 to 3).
- The user guide chapters to change: **Metrics** (10: a period's page, Who submits and Stand-ins, Locks and corrections, the personal form link for a Stand-in), **Workflows** (11: Escalate, Stand-ins, the period view and timeline, Approve and Self-check), **Actions** (15: Approval of a Filled-in Value), **Workspace settings** (16: Audit Log, Usage), **Your settings** (17: Schedule, Away, Quiet Hours and the new message). The glossary feeds **Words in Ziffr** (90) by itself.

## Decisions (2026-11-22, by the owner)

1. Who may fill in: the Stand-in when asked, the Metric owner and the Workflow owner; once the Due Date has passed, or at any time while the submitter is Away. Never Guests or Access Keys; the API and MCP do not fill in to start with.
2. The value is recorded as the submitter's and counts for them in the Schedule, the period's progress and reports, with a visible mark "entered by X for Y" on the value, in the Period Record, the Period Timeline and the Audit Log. It is never hidden that someone else entered it.
3. The submitter is told through their Delivery Preference, with Quiet Hours respected, and can replace it with their own until the period locks. The Filled-in Value stays in the history.
4. Unusual Value and Approval apply as for any value. Nobody approves a value they entered themselves, including values entered for someone else.
5. Who may see the "entered by" name follows the existing rules for submitter names.
6. A Stand-in's answer becomes a Filled-in Value for the absent submitter: it is their number, and it always shows who really entered it ("Entered by Mia for Jonas").

Decided by the lead (2026-11-22), following the owner's rule that values are not rewritten: values Stand-ins recorded before this change stay recorded as the Stand-in's own (see "Today's Stand-in answers").

Proposed in this spec, open to change: the name Filled-in Value; Guests no longer chosen as Stand-ins; the Self-check going to the submitter; "add up" and "keep both" left out; the Usage page's "entered by others" count.

## Tickets

1. #800 **Filled-in Values in the core:** the migration (`observations.entered_by` and its check, `observation_history.entered_by` and the trigger, `entered_by_name` sealed with `seal_table` and the labels, `prompts.stands_in_for`), `fill-in-rules.ts`, `fillInValue`, the Stand-in path in `takeValue` and `recordOwnValue` (Filled-in Value, asked periods only, no Access Key), `setStandIn` refusing Guests, replacing by the submitter, closing Prompts, Approval and Self-check exclusions and `valueOutlook`, the `filled_in` Delivery held by Quiet Hours, the Audit Log kind, db tests. Blocked by #794 and #798.
2. #801 **Fill in and the mark in the app:** **Fill in for …** on the Period Record, the Metric page's Workflow box and the Workflow page; the mark on the Period Record, the Period Timeline (and `period_status`), the History tab, the widget's history panel and the Changes page; the Guest Stand-in note; the user guide (Metrics, Workflows, Actions, Your settings), the release note, tried in the running app. Blocked by #800.
3. #802 **Reads elsewhere and the demo:** `entered_by` in `get_metric` and the API, the Usage page's count, `enteredBy` in the Workspace Export and Import, the demo seed migration and the upgrade test, the user guide (Workspace settings), visibility db tests (View Link, Snapshot, Guests). Blocked by #800.
4. #803 **Security review of the whole spec** (Opus): every way a value can be entered in someone else's name and every surface that shows `entered_by`, against rule 3, for each role, Guest, View Link and Snapshot; the narrowed Stand-in Token; the threat model entry; findings fixed; the spec set to done. Blocked by #800 to #802.
