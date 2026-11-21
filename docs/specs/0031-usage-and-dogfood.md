# 0031 Usage and dogfood: what is looked at, for the operator and for every Workspace

**Status:** done, including #370 (a Workspace's own figures as Metrics). **Tracking issue:** #357 (label `tracking`).

## Problem Statement

A tracker can quietly become a cemetery: Metrics nobody fills, dashboards nobody opens, Submitters who were added once and never answered. The people who could clean up (Owners and Admins) cannot see it, because Ziffr records what is entered but not what is looked at. The operator of an Installation has the same blindness one level up: how many Workspaces are trials, how many people came back this week, whether the Packs and the MCP Server are used at all.

Ziffr is a tool for exactly this kind of question, so it should answer it about itself, with its own Metrics, in its own Workspace, the way any customer would. And it must do so without turning into surveillance: no one is watched, and an operator never sees into a Workspace.

## Solution

Two levels, one idea each.

- **Installation level:** a new aggregate-only endpoint gives an Installation Admin daily **totals across all Workspaces**: counts only, never a Workspace's name, a Metric's name or any content. A small program, the **Usage Feed**, built with `@ziffr/feed-kit` and living in this repository, reads the endpoint and sends the figures with a Feed Key into the operator's own Workspace, exactly as a customer's Feed would (ADR 0006). It runs as a daily job in the Docker clock, off by default. A Pack, **Ziffr operations**, brings the Metric Catalog entries and a dashboard, installed with "Set up from this Pack".
- **Workspace level:** Ziffr counts **View Counts**, how often each dashboard, deck and Metric is opened per day, never by whom. A **Usage** page for Owners and Admins turns them, together with the values Ziffr already holds, into plain lists (not opened for 90 days, Metrics without values, Submitters without values) and one suggestion people can act on: archive these Metrics.

## User Stories

1. As an Installation Admin, I want daily totals across all Workspaces (how many are trials, Free or paid, how many people were active this week, how many values arrived by which Source), so that I know whether Ziffr is used.
2. As an Installation Admin, I want those figures never to name a Workspace, a Metric or a person, so that running Ziffr for others never means looking at their data.
3. As an Installation Admin, I want the figures as Metrics in my own Workspace, on a dashboard, with my own targets and Prompts if I like, so that I use Ziffr to run Ziffr.
4. As an Installation Admin, I want that to be off until I turn it on with a key, and to send nothing anywhere I did not name, so that self-hosting stays private.
5. As a self-hoster with one Workspace, I want the endpoint to be honest about what it can say, so that "totals" never smuggle one Workspace's details out.
6. As an operator, I want to set the Metrics up from a Pack in a few minutes, so that I do not build a dashboard before I see a number.
7. As an Owner or Admin, I want to see which dashboards, decks and Metrics were not opened for 90 days, so that I can remove what nobody wants.
8. As an Owner or Admin, I want to see Metrics without values and Submitters without values, so that I know where Prompts go unanswered and whom to ask.
9. As an Owner or Admin, I want one click to archive a list of unused Metrics, nothing deleted, so that the Workspace gets tidy and, on a Size with a limit, gets room (spec 0029).
10. As a person who opens a dashboard, I want it never to be recorded that it was me, so that looking at a number is not a performance.
11. As an Owner, I want Ziffr not to suggest archiving a Metric that a program or an assistant still reads through the API, so that a clean-up does not break something quiet.
12. As a visitor of the demo, I want nothing I do to be counted, as nothing I do is saved.

## Implementation Decisions

### Words

New glossary terms, added in the same change:

- **Usage:** what a Workspace or an Installation is used for, as counts: what is looked at, what has values, what arrives. Never who looked.
- **View Count:** how many times a dashboard, deck or Metric was opened on one day, kept only as a number per day.
- **Usage Key:** a secret an Installation Admin makes on the Installation Settings page. It can read the Installation's Usage figures and nothing else.
- **Usage Feed:** the Feed that brings the Installation's Usage figures into the operator's own Workspace.

_Avoid_ for Usage: analytics, telemetry, tracking, statistics, activity. "Telemetry" in particular: nothing in this spec is sent to Ziffr.

### Installation level: the figures

One row per day, all whole numbers. A figure that counts "in a state" is taken at the end of the UTC day; one that counts "events" is the sum over the UTC day.

| Group | Figures |
| --- | --- |
| Workspaces (end of day) | `workspaces_trial`, `workspaces_free` (on the Installation's default limit, not a trial), `workspaces_paid` (a limit of its own, set by an Installation Admin or Ziffr Cloud). Never the demo. |
| Workspaces (events) | `workspaces_created`, `trials_started`, `trials_kept` (turned into an ordinary Workspace, spec 0029), `trials_closed`, `sizes_booked` (a Workspace given a limit of its own by Ziffr Cloud; a count of events, not of Sizes or prices), `workspaces_deleted`. |
| People | `people` (end of day, all members with a sign-in), `signups` (events), `people_active_7d` and `workspaces_active_7d` (end of day: a sign-in or a page of a signed-in person within 7 days, from the same last-seen record the unused-Workspace job of spec 0029 keeps; a person in two Workspaces counts once in the first figure). |
| Contents (end of day) | `metrics`, `metrics_archived`, `dashboards`, `widgets`, `decks`, `workflows`, `feeds`. |
| Values (events) | `values_web`, `values_email`, `values_slack`, `values_telegram`, `values_api`, `values_feed`, `values_mcp`, one per way in, counting values recorded that day. A program's value is `values_feed` when its key is a Feed Key, `values_mcp` when it is a connected assistant's key (the remote MCP Server; a local MCP Server uses an ordinary Access Key and is `values_api`), else `values_api`. There is no `values_derived`: a Derived Metric is computed when read and never recorded, so there is nothing to count. |
| Packs (end of day) | `packs_installed` in total, and per Pack only for Packs from the Marketplace, as `{ id, installs }`, where at least 3 Workspaces hold it (below). An uploaded Pack is never named. |
| Programs (events) | `api_calls` (requests made with Access Keys, Feed Keys excluded, counted by themselves in `feed_calls`), `mcp_calls`, `emails_sent` (Deliveries by email that left the server). |
| Views (events) | `views_dashboards`, `views_decks`, `views_metrics`, the sums of the Workspace level's View Counts. |

What is never in it: a Workspace's id or name, a person, an address, a Metric's or dashboard's name or id, a value, a Source's configuration, a Pack that was uploaded, any breakdown that names a group of fewer than 3 Workspaces.

**Where the counts come from.** Most figures are counted from tables Ziffr already has (Workspaces, people, Metrics, values with their Source, Deliveries, Pack installs, Audit Log). Three need counters that do not exist: `api_calls`, `mcp_calls` and views. They go into one table `usage_counts(day, kind, workspace_id, n)`, where `workspace_id` is only there so deleting a Workspace deletes its counts, and is never returned. Calls are counted in memory per server process and written once a minute and on shutdown (an upsert adding `n`), so an API call costs no database write of its own; a crash loses at most a minute of a statistic.

**Built in #389:** the call counters are in memory per process and flushed every minute and on shutdown (`usage-calls.ts`, `add_usage_counts`); `trials_started` from `workspaces.trial_started_at` (set by a trigger); `sizes_booked` and `workspaces_deleted` from `usage_events` (triggers, no Workspace and no person, forgotten after 400 days); `signups` and `people_active_7d` from the account's creation and last sign-in (a person whose session stays open is not counted as active, and a page view is not a sign-in); `workspaces_active_7d` from `workspaces.last_used_at`, which a value by any Source also sets. For a day the job missed, events are rebuilt from the tables and the states a creation date can show (Workspaces, people, Metrics, dashboards, widgets, decks, Feeds, Packs installed) as of the end of that day, a little low for what was deleted since; the kinds of Workspace, Workflows, Packs and the 7-day figures are not rebuilt, and the calls and views of a missed day are lost. `feed_calls` and `mcp_calls` split the API's calls by kind and so follow the small-number rule like values by Source. `usage_events` holds no Workspace id: an event is its kind, its time and a flag, set when it is written, saying whether the Workspace was the one left out on the Installation Settings page (a choice held only in the server's environment is not visible to the database, so these two figures do not leave it out). A deleted Workspace leaves nothing behind. Events are forgotten after 400 days.

**Rollup.** A new job `POST /api/jobs/usage-rollup` (job secret, daily at 04:40 UTC, a day after the unused-Workspaces job) writes yesterday's row into `installation_usage_daily(day, figures jsonb)`, and fills the days it missed. Rollups can be rebuilt from the tables for any day for which the counters exist (events from the tables are rebuilt; calls and views are not).

### Installation level: the endpoint

- **`GET /api/v1/installation/usage?from=YYYY-MM-DD&to=YYYY-MM-DD`:** returns one object per day in the range (at most 400 days, newest not later than yesterday), figures as above, plus `workspaces` (the number of Workspaces behind the totals, demo excluded) and `withheld` (the names of figures left out, below).
- **Who may call it:** only a Usage Key. An Installation Admin makes one on the Installation Settings page (shown once, stored as a hash, one at a time, revoked there). It is not an Access Key and not the job secret: it opens this one endpoint and nothing else, and no Workspace, no Metric and no person. The job secret is not accepted here, since it can also run deletions.
- **Answers like a hidden thing:** a missing or wrong key gets 404, as the jobs do; keys compared in constant time; a limit of 60 calls an hour.
- **The Installation Settings page** shows the same last 30 days as a table to a signed-in Installation Admin, so there is something to read before the Usage Feed is turned on. It uses the core function the endpoint uses.
- **One core function:** `installationUsage(actor, range)`, taking an Actor like every other (here: an Installation Admin, or the Usage Key's own kind of Actor, which has no Workspace). It reads only `installation_usage_daily`, never a Workspace's tables, so no later change to a loader can widen what it returns. Tested against the database, including that its result contains no key that is not on the list above.

### Installation level: small numbers

Totals can still give away a Workspace when there are only a few. Two rules, enforced in the core function, not by the caller:

1. **Breakdowns need 3.** A figure that names a group (a Pack, a kind of Workspace) is shown only where at least 3 Workspaces are in the group; otherwise it is left out, listed in `withheld`, and its count stays in the total that holds it (`packs_installed`, and the three `workspaces_*` figures are always shown only as their sum `workspaces` when fewer than 3 Workspaces exist).
2. **An Installation with fewer than 3 Workspaces** (the usual self-hoster) gets the totals of the Contents, Values, Programs and Views groups and `workspaces`, `people` and `people_active_7d`, and nothing split by kind, Source or Pack. With one Workspace the totals are that Workspace's counts, which its Owners already see; the rule's job is that an Installation Admin of an Installation shared with others (the hosted one, a company with teams) never gets a view of a small Workspace through a breakdown. The Installation Admin already sees each Workspace's name and Metric count on the Workspace Limits page (spec 0029); that is the most Ziffr shows of one, and this endpoint shows less.

The numbers 3 and "fewer than 3" are in one constant and are an open question below.

### The Usage Feed

- **What it is:** a program in this repository, `packages/feed-usage` (`@ziffr/feed-usage`, MIT like the other packages for programs), built with `@ziffr/feed-kit`: one `defineFeed` whose Metrics are the figures above, each with a `fetch` that reads the endpoint for the period and sums or takes the last day, according to whether the figure is an event count or an end-of-day state. Like any Feed it keeps no state, backfills empty past periods with `--backfill`, and reports slugs Ziffr does not list for it.
- **Reads from** `ZIFFR_USAGE_SOURCE_URL` (the Installation to read, default the clock's own `ZIFFR_APP_URL`) with `ZIFFR_USAGE_KEY`. **Sends to** `ZIFFR_USAGE_FEED_URL` (the Installation that holds the operator's Workspace, default the same one) with `ZIFFR_USAGE_FEED_KEY`. They may differ, so an operator can keep their numbers in a Workspace on another Ziffr, such as the hosted one. The Feed makes no call to anywhere else.
- **Off by default:** it runs only when `ZIFFR_USAGE_FEED_KEY` and `ZIFFR_USAGE_KEY` are both set. No setting, no job, no outgoing request. Docker's `init` writes these into the clock's own settings file and nowhere else, as spec 0015 does for each service's secrets.
- **Docker clock:** at 05:00 UTC, after the rollup, `docker/clock.mjs` starts the Usage Feed as a child process with `--backfill 7` and logs its summary line and exit code (a failed run is logged and tried the next day, as for the jobs). The program is in the image next to the clock. Ziffr's app never runs it: it is a Feed, outside Ziffr (ADR 0006), and the clock is only a cron.
- **Outside Docker:** the same program runs from any cron: `npx @ziffr/feed-usage run`.
- **What the operator does once:** (1) in the Workspace that should hold the numbers, Settings, Feeds, create a Feed "Ziffr usage" and its Feed Key; (2) on Installation Settings, make a Usage Key; (3) put both in the settings; (4) in that Workspace, Workspace, Packs, install **Ziffr operations** and "Set up from this Pack"; (5) add the Feed as Submitter of the Metrics (ticket 6 makes this one question in the setup, if the Pack setup can ask for a Feed; otherwise it is the usual "Who submits" on each Metric). The first run backfills what the rollups hold.
- **The Pack "Ziffr operations"** (`packs/ziffr-operations.pack.json`, CC BY 4.0 like the starting Packs): one Metric Catalog entry per figure the Feed sends (daily; events as a sum, states as the last value), a dashboard "Ziffr at a glance" (Workspaces by kind, people active, sign-ups and trials kept, values per day by Source, Metrics and dashboards, calls) and a Workflow-free setup: nothing asks anybody, since the Feed answers. A test checks that every Metric slug the program sends is a slug of an entry in the Pack, so the two cannot drift.
- **Trust:** the Feed Key can only record values for the Feed's own Metrics; the Usage Key reads only aggregates. A leak of either shows nobody's data. This is also why the same-Installation default is safe: the operator's Workspace holds the figures like any Workspace holds its Metrics, encrypted under its Workspace Key (ADR 0012), visible to whom the operator shares them with.
- **The operator's Workspace is on the same Installation (decided).** The Feed reads the Installation's figures and posts into a Workspace of that Installation, as a customer's Feed posts into theirs. Consequences:
  - **It counts itself.** The operations Workspace would be one of the Workspaces behind the totals: its Metrics, values, views and its Feed's own `api_calls` would be in the figures it records, so the dashboard would partly picture itself. The Installation Setting `ZIFFR_USAGE_EXCLUDE_WORKSPACE` (a Workspace picked by name on the Installation Settings page, as the Workspace Limits page lists them) leaves that one Workspace out of every figure and out of `workspaces`, in the rollup, never in the tables. Recommended, and asked for in the same step as turning the Usage Feed on. The excluded Workspace is named in no response, and `withheld` does not mention it.
  - **The Workspace Limit applies.** The operator's Workspace holds about 35 Metrics from the Pack, so it needs a limit of its own that is large enough (set on the Workspace Limits page); the guide says so, and the Pack's setup warns when the limit would refuse its Metrics (spec 0030).
  - **Installation down:** the clock's call fails and is logged, and that day has no figures in the operator's Workspace. This is acceptable. The next run backfills days from `installation_usage_daily`, and the rollup rebuilds event counts of a missed day from the tables (calls and views of that day are lost). The operator's Metrics set no Due Date for the Feed's Submission, so nobody is asked for a number that no person can give.
  - **The operations Workspace is never a trial,** so its keys and history are never deleted by the trial rules.

### Workspace level: View Counts

- **What is counted:** one count each time a dashboard, a deck or a Metric is opened, per day. Table `view_counts(workspace_id, day, subject_kind, subject_id, n_app, n_link, n_api)`, primary key on the first four. There is no column for a person, a session, an address or a device, and none will be added: that is the rule, not a default. A person who opens a dashboard ten times is `n_app = 10`. Ziffr never says "10 people".
- **Where counted:**
  - `n_app`: the page of a dashboard, deck or Metric, rendered for a signed-in person (including when a person shows it on a screen). A browser prefetch, a `HEAD` request and a page that was refused count nothing.
  - `n_link`: a View Link opened (a dashboard, deck or Snapshot shared outside; the Snapshot counts for its dashboard).
  - `n_api`: a read of a Metric's values through an Access Key, the API or the MCP Server. It is not a view, but a Metric an assistant reads every morning is in use: it is kept apart so the Usage page can say "read by a program" and keep it out of "not opened".
  - **Not counted:** Feed calls (they only write), exports and Deliveries that carry values (a Delivery is the Workspace's own doing, and is already visible as sent), and anything in the demo.
- **A Metric's looks are computed, not written.** Writing one row per Metric on a dashboard for every load would turn one page load into many writes. Only the page that was opened is counted. When the Usage page asks "when was this Metric last looked at", the core takes the latest of: its own page, any dashboard or deck that holds a widget or slide of it now, and its `n_api`. The widgets a dashboard held last month are not remembered; this can only make a Metric look more used than it was, never less.
- **How:** a core function `recordView(actor, subject)`, called from the page's server code after the response is sent (Next's `after`), best effort: an error is swallowed and logged, never shown. It checks the subject is one the actor can see (it is already loaded by a function that did), so nothing can be counted that the person may not see, and writes by `INSERT … ON CONFLICT DO UPDATE SET n_app = n_app + 1`. Calls are also batched in memory for a few seconds per process, like the counters above, so a busy dashboard costs about one write a few seconds, not one per load.
- **Size and retention:** one row per subject per day with a view, so a Workspace of 200 Metrics and 20 dashboards makes at most about 220 rows a day, far fewer in practice. Rows older than 400 days are deleted by the daily rollup job (13 months: enough for "this quarter against the same quarter last year" if it ever comes, and for the 90-day rule with room). Deleting a subject or Workspace deletes its rows.
- **The demo** counts nothing: `recordView` returns at once for the demo Workspace, as every write does (spec 0029).
- **Visibility and encryption:** the table holds ids and numbers, no names or text, so it is not under the Workspace Key. It is reached only through core functions that check the Workspace and the Role.
- **Built (ticket 1, #362):** `view_counts` and `usage_counts` exist; `recordView` (`packages/core/src/usage.ts`) is one upsert per view, without the in-memory batching, which can follow if it is ever needed; `pruneViewCounts` deletes rows older than 400 days and is called by the rollup job once that exists.
- **Built (ticket 2, #363):** `countView` (`apps/web/src/lib/count-view.ts`) counts the dashboard, deck and Metric pages and both present screens for a signed-in person, after the response and never for a prefetch or a HEAD (the middleware marks HEAD); `openViewLink(token, { count })` counts a View Link open as `n_link`; `listObservations` counts a key's read of a Metric as `n_api`, once per read and not per page, which also covers the MCP Server because it calls the API in process. Feeds, exports and Deliveries never call `recordView`.
- **Before counting started:** a Workspace has `usage_since`, the first day it was counted (set when it first has a row, or when the feature is released). Nothing is called "not opened for 90 days" before `usage_since` plus 90 days; the page says "Ziffr started counting on 3 December. The list fills in by 3 March." instead of calling everything unused.

### Workspace level: the Usage page

- **Where and who:** Workspace settings gains **Usage**, for Owners and Admins; others do not see it (Members, Guests, Stand-ins, View Links). It is not in the demo.
- **What it shows, newest first, each a plain list with the reason beside the name:**
  1. **Not opened for 90 days:** dashboards, decks and Metrics (the Metric's own page, any dashboard or deck showing it, and a program reading it all count as opened, as above, but a program's reads are shown: "read by a program"). Created less than 90 days ago, or in the demo, never listed.
  2. **Metrics without values:** no value ever, or none for 90 days or the last two periods of its cadence, whichever is longer (a yearly Metric is not stale after three months). Archived Metrics and Metrics with a Projection only are listed apart.
  3. **Submitters without values:** each Submitter (a person, a Contact or a Feed) assigned to a Metric who recorded no value, by any Source, for 90 days, with the Metrics they were asked for and who owns them. A person who answered a Prompt by email counts like one who used the form. It shows Submitters, not "people who are lazy": Ziffr already names who submits, so this adds no new exposure.
  4. **Most looked at:** the ten dashboards and the ten Metrics with the most views in 30 days, as numbers, so the page also says what is worth keeping.
- **Suggestions:** under list 1 and 2, **Archive these N Metrics** with a checklist, all ticked except those where archiving would hurt, which are left out with the reason: it is an input of a Derived Metric, it has a Target, a Comparison or an Analysis that shows it, it is on a dashboard that was opened in the last 90 days, or a program read it in the last 90 days. A Metric Owner can also be told ("Mia owns 4 of them"). Archiving is spec 0029's: nothing is deleted, history stays readable, it can be brought back (and is then counted against the limit again). A Metric that is only unused, never one that is used, is ever suggested. Dashboards and decks are not archived (they are not a thing Ziffr archives); the list only says "not opened", with the link to delete.
- **Never automatic:** nothing is archived, deleted or sent because of Usage. Ziffr puts no banner on other pages and sends only the monthly digest; the page is there when someone wants to tidy. The one exception is the monthly digest to Owners, which says only what the page says.
- **Loader:** `workspaceUsage(actor, workspaceId)` in the core, which checks Owner or Admin, reads only what the Actor may see (Owners and Admins see the whole Workspace, so the page lists what they manage, and nothing about Metrics outside their sight on a Workspace where some are Private to a Share, if that exists: the loader reuses the Metric loaders and counts only what they return).
- **Archive in bulk:** `archiveMetrics(actor, ids)` calls the single archive of spec 0029 for each, in one transaction, writing the Audit Log event for each, and refusing the whole call if any one is refused.

### Workspace level: the monthly email digest

- **Who gets it:** each Owner of a Workspace (not Admins, not Members), by email, on the 1st of the month at 07:00 UTC, as one Delivery in the Outbox. An Owner switches it off in their own settings ("Email me when Metrics go unused", one setting per person for all their Workspaces, on by default, announced in the release note). Every digest carries a one-click unsubscribe link, like Prompts and reminders (RFC 8058, a GET that only asks).
- **Only when there is something to say:** it goes out only if at least one of the first three lists of the Usage page is not empty. A Workspace with nothing unused gets no email. A Workspace within 90 days of `usage_since`, a trial and the demo never get one; nothing is ever sent for the demo.
- **What it says:** plain text, short. The counts ("4 Metrics have had no values for 90 days, 2 dashboards were not opened for 90 days, 3 Submitters have not sent a value"), up to five names per list with the reason beside each, how many more there are, and one link to the Usage page. It carries no values, no View Counts per item and no answers. The names are what the Owner sees on the page, so the digest says nothing the page does not, to a person who may open it.
- **How it goes out:** a job `POST /api/jobs/usage-digest` (job secret; the clock calls it daily at 07:00 UTC and it acts on the 1st, catching up a missed day in the first week). The send is claimed per Workspace and month in `usage_digests(workspace_id, month)` before anything is written, so repeated or parallel calls send once, as a Workflow's day is claimed. It goes through the Delivery path of Prompts, so it obeys what email already obeys: the Workspace's and inbox's limits, the Owner's address, the demo's refusal, and the Outbox showing whether it left. It counts in `emails_sent`. Where the Installation has no working email, the job does nothing and logs it.
- **Never a nag:** at most one a month per Workspace and Owner, and nothing about a Workspace that has nothing to report.

### Workspace level: its figures as Metrics (recommendation: yes, after the page)

An Owner could want "views of dashboards per week" or "Metrics without values" as Metrics of their own, with targets and a Prompt-less dashboard, as the operator has. Recommended: yes, later, with the same machinery and no new kinds of thing:

- A Workspace-level endpoint `GET /api/v1/usage` for an Access Key of an Owner or Admin returns the same kinds of counts for that Workspace only (Metrics, Metrics without values, views per week, values per day by Source).
- The same Usage Feed program, with `--workspace`, sends them to the Workspace of the key, as an ordinary Feed; a Pack "Workspace usage" holds the entries.
- They are ordinary Metrics: they count towards the Workspace Limit (18 of them in the Pack, which says so before setting up) and nothing hides them. Not hidden "system Metrics": a Metric that does not count, cannot be archived or cannot be seen by everyone who sees the Workspace would be a new kind of thing to explain, enforce and test.
- Not in the first spec: it is built on the Usage page's loaders and costs one ticket, so it should follow the page and be asked for.
- **Built (ticket 9, #370):** `workspaceUsageFigures` (`packages/core/src/api-usage.ts`) behind `GET /api/v1/usage`, scope `usage:read`: a program's key only (a key-only scope, backed by the database check), only while its creator is an Owner or Admin. Per day the values (total and by Source, from `workspace_usage_values`) and the views of dashboards, decks and Metrics (View Counts); as of now (`state`, recorded for yesterday) Metrics, Metrics without values, what is not opened, Submitters without values and archive suggestions, all from `workspaceUsage`. Only what the creator sees is counted (a Workspace Role grants no Metric; the Feed writes Metrics others may see). The small-number rule here is people, not Workspaces: with fewer than 3 people the values, views and Submitters are left out and named in `withheld`, and days before the third person joined have none; what is not opened waits for 90 days of counting; 30 calls an hour per Workspace. The Feed's `--workspace` mode and the Pack `workspace-usage` (18 Metrics, slugs `workspace-…`) tie to the figures by tests. The Docker clock does not start this mode.

## Testing Decisions

A good test checks what a person or program can see, not how it was counted.

- **Core, against the database (`*.db.test.ts`):** `recordView` counts once per call and never stores an actor, in any table (a test lists the columns of `view_counts` and `usage_counts` and fails on a new one that is not on the list); it does nothing for the demo, for a subject the actor cannot see and for a prefetch; the retention job deletes rows older than 400 days and nothing newer; `workspaceUsage` refuses Members, Guests, Stand-ins and Owners of another Workspace, and lists only what the Actor may see; nothing before `usage_since` plus 90 days is called unused; a Metric on a dashboard opened yesterday is "looked at"; a Metric read by `n_api` is kept from the archive suggestion; a yearly Metric is not "without values" after three months; `archiveMetrics` is all or nothing and respects the Workspace Limit when bringing back.
- **Installation, against the database:** `installationUsage` returns only keys of the list (a hostile table: a Workspace named with a script, a Metric named with an email address, a Pack uploaded with a name; none of it appears in any key or value), returns no breakdown below 3 Workspaces and names it in `withheld`, never counts the demo, and answers a day from the rollup equal to the day counted from the tables. The endpoint answers 404 for no key, a wrong key, an Access Key, a Feed Key and the job secret; accepts only a Usage Key; and keeps to its limits.
- **Usage Feed:** unit tests with a fake endpoint and a fake Ziffr (feed-kit's own way of testing), for event sums against end-of-day states and for a failing endpoint; one `db` test that runs it against a real local Ziffr with a Feed Key and checks the Metrics of the Pack receive values. A test that every slug the program sends is in `ziffr-operations.pack.json`, and that the Pack passes the Pack checks.
- **Digest:** against the database: the job sends one email per Workspace and month under parallel calls; sends nothing for an empty Usage page, a trial, a Workspace within 90 days of counting or the demo; goes only to Owners who have not opted out; its text holds no value and at most five names a list; the unsubscribe link only asks on GET; an Installation with no email logs and does nothing.
- **Excluded Workspace:** with `ZIFFR_USAGE_EXCLUDE_WORKSPACE` set, no figure and no `workspaces` count includes it, and no response or `withheld` names it; a day the Installation was down leaves a gap that the next run backfills.
- **Clock:** the smoke test of `docker/` keeps passing without the settings, with no job started; a manual check with the settings that the Feed ran and logged.
- **In the running app (before closing the page's ticket):** open dashboards and Metrics as a person, see their counts on the Usage page the next day's way (the test seeds days), archive a suggested list.

## Out of Scope

- Who looked, in any form: no per-person counts, no "last viewed by", no per-person Usage page, not even for Owners. This is the rule of the spec.
- Per-Workspace rows, names, Metric names or any content at Installation level; sending anything to Ziffr, the company, by default (no phone-home).
- Anything about what people typed or clicked inside a page (heat maps, clicks, time on page, funnels); only page opens.
- Archiving or deleting automatically, banners, any email other than the monthly digest, Usage in the Workspace Limit's overage rules.
- Comparing Workspaces to each other, or a Workspace to Installation averages.
- A hosted runner for the Usage Feed (ADR 0006).
- Usage of Ziffr Cloud itself (billing, the Marketplace): it keeps its own figures in its own repository.

## Decisions (2026-11-20, by the owner)

The draft's ten open questions, answered; each is built into the sections above.

1. **Small numbers:** the threshold is 3, one constant; an Installation with fewer than 3 Workspaces gets totals only. A stricter number for hosted Ziffr is a setting, not code.
2. **A Usage Key** of its own, shown once; the job secret is not accepted by the endpoint.
3. **Programs' reads** are counted apart (`n_api`), not as views, and only keep a Metric out of the archive suggestions.
4. **"Opened"** means anywhere the Metric appears: its own page, or a dashboard or deck showing it now.
5. **The email digest is in from the start**, monthly with an opt-out per Owner (below).
6. **Retention** of View Counts is 400 days.
7. **The operator's Workspace lives on the same Installation** as the figures it holds (below).
8. **"Set up from this Pack" can add a Feed as Submitter** of every Metric it makes, and a Pack's entry can carry a slug hint (ticket 6; spec 0030's setup gains it).
9. **The Workspace's own figures as Metrics** come later, on request (ticket 9), not in the first run.
10. **The Usage page is for Owners and Admins.** The digest goes to Owners only.

## Tickets

1. Glossary (Usage, View Count, Usage Key, Usage Feed), the tables `view_counts` and `usage_counts` with `workspaces.usage_since`, `recordView` and the batching, the retention in the rollup job. No page counts anything yet.
2. Count the pages: dashboard, deck, Metric, View Link, and the `n_api` reads of the API and the MCP Server; the demo and prefetch rules. Blocked by 1.
3. The Usage page and `workspaceUsage`, the suggestions and `archiveMetrics`. Blocked by 2 and spec 0029's Archived Metrics.
4. Installation figures: the counters for calls, `installation_usage_daily`, the `usage-rollup` job and its clock entry, `installationUsage`, the Usage Key, the endpoint, the table on Installation Settings, the small-number rules, and `ZIFFR_USAGE_EXCLUDE_WORKSPACE`. Blocked by 1.
5. The Usage Feed program `@ziffr/feed-usage`, its clock job and Docker settings (off by default), and the guide `docs/guides/usage.md` (same-Installation setup, Workspace Limit, downtime). Blocked by 4.
6. The Pack "Ziffr operations", the test that ties its slugs to the program, a slug hint in Pack entries, and the Feed as Submitter in "Set up from this Pack". Blocked by 5 and spec 0030.
7. The monthly email digest to Owners: `usage_digests`, the opt-out setting, the `usage-digest` job and its clock entry. Blocked by 3.
8. Docs: the user guide chapters for Workspace settings (Usage, the digest setting) and Installation Settings, threat model boundaries, release notes, and a security review of the whole spec. Blocked by 3, 4, 5, 6 and 7.
9. Later, on request: the Workspace's own figures as Metrics (Workspace-level endpoint, `--workspace`, a Pack). Blocked by 3 and 5.

## Further Notes

- **Why aggregates at the top and a Feed, not a dashboard built into Ziffr.** A page that shows the operator their own numbers would be one more screen to build and keep right; a Feed makes them the product's ordinary Metrics, with Targets, Prompts, Snapshots and Decks, and it tests Feeds, Packs and the Metric Catalog on ourselves every day. If it is awkward for us, it is awkward for customers.
- **Why counts and never people, even for Owners.** Who looked at a number is a question about people, and answering it changes how they behave (they stop looking, or look more to be seen). Whether a dashboard is looked at is all a tidy-up needs. Because the table has no place for a person, no later feature can quietly fill it in; adding one would need a decision of its own and a new spec.
- **Honest wording.** Neither the page nor the guide says that Ziffr "cannot see" what people open. It says what is stored: a number per dashboard per day. A person who runs Ziffr themselves can always count more, as ADR 0012 says of data in general.
