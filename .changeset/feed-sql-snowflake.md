---
"@ziffr/web": patch
---

Developers: the SQL Feed reads Snowflake with `dialect: snowflake`. It logs in with a key pair from the environment, runs each query with a statement timeout, and refuses anything that is not a single select. You install the `snowflake-sdk` package yourself.
