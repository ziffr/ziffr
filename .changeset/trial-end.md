---
"@ziffr/web": minor
---

Developers: a Trial Workspace shows its days left on every page, reminds its Owner the day before it ends, then closes (keys stop, Slack and Telegram unlinked) and is deleted a week later with its Owner, by the new job `POST /api/jobs/trial-cleanup`; its Owner can download its values as CSV or end it at once. Self-hosters: Docker Compose calls the job hourly when `ZIFFR_TRIAL_DAYS` is set, and then also resets the shared demo nightly.
