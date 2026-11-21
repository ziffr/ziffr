---
"@ziffr/web": minor
"@ziffr/mcp": minor
---

Assistants that support MCP Apps now show a small inline view for `get_metric` (latest value, change, Target Range, sparkline and the last periods), `get_dashboard` (its introduction and tiles, with an "Open in Ziffr" link) and `period_status` (the count of values in and the events in order). The views are read-only, load nothing from outside, follow the assistant's light or dark theme, and show only what the tool's text answer already shows; other assistants get the same text as before.
