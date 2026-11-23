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

## Snowflake

Set `dialect: snowflake` and install the driver next to the Feed (`npm install snowflake-sdk`). Login is by key pair and comes from the environment only; the file may name `warehouse`, `role`, `database` and `schema` (names, never secrets):

```yaml
name: Warehouse
dialect: snowflake
warehouse: FEED_WH
role: ZIFFR_FEED_RO
database: ANALYTICS
metrics:
  monthly-revenue:
    value: select sum(amount) from orders where paid_at >= :period_start and paid_at < :period_end
```

```sh skip="needs a Snowflake account"
export SNOWFLAKE_ACCOUNT=myorg-myaccount SNOWFLAKE_USER=ZIFFR_FEED
export SNOWFLAKE_PRIVATE_KEY_PATH=/secure/ziffr_feed.p8   # or SNOWFLAKE_PRIVATE_KEY with the PEM text
export SNOWFLAKE_PRIVATE_KEY_PASSPHRASE=...               # only if the key is encrypted
```

- **Key pair:** create the key with `openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out ziffr_feed.p8` (add `-nocrypt` for none) and attach its public half to the user: `alter user ZIFFR_FEED set rsa_public_key=...`.
- **A read-only role:** give the user a role that may only read, for example `grant usage on warehouse FEED_WH`, `grant usage on database ANALYTICS` and `grant select on all tables in schema ANALYTICS.PUBLIC`, all `to role ZIFFR_FEED_RO`.
- **A small warehouse:** point the Feed at an X-Small warehouse with auto-suspend, so a run costs little.
- **The role is the real control.** Snowflake enforces what the role may do; the driver's text check (one `select` or `with ... select`, no `$$` blocks, none of the words call, procedure, execute, copy, put, get, create, alter, drop, grant, insert, update, delete, merge or truncate outside quoted strings) and the session setting `MULTI_STATEMENT_COUNT=1` (the server refuses batches) are backups, not a substitute.
- **Bounded:** each query binds the period as `:1` and `:2`, runs with a statement timeout (`statement_timeout_ms`, 30 seconds by default), and the driver refuses anything that is not one `select` (or `with ... select`) statement: no semicolon-separated batches, no DDL, DML, `call` or `copy`.
