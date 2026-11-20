<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/workflows/**, apps/web/src/components/approval-bar.tsx, apps/web/src/components/self-check-bar.tsx, apps/web/src/components/metric-workflow.tsx -->
# Workflows and approvals

A **Workflow** is the path a Metric's value takes each period: who is asked, when they are reminded, who steps in, which values need **Approval**, and when the period locks. Several Metrics can share one, such as "Monthly finance close". This chapter covers the Workflows page, the Workflow box on a Metric's page, and the controls for approving, sending back, correcting and locking values.

Open the Workflows page from the top bar: **Workspace → Workflows**. Everyone in the Workspace can look at the Workflows. Owners, Admins and Members create them; Guests create nothing. Only the person who created a Workflow, its owner, changes it.

## The Workflows page

The page has three parts: the list of Workflows on the left, the steps of the chosen Workflow in the middle, with what happened in each period under them, and on the right the Metrics that use it and when it runs.

### What happened, period by period

Under the steps, **What happened, period by period** shows a timeline for each period of the Workflow, the newest first and open, the earlier ones folded (the last four). Each period says how many values are in, such as "5 of 6 in", and whether it is published or locked. Under it are the events in order, with their day and time in the Workspace's time zone:

- who was asked and reminded, grouped when close together: "Asked 6 people by Email, Slack and Telegram",
- values that came in, with how many were in by then: "5 values came in (5 of 6 in)",
- Approvals asked, approved and sent back, Self-checks, Escalations and the Questions and Tasks about the period's values,
- Metrics published and locked,
- **Snapshots** of dashboards that draw these Metrics, once shown.

Everyone who can look at the Workflow sees the timeline, but only what they may see. A Metric you cannot see appears only as a count ("1 value"), never by name, value or sender. What people said in a Thread shows only if you may read that Thread, and then only as the first words of a note, with a link to the whole Thread. A Thread you may not read is not on your timeline at all. The timeline records nothing of its own: it puts together what Ziffr already keeps. Assistants can read the same timeline with the `period_status` tool of the MCP server.

### Tell the owner when a period locks

Ticking **Tell the owner when a period locks** (only the owner changes it, and it is off by default) sends the Workflow's owner a short summary by their Delivery Preference once every value the Workflow asks for in the period is locked: how many were in, and the Approvals and Questions about them, as far as the owner may see them. Save the Workflow to keep the setting.

### The list

Each Workflow shows its name, who owns it and how many Metrics use it (counting the Metrics you may see). Click one to open it.

**New workflow** creates one straight away, named "New workflow", with a sensible start that you then adjust:

- due on the 3rd working day after the period,
- remind 2 days before the Due Date,
- on the Due Date, if the value is still missing, ask the Stand-in,
- unusual if the value changes more than 30 % or falls outside the target,
- an Approval step with nobody chosen yet,
- publish and lock the period.

**New from a template** starts a Workflow from one of the team's **Workflow Templates**, when there are any. Pick the template, give the Workflow a name, and pick the Approvers it asks for: a template keeps how many Approvers there are, never who. The Workflow is yours and independent of the template.

**Save as template…**, next to **Save workflow**, saves the open Workflow as a team Workflow Template: its Due Date and steps, without its people. Owners, Admins and Members can save one; only you change or replace yours.

### Name and Due Date

| Option | What it does |
| --- | --- |
| **Name** | What people see in menus, such as "Monthly numbers". |
| **Due, working days after the period** | The **Due Date**: on which working day after the period ends the value must be in, from 0 to 30. With 3, a monthly value for October is due on the 3rd working day of November. A quarterly or yearly value is due the same way after the quarter or year ends: with 5, a value for the quarter July to September is due on 7 October 2026. Quarters and years start from the Workspace's fiscal year (**Workspace → General**). Working days are Monday to Friday; public holidays are not skipped. |

### The steps

The steps are drawn as a timeline, from top to bottom. Each step shows in words what it does, with its settings underneath. The owner moves a step with the arrows **Earlier** and **Later**, and takes it out with **Remove step**.

**Ask** always comes first and cannot be changed: "When the period ends, ask each submitter through their connector. While someone is away, their stand-in is asked." Ziffr sends each Submitter a **Prompt**, by email, on Slack or wherever that person gets their messages (see [Your settings](17-your-settings.md)). A **Feed** is a program and is never asked.

**Add step** offers the other kinds:

| Step | Settings | What it does |
| --- | --- | --- |
| **Remind** | **… days before the due date** | Sends the Prompt again, while the value is still missing, that many days before the Due Date. These are calendar days. You can add several Remind steps, for example 5 days and 1 day before. |
| **Escalate** | **… days after the due date**, and **ask the stand-in** or **tell the metric owner** | If the value is still missing once the Due Date has passed (or that many days later), an **Escalation**: either the Submitter's **Stand-in** is asked for the value, or the **Metric Owner** gets a question asking them to follow up. When the missing value should come from a Feed, the Metric Owner is told in any case and asked to check that the Feed still runs. You can add several Escalate steps. |
| **Check** | **changes more than … %**, and **or outside the target** | Decides what counts as an **Unusual Value**: a value that changes more than this share against the period before (for a quarterly Metric the quarter before, for a yearly one the year before; any change from 0 counts), or, when ticked, falls outside its target (the Target Series value for that period if there is one, otherwise the Target Range). One Check step per Workflow. |
| **Approve** | **Unusual values only** or **Every value**, then one to three **Approvers**, in order | Which values wait for Approval, and who confirms them: the first, **then** the next. **Unusual values only**, the default, holds back only what the Check step finds unusual; Workflows made before the choice existed work this way. **Every value** holds back each value, unusual or not, also without a Check step: use it where nothing may count unchecked, such as a finance close. If a value needs Approval and its Submitter is the only Approver, the Metric Owner approves it instead, or the Workflow's owner when the Metric Owner submitted it, but only someone who sees the Metric. If that is the Submitter too, nobody else can approve it, and **When nobody else can approve** decides: **let the submitter check it**, the default (also for Workflows made before the choice existed), gives the Submitter a task, "Check your value: … Is that right?", with **Confirm** and **Correct**; or **count it without approval** publishes it at once with the note "Counted without approval: nobody else could approve it". A confirmed value is recorded as **confirmed by the submitter** in its Thread, on the period and in the Audit Log, never as approved; **Correct** replaces the value like a Correction, keeps the first as the original, and counts the new one as confirmed. You can also reply "confirm" or "Correction: 12" to the task's message. As soon as someone else can approve, they are asked as usual, also for a check still waiting when you press Confirm. This makes **Every value** work in a Workspace of one person, such as a trial. The editor warns when every Approver also submits a Metric on the Workflow. **Add approver** adds one, the bin removes one. Approvers are members of the Workspace, not Contacts. "Nobody approves their own value; the next one does." One Approve step per Workflow. |
| **Tell** | **when a value reaches a share of its target / reaches … / falls below … / changes more than … %**, then **Add a person…** and **Add a Group…** | Tells the people and Groups you name, through each person's Delivery Preference, when the latest value of a Metric on this Workflow meets the condition. It tells **once per crossing**: when the condition becomes true, then not again until it has been false. It looks only at published or approved values (a value waiting for Approval is looked at once it is approved) and never at an **Import**, so a Feed catching up with history tells nobody. Each person is told only about Metrics they can see at that moment; the editor says beforehand, "Cora cannot see Sales and will not be told about it", and the rest are skipped without a word. A Group is expanded to its people. A Workflow holds up to 3 Tell steps, each tells at most 20 people, and each message counts against the 20 Alert messages a person is sent a day. A message holds only that Metric's name, period, value, target and change, and a link; it cannot be answered. Everyone told can stop it for this Workflow (see [Your Alerts](17-your-settings.md#your-alerts)), also with the link in the email. A Tell step names people, so a Workflow Template leaves it out. |

**Publish** always comes last and cannot be moved or removed. Its one setting is **lock the period once published**. When ticked, the step reads "Publish and lock the period": the value is published and the period is **Lock**ed straight away. When not, the period is published and stays open for later values.

Changes take effect with **Save workflow**.

**Delete** removes the Workflow for everyone. It is offered only while no Metric uses it.

If you do not own the Workflow, you see its steps without their settings, and a line saying who owns it and that only they change it.

### What happens to a value

Once a value is in, the Workflow does this:

1. **Check.** If the Workflow has a Check step, the value is compared with the period before and with its target. Values a Feed records for past periods that had none yet (an **Import**) are not checked.
2. **Approval.** If the value is unusual, or the Approve step says **Every value**, and the step names someone other than the Submitter, the first Approver gets an Approval task. Until it is approved, the value shows, marked as not approved yet.
3. **Publish.** A value that needs no Approval, or that every Approver has approved, is published, and locked if the Publish step says so.

If the Approve step names nobody, or there is no Approve step, nothing waits for Approval: values are published as they arrive. With **Unusual values only**, the same holds without a Check step, as nothing is then unusual.

Values from the API, an AI assistant and a Feed go through the same steps as any other. The one exception is an **Import**: a value a Feed sends for a past period that has none yet. It is not checked, so a Feed's history does not raise one Approval task per period, and it is marked as imported in the history and named by its Feed. Under **Unusual values only** it counts at once. Under **Every value** it counts at once only for history, a period before the last one that ended; a Feed's value for the period the Workflow is closing, or a later one, waits for the Approvers like any other. So a Feed, or a program with its Feed Key, can still fill an older empty period without Approval, by design; such values are marked as imported and named by their Feed, so they can be found and corrected.

### Metrics on it

The right side lists every Metric that uses this Workflow and that you may see. For each it shows:

- the period being worked on (the last one that has ended) and its Due Date,
- where the value is: **Not started**, **Asked, waiting**, **In, not approved yet**, **Waiting for approval**, **Published**, or **Published and locked**,
- a note when there is one, such as why a value is unusual, who sent it back, or who unlocked the period and why,
- who submits it (a **Feed** by its name) and, where chosen, their Stand-in.

You do not add Metrics here. "A metric's owner picks its workflow on the metric's page." See [A Metric's Workflow box](#a-metrics-workflow-box).

### When Workflows run

In a real Workspace, Workflows run by themselves once a day. The panel says when, such as "Runs every day at 07:00 (Europe/Berlin)". Owners and Admins set the time zone and the hour under **Workspace → General**, in **Workspace time** (see [Workspace settings](16-workspace-settings.md)). Each run sends the day's Prompts, Remind steps and Escalations.

The panel also shows the last run: when it was, whether it was started by hand, and how many people were asked, reminded and escalated, or that it failed.

| Option | What it does | Who sees it |
| --- | --- | --- |
| **Run today's steps now** | Runs today's steps at once, instead of waiting for the hour. Each day runs only once: afterwards the button reads "Today's steps ran", and the clock leaves today alone. | Owners and Admins |

If the panel says that nothing has run by the clock yet, whoever runs Ziffr for this workspace still has to switch on its hourly schedule. Until then, run today's steps by hand each day.

**In the demo**, last month's close is under way when you open it: earlier months are published (and locked on **Monthly finance close**), Orders and Cost for last month are published and locked, Revenue waits for Ben's approval, and Return rate is still waited for. Nothing runs by the clock. A box marked **Demo controls** lets you pretend: pick a day under **Pretend today is** to see the Workflows as of that day. **Run workflows** says "The demo can't be changed.", since running them would save Prompts and reminders.

### Close the period

**Close the period** locks the last ended period for every Metric on this Workflow that has a value for it, all at once. Metrics still missing their value are left open, and so are values still waiting for Approval or sent back: closing a period approves nothing. Ziffr asks you to confirm first: late values and corrections then need Approval, and only a Metric's owner can unlock it. A message says how many Metrics were locked.

Only the Workflow's owner sees this button, and only while Metrics use the Workflow.

## A Metric's Workflow box

Each Metric's page has a **Workflow** box on its **Settings** tab (see [The Metrics screens](10-metrics.md#workflow)). A Derived Metric has none: it is calculated, never sent in.

| Option | What it does | Who may change it |
| --- | --- | --- |
| **Workflow** | Chooses which Workflow the Metric's values take, or **None: values publish as they come**. | The Metric Owner |
| The status line | The last ended period, its Due Date and where its value is, such as "asked, waiting for the value", "in, not approved yet", "waiting for approval", "published" or "published and locked". With a note when there is one. | Nobody: it follows the Workflow |
| **Open …** | Opens the Workflow on the Workflows page. | Everyone |
| **Lock …** / **Unlock …** | Locks or unlocks the last ended period by hand (see [Locks](#locks)). While its value waits for Approval or was sent back, the box says it can be locked once the value is approved instead. | The Metric Owner |
| **Stand-ins** | For each Submitter, the person asked instead while they are **Away**, or when an Escalate step asks the Stand-in. Choose a member or a Contact, or **Nobody**. | The Metric Owner |

Choosing a different Stand-in takes effect at once: the person who stood in before can no longer send values for that Submitter. People enter their own Away dates under **Your Deliveries** (see [Your settings](17-your-settings.md)); while someone is Away, their Prompts go to their Stand-in.

Feeds have no Stand-in. When a Feed's value is missing, the Metric Owner hears of it.

## Approving a value

When a value needs Approval, the Approver gets an Approval task. It appears among their **Actions** (the inbox icon in the top bar) and is sent to them like any task, by email or on Slack: "Approve Revenue for October 2026: 84,000 €, up 42.0 % on September 2026. Reply "approve", or "send back:" with what to check."

On the task's page, the Approver sees a box, **You approve this value**:

| Option | What it does |
| --- | --- |
| **Approve** | Confirms the value. If there is a next Approver, they are asked now; otherwise the value is published, and locked if the Workflow says so. |
| **Send back** | Opens a box, **What should they check?**. Write what looks wrong and choose **Send back** (or **Cancel**). The value stays, marked as not approved yet, and the Submitter gets your comment. They can reply with a corrected value. |

The same works without opening Ziffr: reply "approve", or "send back:" followed by what to check, to the message on Slack or by email.

**To correct the value yourself**, propose a Correction in the task's Thread: type the right value in **Propose a correction** and reply. A Correction takes effect once the Metric Owner accepts it, and then goes through Approval again.

A new value for the same period, such as one sent after a send back, starts Approval over: earlier Approval tasks for that period are closed and no longer decide anything.

## Checking your own value

When a value needs Approval but nobody but you could give it, and the Approve step says **let the submitter check it**, you get a task instead: "Check your value: 60 cups for 19 November 2026, up 900.0 % on 18 November 2026. Is that right?" On its page, a box **Check your value** has:

| Control | What it does |
| --- | --- |
| **Confirm** | The value counts. It is published, and locked if the Workflow says so. The Thread says "Confirmed by the submitter.", the Workflow box notes it on the period, and the Audit Log lists it under **Self-checks**, never as an Approval. |
| **Correct** | Opens a field for the right value; **Correct** replaces the value with it, keeps the first as the original, like an accepted Correction, and counts the new one as confirmed by you. **Cancel** closes the field. |

You can also reply "confirm", or "Correction: 6", to the task's message by email, Slack or Telegram. The task has no **Mark done**, **Close Action** or **Reopen**: only Confirm and Correct decide it. While the check waits, the period cannot be locked or closed, as with any value waiting for Approval. If someone else can approve by the time you press **Confirm**, such as an Approver added in the meantime, they are asked instead and the value waits for them.

Every Approval and every send back is recorded in the **Audit Log**, without the comment.

## Locks

A **Lock**ed period takes no more values. A period is locked in one of three ways:

- by the Publish step, when **lock the period once published** is ticked,
- by the Metric Owner, with **Lock …** in the Metric's Workflow box,
- by the Workflow's owner, with **Close the period**.

When a value arrives for a locked period, it is not recorded. It becomes a proposed **Correction**: the Metric Owner gets a question ("… is locked. … sent … late: accept it as a correction?") with **Accept** and **Decline**. The same holds for a Correction proposed in any Thread. An accepted Correction replaces the value, keeps the earlier one as a **Superseded Value**, and goes through the Metric's Workflow again: it is checked, may need Approval, and is published anew.

**Unlocking** is for the Metric Owner only, and needs a reason. **Unlock …** asks "Why unlock …? It shows in the history." The reason is shown with the period's status, as "Unlocked by … on …". Locking, unlocking and closing a period are all recorded in the Audit Log.

A dashboard can take its **Snapshot** by itself once every Metric on it is Locked for the period (see [The Dashboard screens](12-dashboards.md)).
