<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/login/**, apps/web/src/app/demo/**, apps/web/src/app/settings/profile/**, apps/web/src/app/settings/deliveries/**, apps/web/src/app/settings/assistants/**, apps/web/src/app/oauth/authorize/**, apps/web/src/components/top-bar.tsx, apps/web/src/components/view-as.tsx, apps/web/src/components/demo-controls.tsx, apps/web/src/components/reset-button.tsx, apps/web/src/components/tour.tsx -->
# Signing in and your own settings

This chapter covers what is yours rather than the team's: signing in, the demo, the top bar, and your two own pages, **Your profile** and **Your Deliveries**. Everyone has them, whatever their role. The team's pages are in [Workspace settings](16-workspace-settings.md).

## Signing in

The page **Sign in to Ziffr** opens whenever you are not signed in. Under its heading it says what Ziffr is: a metric tracker for anyone.

On a Ziffr that is only a public demo, the same page is called **Try Ziffr**. It has no sign-in, only **Try the demo** and a link to run Ziffr yourself. Everyone there shares the demo, and it starts fresh every night.

On a Ziffr that offers **Trial Workspaces**, the page is called **Try Ziffr** too, with two choices side by side. **Try it for real** lists what works in a trial on this Ziffr (each way marked Real, Simulated or Off, with its limit), says what a trial asks of you, and has the sign-in form; where the Ziffr has set it up, a short check against bots by Cloudflare sits above the buttons; the email link and any other way to sign in work once it has passed. If the check fails or Cloudflare cannot be reached, no link is sent, and a new check appears for the next try. **Look around** opens the shared demo and says what it cannot do. See [On a Ziffr that offers trials](16-workspace-settings.md#on-a-ziffr-that-offers-trials).

| Option | What it does |
| --- | --- |
| **Work email** | The address you sign in with |
| **Send me a sign-in link** | Ziffr emails you a link. Open it to sign in. It works once. |
| **Continue with** Google, Microsoft, GitHub or LinkedIn | Shown only for the ways of signing in your Ziffr has set up. Signs you in with that account. |
| **Try the demo** | Opens the demo without an account, where your Ziffr offers it |

If the link cannot be sent, the page says why under the button, such as **The link could not be sent. Try again.** or that the check against bots did not pass.

After you ask for a link, the page says "Check your inbox". If a link has been used already or does not work, the page says so: ask for a new one. If you ask for many links in a short time, Ziffr asks you to wait a minute.

Your address counts as proven when you signed in with the email link or a provider that proves it, such as Google. A proven address is what an email Invitation and Domain Joining check.

After signing in for the first time, you start a Workspace or join one; see [Workspace settings](16-workspace-settings.md#starting-a-workspace).

## The demo

**Demo Mode** is a visit to a made-up online shop with its own made-up people. Every visitor shares it, and nothing done there reaches a real Workspace. It is the place to look around before you start; see also [Getting started](07-getting-started.md).

### Opening the demo

Choose **Try the demo** on the sign-in page. If you are already signed in, Ziffr first asks **Open the demo?**: what you type there is seen by others and reset now and then, so keep your real numbers in your own Workspace. Choose **Open the demo**, or **Stay in my workspace**.

While you are in the demo, the top bar shows three controls. On a narrow screen they sit in a row of their own below the bar.

| Control | What it does |
| --- | --- |
| **Viewing as** | Pick one of the made-up people, shown by first name and job, such as "Anna, head of sales". Ziffr then shows exactly what that person sees and lets you act as them, including their Workspace Role. |
| **↺** (Reset demo data) | After asking, puts the whole demo back to its starting point, for everyone looking at it right now. It can be reset at most once a minute. |
| **Leave the demo** | Ends the visit. You go back to signing in, or to your own Workspace if you are signed in. |

### Demo controls

Some pages have a dashed box marked **Demo controls**. Its buttons pretend what would happen by itself in a real Workspace, such as answering as the recipient of a message or starting the morning's Prompts by hand. You never see them outside the demo.

### What the demo keeps

The demo's people keep their names and colours, and the demo sends no email. It has no Invitations, Contacts you can add, Access Keys, Feeds, Audit Log or Workspace settings you can change.

### The guided tour

In the demo, the **Guided tour** sits at the bottom right. Choose it to open the steps, and click a step to go to its page:

1. **Define a metric** from the catalog.
2. **Capture a value** by answering a Slack Prompt, and send a second one to see the Submission Rule.
3. **Build your dashboard** from the Pool.
4. **Ask without leaving**: ask a question, answer it as someone else with a Correction, and accept it.
5. **Analyze**: run a Recipe and add the result to a dashboard.
6. **Make a deck** and export it.
7. **Share** your dashboard and see what the other person gets.

The circle in front of a step marks it done. The header shows how many are done and which comes next. The **−** button folds the tour down to a small round button that shows your progress; choose it to open the tour again. Your browser remembers where you are.

## The top bar

The top bar is on every page once you are in a Workspace.

### On a computer

| Part | What it does |
| --- | --- |
| **Ziffr** | Goes to your Home dashboard |
| **Dashboards**, **Decks**, **Metrics**, **Analyze** | The main pages most people use every day |
| **Workspace** | A menu with the Workspace's own pages. Which pages you see depends on your role; see [Workspace settings](16-workspace-settings.md#the-workspace-menu). |
| The inbox icon (**Actions**) | Your **Actions**: questions and tasks waiting for you. A number shows how many are open. |
| The question mark (**User guide**) | Opens this guide. Your team may have pointed it at its own page instead, which opens in a new tab. |
| Your name and the Workspace's name | The menu under your name |

### The menu under your name

| Option | What it does |
| --- | --- |
| **Workspace** | Shown when you belong to more than one Workspace. Pick another to switch to it. |
| **New workspace** | Starts another Workspace, of which you become the Owner |
| **Your profile** | Your name, colour and address |
| **Your Deliveries** | Where Ziffr reaches you, and when you are Away |
| **Installation settings** | Only for Installation Admins: what this Ziffr talks to and who runs it; see [Installation settings](18-installation-settings.md) |
| **Sign out** | Signs you out on this device |

### On a phone

On a phone the bar keeps the Ziffr name, the Actions icon and a menu button. The menu button opens one list with three groups: **Main** (Dashboards, Decks, Metrics, Analyze), **Workspace** (the Workspace's pages) and your name (Your profile, Your Deliveries, and Installation settings for Installation Admins). Below them are **User guide**, a **Workspace** picker if you belong to several, **New workspace** and **Sign out**. Moving to another page closes the menu.

Ziffr works best on a phone once you install it: it then opens from the home screen like an app, with the same top bar. See [Put Ziffr on your phone or desktop](07-getting-started.md#put-ziffr-on-your-phone-or-desktop).

## Your profile

Open it from the menu under your name, or from **Profile** in the side list of the settings area. Your profile is how others see you in every Workspace you belong to: a change shows in all of them.

| Option | What it does |
| --- | --- |
| **Name** | Your name as others see it, up to 80 characters |
| **Colour** | One of six colours, shown with your initial wherever people are picked, such as when sharing |
| **Save** | Saves both |
| **Email** | The proven address you signed in with. It cannot be changed here. If you signed in a way that does not prove an address, it says so. |
| **Sign out** | Signs you out |

In the demo, the made-up people keep their names and colours, the address is made up, and the last button is **Leave the demo** instead of **Sign out**.

## Your Deliveries

Open it from the menu under your name, or from **Deliveries** in the settings area. A **Delivery** is one message Ziffr sends you through a Connector. This page sets where those messages go in the current Workspace, and who is asked while you are away. You can only change your own.

### Where you get what

Your **Delivery Preference** for each kind of message:

| Kind | What it covers |
| --- | --- |
| **Questions** | Questions someone assigns to you |
| **Tasks** | Tasks someone assigns to you |
| **Reminders** | Prompts asking you for a value, and reminders of tasks that are due |
| **Replies and updates** | Replies in a Thread, proposed Corrections, decisions and tasks that were closed |

For each, pick **Email**, **Slack**, **Telegram**, **WhatsApp** or **Ticket system**, or leave it at **Team default** (which shows what the team default is). Owners and Admins set the team default on the Connectors page. A change is saved at once.

Whoever asks you a question can still pick another way for that one message. WhatsApp and ticket systems are not live yet: Ziffr only records what it would send there, in the Outbox. See [Connecting Ziffr](04-connecting.md) for what each Connector does.

### Requests for numbers by email

The box **Send me Prompts and reminders by email in this workspace** is ticked while you get them. Untick it to stop them. Questions, tasks and replies keep coming, and the owners of the Metrics you send in are told once that you stopped. Tick it again to get them back. The same happens when you use the unsubscribe link in one of these emails.

If your Ziffr sends no email, the box cannot be ticked and the page says so.

### Away

Pick the first and the last day you are **Away**. While you are away, Prompts meant for you go to your **Stand-in**. The dates are saved as soon as both are set; **Clear** removes them. Owners and Admins can also set your Away dates on **Members and Groups**.

## Connected assistants

**You → Connected assistants** lists the AI assistants you connected to Ziffr by its address, such as Claude.ai: for each, the name it gave itself, the Workspace, what it may do, when you connected it, when it was last used and until when it works. **Disconnect** ends one at once. A connection also ends on its end date and when you leave its Workspace, and an Owner can end it on the Workspace's **Access Keys** page, where it shows as a **Connected assistant**.

### Connecting an assistant

In the assistant, add a connector with your Ziffr's address followed by `/mcp`, such as `https://ziffr.example.com/mcp`. The page shows the exact address. The assistant opens Ziffr's page **Connect an assistant to Ziffr?**, after you sign in if you are not signed in yet:

| Part | What it is |
| --- | --- |
| **says it is "…"** | The name the assistant gave itself. Any program can give itself any name, so check that you started this from that assistant just now. |
| **you go back to …** | Where Ziffr sends you after you answer. For an assistant on your own computer, a note says that any program there could claim its name. |
| **Workspace** | The one Workspace the assistant works in. |
| **It may** | What it may do: read metrics and their values, submit values, create metrics, change metrics (targets, Target Series, Projections and the Unusual Value check), read dashboards, build dashboards. Only reading is ticked to begin with. Guests cannot let it create anything. |
| **Until** | The last day it works, 90 days from now unless you pick another, at most a year. |
| **Connect** / **Cancel** | Connect makes the connection and sends you back to the assistant; Cancel tells the assistant no. |

Without a Workspace of your own, the page says so: start one, then press Connect in the assistant again.

A connection acts as you, with your current Workspace Role, and sees no more than you do. What it does shows in the Access Log on the **Access Keys** page. A Trial Workspace can have one connected assistant at a time. The demo has none.

### Working with an assistant

Once Ziffr is connected, as in [Connecting an assistant](#connecting-an-assistant) or with an Access Key on your own computer ([An AI assistant](04-connecting.md#an-ai-assistant)), you ask the assistant in your own words. It looks things up in Ziffr and answers.

#### Ready-made requests

Ziffr offers the assistant a few **Starters**, ready-made requests you pick instead of writing them:

| Starter | What the assistant does |
| --- | --- |
| **What can I do here?** (`what_can_i_do`) | Looks at your Workspace and explains what it can read, record and build for you, with your Metrics as examples. |
| **Weekly review** (`weekly_review`) | Tells you which Metrics moved notably, which values are still missing for the last period and anything unusual. You can name the period, such as "last week". It only reads. |
| **Record values** (`record_values`) | Takes a sentence such as "3 coffees today, 12 signups this week", shows which Metric and period each number would go to, and records them once you agree. |
| **Build a dashboard** (`build_dashboard`) | Proposes one dashboard on a topic you name, from your Metrics and the team's Dashboard Templates, and builds it only once you agree. You get its link. |
| **Explain a Metric** (`explain_metric`) | Explains one Metric: what it measures, its values over time and where it is heading. It only reads. |
| **Set targets** (`set_targets`) | Takes a sentence such as "budget 5000 a month for revenue in 2027", shows which Metric gets which Target Range, Target Series or Projection for which periods, and sets them once you agree. It can also change when a value counts as unusual. |

Where to find them:

- **Claude.ai** and the Claude apps: press **+** in the message box and look under the connector's name, such as **Ziffr**. Pick a Starter, fill in what it asks for if you like, and send. Left empty, the assistant asks you.
- **Claude Code:** type `/` and look for the commands marked **(MCP)**, such as `/ziffr:weekly_review`; you can also type `/mcp__ziffr__weekly_review`. `ziffr` is the name you gave the server when you added it. You can add a one-word answer after a space, such as `/mcp__ziffr__weekly_review 2026-03`. Claude Code reads each word as an answer of its own, so for anything longer, such as the numbers for **Record values** or **Set targets**, start the command without anything after it and tell the assistant when it asks.

A Starter is only words for the assistant. It can do nothing you could not ask for yourself, and the ones that record, set or build show you their plan and wait for your yes.

#### What you can ask

You do not need a Starter. Some examples:

- **Reading:** "What was revenue in March?", "Which Metrics are below their target this month?", "How did weekly signups develop over the last quarter, compared with a year ago?"
- **Recording:** "Record 42 orders for this month.", "I sold 3 coffees today and 5 yesterday.", "Start tracking weekly signups."
- **Targets:** "Revenue should stay between 40,000 and 60,000 a month.", "Flag orders as unusual when they change more than 25 %.", "Our budget for signups is 500 in January, 550 in February and 600 in March.", "Our forecast says 70,000 revenue next quarter: add it as a Projection."
- **Dashboards:** "Make a dashboard for sales from the one-metric template.", "Add a line of churn to my Customers dashboard."

#### What the assistant may do, if you let it

- **Submit values:** record values for the Metrics you submit to. A value follows the Metric's rules like yours: it may wait for an Approval, or be refused in a locked period.
- **Create metrics:** create Metrics owned by you. It can also delete a Metric you own, with all its values, when you ask and confirm the Metric's name. That cannot be undone, so leave this unticked unless you need it.
- **Change metrics:** change the **Target Range** (the range a value should be in), the Polarity and the Attainment method, the **Target Series** and the **Projections** of the Metrics you own or are an Editor of. A Projection is only for the current period or a later one. It can also change when a value counts as an **Unusual Value**, in the check of a Workflow you own. That Workflow may be shared by several Metrics, and the change applies to all of them: the assistant tells you which Workflow and how many Metrics before it changes anything.
- **Build dashboards:** make dashboards, and change the dashboards you may change yourself, not only the ones it made. Every change is in the dashboard's history under its name, so you can restore what came before.

#### What the assistant cannot do

- It sees no more than you do, and only what you let it when you connected it: if you ticked only reading, it cannot record, change or build anything, whatever it tries. As a Guest, you cannot let it create or change anything.
- It never shares anything, deletes a dashboard, makes a View Link, changes who may see what, changes a Metric's name, description, period, Workflow or Submitters, adds or removes a Workflow's steps, or changes settings.
- Everything it does shows in the Access Log.
- It answers from what Ziffr gives it, but it can still misread a number. Check what it says before you pass it on, and ask it to show the values it used.
