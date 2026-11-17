---
"@ziffr/web": minor
---

Developers: the API, `@ziffr/sdk`, the MCP server and `@ziffr/feed-kit` accept and return the periods `quarter` and `year`. `GET /api/v1/workspace` (`ziffr.workspace()`, the MCP tool `get_workspace`) and `GET /api/v1/feed` say which month the fiscal year starts in. The Metric Catalog suggests Net Promoter Score, Employee Net Promoter Score and Headcount as quarterly Metrics, and Annual revenue and Annual revenue target as yearly ones.
