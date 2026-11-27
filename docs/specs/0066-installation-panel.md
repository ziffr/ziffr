# 0066 The Installation's panel: Users, Workspaces, Health and an address of its own

**Status:** done.

## Problem Statement

Whoever runs an Installation can set up what it talks to and write Announcements (specs 0025 and 0054), but cannot answer the plain questions of running it: who signed up, whether an account should be stopped, which Workspaces there are and when their trials end, and whether the background jobs and messages still work. On hosted Ziffr those answers need the database, which is the least careful way to get them. And the pages that change the whole Installation answer at the same public address as everything else.

## Decisions

The owner asked for an admin panel on 2026-11-27 and agreed to these three the same night:

1. **Account and Workspace facts only.** An Installation Admin never sees a Metric's name, a value, a note, a comment, a dashboard's content or a Contact, and there is no way to sign in as someone else. The panel is part of the Installation Settings, for Installation Admins; there is no second role and no second panel.
2. **An address of its own, optional.** Whoever runs the server may give the panel an **Admin Address** and restrict who reaches that address at the network. Unset, everything is as before.
3. **Hosted Ziffr first:** the owner sets the Admin Address on the live app (app.ziffr.net) first, restricted to their private network, once a release carries it.

## Solution

The Installation Settings become a panel of pages, reached by the same menu item, each answering "not found" to everyone who is not an Installation Admin:

- **Settings:** the page as it was, with its Announcements and Changes.
- **Users:** everyone who signed up, found by name or address: name, email address, when they signed up and last signed in, whether they are blocked or an Installation Admin, and how many Workspaces they belong to. Actions: block, unblock, sign out everywhere.
- **Workspaces:** every Workspace but the demo and Practice Workspaces: name, Owners, kind (ordinary, a Size, trial, trial ended, closed), days left and the day of deletion, counts of people, Metrics and dashboards, the Workspace Limit, when it was made and last used. Actions: change the limit (as on the Settings page), give a running trial more days.
- **Health:** the release, whether mail, Telegram and Slack work, waiting and failed messages by channel, and when each background job last recorded a run.

### Blocking

A **Blocked User** cannot sign in, and every session of theirs ends at once. Nothing acts as them: their Access Keys and connected assistants, Personal Webhooks, replies by email, Slack and Telegram, personal form links and Calendar Links stop, and no message is sent to them (it stays in the Outbox). Nothing is revoked or deleted, so unblocking brings all of it back. What belongs to a Workspace carries on: their Workspaces, Metrics and Shares, Workflows they own, Workspace Webhooks, Feeds and their keys, and View Links they made (an Owner can revoke those).

The block is the sign-in service's own ban, so the service refuses the sign-in and the session refresh by itself; Ziffr asks the same fact wherever something else could act as the person, and treats an unreadable answer as blocked. Nobody blocks themself or an Installation Admin.

### Trials

Only a running trial gets more days, and it never ends more than 30 days from the day of the change. Its reminders come again before the new end, and the Access Keys and View Links the trial had shortened get their own end date back as far as the new end allows. An ended trial is not reopened: closing it revoked keys and connections. On hosted Ziffr, where Ziffr Cloud sets the trial days and Workspace Limits, this is the one thing about a single trial an Installation Admin changes; limits stay Ziffr Cloud's.

### Health

Only what Ziffr records anyway, as counts and times. Ziffr does not check for newer releases and asks no other server, so the page links to the releases instead. A job with nothing to do records nothing; trial clean-up, unused Workspaces and the usage email record no run at all.

### The Admin Address

`ZIFFR_ADMIN_URL`, a server setting only (never on a page, so nobody locks themself out or opens the panel from a browser). When set:

- the panel's pages and their actions answer only a request whose `Host` header names that host (a differing `X-Forwarded-Host` is refused);
- that address serves signing in and the panel, and nothing else of Ziffr (no app pages, API, MCP Server, View Links or forms);
- sign-in links asked for there lead back there, and Docker adds it to the sign-in service's list of addresses;
- a value that is not an address, or names the same host as `ZIFFR_SITE_URL`, closes the panel everywhere and leaves the app as it is.

The Practice Workspace stays the Installation Admin's own: its "Start over" works from the app too.

The Admin Address is a second lock. Restricting who reaches it is the server owner's, at the proxy or the network; Ziffr checks the Installation Admin on every page and operation either way.

### Records and limits

Every block, unblock, sign-out and trial extension is a line in **Changes**, with the account's or Workspace's id, never an address; the page shows a User's name as it is now. A Workspace's Audit Log records its trial's extension. One Installation Admin may take at most 60 such actions an hour. Changes of a limit are recorded as before.

## Out of scope

- **Deleting an account.** It needs rules this spec does not make: what becomes of the Workspaces they are the only Owner of, of Metrics, dashboards and Workflows they own (handover), of their name on values, Threads and Audit Logs (kept as a record, or replaced), and of backups. The pieces that exist (handover when removing a member, deleting a lone person with a trial or an unused Workspace) cover only parts of it.
- Closing or reopening a Workspace. The only existing close deletes it after the grace days and tells its people their Size was cancelled; using it for anything else would say something untrue and lose data.
- Signing in as someone, reading a Workspace's content, editing a person.
- A check for newer releases, and a recorded run of every job.
- Passkeys or a second factor for Installation Admins.

## Testing

Core operations against the database (`installation-panel.db.test.ts`): who may read and act, what the lists hold and never hold, the block's effect on sessions, sign-in, keys, form links, replies, Calendar Links and messages and its undoing, the trial extension's rules, the hourly number, the records. The Admin Address's rules are tested without a database (`admin-address.test.ts`, `middleware.test.ts`).
