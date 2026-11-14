# The API

Programs reach a workspace's numbers through a REST API at `/api/v1`, acting with an Access Key ([spec 0002](../specs/0002-api-and-mcp.md)). A key acts for the person who made it: it sees what that person sees, within the scopes it was given, in one workspace.

## Making a first call

1. On the Team page, create an Access Key with the scope "read metrics". Copy it: it is shown once.
2. Call the API with the key in the `Authorization` header:

```sh
curl -H "Authorization: Bearer $ZIFFR_ACCESS_KEY" https://your-ziffr.example/api/v1/metrics
```

## What every answer has in common

- **Errors** are `{ "error": { "code": "...", "message": "..." } }`. The codes are `invalid_request` (400), `unauthorized` (401: no key, or one that ended, was revoked, or whose creator left), `forbidden` (403: the key lacks the scope), `not_found` (404), `conflict` (409), `unprocessable` (422), `rate_limited` (429) and `internal` (500).
- **Something you may not see is not found.** A Metric in another workspace, or one not shared with the key's creator, answers 404, the same as one that does not exist.
- **Lists page with a cursor.** Pass `limit` (1 to 100, default 50) and the `next` value of the previous page as `cursor`. `next` is null on the last page. Treat cursors as opaque.
- **Each key may make about 60 calls a minute.** Over that, the answer is `rate_limited` (429) with a `Retry-After` header in seconds; wait that long and try again. Refused calls do not count against the limit.
- **Every call is logged** in the key's Access Log: when, the method, the route (`/api/v1/metrics/{slug}`, without query or slug), and the status, never what was sent. The key's creator sees it on the Team page, Owners and Admins for every key; entries are kept 90 days.
- **Nothing is cached** (`Cache-Control: no-store`), and the API sends no CORS headers: call it from a server or a script, never from a web page, which would expose the key.

## Endpoints

| Method and path | Scope | What it does |
| --- | --- | --- |
| `GET /api/v1/metrics` | read metrics | The Metrics the key's creator sees, by age, a page at a time |
| `GET /api/v1/metrics/{slug}` | read metrics | One Metric's description: period, format, unit, Polarity, target |
| `GET /api/v1/metrics/{slug}/observations` | read metrics | Its values, oldest first, with state, submitter and Breakdown; `from` and `to` (YYYY-MM-DD, both included) pick the periods |
| `GET /api/v1/people` | read metrics | The workspace's people and Contacts: id and name, never contact details |
| `GET /api/v1/groups` | read metrics | The workspace's Groups: id and name |

More endpoints, the OpenAPI document and a reference page follow with spec 0002's tickets.
