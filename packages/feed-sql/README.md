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

Postgres and databases that speak its protocol are supported. Other SQL dialects are not yet. To read another system, write your own Feed with [`@ziffr/feed-kit`](../feed-kit/README.md).
