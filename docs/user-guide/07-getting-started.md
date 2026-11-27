<!-- part: Understanding Ziffr -->
<!-- screens: apps/web/src/app/first-steps/**, apps/web/src/components/first-steps-line.tsx, apps/web/src/app/setup/**, apps/web/src/components/privacy-statement.tsx, apps/web/src/components/setup-line.tsx, apps/web/src/components/setup-panel.tsx -->
# Getting started

This chapter takes you from nothing to a team that sees its numbers each month. First Steps, which opens when you start a Workspace, walks you through the beginning one question at a time; the routine then runs by itself.

## Look around the demo first

On the sign-in page, choose **Try the demo** under the form (the picture beside it shows the demo's Monthly overview dashboard; on a phone the form comes first and the picture is left out). It opens a made-up online shop with fifteen people, without an account. Its numbers move with today's date, so last month's cost spike is always last month. The monthly numbers go back three and a half years and the weekly ones three years, with a December peak and a few links worth finding (support tickets before refunds, a campaign that lifted new leads, marketing spend that stopped bringing new customers), so every analysis under Analyze shows a real result, not "not enough data".

- Use **Viewing as** in the sidebar's footer (on a phone, in the bar at the top, where **Leave the demo** is under **More**) to see Ziffr through the eyes of a different person, such as the Owner, an Admin or the Guest, whose role the list shows ("Ben, Admin"). Notice how each one sees different numbers, and that the Guest is offered no buttons for creating anything.
- Follow the **guided tour** (bottom right; on a phone open it from **More**, where it is a sheet above the tab bar that the cross closes and that does not come back by itself on the next page). It starts with looking: a dashboard, what each person sees, an analysis and a deck. Then it tries sending in a value and describing a Metric, which the demo shows but won't save (in a demo where visitors may change values, sending in a value is recorded).

On most Ziffrs the demo is read-only. Nothing you do in it is saved, and nothing is sent: an announcement line above the page says so (read-only: "This demo is read-only: look around as anyone. Nothing you do is saved and nothing is sent."). On a phone it is one line: choose the arrow to read all of it, and "+N more announcements" for any others. Choose the cross at its end to dismiss it for this visit; it comes back the next time you open the demo or sign in. Try any button or form; where it would change something, Ziffr says "The demo can't be changed." instead. Where this Ziffr offers trials (only hosted Ziffr does), that line, and every refusal, links to one of your own, in which email, Slack, Telegram, the API and assistants work for real. A trial starts with one Metric, Cups of coffee, which Ziffr asks you for each day, and no made-up numbers (see [Starting a Workspace](16-workspace-settings.md#on-a-ziffr-that-offers-trials)). When you are done, choose **Leave the demo**.

A public demo has no sign-in at all: if your browser still holds an old sign-in from before the Ziffr became a public demo, it is ignored and removed, and you arrive at the demo's door like anyone else.

A public demo may be set up differently, so that you can try the work yourself: see the next section. The announcement above the page tells you which kind you are in: if it says that this is a shared demo that anyone can change, you are in one that may be changed.

### When the demo lets you change things

Only a Ziffr that is a demo and nothing else can do this, and only where the person who runs it switched on **Visitors may change the demo** (off by default; see [Installation settings](18-installation-settings.md)). A demo that sits beside real Workspaces, such as the one on app.ziffr.net or on a company's own Ziffr, is always read-only, so that nobody ever writes into a database that holds real numbers.

- **It is shared.** Everyone in the demo uses the same made-up company. What you change, every other visitor sees, and what they change, you see. So do not type anything private or anything you would not want a stranger to read, and know that everyone viewing as Sara is the same Sara.
- **It starts fresh every 15 minutes after a change.** Every quarter of an hour (at 10, 25, 40 and 55 past) the demo goes back to how it started, but only if somebody changed it since the last time; a demo nobody touched is left alone and starts fresh once a day. What anyone made or changed is then gone. The announcement above every page ("This is a shared demo that anyone can change. It resets every 15 minutes after a change, so what you make here disappears. Nothing you enter leaves this demo.") ends with a countdown ("Resets in 9 min."), says "Starting fresh." right after, and a dashboard or deck of the demo's own that you had open follows you to its new version. If you were looking at something a visitor made, it is gone: go back to the list.
- **Nothing is sent and nothing leaves the demo.** No email, Slack or Telegram message goes out, no Webhook is called, no page is published and nothing reaches a real Workspace. What would be sent waits in the **Outbox**.
- **The demo's own examples stay as they are.** The Monthly overview dashboard, October in short, the latest weeks of Weekly numbers, the demo's decks and the examples on the sign-in page cannot be changed ("Everyone sees this one as it is. Make your own to change it."). You may change the numbers, layout and settings of other things the demo came with, but not their names and descriptions ("Everyone sees this one's words as they are. Make your own to name it.").
- **Words you write are plain.** Names, descriptions, questions and replies are short plain text: no web or email addresses, no markup and no hidden characters. Every other visitor sees them as you wrote them until the demo starts fresh.
- **There are limits.** The demo holds only so many things of each kind, and each visit, each network address and the whole demo may make only so many changes before the next fresh start. When you meet one the demo says why and when it starts fresh ("You are going fast. Try again in a minute.", "You have made a lot of changes. Try again when the demo starts fresh.", "The demo is busy. Try again in a few minutes.", "The demo is full for now. Try again when it starts fresh."). Looking around is never limited.
- **Still refused.** Settings of the Workspace (its name, year, clock, number style, roles and people), Contacts and invitations, View Links, Calendar Links, Access Keys, Feeds and Webhooks, connecting Slack or Telegram, Packs and every upload, Alerts, Retention, deleting a Metric or a Workflow and handing a Metric over, and Workflows of your own. These say "The demo can't be changed." The pins and home dashboard you choose are yours and stay in your browser.

### Trying values in a demo that can be changed

A public demo may let visitors try the work around a value. Then the line above every page says what you change is shared with every visitor and gone when the demo starts fresh, with the time to the next fresh start, and nothing is sent. You can type a value on a Metric's page, use a form link, paste from a spreadsheet, fill in for someone, ask yourself for a value with **Ask me now**, answer a Prompt as the person it went to (in the **Outbox** or the **Sources** simulators), approve, send back, confirm or correct a value, propose a Correction and accept it, lock or reopen a period, close a Workflow's period, run the Workflows as of a day, choose a Stand-in and set someone's Away dates. A message you send or an answer you give is recorded and shows in the Outbox; nothing leaves the demo, no email, Slack or Telegram message and no Webhook. It all stays short and plain: a value goes in for the last two years up to the current period, a paste holds at most 100 values, Away runs at most 30 days from today, and a text may not hold a web address. The demo may say "You have made a lot of changes" or "Another visitor just ran the Workflows" when a limit is reached, and when it is full it says when it starts fresh. A few things, such as the Monthly overview dashboard, October in short and the latest weeks of Weekly numbers, always stay as they are: "Everyone sees this one as it is." Dashboards are in [Dashboards](12-dashboards.md#trying-dashboards-in-the-demo), decks and Snapshots in [Decks and themes](14-decks-and-themes.md), Metrics and sharing in the next section. The last step of the tour, defining a Metric, works: the Metric is saved and everyone in the demo sees it until the demo starts fresh.

### Trying Metrics, questions and sharing in a demo that can be changed

In the same demo you can also **define a Metric** (from the catalog, from scratch, as a copy or calculated from other Metrics), change its description, Sources, targets and projections, put Tags on it, and archive it and bring it back. You can ask a Question or give a Task to one of the demo's people, reply as that person, close it or mark it done, share a Metric or dashboard of yours with a person or a Group, ask for access to something and grant it as its owner, make a Group of your own and choose who is in it, and set a person's way of being asked (an email, Slack or Telegram message goes to the Outbox, nothing is sent). A Metric, Tag, Group or Share of your own is yours to change; what the demo started with keeps its names and descriptions ("Everyone sees this one's words as they are. Make your own to name it."), cannot be archived, deleted or shared by you, and a Group the demo started with keeps its members. A formula in the demo has at most 200 characters, 5 Metrics and 20 operations, and the demo holds only a few calculated Metrics at once; a Metric you make gets an address of its own with a short code at the end, is not added to a Workflow, and asks only the demo's people. Handing a Metric over, deleting one, Workflows, Contacts, invitations, keys, Feeds, Webhooks and uploads stay refused.

In that demo the line above the page ends with a countdown, "Resets in 9 min.", and says "Starting fresh." right after the demo starts fresh. A dashboard or deck open at that moment follows you to its new version. Pins and your home dashboard are kept in your own browser, not shared with other visitors, and stay when the demo starts fresh as long as the dashboard is still there.

## Start your Workspace

Sign in with your work email: Ziffr sends you a sign-in link (on hosted Ziffr the sign-in page also offers a trial of your own, next to the demo; on a Ziffr that somebody else runs it has no trial), and the page then says **Check your email** with the address it went to; **Use another address** takes you back to the form. Then Ziffr asks a few questions, gives your Workspace a name, such as your name, your team or your company, and makes it when you choose **Create Workspace**. You become its Owner and can invite others later. If a colleague already uses Ziffr, ask them to invite you instead, so you join their Workspace.

Making a Workspace is part of **First Steps**, which the next section describes.

## First Steps

**First Steps** is the guided start of a new Workspace: one question to a screen, in three chapters, **About you**, **Your Workspace** and **Your numbers**. A panel at the side (a bar at the top on a phone) shows the chapters and your answers so far. It works from start to end on a phone, and takes about two minutes.

### The questions

| Screen | What you do |
| --- | --- |
| **Who will use Ziffr?** | **My team or business** or **Just me**. Where colleagues at your company's domain already have a Workspace you may join, **Ask to join** is offered above (see [Asking to join](16-workspace-settings.md#asking-to-join)). |
| About you (a team) | Your role, the kind of business and who your customers are, so that suggestions fit. Each can be skipped. |
| About you (just me) | What you would like to track: health and fitness, money, habits and time, a club or hobby, or something else. It can be skipped. |
| **Set up your Workspace** | Its name. Time zone, currency and first day of the week are read from your browser; **Change** adjusts them and the country. **Create Workspace** makes it. A trial says after how many days it ends and is deleted. On a Ziffr you run, **Coming from another Ziffr?** starts from a [Workspace Export](16-workspace-settings.md#from-a-workspace-export) instead. |
| **How would you like to start?** | **Start with a ready-made set** or **Start from a clean slate**. |

Before the Workspace exists, your answers are kept in this browser only: reloading the page brings them back, and another device starts again. What you answer stays in your Workspace and is sent to nobody else.

### A ready-made set or a clean slate

- **A ready-made set** is a [Pack](19-packs.md): Metrics, a dashboard and reminders for your kind of work. **Choose a ready-made set** shows the three that fit you best, and all of them on request. A set shows its dashboard drawn with sample numbers. **Use this set** opens its [guided set-up](19-packs.md#use-this-pack); nothing is installed before you press **Set it up**.
- **A clean slate** asks for your first metric, one number you follow over time. Choose how often, **Weekly** (suggested) or **Monthly**, and pick one of the suggestions, or **Define your own** with a name, a unit, how often, and under **Which way is good?** whether **Higher** (chosen already) or **Lower** is better, as for costs or complaints. A suggestion brings its own answer. Ziffr makes the Metric and a dashboard that shows it.

### Your first value

**Now send your first value** closes the loop: until a value is in, your dashboard stays empty, and in a trial you cannot invite colleagues.

- **Ask me by email** sends you the Metric's real request. Reply to it with the number (where this Ziffr cannot receive replies, open the link in the email and type it). The screen shows when it arrives. **Nothing arrived?** says what to check, and what became of a reply that was not recorded. Asking again waits ten minutes and keeps to the daily limits. This choice is shown only where this Ziffr can send email.
- **Type it in here** records the value without sending any message.
- **Do this later** goes on; the closing screen and a line at the top of each page remind you.

### Who sends the values from now on

| Choice | What happens |
| --- | --- |
| **I will** | You are asked, on the schedule the screen names. |
| **A colleague** (**Someone else** for just you) | You give their email address and they become the one who sends the values. In an ordinary Workspace they are added as a [Contact](16-workspace-settings.md#contacts) and not invited. In a trial this opens once your own first value is in, and they are invited by email as a Guest; they are asked once they accept. |
| **Nobody for now** | Nobody is asked; you enter values when you like. |

Nothing on this screen asks anyone for a value at once. The last screen, **Your Workspace is ready** (or **One thing is still open**), says what is set up, opens your dashboard, and offers **Invite your team** and **Connect Slack or Telegram**.

### Leaving and coming back

- **Finish later** (once the Workspace exists) opens Ziffr. Home leads you to First Steps once if you closed it without choosing that.
- While a step is open, a line above every page says what is next, such as "Next: send your first value.", with **Continue** and **Hide**; in a trial it also says that invitations stay closed. **Continue setting up** on [Where would you like to start?](#where-would-you-like-to-start) and in **Help** brings you back too, also after you hid the line.
- **Start over** asks the questions again. It deletes nothing and makes no second Workspace.

### Who gets First Steps

| Who you are | What you see |
| --- | --- |
| Someone who makes a Workspace, the first or one more (**New workspace**) | First Steps, one for each Workspace. |
| Someone who becomes an Owner of that Workspace while a step is still open | The same line, and Home leads them to First Steps once. |
| An **Admin** | Nothing: no guide and no line. |
| Owners and Admins of a Workspace made before First Steps, or imported from a Workspace Export | Nothing. The old address `/setup` leads to **Connectors** or **Members and Groups** where it asked for one of them, and otherwise Home. |
| An invited **Member** | The short [Setup Guide](#the-setup-guide). |
| A **Guest** | Nothing. |
| The demo and a Practice Workspace | Never. |

## The Setup Guide

The **Setup Guide** is a short list of two steps for a **Member** who joins a Workspace: **About you** and **Ways in and out**. It lives at **Set up your account** (the address `/setup`), shows the steps in a bar at the top with each one's state in words (Done, Skipped, To do, Comes next), and each can be skipped. On a phone the bar is one line, "Step 1 of 2", over a strip with one segment per step; tap a segment to open that step. **Go to Ziffr** leaves it at any time, and the guide never blocks the app. The first time you open the guide on a phone, one short note comes before the first step: it says that Ziffr was written with the desktop in mind, where most work happens, so some screens are roomier there, and that the Dashboards are the screens tuned for phones. **Continue to set up** and **Skip** both lead to the first step, and the note does not come back on that phone (it is remembered in that browser only; on a desktop or tablet width it never shows).

A step is ticked from what you have really set, never from a box you tick yourself; the only thing a click stores is skipping a step, and your skips are your own. A skipped step counts as done for the line at the top of the page, but is not ticked.

### About you

**About you** shows what the Workspace has said about the business, read-only, and asks one question of your own, **What do you do here?**. It is optional: choose **Skip this question** to leave it open, **Skip** to skip the step, or **Save and go on**. The answer is your **Business Function**, so Ziffr can suggest Packs and who is asked for what.

What you answer stays in this Workspace. It is not sent to Ziffr's makers or to anyone else. Owners and Admins of this Workspace see your function; other members do not. (On hosted Ziffr, ziffr.net runs the database, as for everything else in the Workspace.) You can change it later under **Your profile**.

### Ways in and out

On a phone the fields and buttons are 44 px tall with 16 px text (so Safari does not zoom in), the buttons fill the width with the main one on top and **Skip** under it, and cards and links stack one to a line.

**How can you send numbers?** lists the ways a number reaches Ziffr, one card each, with its state in words:

| Way | What the card says | What you can press |
| --- | --- | --- |
| **Web form** | Every request carries a personal link that works without signing in. Always ready. | Nothing to set up |
| **Email** | Ready where this Ziffr has a mail server, and says whether replying with the number works too. | **Send me a test** |
| **Slack** | Ready once an Owner or Admin has connected a Slack workspace; until then it says whom to ask. | **Link my Slack account** (when your Slack address is another one), **Send me a test** |
| **Telegram** | Off until an Owner or Admin turns it on in this Workspace, then ready once you connect your own Telegram. | **Connect my Telegram**, **Send me a test** |
| **Paste** | Paste rows from a spreadsheet: the easiest way in when the numbers already sit in one. | **Try it** opens [Paste values](10-metrics.md#paste-values-from-a-spreadsheet) |

**Send me a test** sends one [Test Message](04-connecting.md#send-yourself-a-test-message) to you, and the card says what came of it: sent, waiting to be sent, or kept in the Outbox with the reason; over a limit it says which and when you can try again. There is no button for a way that cannot work here. Where this Ziffr has no mail server, Slack app or Telegram bot, the card says so and links how to add it. **More ways** links to your own Access Key.

**How should you be asked?** is your own choice: **Ask me by** takes up to three ways in order, from the ones that work here, saved only for you. The step ticks once you have saved a way that works here, or a Test Message to you was sent.

Owners and Admins connect Slack, Telegram and the other ways for the Workspace under **Workspace → Connectors** (see [Connectors](16-workspace-settings.md#connectors)).

### The Setup line and opening by itself

A Member who joins a Workspace, by invitation or because their company's domain may join, is led to the guide once. After that it never opens by force again.

While you have steps left, a thin line above every page says how far you are: "Setup: 1 of 2 done. Next: Ways in and out." **Continue** opens the steps beside the page, each with its tick (a step you skipped counts as done), the next one marked and **Skip** next to those still open; choose a step's name to do it on the full page. **Hide** puts the line away for you, in this Workspace only: nobody else's line changes, and nothing brings it back on its own. The line goes by itself once every step is done or skipped.

To bring the guide back, choose **Setup Guide** in **Help** (the list of chapters) or in your own menu at the bottom of the sidebar (in **More** on a phone); it opens beside the page, and the line comes back with it.

### Where would you like to start?

While there is nothing to look at yet, Ziffr's home asks **Where would you like to start?** instead of showing an empty dashboard. This is so when you have no dashboard (or only the untouched example of a trial, which you did not choose as your Home) and see no other Metric. You are offered only what your role allows:

| Choice | What it does | Who sees it |
| --- | --- | --- |
| **Create your first figure** | Opens **New metric**. | Everyone who may create Metrics |
| **Install a Pack** | Opens [Packs](19-packs.md). | Owners and Admins |
| **Try the example** | Ziffr asks you once a day how many cups of coffee you drank, so you see how it works. It makes [the example](16-workspace-settings.md#the-example-in-a-trial) and makes its dashboard your Home. | The Owner of a trial |
| **Continue setting up** | Leads back to [First Steps](#leaving-and-coming-back), or opens a Member's Setup Guide. | An Owner with a step of First Steps left; a Member with steps left who did not hide the line |

As soon as you have a dashboard of your own, a Metric or a value in the example, or you chose a Home, Ziffr opens as usual. A Guest with nothing shared sees "Nothing has been shared with you yet". The demo never shows this screen.

### In a trial, in the demo and on a Ziffr you run

- **On hosted Ziffr, a trial** starts with the same First Steps, within its own limits. See [Starting a Workspace](16-workspace-settings.md#on-a-ziffr-that-offers-trials).
- **In the demo** there is no First Steps, no guide, no line and no redirect; `/setup` goes back to the dashboard, and the guided tour is the demo's own.
- **On a Ziffr you run yourself** First Steps is the same and depends on nothing hosted: Ziffr's own Packs come with it, and the ways read this Ziffr's own settings (see [Installation settings](18-installation-settings.md) and the [self-hosting guide](../guides/self-hosting.md)). Without a mail server you type your first value in.

## What comes after First Steps

First Steps gets one Metric asking and answering. What follows is the routine.

### Describe more Metrics

Go to **Metrics** and choose **New metric** (First Steps may have made the first ones already). The easiest start is the Metric Catalog: pick a number you already track, such as "Revenue" or "Customer satisfaction". Ziffr fills in its description, and you check:

- **Name and description**: would a new colleague understand exactly what is counted?
- **Period**: daily, weekly, monthly, quarterly or yearly. A number reported once a quarter, such as a survey score or board figures, is quarterly: Ziffr then asks for it once a quarter.
- **Target Range and Polarity**: what a good value is, and whether higher or lower is better.
- **Who submits it**: yourself, a colleague, a Contact without a login, or a Feed.

Start with three to five Metrics in all that matter most. You can always add more.

### Invite more people, and set the time later

Under **Workspace → Members and Groups**, invite colleagues by email or with a link and choose their role:

- **Member** for people who build dashboards and describe Metrics,
- **Guest** for people who only look at what you share with them and send in their numbers,
- **Admin** for someone who helps you manage the Workspace.

People who only send in a number, such as an outside bookkeeper, can be added as **Contacts**. They need no login and use their personal form link, email or Slack. Create **Groups** such as "Management" or "Sales" so you can share with many people at once.

Your time zone, the hour at which Ziffr asks for values and sends reminders each day, and the month your year starts in are changed under **Workspace → General**. Ziffr counts working days and Due Dates in this time zone.

### Let Ziffr ask for the numbers

Under **Workspace → Workflows**, create a Workflow such as "Monthly numbers": when to ask, when to remind, on which working day a value is due, who is asked when it is late, what counts as unusual, and who approves. Then assign it to your Metrics.

From now on, Ziffr sends the Prompts by itself. Each person chooses under **Your Deliveries** (their own menu at the bottom of the sidebar) whether they get them by email, on Slack or on Telegram, and enters the dates they are Away.

### Build a dashboard

Go to **Dashboards** and choose **Create dashboard**. Start from a Dashboard Template, such as **Overview**, and fill its Slots with your Metrics, or start empty and press **Add widget**: pick a Metric and drag the way of showing it that tells its story best onto the dashboard, or press **+**.

Give the dashboard an introduction, then **Share** it with a Group. Everyone you share it with can see the Metrics on it. Choose your **Home** dashboard, the one Ziffr opens on.

### Ask about a number

When a value looks odd, open it and assign a **Question** to the person who knows: "Why did returns double in March?" They answer in the Thread, by email, on Slack or by Telegram, and the answer stays with the March value for anyone who looks later.

### Close the month

At the end of each period, check the Unusual Values waiting for Approval, then lock the period. If your dashboard should keep what it showed, take a **Snapshot**, or let the dashboard take one by itself once every Metric on it is locked. Need slides for the board? Make a **Deck** from your Widgets and export it as PowerPoint or PDF.

## Put Ziffr on your phone or desktop

Ziffr installs as an app from the browser: it then opens from your home screen or dock in a window of its own, without the browser's address bar. There is nothing to download from an app store.

- **iPhone and iPad (Safari):** open Ziffr, choose the Share button, then **Add to Home Screen**.
- **Android (Chrome):** open Ziffr, choose the menu (⋮), then **Add to Home screen** or **Install app**.
- **Computer (Chrome or Edge):** open Ziffr and choose the install icon at the right of the address bar, or **Install Ziffr** in the browser's menu. On a Mac, Safari offers **File → Add to Dock**.

The installed app is the same Ziffr as in the browser and needs a connection: your numbers stay on the server, never on the device. Without a connection it shows a page saying so. Signing out in the app signs you out there, as in the browser.

## Screens made for a larger screen

A phone is good for looking at numbers and for quick answers; building is easier with a larger screen. On a phone these screens show a note at the top that says "This is easier on a larger screen." and why: editing a dashboard, the deck editor, Workflows, the **Sources**, **Send values** and **Who gets what** tabs of Connectors, Packs, the Playground, Installation settings, Analyze, New metric and the import of a Workspace Export. Nothing is switched off: the screen is below the note and you may use it.

The note offers up to two things:

- **Send me the link** emails the address of this screen to you, and to nobody else, so you can open it at your desk. The email names the screen and the Workspace, not the dashboard, deck or Metric on it. Ziffr says what became of it: **Sent. Look in your email.**, that it is on its way, or why it was not emailed (for example because this Ziffr has no mail server yet); it then stays in your Outbox. These emails and the emails of **Send me a test** count together: at most 3 in 10 minutes and 20 a day (5 in a trial). Guests are not offered the button, nor is the demo, which sends nothing.
- **Look at it** is there where the screen can also be only looked at: it leaves editing on a dashboard, presents a deck, and goes to a Workflow's steps.

From 640 pixels wide, such as on a laptop, the note is not shown.

## What to do next

- **Bring in numbers from other systems.** Ask whoever looks after your systems to set up a Feed for numbers that already live in your CRM, shop or data warehouse. See [Connecting Ziffr](04-connecting.md).
- **Connect Slack.** If your team works in Slack, an Owner or Admin connects it under **Workspace → Connectors**.
- **Show the numbers outside.** Send investors or advisors a View Link to a dashboard.
- **Set up your look.** Owners and Admins add your logo, colours and fonts as a Theme.

## Quick help

| I want to… | Go to |
| --- | --- |
| See what is waiting for me | **Schedule** in the sidebar |
| Find a Metric | **Metrics** |
| Build or open a dashboard | **Dashboards** |
| Make slides | **Decks** |
| Find out what drives a number | **Analyze** |
| Invite someone | **Workspace → Members and Groups** |
| Choose how Ziffr reaches me, or say I am away | Your own menu in the sidebar → **Your Deliveries** |
| Change my name | Your own menu in the sidebar → **Your profile** |
| See who changed access | **Workspace → Audit log** (Owners and Admins) |
