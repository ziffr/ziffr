# Scheduled jobs

Two things in Ziffr happen on a clock, and something outside Ziffr has to call them: your platform's scheduler, a cron line on the server, or any service that can make an HTTP request. Both take the same secret and are safe to call as often as you like.

```sh
ZIFFR_JOB_SECRET=$(openssl rand -hex 32)   # at least 32 characters; without it both jobs are off
```

| Job | Call it | What it does |
| --- | --- | --- |
| `POST /api/jobs/workflows` | every hour | Runs each workspace's Workflows once a day, at its run hour in its own time zone: asks for missing values, reminds before the Due Date, escalates after it, reminds people of tasks due within two days ([spec 0005](../specs/0005-workflows-on-a-clock.md)), and takes the Snapshots of dashboards set to take them by themselves once their period's Metrics are Locked or their wait is over ([spec 0013](../specs/0013-dashboard-snapshots.md)) |
| `POST /api/jobs/demo-reset` | once a night, only for a public demo | Resets the demo workspace, as its reset button does, so a demo anyone may try starts each day clean. Answers `{ "reset": false }` when a visitor reset it less than a minute before, and 404 where the demo is off. Docker Compose calls it at 03:30 UTC when `ZIFFR_DEMO_ONLY=1` |
| `POST /api/jobs/deliveries` | every few minutes | Sends emails, Slack and Telegram messages that are waiting: the day's Prompts, reminders and Escalations from the Workflow run, reminders and requests for missing values sent from the Connectors page, retries after a failure, and ones held back by the sending limits ([email](email.md), [Slack](slack.md)) |

```sh
# crontab, for example
0 * * * *    curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://ziffr.example.com/api/jobs/workflows
*/5 * * * *  curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://ziffr.example.com/api/jobs/deliveries
```

Without the secret, or with a wrong one, a job answers 404. With it, a job answers only counts: how many workspaces ran or failed, how many emails and Slack messages were sent or failed.

## The day's run

Owners and Admins set the workspace's time zone and the hour its Workflows run on the Team page (UTC and 08:00 until they do). The first call after that hour runs the day; every later call that day does nothing for that workspace, also when two servers call at once. A workspace whose run fails is marked so and the others go on; the next day runs as usual. The demo is never run by the clock.
