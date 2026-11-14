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
- `period` is the first day of a period (`2026-11-01` for a monthly Metric, a Monday for a weekly one); without it, the current period. A future period is refused.
- The answer (201) says `recorded`, or `awaiting_approval` when the value is unusual and waits for Approval. A locked period answers 422 `locked`, and the value goes to the Metric's owner as a proposed Correction. The Submission Rule or a Derived Metric can refuse it with 422 `unprocessable`.
- **Idempotency-Key** (optional, up to 200 characters): a repeat within 24 hours with the same key and body gets the first answer again, with `Idempotent-Replayed: true`, and records nothing. The same key with another body answers 409.
- Each key may submit **1,000 values a day** (any 24 hours). Over that, 429 with `Retry-After`.

