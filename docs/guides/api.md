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
- `POST /api/v1/metrics/{slug}/target-series` and `/projections` take 1 to 500 items: a period's first day and a value, or null to remove that period. Every item is checked before anything is written; one refused item (not a period's first day, or a Projection for a period that is over) answers 422 and writes nothing. Repeating a call is safe.
- `GET` on the same two addresses lists them with `metrics:read`, for any Metric the key's creator sees.
- `GET /api/v1/metrics/{slug}/unusual-value-check` says what makes a value an **Unusual Value** in the Metric's Workflow (`change_pct`, `outside_target`), with the Workflow's name, whether the key's creator owns it and how many Metrics they see share it. `PATCH` on it changes that check: it changes the Workflow, so every Metric that shares it, and only the Workflow's owner may. A Metric without a Workflow, or a Workflow without a check step, answers 422; steps are added only in Ziffr.
- Seen but not theirs to change answers 403 with the reason; a Guest's key is refused (403), also when the person became a Guest after making the key.

