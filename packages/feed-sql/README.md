# @ziffr/feed-sql

A ready [Ziffr](https://github.com/ziffr/ziffr) Feed for SQL databases: one Postgres query per Metric gives each period's value, and the [feed kit](../feed-kit/README.md) records it in Ziffr on a schedule. No code to write. MIT licensed, Node 20 or later. It also serves as the reference example of a Feed built on `@ziffr/feed-kit`.

## Setting it up

1. In Ziffr, an Owner or Admin opens Settings, Feeds, creates a Feed ("Warehouse") and a Feed Key, and copies the key. Each Metric's owner adds the Feed on the Metric's Description tab, "Who submits".
2. Write a file with one query per Metric slug:

```yaml
# warehouse.yaml
name: Warehouse
# The environment variable that holds a read-only connection string. Never put the string itself in this file.
connection_env: WAREHOUSE_URL
metrics:
  monthly-revenue:
    # One row; its first column is the value. No row, or null, means no value yet.
    value: |
      select sum(amount) from orders
      where paid_at >= :period_start::date and paid_at < :period_end::date
    # Optional: rows of label and value, the value's Breakdown.
    breakdown: |
      select country, sum(amount) from orders
      where paid_at >= :period_start::date and paid_at < :period_end::date
      group by 1
```

3. Run it:

```sh skip="needs a Feed Key and a warehouse database"
export ZIFFR_URL=https://ziffr.example.com ZIFFR_FEED_KEY=zk_... WAREHOUSE_URL=postgres://readonly@warehouse:5432/db
npx @ziffr/feed-sql run warehouse.yaml --dry-run
npx @ziffr/feed-sql run warehouse.yaml --backfill 24
```

## Safe by default

- `:period_start` (the period's first day) and `:period_end` (the day after its last) are bound as query parameters, never pasted into the text. No other parameter is allowed.
- Every query runs in a read-only transaction, with a 30-second statement timeout (`statement_timeout_ms` in the file changes it). Still, give the Feed a database user that may only read the tables it needs.
- The file holds no secret, so you can keep it in git next to the schedule that runs it.

## Dialects

An optional `dialect` line in the file names the database language: `postgres` (the default), `bigquery` or `snowflake`. Queries always write `:period_start` and `:period_end`; the Feed turns them into the dialect's own bound parameters and hands the runner the two dates as `[period_start, period_end]`:

| Dialect | Parameters in the query sent | Runner |
| --- | --- | --- |
| `postgres` | `$1`, `$2` | built in, connection string from `connection_env` |
| `bigquery` | named `@period_start`, `@period_end` | the optional package `@google-cloud/bigquery` |
| `snowflake` | numbered binds `:1`, `:2` | the optional package `snowflake-sdk` |

The BigQuery and Snowflake drivers are optional: a file that names one when its package is not installed stops with a message naming what to install, and Postgres users install nothing new. Each driver is one file next to `src/index.ts` that exports `connect(config, env)` and gives back a `SqlRunner`; its connection comes from the environment, never from the file. To read another system, write your own Feed with [`@ziffr/feed-kit`](../feed-kit/README.md).

## BigQuery

Set `dialect: bigquery`, install the optional package (`npm install @google-cloud/bigquery`) and name the Google Cloud project to bill, in the file or as `GOOGLE_CLOUD_PROJECT`. The Feed signs in with application default credentials (`GOOGLE_APPLICATION_CREDENTIALS` or the machine's own identity); no key goes in the file.

```yaml
name: Warehouse
dialect: bigquery
project: my-company-data
max_bytes_billed: 10737418240 # optional; 10 GB is the default
metrics:
  monthly-revenue:
    value: |
      select sum(amount) from `my-company-data.sales.orders`
      where order_date >= :period_start and order_date < :period_end
```

- Give the identity the roles BigQuery Data Viewer (on the datasets it reads) and BigQuery Job User (on the project), nothing that can write.
- `:period_start` and `:period_end` are bound as `DATE` parameters. Only a single `select` (or `with ... select`) is allowed; anything else is refused before it reaches BigQuery.
- Every query is dry-run first. If the estimate is above `max_bytes_billed` the Feed stops with a message naming the estimate and the limit; otherwise the job runs with the same limit and a time limit (`statement_timeout_ms`, 60 seconds by default).
- BigQuery bills by bytes scanned, so filter on the table's partition column (as above) to keep a query far below the limit.
