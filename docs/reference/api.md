<!-- Generated from the OpenAPI document by `pnpm --filter @ziffr/web api:reference`. Never edit by hand. -->

# Ziffr API, version 1

Read the Metrics an Access Key's creator sees and submit values, with the key in `Authorization: Bearer <key>`. Version 1 does not change in ways that break a client.

Every path is under `/api/v1`. The machine-readable description is at `/api/v1/openapi.json`. To make a first call, see [the API guide](../guides/api.md).

## List Metrics

`GET /metrics` · scope `metrics:read`

The Metrics the key's creator sees, oldest first, a page at a time.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `limit` | query | integer, 1 to 100, default 50 | no | Items per page, 1 to 100. |
| `cursor` | query | string, at most 128 characters | no | The `next` of the page before. Opaque. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `items` | array of object | yes | This page, at most `limit` long. |
| `items[].slug` | string | yes | Stable id in paths; survives renames of the name. |
| `items[].name` | string | yes |  |
| `items[].description` | string | yes |  |
| `items[].period` | `"day"`, `"week"`, `"month"` | yes | How often it has a value. |
| `items[].format` | `"number"`, `"currency"`, `"percent"` | yes | How its values are written. |
| `items[].unit` | string | yes | Shown after the value, such as orders or EUR. |
| `items[].decimals` | integer, 0 to 6 | yes | Decimal places to show. |
| `items[].polarity` | `"higher"`, `"lower"`, `"target"` | yes | Whether higher or lower values are better, or a range (target). |
| `items[].aggregation` | `"sum"`, `"average"`, `"last"`, `"none"` | yes | How values combine over longer spans. |
| `items[].target_min` | number or null | yes | The low end of its target, if any. |
| `items[].target_max` | number or null | yes | The high end of its target, if any. |
| `items[].derived` | boolean | yes | A Derived Metric: computed from others, takes no values. |
| `next` | string or null | yes | Pass as `cursor` for the next page; null on the last page. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Describe a Metric

`GET /metrics/{slug}` · scope `metrics:read`

One Metric's description: period, format, unit, Polarity and target. A Metric the key's creator may not see is not found.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `slug` | path | string | yes | The Metric's slug. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `slug` | string | yes | Stable id in paths; survives renames of the name. |
| `name` | string | yes |  |
| `description` | string | yes |  |
| `period` | `"day"`, `"week"`, `"month"` | yes | How often it has a value. |
| `format` | `"number"`, `"currency"`, `"percent"` | yes | How its values are written. |
| `unit` | string | yes | Shown after the value, such as orders or EUR. |
| `decimals` | integer, 0 to 6 | yes | Decimal places to show. |
| `polarity` | `"higher"`, `"lower"`, `"target"` | yes | Whether higher or lower values are better, or a range (target). |
| `aggregation` | `"sum"`, `"average"`, `"last"`, `"none"` | yes | How values combine over longer spans. |
| `target_min` | number or null | yes | The low end of its target, if any. |
| `target_max` | number or null | yes | The high end of its target, if any. |
| `derived` | boolean | yes | A Derived Metric: computed from others, takes no values. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## List a Metric's values

`GET /metrics/{slug}/observations` · scope `metrics:read`

The Metric's values for the periods from `from` to `to` (first days, both included), oldest first, with state, submitter and Breakdown. A Derived Metric's values are computed.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `slug` | path | string | yes | The Metric's slug. |
| `limit` | query | integer, 1 to 100, default 50 | no | Items per page, 1 to 100. |
| `cursor` | query | string, at most 128 characters | no | The `next` of the page before. Opaque. |
| `from` | query | string | no | The first period, YYYY-MM-DD. |
| `to` | query | string | no | The last period, YYYY-MM-DD. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `items` | array of object | yes | This page, at most `limit` long. |
| `items[].period` | string | yes | The period's first day, YYYY-MM-DD. |
| `items[].value` | number | yes | The value shown for the period: the latest when the Metric keeps several. |
| `items[].state` | `"recorded"`, `"awaiting_approval"`, `"locked"` | yes | recorded, waiting for Approval, or locked (no more values). |
| `items[].submitter` | string or null | yes | The id of the person who submitted it (see /people); null for a Derived Metric or an import. |
| `items[].breakdown` | array of object or null | yes | The value's parts (GLOSSARY: Breakdown), or null. |
| `items[].breakdown[].label` | string | yes | What the part is, such as a shop or a channel. |
| `items[].breakdown[].value` | number | yes |  |
| `next` | string or null | yes | Pass as `cursor` for the next page; null on the last page. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Submit a value

`POST /metrics/{slug}/observations` · scope `values:submit`

Records a value for the current period, or the one named, through the Metric's Submission Rule, Locks and Approvals, as the key's creator. Each key may submit 1,000 values in any 24 hours.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `slug` | path | string | yes | The Metric's slug. |
| `Idempotency-Key` | header | string | no | A repeat with the same key and body within 24 hours gets the first answer, with `Idempotent-Replayed: true`. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `value` | number | yes | The value. With a breakdown, the total; the rows need not add up to it. |
| `period` | string | no | The period's first day, YYYY-MM-DD; the current period if left out. |
| `breakdown` | array of object (at most 500) | no | The value's parts, such as per shop. |
| `breakdown[].label` | string, at most 200 characters | yes | What the part is. |
| `breakdown[].value` | number | yes |  |

**Answer** (201)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `status` | `"recorded"`, `"awaiting_approval"` | yes | recorded, or waiting for Approval as an Unusual Value. |
| `period` | string | yes | The period it was recorded for, YYYY-MM-DD. |
| `value` | number | yes | The period's value now: the Submission Rule may have added it to an earlier one. For a key that may not read metrics, the value sent. |
| `detail` | string | yes | What happened, in words. For a key that may not read metrics, without earlier values. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope. Or the key's creator does not submit values for this Metric.
- 404: `not_found`: nothing here the key's creator may see.
- 409: The Idempotency-Key was used with another body, or its first submission is still running.
- 422: `locked`: the period is locked, and the value went to the Metric's owner as a proposed Correction. `unprocessable`: the Submission Rule, a Derived Metric or the period refused it.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## List people

`GET /people` · scope `metrics:read`

The workspace's people and Contacts: id and name only, never contact details.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `limit` | query | integer, 1 to 100, default 50 | no | Items per page, 1 to 100. |
| `cursor` | query | string, at most 128 characters | no | The `next` of the page before. Opaque. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `items` | array of object | yes | This page, at most `limit` long. |
| `items[].id` | string | yes | Stable id, as in an observation's submitter. |
| `items[].name` | string | yes |  |
| `items[].contact` | boolean | yes | A Contact: known to the workspace, no sign-in, only submits values. |
| `next` | string or null | yes | Pass as `cursor` for the next page; null on the last page. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## List Groups

`GET /groups` · scope `metrics:read`

The workspace's Groups: id and name.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `limit` | query | integer, 1 to 100, default 50 | no | Items per page, 1 to 100. |
| `cursor` | query | string, at most 128 characters | no | The `next` of the page before. Opaque. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `items` | array of object | yes | This page, at most `limit` long. |
| `items[].id` | integer | yes | Stable id. |
| `items[].name` | string | yes |  |
| `items[].everyone` | boolean | yes | The Group of everyone in the workspace except Guests. |
| `next` | string or null | yes | Pass as `cursor` for the next page; null on the last page. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Errors

Every error answer has this shape:

```json
{ "error": { "code": "not_found", "message": "Not found." } }
```
