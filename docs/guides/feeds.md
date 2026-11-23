# Feeds

A Feed brings values for some Metrics into Ziffr from another system, such as a CRM, a data warehouse or a help desk ([spec 0012](../specs/0012-feeds.md), [ADR 0006](../adr/0006-feeds-run-outside-ziffr.md)). It is a program that runs wherever you like: cron, a GitHub Action, a container, an n8n or Zapier automation. It sends values through the API with a **Feed Key**. Ziffr never runs a Feed's code and never holds the other system's credentials.

A Feed belongs to the workspace, not to a person. Its values show up under its name ("HubSpot"), and it keeps working when the person who set it up leaves. A Feed Key can do one thing: record values for the Metrics that take the Feed as a Submitter. It can see their descriptions and which periods already have a value, never the values themselves, the people or any other Metric.

## Setting one up

1. **Create the Feed.** In Settings, Feeds (Owners and Admins only), create a Feed named after the system it reads, such as "HubSpot".
2. **Make a Feed Key.** On the same page, create a key for the Feed with an end date within a year. Copy it: it is shown once. Set it as `ZIFFR_FEED_KEY` where the Feed runs, next to `ZIFFR_URL` (where Ziffr runs).
3. **Choose the Feed on each Metric.** On a Metric's Description tab, under "Who submits", pick the Feed in "Values from a Feed" and press Add. That turns on the Metric's API Source ("API and Feeds"). A Metric's owner and its Editors can do this.
4. **Run it.** Pick one of the three ways below.

The Feeds page shows, for each Feed, its keys and their recent calls, the Metrics it submits to, when it last called, and how many values it recorded and had refused in the last 24 hours.

## How values are checked

A Feed's values go through the same rules as anyone's: the Metric's Submission Rule, Locks and Approvals. Two things are different:

- **Imports.** A value for a past period that has no value yet is an Import. It is recorded without the Unusual Value check, so connecting two years of history does not raise hundreds of Approvals. The Metric's history marks it "imported". A value for the current period, or one that replaces an existing value, is checked as usual, and a locked period stays locked.
- **No Prompts.** Nobody asks a Feed for a value. When a Feed's value is still missing after the Due Date, the Metric's Workflow escalates to the Metric's owner and names the Feed. Use an Escalation step in the Workflow so that a broken Feed gets noticed.

A Metric fed by a program should usually use the Submission Rule "overwrite". Then a value that changes during the current period (pipeline value, open tickets) simply replaces the earlier one.

## With the feed kit (TypeScript)

[`@ziffr/feed-kit`](../../packages/feed-kit/README.md) gives you the contract and a runner. You write how to fetch one period's value; the runner does the rest:

```ts skip="a Feed for HubSpot, needs a HubSpot account"
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

```sh skip="needs a Feed Key and the HubSpot Feed; the feed kit's own app test runs a Feed against the app"
ZIFFR_URL=https://ziffr.example.com ZIFFR_FEED_KEY=zk_... npx ziffr-feed run hubspot.feed.mjs --backfill 24 --dry-run
```

Each run fetches the current period of every Metric, plus any of the `--backfill N` periods before it that have no value yet, and records them. The run asks Ziffr which period is current, so a Feed in another time zone fetches the same periods Ziffr counts. A repeated run with the same values records nothing twice. `--dry-run` shows what would be sent and sends nothing. The command exits with 1 when a fetch failed or Ziffr refused a value, so cron or a CI job reports it.

## With the Usage Feed

[`@ziffr/feed-usage`](../../packages/feed-usage/README.md) is a Feed that brings an Installation's own daily Usage totals into a Workspace of your choice. See [Usage](usage.md).

## With the GitHub Feed

[`@ziffr/feed-github`](../../packages/feed-github/README.md) is a Feed that brings the download counts, stars and forks of a GitHub repository into a Workspace. See [GitHub Feed](github-feed.md).

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

```sh skip="needs a warehouse database"
WAREHOUSE_URL=postgres://readonly@warehouse/db ZIFFR_URL=... ZIFFR_FEED_KEY=... npx ziffr-feed-sql run warehouse.yaml
```

`:period_start` and `:period_end` are bound as parameters, never pasted into the query. Every query runs in a read-only transaction with a 30-second limit (`statement_timeout_ms` changes it). Still, give it a database user that may only read.

It also reads BigQuery and Snowflake: add `dialect: bigquery` or `dialect: snowflake` and install the vendor package yourself. The user guide's [Fill from a data warehouse](../user-guide/10-metrics.md#fill-from-a-data-warehouse) has the role, cost limit and a worked example for each, and says when the n8n templates are the better fit.

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

### A webhook that other systems call

When the other system can call a URL but not Ziffr's API (a form tool, a shop, a script that only knows webhooks), put an n8n automation in between (not a Ziffr [Webhook](webhooks.md), which only sends messages out). [`n8n-webhook-workflow.json`](n8n-webhook-workflow.json) is a ready one: import it in n8n (Workflows, Import from File), then

1. make a Header Auth credential **Ziffr webhook secret** with the name `X-Webhook-Secret` and a long random value, and give that header to whoever calls the webhook;
2. make a Header Auth credential **Ziffr Feed Key** with the name `Authorization` and the value `Bearer zk_…`;
3. set `ZIFFR_URL` at the top of the **Check and shape** node, and publish the automation.

The webhook takes one value, `{ "metric": "sign-ups", "value": 1 }`, with an optional `period` and `breakdown`, or `{ "items": [ … ] }` with up to 500. It refuses calls without the secret (403) and bodies that are not values (400) before anything reaches Ziffr, passes an `Idempotency-Key` header on, and answers with Ziffr's results. Whoever knows the secret can send values for every Metric the Feed submits to, so give the Feed only the Metrics the webhook is meant for. For a Metric that counts events, such as one sign-up per call, use the Submission Rule "add up".

## Limits

- About 60 calls a minute and 10,000 values a day per Feed, counted over all its keys. Every value sent counts, refused ones too. A batch that would go over the day's limit is refused as a whole with 429 and `Retry-After`.
- One batch at a time per Feed: a second one sent while the first runs gets 429 with `Retry-After`.
- A batch holds at most 500 values, and its body at most 1 MB.
- A Feed Key gets 403 on every endpoint other than `/feed`, and a person's Access Key gets 403 on `/feed`.

## When something goes wrong

There are two kinds of answer, and a program should look at both.

**The request is not right: the whole call is refused (a 4xx), nothing in it is recorded, and the error names the field.** The answer is `{ "error": { "code": "…", "message": "…" } }`, and a message such as `items.1.value: Invalid input: expected number, received string` says which item and which field. Fix the request and send it again.

| You got | It means | What to do |
|---|---|---|
| **401** `unauthorized` | No `Authorization: Bearer zk_…` header, a wrong key, a key that ended or was revoked, or its Feed was deleted. A key in the address (`?key=`) is never read. | Send the key in the header. Make a new key under **Settings → Feeds**. |
| **403** `forbidden` | A person's Access Key on `/feed`, or a Feed Key on any other endpoint. | Use a Feed Key for `/feed`. |
| **400** `invalid_request`, "not valid JSON" or "Content-Type" | The body is not JSON, or the header is not `Content-Type: application/json`. | Send JSON with that header. |
| **400**, `items: …` | No `items`, not a list, empty, or more than 500. | Send 1 to 500 items. |
| **400**, `items.N.metric` | Not a Metric slug: lower case letters, digits and hyphens, at most 100 (not the name, not capitals or spaces). | Use the slug `GET /api/v1/feed` lists. |
| **400**, `items.N.value` | Not a number: text such as `"12"` or `"12%"`, `null`, missing, or too big to hold. | Send a JSON number, `12`, with no unit or sign. |
| **400**, `items.N.period` | Not a day written `YYYY-MM-DD` (`October`, `2026-10-01T00:00:00Z`, `2026-13-45`). | Send the period's first day, or leave it out for the current period. |
| **400**, `items.N.breakdown…` | A row without a label or with a value that is not a number, or more than 500 rows. | Fix the row. |
| **400**, a field Ziffr does not know | Only `metric`, `period`, `value` and `breakdown` are taken, and only `items` in the body. | Remove the extra field. |
| **400**, `Idempotency-Key` | Not 1 to 200 visible ASCII characters. | Use a plain string such as `crm-2026-10-01`. |
| **400**, "larger than 1 MB" | The body is too big. | Send fewer items, or fewer Breakdown rows. |
| **409** `conflict` | The same `Idempotency-Key` with another body, or its first call is still running. | Use a new key for new values; wait for the first call. |
| **429** `rate_limited` | The Feed's 10,000 values a day, its 60 calls a minute, or another batch is still running. `Retry-After` says when. | Wait that many seconds; send fewer values. |
| **500** `internal` | A fault in Ziffr. Nothing is promised about the batch. | Try again with the same `Idempotency-Key`, so nothing is recorded twice. |

**A value is not right: the call answers 200, and that item is `refused` with a `code`, while the rest of the batch still runs.** Look at `results`, one per item in the order you sent them, not only at the HTTP status.

| `code` | It means | What to do |
|---|---|---|
| `not_found` | The Feed is not one of the Metric's Submitters, the slug is wrong, the Metric is not of this Workspace, or the Metric's API Source is off (a Feed does not see such a Metric). | Choose the Feed under the Metric's **Who submits** and keep its API Source on; check the slug against `GET /api/v1/feed`. |
| `period` | Not the first day of one of the Metric's periods (a month's `2026-10-15`), or in the future. | Send the first day of the period. |
| `duplicate` | The Metric's Submission Rule rejects a second value for a period. | Use "overwrite" for Metrics a Feed keeps current, or do not resend a period that has a value (`filled` in `GET /feed`). |
| `archived` | The Metric is archived. | Restore it, or stop sending. |
| `derived` | A Derived Metric is computed, never sent. | Send its inputs. |
| `period_condensed` | The period was condensed by a Retention. | It takes no more values. |
| `no_value` | The value is not a number. | Send a number. |

Two answers that are not refusals: `awaiting_approval` (an Unusual Value, or a Workflow that approves every value: it waits for a person and is not lost) and `locked` (the period is closed; the value went to the Metric's owner as a proposed Correction). `imported: true` marks a past period that had no value, recorded without the Unusual Value check.

These are tested as one table (`sender-errors.db.test.ts`), so a change to Ziffr that makes one of them silently different fails there.
