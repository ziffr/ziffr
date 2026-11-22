<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/settings/workspace/**, apps/web/src/app/settings/keys/**, apps/web/src/app/settings/feeds/**, apps/web/src/app/settings/webhooks/**, apps/web/src/app/settings/your-webhooks/**, apps/web/src/app/settings/size/**, apps/web/src/app/settings/usage/**, apps/web/src/app/settings/tags/**, apps/web/src/app/settings/page.tsx, apps/web/src/components/app-shell.tsx, apps/web/src/app/team/**, apps/web/src/app/connectors/**, apps/web/src/app/try/**, apps/web/src/app/sources/**, apps/web/src/app/audit/**, apps/web/src/app/welcome/**, apps/web/src/app/invite/**, apps/web/src/components/settings-nav.tsx, apps/web/src/lib/settings-links.ts -->
# Workspace settings

A **Workspace** is your team's own space in Ziffr. This chapter goes through its pages one by one: how a Workspace starts, how people join it, and every page behind the **Workspace** row of the sidebar.

Everyone in the Workspace opens these pages, but what each person may change depends on their **Workspace Role**:

| Role | On these pages |
| --- | --- |
| **Owner** | Changes everything, including who else is an Owner and Domain Joining |
| **Admin** | Changes almost everything, but cannot make or remove Owners, change an Owner's role, or switch Domain Joining |
| **Member** | Reads most pages, sets their own Away dates and Delivery Preferences, and makes their own Access Keys |
| **Guest** | The same as a Member, but their Access Keys cannot create anything |

A Workspace can have several Owners, and it always keeps at least one.

## The Workspace menu

Choose **Workspace** in the sidebar to open its pages. They are:

| Page | Who sees it in the menu | Covered |
| --- | --- | --- |
| **General** | Everyone | Below |
| **Members and Groups** | Everyone but Guests | Below |
| **Connectors** | Everyone | Below |
| **Workflows** | Everyone but Guests | In [Workflows](11-workflows.md) |
| **Packs** | Everyone but Guests | In [Packs](19-packs.md) |
| **Access Keys** | Everyone but Guests | Below |
| **Feeds** | Owners and Admins | Below |
| **Changes** | Everyone | [Actions and Changes](15-actions.md#the-changes-page) |
| **Usage** | Owners and Admins | Below |
| **Audit log** | Owners and Admins | Below |

A Guest sees only what is shared with them, and never who else is in the Workspace: other people's names, emails and Slack handles do not appear anywhere. Whoever owns, edits, approves or comments on what is shared with them reads as "Someone", **Who can see this** shows them only their own line ("Viewer", or "Viewer through" a Group they are in), and search finds only themselves. A Version history of a Theme is not open to them. Their **Connectors** page shows their own Delivery Preferences, their **Workflows** are those of the Metrics shared with them (the page still opens from a link), and **Changes** lists changes to what they may see.

General, Packs, Access Keys, Feeds and Usage open inside the settings area. It has a side list with two parts: **You** (**My schedule**, your **Profile**, your **Appearance**, your **Deliveries**, your **Alerts** and your **Connected assistants**, see [Signing in and your own settings](17-your-settings.md)) and **Workspace**, the same pages as the menu. On a phone the side list becomes one row that you scroll sideways.

### In the sidebar

In the sidebar (see [Signing in and your own settings](17-your-settings.md#the-sidebar)) the **Workspace** row opens four places: **Members and Groups**, **Workflows**, **Connectors** (with tabs for **Channels**, **Sources**, **Outbox** and **Who gets what**) and **Settings**. Guests have no Workspace row. **Settings** is one page with its own list, shown beside whichever of its pages is open, in three groups: **Workspace** (**General**, **Size and Retention** for Owners and Admins, **Themes**, **Packs**), **Programs** (**Access Keys**, and **Feeds** and **Webhooks** for Owners and Admins) and **Records** (**Changes**, and **Usage** and **Audit log** for Owners and Admins). Your own pages are not in that list: they are in your own menu at the bottom of the sidebar, and **My schedule** is the **Schedule** row.

## Starting a Workspace

After you sign in for the first time and belong to no Workspace yet, Ziffr opens **Start a workspace**, in the same plain column as the sign-in page: the Ziffr mark and a card with the form. **Start your trial**, an Invitation's page and the Trial guide share that look.

- Type the **Name of the workspace**, such as your name, your team or your company, and choose **Create workspace**. You become its Owner, and Ziffr opens it.
- If a colleague already uses Ziffr, it is better to ask them to invite you, so you join their Workspace instead of starting a second one.

You can start another Workspace at any time from the Workspace switcher at the top of the sidebar, with **New workspace**. Everything in one Workspace stays in it; nothing is shared between Workspaces.

### From a Workspace Export

On a Ziffr that you or your company run (not on hosted Ziffr, where a new Workspace is a trial), **Start a workspace** also says "Coming from another Ziffr?" with a link, **Start from a Workspace Export**. Choose the file the Owner of the other Workspace downloaded and select **Import**. The file becomes a **new** Workspace and you are its Owner; nothing is merged into a Workspace you already have.

Ziffr first checks the whole file and writes nothing. If anything is wrong, such as a line that is not allowed, a number that is too large, a name the file never listed, a time zone this Ziffr does not know, or more Metrics than this Ziffr's Workspace Limit allows, the page says which line and why, and no Workspace is made. Only when the file is sound does it create the Workspace and fill it, with a progress bar that you can leave and come back to. If the import stops half-way, for any reason, the half-made Workspace is deleted together with its key. You can only run one import at a time.

The new Workspace has its own key: everything private in it is sealed again under that key, whatever it was sealed with before. What arrives: the Workspace's name, time zone and year start, Groups, Themes, Metrics with their Tags, Target Ranges, Target Series and Projections, every value with its Breakdown and the day it was recorded, dashboards, decks, Workflows and Shares. Values come in as imports, so they count as history. Things to know:

- **You own every Metric.** The people who owned them get them when they join.
- **People are not invited yet.** They are on the **Members and Groups** page as invitations that are on hold, with the name, address and role the file gave. Nothing is sent. Change a person's role with the list beside their name if the old one no longer fits, then choose **Invite everyone** when you are ready, within this Ziffr's sending limits; each person's Groups, Shares, the Metrics they owned and the Metrics they send values for are applied when they join. You are not invited yourself: if your own address is in the file, you are the person it names.
- **Workflows** ask the Owner to approve until people join, since the file holds how many Approvers there are, never who.
- **Decks** are laid out when you first open each one, from today's values, as a deck made from a Deck Template. A Deck Template for each also appears in the Workspace.
- **Computed Metrics** (Derived Metrics) arrive with their formulas but no values: Ziffr computes them again.
- **Who sent a value** stays as a name and shows in the history as "Ana (imported)".

An Installation can lower or raise the size the import accepts with `ZIFFR_IMPORT_MAX_FILE_MB` (200 by default, the size of the file) and `ZIFFR_IMPORT_MAX_TEXT_MB` (1,024 by default, the size once unpacked).

### On a Ziffr that offers trials

Hosted Ziffr offers **Trial Workspaces** instead; a Ziffr that somebody else runs has none, and every Workspace made there is an ordinary one. What the page then says works in a trial, email first, follows what this Ziffr is set up with, also on its [Installation settings](18-installation-settings.md) page. The sign-in page then says, in one line under its heading, that a new address gets an account from the same link; the demo, where it is offered, is a small **Try the demo** link below the form. Where the Ziffr has set it up, a short check against bots by Cloudflare sits above **Send me a sign-in link**; the button works once it has passed. After signing in, **Start your trial** makes one Trial Workspace for you alone. It starts with one Metric, **Cups of coffee**, a Workflow that asks you for it each day and a small dashboard, **Your coffee**; nothing in it is made up, so the first value is yours. Add the Metrics you really track as in any Workspace; once you have recorded a value of your own, you can invite colleagues by email (see below), nothing is sent to a Contact for real, and the trial is deleted after the number of days the page names.

A new trial opens on its **Trial guide**, one step at a time with the steps named at the top, **Back** and **Skip** on each, and **Skip the guide** to leave it. Until you reach Done or skip the guide, your home page and Try it bring you back to it at the step you reached; after that it opens only from **Trial guide** in the line above the page. **Welcome** says what happens: in a few minutes Ziffr asks you for a number and you answer it, for a Metric the trial has for this, **Cups of coffee** (asked daily, without history). **Where should Ziffr ask you?** lists email, Slack, Telegram and WhatsApp as they are on this Ziffr; only the ones marked **Real** can be picked, the others say why not. The web form is always there: every request carries your personal form link. Ziffr asks you once a day by one way, the first you pick of Telegram, Slack and email (email when you pick none), and the step says which: "From tomorrow Ziffr asks you by Telegram". **Connect** shows each picked way with a tick once it needs nothing more (email and the web form never do; where replies by email work, you can also just reply with the number; Slack and Telegram link to the Connectors page, with **Check again**). **Ask me now** sends today's request for Cups of coffee once by every way you picked, offers your form right there, and waits: the value shows the moment you answer. A way that could not take the request says so with a short reason. If nothing has come after about 20 seconds, it says where each request went and how to answer it (the form link in the email or a reply, or the Outbox when it stayed in Ziffr) and offers **Send it again** once ten minutes have passed since the last request. **Done** shows the value, says by which way Ziffr asks you from tomorrow with a link to **Your Deliveries** to change it, that the dashboard Your coffee fills as the days go by, and links to the Metric, the dashboards and Try it. Below, **Other ways to send numbers** shows the ways in that need no asking. **Claude or another AI assistant** (where this Ziffr serves assistants) gives the exact address to add as a custom connector in Claude.ai, with **Copy**, the steps to connect (pick this Workspace on Ziffr's page, and tick Submit values if the assistant should record numbers too) and a question to ask about Cups of coffee; a trial can have one connected assistant at a time. **A program such as n8n** has **Make a key for n8n**: it makes a Feed for Cups of coffee, named "n8n (from the Trial guide)", and a Feed Key that works until the trial ends, and shows the key once with **Copy**, the settings of n8n's HTTP Request node, and the same call for a terminal (a line that sets the key, then the curl command). With the key it offers a ready n8n workflow, filled in with this Ziffr's address, Cups of coffee and the key: **Download the n8n workflow** or **Copy it**, then in n8n open a new workflow, paste it (Ctrl/Cmd+V) or import the file, and press Execute workflow; a number from 1 to 5 arrives in Ziffr. The key sits in the workflow's request so it works at once; for real use it belongs in an n8n credential (Header Auth). The workflow is made in your browser from what the page shows, and nothing more is stored. Pressing it again makes no second Feed: it says a key already works, and **Replace the key** stops the old one and shows a new one.

**Colleagues in a trial.** The Team page invites by email as in any Workspace, with three differences. Invitations open only after you, the Owner, have recorded a value of your own (a value that came in through a Feed or an Import does not count): before that, **Invite** says "Invitations open once the Owner has recorded a first value of their own". A trial holds at most 5 people (Members, Admins and Guests, you and the invitations that are still open included; hosted Ziffr may set another number); a sixth invitation is refused, and revoking an open invitation makes room. A trial sends at most 10 invitation emails a day, resends included, and all trials together send a limited number too; an invitation the day's number could not email stays on the Team page as a link you send yourself, and says why. An address has one open invitation at a time. There are no invite links and no Domain Joining in a trial, and the invitation works for its address only. The email says it is a trial, who invited the person, the day it ends and what follows (it becomes a subscription or is closed and its data deleted), and it ends with a **Do not invite me again** link: whoever uses it gets no more invitation emails from any Workspace on this Ziffr. An invitation that could not be emailed, for this or any other reason the day's limits give, stays on the Team page as a link you can send yourself.

**Who a trial reaches.** Once someone has accepted their invitation (signing in proves their address), every Connector reaches them as in any Workspace: Prompts, reminders, tasks and Alerts go by email, Slack or Telegram, whichever each person chose. Anything meant for an invitation that is still open, or for a **Contact**, stays in the Outbox with the reason, because nobody has proved those details. The trial sends at most 100 messages a day to everyone together (hosted Ziffr may set another number). **View Links** and **Webhooks** work in a trial within its limits (see the Trial limits on the Try it page): a View Link ends on the trial's last day at the latest, whatever date you pick, and keeps that date if you subscribe.

**Your trial's limits.** The line above the page, and **Try it** below the cards, show Owners and Admins what the trial has used: "3 of 5 people, 4 of 10 invitation emails today, 12 of 25 Metrics", and, when one is reached, what it means and when more invitation emails can go. Members and Guests see no counts: their line above the page says whose trial it is (a Guest is not told the name), the day it ends and what follows, in the words of the invitation.

**Try it** stays as the reference: one card per way values and messages travel (email, replies by email, Slack, Telegram, the web form, the API, AI assistants, Feeds, WhatsApp, the ticket system). Each says whether it is **Real**, **Simulated** or **Off** on this Ziffr and why, and, for the real ones, how to try it in a sentence with a link. A card is ticked once a value really arrived that way. Below the cards, **What a trial never does** lists what to not wait for.

While the trial runs, a line above the page says how many days it has left, with **Trial guide**, **Try it** and **Download your values** (a CSV file of every Metric's values, written in the Workspace's Number Style without group marks and with a plain "-" before a negative value, so a spreadsheet reads it as a number; when the decimal mark is a comma, the fields are separated by ";" so a spreadsheet set to that style opens it right away). The day before it ends, Ziffr reminds you once. When it ends, Ziffr shows **This trial has ended** instead of the app: nothing is sent or taken any more and its keys stop working, but you can still download your values, and its Owner the [Workspace Export](#workspace-export). A week later the trial is deleted with everything in it, and your account with it. Members and Guests of the trial see **This trial has ended** with the name of its Owner, who decides whether it goes on, and nothing to download or delete. **End my trial** on the Try it page, or **Delete it now** on the ended screen, deletes it at once after you confirm.

Some Ziffrs, such as hosted Ziffr, keep trials instead of deleting them. The line above the page then says what the Workspace stays on, such as "Your trial ends on 3 December. Your Workspace then stays, on Free: up to 10 Metrics.", and so does the reminder the day before. When the trial ends, nothing closes: the Workspace becomes an ordinary one with that limit (see Size and usage). From then on you can invite people, every Connector reaches everyone, and keys work until the day they were made for. If it holds more Metrics than the limit, the 14 days over it start. Booking a Size during the trial ends the trial at once, with that Size's limit.

Where such a Ziffr allows only one Workspace on its default limit per person, making a second one says so: change the first one's Size for more room, or ask to be invited to another Workspace.

### Asking to join

If your colleagues' Workspace has **Domain Joining** switched on, and you signed in with a proven address at the same company domain, the page shows **Your colleagues already use Ziffr** above the form. It lists each such Workspace with an **Ask to join** button.

After you ask, the line says "Asked; an owner or admin decides." An Owner or Admin sees your name and address on **Members and Groups** and lets you in or declines. If they let you in, you join as a Member.

Addresses at public mail providers, such as Gmail or Outlook, never count as a company domain.

## Accepting an Invitation

An **Invitation** reaches you as an email or as a link someone sends you. Opening it asks you to sign in first, then shows **Join** followed by the Workspace's name and the role you are invited with, such as "You are invited as Member".

- Choose **Join**. You become part of the Workspace with that role, and Ziffr opens it.
- An Invitation sent to an email address works only for that address. If you are signed in with another one, the page says so: sign out and sign in with the invited address.
- When the Workspace is a trial, the page says so under its title: who invited you, the day the trial ends and what follows (it becomes a subscription or is closed and its data deleted). The invitation email says the same and has a **Do not invite me again** link; with it, nobody can invite your address by email from this Ziffr again. You can still join through a link someone sends you.
- An Invitation works once. If it has ended, was used already or was revoked, the page says "This invitation does not work any more". Ask whoever invited you for a new one.

If you were a **Contact** before, accepting the Invitation keeps your history: the values you sent in stay under your name.

## General

**Workspace → General** holds the Workspace's name, its time, its fiscal year, its Number Style, its Answer Languages, its limits and its Workspace Profile. Owners and Admins change them. Everyone else sees them, with the note "Only Owners and Admins change these."

### Size and usage

Owners and Admins see **Size and usage** under the name: how many Metrics the Workspace holds, Archived Metrics not counted. When the Workspace has a **Workspace Limit**, it also shows the Size, such as "Small", and the count of the limit, such as "38 of 50 Metrics"; and a coming change, such as "Changes to Team on 1 December 2026", when one is set. Without a limit, as on most self-hosted Ziffrs, it shows only the count.

Over its limit, the section says since when and until when new Metrics can still be made (14 days, with room for 10 % more), or that they wait now. Everything else keeps working and values keep arriving. Owners and Admins then see a line above the page on every page with the same news and a link here, and every Owner gets one email when the 14 days start and one when they end. Archiving Metrics you no longer track makes room (see the Metrics chapter).

The 14 days come at most once in 90 days. If the Workspace goes over its limit again within 90 days of the day the last 14 days started, new Metrics wait at once, bringing an Archived Metric back included, and Size and usage says from which day the next 14 days are possible. Archiving down always works.

Near the limit, from 90 % on, everyone who opens **New metric** sees how many Metrics the Workspace holds of how many, such as "48 of 50 Metrics". When new Metrics wait, the page says so before the form is filled in.

**Download the values** saves the values of every Metric you see as a CSV file, written as the trial's download is (with the columns `period_end` and `condensed_from`, empty except on a Condensed Value, which is one line for its span); the warning before an unused Workspace is deleted links to it.
On hosted Ziffr, Owners also see **Change Size** and **Billing and invoices**. Both take you to Ziffr Cloud, where you book, change or cancel the Size and see invoices; Ziffr hands you over with a token that works for five minutes and knows only the Workspace, its name and your address. Admins see the section without these buttons, and Ziffr never holds payment details.
**Make room** opens when a smaller Size needs fewer Metrics than the Workspace holds, such as when an Owner moves to a smaller Size on hosted Ziffr. It says how many Metrics the smaller Size allows, how many the Workspace holds and how many to archive, and lists the Metrics you see with the month of their latest value. The ones whose latest value is oldest, or that have none, are ticked first, as many as needed; change the ticks as you like, and the line below says how many more are needed. **Archive** archives the ticked ones and takes you back here. Metrics not shared with you are only counted: their owners archive them. Owners and Admins only.

Members and Guests do not see this section. Who sets a limit: see the Installation settings chapter.

### Name

The **Workspace name** is what everyone sees in the Workspace switcher and in Invitations. Type a new one (up to 80 characters) and choose **Save**.

### Quiet hours

On the same page as the Workspace's time, Owners and Admins can set the default **Quiet hours** for everyone who has set none of their own: the hours (such as 19:00 until 07:00) and the whole days (such as Saturday and Sunday) when Ziffr sends no request for numbers, reminder or Alert. They wait and go out when the quiet hours end. The default is read in the Workspace's time zone; people can set their own, in their own time zone, under **Your Deliveries**. **Remove** takes the default away. It is recorded in the **Audit Log**.

### Workspace time

Ziffr counts days, working days and Due Dates in the Workspace's own time. An assistant connected to Ziffr can read the time zone, the hour Ziffr asks at and the first day of the week, so that "ask me at 1 pm" means 13:00 here.

| Option | What it does |
| --- | --- |
| **Time zone** | Which day it is for this team. A value that is due "on the 3rd working day" is due by that day here. |
| **Workflows run at** | The hour of the morning, in that time zone, at which Workflows ask for values, remind and escalate. |
| **Week starts on** | Monday (the default) or Sunday: the first day of the week in the **Schedule**'s week and month views and the week it opens on. Metric periods do not move: a weekly value still covers Monday to Sunday and is named by its Monday. |

Choose **Save** after changing any of them. Members and Guests see a single line, such as "Europe/Berlin, Workflows run at 07:00, weeks start on Monday".

### Fiscal year

**Year starts in** sets the month the Workspace's **Fiscal Year** begins. It decides where quarters, half-years and years start everywhere in Ziffr: for quarterly and yearly Metrics, their Prompts and Due Dates, in Comparisons such as QoQ and HoH, in a widget's **Show by**, and in Snapshots of a quarter, half-year or year. Programs read it through the API (`GET /api/v1/workspace`). It is January unless an Owner or Admin picks another month.

With January, quarters and years have their calendar names: "Q3 2026", "H2 2026", "2026". With any other month, a year is named by both calendar years it spans, so it cannot be mistaken for a calendar year: a year that starts in April 2026 is "FY 2026/27", and its first quarter, April to June, is "Q1 FY 2026/27". Months, weeks and days keep their calendar names. Under the list, the page shows what this year and this quarter are called with the month you picked.

Some months may be greyed out. What Ziffr has already kept per quarter, half-year or year, such as the values of a quarterly Metric or a Snapshot of a quarter, stays tied to the months it was kept for. A month that would split those periods cannot be picked, and the page says why. For example, with a Snapshot of Q2 2026, the year can start in January, April, July or October, and the Snapshot is then called by its new name, such as "Q1 FY 2026/27". Comparisons are always worked out afresh, so they follow a change at once.

Choose **Save** after picking a month. The change shows in the Audit Log. Members and Guests see a single line, such as "Year starts in April".

### Number style

**Numbers look like** sets the Workspace's **Number Style**. It is one of four: 1,234.5, 1.234,5, 1 234,5 and 1'234.5. Each choice shows a percentage too, such as "1.234,5 (12,5 %)". The style says which mark groups the digits and which mark is the decimal. Ziffr writes every value in it: on every page, in charts, in replies by Slack, Telegram and email, and in decks. A negative number is written with the minus sign "−", values and changes alike, such as "−1.200 €" or "−3,5 %". Files and programs get a plain "-": the CSV download, the API and the MCP Server. Ziffr reads either sign when you type or send a number. It will also use it to read a number that could mean two things, such as 1.500 sent by Slack or email.

Until an Owner or Admin picks a style, it follows the country in the Workspace Profile. A Workspace in Germany writes 1.234,5, in France 1 234,5 and in Switzerland 1'234.5. Without a country it is 1,234.5. The page says where the style comes from. Once you pick one and choose **Save**, it stays, even if the country changes later. The change shows in the Audit Log. Members and Guests see a single line, such as "Numbers look like 1.234,5 (12,5 %)".

### Answer languages

People often answer a Prompt in a sentence, such as "letzte Woche 2" or "la semaine dernière 2". **Answer languages** says which languages' words Ziffr understands there. Ziffr reads those words as the period, never as the value (see [How Ziffr reads a number you send](04-connecting.md#how-ziffr-reads-a-number-you-send)). Tick the languages your people answer in: English, German, French, Spanish, Italian and Dutch. Ziffr tries only the ticked ones, so a word that means one thing in one language and another elsewhere never gets in the way.

Until an Owner or Admin picks languages, the Workspace reads English plus the languages of the country in its Workspace Profile. That is English and German in Germany, and English, German, French and Italian in Switzerland. Without a country, it is English alone. The country also decides how a date such as 11/12 is read: month first in the United States, day first everywhere else. Once you pick languages and choose **Save**, they stay, even if the country changes later. The change shows in the Audit Log. Members and Guests see a single line, such as "Answers are read in English, German".

A word in a language that is not ticked is simply not understood. The rules still hold: if exactly one number is left, it counts for the Prompt's period. If there are several, Ziffr asks back.

### Attainment

**Attainment is computed** sets how the percentage of target is worked out for every Metric that has no method of its own. **By ratio** divides the value by the target, or the target by the value when lower is better. **By distance** counts the distance to the target in steps of the target's size. They agree for "higher is better" with a target above 0, and differ for "lower is better" and around 0: 5 against a target of at most 10 is 200 % by ratio and 150 % by distance. [Metrics](10-metrics.md#comparisons) explains both.

Every Workspace computes by ratio until an Owner or Admin changes it, as Ziffr did up to version 0.9.0. A Metric can still choose its own method under **Edit details…**. Snapshots and frozen View Links keep the method they were made with, so their numbers do not change. Choose **Save** after picking one. The change shows in the Audit Log. Members and Guests see a single line, such as "Attainment is computed by ratio".

### Retention

**Retention** sets the **default** for new Metrics: keep values for 2, 3, 5, 7 or 10 years (or a number of months, at least 13), then condense them into longer periods or delete them. Without one, every value is kept for ever. Only Owners set it, since it decides what every Metric made afterwards starts with and deleting cannot be undone; Admins see it, Members and Guests do not see the section. The demo has none.

The default is **copied** into a new Metric when it is made, with no link back: changing it later changes no Metric that exists. A Metric it does not fit (a rate cannot be condensed) gets none, and the copy waits 7 days like any confirmed Retention, so it can be cancelled on the Metric's page. Choose **Save as the default**.

**Apply to existing Metrics…** shows what the setting would do to every Metric you may see that has no Retention yet, in counts: how many Metrics get it, how many periods and values would be condensed or deleted, and which Metrics are left out and why. **Turn on for N Metrics…** repeats the counts; for a delete you type "delete". If the numbers changed since you looked, Ziffr refuses with "The numbers changed; look again." and you show them again. Each Metric then waits 7 days, and its owner gets a message now and one the day before. See [A Metric's Retention](10-metrics.md#retention) for what a Retention does. The Audit Log records the default and each Metric it was applied to.

### Limits

For Owners and Admins, a section **Limits** lists five values the Workspace may set for itself, each within the range its Installation allows. Under each field it says what is **In effect** and the range **Allowed**; leave the field empty to follow the Installation, and press **Save** to set or clear it.

- **Alerts per person** (1 up to the Installation's ceiling; normal 20): the most Alerts one person may hold in this Workspace.
- **Alert messages per person per day** (1 up to the Installation's ceiling; normal 20): after it, Alerts still fire into the list and only the messages wait for tomorrow. Each person may lower it further for themselves under [Your profile](17-your-settings.md#your-limits).
- **Longest life of a View Link** (1 to 90 days; normal 90): the furthest end date a new View Link may have. Links that exist keep their end date.
- **Share of the daily emails Alerts may use** (10 to 50 %; normal 40): the rest of the Workspace's emails per day is kept for requests for values and tasks.
- **Days after which a Metric counts as unused** (30 to 365; normal 90): the Usage page and its monthly email list Metrics, dashboards and decks not opened for that long. It is only a suggestion.

Alerts per person, Alert messages per person per day and the View Link life can only go lower than the Installation allows, never higher. Lowering a limit never deletes or stops what exists: a person who holds more Alerts than you now allow keeps them and only cannot add new ones. Every change is written to the Audit Log. In the demo the section is not shown.

### Workspace Profile

The **Workspace Profile** says what kind of business this is, so Ziffr can suggest the Metrics such teams track. Each part is picked from a list; **Not set** leaves it open.

| Option | What you pick |
| --- | --- |
| **Industry** | For example Software and SaaS, E-commerce, Manufacturing, Health and care, or Something else |
| **Customers** | Businesses (B2B), Consumers (B2C), Businesses and their customers (B2B2C), Public sector or Non-profit |
| **Country** | Where the business is based. Picking a country proposes its currency. |
| **Currency** | The currency the Workspace counts in |
| **People** | How many people work there, from 1 to 10 up to More than 1,000 |
| **Revenue a year** | From Under 1 million to Over 1 billion, in the Workspace currency |

Choose **Save** when you are done. Teams within your company, such as Sales or Finance, are not part of the profile: make them Groups on **Members and Groups**.

### Encryption

Owners see one line at the end of the page: **Encrypted with a key of its own. Deleting this Workspace destroys it.** The Workspace's words and numbers (Thread replies, questions and tasks, Contacts' details, Metric names, values, notes on a period, the Outbox, the Audit Log and the Slack connection's token) are encrypted with that key as they are written, and what was written before is encrypted as Ziffr gets to it, so a copy of the database alone does not show what is already encrypted. Ziffr itself still reads them to do its work: this is not end-to-end encryption. When a Workspace is deleted (today: a trial), its key goes first, so what is left of it can no longer be opened; backups made before then become unreadable once their retention period is over.

### Workspace Export

Only the Workspace's Owner sees **Workspace Export** under **Settings**, in the Workspace group. It downloads what you may see in the Workspace as one file, to keep or for another Ziffr to read as a new Workspace. The page first says what the file will hold (how many Metrics, dashboards, decks, Workflows, Themes, Groups, Shares and people to invite) and what stays out, with the reason for each. With every Metric come its values, Target Series and Projections.

The file holds every value in the clear, so keep it as private as the Workspace. Ziffr makes it while you download it and keeps no copy; the download is gzipped. People are in it as invitations: name, email address, Workspace Role and Groups, and nothing is sent to them when someone imports it. It holds no Access Key, Feed Key, Webhook address or secret and no Connector link: make those again where you run it. It holds what you may see, so a Metric nobody shared with you is not in it. Nothing is cut short: what the file cannot carry, such as a free layout, a Theme's logo, or a text longer than the file allows, stays out and is listed on the page. The details are in [the format](../reference/workspace-export.md).

A Workspace Export asks for a sign-in from the last 10 minutes. If you signed in earlier, the page shows **Sign in again to download**: it signs you out and brings you back to the page after you sign in, where **Download the Workspace Export** is ready. Starting and ending a download are in the Audit log, with the size and never what the file holds; a Workspace starts at most five an hour. Admins and Members do not see the page, and the demo cannot be exported.

When a trial has ended, **This trial has ended** has the same button for its Owner, before the Workspace is deleted.

### In the demo

The demo's sidebar has the same user menu at the bottom as any Workspace: **My schedule**, **Profile**, **Deliveries** and **Alerts** open from it, so a visitor does not have to find them in the side list. A change the demo refuses says "The demo can't be changed." with **Try it with a trial of your own** beside it.

In the demo nobody changes these settings: the page shows them without the controls and says "The demo can't be changed." The demo has no Workspace time: its date is the pretend date on the Workflows page. Its year starts in January, it writes numbers as 1,234.5, and it computes Attainment by ratio.

## Members and Groups

**Workspace → Members and Groups** shows everyone in the Workspace, their roles, their Groups, their Away dates and the Contacts. Owners, Admins and Members see it; only Owners and Admins see the buttons that change people and Groups. A Guest sees only what is shared with them, so the page shows them none of this.

### Members and their roles

The list shows each person with their role. Owners and Admins see a menu next to each person instead:

| Role | What the person may do |
| --- | --- |
| **Owner** | Everything, including billing and making or removing Owners |
| **Admin** | Manages settings, Themes, Groups and members, but not billing, and does not make or remove Owners |
| **Member** | Creates and shares Metrics, dashboards and decks |
| **Guest** | Sees only what is shared with them, answers questions and sends in values; creates nothing. Pages and lists show no buttons for what they cannot do (no **New metric**, **Paste values**, **New deck** or **Create dashboard**), and an empty list says "Nothing has been shared with you yet. Ask whoever invited you." |

Pick another role and it changes at once. Only an Owner can make someone an Owner or change an Owner's role. The last Owner cannot step down: make someone else Owner first.

### Removing someone and handing over

Choose **Remove…** next to a person. Ziffr asks **Who takes over?**: pick another person (not a Guest), then choose **Remove**, or **Cancel** to stop.

When you remove someone:

- Everything they own, such as their Metrics, dashboards, decks, Workflows, Themes and saved templates, goes to the person who takes over. Nothing others built on is deleted, and the handover shows in each item's Version history.
- Their Tokens, Stand-in roles, Shares, Group memberships, Access Keys and Calendar Link end at once.
- A dashboard that took **Snapshots** by itself stops doing so, so the new owner can choose again.

You cannot remove yourself: ask another Owner or Admin. Only an Owner can remove an Owner. In the demo nobody can be removed.

### Inviting people

Owners and Admins see the invitation form below the list.

| Option | What it does |
| --- | --- |
| **Invite by email** | The address of the person you invite |
| **as** | The role they get: Member, Guest or Admin, and Owner if you are an Owner yourself |
| **who is the Contact** | Shown when the Workspace has Contacts. Pick one if the person you invite is that Contact, so they keep their history. Leave it at **nobody yet** otherwise. |
| **Invite** | Makes the Invitation. If this Ziffr sends email, it emails the link too. That follows the mail server set up for this Ziffr, also when it was set on the [Installation settings](18-installation-settings.md) page. |
| **Link for Members** | Makes a link that anyone who has it can use to join as a Member |

After either, the page shows the link so you can send it yourself, for example in a chat. The message says what really happened: "Invitation emailed to …" when the email went out, "Invitation made: copy the link and send it yourself, email is not set up" when this Ziffr sends no email, and a note that the email could not be sent when mail is set up but the send failed.

- An email Invitation works for 14 days, once, and only for that address.
- A link works for 7 days, for anyone who has it, until it ends or you revoke it.

Below the form, open Invitations are listed with their address (or "Link"), their role and the day they end. Where Ziffr sends email, each line also says whether it was emailed, or why not. **Resend** emails it again; an Invitation can be emailed at most three times. The bin icon revokes it.

People from an imported Workspace Export are listed here too, with "not invited yet" instead of a day: they are on hold and cannot accept anything. **Invite everyone**, shown to the Owner above the list, releases all of them for 14 days and emails each the link where Ziffr sends email. Pressing it again does nothing for people already released.

There are no Invitations in the demo.

### Requests to join

When someone asks to join through Domain Joining, their name and address appear with "asks to join". Choose **Let in** to make them a Member, or **Decline**.

### Domain Joining

Owners see a checkbox such as "Let people with an address at example.com ask to join". It uses the domain of the address you signed in with, so your address must be proven. Once it is on, the line reads "People with an address at example.com may ask to join", and anyone signing in with an address at that domain sees your Workspace on their welcome page. Nobody gets in by themselves: an Owner or Admin lets each one in.

Domain Joining is off by default and does not work for public mail providers.

### Groups and Away dates

The table below the members has one row per person and these columns:

- **Person**: their name and job.
- **Away**: the dates they are not available, from and to. While someone is **Away**, Prompts meant for them go to their **Stand-in**. Each person sets their own dates here or under **Your Deliveries**. Owners and Admins can set them for anyone. **Clear** removes them.
- **One column per Group**: a tick means the person is in that Group.

A **Group** is a named set of people, such as Management or Sales. You share things with a Group, or limit a question's Thread to one, and whoever joins the Group later gets the same. Owners and Admins:

- add a Group by typing its name under the table, such as "Finance", and choosing **Add**;
- rename a Group by clicking its name in the table's header and typing;
- put people in or take them out with the tick boxes;
- delete a Group with the bin icon next to its name. Ziffr asks first: whatever was shared with the Group stops being shared, and Threads limited to it become readable by everyone.

Every Workspace also has the Group **Everyone in the workspace**: all its members except Guests. Ziffr keeps it up to date, so it is not in the table.

### Contacts

A **Contact** is someone without a login, such as a field worker or an outside bookkeeper. They send in values by Slack, by email or with their personal form link, and the values are recorded under their name. They see nothing in Ziffr.

Owners and Admins add a Contact with **Name** and at least one of **Email**, **Slack handle** (such as @cleo) or **Phone**, then **Add contact**. The address or handle must not belong to anyone else in the Workspace. Owners and Admins also see each Contact's details, and the bin icon removes a Contact. A Workspace keeps 1,000 Contacts unless the person who runs this Ziffr has set another number under **Sending limits**. Their values stay; their form link stops working and they can no longer send in values.

To give a Contact a login later, invite them by email and pick them under **who is the Contact**.

In the demo, adding a Contact says "The demo can't be changed."

## Connectors

**Workspace → Connectors** shows how Ziffr reaches people and how their answers come back. Everyone sees it. See [Connecting Ziffr](04-connecting.md) for the bigger picture. It has four tabs, each its own page: **Channels** (below, from Slack to Connected systems), **Sources**, **Outbox** and **Who gets what**. The old address `/sources` leads to the **Sources** tab. Claude and other AI assistants are not set up here but under **Connected assistants** in your own menu; **Channels** says so in one line.

### Slack

The Slack box appears when this Ziffr is set up for Slack (never in the demo).

| Option | Who | What it does |
| --- | --- | --- |
| **Add to Slack** | Owners and Admins | Takes you to Slack to connect one Slack workspace. Back in Ziffr, a line says whether it worked. If Ziffr refuses before sending you there, the reason shows below the button. |
| **Reconnect Slack** | Owners and Admins | Shown only while the connection was made without Slack's permission to send under the Workspace's own name and logo (`chat:write.customize`), and says so above the button. It takes you to Slack again; once granted, messages carry the Workspace's name and its Theme logo instead of the Ziffr app's. If Slack still does not grant it, whoever runs this Ziffr adds the scope to the Slack app first. Nothing is sent wrongly meanwhile: messages keep the app's name and icon. |
| **Disconnect Slack** | Owners and Admins | After asking, stops all messages there. Who was found on Slack is forgotten. |
| **Link my Slack account** | Everyone | Gives you a short code. Send the Ziffr app on Slack the message "link" and the code within ten minutes. |
| **Forget me on Slack** | Everyone who is linked | Ziffr no longer reaches you on Slack in this Workspace |
| **Get them on Slack again** | Whoever stopped them | Shown if you pressed "Stop these on Slack" under a Prompt or reminder there |

Once Slack is connected, the box says how Slack knows you: by your email address, or because you linked your account. If your Slack address differs from the one you sign in with, link your account.

A Slack workspace can be connected to one Ziffr Workspace only.

### Telegram

The Telegram box appears when this Ziffr has a Telegram bot (never in the demo). Whoever runs this Ziffr sets the bot up, in the server's settings or on the [Installation settings](18-installation-settings.md) page; if Telegram does not accept its token, the box says so and points them there. It names the bot, such as @acme_ziffr_bot, and says whether Telegram is on in this Workspace. It is off until an Owner or Admin turns it on.

| Option | Who sees it | What it does |
| --- | --- | --- |
| **Turn on** | Owners and Admins | Lets Ziffr send messages by Telegram in this Workspace, to everyone who connects their own Telegram. |
| **Turn off** | Owners and Admins | After asking, stops messages there. Who connected their Telegram stays connected, so turning it on again needs nothing from them. |
| **Connect Telegram** | Everyone, while Telegram is on | Gives you a link that opens Ziffr's bot in Telegram, valid for ten minutes. Tap **Start** there to connect your Telegram account to this Workspace. |
| **Disconnect** | Everyone who is connected | Ziffr no longer reaches you on Telegram in this Workspace. |
| **Get them on Telegram again** | Whoever stopped them | Shown if you pressed "Stop these on Telegram" under a Prompt or reminder there |

A bot cannot find anyone by email or phone number, so everyone connects their own Telegram, once per Workspace. Contacts without a login connect it on their personal form. To stop everything from Ziffr in Telegram, send the bot `/stop`, or block it.

Telegram can read what its bots send and receive, so numbers and questions sent this way pass through Telegram's servers. The box says so as well.

### Claude and other AI assistants

How to connect an AI assistant through the **MCP Server** is on **Connected assistants** in your own menu (see [Connecting an assistant](17-your-settings.md#connecting-an-assistant)), filled in with this Ziffr's address; **Channels** has one line that links there. It is not shown in the demo, which has no Access Keys. Assistants that use an **Access Key** need one made first (see [Access Keys](#access-keys)).

### Connected systems

One card per **Connector**, each with what it can do (receives values, sends reminders, sends questions and tasks, brings replies back, keeps task status in step) and its state. A badge says **Real** (it really goes out), **Simulated** (Ziffr only keeps it in the Outbox) or **Off**, followed by why and, in a **Trial Workspace**, the limit that applies, such as "To you only, at most 50 messages a day":

| Connector | What it does |
| --- | --- |
| **Email** | Plain emails; replying to one answers in Ziffr. When this Ziffr sends email, the card says "Sends real email". Otherwise nothing goes out and Ziffr keeps what it would send in the Outbox. Whoever runs this Ziffr sets up its mail server, in the server's settings or on the [Installation settings](18-installation-settings.md) page; the card shows the change at once. |
| **Slack** | Direct messages from the Ziffr app; answers in the thread come back. Real once Slack is connected. |
| **Telegram** | Messages from Ziffr's bot in Telegram; replying to one answers in Ziffr. Real once the Workspace turned Telegram on, for everyone who connected their own Telegram. |
| **WhatsApp** | Short messages from the Ziffr business number. Not live yet: Ziffr only records what it would send. |
| **Ticket system** | Tasks become tickets; comments come back, and closing a ticket marks the task done. Not live yet: Ziffr only records what it would send. |

If you stopped Prompts and reminders by email, a note at the top of **Channels** offers **Get them by email again**. On a card whose Connector is only simulated, an Installation Admin gets **Set it up on Installation settings**.

### Who gets what, where

The **Who gets what** tab: a table of **Delivery Preferences**: one row per person and one column each for **Questions**, **Tasks**, **Prompts and reminders** and **Replies and updates**.

- The first row, **Team default**, covers everyone who leaves a column open. Only Owners and Admins change it. Without a team default, Ziffr uses email.
- Your own row is marked "you". Change it here or under **Your Deliveries**. Everyone else's row is greyed out.
- Under **Prompts and reminders** a person can pick up to three ways, in order: the first select is the first way, the others are **Also by**. A Prompt goes by every way in the list at once and the first answer counts; reminders go by the first way only. The team default can be a list too. Where there is neither, the column reads "Default: every way you've connected".
- A Prompt goes by your choice only where the Metric accepts answers: its **Values arrive by** list decides. Otherwise it goes by the first way both allow where you can be reached, in the order Slack, Telegram, email, and nothing is sent elsewhere if none reaches you: the Prompt waits in the **Outbox** as "Not sent" and the Metric's owner is told once. The Metric page shows where each person's next Prompt goes ("By Slack and email").
- Replies about a question or task stay where it started, so a ticket collects its comments. Whoever asks a question can pick another way for that one message.

### Outbox

The **Outbox** tab lists every **Delivery** you may see, newest first, drawn the way it looks on the other side. Each one shows the Connector, who it went to, when, whether it was answered or closed, and **Open thread** for a question or task.

A Delivery that never left Ziffr is marked **Simulated, not sent**, or with the reason it was kept back, such as "Kept in the Outbox: a trial never sends to a Contact". For email, Slack and Telegram, a small label says whether it really went out: **Waiting to send**, **Sending**, **Emailed**, **Sent on Slack**, **Sent on Telegram** or **Not sent** with the reason, such as "Not connected to Telegram" for someone who has not connected theirs. A Prompt you have not answered yet may offer **Open the form as** you, which opens your form. A Prompt that went by several ways shows one Delivery per way, each marked **One request, 3 ways**; once it is answered they all read **Answered on** and the way the answer came by, and one that was still waiting (for quiet hours, say) is not sent any more.

You see Deliveries about Threads you may read, and Prompts and notices you sent or received. The personal form link in someone else's Prompt is hidden.

**Run now** (Owners and Admins only, folded away): Ziffr does this by itself every morning. Use it when the schedule did not run, or right after adding people.

- **Ask for missing values now** asks everyone whose value for the current period is missing.
- **Send due reminders now** reminds people of tasks due in the next two days.

### In the demo

The two **Run now** buttons sit in a dashed **Demo controls** box; using them says "The demo can't be changed." Under each Delivery you can play the recipient: **Answer as** the person, then **Send in** the Connector, or **Close ticket as** the person for a ticket. Ziffr then says what would happen, such as that the answer would land in the thread or that the value would be recorded, and saves nothing. **Try sending a value** on the Email and Slack cards leads to the **Sources** tab.

## Sources

**Workspace → Connectors → Sources** shows where values come from. Everyone sees it.

### From the web form

When you have sent values on the web form, **From the web form** lists the latest 20, newest first: when, the Metric, what was sent, and what happened, in the same words the form or the paste answered. A value from a [paste](10-metrics.md#paste-values-from-a-spreadsheet) is marked "pasted", or "pasted as history" when it was recorded as history. You see only your own, except in the demo.

### Form links

Everyone who sends in a Metric has a personal form link for it. The link itself is the permission, so nobody needs to sign in. You see your own links here, one per Metric that takes the web form, and opening one shows the form. If you have none, the page says a Metric gets them when its owner picks the web form as a Source and names who submits.

### The simulator (demo only)

In the demo, a **Demo controls** box shows two pretend inboxes, one for Slack and one for email, both marked "simulated". They go through the same checks as real ones, but save nothing: each message you send shows what would happen, and stays on the page, marked "not saved", until you leave it.

- Pick who sends the message, including an unknown sender, type a message such as "closed 2 deals", and send it.
- Under a Prompt from Ziffr, choose **Reply** to answer it as its recipient.
- Each message shows what happened, or for one you sent, what would happen ("Would be: Recorded"), such as **Recorded**, **Overwritten**, **Added up**, **Kept both**, or why it was rejected: a duplicate, a sender who may not submit this Metric, an unknown sender, no number, an unclear Metric, the wrong Source, a Derived Metric, an Archived Metric, or a period that was condensed ("Rejected: period condensed": "This period was condensed on 3 December 2026."). When the message holds several numbers, or names a period that is not the Prompt's or not one the Metric counts in, it says **Asked back** and what it asked.

## Packs

Packs, ready-made Metric Catalog entries, templates, designs and Themes, have a chapter of their own: [Packs](19-packs.md). Open them with **Workspace → Packs**.

## Tags

**Workspace → Tags** lists the Workspace's **Tags**, the free words people put on Metrics, each with how many Metrics carry it; the count links to the Metrics list filtered by that Tag. You see a Tag, and count its Metrics, only through Metrics you may see: a Tag that only Metrics out of your sight carry is not listed to you. Members see the list and change nothing. Guests have no Tags page.

Owners and Admins change the words for the whole Workspace:

- **Rename** changes a Tag's spelling on every Metric. If another Tag you can see already has the name, Ziffr asks you to merge the two instead.
- **Merge into…** moves every Metric of a Tag to another Tag and removes the first. A Metric that carries both keeps one.
- **Delete** removes the Tag from every Metric. The confirmation says from how many Metrics you can see it goes, and "and any you cannot" when Metrics out of your sight carry it too. The Metrics themselves stay.

Each of these is written to the **Audit log** (`tag.renamed`, `tag.merged`, `tag.deleted`). They are not available to programs or AI assistants. Adding a Tag to a Metric is done on the Metric's page (see [The Metrics screens](10-metrics.md#description)).

## Access Keys

**Workspace → Access Keys** is where you make an **Access Key**: a secret that lets a program or an AI assistant work in this Workspace on your behalf. A key sees no more than you do, and it stops working when it ends, when it is revoked, or when you leave the Workspace.

An assistant someone connected by Ziffr's address, such as Claude.ai, is listed here too, marked **Connected assistant** and named as it named itself (see [Connected assistants](17-your-settings.md#connected-assistants)). Revoking it disconnects it. Owners and Admins see every connection with its recent calls, and Owners can end anyone's.

In a **Trial Workspace**, at most two Access Keys work at a time, and none works past the trial's last day: a later end date is shortened to it. The same holds for Feeds: at most two, with at most two keys each.

### Making a key

| Option | What it does |
| --- | --- |
| **Name** | So you recognise the key later, such as "Shop export" |
| **Read metrics** | The program may read the Metrics you may see |
| **Submit values** | It may send in values where you may |
| **Create metrics** | It may create Metrics owned by you, and delete a Metric you own. Not offered to Guests. |
| **Change metrics** | It may change the Target Range, Target Series, Projections, Sources and Submitters of the Metrics you own or edit, and the Unusual Value check of the Workflows you own. Not offered to Guests. |
| **Read dashboards** | It may read the dashboards you may see, and their Snapshots |
| **Build dashboards** | It may build dashboards as you and take Snapshots of those you own or edit. Not offered to Guests. |
| **Manage alerts** | It may make, change and remove your own Alerts, and needs Read metrics too. Only for you, never for anyone else. |
| **Propose sharing** | It can propose a share for you to confirm, and needs Read dashboards too; it never shares by itself. A proposal waits in your Actions until you confirm it. |
| **Read questions and tasks** | The program may list the Questions and Tasks waiting for you and those you asked. |
| **Answer questions and tasks** | It may reply in their Threads, close or reopen the ones you asked and mark your Tasks done, as you. |
| **Approve values** | It may approve a value waiting for you, or send it back, as you. Never ticked for you: tick it only for a program you trust with that. Not offered to assistants, and never for your own values. |
| **Manage View Links** | It may make, list and revoke View Links to the dashboards you own, which show them to people outside the Workspace. Never ticked for you: tick it only for a program you trust with that. Not offered to assistants or Guests. The address of a new link is shown once, to the program that made it. |
| **Read usage figures** | Only for Owners and Admins. It may read counts of how the Workspace is used: views of dashboards, decks and Metrics per day, values by Source, and how many Metrics, dashboards and Submitters go unused. Never a name, an id or a value, and never who looked. Not offered to assistants. The [Usage Feed](#usage) can send them into the Workspace as Metrics. |
| **Build workflows** | It may make, change and delete **your own Workflows** and their steps (reminders, escalation, the Unusual Value check, publishing, the asking schedule). Needs Read metrics too. |
| **Name who approves and who is told** | On top of Build workflows: it may choose the Approvers of a Workflow and who a Tell step tells. Never ticked for you: tick it only for a program you trust with that. Not offered to assistants. |
| **Share and answer access requests** | It may share what you own with people and Groups, take Shares away, and answer requests for access to your things. Not offered to Guests. |
| **Manage groups** | It may create, rename and delete Groups and put people in and out of them. Only for Owners and Admins. |
| **Invite and remove people** | It may invite people, make invite links, change roles, add and remove Contacts and members, and answer requests to join. Only for Owners and Admins. |
| **Until** | The last day the key works, through the end of that day in UTC. At most a year ahead. |
| **Create key** | Makes the key |

The last three change who sees what, so only a key you make here can hold them: a connected assistant is never offered them. The secret is shown once: copy it now, it is not shown again. Give it only to the program that needs it.

### The list of keys

Each key shows its name, what it may do, the day it ends (or "revoked") and, for someone else's key, who made it.

- **Recent calls** opens the key's **Access Log**: when the program called, what it asked for, and the result. A failed call shows in red.
- The bin icon revokes the key at once.

| Role | Sees | Revokes |
| --- | --- | --- |
| Owner | Every key in the Workspace and its Access Log | Any key |
| Admin | Every key in the Workspace and its Access Log | Their own keys |
| Member or Guest | Their own keys | Their own keys |

The demo has no Access Keys, because a key there would act as a made-up person for anyone.

### Calendar Links

Owners and Admins also see, below the keys, who has a **Calendar Link**: a secret address that shows a person's schedule in their calendar app (see [My schedule and your calendar](17-your-settings.md#my-schedule-and-your-calendar)). Each line shows the person's name, when they made it, and when a calendar last fetched it. The address itself is never shown. The bin icon revokes the link at once, and it then answers "not found". Its person can make a new one. A Calendar Link also ends when its person leaves the Workspace.

## Feeds

**Workspace → Feeds** is for Owners and Admins only. Others see a note to ask an Owner or Admin. The demo has no Feeds.

A **Feed** brings in values from another system, such as a CRM or a data warehouse. It runs outside Ziffr, with a **Feed Key** that can only record values for the Metrics that take the Feed as a Submitter, never read them. It belongs to the Workspace and keeps working when the person who set it up leaves. See [Connecting Ziffr](04-connecting.md#feeds-numbers-from-other-systems) for how Feeds work.

### Making a Feed

Under **New Feed**, type a name, ideally the system it brings values from, such as "HubSpot", and choose **Create Feed**. Then choose the Feed as a Submitter on each Metric's **Description** tab.

### Each Feed

| What you see | What it means |
| --- | --- |
| The name | Click it to rename the Feed, then **Save** or **Cancel** |
| **last call** | When the Feed last called Ziffr with any of its keys, or "no calls yet" |
| **last 24 hours** | How many values it recorded and, in red, how many were refused |
| **Submits to** | The Metrics that take this Feed as a Submitter, or a reminder that it submits to none yet |
| The bin icon | Deletes the Feed after asking. Its keys stop at once; its values stay, with its name. |

### Feed Keys

Each Feed lists its keys with name, the start of the key, and the day it ends or "revoked". **Recent calls** opens its Access Log; the bin icon revokes it.

To make a key, type a **Key name** (such as "Nightly run"; if you leave it empty, Ziffr names it after the Feed), pick **Until** (at most a year ahead) and choose **Create Feed Key**. The secret is shown once. Copy it and give it to whoever runs the Feed.

Only Owners and Admins see Feed Keys and their Access Logs.

## Webhooks

**Workspace → Webhooks** is for Owners and Admins only. Others see a note to ask an Owner or Admin. The demo has no Webhooks. A trial may add Webhooks within smaller limits, which are Trial Limits (by default 2 Webhooks and 200 sends a day; the Try it guide shows the number in force, and offers none where trials may have no Webhooks), and only to public addresses (the private hosts an operator allows for other Workspaces never apply to a trial). Whoever runs this Ziffr can switch Webhooks off for trials (Installation settings, Trials); then a trial cannot add one and those it has send nothing.

In the app this list is headed **Workspace Webhooks**. A **Webhook** is an address outside Ziffr that gets a signed message when something happens here, such as a task given or done. A program at that address, such as n8n, passes it on to another system. It belongs to the Workspace and keeps working when the person who set it up leaves. A Workspace can have five Webhooks and they send at most 10,000 messages a day, unless the person who runs this Ziffr has set other numbers under **Sending limits** in the [Installation settings](18-installation-settings.md); the page shows the numbers in force. Lowering them never removes a Webhook that exists.

Messages leave Ziffr in **clear text over TLS**. Workspace Keys seal data in the database, not on its way out, and the receiving system keeps what it gets as it sees fit. This is not end-to-end encryption, and the page says so above the list. A message holds only what everyone in the Workspace may see; other things reach the Webhook with their words left out.

### Adding a Webhook

Type a **name**, ideally the system it feeds, such as "Microsoft To Do", and the **address**, which must start with `https://` and may not hold a user name, a password or a `#`. Tick the **events** it gets, then choose **Add Webhook**. Ziffr refuses an address inside its own network.

The **secret** appears once, in a box above the list. Copy it before you choose **I have copied it**: Ziffr cannot show it again. The receiver uses it to check each message's signature.

### Each Webhook

| What you see | What it means |
| --- | --- |
| The name and the address | The address is shown as its start only, since many tools put a secret in its path |
| **Gets** | The events it receives. **Name and events** changes them. |
| **Send test event** | Sends a `ping` with nothing of the Workspace in it, at most once a minute |
| **Replace secret** | Makes a new secret, shown once. The old one keeps signing for 24 hours, so the receiver can switch without a gap. |
| **Switch off** / **Switch on** | A switched-off Webhook gets nothing. Switching on again resends nothing. |
| The bin icon | Deletes the Webhook after asking |

### Alerts to a Webhook

The event **A Tell step fires** (`alert.fired`) is sent only when a Workflow's **Tell** step names the Webhook (see [Workflows](11-workflows.md)), once per crossing. The message holds the Metric, its period, the value and target as the Alert message writes them, the condition that became true and a link, and nothing else. It goes out only for a Metric shared with Everyone, and Ziffr checks that again at the moment of sending, so a Metric made private meanwhile, a value sent back for Approval or a Workflow whose owner is no longer an Owner or Admin sends nothing. A person's own Alerts never reach a Workspace Webhook; they may go to that person's own Personal Webhook. Changing which Webhooks a Tell step names is written into the Audit Log.

A Webhook that fails 20 sends in a row, or has had no success for three days, is switched off by Ziffr, and every Owner gets an email. One whose address answers "gone" (410) is switched off at once.

### The log

Under each Webhook, **Log** lists its sends of the last 14 days: when, the event, what it is about (a task's reference such as ZIF-12, or a Metric's number), the state (waiting, will try again, delivered, failed, not sent), the answer's status and how many tries it took. It holds no message text and no answer. A failed send has **Send again**.

Every change to a Webhook is in the [Audit log](#audit-log), and the other Owners get an email.


### Personal Webhooks

Below the Workspace's own Webhooks, **Workspace → Webhooks** has a second list, **Personal Webhooks**, and the switch **People may add their own Webhooks**. A **Personal Webhook** is an address that one person adds for themselves under **You → Your Webhooks** (see [Signing in and your own settings](17-your-settings.md#your-webhooks)). It hears only what that person may see at the moment it is sent, and it acts as them.

The switch is **off** until an Owner or Admin switches it on, for every Workspace. Switching it off **pauses** every Personal Webhook: nothing is sent to them, what happens in the meantime is not sent later, and each person's page says why. Switching it on again resumes them. Both are in the [Audit log](#audit-log).

The list shows every Personal Webhook of the Workspace: whose it is, its name, the address as its host only (the rest may be a secret, and is the person's), what it hears, whether it is on, and when it last sent. Under each, **Log** shows the statuses and times of its sends, never the messages: what was sent is the person's. **Remove** deletes one after asking; its person is told, naming who removed it, and the Audit log records it. A Personal Webhook also ends when its person leaves the Workspace.
## Usage

**Workspace → Usage** is for Owners and Admins; Members and Guests do not see it, and the demo has none, because it counts nothing. It shows what could be tidied up, as lists with the reason beside each name:

- **Dashboards, decks and Metrics not opened for 90 days.** A Metric counts as opened when its own page was opened or when it is on a dashboard or deck that was. A Metric that only a program reads, such as an assistant, is listed apart as **Only read by a program** and never suggested for archiving. Anything made less than 90 days ago is not listed.
- **Metrics without values:** none ever, or none for 90 days or for the last two periods of the Metric's rhythm, whichever is longer, so a yearly Metric is not stale after three months. Derived Metrics have no values of their own and are not listed; a Metric with only a Projection is listed apart.
- **Submitters without values:** each person, Contact or Feed asked for Metrics who has sent no value for 90 days, with those Metrics and who owns them.
- **Most looked at:** the ten dashboards and ten Metrics opened most in the last 30 days, as numbers.

Ziffr counts how often a dashboard, deck or Metric is opened per day, as a number and never by whom, and only for what you see. In a very small Workspace a count of one or two can still tell who it was. The page says "Counting since …": nothing is called not opened before 90 days of counting, and until then the page says when the lists fill in.

Under the Metrics not opened, **Archive these Metrics?** lists the ones that are safe to archive, all ticked. Left out, with the reason, are Metrics that have a Target or that something still depends on, such as a Derived Metric, a Comparison or an Analysis. Untick any you want to keep, press **Archive**, and confirm. The Metrics are archived all or none, with each recorded in the Audit log, and they can be brought back (see [Metrics](10-metrics.md)). Nothing is ever archived or deleted by itself.

**Metrics that could keep less** lists Metrics with a lot of old values that nobody opened for 90 days: a daily or weekly Metric whose values can be condensed (never a rate, never a Derived Metric), with a Retention neither in force nor waiting and at least a year of values older than two years. The Metrics with the most such values come first, with how many. **Set a Retention** next to one opens the Metric's Retention box with the suggestion filled in (keep two years, then condense days into months or weeks into quarters) and the counts of what it would do already shown. Usage sets nothing by itself: you still turn it on there, after the preview, and it waits its 7 days. Only what you may see is listed, and a Metric that a program reads is left out, as it is for archiving.

### Your Usage as Metrics

If you want these figures as Metrics of their own, with a dashboard, Targets and Alerts, install the **Workspace usage** Pack (**Workspace → Packs → Choose a Pack file…**, `packs/workspace-usage.pack.json`) and use **Set up from this Pack**. A program then sends the figures: make an Access Key with **Read usage figures** and a Feed with a Feed Key, and run the Usage Feed with `--workspace` (see the [Usage guide](../guides/usage.md#your-own-workspaces-figures)). They are ordinary Metrics: the Pack has 18 of them, they count towards the Workspace Limit, and everyone who sees them sees the numbers, so while fewer than three people are in the Workspace the values, views and Submitters without values stay out. They count only what the key's creator sees (a Workspace Role grants no Metric), so a Metric that is private to someone else is not in them.

### The monthly email

Owners (not Admins) get one plain-text email a month about the same lists, in the first days of the month, only when something is unused. It says how many dashboards, decks and Metrics were not opened for 90 days, how many Metrics have no values and how many Submitters have sent none, names at most five of each ("and 3 more") and links to this page. It holds no values, no counts per item and no answers, and it names only what that Owner sees on the page. It is never sent for the demo, for a trial, for a workspace still within its first 90 days of counting, or when nothing is unused, and never twice in a month. Each Owner can switch it off under **Your Deliveries** (one setting for all their workspaces, see [Your settings](17-your-settings.md)) or with the unsubscribe link in the email, which needs no sign-in. Where Ziffr sends no email, nothing is sent. Self-hosters with Docker Compose get it from the clock; others call `POST /api/jobs/usage-digest` daily ([jobs](../guides/jobs.md)).

## Audit log

**Workspace → Audit log** is for Owners and Admins only. It is the **Audit Log**: who changed who may see or do what, and the decisions taken on numbers. Nothing in it can be changed or removed, and events are kept for two years, or for the days the Installation Admin has set (the page says how long). Times are shown in the Workspace's time zone.

On a phone the filter (**Person**, **What happened**, **From**, **To**, **Show**) stacks one field under the other, and the row of Settings pages above it scrolls sideways and fades out at its right edge to say so.

### What is recorded

Role changes and removals, Invitations, requests to join, Domain Joining, Contacts, Shares, Groups, View Links, Access Keys, Feeds and Feed Keys, Webhooks (added, changed, given a new secret, switched on or off, deleted), new dashboards, new, deleted, archived and brought back Metrics, a Metric's Workflow, a Metric's Retention (set or cancelled) and the Workspace's default Retention, Locks, Workflow runs, Approvals (and values counted without one because nobody else could approve them), Self-checks, Corrections, the Workspace's name, time, fiscal year and profile, its Workspace Limit (old and new, and who set it), Slack, Snapshots taken, shown and deleted, exports, sign-ins, and each time an Owner or Admin reads a teammate's Schedule through the API or an assistant (whose, and for which days). When an Access Key (also an assistant's) changes a Metric's name, description, unit, format, period or Submission Rule, the event names the key and the fields, never the new words.

Each event names the person, what happened, what it was about (as it was named then), the time and a few details, such as the old and new role. It never holds a value or a message. A Metric, dashboard or deck you may not see appears without its name, as "a Metric you do not see".

The demo keeps no Audit Log.

### Filters

| Option | What it does |
| --- | --- |
| **Person** | Only what one person did, or **Everyone** |
| **What happened** | One kind of event, or a whole group such as "All shares", or **Everything** |
| **From** and **To** | Only events between these days |
| **Show** | Applies the filter |
| **Clear** | Removes it |

Click a person's name in the list to see only their events. Click what an event was about to see only events about that one thing; **Show all** goes back. A filtered view is a link you can keep. **Older events** shows the next page.

### Download CSV

**Download CSV** saves the events of the current filter as a spreadsheet file, at most 50,000 at a time; pick dates for more. Each download is itself recorded in the Audit Log, and a Workspace can download it at most ten times an hour.
