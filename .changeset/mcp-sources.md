---
"@ziffr/web": minor
"@ziffr/mcp": minor
"@ziffr/sdk": minor
---

An assistant that creates a Metric for you now asks how its values should come in and who sends them, and with "Change metrics" it can change a Metric's Sources and add or remove its Submitters later, for the Metrics you own or edit. A new ready-made request, "Start tracking", sets up a Metric with you step by step. The "Change metrics" box on the key form and the consent screen now explains what it covers on a line of its own.

Developers: `sources` and `submitters` on `POST /api/v1/metrics` (submitters need `metrics:edit`), `sources` on `PATCH /api/v1/metrics/{slug}` and in every Metric answer, `GET` and `POST /api/v1/metrics/{slug}/submitters`, and `GET /api/v1/feeds`; in `@ziffr/sdk`, `metrics.submitters`, `metrics.setSubmitters` and `feeds()`; in `@ziffr/mcp`, the tools `list_submitters`, `set_submitters` and `list_feeds`, and the Starter `start_tracking`.
