---
"@ziffr/web": minor
---

Developers: the API's dashboard widgets take and return `display`, the period a widget shows its Metric by ("quarter", "half", "year", and "week" or "month" for shorter Metrics; `null` for its own). The SDK and the MCP tools `add_widget` and `update_widget` take it too.
