<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/actions/**, apps/web/src/app/activity/** -->
# Actions and Activity

When a number looks odd, ask the person who knows. An **Action** is a question or a job about one value of a Metric, which one person gives to another. It is either a **Question**, done once it is answered, or a **Task**, done once someone has carried it out. The person it is given to is the **Assignee**. The replies about it form its **Thread**, and the answer stays with the value for anyone who looks later.

Everyone in the Workspace works with Actions, Guests included. This chapter also covers the **Activity** page, which shows what changed and when.

## The inbox in the top bar

The inbox icon in the top bar opens the Actions page. The number next to it counts the Actions waiting for you:

- Actions given to you that are still open, and
- Actions you asked that were answered or done, so you can close them.

When nothing waits for you, the icon shows no number.

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

The asker, the Assignee and the Metric's Owner can always read an Action and its Thread. Everyone else in the Workspace can read it too, unless the asker chose a Group under **Who can read**. Then only the members of that Group can read it, besides those three people.

## The Actions page

The page lists every Action you may read, in three parts. Each part shows how many Actions it holds.

| Part | What it holds |
|---|---|
| **Waiting for your answer** | Open Actions given to you. |
| **Answered or done, waiting for you to close** | Actions you asked that have been answered or done. |
| **Everything else** | All other Actions you may read. |

Each row shows:

- its status: **Open**, **Answered**, **Done** (for a Task) or **Closed**,
- **Task** and its Due Date, for a Task,
- the question or task,
- the Metric and the period it is about,
- who asked whom.

Choose a row to open the Action.

## An Action and its Thread

### What the Action shows

At the top you see the status, whether it is a Question or Task, the Due Date, the Metric (a link to its page), the period, the Breakdown row if there is one, and the value. If the value was corrected, the old value is shown crossed out next to it. Below that is who asked whom and when, the question or task itself, and a small chart around the period with the period marked.

**Sent through connectors** lists each time Ziffr sent this Action or a reply to someone: what kind of message, to whom, through which Connector and when. The **Outbox** link there shows all of them (see [Workspace settings](16-workspace-settings.md)).

Some Tasks come from a Workflow: they ask the Approver to approve an Unusual Value. The Approver sees **Approve** and **Send back** on them. See [Workflows](11-workflows.md).

### Replying

The Thread lists every reply, oldest first, with who wrote it and when.

Only the asker, the Assignee and the Metric Owner can reply. Everyone else who may read the Action only reads.

| Option | What it does |
|---|---|
| The text box | Your reply. For the Assignee it starts as "Explain what happened…". |
| **Propose a correction** | A new value for the period, if the value is wrong. Shown when the period has a value. See [Corrections](#corrections). |
| **Reply** | Sends your reply. The other person hears about it through their Connector. |
| **Mark done** | For the Assignee of an open Task: says the Task is carried out. Its status becomes **Done**. |
| **Close Action** | For the asker: ends the Action. The Assignee hears that it was closed. |

### From open to closed

An Action moves like this:

1. **Open**: just asked.
2. **Answered**: the Assignee replied. For a Task, **Done**: the Assignee chose **Mark done**.
3. **Closed**: the asker closed it. The asker can close it at any time, also before an answer arrives.

When an Action is closed, the page says "Closed." and nobody can reply. The asker sees **Reopen**, which makes it open again.

## Corrections

A **Correction** is a new value for the period, proposed in the Thread. Type it under **Propose a correction**, with a reply saying why, and choose **Reply**. You can leave the reply empty; Ziffr then writes "Proposing a correction."

The Thread shows the Correction as the old value crossed out, an arrow and the new value. The Metric Owner hears about it. Until they decide, others see "Waiting for the metric owner … to accept."

The Metric Owner sees two buttons:

- **Accept**: the new value takes the old one's place, and the Correction is marked **Corrected**. Ziffr keeps the first value, shown crossed out. The value then goes through the Metric's Workflow again. If the period was Locked, it opens for Approval again.
- **Decline**: the value stays as it was, and the Correction is marked declined.

Whoever proposed the Correction hears what the owner decided. Each decision is noted in the Audit Log. A Correction is decided once only.

## Answering by email or Slack

Each new Action, reply, proposed Correction and closed Task reaches the person as a **Delivery**: by email, on Slack, by Telegram or through another Connector, as they chose under **Your Deliveries** (see [Your settings](17-your-settings.md)).

People answer by replying to that email, Slack or Telegram message. In Telegram, they reply to the message itself (swipe it to the left, or press and hold it and choose Reply); a message that replies to nothing gets a hint instead, so no answer lands on the wrong question. Their answer goes into the Thread, as if they had written it in Ziffr. A line starting with "Correction:" and a number proposes a Correction. On a Task that asks for Approval, the Approver can reply "approve", or "send back:" followed by what to check.

In the demo, to answer as someone else, switch **View as** in the top bar to that person, as the Action page reminds you.

## The Activity page

Open **Workspace → Activity**. The page lists every change to what people build, and every number that was replaced, newest first. Nothing on it can be edited. Everyone in the Workspace can open it, and each person sees only what they may see.

### What it lists

- **Changes to things people build**: someone created, edited or restored a Widget, dashboard, deck, Metric description, team Widget Template or Dashboard Template, Theme, Workflow or the words of a Snapshot, or gave a Version a name. Each line names the person and the thing, shows the Version number (such as "v3") and links to the thing where it has a page. Edits by one person within ten minutes count as one Version.
- **Replaced values**: "A value" lines say that a value of a Metric for a period was replaced or removed, with the old value. The old value is kept as a **Superseded Value**.

You see a change only if you may see the thing it is about: Metrics you can see, dashboards you own or that were shared with you, your own decks, and Widgets on dashboards you can open. Changes to team Widget Templates and Dashboard Templates, Themes and Workflows are listed for everyone.

The page shows the latest 150 entries.

### Filtering by person

The row of names at the top filters the list. **Everyone** shows all entries; a first name shows only that person's changes. Replaced values are not tied to a person, so they show only under **Everyone**.

### Activity, Versions and the Audit Log

Activity shows what changed. To see or restore an earlier state, open **Versions** on the thing itself. Who changed who may see or do what (roles, Shares, Locks, Approvals and the like) is kept in the Audit Log, which only Owners and Admins read (see [Workspace settings](16-workspace-settings.md)).
