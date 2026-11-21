# Scheduled jobs

Things in Ziffr happen on a clock, and something outside Ziffr has to call them: your platform's scheduler, a cron line on the server, or any service that can make an HTTP request. They all take the same secret and are safe to call as often as you like.

```sh
ZIFFR_JOB_SECRET=$(openssl rand -hex 32)   # at least 32 characters; without it every job is off
```

| Job | Call it | What it does |
| --- | --- | --- |
| `POST /api/jobs/workflows` | every hour | Runs each workspace's Workflows once a day, at its run hour in its own time zone: asks for missing values, reminds before the Due Date, escalates after it, reminds people of tasks due within two days ([spec 0005](../specs/0005-workflows-on-a-clock.md)), and takes the Snapshots of dashboards set to take them by themselves once their period's Metrics are Locked or their wait is over ([spec 0013](../specs/0013-dashboard-snapshots.md)) |
| `POST /api/jobs/demo-reset` | once a night, only for a public demo | Resets the demo workspace, as its reset button does, so a demo anyone may try starts each day clean. Answers `{ "reset": false }` when a visitor reset it less than a minute before, and 404 where the demo is off. Docker Compose calls it at 03:30 UTC when `ZIFFR_DEMO_ONLY=1` |
| `POST /api/jobs/trial-cleanup` | every hour, only where trials are offered | Reminds the Owners of Trial Workspaces that end within a day (once each), closes those that ended (revokes their keys, disconnects Slack and Telegram) and deletes those that ended a week ago with everything in them, and their Owners when it was their only workspace (spec 0021). Answers counts only, and 404 where trials are off. Docker Compose calls it at twenty past every hour when `ZIFFR_TRIAL_DAYS` is set |
| `POST /api/jobs/unused-workspaces` | daily | Where `ZIFFR_DELETE_UNUSED_AFTER_DAYS` and a default Workspace Limit are set: warns the Owners of Workspaces on the default limit unused for that many days (once each) and deletes those still unused 14 days after their warning, key first (spec 0029). Answers counts only, and does nothing where the setting is off. Docker Compose calls it at 04:10 UTC |
| `POST /api/jobs/usage-digest` | daily | On days 1 to 7 of a month, queues the monthly usage email to each Owner of a Workspace that has something unused (not trials, not the demo, not within 90 days of counting), once per Owner and month; the deliveries job sends it. Does nothing without working email or without `ZIFFR_SECRETS_KEY` or `ZIFFR_JOB_SECRET` to sign its unsubscribe link. Answers counts only. Docker Compose calls it at 07:00 UTC (spec 0031) |
| `POST /api/jobs/workspace-keys` | every five minutes | Gives every Workspace a Workspace Key, wraps keys again under `ZIFFR_SECRETS_KEY` after it was changed (`rewrapped`, `rewrapFailed` for ones it could not open, `rewrapLeft`), seals what was written before the upgrade and moves what is sealed under an older key version to the current one, then destroys a retired key version once nothing refers to it (`keysDestroyed`): a few hundred rows at a time, for up to 45 seconds per call, so what is left waits for the next call. It can stop and start at any time and is safe to call twice at once. Answers counts only, and `waiting: true` while there is no `ZIFFR_SECRETS_KEY`. How far it is shows on the Installation settings page (spec 0028). Docker Compose calls it at two past every fifth minute |
| `POST /api/jobs/retention` | daily | Lets confirmed Retentions start on their day (and sends the reminder the day before), then condenses or deletes the old values of every Metric with a Retention in force, in small steps: at most 5,000 original values and 60 seconds for each Metric a day, carrying on the next day. It takes no more than the counts a person confirmed, checks every Condensed Value against the original values before deleting them, and leaves periods that open work holds. Each Metric runs once a day however many calls come, also from two servers at once. Answers counts only. Docker Compose calls it at 02:40 UTC. See [Retention](#retention) |
| `POST /api/jobs/deliveries` | every few minutes | Sends emails, Slack and Telegram messages that are waiting: the day's Prompts, reminders and Escalations from the Workflow run, reminders and requests for missing values sent from the Connectors page, retries after a failure, and ones held back by the sending limits ([email](email.md), [Slack](slack.md)) |

```sh
# crontab, for example
0 * * * *    curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://ziffr.example.com/api/jobs/workflows
*/5 * * * *  curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://ziffr.example.com/api/jobs/deliveries
*/5 * * * *  curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://ziffr.example.com/api/jobs/workspace-keys
```

Without the secret, or with a wrong one, a job answers 404. With it, a job answers only counts: how many workspaces ran or failed, how many emails and Slack messages were sent or failed.

## The day's run

Owners and Admins set the workspace's time zone and the hour its Workflows run on the Team page (UTC and 08:00 until they do). The first call after that hour runs the day; every later call that day does nothing for that workspace, also when two servers call at once. A workspace whose run fails is marked so and the others go on; the next day runs as usual. The demo is never run by the clock.

## Retention

The Retention job (spec 0033) works through every Metric that has a Retention in force, and does nothing where none has. It is safe to call as often as you like and from several servers; what you need to know as the person who runs Ziffr:

- **Claims.** A Metric's day is claimed in the `retention_runs` table before any work starts, so two calls the same day do the work once. A run that was stopped (a restart, a crash) is taken over by the next call after ten minutes and carries on from what it left: a span half-way is checked again, never trusted.
- **Steps.** A first run over ten years of daily values takes days by design: each Metric gets at most 5,000 original values and a minute a day. Call it daily; calling it more often does not speed it up.
- **Held to the confirmation.** A Retention in force carries the counts its Owner confirmed (`retention_cap`). If a Metric then holds more old periods or values than that, the job does nothing for it until someone confirms again, and says so on the Metric's page and in the Audit Log. A Retention without a confirmation on record is never run.
- **Failures.** A failed run is rolled back (a span is condensed, checked and deleted in one step; the delete is one database transaction) and tried the next day. After three failures in a row the Metric stops and shows its Owners why; the server log has the error's code, never a value. Confirming the Retention again starts it clean.
- **Backups.** Deleting a value deletes it from Ziffr. Copies in your backups remain for as long as you keep backups; hosted Ziffr keeps them for 30 days. Only deleting a whole Workspace and destroying its key makes data unreadable in backups.
- **The demo** is never touched.
