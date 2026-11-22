# The Ziffr Cloud API

The interface hosted Ziffr's billing service, Ziffr Cloud, uses to set each Workspace's limit on Metrics (spec 0029, ADR 0013). It is off unless the server's environment has `ZIFFR_CLOUD_KEY`; without it every endpoint answers 404. Self-hosters never need it.

## Signing a call

Two keys are derived from `ZIFFR_CLOUD_KEY` (at least 32 bytes) with HKDF-SHA256, an empty salt, 32 bytes of output and these labels:

- `ziffr/cloud-api/v1` signs calls to the API;
- `ziffr/cloud-handover/v1` signs the handover tokens Ziffr gives Owners.

Every call carries `Ziffr-Cloud-Signature: t=<unix time in seconds>, v1=<hex HMAC-SHA256>`. The HMAC is over four lines joined by a newline: the time as in `t`, the method in capitals, the path with its query (such as `/api/cloud/v1/limits?limit=50`), and the hex SHA-256 of the body (of the empty string for a GET).

A call is refused with 401 when the signature is missing, wrong, more than five minutes old or ahead, or was used before (used signatures are kept fifteen minutes). At most 60 calls a minute pass; more get 429. Bodies are JSON of at most 4 KB.

## Endpoints

| Call | What it does |
| --- | --- |
| `GET /api/cloud/v1/workspaces/{id}` | The Workspace's numbers (below). One that does not exist answers `exists: false`. |
| `GET /api/cloud/v1/limits?after=<id>&limit=<1-100>` | The Workspaces whose limit Ziffr Cloud set, by id: `{ items, next }`, where `next` is the `after` of the next page. |
| `PUT /api/cloud/v1/workspaces/{id}/limit` | Sets the limit: `{ "metrics": 50, "label": "Small", "next": { "label": "Team", "on": "2026-12-01" } }`. `metrics` is 1 to 1,000,000, or null to give the Workspace back to the Installation's default, which drops its label and coming change. Each PUT replaces the label and coming change: one left out is removed. With `"endTrial": true`, a Trial Workspace becomes an ordinary one with this limit at once (an Owner booked a Size during the trial). Answers the Workspace's numbers; 404 for one that does not exist. |

A Workspace's numbers: `id`, `exists`, `metrics` (its Metrics, Archived Metrics not counted), `limit`, `label`, `room` (the limit and 10 % more, at least one), `over_limit_since`, `trial_ends_at`, `set_by` (`cloud`, `installation_admin` or null) and `next`. Never a name, a Metric, a value or a person.

## Trial Limits

The Trial Limits are the numbers that bound every Trial Workspace (spec 0040). Ziffr Cloud reads and sets them for all trials at once; they are not per Workspace.

| Call | What it does |
| --- | --- |
| `GET /api/cloud/v1/trial-limits` | `{ "limits": { ... }, "sources": { ... } }`: each limit in effect, and where it comes from (`cloud`, `page`, `server` or `default`). `days` is null while trials are off. |
| `PUT /api/cloud/v1/trial-limits` | Changes the limits it names, answering as GET does. The body is an object, at most 4 KB, and unknown names are refused. A whole number sets a limit; `null` gives it back to its default (`days`: `null` switches trials off, explicitly); a limit left out stays as it is. |

- `days`: Days a trial lasts, 1 to 30, default 14; `null` means 0, trials off. Applies to trials made afterwards.
- `graceDays`: Days a trial's data stays after it ends, 1 to 60, default 7.
- `max`: Trials at once, 1 to 100,000, default 500.
- `metrics`: Metrics, 5 to 100, default 25.
- `messagesPerDay`: Messages a trial sends a day, 10 to 500, default 100. Over email, Slack and Telegram together.
- `keys`: Access Keys that work, 1 to 10, default 2.
- `feeds`: Feeds, and Feed Keys per Feed, 1 to 10, default 2.
- `assistants`: Connected assistants, 1 to 5, default 1.
- `webhooks`: Webhooks, 0 to 10, default 2. Workspace and personal together; 0 switches them off for trials.
- `webhookSendsPerDay`: Webhook sends a trial makes a day, 10 to 1,000, default 200.
- `viewLinks`: View Links that work, 0 to 20, default 5. 0 means trials cannot make any.

A number outside its range answers 400, and nothing is saved. The changes are written in one step, together with the numbers the database reads, so two calls at once leave one of them whole. A limit Ziffr Cloud set cannot be changed from the Installation settings page, and the database refuses any change of it but this call's. A number applies to running trials at once, except `days`, which applies to trials made afterwards. Lowering one never deletes or stops what a trial has: a trial over the new number keeps what it has and cannot add more. A limit the server's environment sets wins over what is sent, and `sources` says so. The call reads and writes numbers only, and the answer holds nothing of any trial.

## The handover

**Change Size** and **Billing and invoices** in Workspace settings post the Owner to `ZIFFR_CLOUD_URL` + `/handover` with one form field, `token`: `<payload>.<mac>`, both base64url. The mac is HMAC-SHA256 of the payload text with the handover key. The payload is JSON: `v` (1), `purpose` (`size` or `billing`), `workspace` (`id`, `name`), `person` (`id`, `email`, proven by signing in), `role` (`owner`), `nonce`, `aud` (the address of the Installation that made it, from `ZIFFR_SITE_URL`), `iat` and `exp` (unix seconds; `exp` five minutes after `iat`). Use one `ZIFFR_CLOUD_KEY` per Installation, and check `aud`. Ziffr Cloud checks the mac and the expiry and takes each nonce once. Ziffr trusts nothing in the address Ziffr Cloud sends the Owner back to.
