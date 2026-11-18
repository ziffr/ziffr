<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/settings/workspace/**, apps/web/src/app/settings/keys/**, apps/web/src/app/settings/feeds/**, apps/web/src/app/settings/page.tsx, apps/web/src/app/settings/layout.tsx, apps/web/src/app/team/**, apps/web/src/app/connectors/**, apps/web/src/app/try/**, apps/web/src/app/sources/**, apps/web/src/app/audit/**, apps/web/src/app/welcome/**, apps/web/src/app/invite/**, apps/web/src/components/settings-nav.tsx, apps/web/src/lib/settings-links.ts -->
# Workspace settings

A **Workspace** is your team's own space in Ziffr. This chapter goes through its pages one by one: how a Workspace starts, how people join it, and every page in the **Workspace** menu of the top bar.

Everyone in the Workspace opens these pages, but what each person may change depends on their **Workspace Role**:

| Role | On these pages |
| --- | --- |
| **Owner** | Changes everything, including who else is an Owner and Domain Joining |
| **Admin** | Changes almost everything, but cannot make or remove Owners, change an Owner's role, or switch Domain Joining |
| **Member** | Reads most pages, sets their own Away dates and Delivery Preferences, and makes their own Access Keys |
| **Guest** | The same as a Member, but their Access Keys cannot create anything |

A Workspace can have several Owners, and it always keeps at least one.

## The Workspace menu

Choose **Workspace** in the top bar to open the menu. It holds:

| Page | Who sees it in the menu | Covered |
| --- | --- | --- |
| **General** | Everyone | Below |
| **Members and Groups** | Everyone | Below |
| **Connectors** | Everyone | Below |
| **Workflows** | Everyone | In [Workflows](11-workflows.md) |
| **Sources** | Everyone | Below |
| **Access Keys** | Everyone | Below |
| **Feeds** | Owners and Admins | Below |
| **Activity** | Everyone | [Actions and Activity](15-actions.md#the-activity-page) |
| **Audit log** | Owners and Admins | Below |

General, Access Keys and Feeds open inside the settings area. It has a side list with two parts: **You** (your **Profile** and your **Deliveries**, see [Signing in and your own settings](17-your-settings.md)) and **Workspace**, the same pages as the menu. On a phone the side list becomes one row that you scroll sideways.

## Starting a Workspace

After you sign in for the first time and belong to no Workspace yet, Ziffr opens **Start a workspace**.

- Type the **Name of the workspace**, such as your name, your team or your company, and choose **Create workspace**. You become its Owner, and Ziffr opens it.
- If a colleague already uses Ziffr, it is better to ask them to invite you, so you join their Workspace instead of starting a second one.

You can start another Workspace at any time from the menu under your name in the top bar, with **New workspace**. Everything in one Workspace stays in it; nothing is shared between Workspaces.

### On a Ziffr that offers trials

Some Ziffrs, such as a public demo site, offer **Trial Workspaces** instead. The sign-in page then shows two choices side by side: **Try it for real** (a Trial Workspace of your own, with what works in it and its limits) and **Look around** (the shared demo). Where the Ziffr has set it up, a short check against bots by Cloudflare sits above **Send me a sign-in link**; the button works once it has passed. After signing in, **Start your trial** makes one Trial Workspace for you alone. It starts with made-up Metrics, a dashboard and a Workflow that asks you; nobody else can be invited, nothing is sent to anyone but you, and it is deleted after the number of days the page names.

A new trial opens on **Try it**: one card per way values and messages travel (email, replies by email, Slack, Telegram, the web form, the API, AI assistants, Feeds, WhatsApp, the ticket system). Each says whether it is **Real**, **Simulated** or **Off** on this Ziffr and why, and, for the real ones, how to try it in a sentence with a link. A card is ticked once a value really arrived that way; the made-up starting values do not count. Below the cards, **What a trial never does** lists what to not wait for.

While the trial runs, a line under the top bar says how many days it has left, with **Try it** and **Download your values** (a CSV file of every Metric's values, written in the Workspace's Number Style without group marks; when the decimal mark is a comma, the fields are separated by ";" so a spreadsheet set to that style opens it right away). The day before it ends, Ziffr reminds you once. When it ends, Ziffr shows **This trial has ended** instead of the app: nothing is sent or taken any more and its keys stop working, but you can still download your values. A week later the trial is deleted with everything in it, and your account with it. **End my trial** on the Try it page, or **Delete it now** on the ended screen, deletes it at once after you confirm.

### Asking to join

If your colleagues' Workspace has **Domain Joining** switched on, and you signed in with a proven address at the same company domain, the page shows **Your colleagues already use Ziffr** above the form. It lists each such Workspace with an **Ask to join** button.

After you ask, the line says "Asked; an owner or admin decides." An Owner or Admin sees your name and address on **Members and Groups** and lets you in or declines. If they let you in, you join as a Member.

Addresses at public mail providers, such as Gmail or Outlook, never count as a company domain.

## Accepting an Invitation

An **Invitation** reaches you as an email or as a link someone sends you. Opening it asks you to sign in first, then shows **Join** followed by the Workspace's name and the role you are invited with, such as "You are invited as Member".

- Choose **Join**. You become part of the Workspace with that role, and Ziffr opens it.
- An Invitation sent to an email address works only for that address. If you are signed in with another one, the page says so: sign out and sign in with the invited address.
- An Invitation works once. If it has ended, was used already or was revoked, the page says "This invitation does not work any more". Ask whoever invited you for a new one.

If you were a **Contact** before, accepting the Invitation keeps your history: the values you sent in stay under your name.

## General

**Workspace → General** holds the Workspace's name, its time, its fiscal year, its Number Style, its Answer Languages and its Workspace Profile. Owners and Admins change them. Everyone else sees them, with the note "Only Owners and Admins change these."

### Name

The **Workspace name** is what everyone sees in the top bar and in Invitations. Type a new one (up to 80 characters) and choose **Save**.

### Workspace time

Ziffr counts days, working days and Due Dates in the Workspace's own time.

| Option | What it does |
| --- | --- |
| **Time zone** | Which day it is for this team. A value that is due "on the 3rd working day" is due by that day here. |
| **Workflows run at** | The hour of the morning, in that time zone, at which Workflows ask for values, remind and escalate. |

Choose **Save** after changing either. Members and Guests see a single line, such as "Europe/Berlin, Workflows run at 07:00".

### Fiscal year

**Year starts in** sets the month the Workspace's **Fiscal Year** begins. It decides where quarters, half-years and years start everywhere in Ziffr: for quarterly and yearly Metrics, their Prompts and Due Dates, in Comparisons such as QoQ and HoH, in a widget's **Show by**, and in Snapshots of a quarter, half-year or year. Programs read it through the API (`GET /api/v1/workspace`). It is January unless an Owner or Admin picks another month.

With January, quarters and years have their calendar names: "Q3 2026", "H2 2026", "2026". With any other month, a year is named by both calendar years it spans, so it cannot be mistaken for a calendar year: a year that starts in April 2026 is "FY 2026/27", and its first quarter, April to June, is "Q1 FY 2026/27". Months, weeks and days keep their calendar names. Under the list, the page shows what this year and this quarter are called with the month you picked.

Some months may be greyed out. What Ziffr has already kept per quarter, half-year or year, such as the values of a quarterly Metric or a Snapshot of a quarter, stays tied to the months it was kept for. A month that would split those periods cannot be picked, and the page says why. For example, with a Snapshot of Q2 2026, the year can start in January, April, July or October, and the Snapshot is then called by its new name, such as "Q1 FY 2026/27". Comparisons are always worked out afresh, so they follow a change at once.

Choose **Save** after picking a month. The change shows in the Audit Log. Members and Guests see a single line, such as "Year starts in April".

### Number style

**Numbers look like** sets the Workspace's **Number Style**. It is one of four: 1,234.5, 1.234,5, 1 234,5 and 1'234.5. Each choice shows a percentage too, such as "1.234,5 (12,5 %)". The style says which mark groups the digits and which mark is the decimal. Ziffr writes every value in it: on every page, in charts, in replies by Slack, Telegram and email, and in decks. It will also use it to read a number that could mean two things, such as 1.500 sent by Slack or email.

Until an Owner or Admin picks a style, it follows the country in the Workspace Profile. A Workspace in Germany writes 1.234,5, in France 1 234,5 and in Switzerland 1'234.5. Without a country it is 1,234.5. The page says where the style comes from. Once you pick one and choose **Save**, it stays, even if the country changes later. The change shows in the Audit Log. Members and Guests see a single line, such as "Numbers look like 1.234,5 (12,5 %)".

### Answer languages

People often answer a Prompt in a sentence, such as "letzte Woche 2" or "la semaine dernière 2". **Answer languages** says which languages' words Ziffr understands there. Ziffr reads those words as the period, never as the value (see [How Ziffr reads a number you send](04-connecting.md#how-ziffr-reads-a-number-you-send)). Tick the languages your people answer in: English, German, French, Spanish, Italian and Dutch. Ziffr tries only the ticked ones, so a word that means one thing in one language and another elsewhere never gets in the way.

Until an Owner or Admin picks languages, the Workspace reads English plus the languages of the country in its Workspace Profile. That is English and German in Germany, and English, German, French and Italian in Switzerland. Without a country, it is English alone. The country also decides how a date such as 11/12 is read: month first in the United States, day first everywhere else. Once you pick languages and choose **Save**, they stay, even if the country changes later. The change shows in the Audit Log. Members and Guests see a single line, such as "Answers are read in English, German".

A word in a language that is not ticked is simply not understood. The rules still hold: if exactly one number is left, it counts for the Prompt's period. If there are several, Ziffr asks back.

### Attainment

**Attainment is computed** sets how the percentage of target is worked out for every Metric that has no method of its own. **By ratio** divides the value by the target, or the target by the value when lower is better. **By distance** counts the distance to the target in steps of the target's size. They agree for "higher is better" with a target above 0, and differ for "lower is better" and around 0: 5 against a target of at most 10 is 200 % by ratio and 150 % by distance. [Metrics](10-metrics.md#comparisons) explains both.

Every Workspace computes by ratio until an Owner or Admin changes it, as Ziffr did up to version 0.9.0. A Metric can still choose its own method under **Edit details…**. Snapshots and frozen View Links keep the method they were made with, so their numbers do not change. Choose **Save** after picking one. The change shows in the Audit Log. Members and Guests see a single line, such as "Attainment is computed by ratio".

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

### In the demo

In the demo nobody changes these settings; the page says "The demo keeps its settings." The demo has no Workspace time: its date is the pretend date on the Workflows page. Its year starts in January, it writes numbers as 1,234.5, and it computes Attainment by ratio.

## Members and Groups

**Workspace → Members and Groups** shows everyone in the Workspace, their roles, their Groups, their Away dates and the Contacts. The page's title is **Team**. Everyone sees it; only Owners and Admins see the buttons that change people and Groups.

### Members and their roles

The list shows each person with their role. Owners and Admins see a menu next to each person instead:

| Role | What the person may do |
| --- | --- |
| **Owner** | Everything, including billing and making or removing Owners |
| **Admin** | Manages settings, Themes, Groups and members, but not billing, and does not make or remove Owners |
| **Member** | Creates and shares Metrics, dashboards and decks |
| **Guest** | Sees only what is shared with them, answers questions and sends in values; creates nothing |

Pick another role and it changes at once. Only an Owner can make someone an Owner or change an Owner's role. The last Owner cannot step down: make someone else Owner first.

### Removing someone and handing over

Choose **Remove…** next to a person. Ziffr asks **Who takes over?**: pick another person (not a Guest), then choose **Remove**, or **Cancel** to stop.

When you remove someone:

- Everything they own, such as their Metrics, dashboards, decks, Workflows, Themes and saved templates, goes to the person who takes over. Nothing others built on is deleted, and the handover shows in each item's Version history.
- Their Tokens, Stand-in roles, Shares, Group memberships and Access Keys end at once.
- A dashboard that took **Snapshots** by itself stops doing so, so the new owner can choose again.

You cannot remove yourself: ask another Owner or Admin. Only an Owner can remove an Owner. In the demo nobody can be removed.

### Inviting people

Owners and Admins see the invitation form below the list.

| Option | What it does |
| --- | --- |
| **Invite by email** | The address of the person you invite |
| **as** | The role they get: Member, Guest or Admin, and Owner if you are an Owner yourself |
| **who is the Contact** | Shown when the Workspace has Contacts. Pick one if the person you invite is that Contact, so they keep their history. Leave it at **nobody yet** otherwise. |
| **Invite** | Makes the Invitation. If this Ziffr sends email, it emails the link too. |
| **Link for Members** | Makes a link that anyone who has it can use to join as a Member |

After either, the page shows the link so you can send it yourself, for example in a chat.

- An email Invitation works for 14 days, once, and only for that address.
- A link works for 7 days, for anyone who has it, until it ends or you revoke it.

Below the form, open Invitations are listed with their address (or "Link"), their role and the day they end. Where Ziffr sends email, each line also says whether it was emailed, or why not. **Resend** emails it again; an Invitation can be emailed at most three times. The bin icon revokes it.

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

Owners and Admins add a Contact with **Name** and at least one of **Email**, **Slack handle** (such as @cleo) or **Phone**, then **Add contact**. The address or handle must not belong to anyone else in the Workspace. Owners and Admins also see each Contact's details, and the bin icon removes a Contact. Their values stay; their form link stops working and they can no longer send in values.

To give a Contact a login later, invite them by email and pick them under **who is the Contact**.

Contacts cannot be added in the demo.

## Connectors

**Workspace → Connectors** shows how Ziffr reaches people and how their answers come back. Everyone sees it. See [Connecting Ziffr](04-connecting.md) for the bigger picture.

### Slack

The Slack box appears when this Ziffr is set up for Slack (never in the demo).

| Option | Who | What it does |
| --- | --- | --- |
| **Add to Slack** | Owners and Admins | Takes you to Slack to connect one Slack workspace. Back in Ziffr, a line says whether it worked. |
| **Disconnect Slack** | Owners and Admins | After asking, stops all messages there. Who was found on Slack is forgotten. |
| **Link my Slack account** | Everyone | Gives you a short code. Send the Ziffr app on Slack the message "link" and the code within ten minutes. |
| **Forget me on Slack** | Everyone who is linked | Ziffr no longer reaches you on Slack in this Workspace |
| **Get them on Slack again** | Whoever stopped them | Shown if you pressed "Stop these on Slack" under a Prompt or reminder there |

Once Slack is connected, the box says how Slack knows you: by your email address, or because you linked your account. If your Slack address differs from the one you sign in with, link your account.

A Slack workspace can be connected to one Ziffr Workspace only.

### Telegram

The Telegram box appears when this Ziffr has a Telegram bot (never in the demo). It names the bot, such as @acme_ziffr_bot, and says whether Telegram is on in this Workspace. It is off until an Owner or Admin turns it on.

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

This box shows how to connect an AI assistant through the **MCP Server**, filled in with this Ziffr's address. There are two ways:

- **Claude.ai and other assistants on the web:** add a custom connector in the assistant with the address the box shows, ending in `/mcp`, and press Connect. Ziffr opens: sign in, pick the Workspace, what the assistant may do and until when, and confirm (see [Connecting an assistant](17-your-settings.md#connecting-an-assistant)). This part is shown only when this Ziffr offers it, usually when it is reached over https.
- **Claude Code and Claude Desktop:** make an **Access Key** first (see [Access Keys](#access-keys)) and paste it in place of `zk_...` in the command or settings shown.

Either way the assistant reads the Metrics you may read, records values, starts Metrics and builds dashboards, as far as you allowed. The box is not shown in the demo, which has no Access Keys.

### Connected systems

One card per **Connector**, each with what it can do (receives values, sends reminders, sends questions and tasks, brings replies back, keeps task status in step) and its state. A badge says **Real** (it really goes out), **Simulated** (Ziffr only keeps it in the Outbox) or **Off**, followed by why and, in a **Trial Workspace**, the limit that applies, such as "To you only, at most 50 messages a day":

| Connector | What it does |
| --- | --- |
| **Email** | Plain emails; replying to one answers in Ziffr. When this Ziffr sends email, the card says "Sends real email". Otherwise nothing goes out and Ziffr keeps what it would send in the Outbox. |
| **Slack** | Direct messages from the Ziffr app; answers in the thread come back. Real once Slack is connected. |
| **Telegram** | Messages from Ziffr's bot in Telegram; replying to one answers in Ziffr. Real once the Workspace turned Telegram on, for everyone who connected their own Telegram. |
| **WhatsApp** | Short messages from the Ziffr business number. Not live yet: Ziffr only records what it would send. |
| **Ticket system** | Tasks become tickets; comments come back, and closing a ticket marks the task done. Not live yet: Ziffr only records what it would send. |

If you stopped Prompts and reminders by email, a note at the top offers **Get them by email again**.

### Who gets what, where

A table of **Delivery Preferences**: one row per person and one column each for **Questions**, **Tasks**, **Reminders** (which includes Prompts) and **Replies and updates**.

- The first row, **Team default**, covers everyone who leaves a column open. Only Owners and Admins change it. Without a team default, Ziffr uses email.
- Your own row is marked "you". Change it here or under **Your Deliveries**. Everyone else's row is greyed out.
- Replies about a question or task stay where it started, so a ticket collects its comments. Whoever asks a question can pick another way for that one message.

### Outbox

The **Outbox** lists every **Delivery** you may see, newest first, drawn the way it looks on the other side. Each one shows the Connector, who it went to, when, whether it was answered or closed, and **Open thread** for a question or task.

A Delivery that never left Ziffr is marked **Simulated, not sent**, or with the reason it was kept back, such as "Kept in the Outbox: a trial sends only to its Owner". For email, Slack and Telegram, a small label says whether it really went out: **Waiting to send**, **Sending**, **Emailed**, **Sent on Slack**, **Sent on Telegram** or **Not sent** with the reason, such as "Not connected to Telegram" for someone who has not connected theirs. A Prompt you have not answered yet may offer **Open the form as** you, which opens your form.

You see Deliveries about Threads you may read, and Prompts and notices you sent or received. The personal form link in someone else's Prompt is hidden.

**Run now** (Owners and Admins only, folded away): Ziffr does this by itself every morning. Use it when the schedule did not run, or right after adding people.

- **Ask for missing values now** asks everyone whose value for the current period is missing.
- **Send due reminders now** reminds people of tasks due in the next two days.

### In the demo

The two **Run now** buttons sit in a dashed **Demo controls** box, and anyone may use them. Under each Delivery you can play the recipient: **Answer as** the person, then **Send in** the Connector, or **Close ticket as** the person for a ticket. Answering a Prompt this way records the value. **Try sending a value** on the Email and Slack cards leads to Sources.

## Sources

**Workspace → Sources** shows where values come from. Everyone sees it.

### Form links

Everyone who sends in a Metric has a personal form link for it. The link itself is the permission, so nobody needs to sign in. You see your own links here, one per Metric that takes the web form, and opening one shows the form. If you have none, the page says a Metric gets them when its owner picks the web form as a Source and names who submits.

### The simulator (demo only)

In the demo, a **Demo controls** box shows two pretend inboxes, one for Slack and one for email, both marked "simulated". They go through the same checks as real ones.

- Pick who sends the message, including an unknown sender, type a message such as "closed 2 deals", and send it.
- Under a Prompt from Ziffr, choose **Reply** to answer it as its recipient.
- Each message shows what happened, such as **Recorded**, **Overwritten**, **Added up**, **Kept both**, or why it was rejected: a duplicate, a sender who may not submit this Metric, an unknown sender, no number, an unclear Metric, the wrong Source, or a Derived Metric. When the message holds several numbers, or names a period that is not the Prompt's or not one the Metric counts in, it says **Asked back** and what it asked.

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
| **Create metrics** | It may create Metrics owned by you. Not offered to Guests. |
| **Read dashboards** | It may read the dashboards you may see |
| **Build dashboards** | It may build dashboards as you. Not offered to Guests. |
| **Until** | The last day the key works, through the end of that day in UTC. At most a year ahead. |
| **Create key** | Makes the key |

The secret is shown once: copy it now, it is not shown again. Give it only to the program that needs it.

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

## Feeds

**Workspace → Feeds** is for Owners and Admins only. Others see a note to ask an Owner or Admin. The demo has no Feeds.

A **Feed** brings in values from another system, such as a CRM or a data warehouse. It runs outside Ziffr, with a **Feed Key** that can only record values for the Metrics that take the Feed as a Submitter, never read them. It belongs to the Workspace and keeps working when the person who set it up leaves. See [Connecting Ziffr](04-connecting.md#feeds-numbers-from-other-systems) for how Feeds work.

### Making a Feed

Under **New Feed**, type a name, ideally the system it brings values from, such as "HubSpot", and choose **Create Feed**. Then choose the Feed as a Submitter on each Metric's **Settings** tab.

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

## Audit log

**Workspace → Audit log** is for Owners and Admins only. It is the **Audit Log**: who changed who may see or do what, and the decisions taken on numbers. Nothing in it can be changed or removed, and events are kept for two years. Times are shown in the Workspace's time zone.

### What is recorded

Role changes and removals, Invitations, requests to join, Domain Joining, Contacts, Shares, Groups, View Links, Access Keys, Feeds and Feed Keys, new dashboards, new and deleted Metrics, a Metric's Workflow, Locks, Workflow runs, Approvals, Corrections, the Workspace's name, time, fiscal year and profile, Slack, Snapshots taken, shown and deleted, exports and sign-ins.

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
