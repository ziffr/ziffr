---
"@ziffr/web": minor
---

Self-hosters: a new job, `POST /api/jobs/heads-ups`, runs hourly (Docker Compose calls it at ten past). It looks through each Workspace's Metrics for pairs that have started or stopped moving together, and keeps what it finds in a new table that only Ziffr itself can read. Heads-ups are judged against every pair that was looked at, so a Workspace where nothing stands out hears nothing. Each person's Heads-ups are made only from the Metrics they may see. Nothing shows them yet: the list under Analyze comes next.
