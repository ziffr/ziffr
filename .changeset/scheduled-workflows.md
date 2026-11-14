---
"@ziffr/web": minor
---

Workflows run on their own: a job your scheduler calls every hour runs each workspace's Workflows once a day at its run hour, in its own time zone, asking for missing values, reminding and escalating on the days the Workflow says, and reminding people of tasks due within two days. Self-hosters: run the new migration and call `POST /api/jobs/workflows` hourly with `ZIFFR_JOB_SECRET` (see `docs/guides/jobs.md`).
