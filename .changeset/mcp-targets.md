---
"@ziffr/web": minor
"@ziffr/mcp": minor
"@ziffr/sdk": minor
---

An assistant connected to Ziffr, and programs with an Access Key, can now change a Metric's Target Range and Polarity, its Target Series (such as a monthly budget), its Projections, and when a value counts as an Unusual Value in a Workflow you own. They need the new permission "Change metrics", which you tick when you make a key or connect an assistant; keys and assistants you connected before cannot do this. A new ready-made request, "Set targets", turns a sentence such as "budget 5000 a month for revenue in 2027" into targets after you confirm them.

Developers: the scope `metrics:edit`; `PATCH /api/v1/metrics/{slug}`, `GET` and `POST /api/v1/metrics/{slug}/target-series` and `/projections`, and `GET` and `PATCH /api/v1/metrics/{slug}/unusual-value-check`; in `@ziffr/sdk`, `metrics.update`, `metrics.unusualValueCheck`, `metrics.setUnusualValueCheck`, `targetSeries` and `projections`; in `@ziffr/mcp`, the tools `update_metric`, `list_target_series`, `set_target_series`, `list_projections`, `set_projections`, `get_unusual_value_check` and `set_unusual_value_check`.
