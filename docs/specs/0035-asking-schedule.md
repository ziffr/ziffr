# 0035 Asking Schedule: a time and days per Workflow

**Status:** in progress. **Ticket:** #361 (the owner's wish, 2026-11-20). One pull request: this spec and the build.

## Problem Statement

A Workspace has one time zone and one run hour, and every Workflow runs at that hour every day. A team that wants "ask the shop managers on Mondays and Thursdays at 14:00", "ask every third day", or "ask on the 5th of the month after lunch" has no way to say so: all Prompts leave at the same early hour, on days a person may be away from their desk or already done.

## Solution

A Workflow may have an **Asking Schedule**: the **time of day** (a whole hour) and **which days** its steps run. Without one, nothing changes: the Workflow runs with the Workspace's daily run at the Workspace's run hour. With one, the Workflow runs by itself, on its days, at its hour, in the Workspace's time zone.

The days are one of:

- **every day** (the default),
- **weekdays** (Monday to Friday),
- **chosen weekdays** (any of Monday to Sunday, for example Monday and Thursday),
- **every N days** from a starting day, N from 2 to 90 (every third day from 1 December),
- **a day of the month**, 1 to 31 or the last day.

## User Stories

1. As a Workflow owner, I want Prompts to go out at 14:00, when my submitters are at their desks, so that more of them answer the same day.
2. As a Workflow owner, I want the Workflow to run on Mondays and Thursdays only, so that nobody is asked on days the team does not work.
3. As a Workflow owner, I want it to run every third day, so that a regular check-in has a rhythm that is not a weekday.
4. As a Workflow owner, I want it to run on the 5th of each month (or its last day), for a monthly close.
5. As a Workflow owner, I want the editor to say when the Workflow runs next and warn me when the schedule skips periods or can reach people after the Due Date, so that I never find out from a missed value.
6. As an Owner or Admin, I want Workflows without a schedule to keep running with the Workspace's run, so that nothing changes until someone chooses.
7. As a Workflow owner who just set a time that has passed today, I want nothing sent at once, so that saving never surprises submitters.
8. As a Workflow owner, I want to run my scheduled Workflow now, once, to try it, without it running twice.
9. As a maintainer, I want the schedule rules to be one pure module with tests for time zones, daylight saving time, month ends and every-N-days anchors, so that "which days" has one answer everywhere.

## Implementation Decisions

### Words

- **Asking Schedule** is new: when a Workflow runs by itself, the time of day and the days. It is not the **Schedule** (what one person has to do) and not a period: a Metric's period says what a value is for, the Asking Schedule says when Ziffr asks and reminds. _Avoid_: cron, recurrence, frequency, timer.
- Its parts are the **time** and the **days**. "Run" stays as it is: a Workflow's run is what asks, reminds and escalates.
- The glossary entry **Workflow** points to it, and its own entry says a Due Date never moves with it.

### The rules

- **What it decides:** only when the Workflow's own run happens. The run does what it does today for each Metric on the Workflow: it asks for the last period that ended (unless its Due Date passed before the Metric was made or began following the Workflow), reminds when the day for a reminder has come, escalates when the Due Date plus the days after has passed. Each of those happens **once per period**, recorded as before, so it does not matter that a run happens late or that Ziffr asks twice a day (the Workspace's run and a Workflow's run) about one period: a step that was done is never repeated.
- **Due Dates never move.** A Due Date is working days after the period ends (spec 0027's Schedule shows it unchanged). A reminder or an escalation whose day falls on a day the Workflow does not run goes out on the **next run day**, never before its day. Reminders and escalations compare with "on or after" and "after", so nothing is lost.
- **No catching up on skipped periods.** A run works on the last period that ended, as today. A daily Metric on a Workflow that runs every third day is asked for the last day only; the two days in between are never asked for. The editor says so (a warning, below). Making Ziffr ask for several periods at once was considered and refused: a person receiving three Prompts for three days at 14:00 is the reminder spam this feature must not make.
- **Values that come in** are handled when they arrive (checks, approvals, publishing), not at the next run. The run only covers what is missing.
- **Time of day:** a whole hour, 0 to 23, in the Workspace's time zone, or **blank** for the Workspace's run hour. Whole hours because the job is called hourly (spec 0005); a quarter-hour would make the job's every-five-minutes advice a requirement. A run happens on the first call of the job at or after that hour on a run day, so in the spring when the clock skips 02:00 a Workflow set for 02:00 runs at 03:00, and in the autumn when 02:00 comes twice it runs once.
- **Run days are days in the Workspace's time zone.** The days are calendar days as everywhere in Ziffr (spec 0005); a changed time zone cannot run a day twice or a past day, because a Workflow's claimed days only move forward, like the Workspace's.
- **Every N days:** the starting day is chosen in the editor (today by default) and is part of the schedule, so saving other fields never moves the rhythm. Run days are the starting day and every N-th day after it; no day before it. Changing N or the starting day is a new schedule.
- **Day of the month:** a day the month does not have (the 31st in November, the 30th in February) runs on the month's last day. "Last day" is always the last.
- **Weekdays** are Monday to Friday and do not look at holidays (the Workspace has no holiday calendar; Due Dates skip only Saturdays and Sundays too).
- **A new or changed schedule never runs for a day that has begun.** When it is saved on a run day at or after its hour, today is recorded as skipped, so the first run is the next run day. Saving at 13:00 with 14:00 runs today at 14:00.
- **Run now:** the Workflow's owner, an Owner or an Admin may run a scheduled Workflow's steps now for today, once: the same claim as the clock's, so the clock then leaves today alone and it never runs twice. The Workspace's "Run today's steps now" runs the Workflows without a schedule and the due-task reminders, and says that scheduled Workflows run on their own.
- **Automatic Snapshots, due-task reminders and Alerts** stay in the Workspace's run; they are not asking.
- **The demo** pretends a day with "Run workflows" and ignores schedules: it runs every Workflow once, as before. The demo is never scheduled and its visitors cannot set one (read-only, spec 0029).
- **Who sets it:** the Workflow's owner, in the Workflow editor, like every other part of a Workflow. Saved with the Workflow, so it is in the Workflow's version history and is restored with it.
- **Templates and Packs do not carry it.** A Workflow Template is steps, Due Date and reminders with the people left open (spec 0030); when a schedule is about a rhythm of one team and an anchor day, it does not belong in something copied to others. A Workflow made from a template runs with the Workspace's run until its owner sets a schedule.
- **API and MCP:** Workflows are not yet reached by the API (ticket #433, listed in `docs/api-coverage.md`); the schedule is a field of the Workflow's config and goes through whatever that ticket builds, validated by the same core function. Nothing is added to the API in this spec, and the coverage list stays true.

### Where it is stored and how a run is claimed

- **The setting** is `asking` in the Workflow's config (`{ hour: number | null, days: … }`); absent means none. No column: the config is already stored, versioned and validated in one place (`cleanConfig`).
- **The rules** are in one pure module, `packages/core/src/asking-schedule.ts`: check and clean a setting (untrusted input), whether a day is a run day, the next run day, the effective hour, a sentence for the editor, and the warnings. Unit-tested, with fixed days and instants.
- **Claims:** a table `workflow_asking_runs` with one row per Workflow and local day, made by `claim_workflow_asking_day` (under an advisory lock, forward-only, as `claim_workflow_day`) before anything is sent. Rows keep only the state and counts, never what was sent or to whom, and go with the Workflow (cascade).
- **The job** (`POST /api/jobs/workflows`, unchanged address and secret) first runs the Workspace as today, but for Workflows without a schedule, then, for every Workflow with one whose day is a run day and whose hour has come, claims and runs it. A failing Workflow does not stop the others; the job's answer gains the number of Workflows run by their own schedule and failed. Called every hour, as in spec 0005, it is accurate to the hour.

### What the editor shows

- In the Workflow editor, next to the Due Date: **Runs** with a choice **With the workspace's daily run** (the default) or **On its own schedule**; the latter shows the hour (blank: the Workspace's) and the days (the five kinds above).
- A sentence in words under the steps' **Ask** node: "Runs every third day at 14:00 (Europe/Berlin), next on Thursday 3 December."
- **Warnings** (a note, never a block): "Metrics with a short period are asked for the last period only; the periods in between are not asked for." when the longest gap between run days is longer than a Metric's period on it (a Metric's period in days, at its longest: day 1, week 7, month 31, quarter 92, year 366); and "On this schedule a Prompt can reach people after the Due Date." when the longest gap is longer than the Due Date's working days plus one.
- On the Workspace's run panel: "Workflows with their own schedule run by themselves."; on a scheduled Workflow's panel: the last run and **Run now**.
- The user guide's Workflows chapter describes all of it.

## Testing Decisions

- **Pure unit tests:** every kind of days across month and year ends, leap day, the 31st in short months, weeks across a year end, every-N-days from an anchor before, on and after the day asked about (and in the future), Sunday to Monday numbering, whole-hour effective time and a blank one, the spring and autumn clock changes in Europe/Berlin and America/New_York with the job's own `localTime`, invalid shapes refused (N below 2 or above 90, empty or duplicate weekdays, hours outside 0 to 23, a starting day that is not a day, extra keys dropped), the warnings.
- **Database tests** (`asking-runs.db.test.ts`): a scheduled Workflow runs on its day at its hour and not before, not on other days, once however often and however many at once the job is called, while another Workflow without a schedule runs with the Workspace's run; the scheduled Workflow is not run by the Workspace's run; a reminder whose day was skipped goes out on the next run day, once; saving at a passed hour records today as skipped; a changed time zone cannot run a day twice; run now claims the day and the clock then skips it; a Workflow of another Workspace cannot be named; the demo is never run by the clock and a Member who does not own the Workflow cannot set a schedule.
- The job's route test keeps the door tests; the demo-read-only walk covers the changed actions.
- Tried in a production build: set a schedule, see the sentence and warnings, save, reload.

## Out of Scope

- Hourly or shorter periods, and times finer than an hour.
- Asking for several skipped periods at once.
- Per-Metric or per-person times and days, and a holiday calendar.
- Giving the schedule to Workflow Templates and Packs.
- Setting it through the API or MCP before Workflows are reached there (ticket #433).

## Decided overnight, owner to confirm

The owner was asleep; these are the recommended answers, written as decisions. Say if one is wrong.

1. **Whole hours only**, not minutes.
2. **The schedule lives in the Workflow's config**, not in a column of its own, and is versioned with the Workflow.
3. **Due Dates never move;** steps wait for the next run day.
4. **No catching up on skipped periods;** the editor warns instead.
5. **Day of the month beyond a short month runs on its last day.**
6. **A schedule saved after its hour today does not run today.**
7. **Workflows without a schedule keep running with the Workspace's run;** a schedule is opt-in.
8. **Templates and Packs do not carry the schedule.**
9. **Weekdays means Monday to Friday, without holidays.**
10. **The demo ignores schedules** and keeps its "pretend it is this day" button.
11. **Every N days: N from 2 to 90, with a chosen starting day.**
12. **No API or MCP field now;** it comes with #433 through the Workflow's config.
