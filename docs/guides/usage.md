# Usage: seeing how your Installation is used, in Ziffr

An Installation Admin can read daily totals across all Workspaces: how many Workspaces and people there are, how many are active, how many values arrived by which Source. The **Usage Feed** brings those totals into a Workspace of your own as Metrics, so you can put them on a dashboard, set targets and ask for them like any other number ([spec 0031](../specs/0031-usage-and-dogfood.md)).

The figures are counts. They never name a Workspace, a Metric or a person, and an Installation with fewer than three Workspaces gets no breakdowns at all, so a small Workspace is never visible through a total. The Installation Settings page shows the same last 30 days before you turn anything on.

The Usage Feed is a [Feed](feeds.md) that lives in this repository (`packages/feed-usage`, MIT like the other packages for programs). It is **off until you set two keys**, and it makes no request to any address you did not name.

## Set it up, once

The quickest way is the **Ziffr operations** Pack: it brings a Metric for every figure below, with the right period, Aggregation and units, and a dashboard.

1. In the Workspace that should hold the numbers, open Settings, Feeds, create a Feed named "Ziffr usage" and a Feed Key for it (copy the key; it is shown once).
2. Open Workspace, Packs, **Choose a Pack file…** and pick `packs/ziffr-operations.pack.json` from this repository. Under the installed Pack choose **Choose parts yourself**, tick the Metrics, pick **Values come from the Feed** and choose the Feed, pick the dashboard "Ziffr operations", and **Set up**. The Feed becomes the Submitter of every Metric and their API Source is on, so nobody is asked for these numbers.
3. Continue below with the Usage Key and the settings. Doing it by hand instead works too: the Metrics only need the slugs listed under "The figures", the period day, and the Feed as Submitter.

The same steps in detail:

1. **Make a Feed.** In the Workspace that should hold the numbers, open Settings, Feeds, create a Feed named "Ziffr usage" and a Feed Key for it. Copy the key; it is shown once.
2. **Make a Usage Key.** On the Installation Settings page, choose **Make a Usage Key** and copy it.
3. **Leave the operations Workspace out.** On the same page, pick that Workspace as the one left out of every figure (you must own it). Otherwise its own Metrics, values and Feed calls are in the totals it records, and the dashboard partly pictures itself.
4. **Give that Workspace room.** The figures are about 37 Metrics, and they count towards the [Workspace Limit](self-hosting.md) like any others. If the Workspace has a default limit, give it one of its own on the Workspace Limits page that is large enough.
5. **Create the Metrics and add the Feed as Submitter.** Each figure is one Metric whose slug is the figure's name with hyphens, such as `people-active-7d`. Open "Who submits" on each Metric and add the Feed. Do not set a Due Date for the Feed's Submission: nobody should be asked for a number only a program can give. The list of figures is below.
6. **Put the keys in the settings.** With Docker Compose, add to `.env` and start again:

```sh skip="settings with placeholder keys"
ZIFFR_USAGE_KEY=zu_...
ZIFFR_USAGE_FEED_KEY=zk_...
```

Both keys are needed. With one missing, or neither, nothing runs and nothing is sent.

By default the Feed reads from this Installation and sends to this one. To keep your numbers in a Workspace on another Ziffr, such as the hosted one, name each address:

```sh skip="settings with placeholder keys"
ZIFFR_USAGE_SOURCE_URL=https://ziffr.example.com   # the Installation whose figures are read
ZIFFR_USAGE_FEED_URL=https://app.ziffr.example     # the Installation that holds your Workspace
```

The first run fills in what the daily totals already hold.

## How it runs

- **Docker Compose:** the clock starts the Usage Feed every day at 05:00 UTC, after the day's totals are written (04:40 UTC), with a week of backfill. It logs one summary line and the exit code. A failed run is tried again the next day. The keys go into the clock's own settings file and nowhere else; the app never reads them, and the Feed does not get the job secret.
- **Any other cron:** run `ziffr-feed-usage run --backfill 7` from this repository's package, with the same four settings in the environment. `--dry-run` shows what it would send.
- **Safe to repeat.** It keeps no state. Ziffr says which periods have a value, so a repeated run sends the current period again with the same figures and records nothing twice.
- **Absent is absent.** A figure the Installation leaves out (a breakdown held back for a small Installation, or a day with no totals) gets no value in your Workspace. It is never recorded as zero.
- **Events and states.** Figures that count events in a day (signups, values by Source, calls, views) are added up over the Metric's period. Figures that count a state (Workspaces, people, Metrics) take the period's last day.

## Your own Workspace's figures

An Owner or Admin can have the Workspace's own usage, the figures of the Usage page and a few more, as Metrics of their own, with the same Feed program and no Installation Admin involved. Nothing else about the Installation or other Workspaces is read.

1. In the Workspace, Settings, Feeds: create a Feed (for example "Workspace usage") and a Feed Key.
2. Settings, Access Keys: make a key with **Read usage figures**. Only Owners and Admins can; it is never offered to an assistant.
3. Install **Workspace usage** (`packs/workspace-usage.pack.json`), **Choose parts yourself**, with the Feed as Submitter of its Metrics. The Pack has 18 Metrics, ordinary ones that count towards the [Workspace Limit](self-hosting.md); tick fewer if you want fewer.
4. Run the Feed from any cron, with the keys in the environment:

```sh skip="needs Usage Feed keys and the Feed program"
export ZIFFR_USAGE_ACCESS_KEY=zk_...   # the key with "Read usage figures"
export ZIFFR_USAGE_FEED_KEY=zk_...     # the Feed Key
export ZIFFR_USAGE_FEED_URL=https://ziffr.example.com
ziffr-feed-usage run --workspace --backfill 7
```

Both keys are needed; with one missing nothing runs. The Docker clock does not start this mode: it is for one Workspace's own people, so you set up the cron where you want it.

The slugs are `workspace-` and the figure's name with hyphens. Events, added up over the period: `workspace-values`, `workspace-values-web`, `-email`, `-slack`, `-telegram`, `-api`, `-feed`, `-mcp`, `workspace-views-dashboards`, `workspace-views-decks`, `workspace-views-metrics`. State, as of the run (recorded for the day before): `workspace-metrics`, `workspace-metrics-without-values`, `workspace-metrics-not-opened`, `workspace-dashboards-not-opened`, `workspace-decks-not-opened`, `workspace-submitters-without-values`, `workspace-archive-suggestions`.

Counts only, never who looked and never a name. The figures count only what the key's creator sees, since a Workspace Role grants no Metric; and because everyone who sees these Metrics sees the numbers, the values, views and Submitters are left out while fewer than three people are in the Workspace (and for days before the third person joined, so a backfill cannot reach back), what is not opened is left out until Ziffr counted for 90 days, and a day before counting began has no view figures. A figure left out is absent, never zero. The past is not rebuilt for the states: a backfill fills views and values, and the states start with the first run.

## When the Installation is down

If the Installation cannot be reached at 05:00 UTC, the run fails, is logged, and that day has no figures in your Workspace. The next run backfills days the daily totals hold, and the totals rebuild event counts of a missed day from the tables. What cannot be rebuilt is the day's API calls, MCP calls and views, which are lost. Nobody is asked for a missing number.

If the Usage Key was revoked or mistyped, the run fails with "did not accept the Usage Key". Make a new key on the Installation Settings page and put it in the settings.

## The figures

State, taken at the end of the day: `workspaces`, `workspaces-trial`, `workspaces-free`, `workspaces-paid`, `people`, `people-active-7d`, `workspaces-active-7d`, `metrics`, `metrics-archived`, `dashboards`, `widgets`, `decks`, `workflows`, `feeds`, `packs-installed`.

Events, added up over the period: `workspaces-created`, `trials-started`, `trials-kept`, `trials-closed`, `sizes-booked`, `workspaces-deleted`, `signups`, `values-web`, `values-email`, `values-slack`, `values-telegram`, `values-api`, `values-feed`, `values-mcp`, `values-derived`, `api-calls`, `feed-calls`, `mcp-calls`, `emails-sent`, `views-dashboards`, `views-decks`, `views-metrics`.

The split figures (`workspaces-trial`, `workspaces-free`, `workspaces-paid` and the `values-` ones) arrive only where at least three Workspaces are behind them.

## Figures that are not filled yet

Some figures are in the list but nothing records them yet, so they are absent or zero: `api-calls`, `feed-calls`, `mcp-calls`, `signups`, `people-active-7d`, `workspaces-active-7d`, `trials-started`, `sizes-booked`, `workspaces-deleted`, `values-feed`, `values-mcp` and `values-derived`. They are tracked in #389. A zero here means "not recorded", not "none happened".
