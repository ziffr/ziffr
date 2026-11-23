---
"@ziffr/web": patch
---

Developers: the SQL Feed can read BigQuery (`dialect: bigquery`) with application default credentials. Each query is dry-run first and refused above `max_bytes_billed` (10 GB by default), and only a single select is allowed.
