# 0048 Warehouse Feeds: BigQuery and Snowflake fill Metrics like Postgres does

**Status:** built (tickets 1 to 5). **Ticket:** tracking issue #908, tickets #909, #910, #911, #912, #913 (the owner's wish, 2026-11-23).

## Problem Statement

Many teams keep their numbers in a data warehouse, most often BigQuery or Snowflake. Today the SQL Feed (`@ziffr/feed-sql`) reads Postgres only, so those teams must write their own Feed with the feed kit or copy numbers by hand. They will not give Ziffr the login to a warehouse, and they should not have to: a warehouse login is among the most sensitive a company has.

## Solution

1. **Two more drivers for the SQL Feed**, BigQuery and Snowflake, behind the same file. One query per Metric gives each period's value (and, optionally, its Breakdown); the Feed runs where the person puts it (cron, a container, a scheduled job), with a read-only identity they own. Ziffr never runs the query and never holds the warehouse login (ADR 0006).
2. **Automation Templates for n8n** (spec 0043's mechanism) for the same two sources: an importable flow that runs a query on a schedule through n8n's BigQuery or Snowflake node and sends the figures to a Feed's endpoint. For people who already use n8n and do not want to run a command-line Feed.
3. **Guidance on cost and safety** in the Feed's README and the user guide: a read-only role, a query cost cap, and what a good Metric query looks like.

## User Stories

1. As an Owner with our revenue in BigQuery, I want one query per Metric in a file, so that Ziffr fills itself each month without anyone retyping.
2. As a data engineer, I want to run the Feed with my own service account, so that no warehouse login ever reaches Ziffr.
3. As a data engineer, I want a query that would scan too much to be refused, so that a Metric query cannot run up a bill.
4. As a person with Snowflake and n8n, I want to import a flow that runs my query and sends the figures, so that I run nothing myself.
5. As a maintainer, I want every driver and template tested against the real Feed endpoint, so that a change to Ziffr cannot silently break them.
6. As a self-hoster, I want it all to work with no connection to anyone, so that nothing about my Ziffr leaves it.

## Implementation Decisions

### Words

No new term: this is a **Feed** (GLOSSARY) and an **Automation Template**. The file keeps its name and shape; only `connection_env` and a `dialect` line change, below.

### The drivers

- **One runner interface.** `SqlRunner` (`query(text, params)`, `close()`) already separates the Feed from Postgres. BigQuery and Snowflake are two more implementations of it, each in its own file, so the Feed's logic is written once.
- **Choosing the dialect.** An optional `dialect: postgres | bigquery | snowflake` line in the file (default `postgres`), and the connection comes from environment variables, never the file: Postgres keeps `WAREHOUSE_URL`; BigQuery reads the standard application default credentials (`GOOGLE_APPLICATION_CREDENTIALS`) and a `project`; Snowflake reads its account, user and key-pair from the environment.
- **Parameters.** Queries keep writing `:period_start` and `:period_end`; each driver binds them as its own query parameters (BigQuery named, Snowflake bind variables). They are never pasted into the text, and no other parameter is allowed. A date comes as a date, in all three.
- **Read-only and bounded.** Postgres already runs in a read-only transaction with a timeout. BigQuery: a dry run first, and a refusal above `max_bytes_billed` (default 10 GB, set in the file); the job runs with that cap too. Snowflake: a statement timeout and a read-only role named in the file's documentation; the driver refuses any statement that is not a single `select`.
- **Packages.** The vendor libraries are heavy, so each driver is an optional peer dependency loaded on use: Postgres users install nothing new.

### The n8n templates

Built the way spec 0043 builds its templates (shared skeleton, generated into `docs/automations/`, a contract test against the real Feed endpoint): `bigquery-feed.json` and `snowflake-feed.json`, each with a query per Metric in one node the person edits, a schedule, and the Feed address and slugs filled in by **Get this flow from Ziffr**. The Feed Key is entered in n8n, not written into the file.

## Testing Decisions

- The Feed's logic is tested once with a fake runner; each driver has tests of its parameter binding, its refusal of anything but a `select`, and its cost cap, against a recorded or emulated service (the BigQuery emulator and a Snowflake stub), never a real account in CI.
- Each template passes the contract test of spec 0043 and a validation with the n8n tooling.
- A real BigQuery and a real Snowflake try is the owner's, as with the other templates.

## Tickets

1. Dialect line, runner selection and parameter binding per dialect in `feed-sql`; docs. (First.)
2. BigQuery driver: dry run, byte cap, application default credentials. (Blocked by 1.)
3. Snowflake driver: key-pair login, statement timeout, single-select check. (Blocked by 1.)
4. n8n templates for BigQuery and Snowflake and their contract tests. (Blocked by spec 0043's tickets; independent of 2 and 3.)
5. User guide chapter and the READMEs: cost, roles, a worked example for each warehouse. (Blocked by 2 and 3.)

## Out of Scope

- Ziffr connecting to a warehouse itself, or storing its login: no (ADR 0006).
- Other warehouses (Redshift, Databricks, ClickHouse): the runner interface keeps the door open; each is its own ticket if asked for.
- A visual query builder.

## Further Notes

The README already says "Other SQL dialects are not yet" supported; this spec is that "yet". A query cost cap is a safety feature, not a billing feature: Ziffr cannot know a customer's prices. The drivers, templates and guide were checked against fakes and the n8n tooling only; a real try against a BigQuery project and a Snowflake account is the owner's.
