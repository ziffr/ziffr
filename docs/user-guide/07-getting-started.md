<!-- part: Understanding Ziffr -->
<!-- screens: apps/web/src/app/setup/**, apps/web/src/components/privacy-statement.tsx -->
# Getting started

This chapter takes you from nothing to a team that sees its numbers each month. Plan about an hour for the first steps; the routine then runs by itself.

## Look around the demo first

On the sign-in page, choose **Try the demo** under the form (the picture beside it shows the demo's Monthly overview dashboard; on a phone the form comes first and the picture is left out). It opens a made-up online shop with fifteen people, without an account. Its numbers move with today's date, so last month's cost spike is always last month. The monthly numbers go back three and a half years and the weekly ones three years, with a December peak and a few links worth finding (support tickets before refunds, a campaign that lifted new leads, marketing spend that stopped bringing new customers), so every analysis under Analyze shows a real result, not "not enough data".

- Use **Viewing as** in the sidebar's footer to see Ziffr through the eyes of a different person, such as the Owner, an Admin or the Guest, whose role the list shows ("Ben, Admin"). Notice how each one sees different numbers, and that the Guest is offered no buttons for creating anything.
- Follow the **guided tour** (bottom right). It starts with looking: a dashboard, what each person sees, an analysis and a deck. Then it tries sending in a value and describing a Metric, which the demo shows but won't save (in a demo where visitors may change values, sending in a value is recorded).

Nothing you do in the demo is saved, and nothing is sent: a line above the page says so. (On a Ziffr that is a public demo and nothing else, and where its Installation Admin switched on **Visitors may change the demo**, you can also enter values and answer as the demo's people: see [Trying values in a demo that can be changed](#trying-values-in-a-demo-that-can-be-changed).) Try any button or form; where it would change something, Ziffr says "The demo can't be changed." instead. Where this Ziffr offers trials (only hosted Ziffr does), that line, and every refusal, links to one of your own, in which email, Slack, Telegram, the API and assistants work for real. A trial starts with one Metric, Cups of coffee, which Ziffr asks you for each day, and no made-up numbers (see [Starting a Workspace](16-workspace-settings.md#on-a-ziffr-that-offers-trials)). When you are done, choose **Leave the demo**.

### Trying values in a demo that can be changed

A public demo may let visitors try the work around a value. Then the line above every page says what you change is shared with every visitor and gone when the demo starts fresh, with the time to the next fresh start, and nothing is sent. You can type a value on a Metric's page, use a form link, paste from a spreadsheet, fill in for someone, ask yourself for a value with **Ask me now**, answer a Prompt as the person it went to (in the **Outbox** or the **Sources** simulators), approve, send back, confirm or correct a value, propose a Correction and accept it, lock or reopen a period, close a Workflow's period, run the Workflows as of a day, choose a Stand-in and set someone's Away dates. A message you send or an answer you give is recorded and shows in the Outbox; nothing leaves the demo, no email, Slack or Telegram message and no Webhook. It all stays short and plain: a value goes in for the last two years up to the current period, a paste holds at most 100 values, Away runs at most 30 days from today, and a text may not hold a web address. The demo may say "You have made a lot of changes" or "Another visitor just ran the Workflows" when a limit is reached, and when it is full it says when it starts fresh. A few things, such as the Monthly overview dashboard, October in short and the latest weeks of Weekly numbers, always stay as they are: "Everyone sees this one as it is." Defining Metrics, dashboards, decks, sharing and the settings stay refused for now, so the last step of the tour still ends with "The demo can't be changed."

On a demo that lets visitors change it (only a Ziffr that is a demo and nothing else can, and it is off by default), the line above the page ends with a countdown, "Resets in 9 min.", and says "Starting fresh." right after the demo starts fresh, every 15 minutes. A dashboard or deck open at that moment follows you to its new version. Pins and your home dashboard are kept in your own browser, not shared with other visitors, and stay when the demo starts fresh as long as the dashboard is still there.

## 1. Start your Workspace

Sign in with your work email: Ziffr sends you a sign-in link (on hosted Ziffr the sign-in page also offers a trial of your own, next to the demo; on a Ziffr that somebody else runs it has no trial), and the page then says **Check your email** with the address it went to; **Use another address** takes you back to the form. Then give your Workspace a name, such as your name, your team or your company, and choose **Create workspace**. You become its Owner and can invite others later. If a colleague already uses Ziffr, ask them to invite you instead, so you join their Workspace.

### The Setup Guide

The **Setup Guide** is a short list of steps that sets a Workspace up: **About you**, **Starting point**, **Ways in and out**, **First Metric** and **Team**. It lives at **Set up your Workspace** (the address `/setup`, also reached from Help), shows the steps in a bar at the top with each one's state in words (Done, Skipped, To do, Comes next), and every step can be skipped. **Go to Ziffr** leaves it at any time. Owners and Admins see all five steps. A Member sees only the two about themselves, and a Guest and the demo have none.

**About you**, **Starting point** and **Ways in and out** are the steps to use today. The other two open and say what they will do, so you can see where the guide is going; the rest of Ziffr works without them, as the numbered steps below show.

**About you** asks plain questions, one to a row, each optional and each saying what it is for. Choose **Skip this question** to leave one open, **Skip** to skip the whole step, or **Save and go on**.

| Question | Who answers | What it is used for |
| --- | --- | --- |
| **What does your business do?**, **Who do you sell to?**, **How many people work there?** | Owners and Admins | So Ziffr can suggest Metrics and Packs that fit |
| **Where is it based?** | Owners and Admins | So numbers and money are written the way you write them: the country proposes the currency, how numbers are written and the languages answers are read in, until someone sets them on **Workspace → General** |
| **Revenue in a year** | Owners and Admins | The same suggestions; it is roughly, in the currency of the country |
| **What do you do here?** | Everyone who has the step | Your **Business Function**: so Ziffr can suggest Packs and who is asked for what |
| **Your Workspace's time zone**, **Ziffr asks for numbers at**, **Your year starts in** | Owners and Admins | Which day it is for your team, when each day's requests go out, and where quarters and years begin. Ziffr proposes this browser's time zone while the Workspace still has the default, UTC |

The Workspace's time counts as answered once an Owner or Admin has saved it, even when it is UTC. A Member sees what the Owners and Admins said about the business, read-only, and answers only their own function.

What you answer stays in this Workspace. It is not sent to Ziffr's makers or to anyone else. It is used only inside this Workspace, to suggest Metrics, Packs and settings that fit and who is asked for what. Owners and Admins of this Workspace see your function; other members do not. (On hosted Ziffr, ziffr.net runs the database, as for everything else in the Workspace.)

**Ways in and out** asks two questions on one screen. **How should numbers come in?** lists the ways a number reaches Ziffr, one card each, with its state in words:

| Way | What the card says | What you can press |
| --- | --- | --- |
| **Web form** | Every request carries a personal link that works without signing in. Always ready. | Nothing to set up |
| **Email** | Ready where this Ziffr has a mail server, and says whether replying with the number works too. | **Send me a test** |
| **Slack** | Ready once an Owner or Admin has connected a Slack workspace; a Member is told whom to ask. | **Add to Slack** (Owners and Admins; Slack then brings you back to this step), **Link my Slack account** (when your Slack address is another one), **Send me a test** |
| **Telegram** | Off until an Owner or Admin turns it on in this Workspace, then ready once you connect your own Telegram. | **Turn on Telegram** (Owners and Admins), **Connect my Telegram** (everyone), **Send me a test** |
| **Paste** | Paste rows from a spreadsheet: the easiest way in when the numbers already sit in one. | **Try it** opens [Paste values](10-metrics.md#paste-values-from-a-spreadsheet) |

**Send me a test** sends one [Test Message](04-connecting.md#send-yourself-a-test-message) to you, and the card says what came of it: sent, waiting to be sent, or kept in the Outbox with the reason; over a limit it says which and when you can try again. There is no button for a way that cannot work here. Where this Ziffr has no mail server, Slack app or Telegram bot, the card says so ("This Ziffr has no Slack app yet. Whoever runs it adds one on its Installation settings page."), links how to add it, and, for an Installation Admin, links the [Installation settings](18-installation-settings.md) page. The web form and paste still work, so you can finish the first Metric without any of the others. **More ways** lists links for Owners and Admins: Access Keys, assistants, Feeds (with the warehouse Feeds and n8n templates), **Send values**, and in a trial **A key for n8n**. A Member sees no More ways, only a link to their own key.

**How should people be asked and told?** is your own choice: **Ask me by** takes up to three ways in order, from the ones that work here, saved only for you. Others are asked by what they choose, and the default is the first way that reaches them. Telling people through Alerts, a Workflow's Tell step, Snapshots by email, View Links and Webhooks needs a Metric or a dashboard first, so the step only links to them. The step ticks once you have saved a way that works here, or a Test Message to you was sent; a Member's step counts only their own choice, and a Member never sees the Workspace-level setup.

You can change every answer later: the business and the time under **Workspace → General**, in the section **About your business**, and your function under **Your profile**.

**Starting point** is for Owners and Admins, and asks how you want to begin. A Member never sees it. Nothing is installed or made until you press a button.

| Choice | What it does |
| --- | --- |
| **Explore on my own** | Starts from scratch: it opens the Metric Catalog, suggested by your answers in About you, with **Back to the Setup Guide** on top. The Metric you make there, from the catalog or from scratch, becomes your first Metric, and you land back in the guide. |
| **Start from a Pack** | Lists Ziffr's own Packs, the ones that fit your answers first, each with why ("Suggested because of: your industry and your function") and **What you get**: how many Metrics (with the first names), Workflows, dashboards and other items it brings. The first three are shown; **See all** shows every Pack, none is hidden. When you have not answered About you yet, the list says so and keeps the usual order. |
| **Preview** | Opens the Pack in the side panel, drawn with Sample Data and never your own values. Nothing is installed by looking. |
| **Install** | Adds the Pack to the Workspace, as on [Packs](19-packs.md): Owners and Admins only (a Pack that holds a Theme needs an Owner). A Pack with texts aimed at assistants opens its Preview first, where you confirm you read them. |
| **Set up from this Pack** | Appears once it is installed. It lists the Pack's Metrics with the first three that take values ticked, you as the one who is asked for them, the Pack's first Workflow with you as its Approver when it asks for one, and its first dashboard when those Metrics fill all its places. Untick or add what you like, then press **Make them**. The first Metric made becomes your first Metric for the next steps. Pressing it again makes nothing twice. |

A Workspace that has Metrics already says "You have 4 Metrics. Start from a Pack anyway?" and still offers everything. In a trial the step reads "Your trial starts with Cups of coffee" and is done by itself; Packs can still be installed within the trial's limits.

## 2. Describe your first Metric

Go to **Metrics** and choose **New metric**. The easiest start is the Metric Catalog: pick a number you already track, such as "Revenue" or "Customer satisfaction". Ziffr fills in its description, and you check:

- **Name and description**: would a new colleague understand exactly what is counted?
- **Period**: daily, weekly, monthly, quarterly or yearly. A number reported once a quarter, such as a survey score or board figures, is quarterly: Ziffr then asks for it once a quarter.
- **Target Range and Polarity**: what a good value is, and whether higher or lower is better.
- **Who submits it**: yourself, a colleague, a Contact without a login, or a Feed.

Start with three to five Metrics that matter most. You can always add more.

## 3. Send in the first value

Open the Metric and send in a value yourself on its form link, or wait until its Submitter answers. Once there are a few periods of history, the trends and comparisons start to tell a story. If you have past values in a spreadsheet, enter the last twelve months so you can compare from day one.

## 4. Invite your team

Under **Workspace → Members and Groups**, invite colleagues by email or with a link, and choose their role:

- **Member** for people who build dashboards and describe Metrics,
- **Guest** for people who only look at what you share with them and send in their numbers,
- **Admin** for someone who helps you manage the Workspace.

People who only send in a number, such as an outside bookkeeper, can be added as **Contacts**. They need no login and use their personal form link, email or Slack.

Create **Groups** such as "Management" or "Sales" so you can share with many people at once.

## 5. Set the Workspace time

Under **Workspace → General**, set your time zone and the hour at which Ziffr asks for values and sends reminders each day. Ziffr counts working days and Due Dates in this time zone.

## 6. Let Ziffr ask for the numbers

Under **Workspace → Workflows**, create a Workflow such as "Monthly numbers": when to ask, when to remind, on which working day a value is due, who is asked when it is late, what counts as unusual, and who approves. Then assign it to your Metrics.

From now on, Ziffr sends the Prompts by itself. Each person chooses under **Your Deliveries** (their own menu at the bottom of the sidebar) whether they get them by email or on Slack, and enters the dates they are Away.

## 7. Build a dashboard

Go to **Dashboards** and choose **Create dashboard**. Start from a Dashboard Template, such as **Overview**, and fill its Slots with your Metrics, or start empty and drag Metrics from the **Pool** on the side. Each Metric can be drawn in different ways; pick the Widget Template that tells its story best.

Give the dashboard an introduction, then **Share** it with a Group. Everyone you share it with can see the Metrics on it. Choose your **Home** dashboard, the one Ziffr opens on.

## 8. Ask about a number

When a value looks odd, open it and assign a **Question** to the person who knows: "Why did returns double in March?" They answer in the Thread, by email, on Slack or by Telegram, and the answer stays with the March value for anyone who looks later.

## 9. Close the month

At the end of each period, check the Unusual Values waiting for Approval, then lock the period. If your dashboard should keep what it showed, take a **Snapshot**, or let the dashboard take one by itself once every Metric on it is locked. Need slides for the board? Make a **Deck** from your Widgets and export it as PowerPoint or PDF.

## Put Ziffr on your phone or desktop

Ziffr installs as an app from the browser: it then opens from your home screen or dock in a window of its own, without the browser's address bar. There is nothing to download from an app store.

- **iPhone and iPad (Safari):** open Ziffr, choose the Share button, then **Add to Home Screen**.
- **Android (Chrome):** open Ziffr, choose the menu (⋮), then **Add to Home screen** or **Install app**.
- **Computer (Chrome or Edge):** open Ziffr and choose the install icon at the right of the address bar, or **Install Ziffr** in the browser's menu. On a Mac, Safari offers **File → Add to Dock**.

The installed app is the same Ziffr as in the browser and needs a connection: your numbers stay on the server, never on the device. Without a connection it shows a page saying so. Signing out in the app signs you out there, as in the browser.

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
