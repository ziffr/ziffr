---
"@ziffr/web": patch
---

Developers: the SQL Feed file takes an optional `dialect` line (`postgres`, `bigquery` or `snowflake`; Postgres stays the default) and binds the period's dates in each dialect's own syntax. The BigQuery and Snowflake drivers follow.
