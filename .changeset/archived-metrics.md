---
"@ziffr/web": minor
---

Metrics you no longer track can be archived instead of deleted: an Archived Metric keeps its values and history and stays readable, but nobody is asked for it and it takes no values until it is brought back. Owners, Admins and the Metric's owner archive it on its page; the Metrics list shows Archived Metrics under their own filter. Developers: `GET /api/v1/metrics?archived=true` lists them, `POST /api/v1/metrics/{slug}/archive` and `/restore` archive and bring back, and the MCP server has `archive_metric` and `restore_metric`.
