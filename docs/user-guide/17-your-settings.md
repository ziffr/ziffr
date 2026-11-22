<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/settings/appearance/**, apps/web/src/app/login/**, apps/web/src/app/demo/**, apps/web/src/app/settings/schedule/**, apps/web/src/app/schedule/**, apps/web/src/app/settings/profile/**, apps/web/src/app/settings/deliveries/**, apps/web/src/app/settings/alerts/**, apps/web/src/components/alerts.tsx, apps/web/src/app/settings/assistants/**, apps/web/src/app/settings/your-webhooks/**, apps/web/src/app/oauth/authorize/**, apps/web/src/components/app-shell.tsx, apps/web/src/components/nav-parts.tsx, apps/web/src/components/view-as.tsx, apps/web/src/components/demo-controls.tsx, apps/web/src/components/tour.tsx -->
# Signing in and your own settings

This chapter covers what is yours rather than the team's: signing in, the demo, the sidebar, and your own pages: **My schedule**, **Your profile**, **Appearance**, **Your Deliveries** and **Your Alerts**. Everyone has them, whatever their role. The team's pages are in [Workspace settings](16-workspace-settings.md).

## Signing in

The page **Sign in to Ziffr** opens whenever you are not signed in. It is a card with the form on one side and, beside it, a short line on what Ziffr is with a picture of the demo's Monthly overview dashboard; on a phone the form comes first and the picture is left out. Under its heading it says what Ziffr is: the record of your numbers.

On a Ziffr that is only a public demo, the same page is called **Try Ziffr**. It has no sign-in, only **Try the demo** and a link to run Ziffr yourself. Everyone there shares the demo, and nothing anyone does there is saved.

On a Ziffr that offers **Trial Workspaces**, the page is called **Try Ziffr** too, with two choices one above the other. **Try it for real** (a Workspace of your own, starting with one Metric to try asking with) has **What works in a trial**, which opens to list what works in a trial on this Ziffr (each way marked Real, Simulated or Off, with its limit), says what a trial asks of you, and has the sign-in form; where the Ziffr has set it up, a short check against bots by Cloudflare sits above the buttons; the email link and any other way to sign in work once it has passed. If the check fails or Cloudflare cannot be reached, no link is sent, and a new check appears for the next try. **No account? Look around first**, below the form, opens the shared demo and says what it cannot do. See [On a Ziffr that offers trials](16-workspace-settings.md#on-a-ziffr-that-offers-trials).

| Option | What it does |
| --- | --- |
| **Work email** | The address you sign in with |
| **Send me a sign-in link** | Ziffr emails you a link. Open it to sign in. It works once. |
| **Continue with** Google, Microsoft, GitHub or LinkedIn | Shown only for the ways of signing in your Ziffr has set up. Signs you in with that account. |
| **Try the demo** | Opens the demo without an account, where your Ziffr offers it |

Whether the page offers the demo, Trial Workspaces and the check against bots is up to whoever runs your Ziffr, on its [Installation settings](18-installation-settings.md) page; a change there shows here at once. While a check against bots is set up, the page shows it above the button, and no link is sent until it is passed.

If the link cannot be sent, the page says why under the button, such as **The link could not be sent. Try again.** or that the check against bots did not pass.

After you ask for a link, the page says "Check your inbox". If a link has been used already or does not work, the page says so: ask for a new one. If you ask for many links in a short time, Ziffr asks you to wait a minute.

Your address counts as proven when you signed in with the email link or a provider that proves it, such as Google. A proven address is what an email Invitation and Domain Joining check.

After signing in for the first time, you start a Workspace or join one; see [Workspace settings](16-workspace-settings.md#starting-a-workspace).

## The demo

**Demo Mode** is a visit to a made-up online shop with its own made-up people. Every visitor shares it, and nothing done there is saved or reaches a real Workspace. It is the place to look around before you start; see also [Getting started](07-getting-started.md).

### Opening the demo

Choose **Try the demo** on the sign-in page. If you are already signed in, Ziffr first asks **Open the demo?**: nothing you do there is saved, so your own numbers belong in your own Workspace. Choose **Open the demo**, or **Stay in my workspace**.

While you are in the demo, the footer of the sidebar shows your menu with **Viewing as**, your own pages and **Leave the demo**.

| Control | What it does |
| --- | --- |
| **Viewing as** | Pick one of the made-up people, shown by first name and Workspace Role, such as "Ben, Admin". The demo has an Owner (Sara), an Admin (Ben), Members and a Guest (Greta, an outside bookkeeper who sees only two Metrics and a dashboard shared with her). Ziffr then shows exactly what that person sees and lets you act as them. |
| **Leave the demo** | Ends the visit. You go back to signing in, or to your own Workspace if you are signed in. |

### Demo controls

Some pages have a dashed box marked **Demo controls**. Its buttons show what would happen by itself in a real Workspace, such as answering as the recipient of a message or starting the morning's Prompts by hand. You never see them outside the demo.

### Nothing is saved

You can open every page, switch between the people and try every button and form, but the demo can't be changed: where something would be saved, Ziffr says "The demo can't be changed." Where this Ziffr offers trials, it adds a link, "Try it with a trial of your own." A form with no place of its own for the answer shows it on a screen headed **Nothing was saved**; **Back** returns to the form.

The simulators on **Connectors → Sources** and in the **Outbox** answer with what would happen, such as "Would be: Recorded", and keep nothing. What you tried in the Sources simulator stays on the page until you leave it, marked "not saved".

The demo's people keep their names and colours, and the demo sends no email. It has no Access Keys, Feeds or Audit Log.

### The guided tour

In the demo, the **Guided tour** sits at the bottom right. Choose it to open the steps, and click a step to go to its page:

The tour reads first, because the demo can't be changed:

1. **Look at a dashboard** and click a number to see its history.
2. **See what others see**: switch **Viewing as** to Anna and to the Guest.
3. **Analyze**: run a Recipe and look at what it finds.
4. **Open a deck** and click through its slides.
5. **Capture a value** by answering a Slack Prompt, and send a second one to see the Submission Rule.
6. **Define a metric** from the catalog; the demo won't save it, which is what a trial is for.

A Guest gets a shorter tour of three steps, since they create nothing: **Look at what is shared**, **Submit a value** and **Answer a question**.

The circle in front of a step marks it done. The header shows how many are done and which comes next. The **−** button folds the tour down to a small round button that shows your progress; choose it to open the tour again. Your browser remembers where you are.

## The sidebar

The sidebar is on every page once you are in a Workspace. At its top is the Workspace switcher, then a **Search** field (Ctrl+K), **Actions** and **Schedule**, each with its count, Dashboards (with the dashboards you pinned under it, see [Pinning a dashboard](12-dashboards.md#pinning-a-dashboard)), Metrics, Decks, Analyze and one **Workspace** row that opens **Members and Groups**, **Workflows**, **Connectors** and **Settings** (closed unless you are on one of them; Guests do not see it). **User guide** and your own menu (**Your profile**, **Appearance**, **Your Deliveries**, **Your Alerts**, **Connected assistants**, and **Installation settings** for Installation Admins) sit at its bottom. The page is a card beside it, and in the demo, **Viewing as** and **Leave the demo** sit in the footer where your own menu is, with **Your profile**, **Appearance**, **Your Deliveries** and **Your Alerts** to look at (read-only, as the demo is; there is no Connected assistants). Ctrl+B (or the button at the top of the card) shrinks the sidebar to icons; hover or focus an icon to see its name. Details open beside the page instead of replacing it: **Details** on a row of the Metrics list, and **Alert me…** on a Metric's page. On a phone, a bar at the bottom has Dashboards, Metrics, Actions, Search and More; **More** lists only what the bar does not: your pinned dashboards, Schedule, Decks, Analyze, the Workspace as one row that opens its pages, the guide and your own pages (in the demo, the same four). For how search works, see [Search](#search).

Ziffr works best on a phone once you install it: it then opens from the home screen like an app. See [Put Ziffr on your phone or desktop](07-getting-started.md#put-ziffr-on-your-phone-or-desktop).

## Search

Press **⌘K** (on Windows and Linux **Ctrl+K**), or choose the magnifying glass, and type. Ziffr finds the Metrics, dashboards, decks and Workflows whose names fit what you typed, ignoring capitals and accents, and only those you may see in the Workspace you are in. A Metric that is archived is marked **Archived**, and listed after the ones in use. Results are grouped: **Commands**, **Pages**, **Metrics**, **Tags**, **Dashboards**, **Decks**, **Workflows**, **People** and **Groups**.

**Tags.** Type a word that is one of your Metrics' Tags, such as "finance", and Search offers **Tag: finance (7 Metrics)**, which opens the Metrics list filtered by it. Metrics are also found by their Tags, after the ones whose names fit, and say which Tag matched. You only find Tags that sit on Metrics you may see: a word used only on Metrics you cannot see finds nothing, the same as a word nobody uses.

Two Metrics you can see may have the same name. Their results then say whose each is, in brackets, such as "Support tickets (Ben)", with the period and unit added only where the owner is not enough.

Add a period and Ziffr finds that Metric's value for it: "churn march 2026", "revenue Q3", "visits last week" or, in German, "Besuche KW 46". Ziffr reads the period the way it reads replies, in the Workspace's Answer Languages and with its Fiscal Year (see [Workspace settings](16-workspace-settings.md)). The result, marked **Value**, opens the Period Record: that value, how it came to be, and the Threads about it. A period is only found when it is one of the Metric's own periods ("March 2026" for a monthly Metric, not "2026"), and has begun.

**Pages.** Every page you can open is found by its name and by plain words: "invite" finds Members and Groups, "webhook" finds Webhooks, "approval" finds Actions and Workflows, "retention" and "limit" find Size and Retention. You are only offered pages your role can open; a Guest, for example, is not offered Webhooks or the Audit log.

**People and Groups.** Members and Contacts are found by name and lead to Members and Groups. A Guest finds only themselves and the Groups they are in, never other members.

**Commands.** **New metric**, **New dashboard**, **New deck**, **Paste values** (for those who may create), **Invite someone** (for Owners and Admins), **Record a value for** a Metric you submit (it opens your own form; type "record" and part of the Metric's name), **Switch Workspace to** another of your Workspaces, **Open the demo** where your Ziffr offers it, and **Toggle sidebar** in the new layout.

Opened without typing, Search lists your recent items, the last five things you opened from it, and the commands you may use. The recent items are kept in this browser only, for you alone; your own form links are never kept.

Move through the results with the arrow keys, open one with **Enter**, and close the search with **Esc**. Nothing you type is kept.

Your assistant can do the same: ask it for "churn march 2026" and it looks the Metric and period up before it reads the value (see [Working with an assistant](#working-with-an-assistant)).

## On a phone

On a phone the demo's note is one line, the guided tour starts as a small round button, and everything you press is at least 44 px high. The row of Settings pages scrolls sideways and fades out at the edge to say so.

Ziffr works best on a phone once you install it: it then opens from the home screen like an app, with the same layout. See [Put Ziffr on your phone or desktop](07-getting-started.md#put-ziffr-on-your-phone-or-desktop).
## My schedule and your calendar

Open **My schedule** from the **Schedule** row of the sidebar (with the number of values due). Its address is `/schedule`; the old `/settings/schedule` still lands on it. It lists what you have to do in the current Workspace, and only that:

| Part | What it lists |
| --- | --- |
| **Overdue** | Everything late from the last 90 days, the most late first, with how many working days late it is (Saturdays and Sundays do not count) |
| **Today** and the next days | What falls on each of the next 14 days, today first; days with nothing are left out |
| **No date** | Tasks without a due date, and Questions asked of you |

Each line links to where you do it:

| Line | When it falls | Where it takes you |
| --- | --- | --- |
| **Revenue for October 2026 due** | The value's Due Date, set by the Metric's Workflow, such as the 3rd working day after the month ends. It says when Ziffr reminds you, such as "Ziffr reminds you 2 days before". A Metric without a Workflow has no Due Date: only its last ended period without a value is listed, on the first working day after it ends, marked "no Due Date set". | Your form for the Metric, or the Metric's page if you have no form for it |
| **Approve: Cost for October 2026** | The day you were asked. It is overdue from the day after that period's Due Date. | The Approval |
| **Task: …** | The Task's due date, or under **No date** | The Task |
| **Question: …** | A Question the Workflow asked because a value is missing (an Escalation) falls on that value's Due Date. Other Questions are under **No date**. | The Question |

A value due leaves the list as soon as the value is in. While a colleague is Away on a Due Date, their value is in their Stand-in's schedule, marked "standing in for …", and not in theirs. Only values of Metrics you may see are listed; an Approval, Task or Question you are assigned is listed even on a Metric you do not see, as on the Actions page. Values a Feed sends are never anyone's to do.

### List, Week and Month

Above the schedule a switch chooses how it is shown: **List** (the lines above), **Week** or **Month**. Ziffr remembers your choice in this browser. The week and the month show the same duties on their days, nothing more; use the arrows to move to other weeks and months, up to about three months ahead, and **Today** to come back.

- **Week** has a column for each day, from the Workspace's first day of the week (Monday, unless an Owner or Admin chose Sunday in **Workspace → General**), with today marked. Each duty is a small card in its kind's colour, with its words as in the list; click it to open what the list line opens. On a phone the week becomes an agenda, one day under the other.
- **Month** shows up to three cards per day, and **+ 2 more** opens that day's whole list below the grid. On a phone each day shows dots for its duties instead; touch a day to read its duties below the grid.
- Something **Overdue** sits on today, marked as late, with the day it was originally due. Tasks without a due date and Questions stay under **No date**, in every view.
- With the keyboard, the arrow keys move between days, Enter opens a day, and a screen reader reads each day with its duties as a list.

Your assistant can read the same list: ask it "What do I have to do in Ziffr this week?" (see [Working with an assistant](#working-with-an-assistant)).

Owners and Admins can read a teammate's Schedule through the API or an assistant, for example to cover for them. It lists only Metrics they may see themselves. A Task or Question whose Thread is kept to a Group they are not in is still listed, with its date and link, but without its words. Each such read is in the Audit Log, naming whose Schedule it was and for which days; reading your own is not.

### In your calendar

A **Calendar Link** puts your schedule in your calendar app, next to your meetings: each date as an all-day entry, such as "Revenue for October 2026 due" or "Approve: Cost for October 2026", from 30 days back to 90 days ahead. Something late stays on its own date, with "(overdue)" in its title. Entries without a date are left out. Each entry links to where you do it in Ziffr, and the link asks you to sign in. Nothing you do in the calendar changes anything in Ziffr.

| Option | What it does |
| --- | --- |
| **Get a calendar link** | Makes the address, once per Workspace. It is shown this once with **Copy**: copy it straight away. Ziffr keeps only a fingerprint of it, so nobody can show it to you again, not even an Owner. |
| **No names** | Entries then say only what and how many, such as "Ziffr: 2 values due" or "Ziffr: 1 Approval", one per kind and day, and link only to My schedule. Choose this if others can see your calendar, such as colleagues or family. You can switch it later; the address stays the same. |
| **Make a new link** | Makes a new address. The old one stops working at once. Use it if the address reached someone it should not have. |
| **Turn off** | Ends the link at once. |

To subscribe, paste the address:

- **Apple Calendar:** File → New Calendar Subscription. Choose to refresh every hour.
- **Google Calendar:** Other calendars → **+** → From URL, then Add calendar.
- **Outlook:** Add calendar → Subscribe from web, then Import.

Ziffr builds the calendar anew whenever your calendar app fetches it, with what you may see at that moment. Your calendar app decides how often that is: Apple Calendar and Outlook every hour or so, Google Calendar sometimes only once a day.

Anyone who has the address sees what it shows, like a View Link. A link ends when you leave the Workspace, and the Workspace's Owners and Admins can revoke it (see [Calendar Links](16-workspace-settings.md#calendar-links)). The demo has no Calendar Links.

## Your profile

Open it from your own menu at the bottom of the sidebar. Your profile is how others see you in every Workspace you belong to: a change shows in all of them.

| Option | What it does |
| --- | --- |
| **Name** | Your name as others see it, up to 80 characters |
| **Colour** | One of six colours, shown with your initial wherever people are picked, such as when sharing |
| **Save** | Saves both |
| **Email** | The proven address you signed in with. It cannot be changed here. If you signed in a way that does not prove an address, it says so. |
| **Sign out** | Signs you out |

In the demo, the made-up people keep their names and colours, the address is made up, and the last button is **Leave the demo** instead of **Sign out**.

### Your limits

Under your profile, **Your limits** lets you choose how much of this Workspace you want, in this Workspace only. Each field shows what is **In effect** and the range **Allowed**; leave it empty to follow the Workspace, and press **Save** to set or clear it. You can only go lower than what the Workspace allows.

- **Alert messages per person per day**: the most Alert messages you are sent in a day (1 up to what the Workspace allows). After it your Alerts still fire into the list.
- **How far back the overdue list reaches** (7 to 90 days; normal 90): overdue entries older than this are left off your Schedule.
- **Calendar Link: days back** (0 to 30; normal 30) and **days ahead** (7 to 90; normal 90): how far your [Calendar Link](#in-your-calendar) shows events.

Your changes show in the Workspace's Audit Log, which Owners and Admins read. The demo has no limits to set.

## Appearance

Open it from your own menu at the bottom of the sidebar. It decides how Ziffr's own screens look to you, including the sign-in page. Pick one of four, each shown as a small preview; the page changes at once.

| Choice | What it does |
| --- | --- |
| **System** | Light or dark, as this device is set. It follows the device when that changes. |
| **Light** | Always light |
| **Dark** | Always dark |
| **High contrast** | Black on white, or white on black when the device is set to dark, with strong outlines and the highest contrast for text |

The choice is saved to you, so every device and every Workspace you use looks the same. A browser that is not signed in, such as the sign-in page, uses the choice last made in it, and System before any. In the demo nothing is saved, so the choice stays in this browser.

Dashboards and Decks follow your Appearance too: when it is dark, a [Theme](14-decks-and-themes.md) shows its dark variant, unless the Theme is set to **Always as designed**. Snapshots, View Links and exported files keep the look they were made or shared with, so they can show a light page inside a dark screen.

## Your Deliveries

Open it from your own menu at the bottom of the sidebar, or from **Deliveries** in the settings area. A **Delivery** is one message Ziffr sends you through a Connector. This page sets where those messages go in the current Workspace, and who is asked while you are away. You can only change your own.

### Where you get what

Your **Delivery Preference** for each kind of message:

| Kind | What it covers |
| --- | --- |
| **Questions** | Questions someone assigns to you |
| **Tasks** | Tasks someone assigns to you |
| **Prompts and reminders** | Prompts asking you for a value (only by ways the Metric accepts values by, otherwise the first of Slack, Telegram and email that reaches you), and reminders of tasks that are due. This is the one kind you can give up to three ways, see below |
| **Replies and updates** | Replies in a Thread, proposed Corrections, decisions and tasks that were closed |

For each, pick **Email**, **Slack**, **Telegram**, **WhatsApp** or **Ticket system**, or leave it at **Team default** (which shows what the team default is). Owners and Admins set the team default on the Connectors page. A change is saved at once.

**Prompts and reminders** can go by up to three ways at once, for example Slack, Telegram and email. Pick the first way, then **Also by** a second and a third. The order matters: a Prompt goes by every way in your list at the same time, and the first answer on any of them counts. The other messages are updated where the app allows it ("Answered on Telegram: 3" on Slack and Telegram; an email's form link says **Already answered**), and an answer that comes later on another way follows the Metric's Submission Rule and is never dropped without a word. Reminders of a missing value go by your first way only, so you are not pinged three times. A way the Metric does not accept answers by, or that cannot reach you, is left out of that Prompt, and the rest still go. Quiet Hours hold every way: a message that waits is not sent afterwards if you answered meanwhile.

If you pick nothing and the team has no default for Prompts, the default is **every way you have connected**: Slack, Telegram and email, in that order, each only where the Metric takes values by it. Connecting Slack or Telegram adds it by itself; once you pick a list of your own, only that list counts.

Whoever asks you a question can still pick another way for that one message. WhatsApp and ticket systems are not live yet: Ziffr only records what it would send there, in the Outbox. See [Connecting Ziffr](04-connecting.md) for what each Connector does.

### Requests for numbers by email

The box **Send me Prompts and reminders by email in this workspace** is ticked while you get them. Untick it to stop them. Questions, tasks and replies keep coming, and the owners of the Metrics you send in are told once that you stopped. Tick it again to get them back. The same happens when you use the unsubscribe link in one of these emails.

If your Ziffr sends no email, the box cannot be ticked and the page says so.

### Unused Metrics by email

Owners also see **Email me when Metrics, dashboards or decks go unused**. It is ticked at first. It is the monthly usage email described under Usage in [Workspace settings](16-workspace-settings.md), and it is one setting for all the workspaces you own, not one per workspace. Untick it to stop the email, tick it again to get it back. The unsubscribe link at the bottom of every such email does the same with no sign-in. Admins, Members and Guests never get the email and do not see the box.

### Away

Pick the first and the last day you are **Away**. While you are away, Prompts meant for you go to your **Stand-in**. The dates are saved as soon as both are set; **Clear** removes them. Owners and Admins can also set your Away dates on **Members and Groups**.

### Quiet hours

Under **Quiet hours** you choose the hours of the night and the whole days (the weekend, say) when Ziffr should leave you alone: from 19:00 until 07:00, and all day Saturday and Sunday. Requests for numbers, reminders and Alerts that would arrive then wait, and are sent when your quiet hours end; none is dropped. The times are in the time zone you pick there, or in the Workspace's. A Due Date does not move: only the message waits, so something due on Monday morning may be asked for first thing, when your quiet hours end.

If you set nothing, you follow the Workspace's default, if its Owners or Admins set one (the page says so). **Use the Workspace's default** removes your own. To have none even though the Workspace has a default, set the same hour for **From** and **Until** and no days. You cannot choose all seven days. A message already waiting keeps its time if you change your quiet hours afterwards.

## The question about Ziffr

Now and then, where an Installation Admin has turned it on (hosted Ziffr does), a small card in the corner asks whether you like Ziffr. **Yes** offers a link to the Ziffr repository on GitHub, where you can star it if you want to; Ziffr tells GitHub nothing about you. **Not yet** asks what is missing, and your words go to the people who run this Ziffr without your name. **Not now** closes it, and it comes back after 30 days, then once more after 60; **Don't ask again** ends it. It never appears while you are looking at a form, in the demo, or on a shared View Link.

## Your Alerts

Open it from your own menu at the bottom of the sidebar, or from **Alerts** in the settings area. An **Alert** is your own standing request to be told when a Metric you see reaches a level; you set one with **Alert me…** on the Metric's page (see [The Metrics screens](10-metrics.md#the-buttons-at-the-top)). This page lists every Alert you hold in the current Workspace on a Metric you can still see, with its condition, the way it is delivered, and where it stands: **waiting**, **fired** (quiet until the condition has been false again) and when it last fired. The page says the limits: the Alerts you may hold in a Workspace (20 unless the Workspace or Installation sets fewer), at most 5 on one Metric, and the Alert messages a day (20 unless set lower, which you can do under [Your limits](#your-limits)).

If you have a **Personal Webhook** (your Workspace allows them and you added one under Your Webhooks), the Alert form has **Also send to** with your Webhooks as tick boxes, none ticked at first. You are still told the usual way; a ticked Webhook also gets an `alert.fired` message, once each time the Alert fires, with the Metric, period, value, target, the condition and a link. It is your own Webhook receiving your own Alert, so only a Metric you see is sent, checked again when the message goes out: if you lose sight of the Metric, pause the Alert, take the Webhook off it, switch the Webhook off or delete it, or the value no longer meets the condition by then, nothing is sent and nothing in the log says so. A Webhook must have ticked the event `alert.fired` to be offered (the form says so beside one that has not), and an Alert on "has no value the day after its Due Date" cannot name one, since there is no value to send. Up to 3 Webhooks per Alert. An assistant or program cannot name a Webhook on your Alert; only you can, here.

On a Metric's page, **Alert me…** opens the same list and the form for another Alert in a panel on the right, over the page; its address ends in `?panel=alert`.

Each Alert has three buttons: **Pause** (or **Resume**), **Edit** and **Delete**. Besides your own pause, Ziffr can hold an Alert back and says why: **you cannot see this Metric now**, **the Metric is archived**, **the Metric has no target now** or **the Metric has no Workflow now**. It resumes by itself when the reason ends (except for no target or no Workflow, which you end by editing the condition). An Alert on a Metric you can no longer see is not listed at all, and nothing is sent for it. Alerts are only yours: nobody sets one for you or sees yours. In the demo the page is read-only.

If a Workflow has a **Tell** step that names you, directly or through a Group, and you can see one of its Metrics, a section **Workflows that tell you** lists that Workflow with **Stop telling me**. After you stop it, none of its Tell steps tells you again until you press **Tell me again**; the link at the bottom of a Tell email does the same. Nobody is told when you do.

## Connected assistants

**You → Connected assistants** lists the AI assistants you connected to Ziffr by its address, such as Claude.ai: for each, the name it gave itself, the Workspace, what it may do, when you connected it, when it was last used and until when it works. **Disconnect** ends one at once. A connection also ends on its end date and when you leave its Workspace, and an Owner can end it on the Workspace's **Access Keys** page, where it shows as a **Connected assistant**.

### Connecting an assistant

**Connected assistants** also shows how to connect one: the address to add in Claude.ai and other assistants on the web, and the lines for Claude Code and Claude Desktop with an Access Key. Connectors only points here.

In the assistant, add a connector with your Ziffr's address followed by `/mcp`, such as `https://ziffr.example.com/mcp`. The page shows the exact address. The assistant opens Ziffr's page **Connect an assistant to Ziffr?**, after you sign in if you are not signed in yet:

| Part | What it is |
| --- | --- |
| **says it is "…"** | The name the assistant gave itself. Any program can give itself any name, so check that you started this from that assistant just now. |
| **you go back to …** | Where Ziffr sends you after you answer. For an assistant on your own computer, a note says that any program there could claim its name. |
| **Workspace** | The one Workspace the assistant works in. |
| **It may** | What it may do: read metrics and their values, submit values, create metrics, change metrics (targets, Target Series, Projections, the Unusual Value check, how values come in and who sends them), read dashboards, build dashboards. Only reading is ticked to begin with. Guests cannot let it create anything. |
| **Until** | The last day it works, 90 days from now unless you pick another, at most a year. |
| **Connect** / **Cancel** | Connect makes the connection and sends you back to the assistant; Cancel tells the assistant no. |

Without a Workspace of your own, the page says so: start one, then press Connect in the assistant again.

A connection acts as you, with your current Workspace Role, and sees no more than you do. What it does shows in the Access Log on the **Access Keys** page. A Trial Workspace can have one connected assistant at a time. The demo has none.

### Working with an assistant

Once Ziffr is connected, as in [Connecting an assistant](#connecting-an-assistant) or with an Access Key on your own computer ([An AI assistant](04-connecting.md#an-ai-assistant)), you ask the assistant in your own words. It looks things up in Ziffr and answers.

#### Ready-made requests

Ziffr offers the assistant a few **Starters**, ready-made requests you pick instead of writing them:

| Starter | What the assistant does | Box it needs to change anything |
| --- | --- | --- |
| **What can I do here?** (`what_can_i_do`) | Looks at your Workspace and explains what it can read, record and build for you, with your Metrics as examples. | none, it only reads |
| **What do I have to do this week?** (`my_week`) | Lists what you have to do in Ziffr this week: values due, Approvals waiting for you, your Tasks and Questions, what is overdue first, each with its link. You can also just ask "What do I have to do in Ziffr this week?" or name other days. Owners and Admins can also ask what a teammate has to do, for example to cover for them; the answer lists only Metrics you may see yourself. It only reads. | none, it only reads |
| **Weekly review** (`weekly_review`) | Tells you which Metrics moved notably, which values are still missing for the last period and anything unusual. You can name the period, such as "last week". It only reads. | none, it only reads |
| **Record values** (`record_values`) | Takes a sentence such as "3 coffees today, 12 signups this week", shows which Metric and period each number would go to, and records them once you agree. | Submit values |
| **Build a dashboard** (`build_dashboard`) | Proposes one dashboard on a topic you name, from your Metrics and the team's Dashboard Templates, and builds it only once you agree. You get its link. | Build dashboards |
| **Explain a Metric** (`explain_metric`) | Explains one Metric: what it measures, its values over time and where it is heading. It only reads. | none, it only reads |
| **Start tracking** (`start_tracking`) | Sets up a new Metric from a few words. It proposes a name, how often, the unit and when you are asked, with sensible defaults, creates it once you agree, and tells you its link, when you are asked next and who is asked. You can change any of it afterwards. | Create metrics, and Change metrics to name who sends values |
| **Set targets** (`set_targets`) | Takes a sentence such as "budget 5000 a month for revenue in 2027", shows which Metric gets which Target Range, Target Series or Projection for which periods, and sets them once you agree. It can also change when a value counts as unusual. | Change metrics |
| **Alert me** (`alert_me`) | Takes a sentence such as "tell me when churn goes above 3 %", shows which Metric and condition each Alert would have and how you are told, and makes them once you agree. Only ever your own Alerts. | Manage alerts, and Read metrics |

Where to find them:

- **Claude.ai** and the Claude apps: press **+** in the message box and look under the connector's name, such as **Ziffr**. Pick a Starter, fill in what it asks for if you like, and send. Left empty, the assistant asks you.
- **Claude Code:** type `/` and look for the commands marked **(MCP)**, such as `/ziffr:weekly_review`; you can also type `/mcp__ziffr__weekly_review`. `ziffr` is the name you gave the server when you added it. You can add a one-word answer after a space, such as `/mcp__ziffr__weekly_review 2026-03`. Claude Code reads each word as an answer of its own, so for anything longer, such as the numbers for **Record values** or **Set targets**, start the command without anything after it and tell the assistant when it asks.

A Starter is only words for the assistant. It can do nothing you could not ask for yourself, and the ones that record, set or build show you their plan and wait for your yes.

#### What you can ask

You do not need a Starter. Some examples:

- **Reading:** "What was revenue in March?", "Which Metrics are below their target this month?", "How did weekly signups develop over the last quarter, compared with a year ago?"
- **Recording:** "Record 42 orders for this month.", "I sold 3 coffees today and 5 yesterday.", "Start tracking weekly signups; Ann sends them by Slack.", "Let the CRM Feed send in orders too."
- **Targets:** "Revenue should stay between 40,000 and 60,000 a month.", "Flag orders as unusual when they change more than 25 %.", "Our budget for signups is 500 in January, 550 in February and 600 in March.", "Our forecast says 70,000 revenue next quarter: add it as a Projection."
- **Dashboards:** "Make a dashboard for sales from the one-metric template.", "Add a line of churn to my Customers dashboard."

#### What the assistant may do, if you let it

- **Submit values:** record values for the Metrics you submit to. A value follows the Metric's rules like yours: it may wait for an Approval, or be refused in a locked period.
- **Create metrics:** create Metrics owned by you. Before it creates one, it asks you how the values should come in (the Metric's **Sources**: web form, email, Slack, Telegram or programs) and who sends them (its **Submitters**), unless you already said. It can also delete a Metric you own, with all its values, when you ask and confirm the Metric's name. That cannot be undone, so leave this unticked unless you need it.
- **Change metrics:** change the **Target Range** (the range a value should be in), the Polarity and the Attainment method, the **Target Series** and the **Projections** of the Metrics you own or are an Editor of. A Projection is only for the current period or a later one. It can also change when a value counts as an **Unusual Value**, in the check of a Workflow you own. That Workflow may be shared by several Metrics, and the change applies to all of them: the assistant tells you which Workflow and how many Metrics before it changes anything. It can also change a Metric's Sources and add or remove its Submitters, up to 20 at a time. Each person it adds is asked for the value at once, the way they chose to be asked, so it names them to you first. Nobody is asked this way more than once a day for a Metric, or five times a day in all.
- **Read dashboards** also lets it read a dashboard's Snapshots; **Build dashboards** lets it take one (a draft until you show it).
- **Build dashboards:** make dashboards, and change the dashboards you may change yourself, not only the ones it made. Every change is in the dashboard's history under its name, so you can restore what came before.
- **Read your questions and tasks** and **Answer questions and tasks for you:** list the Questions and Tasks that wait for you, reply in their Threads, close the ones you asked, mark your Tasks done, and confirm or correct your own value in a Self-check when **Submit values** is ticked too.
- **Build workflows:** make, change and delete **your own Workflows** and their steps. The assistant leaves who approves, and who a Tell step tells, as it is.
- **Manage alerts:** set, change and remove **your own Alerts**, on Metrics you may see, such as "tell me when churn goes above 3 %". An Alert tells only you, through your Delivery Preference, and the assistant cannot make one for anyone else. The same limits apply as in the app.
- **Propose sharing:** the assistant can propose a share of one of your dashboards for you to confirm; it never shares by itself. Nothing is shared or sent until you confirm it in Ziffr, on the Actions page. It needs **Read dashboards** too.

#### What the assistant cannot do

- It cannot approve a value or send it back, and the connection screen does not offer it: Approval is a person's check. Only a program's Access Key can be given that ("Approve values"). The same goes for choosing who approves or who a Tell step tells in a Workflow ("Name who approves and who is told"): an assistant with "Build workflows" can make and change your own Workflows, but leaves their Approvers as they are.
- It cannot share anything, manage Groups, or invite, remove or change people, and the connection screen does not offer it: these change who sees what, so a message in a Thread must never be able to talk an assistant into them. Only a program's own Access Key can be given them ("Share and answer access requests", "Manage groups", "Invite and remove people"), and only as far as your role allows.
- It sees no more than you do, and only what you let it when you connected it: if you ticked only reading, it cannot record, change or build anything, whatever it tries. As a Guest, you cannot let it create or change anything.
- It cannot make, list or revoke a View Link, and the connection screen does not offer it ("Manage View Links"): a View Link publishes data outside the Workspace. Only a program's Access Key can be given that.
- It cannot read the Workspace's usage figures ("Read usage figures"); that, too, is only for a program's Access Key made by an Owner or Admin.
- It never shares anything, deletes a dashboard, makes a View Link, changes who may see what, changes a Metric's name, description, period or Workflow, adds or removes a Workflow's steps, or changes settings.
- Everything it does shows in the Access Log.
- It answers from what Ziffr gives it, but it can still misread a number. Check what it says before you pass it on, and ask it to show the values it used.

## Your Webhooks

**You → Your Webhooks** lists the **Personal Webhooks** you added for yourself in this Workspace: an address outside Ziffr, such as your own n8n flow, that gets a signed message when something happens. Yours hears only what you may see here, checked at the moment it is sent, and acts as you: ticking a task off in your own list marks it done in Ziffr as you. Without the Workspace's switch the page says "Your Workspace does not allow personal Webhooks; ask an Owner or Admin" and shows none; an Owner or Admin switches it on under **Workspace → Webhooks** ([Workspace settings](16-workspace-settings.md#personal-webhooks)). Owners, Admins and Members have it; Guests and the demo do not.

You can have three, up to 1,000 messages a day (a trial has fewer, and only public addresses). Type a **name**, the **address**, which must start with `https://`, and tick what it hears, none by default:

- the tasks and questions **given to you or asked by you**: given, changed, answered, done;
- **values** recorded or unusual, for the **Metrics you pick**, up to 50, from those you see. A value waiting for approval is carried only if you may see it;
- **your own Alerts** that name this Webhook (**Also send to** on the Alert).

**Add Webhook** shows the **secret** once. Copy it: the receiver uses it to check each message's signature, and it is not shown again. Each Webhook shows its name, the address masked, what it hears and, for values, the Metrics picked; a picked Metric you no longer see is counted, never named, and nothing is sent for it. If you picked Metrics you can no longer see, the page counts them and offers **Remove the N Metrics you can no longer see**; nothing is sent for them either way, and until you remove them they come back if you see the Metric again. While your Workspace does not allow personal Webhooks, you cannot change one.

| Button | What it does |
| --- | --- |
| **Change** | Changes the name, the events and Metrics, or the address |
| **Send test event** | Sends a `ping` now, at most once a minute |
| **Replace secret** | Makes a new secret, shown once; the old one still signs for 24 hours, so the receiver can switch without a gap |
| **Switch off** / **Switch on** | A switched-off Webhook gets nothing; switching on again resends nothing |
| The bin icon | Deletes it after asking, also while the Workspace's switch is off |

Under each, **Log** lists its sends of the last 14 days: when, the event, what it is about, the state and the answer. A Webhook that keeps failing is switched off by Ziffr and you are told. An Owner or Admin sees that you have a Webhook, whose it is, the address masked and when it last sent, never what it sent, and can remove it; you are then told who did. It ends when you leave the Workspace. Messages leave Ziffr in clear text over TLS and the receiving system keeps them as it sees fit.
