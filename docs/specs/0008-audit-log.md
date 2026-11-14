# 0008 The Audit Log

**Status:** in progress. **Tracking issue:** #111 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0008`.

## Problem Statement

Ziffr already keeps pieces of its history. Activity shows the Versions of what people build and every Superseded Value. The Access Log records each call a program makes with an Access Key. The Outbox lists every Delivery, and `workflow_runs` keeps each scheduled run. None of them answers the question an Owner gets from an auditor, a customer or their own board: who let whom in, who gave whom access to the cash numbers, who unlocked last quarter, and when. Role changes, Shares, View Links and Approvals leave no record of their own, and nothing can be exported.

## Solution

An **Audit Log**: one add-only record per Workspace of the events that change who may see or do what, and of the decisions people take on numbers. The core writes it next to each action. Owners and Admins read it at `/audit`, filter it by person, kind of event, object and dates, and download it as CSV. It keeps who, what kind, which object (its type, its id and its name at the time), when, and small structured details such as the old and the new role. It never keeps a value, a message body, a token or a secret. Events are kept for two years.

## User Stories

1. As an Owner, I want to see who changed someone's Workspace Role, from what to what, and when.
2. As an Owner, I want to see who removed a member and who took over their things.
3. As an Admin, I want to see every invitation made, revoked and accepted, and every request to join that was decided.
4. As an Owner, I want to see when Domain Joining was switched on or off, and for which domain.
5. As a Metric owner's manager, I want to see who shared a Metric, dashboard or deck with whom (a person or a Group), and who stopped sharing it.
6. As an Owner, I want to see Groups created, renamed and deleted, and who was put into or taken out of them.
7. As an Owner, I want to see every View Link made and revoked, and every Access Key created and revoked.
8. As a finance lead, I want to see who locked or unlocked a period, who closed a Workflow's period, who approved or sent back a value and who accepted or declined a Correction.
9. As an Owner, I want to see who created a Metric (and with which key, if a program did) and who chose its Workflow.
10. As an Owner, I want to see changes to the workspace's time zone and run hour, and who ran today's steps by hand.
11. As an Owner, I want to see who exported a deck and who exported the Audit Log itself.
12. As an Owner, I want to see when members signed in.
13. As an Owner, I want to filter by person, kind of event, one object and a date range, and download what I see as CSV for an auditor.
14. As an Admin, I want names of Metrics, dashboards and decks that were not shared with me kept from me, even here.
15. As a Member, I want the log closed to me, as the Team page's management is.
16. As a self-hoster, I want the log kept two years and removed after that without a job of its own.

## Implementation Decisions

- **One table, add-only.** `audit_events` (migration `20261123150000_audit_log.sql`): workspace, time, the acting person's id and name at the time, the Access Key if a program acted, the kind (`share.granted`), the object's type, id and name at the time, and `details` (a JSON object of at most 2 KB). A database trigger refuses every update, every truncate, and every delete of an event younger than 730 days unless its workspace is being deleted. Another trigger sets every event's time to the database's own, so an event cannot be backdated past the retention and then removed. The core reaches the database with the service role, so the triggers are what make "add-only" hold whatever code runs; only the table's owner (the database administrator, not the app) could switch them off.
- **What is recorded** (`packages/core/src/audit-kinds.ts` lists every kind): role changes, removal and handover, invitations created (email or link), revoked and accepted, join requests made and decided, Domain Joining on and off, Contacts added and removed, Shares granted, changed and removed for people and Groups (including access granted on request, which is a Share), Groups created, renamed and deleted, Group members added and removed, View Links made and revoked, Access Keys created and revoked, Metrics created, a Metric's Workflow chosen, periods locked, unlocked and closed with a Workflow, today's steps run by hand, Approvals given and sent back (also when the approver answers by email or Slack), Corrections accepted and declined, the workspace's time zone and run hour, deck exports, Audit Log exports and sign-ins. A repeated action that changes nothing (the same role again, a box ticked twice) records nothing.
- **Never values or bodies.** Details hold roles, periods, ids, names of people, Groups and Workflows, scopes, end dates and counts. Not the value approved or corrected, not a send-back comment or unlock reason (they stay with the Thread and the period), not an invitation's, View Link's or key's token or secret, not a Contact's address or handle. An email invitation keeps the invited address as its name: Owners and Admins see it on the Team page already.
- **Written in the same request, best effort.** The core calls `recordAudit` right after the action's own writes, in the same request. If writing the event fails, the error's kind is logged (`console.error`, never the details) and the action stands. Most actions are several writes through the API, not one transaction, so failing the request after the change would tell the person it did not happen when it did, and a retry would act twice. Handover is the one action that is already a database function (`hand_over`); its event is written from the core like the rest, so every event takes one path and one set of checks. The trade-off: an event can be missing if the database refuses the insert while it accepted the action a moment before. That is visible in the server's log.
- **Where it is written.** In the core function that takes the Actor, so every caller (server actions, the API, Connectors) records alike. Approvals and send-backs are recorded in the Workflow engine, because replies through a Connector reach it without the Actor's wrapper. Sign-ins are recorded by the sign-in callback, in every workspace the person belongs to; a person's first sign-in, before they belong anywhere, records nothing. Deck exports are made in the browser, so the deck page tells the core after the file is made; that event is as good as the browser that sends it.
- **Who reads it.** Owners and Admins of the workspace, through `auditLog` and `exportAuditLog`; Members, Guests and Access Keys get Forbidden, the export route answers 404. **Admins see everything Owners see.** They manage the same members, invitations, Groups and keys the log is about, the log records actions rather than secrets, and it is add-only, so seeing it lets nobody hide what they did. The one thing neither role sees is a name it may not: **visibility is the product.** Owners and Admins do not see every Metric, dashboard or deck (they see what is shared with them), so for an object of those kinds that the reader does not see, the event shows its kind, its id and who acted, but neither its name nor its details (whom it was shared with, the period, a key's name), on the page and in the CSV.
- **Filters.** Person (the acting person), kind or a category of kinds, one object (type and id), and from and to dates in the workspace's time zone. They come from the page's query and are cleaned by `cleanAuditFilter`: unknown kinds, ids that are not plain ids, and days that do not exist are dropped, and every part becomes a typed filter (`eq`, `in`, `gte`, `lt`), never text in a query. The page shows 100 events at a time, newest first, with a link to older ones.
- **CSV export.** `GET /audit/export` with the page's filter, for signed-in Owners and Admins, through the core. The export is recorded first, with its filter. The file streams in batches of 1,000 read as they are sent, at most 50,000 events; narrower dates give the rest. Every cell is quoted; a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets an apostrophe first, so a spreadsheet shows it as text (names are chosen by people). Headers: `content-disposition: attachment`, `cache-control: no-store, private`, `nosniff`.
- **Retention.** 730 days. Each new event removes the workspace's events older than that (with a day's margin for clocks that differ), so no job is needed; the trigger allows only those removals. Deleting a workspace removes its log with it.
- **The demo** records nothing: its people are made up and anyone may act as any of them.
- **The page** is `/audit`. It has no place in the top bar; the Settings area (spec 0006) links to it.

## Testing Decisions

- `audit-log.db.test.ts` runs every recorded action against the database and checks the kinds, the acting person, the object and the details, and that no token, secret, value, comment or Contact address is stored; readers (Owner, Admin, Member, Guest, a key, another workspace); hidden names for unseen Metrics on the page and in the CSV; each filter and nonsense filters; paging; the CSV's quoting and formula guard; the export recorded; the demo not recorded; a failed write that does not throw; and the triggers refusing updates, backdating and young deletes while letting a workspace's deletion take its log along. Removal past the retention cannot be staged through the API (events cannot be backdated); it was tried by hand in SQL with the trigger in place.
- `audit-kinds.test.ts` covers the pure rules: filter cleaning, details as stored and CSV cells.
- `apps/web/src/app/audit/export/route.db.test.ts` covers the route: 404 for Members and Guests, and the download's headers and lines.

## Out of Scope

Members seeing their own events; alerts on events; sending the log to another system (a SIEM); events for every edit of a Metric, dashboard or deck (Versions keep those, under Activity); deleting Metrics (Ziffr has no way to delete one yet; the kind is added with it); changing the retention per workspace; signing the log cryptographically.

## Further Notes

- The Access Log stays as it is: it records calls, not decisions, and is kept 90 days.
- A Metric created through the API names the key in the event, as its first Version does.
