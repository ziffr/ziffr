# 0012 Feeds: values from other systems

**Status:** done. **Tracking issue:** #155 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0012`.

## Problem Statement

Many numbers a team keeps in Ziffr already live in another system: pipeline value in a CRM, revenue in a data warehouse, open tickets in a help desk. Today a program can bring them in through the API Source (spec 0002), but only by pretending to be a person. The Access Key belongs to someone who must be the Metric's Submitter. The value's history names that person, and it all stops the day they leave the workspace. A Metric cannot take values from the API without also taking them from the personal form link. Values arrive one per request and at most 1,000 a day, so two years of daily history from a warehouse takes weeks. And there is nothing for an outside developer to build on: every connection to a CRM is a one-off script with its own scheduling, retries and mapping to Metrics. ADR 0002 promises an MIT connector kit for exactly this, but it does not exist yet.

## Solution

A **Feed** is a program outside Ziffr that brings in values for some Metrics from another system. It belongs to the Workspace, not to a person. An Owner or Admin creates it and gets a Feed Key for it. Like a Contact, a Feed is a Submitter of its own: its Metrics name it as their Source, its values show up under its name, and it keeps working when the person who created it leaves. A Feed can do one thing: record values for the Metrics it is a Submitter of, through the same core path and rules as anyone else. The API becomes a Source of its own, apart from the personal form link. A batch endpoint takes many values in one call, so a Feed can catch up on history.

Ziffr never runs a Feed's code, and it never holds the credentials for the other system. An MIT package, `@ziffr/feed-kit`, gives developers a small contract (which Metrics, how to fetch a period's value) and a runner that turns it into API calls on a schedule. The runner can run from cron, a GitHub Action, a container or an n8n workflow. Anyone may publish a Feed for a CRM or warehouse, free, paid or closed. The kit comes with one reference Feed, for SQL databases, which covers Postgres-compatible warehouses.

## User Stories

1. As an Owner or Admin, I want to create a Feed with a name (such as "HubSpot"), and to be the only ones who can, so that what writes into the workspace without a person stays in few hands.
2. As an Owner or Admin, I want to create, see and revoke a Feed's keys, each with an end date, so that I control what reaches the workspace.
3. As an Owner, I want a Feed to keep working when the person who created it leaves, so that our numbers do not stop with them.
4. As a Metric Owner or Editor, I want to make an existing Feed the Metric's Submitter, so that the Metric takes its values from that system.
5. As a Metric Owner or Editor, I want to turn the API Source on or off apart from the personal form link, so that a Metric can take values only from its Feed.
6. As a Metric Owner, I want a Feed's value for the current period, and any value that replaces one, to go through the Submission Rule, Locks and Approvals, so that a Feed cannot skip a check a person could not.
7. As a Metric Owner, I want a Feed's import of past periods that have no value yet to skip the Unusual Value check, so that connecting a Feed with two years of history does not raise hundreds of Approvals.
8. As a Metric Owner, I want imported values marked as imported in the Metric's history, so that I can find and correct a bad import.
9. As a Metric Owner, I want a value's history to name the Feed and its key, so that I know where a number came from.
10. As a Metric Owner, I want a missing value from a Feed to escalate to me at the Due Date like any other, so that a broken Feed is noticed.
11. As a Metric Owner, I want Prompts never to go to a Feed, so that nobody is asked a question a program cannot answer.
12. As a Feed developer, I want to list the Metrics my Feed submits to, with their period, unit and the periods that already have a value (but not the values), so that my Feed knows what to fetch and what to backfill.
13. As a Feed developer, I want to submit up to 500 values for several Metrics and periods in one call, with a result for each, so that a backfill is fast and one bad value does not fail the rest.
14. As a Feed developer, I want a repeated batch with the same `Idempotency-Key` to return the first answer, so that a retried run records nothing twice.
15. As a Feed developer, I want a Feed Key that can do nothing but this, so that a leaked key cannot read the workspace's numbers or people.
16. As a Feed developer, I want `@ziffr/feed-kit` to give me a typed contract and a runner, so that I write the mapping to my system and nothing else.
17. As a Feed developer, I want `ziffr-feed run` to fetch the current period and catch up on missing ones, so that a scheduled run is safe to repeat.
18. As a Feed developer, I want `ziffr-feed run --dry-run` to show what it would submit, so that I can check the mapping before anything is recorded.
19. As someone with a data warehouse, I want a ready SQL Feed where each Metric is one query with the period as a parameter, so that I connect it without writing code.
20. As someone using n8n or Zapier, I want a guide that shows the batch call from an HTTP step with a Feed Key, so that I need no kit at all.
21. As an Owner, I want to see each Feed's last run, the values it sent and the ones it was refused, so that I can tell a healthy Feed from a broken one.
22. As an Owner, I want each Feed limited to about 60 requests a minute and 10,000 values a day, so that a runaway Feed cannot flood the workspace.
23. As a demo visitor, I want the demo to have no Feeds and no keys, so that programs cannot reach it.
24. As a maintainer, I want Feeds to be Submitters through the existing Token, Version and submission code, so that there is one path for values, not two.

## Implementation Decisions

- **A Feed is a person row, like a Contact.** Each Feed has a `profiles` row, so Tokens, Observations, Versions and history work unchanged, and a `feeds` table holding the workspace, name, creator and creation time (as `contacts` does). Feeds never sign in, are never shown as people to invite, and are never a Stand-in or an Approver. Deleting a Feed revokes its keys and keeps its values, with its name.
- **Feed Keys** are Access Keys whose `feed_id` names a Feed instead of acting for their creator: an added nullable column, plus a check that a Feed Key has exactly the scope `feed:submit`. `actorForSecret` turns one into a `FeedActor` (workspace and Feed, no person). A key of a deleted Feed, or one past its end date or revoked, is 401. A Feed Key ignores its creator's membership, so the Feed outlives its creator (story 4), and Owners and Admins revoke it as they do any key. Only Owners and Admins create, rename and delete Feeds and their keys. A Metric Owner or Editor can only choose an existing Feed as a Submitter. A Feed has no owner of its own who could widen it.
- **What a Feed may see.** Only the Metrics it is a Submitter of: slug, name, period, unit, format, the current period as Ziffr counts it (so a Feed in another time zone asks for the same periods), the Due Date's working days, and the list of periods that already have an Observation. No values, no Breakdowns, no people, no Groups, no other Metrics. Any other slug is 404. This is the least a runner needs to decide what to fetch (story 12); a comment in the core function says so.
- **The API Source stands alone.** `submitValue` checks `metric.sources.includes("api")` for the API instead of mapping it to `web_form` (`packages/core/src/submissions.ts:161`). A migration adds `api` to every Metric that has `web_form` today, so existing keys keep working. The Metric's Sources setting shows "API and Feeds" as its own choice.
- **Choosing a Feed.** A Metric's Settings tab shows "Values from a Feed" under "Who submits", for its owner and Editors (who may already change Sources, GLOSSARY: Editor). Choosing a Feed gives it a Token and turns the API Source on; a Feed's Token is never shown and opens no form.
- **Endpoints**, added to version 1:
  - `GET /api/v1/feed`: the Feed's name and its Metrics as above, cursor-paged.
  - `POST /api/v1/feed/observations`: up to 500 items `{ metric, period, value, breakdown? }`. Each goes through `submitValue` as one submission with `source: "api"`. The answer is 200 with one result per item, in order (`recorded`, `awaiting_approval`, `locked` or `refused` with a code), so one bad item does not fail the batch. 400 only when the body as a whole is malformed or too large (1 MB).
  - Both take only Feed Keys (403 for person keys), and person keys keep their own endpoints. A Feed Key on any other endpoint is 403.
- **Imports skip the Unusual Value check.** A batch item from a Feed for a period before the current one, where the Metric has no Observation yet, is recorded without the Unusual Value check, so it needs no Approval. The value is stored with `imported`, and the Metric's history marks it as imported. Everything else is checked as usual: the current period, any item that replaces or adds to a value under the Submission Rule, and every value from a person's key. Locked periods stay locked, so an import never changes a closed period. `submitValue` takes this as an explicit `import: true` that only the Feed batch path sets, and a comment there says why.
- **Idempotency** works as in spec 0002, per key, over the whole batch body.
- **Limits** are counted in Postgres per Feed, not per key, so issuing more keys does not raise them: about 60 requests a minute and 10,000 values a day, each item counting once, whether it was recorded, locked or refused, so a batch that writes proposed Corrections or fails part way is counted in full. One batch runs at a time per Feed; the claim is one locked database step. A batch that would cross the daily limit is refused whole with 429 and `Retry-After`, so a run never half-succeeds silently.
- **Workflows.** A Feed is a Submitter, so Due Dates and Escalations apply. Prompts and reminders skip Feeds (story 11). An Escalation for a Feed's missing value goes to the Metric Owner and names the Feed; a Feed has no Stand-in, so a step that asks the Stand-in tells the owner instead.
- **Feed health.** Settings gets a Feeds page for Owners and Admins: each Feed with its keys, its Metrics, the last call, and that day's counts of values recorded and refused (from the Access Log and the intake log). Nothing new is stored beyond what the Access Log already records.
- **`@ziffr/feed-kit`** (`packages/feed-kit`, MIT, depends only on `@ziffr/sdk`):
  - `defineFeed({ name, metrics: { [slug]: { fetch({ period, periodEnd, current, metric }) => number | { value, breakdown } | null } } })`. Returning `null` means "no value yet" and submits nothing.
  - A runner (`ziffr-feed run <file>`, also callable from code) that reads `ZIFFR_URL` and `ZIFFR_FEED_KEY`, asks `GET /api/v1/feed` which periods are missing (the current one plus up to `--backfill N` before it), calls `fetch` for each, and submits with an idempotency key built from the Feed and the values. Past periods go in batches of up to 500; each Metric's current value goes in a batch of its own, so a repeated run sends the same batch and Ziffr replays it instead of adding the value again. It also handles `--dry-run`, retries and a short report.
  - The runner keeps no state of its own; Ziffr's list of periods with values is the state. Secrets for the other system are the Feed's business (environment variables). The kit never sends them to Ziffr.
- **SQL Feed** (`@ziffr/feed-sql`, MIT): a YAML file maps each slug to a SQL query with `:period_start` and `:period_end` parameters, run with a read-only connection string. Postgres only in this spec. It is the reference example of a Feed and is tested like one.
- **SDK** gains `ziffr.feed.metrics()` and `ziffr.feed.submit(items)`. The MCP server stays as it is: an assistant acts as its person, with a person's key, and is not a Feed.
- **Description.** The OpenAPI document and the reference page pick up the new endpoints from their schemas. `docs/guides/feeds.md` explains writing a Feed with the kit, the SQL Feed, and calling the batch endpoint from n8n.
- **ADR.** "Feeds run outside Ziffr and are Submitters of their own" is ADR 0006. It is hard to reverse, because Feed developers will build on it, and it trades convenience (no hosted runner, no stored credentials) for a smaller trust boundary.

## Testing Decisions

- **Core, against the database** (`feeds.db.test.ts`, `api-submissions.db.test.ts`): a Feed Key submits to a Metric it feeds; it gets 404 for a Metric it does not feed, one in another workspace, and one whose API Source is off; it cannot read values, people or Groups; its values carry the Feed and its key; it keeps working after its creator leaves; it is refused once revoked, past its end date, or when its Feed is deleted; Submission Rule, Lock and Approval apply per item; the 10,001st value in a day is refused, across two keys of one Feed; an item for an empty past period skips the Unusual Value check and is marked imported, while an item for the current period, one that replaces a value, and one for a locked period are checked or refused as before; a person's key never skips the check; a Metric Owner who is not an Owner or Admin cannot create a Feed or its keys; the demo has none.
- **Migration:** applied to the local database, every Metric with `web_form` also has `api`; the tests prove a Metric with only `web_form` or only Slack refuses API values, and one with `api` takes them.
- **Workflows:** a Feed gets no Prompt; its missing value escalates to the Metric Owner.
- **HTTP layer:** route tests for the batch endpoint's per-item results, 400 for an oversized body, 403 for a person key, idempotent replay, 409 for a reused key with another body, 429 with `Retry-After`.
- **Feed kit:** the runner against the running app in CI (as the SDK is): a dry run submits nothing, a second run submits nothing new, `--backfill 3` fills three missing periods. The SQL Feed runs one query against the local Postgres.
- Prior art: `access-keys.db.test.ts`, `api-submissions.db.test.ts`, `submissions.db.test.ts`.

## Out of Scope

Running Feeds inside Ziffr (a hosted runner, stored credentials for other systems, a Feed marketplace); OAuth sign-in to other systems; webhooks from other systems straight into Ziffr; Feeds that create or change Metrics; Feeds for Target Series and Projections; ready Feeds for particular CRMs; SQL dialects other than Postgres; an n8n community node; Feed Keys for the MCP server.

## Further Notes

- **Glossary.** Adds **Feed** ("A program outside Ziffr that brings in values for some Metrics from another system, such as a CRM or a data warehouse. It belongs to the Workspace, is a Submitter of its own and uses a Feed Key. _Avoid_: integration, sync, pipeline, connector, workflow"), **Feed Key** and **Import** (a Feed's values for past periods that had none; _Avoid_: backfill). Changes **Unusual Value** (an Import is not checked), **Submitter** (a Member, Guest, Contact or Feed), **Source** (the API Source takes values from person keys and Feeds) and **Access Key** (a Feed Key is the kind that acts for a Feed, not a person). The glossary changes land with the first ticket, not before. "Connector" stays the word for how Ziffr reaches people, and "Workflow" for a value's path each period. An n8n or Zapier flow is an "automation" in prose and is never a Workflow.
- **Threat model.** Feeds and the batch endpoint are a new trust boundary. A leaked Feed Key can record up to 10,000 values a day into the Metrics that Feed feeds, under the Feed's name, but it can read no values. Locks still hold, and an unusual value for the current period still needs Approval. Values for empty past periods skip that check but are marked imported, so a bad import is visible and can be corrected. This changes who can do what, so every ticket that touches keys, actors or the submission path gets a security review of its diff.
- **Decided:** only Owners and Admins create Feeds; a Feed's import of empty past periods skips the Unusual Value check.
- This adds to version 1 of the API without breaking it.
