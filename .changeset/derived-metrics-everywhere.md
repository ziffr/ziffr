---
"@ziffr/web": minor
"@ziffr/sdk": minor
"@ziffr/mcp": minor
---

A Metric can now be calculated from other Metrics without a Pack. New metric has **Calculated from other Metrics**: pick the Metrics, add `+ - * /`, brackets and numbers, and Ziffr takes the period and unit from them. Formulas can now look at the period before: `change({odometer})` is this period's value minus the previous one's (the kilometres driven per day is `change({odometer}) / 7` from a weekly reading) and `prev({odometer})` the previous period's value. A Metric made with these is shown by its own period only. An assistant connected through MCP, and programs through the API and the SDK, make one with `create_metric` and `formula`, and `create_metric` now takes `aggregation` (use "last" for a reading such as an odometer); the answer says which period, unit and decimals Ziffr chose.
