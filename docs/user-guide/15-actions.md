<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/actions/**, apps/web/src/app/schedule/asked-view.tsx, apps/web/src/app/schedule/timeline-view.tsx, apps/web/src/app/schedule/choices.tsx, apps/web/src/app/changes/** -->
# Actions and Changes

When a number looks odd, ask the person who knows. An **Action** is a question or a job about one value of a Metric, which one person gives to another. It is either a **Question**, done once it is answered, or a **Task**, done once someone has carried it out. The person it is given to is the **Assignee**. The replies about it form its **Thread**, and the answer stays with the value for anyone who looks later.

Everyone in the Workspace works with Actions, Guests included. This chapter also covers the **Changes** page, which shows what changed and when.

## Checklist Tasks

A Workflow can have **checklist items to tick off** (see [Workflows](11-workflows.md)). Each period such an item gives its Assignee a **Checklist Task**: a Task about the Workflow and its period, such as "Reconcile the bank account", with a Due Date counted in working days after the period ends. It has no Metric, so it shows the Workflow's name and the period (such as "Month-end close, March 2026") where a Metric's name would be, and there is no chart or value on its page.

- It is in the Assignee's **To do** view and calendar like any Task. While the Assignee is **Away**, it goes to the item's Stand-in instead; the Thread says it was given to them as the stand-in, without naming anyone.
- The Workflow's **Remind** steps remind the Assignee that many days before its Due Date, and its **Escalate** steps hand it to the Stand-in (who then reads and answers it, and the first Assignee keeps reading it) or tell the Workflow's owner, as for a missing value. Each happens once for a Task. Ziffr's general reminder of Tasks that are about to fall due leaves Checklist Tasks to these steps, so nobody is reminded twice.
- The Assignee ticks it off with **Mark done**, with a note if they like (what is in the reply box becomes the note), or by replying "done" from Slack, email or Telegram (the words after "done" are the note). Ticking off **closes** the Task at once: the person who asked is told, nobody has to close it, and the Workflow's period counts it as in ("5 of 6 in" counts the values and these Tasks together). A reply that does not start with "done" is only a note. The person who asked, or the Assignee, can reopen it.
- Webhooks hear nothing of Checklist Tasks.

## The Actions row

**Schedule** in the sidebar holds your Actions. Its **To do** view lists the Questions and Tasks given to you among the other things waiting for you; **Asked by me** lists the ones you asked. The number next to Schedule counts the values due and the Actions waiting for you to close. The old address of the Actions page, `/actions`, opens **Asked by me**.

## Share Proposals: sharing an assistant prepared

When you ask an assistant connected to Ziffr to share numbers ("share the coffee results for the last 4 weeks with jenny@example.com"), it can only prepare the sharing. Nothing is shared and nothing is sent until you confirm it yourself in Ziffr.

A **Share Proposal** appears at the top of the Schedule's **To do** view under **Waiting for your confirmation**, and in the assistant's answer as a link. It says which of your dashboards, to whom and how: a View Link to an email address (with the day it ends, and the message, exactly as it would go out) or a Share to a person or Group in your Workspace. Open it with **See what they will see, and confirm**. The page shows the address and the message as plain text, who prepared it, and below that the dashboard as the recipient would read it. For a link to a Snapshot that shows a [Metric deleted](10-metrics.md#deleting-a-metric) since, the page says above it which are **Left out of the link**: a View Link shows nothing of a deleted Metric.

- **Confirm** makes the View Link or gives the Share, and emails the link and your message to the address. If the email cannot be sent, the page shows the link so you can send it yourself.
- **Decline** shares and sends nothing.
- A proposal can be confirmed for 7 days; after that it runs out and the assistant has to prepare it again. You can have 10 waiting at once.

Only you can confirm: not the assistant, and not anyone else in the Workspace. Confirming checks again that the dashboard is yours and that you may share it. Owners and Admins see proposed, confirmed and declined in the Audit Log, with the name of the assistant that prepared it.

## Asking a Question or giving a Task

### From a Widget

Every Widget that shows a Metric has the choices **Ask a question…** and **Assign a task…**. You find them in the Widget's **⋯** menu, or by right-clicking the Widget. This works on dashboards and wherever else a Widget shows its menu.

To ask about one value straight away, right-click that point or bar in the chart. To ask about one row of a Breakdown, such as France, right-click that row. The form then starts with that period or row filled in.

The form has these options:

| Option | What it does |
|---|---|
| **Question** / **Task** | Choose what kind of Action this is. You can switch at any time. |
| **About** | The period the Action is about, with its value. The list shows the most recent 36 periods. If you started from a Breakdown row, the form says which row. |
| **Ask** / **Assign to** | The person who should answer or do it. Ziffr suggests whoever sends in the Metric's values, else its Metric Owner. Only people who sign in can be chosen, not Contacts. |
| The text | What you want to know or want done. Ziffr writes a first draft, such as "Why is cost so high in March 2026?" when the value is outside its Target Range. Change it as you like. |
| **Due** | For a Task only: the day it should be done. Leave it empty for no Due Date. |
| **Who can read** | **Everyone**, or one Group, such as "Management only". See [Who can read an Action](#who-can-read-an-action). |
| **Send via** | How the Assignee hears about it. The first choice, named after the Assignee (such as "Ben's choice"), follows the Assignee's own Delivery Preference. Or pick one Connector, such as email or Slack, for this one message. |

Choose **Send question** or **Assign task**. Ziffr says who it was sent to and offers **Open thread**.

### From a Metric's page

On a Metric's page, click a point in the chart ("Click a point to ask someone about it"). A small form appears with **Assign to**, a drafted question and **Assign Action**. This always makes a Question about that period. For a Task, a Due Date or a limited Thread, use a Widget's menu instead.

The chart on a Metric's page marks the periods that already have Actions, so others can see a value was asked about.

### Who can ask

Anyone who can see a Metric can ask about it or give a Task on it, Guests and Viewers included. The Assignee must be a person in the same Workspace.

## Who can read an Action

The asker, the Assignee and the Metric's Owner can always read an Action and its Thread. Anyone else can read it only if they see its Metric, through a Share or a dashboard or deck shared with them; being an Owner or Admin of the Workspace is not enough. Of those, everyone can read it, unless the asker chose a Group under **Who can read**. Then only the members of that Group who see the Metric can read it, besides those three people. This holds for the Tasks a Workflow makes too, such as Approvals.

A Checklist Task has no Metric to see, so a different rule decides who reads it: the people on it (the Assignee, the Stand-in who holds it, the person who asked and an Assignee it was handed on from) always; the other Owners, Admins and Members of the Workspace unless the item names a Group to keep it to, and then only that Group's people; a Guest only when it is given to them. A Task kept to a Group does not appear in a Member's Schedule, Outbox or timeline if they are outside it. Of a Task you may not read, the Workflow's timeline shows only that one was given or ticked off.

## The Schedule views

The Schedule has three views, switched at the top. They show only what you may see: an Action only if you may read its Thread, and an event only about a Metric you see.

On a phone the choices at the top (view, kind, filters) are larger so a thumb can tap them, and the fields are big enough that the page does not zoom in.

### To do

The default. It lists what you have to do, overdue first and then by Due Date: values to submit, Approvals waiting for you, and the Tasks and Questions given to you. See [My schedule and your calendar](17-your-settings.md#the-schedule-and-your-calendar). **Values**, **Approvals**, **Tasks** and **Questions** above the list narrow it to one kind. Above the list, **To close** shows the Actions you asked that were answered or done, so you can close them; they count in the number next to Schedule.

### Asked by me

The Questions and Tasks you asked, in three groups, each with its count:

| Group | What it holds |
|---|---|
| **Answered, waiting for you to close** | Actions that were answered or done: close them. |
| **Open, waiting for a reply** | Actions with no reply yet. |
| **Done** | Closed Actions. It is folded; open it with its heading. Its rows are grey and carry a plain tick, never red: finished is not an error. |

Each row shows:

- its status: **Open**, **Answered**, **Done** (for a Task) or **Closed**,
- **Task** and its Due Date, for a Task,
- the Metric and the period, then the question or task,
- the value of the period and how it changed against the period before ("150, up 50 %"), only for a Metric you see,
- who asked whom, and how long ago.

Choose a row to open the Action. The newest Action comes first.

### Timeline

The Timeline lists what happened, newest first, grouped by day, one line per event with its time and a dot. It is made of the [Period Timelines](11-workflows.md) of your Workflows (who was asked and reminded, values that came in, Approvals, publishing, locking and Snapshots) and of the Questions and Tasks on Metrics that no Workflow asks for. A line names its Workflow and period.

A line that needs attention, such as an Approval still waiting, says **Needs attention** in words as well as with a red dot. A finished one, such as a locked period or a Snapshot that is ready, has a tick as well as a green dot. All other dots are neutral.

**Workflow**, **Metric** and **Period** narrow the lines; choose **Show** after picking. A Metric you cannot see never appears by name: where it takes part in a line of a Workflow, the line only counts it ("1 value").

## An Action and its Thread

### What the Action shows

At the top you see the status, whether it is a Question or Task, the Due Date, the Metric (a link to its page), the period, the Breakdown row if there is one, and the value, written in the Workspace's Number Style with the Metric's unit. If the value was corrected, the old value is shown crossed out next to it. Below that is who asked whom and when, the question or task itself, and a small chart around the period with the period marked. If you are on the Action but do not see its Metric, for example as an Approver it was never shared with, you see the Action and its value, but the Metric's name is not a link and there is no chart.

**Sent through connectors** lists each time Ziffr sent this Action or a reply to someone: what kind of message, to whom, through which Connector and when. The **Outbox** link there opens the **Outbox** tab of **Connectors**, which shows all of them (see [Workspace settings](16-workspace-settings.md)).

If a Workspace Owner has connected a Webhook to another system, such as a task list, the Action can also be a task there. A line under the Action then says **Also in** that system, with a link when the system gave one. A task you tick off in that system is marked done here, as you, and the Thread shows a message "Marked done in" the Webhook's name; a reply or answer that comes from there shows "via" the Webhook's name. Un-ticking a task there reopens it here, unless it was closed in Ziffr by the asker or by Ziffr itself. The same goes for a Personal Webhook of your own: what its tool sends back is done as you, and only for Actions that were sent to it and that you can still see; it can never approve, send back, share or change a setting.

Some Tasks come from a Workflow: they ask the Approver to approve an Unusual Value, or every value where the Workflow says so. The Approver sees **Approve** and **Send back** on them. When nobody but you could approve your own value, the Task asks you to check it instead, with **Confirm** and **Correct**. Neither kind has **Mark done**: their own buttons decide the value. See [Workflows](11-workflows.md).

### Replying

The Thread lists every reply, oldest first, with who wrote it and when.

Only the asker, the Assignee and the Metric Owner can reply. Everyone else who may read the Action only reads.

| Option | What it does |
|---|---|
| The text box | Your reply. For the Assignee it starts as "Explain what happened…". |
| **Propose a correction** | A new value for the period, if the value is wrong. Shown when the period has a value. See [Corrections](#corrections). |
| **Reply** | Sends your reply. The other person hears about it through their Connector. |
| **Mark done** | For the Assignee of an open Task: says the Task is carried out, with the words in the box as a note when there are any. Its status becomes **Done** (**Closed** for a Checklist Task). Programs and assistants can do the same with `POST /api/v1/actions/{id}/done` and `mark_task_done`, with an optional `note` of at most 2,000 characters. If the Task is no longer open or no longer yours, the reason shows next to the button. Not on a Task that asks for Approval or for checking your own value. |
| **Close Action** | For the asker: ends the Action. The Assignee hears that it was closed. Not offered on an open Approval: that ends when the Approver approves it or sends it back. |

### Approving a value

On an Approval waiting for you, the Action shows the value, its period, the period before it with the change, and who submitted it, with three buttons. **Approve** accepts the value. **Send back** asks what the submitter should check and returns it with your reason. **Correct the value** takes a number and an optional reason and proposes it as a [Correction](#corrections); the Metric's Owner accepts it, and the new value is approved again. You cannot approve your own value, nor a value you entered for someone, nor one entered for you (see [Filling in a value for someone](10-metrics.md#filling-in-a-value-for-someone)), and only the Approver named on the Action sees the buttons. The words "reply approve" belong to chat messages and do not show here.

### From open to closed

An Action moves like this:

1. **Open**: just asked.
2. **Answered**: the Assignee replied. For a Task, **Done**: the Assignee chose **Mark done**.
3. **Closed**: the asker closed it. The asker can close it at any time, also before an answer arrives.

When an Action is closed, the page says "Closed." and nobody can reply. The asker sees **Reopen**, which makes it open again.

## Corrections

A **Correction** is a new value for the period, proposed in the Thread. Type it under **Propose a correction** (on a phone, the keyboard shows numbers), with a reply saying why, and choose **Reply**. You can leave the reply empty; Ziffr then writes "Proposing a correction."

The Thread shows the Correction as the old value crossed out, an arrow and the new value. The Metric Owner hears about it. Until they decide, others see "Waiting for the metric owner … to accept."

The Metric Owner sees two buttons:

- **Accept**: the new value takes the old one's place, and the Correction is marked **Corrected**. Ziffr keeps the first value, shown crossed out. The value then goes through the Metric's Workflow again. If the period was Locked, it opens for Approval again.
- **Decline**: the value stays as it was, and the Correction is marked declined.

Whoever proposed the Correction hears what the owner decided. Each decision is noted in the Audit Log. A Correction is decided once only.

## Answering by email or Slack

Each new Action, reply, proposed Correction and closed Task reaches the person as a **Delivery**: by email, on Slack, by Telegram or through another Connector, as they chose under **Your Deliveries** (see [Your settings](17-your-settings.md)).

People answer by replying to that email, Slack or Telegram message. In Telegram, they reply to the message itself (swipe it to the left, or press and hold it and choose Reply); a message that replies to nothing gets a hint instead, so no answer lands on the wrong question. Their answer goes into the Thread, as if they had written it in Ziffr. A line starting with "Correction:" and a number proposes a Correction. The number stands after the colon or alone on the line under it; without a number the words are an ordinary reply and no value changes. On a Task that asks for Approval, the Approver can reply "approve", or "send back:" followed by what to check. On a Task that asks you to check your own value, reply "confirm", or "Correction:" and the right number. On Slack and Telegram, the message also has an **Approve** button, which only the Approver it went to can use.

When the Installation has no email provider that vouches for senders, a reply by email is **held** first: Ziffr emails you a link, a page shows your reply and what it would do, and pressing **Confirm** records it. The link works once and for 48 hours. If you did not send the reply, ignore the email and nothing happens.

A Prompt asking you for a number is not an Action, but it can come by several ways at once (see [Your settings](17-your-settings.md#where-you-get-what)). Answer on whichever is handiest: the first value Ziffr accepts counts. The other messages are then updated where the app allows it, on Slack and Telegram to "Answered on Telegram: 3" and so on, while an email cannot be changed, so its form link says **Already answered**. If you answer a second time on another way, Ziffr does not drop it: it follows the Metric's Submission Rule, as a second value always does (it may replace the first, be added to it, or be refused), and the reply tells you which and that the request was already answered.

In the demo, where visitors may change it, a Question, Task or reply you write is saved as plain text (at most 1,000 characters, no web addresses) and shows to everyone until the demo starts fresh; the Questions and Threads of the examples on the landing page stay as they are. To answer as someone else, switch **Viewing as** at the bottom of the sidebar to that person; the Action page reminds you with "switch “Viewing as” (at the bottom of the sidebar)". Outside the demo there is no Viewing as: the page only says whom the Action waits for.

## The Changes page

Open **Workspace → Changes**. The page lists every change to what people build, and every number that was replaced, newest first. Nothing on it can be edited. Everyone in the Workspace can open it, and each person sees only what they may see. A Guest sees changes to what is shared with them and to the Workflows of those Metrics, not to templates or Themes.

### What it lists

- **Changes to things people build**: someone created, edited or restored a Widget, dashboard, deck, Metric description, team Widget Template or Dashboard Template, Theme, Workflow or the words of a Snapshot, or gave a Version a name. Each line names the person and the thing, shows the Version number (such as "v3") and links to the thing where it has a page. Edits by one person within ten minutes count as one Version.
- **Replaced values**: "A value" lines say that a value of a Metric for a period was replaced or removed, with the old value. The old value is kept as a **Superseded Value**. A value that someone entered for a submitter says so ("… 42, entered by Ben for Sara, was replaced"); a Guest is not told that someone entered it.

You see a change only if you may see the thing it is about: Metrics you can see, dashboards you own or that were shared with you, your own decks, and Widgets on dashboards you can open. Changes to team Widget Templates and Dashboard Templates, Themes and Workflows are listed for everyone.

The page shows the latest 150 entries.

### Filtering by person

The row of names at the top filters the list. It names the people behind the changes you see, not everyone in the Workspace. **Everyone** shows all entries; a first name shows only that person's changes. Replaced values are not tied to a person, so they show only under **Everyone**.

### Changes, Versions and the Audit Log

Changes shows what changed. To see or restore an earlier state, open **Versions** on the thing itself. Who changed who may see or do what (roles, Shares, Locks, Approvals and the like) is kept in the Audit Log, which only Owners and Admins read (see [Workspace settings](16-workspace-settings.md)).
