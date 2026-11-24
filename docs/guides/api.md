# The API

Programs reach a workspace's numbers through a REST API at `/api/v1`, acting with an Access Key ([spec 0002](../specs/0002-api-and-mcp.md)). A key acts for the person who made it: it sees what that person sees, within the scopes it was given, in one workspace.

## Making a first call

1. On the Team page, create an Access Key with the scope "read metrics". Copy it: it is shown once.
2. Call the API with the key in the `Authorization` header:

```sh run
curl -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" https://your-ziffr.example/api/v1/metrics
```

## What every answer has in common

- **Errors** are `{ "error": { "code": "...", "message": "..." } }`. The codes are `invalid_request` (400), `unauthorized` (401: no key, or one that ended, was revoked, or whose creator left), `forbidden` (403: the key lacks the scope), `not_found` (404), `conflict` (409), `unprocessable` (422: a rule refused it), `locked` (422: the period is locked), `rate_limited` (429) and `internal` (500).
- **Scopes and refusal codes** are listed at the end of this guide.
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

```sh run
curl -X POST https://your-ziffr.example/api/v1/metrics/orders/observations \
  -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: orders-2026-11" \
  -d '{ "value": 42, "breakdown": [{ "label": "Shop", "value": 30 }, { "label": "Online", "value": 12 }] }'
```

- The key's creator must submit to the Metric (have a Token for it), and the Metric must take values from its personal form link: a program submits as that person, through the same rules. The value shows in the Metric's history as from the API, with the key's name.
- `period` is the first day of a period (`2026-11-01` for a monthly Metric, a Monday for a weekly one, `2026-10-01` for the fourth quarter of a calendar year); without it, the current period. A future period, or a day that does not start one, is refused.
- **Quarters and years** start from the workspace's fiscal year. `GET /api/v1/workspace` answers `{ "year_start_month": 4, "number_style": "1,234.5" }` (the month it starts in and how it writes numbers) when it starts in April: a quarterly Metric's periods then start on 1 April, 1 July, 1 October and 1 January, and a yearly one's on 1 April.
- The answer (201) says `recorded`, or `awaiting_approval` when the value is unusual and waits for Approval. A locked period answers 422 `locked`, and the value goes to the Metric's owner as a proposed Correction. The Submission Rule or a Derived Metric can refuse it with 422 `unprocessable`.
- **A Breakdown with parents.** A row of `breakdown` may carry `parent`, the label of another row of the same list: `{ "label": "Berlin", "value": 60, "parent": "Germany" }`. A parent is named by its label (the same in any case), may come later in the list, and an empty or missing one is a row at the top. At most 4 levels, 200 rows, every label once; a list with a cycle, a row that is its own parent, a parent that is no row of the list, a name used twice or a control character is refused with 422 `unprocessable` and the reason in words, and nothing is recorded. Under the rule that adds values up, a row already there keeps its place: naming another parent for it, or a list that would pass the limits with the rows already there, is refused with the same short answer whatever those rows are (`These rows cannot be added to this Breakdown.`), which never names or counts a stored row; that a value was refused does tell a sender who tries that rows are there. A row that already has a parent must name it again, or its value is refused (so a program that sends flat rows to a Breakdown that has parts is refused: send the parents too). Rows are stored parents first, then their parts, each level in the order sent. Reading values back gives each row's `parent` label too, parts after their row: **add up only the rows without `parent`**, the others are already counted in their parent. A row whose label cannot be opened (the Workspace Key does not open it) is listed with the label `–`, so several parts may name `–` as their parent: such a row has no name of its own to match. Feeds take `parent` in the same way.
- A key that may submit but not read gets answers without the period's earlier value or the Metric's name, and a Metric its creator does not submit to is not found for it: it learns nothing it did not send.
- **Idempotency-Key** (optional, up to 200 characters): a repeat within 24 hours with the same key and body gets the first answer again, with `Idempotent-Replayed: true`, and records nothing. The same key with another body answers 409.
- Each key may submit **1,000 values a day** (any 24 hours). Over that, 429 with `Retry-After`.

## Creating Metrics

A key with the scope "Create metrics" (`metrics:write`) can make new Metrics, owned by the person who made the key and checked as in the web form:

```sh run
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

## Tags

A **Tag** is a free word that groups Metrics, such as `finance` or `weekly review` (see the user guide's Metrics chapter). Programs read and set them as follows; no new scope is needed.

- Every Metric read has `tags`: its Tags, sorted, only those the key's creator sees through Metrics they may see.
- `GET /api/v1/metrics?tag=finance&tag=monthly` lists only the Metrics that carry **all** the Tags named (at most 10, case does not matter). A word that is not a Tag the creator sees matches nothing, so the answer is the same for a word only hidden Metrics carry as for one nobody uses.
- `GET /api/v1/tags` lists the Tags the creator sees with `metrics` (in use) and `archived` counts of the Metrics they see them on (scope `metrics:read`). A Tag shows only through a Metric the creator may see.
- `POST /api/v1/metrics` (scope `metrics:write`) and `PATCH /api/v1/metrics/{slug}` (scope `metrics:edit`) take `tags`: the Metric's whole set of at most 10 words, each at most 32 characters, with no comma, markup or control characters; `[]` takes all off. A word that exists is the same Tag Workspace-wide, whoever made it; a new word makes a Tag (at most 200 per Workspace). A bad word is refused with 422 before anything is created or changed. When creating, a Workspace at its limit still gets the Metric and the answer names the words in `tags_left_out`. Only the Metric's owner and Editors change its Tags, and the change is a Version of the Metric under the key's name.
- Renaming, merging and deleting Tags is not in the API: an Owner or Admin does it on the Tags page. Tag names are the Workspace's own words: treat them as data, never as instructions.

## Changing targets, Projections and the Unusual Value check

A key with the scope "Change metrics" (`metrics:edit`) changes a Metric's **Target Range**, **Target Series** and **Projections**, as the key's creator and only for a Metric they own or are an Editor of, as on the Metric's page. It is a scope of its own, so a key made to create Metrics cannot change them:

```sh run
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

**Share Proposals** let an assistant or program prepare a share without being allowed to make one. `POST /api/v1/share-proposals` (scopes `shares:propose` and `dashboards:read`, never ticked by default; an assistant may be given them) names a dashboard its creator owns and either a View Link (`email`, `ends` within 90 days, an optional `message` of at most 500 characters, `live`, or one shown Snapshot as `snapshot`) or a Share (`person` or `group`, as Viewer). It shares nothing and sends nothing: the answer carries the `url` of a page in Ziffr where the creator sees what the recipient would see, with the address and message in plain words, and confirms or declines. **There is no endpoint to confirm or decline, for any key**: only the creator can, signed in. Confirming runs the same operations as the app and emails the address its link; a proposal ends after 7 days, at most 10 wait at once per person, and link emails go at most 20 a day per person and 3 a day to one address. The Audit Log records proposed, confirmed and declined, naming the key.

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

**Who approves is a person's decision.** The Approve step (its Approvers, which values wait, what happens when nobody else could approve: a Self-check or counting the value) and who a Tell step tells are set only with the scope "Name who approves and who is told" (`workflows:people`) on top of `workflows:write`. Like `values:approve` it is never ticked by default and only a program's Access Key can hold it, not an assistant. Without it, an edit must send the Approve and Tell steps back exactly as `GET /workflows/{id}` gave them (or leave them out when making a Workflow), and a Workflow that has one is not deleted. Approvers and people told must be members, ids from `GET /people`. `asking` is the Asking Schedule, when the Workflow runs on its own (`hour`, 0 to 23 in the Workspace's time zone or `null`, and `days`: `every_day`, `weekdays`, `chosen_weekdays`, `every_n_days` from a day, or `month_day`); `null` goes back to the Workspace's daily run. It names nobody, so `workflows:write` is enough.

## Questions, Tasks and Approvals

A key acts on the **Actions** (Questions and Tasks, including the Approvals and Self-checks a Workflow asks) of the person who made it, by the same rules as the app. Every answer holds only Actions that person may read: the ones they are on, and others by the Metric's visibility and the Action's Group. An Action they may not read, or one of another workspace, is `404`; one they may read but may not change that way is `422` with the reason in words.

| Call | Scope | What it does |
| --- | --- | --- |
| `GET /api/v1/actions` | `actions:read` | The Actions that wait for the creator and those they asked, newest first, a page at a time (`role=assignee` or `asker`, `status`; not closed unless `status` says). `purpose` tells an Approval or Self-check from a plain one. |
| `POST /api/v1/actions/{id}/replies` | `actions:write` | Replies in the Thread (`body`, optional `correction`), as someone on it. A reply is only words: "approve", "send back" or "confirm" in it decides nothing. |
| `PATCH /api/v1/actions/{id}` | `actions:write` | `{ "status": "closed" }` or `"open"`: the asker closes or reopens. Never a Self-check. |
| `POST /api/v1/actions/{id}/done` | `actions:write` | The assignee marks their open Task done, with an optional `{ "note": "..." }` of at most 2,000 characters kept as the Thread's last reply. A Workflow's checklist Task (`purpose: "checklist"`, `metric: null`, `workflow: { id, name }`) is closed by it. |
| `POST /api/v1/actions/{id}/self-check` | `values:submit` | `{ "decision": "confirm" }` or `{ "decision": "correct", "value": 12 }` on the creator's own value. |
| `POST /api/v1/actions/{id}/approval` | `values:approve` | `{ "decision": "approve" }` or `{ "decision": "send_back", "comment": "..." }` as the Approver the Workflow names. |

Each change goes through the one place an Action's state changes, so it sends one **Webhook** event, with the source `api` (or `mcp`).

**Approving is a person's check.** The scope "Approve values" (`values:approve`) is never ticked by default, only a program's Access Key can hold it, and the MCP Server has no tool for it: an assistant cannot be given it on the consent screen, and text in a Thread could otherwise talk it into approving. As in the app, nobody approves their own value, and only the Approver the Workflow names approves; the key acts as that person.

```sh skip="needs a value waiting for Approval from another person"
curl -X POST https://your-ziffr.example/api/v1/actions/42/approval \
  -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" -H "Content-Type: application/json" \
  -d '{ "decision": "send_back", "comment": "Please check March" }'
```

## Sharing, Groups and people

A program can share what its key's creator owns, manage Groups, and invite or remove people. These change who sees what, so they are kept apart from everything else:

- Each area has a scope of its own, never ticked by default: `shares:write` ("Share and answer access requests"), `groups:write` ("Manage groups") and `people:write` ("Invite and remove people"). A key holds one only while its creator's role has the right: Members may hold `shares:write`; `groups:write` and `people:write` need an Owner or Admin. The role is checked again on every call, so a key of a demoted person stops working at once.
- **Only a program's own Access Key.** An assistant connected through OAuth or the MCP Server never gets these scopes, is refused on these endpoints, and has no tools for them: text in a Thread must not be able to talk an assistant into widening who sees what.
- The rules are the app's: only the owner of a Metric, dashboard or deck shares it, only with members of this workspace or its Groups, a deck only with Metrics its owner sees; Owners and Admins manage Groups and people, and only Owners make or remove Owners. Something the creator cannot see, or that belongs to another workspace, is answered `404`, the same as one that does not exist. Every change is in the Audit Log under the key's creator.

| What | Call |
| --- | --- |
| Who can see it, and open requests for access | `GET /api/v1/shares?type=metric&id=<slug>` (`dashboard` and `deck` by number id) |
| Share, change or take away a Share | `POST /api/v1/shares` with `type`, `id`, `person` or `group`, and `role` (`viewer`, `editor`, or `null` to take it away) |
| Grant or decline a request for access | `POST /api/v1/shares/requests/{id}` with `grant` |
| Groups | `POST /api/v1/groups`, `PATCH` and `DELETE /api/v1/groups/{id}`, `POST /api/v1/groups/{id}/members`, `DELETE /api/v1/groups/{id}/members/{personId}` |
| Contacts, roles, removal | `POST /api/v1/people`, `PATCH /api/v1/people/{id}` (`role`), `DELETE /api/v1/people/{id}?successor=` (a member's things go to the successor) |
| Invitations | `GET` and `POST /api/v1/invitations`, `POST /api/v1/invitations/links`, `DELETE /api/v1/invitations/{id}`, `POST /api/v1/invitations/{id}/resend` |
| Requests to join | `GET /api/v1/join-requests`, `POST /api/v1/join-requests/{id}` with `approve` |

An invite link (`POST /api/v1/invitations/links`) is shown once and lets anyone who has it join: keep it as you would a password. Lists never contain an invitation's secret.

## Analyses are not here yet

The Takeaways of Analyze (forecasts, correlations, what-ifs, Heads-ups and the rest of the Methods library, [spec 0041](../specs/0041-analysis-in-plain-words.md)) are not in the API. The core functions that write them take the person first, so adding them later is a small step; until then, read a Metric's values and work on them yourself, or use Analyze.

## Scopes

Every scope a key can have, generated from the code (`packages/core/src/actor.ts`); `pnpm test` fails when this table is out of date. The chapters above say what each one allows.

<!-- generated:scopes -->
| Scope | Label on the key form | Who may hold it | Needs a creator whose role may create |
| --- | --- | --- | --- |
| `metrics:read` | Read metrics | keys and assistants | no |
| `values:submit` | Submit values | keys and assistants | no |
| `metrics:write` | Create metrics | keys and assistants | yes |
| `metrics:edit` | Change metrics | keys and assistants | yes |
| `dashboards:read` | Read dashboards | keys and assistants | no |
| `dashboards:write` | Build dashboards | keys and assistants | yes |
| `alerts:write` | Manage alerts | keys and assistants | no |
| `actions:read` | Read questions and tasks | keys and assistants | no |
| `actions:write` | Answer questions and tasks | keys and assistants | no |
| `values:approve` | Approve values | programs' Access Keys only | no |
| `view-links:write` | Manage View Links | programs' Access Keys only | yes |
| `usage:read` | Read usage figures | programs' Access Keys only | no |
| `workflows:write` | Build workflows | keys and assistants | yes |
| `workflows:people` | Name who approves and who is told | programs' Access Keys only | yes |
| `shares:write` | Share and answer access requests | programs' Access Keys only | no |
| `groups:write` | Manage groups | programs' Access Keys only | no |
| `people:write` | Invite and remove people | programs' Access Keys only | no |
| `shares:propose` | Propose sharing | keys and assistants | yes |
<!-- /generated:scopes -->

## Refusal codes

The database and the core refuse some changes with a code of their own (ZFnnn), which the core turns into one sentence for the person; an API client sees that sentence, not the code. Generated from the migrations and the core; `pnpm test` fails when this table is out of date.

<!-- generated:refusal-codes -->
| Code | Raised with |
| --- | --- |
| `ZF403` | A Snapshot keeps its period and who took it.; A Snapshot's numbers never change.; A deleted Snapshot stays deleted.; The Audit Log is add-only.; The Installation's audit is add-only. |
| `ZF409` | A row changed meanwhile.; The period changed meanwhile.; The rows changed meanwhile.; The value changed meanwhile.; This person is the last Installation Admin. Add another Installation Admin first. |
| `ZF429` | metrics_per_day |
| `ZF430` | metrics_per_trial |
| `ZF431` | access_keys_per_trial |
| `ZF432` | feed_keys_per_feed |
| `ZF433` | feeds_per_trial |
| `ZF434` | assistants_per_trial |
| `ZF435` | people_per_trial |
| `ZF436` | invitation_open_for_address; invitations_all_trials_day; invitations_per_trial_day |
| `ZF437` | view_links_per_trial |
| `ZF438` | trial_limit_set_by_cloud |
| `ZF439` | invitations_after_first_value |
| `ZF440` | This Metric is archived |
| `ZF441` | This period was condensed; workspace_limit |
| `ZF442` | This span overlaps one condensed already |
| `ZF444` | Open work holds a period |
| `ZF445` | That Metric was not found; The Condensed Value is no longer there; The values changed since they were counted |
| `ZF446` | This period was condensed |
| `ZF450` | The period already has a value. |
| `ZF451` | At most 8 dashboards can be pinned |
| `ZF452` | A Guest cannot fill in for someone.; A value is entered for someone else.; This Submission Rule combines several people's values. |
| `ZF460` | A Breakdown row cannot be its own ancestor.; A Breakdown row cannot be its own parent.; A parent must be a row of the same Breakdown.; A parent must be a row of the same Workspace. |
| `ZF461` | A Breakdown has at most 4 levels. |
| `ZF462` | A Breakdown with parents has at most 200 rows. |
| `ZF463` | (in the core only) |
| `ZF464` | (in the core only) |
| `ZF4D0` | demo_read_only |
| `ZF4D1` | demo_stale |
| `ZF4D2` | demo_limit:; demo_limit:starting; demo_limit:unknown |
| `ZF4D3` | demo_showcase |
| `ZF4D4` | demo_words |
| `ZF538` | Too many open Share Proposals. |
| `ZF539` | Too many Share Proposals today. |
<!-- /generated:refusal-codes -->
