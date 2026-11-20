# Feeds

A Feed brings values for some Metrics into Ziffr from another system, such as a CRM, a data warehouse or a help desk ([spec 0012](../specs/0012-feeds.md), [ADR 0006](../adr/0006-feeds-run-outside-ziffr.md)). It is a program that runs wherever you like: cron, a GitHub Action, a container, an n8n or Zapier automation. It sends values through the API with a **Feed Key**. Ziffr never runs a Feed's code and never holds the other system's credentials.

A Feed belongs to the workspace, not to a person. Its values show up under its name ("HubSpot"), and it keeps working when the person who set it up leaves. A Feed Key can do one thing: record values for the Metrics that take the Feed as a Submitter. It can see their descriptions and which periods already have a value, never the values themselves, the people or any other Metric.

## Setting one up

1. **Create the Feed.** In Settings, Feeds (Owners and Admins only), create a Feed named after the system it reads, such as "HubSpot".
2. **Make a Feed Key.** On the same page, create a key for the Feed with an end date within a year. Copy it: it is shown once. Set it as `ZIFFR_FEED_KEY` where the Feed runs, next to `ZIFFR_URL` (where Ziffr runs).
3. **Choose the Feed on each Metric.** On a Metric's Settings tab, under "Who submits", pick the Feed in "Values from a Feed" and press Add. That turns on the Metric's API Source ("API and Feeds"). A Metric's owner and its Editors can do this.
4. **Run it.** Pick one of the three ways below.

The Feeds page shows, for each Feed, its keys and their recent calls, the Metrics it submits to, when it last called, and how many values it recorded and had refused in the last 24 hours.

## How values are checked

A Feed's values go through the same rules as anyone's: the Metric's Submission Rule, Locks and Approvals. Two things are different:

- **Imports.** A value for a past period that has no value yet is an Import. It is recorded without the Unusual Value check, so connecting two years of history does not raise hundreds of Approvals. The Metric's history marks it "imported". A value for the current period, or one that replaces an existing value, is checked as usual, and a locked period stays locked.
- **No Prompts.** Nobody asks a Feed for a value. When a Feed's value is still missing after the Due Date, the Metric's Workflow escalates to the Metric's owner and names the Feed. Use an Escalation step in the Workflow so that a broken Feed gets noticed.

A Metric fed by a program should usually use the Submission Rule "overwrite". Then a value that changes during the current period (pipeline value, open tickets) simply replaces the earlier one.

## With the feed kit (TypeScript)

[`@ziffr/feed-kit`](../../packages/feed-kit/README.md) gives you the contract and a runner. You write how to fetch one period's value; the runner does the rest:

```ts
// hubspot.feed.mjs
import { defineFeed } from "@ziffr/feed-kit";

export default defineFeed({
  name: "HubSpot",
  metrics: {
    "pipeline-value": {
      // period: the period's first day; periodEnd: the day after its last. Return a number, { value, breakdown }, or null.
      fetch: async ({ period, periodEnd }) => {
        const deals = await myHubSpotClient.openDeals({ from: period, to: periodEnd });
        return { value: deals.total, breakdown: deals.byRegion.map((r) => ({ label: r.name, value: r.total })) };
      },
    },
  },
});
```

```sh
ZIFFR_URL=https://ziffr.example.com ZIFFR_FEED_KEY=zk_... npx ziffr-feed run hubspot.feed.mjs --backfill 24 --dry-run
```

Each run fetches the current period of every Metric, plus any of the `--backfill N` periods before it that have no value yet, and records them. The run asks Ziffr which period is current, so a Feed in another time zone fetches the same periods Ziffr counts. A repeated run with the same values records nothing twice. `--dry-run` shows what would be sent and sends nothing. The command exits with 1 when a fetch failed or Ziffr refused a value, so cron or a CI job reports it.

## With the Usage Feed

[`@ziffr/feed-usage`](../../packages/feed-usage/README.md) is a Feed that brings an Installation's own daily Usage totals into a Workspace of your choice. See [Usage](usage.md).

## With the SQL Feed (no code)

[`@ziffr/feed-sql`](../../packages/feed-sql/README.md) runs one Postgres query per Metric. The file names the environment variable that holds the connection string, never the string itself:

```yaml
# warehouse.yaml
name: Warehouse
connection_env: WAREHOUSE_URL
metrics:
  monthly-revenue:
    value: |
      select sum(amount) from orders
      where paid_at >= :period_start::date and paid_at < :period_end::date
    breakdown: |
      select country, sum(amount) from orders
      where paid_at >= :period_start::date and paid_at < :period_end::date
      group by 1
```

```sh
WAREHOUSE_URL=postgres://readonly@warehouse/db ZIFFR_URL=... ZIFFR_FEED_KEY=... npx ziffr-feed-sql run warehouse.yaml
```

`:period_start` and `:period_end` are bound as parameters, never pasted into the query. Every query runs in a read-only transaction with a 30-second limit (`statement_timeout_ms` changes it). Still, give it a database user that may only read.

### From cron or a GitHub Action

```yaml
# .github/workflows/feed.yml in your own repository
on:
  schedule: [{ cron: "15 5 * * *" }]
jobs:
  feed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx -y @ziffr/feed-sql run warehouse.yaml
        env:
          ZIFFR_URL: https://ziffr.example.com
          ZIFFR_FEED_KEY: ${{ secrets.ZIFFR_FEED_KEY }}
          WAREHOUSE_URL: ${{ secrets.WAREHOUSE_URL }}
```

## From n8n, Zapier or any HTTP client

No kit is needed: a Feed is two endpoints ([reference](../reference/api.md)).

1. `GET /api/v1/feed` lists the Feed's Metrics. For each it gives the slug, the period (`day`, `week`, `month`, `quarter`, `year`), the `current` period's first day, and `filled`: the periods that already have a value. `year_start_month` says which month the workspace's quarters and years start from (1 is January).
2. `POST /api/v1/feed/observations` takes 1 to 500 values and answers with one result per item, in order.

In n8n, add an **HTTP Request** node after the node that reads your CRM:

- Method `POST`, URL `https://ziffr.example.com/api/v1/feed/observations`
- Authentication: Header Auth, name `Authorization`, value `Bearer {{ $env.ZIFFR_FEED_KEY }}` (keep the key in n8n's credentials, not in the workflow)
- Header `Idempotency-Key`: `pipeline-{{ $now.toFormat('yyyy-MM-dd') }}`, so a retried run records nothing twice
- Body (JSON):

```json
{ "items": [{ "metric": "pipeline-value", "value": {{ $json.total }} }] }
```

A ready workflow to start from: [n8n-feed-workflow.json](n8n-feed-workflow.json). Paste it onto an n8n canvas (or use ⋯ → Import from file), replace `https://ziffr.example.com`, `your-metric-slug` and `zk_your_feed_key`, and press Execute workflow: it sends a number from 1 to 5. It has the key in a header field so it works at once; move it into a Header Auth credential before you use it for real, and turn on its daily trigger if you want one value a day. In a trial, **Make a key for n8n** at the end of the Trial guide offers the same workflow with everything filled in.

Leave out `period` to record the current period, or give a period's first day (`2026-10-01`) to fill an earlier one. Each result says `recorded`, `awaiting_approval`, `locked` or `refused`, with a `code` (such as `duplicate` or `period`) for a refusal. `imported: true` marks an Import. One refused item does not stop the rest, so check the results, not only the HTTP status.

## Limits

- About 60 calls a minute and 10,000 values a day per Feed, counted over all its keys. Every value sent counts, refused ones too. A batch that would go over the day's limit is refused as a whole with 429 and `Retry-After`.
- One batch at a time per Feed: a second one sent while the first runs gets 429 with `Retry-After`.
- A batch holds at most 500 values, and its body at most 1 MB.
- A Feed Key gets 403 on every endpoint other than `/feed`, and a person's Access Key gets 403 on `/feed`.

## When something goes wrong

- **`not_found` for a Metric.** The Feed is not one of the Metric's Submitters, or the Metric's API Source is off. Choose the Feed on the Metric again.
- **401.** The key ended, was revoked, or the Feed was deleted. Make a new key on the Feeds page.
- **`duplicate`.** The Metric's Submission Rule rejects a second value for a period. Use "overwrite" for Metrics a Feed keeps current.
- **`locked`.** The period is closed. The value went to the Metric's owner as a proposed Correction.
