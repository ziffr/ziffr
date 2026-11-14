---
"@ziffr/web": minor
"@ziffr/sdk": minor
"@ziffr/mcp": minor
---

Developers: `@ziffr/sdk` gains `metrics.create`, and `@ziffr/mcp` a `create_metric` tool, so a script or an assistant can start tracking a new metric with a key that may create metrics. Both send an idempotency key, so a retry never makes two.
