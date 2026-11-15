<!-- part: Understanding Ziffr -->
# How Ziffr is built

You do not need to know how Ziffr works inside to use it. This chapter is for the people who decide whether to trust it with the company's numbers, and for anyone curious.

## The big picture

Think of Ziffr as a house with one front desk. People and programs come in through different doors, but every one of them is sent to the same front desk, which checks who they are and what they may see or change. Behind the desk sits one archive where all numbers are kept.

```
   People in the browser    Email and Slack    Programs and Feeds    AI assistants
            \                     |                    |                  /
             \                    |                    |                 /
              +-------------------+--------------------+----------------+
                                  |
                        One set of rules (the core)
                 who is asking, which Workspace, what they may do
                                  |
                       One store for all numbers
                 Metrics, values, history, dashboards, decks
```

- **The doors.** The web app you use in the browser; email and Slack, where people answer Prompts; the API, through which programs and Feeds send values; and the MCP Server, which lets an AI assistant read numbers and send values.
- **The front desk.** One set of rules decides, for every request, who is asking, in which Workspace, and whether they may see or do it. There is no back door: the web app, the API and the AI assistant all go through the same checks, so a number hidden from you in the browser is also hidden from your programs.
- **The archive.** All numbers, their history and everything built on them live in one database. Each Workspace is kept apart from every other one; nothing is shared across Workspaces.

## Workspaces keep teams apart

A **Workspace** is one team's own space: its people, Metrics, dashboards, decks, Themes and Connectors. A person can belong to several Workspaces, for example a bookkeeper who works for three companies, and switches between them. What happens in one Workspace never shows up in another.

## What runs on its own

Some things happen without anyone clicking:

- **Every morning**, in the Workspace's time zone, Ziffr works through the Workflows: who needs to be asked, reminded or escalated today.
- **Every few minutes**, it sends waiting emails and tries again when one could not be sent.
- **When a period is complete**, dashboards that are set up for it take their Snapshot.

Each message Ziffr sends is a **Delivery**, and every Delivery is listed in the **Outbox**, so you can always check what was sent to whom.

## Programs only get what they need

Programs never use a person's password. They use an **Access Key**, made by a person for one purpose (for example, only sending values), valid for one Workspace and ending on a set date. A Feed uses a **Feed Key**, which can only record values for the Feed's own Metrics and cannot even read those values back. Every call a program makes is written into the **Access Log**.

When Ziffr sends something outside, such as a message on Slack or a dashboard behind a View Link, it sends only what is needed for that purpose.

## Where Ziffr runs

Ziffr can be run for you or on your own servers. Either way, Ziffr itself only talks to its database and to the mail and Slack services you set up. A Feed that reads your CRM or your data warehouse runs on your side, with your credentials; Ziffr never holds the passwords to your other systems.

The people who run Ziffr on their own servers find the technical details in the guide "Running Ziffr yourself".
