# The API

Programs reach a workspace's numbers through a REST API at `/api/v1`, acting with an Access Key ([spec 0002](../specs/0002-api-and-mcp.md)). A key acts for the person who made it: it sees what that person sees, within the scopes it was given, in one workspace.

## Making a first call

1. On the Team page, create an Access Key with the scope "read metrics". Copy it: it is shown once.
2. Call the API with the key in the `Authorization` header:

```sh
curl -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" https://your-ziffr.example/api/v1/metrics
```

## What every answer has in common

- **Errors** are `{ "error": { "code": "...", "message": "..." } }`. The codes are `invalid_request` (400), `unauthorized` (401: no key, or one that ended, was revoked, or whose creator left), `forbidden` (403: the key lacks the scope), `not_found` (404), `conflict` (409), `unprocessable` (422: a rule refused it), `locked` (422: the period is locked), `rate_limited` (429) and `internal` (500).
- **Something you may not see is not found.** A Metric in another workspace, or one not shared with the key's creator, answers 404, the same as one that does not exist.
- **Lists page with a cursor.** Pass `limit` (1 to 100, default 50) and the `next` value of the previous page as `cursor`. `next` is null on the last page. Treat cursors as opaque.
- **Each key may make about 60 calls a minute.** Over that, the answer is `rate_limited` (429) with a `Retry-After` header in seconds; wait that long and try again. Refused calls do not count against the limit.
- **Every call is logged** in the key's Access Log: when, the method, the route (`/api/v1/metrics/{slug}`, without query or slug), and the status, never what was sent. The key's creator sees it on the Team page, Owners and Admins for every key; entries are kept 90 days.
- **Nothing is cached** (`Cache-Control: no-store`), and the API sends no CORS headers: call it from a server or a script, never from a web page, which would expose the key.

## From TypeScript

[`@ziffr/sdk`](../../packages/sdk/README.md) wraps every endpoint with types, pages for you, waits out a 429 and sends an idempotency key with each submission.

## From an AI assistant

[`@ziffr/mcp`](../../packages/mcp/README.md) is a local MCP server for Claude Desktop, Claude Code and other assistants: it reads Metrics and submits values with an Access Key, and sees no more than the key does.

## From another system

A program that keeps a CRM's or a warehouse's numbers in step with Ziffr should be a [Feed](feeds.md), not a person's key. A Feed belongs to the workspace and keeps working when its creator leaves, and its values show under its own name. Its Feed Key can only record values, and a batch endpoint takes up to 500 at a time.

## Endpoints

Every endpoint, its parameters, answers and errors are in the [API reference](../reference/api.md), generated from the server's own validation. Programs can read the same description as OpenAPI 3.1 at `/api/v1/openapi.json` (no key needed) and generate a client from it in any language.

## Submitting values

```sh
curl -X POST https://your-ziffr.example/api/v1/metrics/orders/observations \
  -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: orders-2026-11" \
  -d '{ "value": 42, "breakdown": [{ "label": "Shop", "value": 30 }, { "label": "Online", "value": 12 }] }'
```

- The key's creator must submit to the Metric (have a Token for it), and the Metric must take values from its personal form link: a program submits as that person, through the same rules. The value shows in the Metric's history as from the API, with the key's name.
- `period` is the first day of a period (`2026-11-01` for a monthly Metric, a Monday for a weekly one, `2026-10-01` for the fourth quarter of a calendar year); without it, the current period. A future period, or a day that does not start one, is refused.
- **Quarters and years** start from the workspace's fiscal year. `GET /api/v1/workspace` answers `{ "year_start_month": 4 }` when it starts in April: a quarterly Metric's periods then start on 1 April, 1 July, 1 October and 1 January, and a yearly one's on 1 April.
- The answer (201) says `recorded`, or `awaiting_approval` when the value is unusual and waits for Approval. A locked period answers 422 `locked`, and the value goes to the Metric's owner as a proposed Correction. The Submission Rule or a Derived Metric can refuse it with 422 `unprocessable`.
- A key that may submit but not read gets answers without the period's earlier value or the Metric's name, and a Metric its creator does not submit to is not found for it: it learns nothing it did not send.
- **Idempotency-Key** (optional, up to 200 characters): a repeat within 24 hours with the same key and body gets the first answer again, with `Idempotent-Replayed: true`, and records nothing. The same key with another body answers 409.
- Each key may submit **1,000 values a day** (any 24 hours). Over that, 429 with `Retry-After`.

## Creating Metrics

A key with the scope "Create metrics" (`metrics:write`) can make new Metrics, owned by the person who made the key and checked as in the web form:

```sh
curl -X POST https://your-ziffr.example/api/v1/metrics \
  -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: setup-weekly-signups" \
  -d '{ "name": "Weekly signups", "period": "week", "unit": "signups", "submission_rule": "add", "submit": true }'
```

- The answer (201) is the new Metric as `GET /api/v1/metrics/{slug}` shows it; use its `slug` from then on. A name that is taken gets a slug with a suffix.
- `submit: true` makes the key's creator its Submitter, so a key that may also submit values can send the first one at once.
- The key's creator must be allowed to create Metrics: a Guest's key is refused (403), also when the person became a Guest after making the key.
- Each key may create **50 Metrics in any 24 hours**, also when it calls in parallel; over that, 429 with `Retry-After`. An Idempotency-Key works as for values, and a replayed answer does not count.
- A program cannot rename, describe or share a Metric or name other Submitters: that stays in the app. It can delete a Metric its creator owns (`DELETE /api/v1/metrics/{slug}?confirm=<name>`) and change targets, below.

## Changing targets, Projections and the Unusual Value check

A key with the scope "Change metrics" (`metrics:edit`) changes a Metric's **Target Range**, **Target Series** and **Projections**, as the key's creator and only for a Metric they own or are an Editor of, as on the Metric's page. It is a scope of its own, so a key made to create Metrics cannot change them:

```sh
curl -X PATCH https://your-ziffr.example/api/v1/metrics/revenue \
  -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" -H "Content-Type: application/json" \
  -d '{ "target_min": 40000, "target_max": 60000, "polarity": "target" }'

curl -X POST https://your-ziffr.example/api/v1/metrics/revenue/target-series \
  -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" -H "Content-Type: application/json" \
  -d '{ "items": [ { "period": "2027-01-01", "value": 5000 }, { "period": "2027-02-01", "value": null } ] }'
```

- `PATCH /api/v1/metrics/{slug}` changes `polarity`, `target_min`, `target_max` and `attainment_method`; each left out stays, null clears an end of the Target Range. A lower end above the upper one answers 422. A Metric's name and description are changed only in Ziffr, since other people and their assistants read them. The Metric's history names the key.
- `POST /api/v1/metrics/{slug}/target-series` and `/projections` take 1 to 500 items: a period's first day and a value, or null to remove that period. All or nothing: one refused item (not a period's first day, or a Projection for a period that is over) answers 422 and writes nothing, and setting and removing happen in one database step. Repeating a call is safe.
- `GET` on the same two addresses lists them with `metrics:read`, for any Metric the key's creator sees.
- `GET /api/v1/metrics/{slug}/unusual-value-check` says what makes a value an **Unusual Value** in the Metric's Workflow (`change_pct`, `outside_target`), with the Workflow's name, whether the key's creator owns it and how many Metrics they see share it. `PATCH` on it changes that check: it changes the Workflow, so every Metric that shares it, and only the Workflow's owner may. A Metric without a Workflow, or a Workflow without a check step, answers 422; steps are added only in Ziffr.
- Seen but not theirs to change answers 403 with the reason; a Guest's key is refused (403), also when the person became a Guest after making the key.

## Sources and Submitters

A Metric's **Sources** are the ways its values may arrive (`web_form`, `mail`, `slack`, `telegram`, `api`; the personal form link works apart from them), and its **Submitters** are who sends them. Every Metric answer carries its `sources`.

- `POST /api/v1/metrics` takes `sources` (every one when left out) and `submitters`: ids of people and Contacts from `GET /api/v1/people` and of Feeds from `GET /api/v1/feeds`. Naming Submitters needs "Change metrics" (`metrics:edit`) as well as "Create metrics", since each person named gets a first Prompt. Everything is checked before the Metric exists; an id that is not one of the workspace's answers 422.
- `PATCH /api/v1/metrics/{slug}` takes `sources`, all of them: the ones left out are turned off.
- `GET /api/v1/metrics/{slug}/submitters` lists them by id, name and kind (`person`, `contact`, `feed`), never contact details. `POST` on it takes `add` and `remove`, at most 20 each, as the key's creator and only for a Metric they own or are an Editor of. A person or Contact added gets a Token and a first Prompt, by their own Delivery Preference, unless they were asked for this Metric in the last 24 hours, or already five times that day through keys: then the Workflow asks them next. A Feed added turns the API Source on. Someone removed keeps their earlier values.
- People are named by id, never by email address: the API gives out no contact details, and would otherwise tell a program whose address is in the workspace.

## Snapshots and View Links

**Snapshots** are read with `dashboards:read` and taken with `dashboards:write`, by the same rules as in the app: a key reads what its creator may open (a draft only if they may open drafts, and only the Metrics they see now) and takes one only of a dashboard its creator owns or edits, for a week, month, quarter, half-year or year that is over. A new Snapshot is a draft; showing it, rewording it and deleting it stay with people.

| Call | Scope | What it does |
| --- | --- | --- |
| `GET /api/v1/dashboards/{id}/snapshots` | `dashboards:read` | The dashboard's Snapshots, newest period first. |
| `GET /api/v1/snapshots/{id}` | `dashboards:read` | One Snapshot: its words, widgets and the latest 240 kept values of each Metric, with the values corrected since. |
| `POST /api/v1/dashboards/{id}/snapshots` | `dashboards:write` | `{ "kind": "month", "start": "2026-10-01" }`; `422` with the reason when the period is not over or the Snapshot exists. |

**View Links** (create, list, revoke) have a scope of their own, "Manage View Links" (`view-links:write`), because a View Link publishes data to people outside the workspace. It is never ticked by default, only a program's Access Key can hold it (an assistant cannot be given it, the MCP Server has no tool for it and the remote one never reaches these endpoints), and a Guest cannot give it. A key makes View Links only to dashboards its creator owns, of Metrics they see, ending within 90 days, at most 20 a day. **The answer that makes a link is the only one with its `token` and `url`: keep it, it is not shown again** (lists carry the id, label, end and state only). Revoke with `DELETE /api/v1/view-links/{id}`.

| Call | Scope | What it does |
| --- | --- | --- |
| `GET /api/v1/dashboards/{id}/view-links` | `view-links:write` | The dashboard's View Links, without their tokens. |
| `POST /api/v1/dashboards/{id}/view-links` | `view-links:write` | `{ "expires": "2026-12-31", "label": "Board", "frozen": true, "snapshot": 12 }`; `snapshot` is one that is shown already. |
| `DELETE /api/v1/view-links/{id}` | `view-links:write` | Revokes it at once. |

## Usage

`GET /api/v1/usage` returns the key's own Workspace's usage as counts, for a program's key with the scope "Read usage figures" (`usage:read`) whose creator is an Owner or Admin. Assistants are never given the scope. `from` and `to` (YYYY-MM-DD, at most 400 days, the newest yesterday) default to the last 30 days.

```json
{
  "days": [{ "day": "2026-11-19", "workspace_values": 14, "workspace_values_web": 9, "workspace_views_dashboards": 31 }],
  "state": { "day": "2026-11-20", "workspace_metrics": 41, "workspace_metrics_without_values": 3, "workspace_metrics_not_opened": 6 },
  "withheld": []
}
```

Per day: values recorded in total and by Source, and views of dashboards, decks and Metrics, never who looked. In `state`, as of the call: Metrics in use, Metrics without values, Metrics, dashboards and decks not opened for 90 days, Submitters without values and Metrics that are safe to archive. No name, id, person or value. Only what the key's creator sees counts (a Workspace Role grants no Metric). While fewer than 3 people are in the Workspace the values, views and Submitters are left out, as are days before the third person joined, and until 90 days were counted so is what is not opened; `withheld` names them. A Workspace's keys may call it 30 times an hour. See the [Usage guide](usage.md) for sending them into the Workspace as Metrics.

## Workflows

A key with **Build workflows** (`workflows:write`) makes, changes and deletes the Workflows its creator owns, steps included, through the same function as the Workflow editor, so the steps are cleaned the same way (a publish step is always last). Another person's Workflow, or one of another workspace, is `404`; a step that cannot be is `422` with the reason in words.

| Call | Scope | What it does |
| --- | --- | --- |
| `GET /api/v1/workflows` | `metrics:read` | The workspace's Workflows, id and name. |
| `GET /api/v1/workflows/{id}` | `metrics:read` | One of the creator's own Workflows: `due_working_days`, `lock_summary`, the `steps` in order and how many Metrics use it. |
| `POST /api/v1/workflows` | `workflows:write` | Makes one: `name`, optional `due_working_days` and `steps` (`remind`, `escalate`, `check`, `approve`, `publish`, `tell`). |
| `PATCH /api/v1/workflows/{id}` | `workflows:write` | Changes the `name`, `due_working_days`, `lock_summary` or `steps`; what is left out stays, `steps` replaces all of them. |
| `DELETE /api/v1/workflows/{id}` | `workflows:write` | Deletes it; the Metrics that used it have none then. |

**Who approves is a person's decision.** The Approve step (its Approvers, which values wait, what happens when nobody else could approve: a Self-check or counting the value) and who a Tell step tells are set only with the scope "Name who approves and who is told" (`workflows:people`) on top of `workflows:write`. Like `values:approve` it is never ticked by default and only a program's Access Key can hold it, not an assistant. Without it, an edit must send the Approve and Tell steps back exactly as `GET /workflows/{id}` gave them (or leave them out when making a Workflow), and a Workflow that has one is not deleted. Approvers and people told must be members, ids from `GET /people`. The asking schedule (a time and days per Workflow) is not part of the API yet.

## Questions, Tasks and Approvals

A key acts on the **Actions** (Questions and Tasks, including the Approvals and Self-checks a Workflow asks) of the person who made it, by the same rules as the app. Every answer holds only Actions that person may read: the ones they are on, and others by the Metric's visibility and the Action's Group. An Action they may not read, or one of another workspace, is `404`; one they may read but may not change that way is `422` with the reason in words.

| Call | Scope | What it does |
| --- | --- | --- |
| `GET /api/v1/actions` | `actions:read` | The Actions that wait for the creator and those they asked, newest first, a page at a time (`role=assignee` or `asker`, `status`; not closed unless `status` says). `purpose` tells an Approval or Self-check from a plain one. |
| `POST /api/v1/actions/{id}/replies` | `actions:write` | Replies in the Thread (`body`, optional `correction`), as someone on it. A reply is only words: "approve", "send back" or "confirm" in it decides nothing. |
| `PATCH /api/v1/actions/{id}` | `actions:write` | `{ "status": "closed" }` or `"open"`: the asker closes or reopens. Never a Self-check. |
| `POST /api/v1/actions/{id}/done` | `actions:write` | The assignee marks their open Task done. |
| `POST /api/v1/actions/{id}/self-check` | `values:submit` | `{ "decision": "confirm" }` or `{ "decision": "correct", "value": 12 }` on the creator's own value. |
| `POST /api/v1/actions/{id}/approval` | `values:approve` | `{ "decision": "approve" }` or `{ "decision": "send_back", "comment": "..." }` as the Approver the Workflow names. |

Each change goes through the one place an Action's state changes, so it sends one **Webhook** event, with the source `api` (or `mcp`).

**Approving is a person's check.** The scope "Approve values" (`values:approve`) is never ticked by default, only a program's Access Key can hold it, and the MCP Server has no tool for it: an assistant cannot be given it on the consent screen, and text in a Thread could otherwise talk it into approving. As in the app, nobody approves their own value, and only the Approver the Workflow names approves; the key acts as that person.

```sh
curl -X POST https://your-ziffr.example/api/v1/actions/42/approval \
  -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" -H "Content-Type: application/json" \
  -d '{ "decision": "send_back", "comment": "Please check March" }'
```
