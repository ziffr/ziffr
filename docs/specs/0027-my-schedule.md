# 0027 My schedule: who must do what, when, in an assistant and in a calendar

**Status:** draft. **Tracking issue:** #220 (label `tracking`); tickets carry `spec:0027`.

## Problem Statement

What a person has to do in Ziffr is spread over several places. A value to submit is a Prompt in their inbox, Slack or Telegram, with its Due Date in the text. An Approval waiting for them is a Delivery and a line in a Metric's history. A Task assigned to them, with a due date, is in Actions. An Escalation is a Question in the same list. Nothing answers the plain question "what do I have to do this week, and what did I miss?", and nothing puts those dates where people plan their days: their calendar.

Assistants make the gap visible: a person asks Claude "What do I have to do in Ziffr this week?" and the MCP Server has no tool that knows.

## Solution

One function in the core, **the Schedule** of a person in a Workspace: for each day in a span, the values they must submit by their Due Dates, the Approvals waiting for them, and the Tasks and Questions assigned to them, each upcoming or overdue. Three things read it, and none has rules of its own:

- the MCP tool `my_schedule` and the API endpoint `GET /api/v1/schedule`, for assistants and programs, with an Access Key or an assistant's connection;
- a **Calendar Link**: a secret, revocable address any calendar app subscribes to (Apple Calendar, Google Calendar, Outlook, Thunderbird), which shows the Schedule's dates as all-day events, each linking into Ziffr;
- a small **My schedule** page in the app, where the Calendar Link is made and revoked and the same list is shown.

Everything listed is the person's own: what they are asked for, what is assigned to them, what waits for their Approval. It names only Metrics they may see.

## User Stories

1. As a Member, I want to ask my assistant "What do I have to do in Ziffr this week?" and get the values due, the Approvals waiting for me and my Tasks, by day, so that I can plan without opening Ziffr.
2. As them, I want to see what is overdue first, with how many working days late it is, so that I catch up on what matters.
3. As them, I want my Ziffr dates in my calendar app, updated by themselves, so that the month-end close shows next to my meetings.
4. As them, I want a calendar entry to link to the place in Ziffr where I do it (the form for the value, the Approval, the Task), so that one click takes me there.
5. As them, I want to choose that my calendar shows no Metric names ("Ziffr: 2 values due"), so that I can share my calendar with colleagues or family without showing our numbers' names.
6. As them, I want to revoke my Calendar Link and make a new one, so that a link I shared by mistake stops working at once.
7. As a Stand-in, I want what I am asked for while a colleague is Away to show in my Schedule, marked as standing in, and not in theirs, so that the duty sits with whoever must do it.
8. As a person who leaves a Workspace, I want my Calendar Link for it to stop working, so that nothing of it keeps reaching my calendar.
9. As an Owner, I want to see that a person has a Calendar Link and revoke it, without seeing the link, as with Access Keys.
10. As an Owner or Admin, I want to see a teammate's Schedule (open question 1), so that I can cover for them and see who is behind.

## Implementation Decisions

- **The core function.** `schedule(actor, { from, to, personId? })` returns, for the actor's Workspace, a list of entries and the days they fall on. `from` and `to` are dates; the span is at most 90 days, and `to` may not be more than 366 days ahead. Overdue entries are returned in a list of their own whatever the span, for at most 90 days back, so "this week" still shows what was missed last week. "Today" is the Workspace's time zone's today.
- **What is an entry.** Each is a duty with a date, a kind, what it is about and a link:
  - **Value due:** a period of a Metric the person submits for (a Token of their own) that has no value yet, on its Due Date: the period's end plus the Workflow's working days (Saturdays and Sundays skipped, as the Workflow counts them). Only Metrics with a Workflow have a Due Date; see Open questions for the others. Future periods within the span are included, so next month's close shows today. A period that got a value leaves the Schedule. A Metric whose submitter is a Feed never appears.
  - **Approval waiting:** an open Approval assigned to the person (an Action with the purpose approval), dated the day it was asked, and overdue from the day after the Due Date of its period.
  - **Task:** an open Task assigned to the person with a due date, on that date. A Task without a due date is listed under "no date" in the API and on the page, and is not in the calendar.
  - **Question:** an open Question assigned to the person, including an Escalation (a Question the Workflow asks the Metric Owner), dated the day it was asked, under "no date" unless it is an Escalation, which is dated with its period's Due Date and is overdue.
  Reminders are not entries of their own: a Workflow's Remind step is Ziffr asking again, not something more to do. Each Value due says when Ziffr will remind ("Ziffr reminds you 2 days before").
- **Stand-ins and Away.** A Value due belongs to whom the Workflow asks on the Due Date: the submitter, or their Stand-in for the days the submitter is Away. The Stand-in's entry says "standing in for Ana"; Ana's Schedule does not list it for those days. Away entries in the future move the entry accordingly as soon as they are saved.
- **Visibility.** Every entry names a Metric, so an entry is returned only for a Metric the person may see now, by the same check every loader uses. The person's own Schedule is all they get by default. A Feed Key never has a Schedule. Whether an Owner or Admin may ask for a teammate's Schedule is open question 1; if yes, it is through the API and MCP with `personId`, only for Owners and Admins, only entries about Metrics the asking Owner or Admin may see, and each such call is in the Access Log as always.
- **Scope.** Reading one's own Schedule needs `metrics:read`: everything in it is about Metrics the key's person sees, and a key with `metrics:read` already reads their periods and values. A key with `values:submit` only gets nothing (403), consistent with such a key learning no Metric names. No new scope; see Open questions for a teammate's.
- **The API.** `GET /api/v1/schedule?from=2026-11-16&to=2026-11-22` answers `{ today, overdue: Entry[], days: { date, entries: Entry[] }[], undated: Entry[] }`, each Entry with `kind` (`value_due`, `approval`, `task`, `question`), `date`, `overdue_working_days`, the Metric's slug and name, the period's first day and name, the Action's id where there is one, `standing_in_for` (a name, or null) and `url`. In the OpenAPI document, with an example.
- **The MCP tool** `my_schedule` with optional `from` and `to` (dates; defaults this week Monday to Sunday; at most 90 days apart), answering the same entries as text an assistant reads well, overdue first, then by day. It is listed with the other read tools and offered as a Starter ("What do I have to do in Ziffr this week?").
- **The Calendar Link.**
  - **Making it.** On the My schedule page, **Get a calendar link** makes one for the person in the current Workspace: `https://<ziffr>/cal/<secret>.ics`, the secret 32 random bytes. Only its SHA-256 hash is stored, with the person, the Workspace, the "no names" choice and when it was made and last fetched. The address is shown once with a copy button and the steps for Apple, Google and Outlook; afterwards the page says it exists and when a calendar last fetched it. **Make a new link** revokes the old one; **Turn off** revokes it. One per person per Workspace.
  - **What it holds.** The person's Schedule from 30 days back to 90 days ahead, as all-day events (`DTSTART;VALUE=DATE`) on each entry's date: "Revenue for October 2026 due", "Approve: Cost for October 2026", "Task: Renegotiate the shipping rate". Overdue entries stay on their own date, with "(overdue)" in the title. Undated Tasks and Questions are not in it. Each event's description holds the period, the Due Date rule and the link into Ziffr; the link carries no secret and needs a sign-in. A stable `UID` per entry (kind, id, period, Workspace) lets calendars update an event rather than duplicate it, and an entry that leaves the Schedule (the value came in) disappears at the next fetch.
  - **No names.** With "no names", events say only what kind and how many: "Ziffr: 2 values due", "Ziffr: 1 Approval", one event per kind per day, and the description holds only the link to My schedule. The default is open question 2.
  - **Freshness.** The feed is built on each fetch from the core, cached for 15 minutes per link (`Cache-Control: private, max-age=900`, an `ETag`), and says `REFRESH-INTERVAL` and `X-PUBLISHED-TTL` of one hour. Calendar apps decide for themselves how often they fetch (Google Calendar can take a day); the page says so.
  - **Time zone.** Events are all-day dates in the Workspace's time zone's calendar, so they need no time zone; the calendar has `X-WR-TIMEZONE` set to the Workspace's for apps that show it.
  - **Who may fetch it.** Anyone with the address, like a View Link, which the page says plainly. Each fetch checks again that the link is not revoked and that the person still belongs to the Workspace, and builds the Schedule as that person: it shows exactly what they may see now. An unknown, revoked or ended link answers 404, the same in every case. At most 60 fetches an hour per link; more answer 429.
  - **Ending.** A person removed from the Workspace, or leaving it, has their links there deleted in the same step (the handover already ends their Access Keys); a Trial Workspace's links end with it; the demo has none. Making, revoking and an Owner's revoking are in the Audit Log ("calendar link made / revoked"), never the address.
  - **Owners.** The Workspace settings list who has a Calendar Link (name, made, last fetched) for Owners and Admins, with **Revoke**, as for Access Keys.
- **The My schedule page.** Under the person's own menu: overdue first, then the next 14 days by day, then undated, each entry linking where it is done; the Calendar Link section below. It reads the same core function.
- **Words.** "Schedule" and "Calendar Link" are new glossary terms, added with this spec. The calendar address is never called a feed in UI text: Feed is a program that sends values. "Reminder" is not used for an entry; a Prompt is what Ziffr sends.
- **The user guide** gets a section in chapter 17 (Your settings), "My schedule and your calendar": what is listed, how to subscribe in three calendar apps, "no names", and revoking.

## Testing Decisions

- **Database tests** (`schedule.db.test.ts`) for the core function: a Value due on the Workflow's Due Date (working days, a period ending on a Friday, a period ending on a weekend), future periods in the span, a period that got a value leaves it, a Metric without a Workflow (per the decision on open question 3), a Feed's Metric never appears, Stand-in and Away moving an entry and marking it, an open Approval and when it becomes overdue, Tasks with and without a due date, an Escalation, overdue entries listed whatever the span and at most 90 days back, the span limits, a Metric the person no longer sees disappearing, the Workspace's time zone deciding today, and (if open question 1 is yes) an Owner asking for a teammate's Schedule seeing only Metrics they may see themselves, a Member refused.
- **API and MCP tests:** `metrics:read` gets the Schedule, `values:submit` alone gets 403, a Feed Key 403, the Access Log records the call, the OpenAPI document matches the answer.
- **Calendar Link tests:** only the hash is stored; the address works until revoked, then answers 404 like an unknown one; a new link ends the old one; removal from the Workspace ends it; "no names" events hold no Metric name, no period and no Action text (checked by searching the whole `.ics` for every Metric name of the Workspace); the `.ics` passes an iCalendar validator (line folding at 75 octets, escaped commas and semicolons, `CRLF`); UIDs are stable across fetches; the rate limit.
- **By hand, once:** subscribing in Apple Calendar, Google Calendar and Outlook, recorded in the pull request.

## Tickets

1. The core `schedule` function with its database tests.
2. `GET /api/v1/schedule` and the MCP tool `my_schedule` with its Starter; OpenAPI; tests. Blocked by 1.
3. The My schedule page (the list only); user guide section; release note. Blocked by 1.
4. The Calendar Link: table and migration, making, revoking, the `.ics` route with caching and rate limit, ending on removal, Audit Log events, the page section, Owners' list with Revoke; tests; user guide; release note. Blocked by 3.
5. A teammate's Schedule for Owners and Admins, if open question 1 is yes. Blocked by 2.

## Out of Scope

- Writing back from a calendar (accepting, moving or declining an event changes nothing in Ziffr).
- Events with a time of day, and reminders set inside the calendar (a `VALARM`): Ziffr's own Prompts and Workflow reminders stay the way Ziffr reminds.
- A Schedule across several Workspaces in one list or one Calendar Link; each Workspace has its own, as nothing is shared across Workspaces.
- Contacts, who have no login and so no page to make a link on; their Prompts stay their schedule.
- A team calendar of everyone's duties.
- Holidays: working days skip Saturdays and Sundays only, as the Workflow counts them today.

## Open questions

1. **May Owners and Admins see a teammate's Schedule?** Recommendation: yes, Owners and Admins only, through the API and MCP (`personId`) and later on a person's page, showing only entries about Metrics the asking person may see themselves. It helps an Owner cover for someone and see who is behind; it also shows how late a colleague is with what, which some teams will find watchful. The alternative is the person's own Schedule only, which is the safe default and can be widened later. Decide before ticket 2; if yes, ticket 5, and say whether it needs a scope beyond `metrics:read` (recommendation: no new scope, the role decides).
2. **Should a new Calendar Link show Metric names or not by default?** A calendar is often shared with a team or a partner, and a name such as "Churned customers" or "Cash runway" tells something. Recommendation: names shown by default, because they make the entries useful, with "no names" offered next to the copy button and explained ("choose this if others can see your calendar"). The alternative is "no names" by default. Decide before ticket 4.
3. **Metrics without a Workflow have no Due Date. Do they appear?** Recommendation: yes, on the first working day after their period ends, marked "no Due Date set", but only for the latest ended period without a value, so a daily Metric nobody fills in does not flood the calendar. The alternative is to list only Metrics with a Workflow, which is precise but leaves out most Metrics of a small team. Decide before ticket 1.
4. **Are Questions part of the Schedule?** The ticket names values, reminders, Approvals and Tasks. Questions assigned to the person, including Escalations, are duties too, but most have no date. Recommendation: Escalations yes, dated; other open Questions only in the API's and page's "no date" list, never in the calendar. Decide before ticket 1.
