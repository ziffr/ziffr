---
"@ziffr/web": minor
"@ziffr/mcp": minor
---

An assistant connected to Ziffr can now change a Metric's name, description, unit, format, period (while it has no values), Submission Rule and "Values arrive by" with `update_metric`, give a Metric a Workflow such as "Ask me each day" with `set_metric_workflow` or when creating it, and see a Metric's Workflow and next Due Date. A Metric it creates keeps the API as a way for values to arrive unless told otherwise, and a refused value says which ways the Metric takes. The REST API's `PATCH /metrics/{slug}` and `POST /metrics` take the same fields.
