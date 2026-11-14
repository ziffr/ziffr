# 0005 Workflows on a clock

**Status:** in progress. **Tracking issue:** #83 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0005`.

## Problem Statement

A Workflow says when to ask for a value, when to remind and when to escalate, and since spec 0004 those messages reach people by email. But nothing runs a Workflow on its own: Prompts, reminders and Escalations only happen when someone opens the Workflows page and presses "Run workflows" with a date. Reminders for tasks that are due work the same way. A team that sets up its Metrics and Workflows and then waits for the first request to arrive waits for ever.

## Solution

A scheduled job runs every workspace's Workflows once a day, in the morning of that workspace's own time zone, and sends the reminders for questions and tasks that are due. A scheduler calls it every hour; each workspace's day is claimed once, so a second call, a slow run or two servers never ask twice. Owners set the workspace's time zone and the hour. The Workflows page shows when the last run was and what it did. The demo keeps its "pretend it is this day" button and is never scheduled.

## User Stories

1. As a Metric owner, I want Submitters asked for the value when the period closes, without anyone pressing a button.
2. As a Metric owner, I want reminders before the Due Date and Escalations after it to go out on the days the Workflow says.
3. As a Submitter, I want to be asked once a day at most, in the morning where I work, never twice for the same step.
4. As a Stand-in, I want to be asked while the Submitter is Away, as today when the button is pressed.
5. As an assignee of a task, I want a reminder when it is due soon, once a day, not every time someone opens a page.
6. As an Owner, I want to set the workspace's time zone and the hour the day's run happens, so "today" and "8 in the morning" mean ours.
7. As an Owner, I want to see when the last run was and what it did, so I trust that it runs.
8. As an Owner who just set up a Workflow, I want to run today's steps now rather than wait for tomorrow morning, once.
9. As a self-hoster, I want one job to call every hour, like the email retry job, so I add one line to my scheduler.
10. As a demo visitor, I want to try a Workflow by pretending it is another day, without anything being scheduled.
11. As a maintainer, I want the run to be a core function with database tests at fixed times, so time zones and repeats are proven.

## Implementation Decisions

- **Time zone and hour.** Workspaces gain `time_zone` (an IANA name, UTC by default) and `run_hour` (0 to 23, 8 by default). Owners and Admins change them on the Team page; the time zone is checked against the names the runtime knows.
- **The job.** `POST /api/jobs/workflows` with `Authorization: Bearer $ZIFFR_JOB_SECRET`, like the email job, answers 404 otherwise. Each call looks at every workspace except the demo, and runs those whose local time has reached `run_hour` today and whose local day has not been run.
- **Once per day.** A run claims `(workspace, local day)` in a new `workflow_runs` table before doing anything; the unique key makes a second claim fail, so repeated calls, slow runs and several servers cannot run a day twice. The row keeps when it started and finished and how many Prompts, reminders and Escalations it sent.
- **What a run does.** `runWorkflows` as of the workspace's local day, with the Workflow's owner as the one acting, as when the button is pressed; then the reminders for open tasks due within two days. Metrics without a Workflow are not asked automatically: choosing a Workflow is how an owner says when to ask.
- **Running now.** In a real workspace the Workflows page offers "Run today's steps now" to Owners and Admins: the same claim for today, so it does nothing if the day already ran, and the scheduled run then skips that day. Only the demo can pretend it is another day.
- **Showing it.** The Workflows page shows the last run (when, what it sent) and when the next is due, or that no run happened yet with a hint to set up the job.
- **Errors.** A workspace whose run fails is marked so and the job goes on with the next; the next day runs as usual. Only counts and the error's kind are kept.

## Testing Decisions

- The run is tested in the core against the database at fixed instants: before and after `run_hour` in two time zones (one where the local day differs from UTC), a second call the same day doing nothing, two calls at once claiming one run, the demo never run, a failing workspace not stopping others.
- The steps themselves are proven by the Workflow tests that exist; one test runs a Workflow from asking to reminding to escalating across three scheduled days.
- The job gets route tests for the secret; the Team page setting gets one for its checks.

## Out of Scope

Running more than once a day; time zones per Metric or per person; a scheduler inside Ziffr (the job is called from outside, as for email); Workflows for Metrics that have none; the demo on a clock.

## Further Notes

- The self-hosting guide gains the job next to the email one; both can run every five minutes or every hour.
- Locking at the end of a period stays as it is: it happens when the value is published, by the Workflow's publish step.
