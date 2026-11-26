<!-- part: Understanding Ziffr -->
# Connecting Ziffr to people and systems

Ziffr is only as good as the numbers that reach it. This chapter shows the ways numbers come in, the ways Ziffr reaches people, and the ways numbers go back out.

## How numbers come in

Each Metric says which **Sources** it accepts. You can turn on several for the same Metric.

| Way in | Good for | What the person does |
| --- | --- | --- |
| **Personal form link** | Anyone, including Contacts without a login | Opens the link from a Prompt or a bookmark and types the number |
| **Email** | People who live in their inbox | Replies to the Prompt email with the number |
| **Slack** | Teams that work in Slack | Replies in the thread of Ziffr's direct message |
| **Telegram** | People who live on their phone, such as shop owners, field teams and freelancers | Replies to the message from Ziffr's bot with the number, after connecting their Telegram once |
| **A Feed** | Numbers that already sit in another system, such as a CRM, a shop or a data warehouse | Nothing: the Feed sends the numbers on a schedule |
| **The API** | Your own programs and automations, such as an n8n or Zapier flow | Nothing: the program sends the numbers. **Workspace → Connectors → Send values** has the call to copy for each of your Metrics |
| **An AI assistant** | People who already work with an assistant such as Claude | Asks the assistant to look up or send in a number |

Every value goes through the same checks, whichever way it came: the Submission Rule, Approval of Unusual Values and Locks.

### How Ziffr reads a number you send

Ziffr reads every number the same way, whichever way it came in: a reply, the form link, a pasted Breakdown or a Target Series.

- **Either way of writing works.** `1,5` and `1.5` are both one and a half; `1.234,5`, `1,234.5`, `1 234,5` and `1'234.5` are all the same number. You may add a sign (`-5`, `+5`) or `k` and `M` (`2,5k` is 2,500).
- **One case depends on your Workspace.** A single dot or comma followed by exactly three digits, such as `1.500`, could be either. Ziffr reads it the way your Workspace writes numbers (its Number Style, see [Workspace settings](16-workspace-settings.md)): fifteen hundred where you write `1.234,5`, one and a half where you write `1,234.5`.

You can answer in a sentence. Ziffr first takes out the words that name a period and reads them as the period, never as the value: "today", "yesterday", "last week", "this month", "October", "Q3", "week 46", "KW 46", "2026", "FY 2026/27", and dates such as "12.11.", "12/11" or "2026-11-12". Ziffr understands the words of your Workspace's Answer Languages: English, German, French, Spanish, Italian or Dutch ([Workspace settings](16-workspace-settings.md#answer-languages)). Then exactly one number must be left, and that is the value.

| You write | Ziffr records |
| --- | --- |
| `we had 2 signups last week` | 2, for last week |
| `KW 46: 2` | 2, for week 46 |
| `Q3 revenue 4500` | 4,500, for Q3, if the Metric counts quarters |
| `October: 12,5` | 12.5, for October, if the Metric counts months |
| `yesterday 340 pc` | 340, for the period yesterday falls in |

Ziffr records nothing and asks back when it cannot be sure:

- **Several numbers**, such as "2 signups and 1 cancellation". Send the value on its own.
- **A different period than the Prompt asked for**, such as "this week 3" in reply to last week's Prompt. Reply with the value alone for the Prompt's period, or send the other one as a new message.
- **A period the Metric does not count in**, such as "Q3" for a monthly Metric, or one that has not begun yet.

Without a Prompt, for example in a new message, a period you name is used instead of the current one. The personal form link is narrower: it records the current period or one you were asked for, and while it lists periods under **For**, what you type may not name a different one (see [While a request waits](10-metrics.md#while-a-request-waits)). Ziffr's reply always names the value and the period as it read them, such as "2 recorded for Sign-ups, week of 9 Nov 2026", so you see a misreading at once.

### The personal form link

Every Submitter has a personal link for each Metric they send in. It needs no password, which is why Contacts such as an outside bookkeeper can use it. The link only lets them send values for their own Metrics: for the current period, or for an earlier one Ziffr asked them for.

If Ziffr cannot read what you typed, it says so under the field, with an example such as "Type a number, such as 88 or 1,250." What you typed stays in the field so you can correct it, and the cursor goes back to it.

### Feeds: numbers from other systems

A **Feed** is a small program that reads a number from another system and sends it to Ziffr, for example the value of open deals from HubSpot every night. A Feed belongs to the Workspace, not to a person, so it keeps working when the colleague who set it up leaves. Its values appear under its own name, such as "HubSpot".

Only Owners and Admins create Feeds. Your technical colleague, or whoever looks after your systems, runs the Feed where you like: on a server, in a scheduled job or in an automation tool. Ziffr comes with two ready-made kinds: one for people who write a little code, and one that only needs a database query per Metric, which suits a data warehouse.

When a Feed is connected for the first time, it can bring in the history of past periods, such as the last two years. These values are an **Import**: they are marked as imported and are not checked as Unusual Values, so a first import does not flood anyone with Approvals.

A Feed is never sent Prompts. If a Feed's value is missing after the Due Date, the Workflow tells the Metric Owner, so a broken Feed gets noticed.

### An AI assistant

The **MCP Server** lets an AI assistant read the Metrics you may see, send in values and build dashboards. An assistant on the internet, such as Claude.ai, connects by your Ziffr's address and you approve it ([Connecting an assistant](17-your-settings.md#connecting-an-assistant)); one on your own computer uses an Access Key you create. The assistant sees no more than you allow. What to ask it, and the ready-made requests it offers, are in [Working with an assistant](17-your-settings.md#working-with-an-assistant).

## How Ziffr reaches people

A **Connector** links Ziffr to an outside service people already use. Through it, Ziffr sends Prompts, reminders, questions, tasks and replies, and brings the answers back.

- **Email** sends real messages in the look of your team default Theme: its logo (a PNG or JPEG; otherwise the Workspace's name), accent colour and footer, readable in light and dark mode, with the same words as plain text beside it. Links are buttons or a few words, not long addresses. Replies record the number, answer in a Thread or propose a Correction. See [Decks and Themes](14-decks-and-themes.md#outside-the-app).
- **Slack** is connected once per Workspace by an Owner or Admin. Ziffr then sends direct messages with a side bar in the Theme's accent colour; people answer in the message's thread or press a button to approve an Unusual Value. Slack's bot name and icon are set with the Slack app. Telegram messages keep the same words and buttons; the bot's name and picture are set in BotFather.
- **WhatsApp** and **ticket systems** are not live yet. Their Connectors are there so you can try how it would work: the Connectors page lets you play the other side.

Each person sets a **Delivery Preference** under **Your Deliveries**: where they want to receive questions, tasks, reminders and replies. The team sets a default, and whoever sends a question can choose another channel for that one message.

Everything Ziffr sends shows up in the **Outbox**, newest first, with what it said, where it went and, for email and Slack, whether it was really sent.

### Send yourself a test message

To check how Ziffr reaches you, send yourself a **Test Message** by email, Slack or Telegram. It goes only to you: to the address you signed in with, or to the Slack and Telegram account you linked. The words are always the same (the Workspace's name and the way you tested), nothing in it can be answered, and Quiet Hours do not hold it. It shows in the Outbox marked **Test**.

- You can send up to 3 test messages by one way in 10 minutes, and up to 20 a day in all (5 a day in a trial). Over a limit, Ziffr says which one and how long until you can try again.
- When a way is not set up, the test stays in the Outbox and says what is missing: no mail server, no Slack app or Telegram bot on this Ziffr (whoever runs it adds one on the Installation settings page), Slack or Telegram not turned on in this Workspace, or your own account not linked yet.
- Test messages work in a trial, where they count towards the messages a day of the Trial Limits, with a smaller cap of 5 a day for each person so they cannot use up the trial's messages. They are not available in the demo, to Guests or through Access Keys.
- Owners and Admins can see in the Audit Log that someone sent a test, and by which way, never the address.

## How numbers go out

- **Dashboards and decks** are shared inside the team with Shares.
- **View Links** show one dashboard or deck to someone outside the team, such as an investor or your advisory board, without a login. A View Link ends on a set date, can be revoked, and shows either live numbers or the numbers as they were when it was made.
- **Decks** are exported as PowerPoint or PDF for meetings and email.
- **Programs** can read Metrics and dashboards through the API with an Access Key, limited to what the key's person may see.
