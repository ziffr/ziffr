<!-- part: Understanding Ziffr -->
# Getting started

This chapter takes you from nothing to a team that sees its numbers each month. Plan about an hour for the first steps; the routine then runs by itself.

## Look around the demo first

On the sign-in page, choose **Try the demo** under the form (the picture beside it shows the demo's Monthly overview dashboard; on a phone the form comes first and the picture is left out). It opens a made-up online shop with fifteen people, without an account. Its numbers move with today's date, so last month's cost spike is always last month. The monthly numbers go back three and a half years and the weekly ones three years, with a December peak and a few links worth finding (support tickets before refunds, a campaign that lifted new leads, marketing spend that stopped bringing new customers), so every analysis under Analyze shows a real result, not "not enough data".

- Use **Viewing as** in the sidebar's footer to see Ziffr through the eyes of a different person, such as the Owner, an Admin or the Guest, whose role the list shows ("Ben, Admin"). Notice how each one sees different numbers, and that the Guest is offered no buttons for creating anything.
- Follow the **guided tour** (bottom right). It starts with looking: a dashboard, what each person sees, an analysis and a deck. Then it tries sending in a value and describing a Metric, which the demo shows but won't save.

Nothing you do in the demo is saved, and nothing is sent: a line above the page says so. Try any button or form; where it would change something, Ziffr says "The demo can't be changed." instead. Where this Ziffr offers trials (only hosted Ziffr does), that line, and every refusal, links to one of your own, in which email, Slack, Telegram, the API and assistants work for real. A trial starts with one Metric, Cups of coffee, which Ziffr asks you for each day, and no made-up numbers (see [Starting a Workspace](16-workspace-settings.md#on-a-ziffr-that-offers-trials)). When you are done, choose **Leave the demo**.

On a demo that lets visitors change it (only a Ziffr that is a demo and nothing else can, and it is off by default), the line above the page ends with a countdown, "Resets in 9 min.", and says "Starting fresh." right after the demo starts fresh, every 15 minutes. A dashboard or deck open at that moment follows you to its new version. Pins and your home dashboard are kept in your own browser, not shared with other visitors, and stay when the demo starts fresh as long as the dashboard is still there.

## 1. Start your Workspace

Sign in with your work email: Ziffr sends you a sign-in link (on hosted Ziffr the sign-in page also offers a trial of your own, next to the demo; on a Ziffr that somebody else runs it has no trial), and the page then says **Check your email** with the address it went to; **Use another address** takes you back to the form. Then give your Workspace a name, such as your name, your team or your company, and choose **Create workspace**. You become its Owner and can invite others later. If a colleague already uses Ziffr, ask them to invite you instead, so you join their Workspace.

### The Setup Guide

The **Setup Guide** is a short list of steps that sets a Workspace up: **About you**, **Starting point**, **Ways in and out**, **First Metric** and **Team**. It lives at **Set up your Workspace** (the address `/setup`, also reached from Help), shows the steps in a bar at the top with each one's state in words (Done, Skipped, To do, Comes next), and every step can be skipped. **Go to Ziffr** leaves it at any time. Owners and Admins see all five steps. A Member sees only the two about themselves, and a Guest and the demo have none.

Today **About you** is the step to use. The other four open and say what they will do, so you can see where the guide is going; the rest of Ziffr works without them, as the numbered steps below show.

**About you** asks plain questions, one to a row, each optional and each saying what it is for. Choose **Skip this question** to leave one open, **Skip** to skip the whole step, or **Save and go on**.

| Question | Who answers | What it is used for |
| --- | --- | --- |
| **What does your business do?**, **Who do you sell to?**, **How many people work there?** | Owners and Admins | So Ziffr can suggest Metrics and Packs that fit |
| **Where is it based?** | Owners and Admins | So numbers and money are written the way you write them: the country proposes the currency, how numbers are written and the languages answers are read in, until someone sets them on **Workspace → General** |
| **Revenue in a year** | Owners and Admins | The same suggestions; it is roughly, in the currency of the country |
| **What do you work on yourself?** | Everyone who has the step | Your **Business Function**: so Ziffr can suggest Packs and who is asked for what |
| **Your Workspace's time zone**, **Ziffr asks for numbers at**, **Your year starts in** | Owners and Admins | Which day it is for your team, when each day's requests go out, and where quarters and years begin. Ziffr proposes this browser's time zone while the Workspace still has the default, UTC |

The Workspace's time counts as answered once an Owner or Admin has saved it, even when it is UTC. A Member sees what the Owners and Admins said about the business, read-only, and answers only their own function.

What you answer stays in this Workspace. It is not sent to Ziffr's makers or to anyone else, and it is used only to suggest Metrics and Packs here and who is asked for what. Owners and Admins of this Workspace see your function; other members do not. (On hosted Ziffr, ziffr.net runs the database, as for everything else in the Workspace.)

You can change every answer later: the business and the time under **Workspace → General**, in the section **About your business**, and your function under **Your profile**.

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
