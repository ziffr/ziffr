# The Ziffr Cloud API

The interface hosted Ziffr's billing service, Ziffr Cloud, uses to set each Workspace's limit on Metrics (spec 0029, ADR 0013). It is off unless the server's environment has `ZIFFR_CLOUD_KEY`; without it every endpoint answers 404. Self-hosters never need it.

## Signing a call

Two keys are derived from `ZIFFR_CLOUD_KEY` (at least 32 bytes) with HKDF-SHA256, an empty salt, 32 bytes of output and these labels:

- `ziffr/cloud-api/v1` signs calls to the API;
- `ziffr/cloud-handover/v1` signs the handover tokens Ziffr gives Owners.

Every call carries `Ziffr-Cloud-Signature: t=<unix time in seconds>, v1=<hex HMAC-SHA256>`. The HMAC is over four lines joined by a newline: the time as in `t`, the method in capitals, the path with its query (such as `/api/cloud/v1/limits?limit=50`), and the hex SHA-256 of the body (of the empty string for a GET).

A call is refused with 401 when the signature is missing, wrong, more than five minutes old or ahead, or was used before. At most 60 calls a minute pass; more get 429. Bodies are JSON of at most 4 KB.

## Endpoints

| Call | What it does |
| --- | --- |
| `GET /api/cloud/v1/workspaces/{id}` | The Workspace's numbers (below). One that does not exist answers `exists: false`. |
| `GET /api/cloud/v1/limits?after=<id>&limit=<1-100>` | The Workspaces whose limit Ziffr Cloud set, by id: `{ items, next }`, where `next` is the `after` of the next page. |
| `PUT /api/cloud/v1/workspaces/{id}/limit` | Sets the limit: `{ "metrics": 50, "label": "Small", "next": { "label": "Team", "on": "2026-12-01" } }`. `metrics` is 1 to 1,000,000, or null to give the Workspace back to the Installation's default, which drops its label and coming change. Answers the Workspace's numbers; 404 for one that does not exist. |

A Workspace's numbers: `id`, `exists`, `metrics` (its Metrics, Archived Metrics not counted), `limit`, `label`, `room` (the limit and 10 % more, at least one), `over_limit_since`, `trial_ends_at`, `set_by` (`cloud`, `installation_admin` or null) and `next`. Never a name, a Metric, a value or a person.

## The handover

**Change Size** and **Billing and invoices** in Workspace settings post the Owner to `ZIFFR_CLOUD_URL` + `/handover` with one form field, `token`: `<payload>.<mac>`, both base64url. The mac is HMAC-SHA256 of the payload text with the handover key. The payload is JSON: `v` (1), `purpose` (`size` or `billing`), `workspace` (`id`, `name`), `person` (`id`, `email`, proven by signing in), `role` (`owner`), `nonce` and `exp` (unix seconds, five minutes ahead). Ziffr Cloud checks the mac and the expiry and takes each nonce once. Ziffr trusts nothing in the address Ziffr Cloud sends the Owner back to.
