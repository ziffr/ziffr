---
"@ziffr/web": minor
---

Self-hosters: an Installation Admin can now give each Workspace a Workspace Limit, the most Metrics it may hold, or set a default for all with `ZIFFR_DEFAULT_METRICS_LIMIT` and `ZIFFR_DEFAULT_LIMIT_LABEL` (on the Installation Settings page or on the server). Without one nothing changes. Over its limit a Workspace keeps working and keeps collecting values; only new Metrics wait, after 14 days with room for 10 % more. The API answers such a refusal with 403 `workspace_limit` and the count and limit.
