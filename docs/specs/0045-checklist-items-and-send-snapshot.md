# 0045 Checklist Items and Send Snapshot: the rest of a close, in the Workflow

**Status:** draft. **Tracking issue:** see the pull request (label `tracking`); tickets carry `spec:0045`.

## Problem Statement

A Workflow (spec 0005, 0035) knows how to get numbers in: it asks, reminds, escalates, checks, has values approved, tells people when a level is reached, publishes and locks. A real month-end close has more to it than numbers. Someone has to reconcile the bank account, the controller has to tell the department heads that the cut-off for invoices is Friday, and once everything is locked somebody exports the dashboard and mails it to the management group. Today all of that lives outside Ziffr, in a spreadsheet checklist and a calendar reminder, so the Workflow page says "6 of 6 in, locked" while the close is not done, and the board gets its numbers whenever someone remembers to send them.

The owner's decisions (2026-11-22) are two additions to the Workflow:

1. A free-text step the Workflow's builder adds, either **for information** (sent to chosen people and Groups on its day) or **to tick off** (a Task for an Assignee each period, with a Due Date, reminded and escalated like a missing value, counted in the period's progress).
2. When the period is finished (every value approved, published and locked, every tick-off item done), Ziffr takes a **Snapshot** of a chosen dashboard and sends it to chosen people and Groups, once per period, each recipient getting only what they may see.

### What exists today

- **Publish and lock send nothing to anyone but the Workflow's owner.** The Publish step sets the period's state; with the Workflow's **Tell the owner when a period locks** setting (`lockSummary`, `lock-summary.ts`) the owner alone gets a short summary once every value the Workflow asks for is locked. Nothing else goes out.
- **Publish takes no Snapshot.** A dashboard may take Snapshots **by itself** (spec 0013, 0020, `auto-snapshots.ts`): the daily run takes the last ended period once every Metric on the dashboard is Locked for it, or a set number of days after it ended, as a **draft** in the dashboard owner's name, and tells only that owner. A draft is for the owner and Editors; once **shown**, whoever may open the dashboard opens it and sees in it only the Metrics they may see now (`forReader` in `snapshots.ts`). The Period Timeline lists shown Snapshots of dashboards that draw the Workflow's Metrics.
- **A deck keeps no Snapshot.** A deck's Snapshot is the values its widgets show when it is exported in the browser; nothing is stored, so there is nothing a step could send later (see Out of Scope).
- **Tasks always belong to a Metric.** An Action (`actions` table) has a `metric_id` that may not be null, and its Thread is readable by everyone who sees that Metric. The Workflow already creates Actions of its own (`purpose`: `approval`, `escalation`, `self_check`), and the Schedule, the Actions page, `list_actions`, `mark_task_done`, the due-Task reminders (`remindDueTasks`) and the Webhook events all read that table.
- **Steps are per Metric.** The engine (`runWorkflows`) walks the Workflow's Metrics one by one; nothing runs once per Workflow and period. The Tell step (spec 0032) is the nearest thing to a message to people: it expands Groups to people (`tellRecipients`), honours "stop telling me", and its Deliveries are of the kind `alert`, which waits out Quiet Hours.

## Solution

1. **Checklist Item**, a new Workflow step: a short text the Workflow's owner writes, of one of two kinds.
   - **For information:** goes on its day to chosen people and Groups, through each person's Delivery Preference, waiting out their Quiet Hours. Nothing comes back; the Period Timeline shows it as sent.
   - **To tick off:** each period it gives a **Task** to its Assignee with a Due Date counted in working days after the period ends. The Task is in the Assignee's Schedule, is reminded and escalated by the Workflow's Remind and Escalate steps as a missing value is, goes to the item's Stand-in while the Assignee is Away, counts in the period's progress ("5 of 6 in") and is ticked off with an optional note.
2. **Finished Period**: a Workflow's period is finished once every value it asks for is published and locked and every Checklist Task of it is done.
3. **Send Snapshot**, a new Workflow step: when the period is finished, Ziffr takes the Snapshot of a chosen dashboard for that period in the Workflow owner's name, shows it, and sends each chosen person who may open the dashboard a message with a link to it, once per period. Each person opens it signed in and sees only the Metrics they may see, as for every shown Snapshot today; the message carries no value and no Metric name.

## User Stories

1. As a Workflow's owner, I want to add "Reconcile the bank account" to the monthly close with an Assignee and the 3rd working day as its Due Date, so that the close lists it every month without my spreadsheet.
2. As a Workflow's owner, I want to send "Invoices for this month must be in by Friday" to the department heads on the 1st working day after the month ends, so that I stop writing that email by hand.
3. As an Assignee, I want the checklist Task in My schedule, in my calendar and in my assistant's `my_schedule`, so that I see it next to the values I owe.
4. As an Assignee, I want to tick the Task off with a short note ("Matched, one open item of 12 €"), so that the owner knows how it went.
5. As an Assignee who is Away, I want my checklist Task to go to my Stand-in, as my Prompts do.
6. As a Workflow's owner, I want overdue checklist Tasks reminded and escalated by the steps I already set, so that I do not chase people.
7. As a Workflow's owner, I want the period's progress to count checklist Tasks ("5 of 6 in"), so that "everything in" means the close is done.
8. As a Workflow's owner, I want the management Group to get the board dashboard's Snapshot for the month once the month is finished, once, so that nobody has to remember.
9. As a recipient, I want to see in that Snapshot only what I may see, so that a Metric kept from me stays kept from me.
10. As a Member looking at the Workflow, I want the timeline to show which checklist items were sent, given, ticked off and when the Snapshot went out.
11. As a Guest, I want to see only my own checklist Tasks, and nothing of others' items beyond a count.
12. As a builder of Workflow Templates, I want the checklist items and the Send Snapshot step to come along in the template, with the people and the dashboard left open.
13. As an assistant or program, I want to read the checklist and tick my person's Task off, and never change who gets what.
14. As a demo visitor, I want to see a finished period with its checklist and the Snapshot sent, without being able to change anything.

## Implementation Decisions

### Words (glossary, in this spec's pull request)

- **Checklist Item** (new): a Workflow step its owner writes as a short text, either for information (sent to named people and Groups on its day) or to tick off (a Task for its Assignee each period, with a Due Date). _Avoid_: to-do, note, instruction, manual step, reminder (a Remind step re-sends a Prompt). The owner's working name "Checklist item" fits: a close is a checklist, and an item for information is a line on it that needs no tick. Not a **Tell**, which waits for a value to cross a level; not an **Action** someone asks by hand.
- **Checklist Task**: no new entry. It is a **Task** (glossary) that a tick-off Checklist Item gives each period, about the Workflow's period instead of a Metric. The Task and Action entries say so.
- **Finished Period** (new): a Workflow's period once every value it asks for is published and locked and every Checklist Task of it is done. _Avoid_: complete period (the Snapshot entry and `completePeriods` already use "complete" for a period that is over), closed period ("Close the period" locks values only), signed off (an _Avoid_ of Approval), done.
- **Send Snapshot** (new): a Workflow step that, once a period is finished, takes and shows the period's Snapshot of one dashboard and sends a link to it to named people and Groups, once per period. _Avoid_: pack, board pack (**Pack** is a Marketplace bundle), report, distribution, mailing.
- Changed entries: **Workflow** (the steps list), **Action** and **Task** (a Checklist Task has no Metric), **Period Timeline** (the new lines and the progress), **Schedule** (Checklist Tasks), **Workflow Template** (items and Send Snapshot come along, people and dashboard open), **Quiet Hours** (an information item waits them out), **Snapshot** (a Send Snapshot step takes and shows one).

### The Workflow's period

- Both steps work **once per Workflow and period**, not per Metric. The Workflow's period is that of the Metrics it asks for (Derived and Archived Metrics are not asked); its first day is the `period_start` the Period Timeline already uses.
- A Workflow with no such Metric, or whose Metrics have different periods (a monthly and a quarterly one), has no period: its Checklist Items and Send Snapshot step **pause**, the Workflow page says why, and the owner is told once. They resume when the Metrics agree again.
- `runWorkflows` gains a second loop, after the Metrics, over the Workflows in its scope (the same `RunScope`, so an Asking Schedule decides when these steps run too, and a step whose day the Workflow does not run on goes out on the next run day, as spec 0035 says for the other steps). The demo's "pretend it is this day" runs it as well.
- **Once per period:** a new table `workflow_step_runs` (workspace, workflow, step id, period_start, kind, when, counts; unique on workflow, step and period) is claimed before anything is sent, as `workflow_runs` is claimed per day (spec 0005). A second run, two servers or a period unlocked and locked again never send twice. It holds ids and counts only, no words.
- Each new step carries a stable `id` in the config, as a Tell step does, so its claim and its Tasks survive reordering and editing.

### Checklist Item

- **Config:** `{ type: "checklist", id, kind: "info" | "tick", text, day, people, groups, readGroup? }` for information and `{ type: "checklist", id, kind: "tick", text, assignee, standIn?, dueWorkingDays, readGroup? }` to tick off.
  - `text`: plain text, 1 to 500 characters, trimmed; no markup is rendered and links are shown as text, as in a Thread. It is **sealed** with the Workspace Key inside the config (spec 0028, `sealed-workflow.ts` gains the place `steps.<i>.text`); a text that does not open drops the step from what is run, never runs as ciphertext.
  - `day` (information): working days after the period ends, 1 to 30 (1: the first working day after it). Sent on the first run on or after that day.
  - `dueWorkingDays` (tick off): 0 to 30, as a Workflow's Due Date. The Task is given on the period's first run (when its values are asked).
- **Limits** (constants beside `alert-limits.ts`): at most 20 Checklist Items per Workflow; an information item names at most 20 people and 10 Groups, as a Tell step (`TELL_PEOPLE_PER_STEP`, `TELL_GROUPS_PER_STEP`). The Workflow's cap of 12 steps (`cleanConfig`) counts the other steps only; Checklist Items have their own 20.
- **Who may add one:** the Workflow's owner, as for every step (only they change a Workflow). People and Groups must be of the Workspace: Owners, Admins, Members and Guests with a sign-in, never Contacts or Feeds (`tellRecipients`). An Assignee or Stand-in must be a member with a sign-in; a Guest may be one (a Guest is given Tasks today), and then sees that Task only.
- **Sending an information item:** each person gets one Delivery of a new kind `checklist` through the one way their Delivery Preference names for messages that are not Prompts, from the Workflow's owner, with the Workflow's name, the period and the text, and a link to the Workflow page. The kind is added to `HELD_KINDS`, so it waits out Quiet Hours and is never dropped. Groups are expanded at sending; "stop telling me" for the Workflow (spec 0032) applies to these messages too; it cannot be answered (no reply address, as an Alert). Daily sending limits are the Alerts' own. A person Away still gets it: it asks nothing of them.
- **Giving a Checklist Task:** an Action with `kind = 'task'`, `purpose = 'checklist'`, `workflow_id`, `checklist_item_id` (the step id), `period_start`, `due_date` (the item's Due Date for that period), asker the Workflow's owner, `metric_id` null. A migration (add-only) adds the two columns, allows `metric_id` null **only** for `purpose = 'checklist'` (a check constraint), and adds `checklist` to the purpose check. Its question is the item's text, sealed as every Action's question is. One Task per item and period (unique on item and period).
- **Away and Stand-in:** if the Assignee is Away on the day it is given, the Task is given to the item's Stand-in, marked "standing in for …", as a Prompt goes to a Stand-in; without a Stand-in it is given to the Assignee and the owner is told.
- **Reminders and Escalations:** the Workflow's **Remind** steps remind the Assignee that many days before the Task's Due Date, by the first way of their Delivery Preference, as for a missing value; the generic due-Task reminder (`remindDueTasks`) skips Checklist Tasks so nobody is reminded twice. **Escalate** "ask the stand-in" hands the open Task to the item's Stand-in (the Thread says so, the first Assignee keeps reading it), "tell the metric owner" tells the Workflow's owner, since a Checklist Task has no Metric owner. Each once per Task.
- **Ticking off:** the Assignee (or Stand-in holding it) marks it done in the app, by a reply ("done", as for any Task today), through the API or the MCP Server, with an optional note of at most 2,000 characters, kept as the Thread's last reply. `markTaskDone` gains the optional note for every Task. Reopening is the Workflow owner's or the Assignee's, as for other Tasks; a reopened Task un-finishes the period, but a Send Snapshot already sent is not sent again.
- **Who reads a Checklist Task and its Thread:** the people on it (Assignee, Stand-in, the owner who asked) always; everyone who may look at the Workflow (Owners, Admins, Members) unless the item names a `readGroup`, then only that Group's people; a Guest only when they are on it. `canReadThread` and `readableActions` get this rule for `metric_id` null; nothing may fall back to "every member" because the Metric is missing.
- **Every reader of `actions.metric_id`** handles null: the Schedule and Calendar Link (an entry about the Workflow and period, `kind: "task"`, `metric: null`), the Actions page and its filters, the action page (no chart), `deliver()` (a message about the Workflow, no Metric line), reply routing, `list_actions` and `GET /api/v1/actions` (`metric: null`, `workflow: { id, name }`), the Workspace Export and Import, retention of Actions, and archiving (a Checklist Task is not about an Archived Metric). A test lists every query on `actions` that joins `metrics` and proves each one handles the null.
- **Webhooks:** Checklist Tasks are **not** sent to Workspace or Personal Webhooks in this spec (`announceNewAction` skips `purpose = 'checklist'`): spec 0034's event schema names a Metric, and a change to it is its own decision. Status back through a Webhook therefore never reaches one.
- **When the Workflow changes:** removing an item stops it from the next period on and leaves its open Tasks open (the owner may close them); changing its text changes later Tasks only; a leaver who is an item's Assignee or Stand-in is removed from the step (it reads "nobody yet" and pauses until the owner picks someone) and their open Checklist Tasks follow the handover as other open Tasks do.

### Finished Period

- Decided by one core function, `periodFinished(ws, workflowId, period)`: every value the Workflow asks for has the state `locked` for the period (the rule `lock-summary.ts` uses), and every Checklist Task of the period has the status `closed`. Items added after the period's Tasks were given do not count for that period.
- It is checked where those things change: after a Lock (the places that call `sendLockSummary`: publish, `publishDecided`, `setLock`, `closePeriod`), after a Checklist Task is done, and again in each run as a catch-up. Checking and sending never undo or stop the Lock or the tick-off that set it off (as the lock summary, it is caught and logged).
- The **Tell the owner when a period locks** summary keeps its meaning (all values locked) and gains a line "3 of 4 checklist items done" when the Workflow has items.

### Send Snapshot

- **Config:** `{ type: "send_snapshot", id, dashboardId, people, groups }`, at most one per Workflow, at most 20 people and 10 Groups. It may only be added when the Workflow's **Publish** step locks (the editor ticks the lock and says why): the owner's rule is "approved, published and locked", and it is the rule automatic Snapshots already use.
- **Who may add it, and to which dashboard:** the Workflow's owner, for a dashboard they own or are an Editor of and on which they see every Metric, the same rule as `takeSnapshot`; checked when the step is saved and again when it runs. The Workflow's period must be one a Snapshot can cover (week, month, quarter, half-year or year: not a day).
- **When the period is finished,** in the step's claim:
  1. If the dashboard has a **shown** Snapshot of that period, it is the one sent.
  2. If it has a **draft** of that period that the dashboard took by itself and nobody has written in yet (`automatic`, no `words_changed_at`), the step shows it and sends it.
  3. If it has another draft, nothing is sent yet: the owner is told once to show it, and the next run after it is shown sends it, for up to 60 days (`MAX_WAIT_DAYS`).
  4. Otherwise the step calls `takeSnapshot` **as the Workflow's owner** (it vouches for what it shows, as whoever takes one does), with `automatic` set, and shows it at once. `snapshot.taken` and `snapshot.shown` in the Audit Log say `via: workflow` with the Workflow's id.
- **The Snapshot holds only what it holds today:** the dashboard's layout and the values of every Metric period complete by the period's last day, frozen and sealed as `takeSnapshot` does. Nothing is added for this step.
- **Who gets it, and what:** the people named and the people of the Groups named (`tellRecipients`, "stop telling me" honoured), each checked **at sending** for whether they may open the dashboard (`roleOn`: its owner, an Editor or Viewer by a Share to them or their Group). Each such person gets one Delivery of the kind `checklist` (held by Quiet Hours), from the Workflow's owner: "<Workflow>: <period> is finished. The Snapshot <label> of <dashboard> is ready." and a link to the Snapshot in Ziffr. The message holds **no value, no Metric name and none of the Snapshot's words**; the person signs in and `forReader` shows them only the Metrics they may see now, which is how every shown Snapshot is read today. This is the existing safe path; no new way of showing a Snapshot is added.
- **Not a Share and not a View Link.** The step never shares the dashboard (a Share would give view access to every Metric on it, more than the owner chose) and never makes a View Link (a link shows the whole Snapshot to whoever holds it, so it cannot keep a Metric from one recipient). A person named who may not open the dashboard is **skipped**, and the owner gets one notice naming them ("2 people could not open Board KPIs: share it with them and they get the next one"); nothing about the dashboard reaches the skipped person.
- **Once per period:** the claim in `workflow_step_runs` holds the Snapshot's id and the counts sent and skipped. A period unlocked and locked again, a Task reopened and done again, or a value corrected after sending never send again; a corrected value is shown in the Snapshot with its note, as today.

### Permissions, in one place

| Who | Checklist Items | Send Snapshot |
| --- | --- | --- |
| The Workflow's owner | adds, changes, removes; reads every item's Tasks and Threads | adds for a dashboard they own or edit and fully see; gets the skipped and waiting notices |
| Owners and Admins | read the items and their Tasks like Members; change nothing (only the owner changes a Workflow) | see the step; change nothing |
| Members | see items' text and progress on the Workflow page, except an item kept to a Group they are not in ("A checklist item for a Group") | see the step's dashboard name only if they may open the dashboard |
| Assignee, Stand-in | their Task in their Schedule, tick off, reply | — |
| Recipients | an information item's text | a link; inside, only Metrics they may see |
| Guests | only Tasks given to them and information items sent to them; others as a count | the timeline line only if they may open the dashboard |
| Access Keys, assistants | read (below); tick off their person's own Task | read; never change people or the dashboard |

### Period Timeline and progress

- New lines (`TimelineKind`): `checklist_sent` ("Sent ‘Invoices by Friday…’ to 8 people"), `checklist_given`, `checklist_done` (with the first words of the note, for a reader of its Thread), `snapshot_sent` ("Sent the Snapshot March 2026 of Board KPIs to 6 people, 2 could not open it"), and `finished` ("March 2026 is finished"). A Guest or a viewer outside an item's `readGroup` sees a count ("1 checklist item done"), never the text. The counts of skipped people and their names are only for the owner.
- **Progress:** the line "5 of 6 in" counts the values asked and the Checklist Tasks given together; the API keeps `in` and `of` for values only (the lock summary and programs read them) and adds `checklist: { done, of }` and `finished: boolean`.
- The **Schedule** lists Checklist Tasks as Tasks, with the Workflow's name and period where a Metric's name would be; the Calendar Link may leave the words out, as it does for Metrics.

### Workflow Templates, Packs and Workspace Exports

- **Workflow Templates** keep Checklist Items with their kind, text, day and Due Date, and the Send Snapshot step without its dashboard; **people, Groups, Assignee, Stand-in, read Group and dashboard are left open**, as Approvers are. Making a Workflow from the template asks for each Assignee (or leaves the item at "nobody yet", paused) and lets the recipients and the dashboard be picked later in the editor. `WorkflowTemplateStep` gains the two step types without their people; `ziffr.workflow-template/1` files and the Pack checks in `packages/pack` accept them (a new optional step type in the same format version; older readers drop unknown steps, which `cleanConfig` already does).
- A **Workspace Export** carries the steps with their people and dashboard ids mapped like every other id it carries, and the Checklist Tasks like other Actions; the import checks them as `cleanConfig` does.

### API and MCP

- **Read:** `GET /api/v1/workflows/{id}` and the MCP tool `get_workflow` show the new steps; the item's text and the step's people only to a key or assistant whose person may read them (the people only with the `workflows:people` scope, as Approvers and Tell recipients today). `period_status` and its API route return the checklist progress, `finished`, and the new timeline lines under the same visibility as the app. `my_schedule`, `list_actions` and `GET /api/v1/actions` list Checklist Tasks with `metric: null` and `workflow: { id, name }`.
- **Tick off:** `mark_task_done` and `POST /api/v1/actions/{id}/done` take an optional `note`, for the key's person's own open Task (scope `actions:write`), as for every Task.
- **Change:** `create_workflow`, `update_workflow` and the API save these steps only as `cleanConfig` allows; a key **without** `workflows:people` must send the Checklist and Send Snapshot steps exactly as read (they name people), as for Approve and Tell (`peopleSteps`). No key or assistant can choose the Send Snapshot recipients or its dashboard: that sends the Workspace's numbers to people, which only the owner decides in the app.

### Demo

- The demo stays read-only. A new migration (setting `ziffr.demo_seed` for its transaction) adds to the demo's monthly finance Workflow two Checklist Items ("Reconcile the bank account" to tick off, "Invoice cut-off is Friday" for information) and a Send Snapshot step for its board dashboard, with one past period finished (Tasks done with a note, the information item and the Snapshot recorded as sent) and the current period with one open Task. Nothing is ever sent from the demo; its "pretend it is this day" shows the lines without Deliveries leaving, as for its Prompts. The upgrade test proves the migration on an Installation with the demo.

### Audit Log

New kinds in `audit-kinds.ts`:

- `workflow.checklist_set`: "changed the checklist of the Workflow" (items added, removed, Assignee or recipients changed; counts and ids, never the text).
- `workflow.send_snapshot_set`: "changed who gets the Snapshot of the Workflow" (dashboard id, people and Group ids added or removed).
- `workflow.snapshot_sent`: "sent the Snapshot of the Workflow's period" (by Ziffr for the owner: Snapshot id, period, counts sent and skipped).
- `snapshot.taken` and `snapshot.shown` gain `via: "workflow"` when the step did them.

Ticking off a Checklist Task is in its Thread and the Period Timeline, as other Tasks are, not in the Audit Log.

### User guide

- `11-workflows.md`: the steps table (Checklist Item, both kinds; Send Snapshot), the timeline's new lines and progress, Finished Period, the lock summary line.
- `15-actions.md`: Checklist Tasks (no Metric, who reads them, ticking off with a note).
- `17-your-settings.md`: My schedule lists Checklist Tasks; Quiet Hours hold the new messages.
- `12-dashboards.md`, Snapshots: a Workflow may take, show and send a Snapshot.
- `05-templates.md`: what a Workflow Template carries.

## Testing Decisions

- **Engine, against the database at fixed days** (`checklist.db.test.ts`): an information item sent on its working day once, held through Quiet Hours, Groups expanded, "stop telling me" honoured, a Contact never reached; a tick-off item giving one Task per period, to the Stand-in while the Assignee is Away, reminded by the Remind steps and not again by `remindDueTasks`, escalated once by each Escalate step; two runs at once claiming once; an Asking Schedule moving the day; mixed periods pausing the steps.
- **Visibility, as a table** (`checklist-visibility.db.test.ts`): who reads a Checklist Task and its Thread (Assignee, Stand-in, owner, Member, Member outside the read Group, Guest on it and not on it, Admin); the Schedule, the Actions page, `list_actions` and the Period Timeline give each of them exactly that; every query joining `actions` to `metrics` handles a null Metric (a test lists them).
- **Finished Period:** values locked but a Task open is not finished; the last Task done finishes it; a Task added after the period's Tasks were given does not count; a Lock and a tick-off still succeed when the check fails.
- **Send Snapshot** (`send-snapshot.db.test.ts`): sent once per period; an existing shown Snapshot used, an untouched automatic draft shown and used, a written draft waited for; the owner who lost Editor rights or sight of a Metric takes nothing and is told; a recipient who may not open the dashboard skipped and named only to the owner; a recipient who sees 3 of 4 Metrics opens the Snapshot and gets 3 (`forReader`), and the message text holds no value and no Metric name; unlocking and locking again sends nothing.
- **Config:** `cleanConfig` limits (20 items, 500 characters, people of the Workspace only, one Send Snapshot, lock required, a dashboard the owner may snapshot), sealing and a text that does not open, `peopleSteps` with and without `workflows:people`, templates leaving people and dashboard open, the Pack checks, the Workspace Export round trip.
- **API and MCP:** read with and without `workflows:people`, `mark_task_done` with a note for one's own Task and refused for another's, `period_status` per viewer.
- **Demo:** the seed shows the finished period; no Delivery leaves the demo; the upgrade test.
- **Pages** tried in the running app: the editor's two new steps, the timeline, My schedule, an action page without a Metric, the Snapshot opened by a recipient who sees less than the owner.

## Out of Scope

- **A deck instead of a dashboard.** A deck keeps no Snapshot in Ziffr (its Snapshot is an export made in the browser), and a deck shows every one of its Metrics to everyone it is shared with, so there is nothing stored to send that would keep a Metric from one recipient. A stored deck Snapshot is its own spec. (The owner's wish named "dashboard or deck"; this is the one part left for later, and the reason.)
- Sending to people outside the Workspace (a View Link per period by email); sending the Snapshot as a file (PDF, PowerPoint) in the message.
- Checklist Tasks in Workspace or Personal Webhooks, and status back through them.
- Checklist Items that depend on each other, or on a value (Tell does the latter).
- Checklist Items for a Workflow without Metrics, or per Metric.
- Changing a Workflow's people or the Send Snapshot recipients through the API or MCP.

## Further Notes

- The threat model (`docs/security/threat-model.md`) gains an entry: Send Snapshot as a way numbers leave the Workflow owner's hands, kept safe by sending a link only and reading through `forReader`; Checklist text as Workspace words that assistants treat as data.
- A release note for each ticket that people notice.

## Decisions (2026-11-22, by the owner)

1. A free-text Workflow step, for information or to tick off, as described under Solution.
2. Send the Snapshot of a chosen dashboard or deck to a chosen Group or people once the period is finished, once per period; the Snapshot holds only what it holds today and each recipient gets only what they may see.

Proposed in this spec, open to change: the names Checklist Item, Finished Period and Send Snapshot; decks left for later; a link in the message rather than values; Send Snapshot only with a locking Publish step; skipping (not sharing with) recipients who cannot open the dashboard; no Webhook events for Checklist Tasks yet; limits of 20 items and 500 characters.

## Tickets

1. **Checklist Items for information**, and the Workflow's once-per-period loop: the step types in `types.ts` (both kinds, so the editor and templates have one shape), `cleanConfig`, sealing of the text, the `workflow_step_runs` claim, the second loop in `runWorkflows`, the `checklist` Delivery kind held by Quiet Hours, mixed periods pausing, the editor, the `checklist_sent` timeline line, templates and the Pack format, Workspace Export, `get_workflow`, the Audit Log kind, the glossary entries live, the user guide (Workflows, Templates), db tests. Not blocked.
2. **Checklist Tasks to tick off:** the migration (nullable `metric_id` for `purpose = 'checklist'`, `workflow_id`, `checklist_item_id`), giving the Task, Away and Stand-in, Remind and Escalate, ticking off with a note (app, reply, API, MCP), who reads it, every `actions` reader handling a null Metric, the Schedule and Calendar Link, the progress count, the timeline lines, the user guide (Actions, Your settings), db tests. Blocked by 1.
3. **Finished Period and Send Snapshot:** `periodFinished` and its call sites, the step and its editor, the four cases of which Snapshot, taking and showing as the owner, recipients checked at sending, the skipped notice, the lock summary line, the `snapshot_sent` and `finished` lines, the Audit Log kinds, the demo seed migration, the user guide (Workflows, Dashboards), db tests. Blocked by 2.
4. **Security review of the whole spec** (Opus): every path that reads a Checklist Task or sends a message or Snapshot, against rule 3; the threat model entries; findings fixed; the spec set to done. Blocked by 1 to 3.
