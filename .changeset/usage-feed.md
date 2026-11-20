---
"@ziffr/web": minor
---

Self-hosters: the new Usage Feed brings your Installation's daily totals (Workspaces, people, values by Source, views) into a Workspace of your own as Metrics. It is off until you set `ZIFFR_USAGE_KEY` (made on the Installation Settings page) and `ZIFFR_USAGE_FEED_KEY` (a Feed Key from that Workspace). Docker Compose then runs it every day at 05:00 UTC; with either key missing nothing runs and nothing is sent. The new guide "Usage" has the setup.
