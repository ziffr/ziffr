---
"@ziffr/web": minor
---

Programs and assistants can now work with Tags: every Metric read lists its `tags`, `GET /api/v1/metrics?tag=...` and the MCP `list_metrics` filter by Tag, `GET /api/v1/tags` and the new MCP tool `list_tags` list the Tags you see, and creating or changing a Metric through the API, the SDK or MCP accepts `tags`. Renaming, merging and deleting Tags stays on the Tags page.
