---
"@ziffr/web": minor
"@ziffr/mcp": minor
---

An assistant connected to Ziffr can now set up a Metric in one request: `create_metric` takes a schedule (time of day and weekdays), asks the person by default, records a first value, and answers with the Metric's link, the defaults it used and when the person is asked next. `get_workspace` now says the time zone, the default time of asking, the week start and how the person can be reached, and a Workflow lists the Metrics that use it.
