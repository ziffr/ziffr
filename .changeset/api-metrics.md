---
"@ziffr/web": minor
---

Programs can list the Metrics they may read through the new API: `GET /api/v1/metrics` with an Access Key in the `Authorization` header. Errors share one JSON shape, lists page with a cursor, and a Metric the key's creator may not see is not found. See `docs/guides/api.md`.
