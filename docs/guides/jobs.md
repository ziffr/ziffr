# Scheduled jobs

Two things in Ziffr happen on a clock, and something outside Ziffr has to call them: your platform's scheduler, a cron line on the server, or any service that can make an HTTP request. Both take the same secret and are safe to call as often as you like.

```sh
ZIFFR_JOB_SECRET=$(openssl rand -hex 32)   # at least 32 characters; without it both jobs are off
```

| Job | Call it | What it does |
| --- | --- | --- |
| `POST /api/jobs/workflows` | every hour | Runs each workspace's Workflows once a day, at its run hour in its own time zone: asks for missing values, reminds before the Due Date, escalates after it, and reminds people of tasks due within two days ([spec 0005](../specs/0005-workflows-on-a-clock.md)) |
| `POST /api/jobs/deliveries` | every few minutes | Sends emails that are waiting: retries after a failure, and ones held back by the sending limits ([email](email.md)) |

```sh
# crontab, for example
0 * * * *    curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://ziffr.example.com/api/jobs/workflows
*/5 * * * *  curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://ziffr.example.com/api/jobs/deliveries
```

Without the secret, or with a wrong one, a job answers 404. With it, a job answers only counts: how many workspaces ran or failed, how many emails were sent or failed.

## The day's run

Owners and Admins set the workspace's time zone and the hour its Workflows run on the Team page (UTC and 08:00 until they do). The first call after that hour runs the day; every later call that day does nothing for that workspace, also when two servers call at once. A workspace whose run fails is marked so and the others go on; the next day runs as usual. The demo is never run by the clock.
