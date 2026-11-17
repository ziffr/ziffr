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
| **The API** | Your own programs and automations, such as an n8n or Zapier flow | Nothing: the program sends the numbers |
| **An AI assistant** | People who already work with an assistant such as Claude | Asks the assistant to look up or send in a number |

Every value goes through the same checks, whichever way it came: the Submission Rule, Approval of Unusual Values and Locks.

### The personal form link

Every Submitter has a personal link for each Metric they send in. It needs no password, which is why Contacts such as an outside bookkeeper can use it. The link only lets them send values for their own Metrics; it shows them nothing else.

### Feeds: numbers from other systems

A **Feed** is a small program that reads a number from another system and sends it to Ziffr, for example the value of open deals from HubSpot every night. A Feed belongs to the Workspace, not to a person, so it keeps working when the colleague who set it up leaves. Its values appear under its own name, such as "HubSpot".

Only Owners and Admins create Feeds. Your technical colleague, or whoever looks after your systems, runs the Feed where you like: on a server, in a scheduled job or in an automation tool. Ziffr comes with two ready-made kinds: one for people who write a little code, and one that only needs a database query per Metric, which suits a data warehouse.

When a Feed is connected for the first time, it can bring in the history of past periods, such as the last two years. These values are an **Import**: they are marked as imported and are not checked as Unusual Values, so a first import does not flood anyone with Approvals.

A Feed is never sent Prompts. If a Feed's value is missing after the Due Date, the Workflow tells the Metric Owner, so a broken Feed gets noticed.

### An AI assistant

The **MCP Server** lets an AI assistant on your own computer read the Metrics you may see and send in values, using an Access Key you create. The assistant sees no more than the key allows.

## How Ziffr reaches people

A **Connector** links Ziffr to an outside service people already use. Through it, Ziffr sends Prompts, reminders, questions, tasks and replies, and brings the answers back.

- **Email** sends real messages. Replies record the number, answer in a Thread or propose a Correction.
- **Slack** is connected once per Workspace by an Owner or Admin. Ziffr then sends direct messages; people answer in the message's thread or press a button to approve an Unusual Value.
- **WhatsApp** and **ticket systems** are not live yet. Their Connectors are there so you can try how it would work: the Connectors page lets you play the other side.

Each person sets a **Delivery Preference** under **Your Deliveries**: where they want to receive questions, tasks, reminders and replies. The team sets a default, and whoever sends a question can choose another channel for that one message.

Everything Ziffr sends shows up in the **Outbox**, newest first, with what it said, where it went and, for email and Slack, whether it was really sent.

## How numbers go out

- **Dashboards and decks** are shared inside the team with Shares.
- **View Links** show one dashboard or deck to someone outside the team, such as an investor or your advisory board, without a login. A View Link ends on a set date, can be revoked, and shows either live numbers or the numbers as they were when it was made.
- **Decks** are exported as PowerPoint or PDF for meetings and email.
- **Programs** can read Metrics and dashboards through the API with an Access Key, limited to what the key's person may see.
