---
"@ziffr/web": minor
---

Developers: `DELETE /api/v1/metrics/{slug}?confirm=<name>` (scope `metrics:write`), the SDK's `metrics.delete` and the MCP tool `delete_metric` delete a Metric the key's creator owns, with the same refusals as the app; the Audit Log names the key.
