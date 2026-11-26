# 0063 Practice Workspace: try everything on made-up numbers, reaching nobody but yourself

**Status:** done. **Tracking issue:** #1264 (label `tracking`); tickets #1265 (nothing leaves it), #1266 (make one, Start over), #1271 (reach yourself, links and Webhooks) and #1267 (made-up numbers). **Approved** by the owner on 2026-11-26 (a private test space with demo data; made-up figures after a Pack's Set up; later the same day: what may reach the Admin themself and the addresses they type). The decisions at the end were taken while writing it and may be changed.

## Problem Statement

Whoever runs an Installation has no place to try things. The demo is read-only there, and rightly so: it is shared, and its guard stays. A Trial Workspace exists only on hosted Ziffr and starts empty. Trying a Pack, a Workflow with approvals or a deck in a real Workspace puts made-up numbers beside real ones and can send real messages to real people.

## Solution

An Installation Admin can make a **Practice Workspace**: a private, ordinary Workspace of their own that starts as a copy of the demo's company, its numbers and its made-up people. Everything works in it, and one rule holds: **nothing reaches anyone but you or an address you entered yourself.** **Start over** deletes it and makes a fresh one.

## The name

"Test workspace" and "sandbox" are words GLOSSARY.md lists to avoid for a Trial Workspace, and "sandbox" for Demo Mode too: both already mean something else here, and "Test Message" and "Test Metric" are other things again. "Practice Workspace" says what it is for in a plain word nothing else uses, and sets it apart from the demo (look around) and a trial (try Ziffr with your own numbers).

## User Stories

1. As an Installation Admin, I make a Practice Workspace with one button and find a company in it that has history, dashboards, a deck, Workflows, Themes and people.
2. As them, I install, set up, update and remove Packs there, run Workflows and approvals, take Snapshots and open decks, as anywhere.
3. As them, after a Pack's Set up, I fill its new Metrics with made-up numbers, so its dashboards and slides show something, year against year included.
4. As them, I read in the Outbox what would have been sent, and I am certain that nobody else got it.
7. As them, I may have the messages meant for me really arrive: by email, Slack or Telegram, each only after I switch it on.
8. As them, I make View Links, a Calendar Link and Webhooks to my own addresses, as anywhere.
5. As them, I start over and have a clean one.
6. As anyone else, I never see it, unless you give me a link.

## Implementation Decisions

### Who and where

- Offered to an Installation Admin, signed in, one Practice Workspace each. They are its only Owner and its only real person.
- Not offered on a demo-only Installation (ADR 0016), nor from inside a Trial Workspace. The demo Workspace and its guard are not changed: the copy only reads the demo.
- The database records it as `workspaces.practice_for`, the person it was made for. It is set when the row is inserted and can never be added, changed or removed afterwards.

### Nothing reaches anyone but you or an address you entered yourself

Two layers, both failing closed (a check that cannot be made sends nothing): the core asks where it sends, and the database refuses the same. The first ticket refuses every way out; ticket #1271 then opens exactly the cases below, each named in one place in the core (`practice.ts`) and one in the database (`practice_allows`).

| Way out | What a Practice Workspace may do |
| --- | --- |
| Email Deliveries (Prompts, reminders, questions, notices, Alerts, Test Messages, Screen Links) | To the Admin's own verified sign-in address, once switched on. Everyone else's stay in the Outbox |
| Slack, Telegram | To the Admin's own linked account, once that way is switched on. Nobody else is looked up, messaged or answered |
| Webhooks (Workspace and Personal) | To addresses the Admin typed there, under the usual rules for private addresses. None is ever copied, by the copy of the demo or by Start over, and a Personal Webhook made in another Workspace hears nothing of this one |
| View Links, Calendar Links | As anywhere, with their normal rules and expiry; their pages say that anyone with the link reads it |
| Invitations, invite links, domain joining, join requests, Contacts | Never: nobody else becomes a member or a Contact |
| Other email (a Share Proposal's, the answer to an email, a confirmation to a Contact) | Never, whatever address was typed |
| A made-up person's address | `.invalid`: never handed to a mail server, and it cannot sign in |
| Marketplace | The reads a person triggers. No report link |
| Ziffr Cloud and billing | It is no Workspace to Ziffr Cloud: no Size, no subscription |
| Feedback to the Ziffr team | Never |
| Usage digest | Never made |

**Switching a way on** (email, Slack, Telegram) is off by default, per way, and off again after Start over. Email takes the address the sign-in service holds as verified at that moment; a chat way takes the account the Admin links themself. At the moment of sending, the address or account the message would really go to is compared with it, never only the person: another address or account (also the Admin's own new one), another Installation Admin, a person who is no Installation Admin any more, a message queued before the way was switched off, and a "to" that is not exactly one address all send nothing. A message held earlier is never sent later. Messages already sent are not edited afterwards, and emails carry no reply address.

The database holds the sends too: a send is counted only for a Delivery to the person themself and to the recorded address or chat, and a stored chat connection can only be ended once its way is off.

A test lists every file that calls a way out and fails when a new one appears, until someone says how it keeps this rule.

What would have been sent stays in the Outbox with its words, as Deliveries that were never queued.

Values come in as anywhere: Feeds, Access Keys, connected assistants and form links work. Anyone you give a form link can send a value there, and sees what the form shows: the Metric and the person asked.

### Its content

- **A copy of the demo, made as a Workspace Export of the demo written into the new Workspace by the import** (spec 0040). Both are maintained and tested with every new feature, so the copy keeps working when the demo's seed changes. The demo is only read.
- The Admin takes the place of the demo's Owner (owns, submits and sees what she does). The other demo people become **made-up people**: members with their names, roles, Groups, Shares, Metrics and Submitter roles, an address ending in `.invalid` and no way to sign in. They can be put into Pack Positions, hold Shares, be asked, and be named as Approvers.
- The copy reads the whole demo, also what its Owner is not shared. Dashboards, decks and Workflows become the Admin's, so that everything can be tried; Metrics keep their demo owners (made-up people).
- What the export file does not carry is added afterwards where the app shows it often: Shares as the demo has them (Everyone's and Editors' too), Stand-ins, who approves and who is told in Workflows, dashboard introductions, the default Theme, Snapshots, and the day's messages in the Outbox. Images in Themes and decks, Threads, Findings and pins stay behind.
- **Annual progress works:** after the copy, and only in the copy (the demo's seed is not changed), Ziffr fills with made-up values what is missing from the start of the previous fiscal year (today the daily Metric lacks its first months), and gives a Target Series for the previous and the whole current fiscal year to every Metric where a target makes sense and that has only a Target Range or none. A value or a target that exists is never overwritten.
- **Dates** are the demo's own: the demo is seeded afresh daily, so its history reaches up to today. Where an Installation has switched the demo off, nothing refreshes it, and the copy ends where the demo's last seed ended; the page says that date.
- Values arrive as imports, like in any import.

### Made-up numbers after a Pack's Set up

- An action on the Set up's result fills the Metrics it made, in a Practice Workspace only.
- **Span:** every period from the start of the previous fiscal year up to the running period, and never fewer than 13 months back; quarterly Metrics at least 8 quarters, yearly ones at least 3 years. So year on year, year to date against last year to the same date, the quarter to date, the period before and Heads-ups all have something to show.
- **Targets:** a Metric where higher or lower is better gets a Target Series for the previous fiscal year and the whole current one, periods still to come included.
- Believable: a trend, a season, noise, in the Metric's unit and period, never below zero where that makes no sense. Metrics with a Breakdown get none. Derived Metrics and Totals compute. A period that has a value, or a target, is never overwritten.
- Written in batches as imports, a few Metrics per step, with progress shown.

### Everything else

- **Workspace Limit:** none. It is never over a limit and never blocks the Admin's own one Workspace on the default limit.
- **Usage:** left out of the Installation's usage totals. Its own Usage page works.
- **Usage digest and unused-Workspace deletion:** never. **Retention:** never runs in it, so made-up history is not condensed.
- **Workspace Export:** allowed; the file holds only made-up people and the Admin. Importing it elsewhere makes an ordinary Workspace whose made-up people cannot be mailed.
- **Start over:** one database step that locks the row, checks it is a Practice Workspace made for this person, destroys its Workspace Key, deletes it and the person rows made for it. It can delete nothing else. Then a fresh one is made. The page asks the person to confirm.
- **Not listed** among the Workspaces on the Installation Settings page.

## Testing Decisions

Database tests for each trigger (a Delivery cannot be queued; each refused table; the flag cannot change; a made-up person cannot sign in or join another Workspace), core tests for each sender with a fake transport that must receive nothing, each case of the switched-on ways, the list of ways out, and tests that Start over refuses every other Workspace, the demo included. The made-up numbers are a pure function with unit tests.

## Tickets

1. #1265 The Practice Workspace and its send barrier (database and core).
2. #1266 Make one from the demo, and Start over (core and screens). Needs #1265.
3. #1271 Reach yourself, View Links, Calendar Links and Webhooks. Needs #1266.
4. #1267 Made-up numbers after a Pack's Set up, and the same for what the copy of the demo lacks. Needs #1266.

## Out of Scope

Answering a message as a made-up person (as the demo's simulated channels do); several Practice Workspaces per person; one for people who are not Installation Admins.

## Decisions taken while writing (the owner may change them)

1. The name "Practice Workspace".
2. Chat and email to yourself are bound to the address or account you switched them on for; a new one means switching on again.
3. Emails from it carry no reply address, and sent chat messages are not edited afterwards.
4. Feedback to the Ziffr team and the Marketplace report link stay off.
5. One per Installation Admin; it stays theirs if they stop being one, but Start over then needs the role again.
6. There is no "delete and make none": Start over is the only way to remove it.
