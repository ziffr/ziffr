<!-- Generated from the OpenAPI document by `pnpm --filter @ziffr/web api:reference`. Never edit by hand. -->

# Ziffr API, version 1

Read the Metrics an Access Key's creator sees and submit values, and build dashboards as them, with the key in `Authorization: Bearer <key>`. A Feed Key (spec 0012) uses only the `/feed` endpoints. Version 1 does not change in ways that break a client.

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
| `items[].period` | `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"` | yes | How often it has a value: a day, an ISO week, a month, or a quarter or year of the workspace's fiscal year (GET /workspace). |
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
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Create a Metric

`POST /metrics` · scope `metrics:write`

Creates a Metric owned by the key's creator, checked like one made in the web form; its history names the key. Each key may create 50 Metrics in any 24 hours.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `Idempotency-Key` | header | string | no | A repeat with the same key and body within 24 hours gets the first answer, with `Idempotent-Replayed: true`. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `name` | string, at most 120 characters | yes | What it is called; its slug is made from it. |
| `description` | string, at most 2000 characters | no |  |
| `unit` | string, at most 20 characters | no | Shown after the value, such as orders or EUR. |
| `format` | `"number"`, `"currency"`, `"percent"` | no | Default number. |
| `decimals` | integer, 0 to 6 | no | Default 0. |
| `period` | `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"` | no | Default month. Quarters and years start from the workspace's year start. |
| `submission_rule` | `"reject"`, `"overwrite"`, `"add"`, `"keep_both"` | no | What a second value for a period does. Default overwrite. |
| `polarity` | `"higher"`, `"lower"`, `"target"` | no | Default higher. |
| `aggregation` | `"sum"`, `"average"`, `"last"`, `"none"` | no | Default sum. |
| `target_min` | number or null | no |  |
| `target_max` | number or null | no |  |
| `submit` | boolean | no | Make the key's creator its Submitter, so the key can submit values to it at once. |

**Answer** (201)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `slug` | string | yes | Stable id in paths; survives renames of the name. |
| `name` | string | yes |  |
| `description` | string | yes |  |
| `period` | `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"` | yes | How often it has a value: a day, an ISO week, a month, or a quarter or year of the workspace's fiscal year (GET /workspace). |
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
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys. Or the key's creator's role may not create Metrics (Guests).
- 404: `not_found`: nothing here the key's creator may see.
- 409: The Idempotency-Key was used with another body, or its first creation is still running.
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
| `period` | `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"` | yes | How often it has a value: a day, an ISO week, a month, or a quarter or year of the workspace's fiscal year (GET /workspace). |
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
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Delete a Metric

`DELETE /metrics/{slug}` · scope `metrics:write`

Deletes a Metric the key's creator owns, with its values, targets, questions and form links, as in the app: refused while another Metric's formula, a widget, a deck or a working View Link uses it. The Audit Log names the key.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `slug` | path | string | yes | The Metric's slug. |
| `confirm` | query | string, at most 200 characters | yes | The Metric's exact name, repeated to confirm. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `deleted` | string | yes |  |
| `values` | integer | yes |  |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys. Or the key's creator sees the Metric but does not own it.
- 404: `not_found`: nothing here the key's creator may see.
- 422: The name does not match, or something still uses the Metric; nothing was deleted.
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
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
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
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys. Or the key's creator does not submit values for this Metric.
- 404: `not_found`: nothing here the key's creator may see.
- 409: The Idempotency-Key was used with another body, or its first submission is still running.
- 422: `locked`: the period is locked, and the value went to the Metric's owner as a proposed Correction. `unprocessable`: the Submission Rule, a Derived Metric or the period refused it.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Describe the Feed

`GET /feed` · scope `feed:submit`

For a Feed Key only (spec 0012): the Feed's name and the Metrics it submits to that take API values, with the periods that already have a value, so a Feed knows what to fetch and what is missing. Never a value.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `limit` | query | integer, 1 to 100, default 50 | no | Items per page, 1 to 100. |
| `cursor` | query | string, at most 128 characters | no | The `next` of the page before. Opaque. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `name` | string | yes | The Feed's name, as values from it show in Ziffr. |
| `year_start_month` | integer, 1 to 12 | yes | The month the workspace's fiscal year starts in, 1 (January) to 12: where its Metrics' quarters and years start. |
| `metrics` | object | yes | The Metrics it submits to and that take API values. |
| `metrics.items` | array of object | yes | This page, at most `limit` long. |
| `metrics.items[].slug` | string | yes | Name it in a batch item's `metric`. |
| `metrics.items[].name` | string | yes |  |
| `metrics.items[].period` | `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"` | yes | How often it has a value; quarters and years start from `year_start_month`. |
| `metrics.items[].unit` | string | yes |  |
| `metrics.items[].format` | `"number"`, `"currency"`, `"percent"` | yes |  |
| `metrics.items[].decimals` | integer, 0 to 6 | yes |  |
| `metrics.items[].current` | string | yes | The current period's first day as Ziffr counts it; earlier periods are one period apart from it. |
| `metrics.items[].due_working_days` | integer or null | yes | Working days after a period ends by which its value is due, if its Workflow sets one. |
| `metrics.items[].filled` | array of string | yes | First days of the periods that already have a value, oldest first: at most the latest 1,000. |
| `metrics.next` | string or null | yes | Pass as `cursor` for the next page; null on the last page. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys. Or the key is a person's Access Key, not a Feed Key.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Submit a Feed's values

`POST /feed/observations` · scope `feed:submit`

For a Feed Key only: 1 to 500 values, each through its Metric's Submission Rule, Locks and Approvals, with one result per item in order, so one refused item does not stop the rest. A value for a past period that has none yet is an Import: it is recorded without the Unusual Value check and marked as imported. The body may be 1 MB. Each Feed may record 10,000 values in any 24 hours over all its keys; a batch that would cross that is refused whole.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `Idempotency-Key` | header | string | no | A repeat with the same key and body within 24 hours gets the first answer, with `Idempotent-Replayed: true`. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `items` | array of object (at most 500) | yes | 1 to 500 values; each is taken or refused on its own. |
| `items[].metric` | string | yes | The Metric's slug, as GET /feed lists it. |
| `items[].period` | string | no | The period's first day, YYYY-MM-DD; the current period if left out. |
| `items[].value` | number | yes | The value. With a breakdown, the total; the rows need not add up to it. |
| `items[].breakdown` | array of object (at most 500) | no | The value's parts, such as per region. |
| `items[].breakdown[].label` | string, at most 200 characters | yes |  |
| `items[].breakdown[].value` | number | yes |  |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `results` | array of object | yes | One per item, in the order sent. |
| `results[].metric` | string | yes |  |
| `results[].period` | string or null | yes | The period it was meant for, YYYY-MM-DD; null when the Metric was not found. |
| `results[].status` | `"recorded"`, `"awaiting_approval"`, `"locked"`, `"refused"` | yes | recorded; waiting for Approval as an Unusual Value; locked (it went to the Metric's owner as a proposed Correction); or refused. |
| `results[].imported` | boolean | no | An Import: a past period that had no value, recorded without the Unusual Value check. |
| `results[].code` | string | no | Why it was refused: not_found, duplicate, period, derived, source, no_value, no_token. |
| `results[].detail` | string | yes |  |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys. Or the key is a person's Access Key, not a Feed Key.
- 404: `not_found`: nothing here the key's creator may see.
- 409: The Idempotency-Key was used with another body, or its first batch is still running.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Describe the workspace

`GET /workspace` · scope `metrics:read`

The month the workspace's fiscal year starts in, which every quarterly and yearly Metric's periods start from: with April, a quarterly Metric's periods start on 1 April, 1 July, 1 October and 1 January, and its year is named FY 2026/27.

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `year_start_month` | integer, 1 to 12 | yes | The month the workspace's fiscal year starts in, 1 (January) to 12. Quarters and years, of Metrics and Comparisons, start from it. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
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
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
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
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## List dashboards

`GET /dashboards` · scope `dashboards:read`

The dashboards the key's creator sees, by id, with their role on each and the link to open it.

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
| `items[].role` | `"owner"`, `"editor"`, `"viewer"` | yes | The key's creator's role on it; only an owner or editor can change it. |
| `items[].url` | string | yes | Where to open it in Ziffr. |
| `next` | string or null | yes | Pass as `cursor` for the next page; null on the last page. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Create a dashboard

`POST /dashboards` · scope `dashboards:write`

Creates an empty dashboard owned by the key's creator, with an introduction if given. The Audit Log names the key. Each key may create 50 dashboards in any 24 hours.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `Idempotency-Key` | header | string | no | A repeat with the same key and body within 24 hours gets the first answer, with `Idempotent-Replayed: true`. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `name` | string, at most 120 characters | yes |  |
| `intro` | string, at most 4000 characters | no | An introduction: what it tells, in a sentence or two. |

**Answer** (201)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `id` | integer | yes | Stable id. |
| `name` | string | yes |  |
| `role` | `"owner"`, `"editor"`, `"viewer"` | yes | The key's creator's role on it; only an owner or editor can change it. |
| `url` | string | yes | Where to open it in Ziffr. |
| `intro` | string | yes | Its introduction, shown above it and first in its Read view; empty when it has none. |
| `widgets` | array of object | yes |  |
| `widgets[].id` | integer | yes |  |
| `widgets[].view` | string | yes | Its built-in view. |
| `widgets[].title` | string or null | yes |  |
| `widgets[].metrics` | array of string | yes | Slugs of the Metrics it draws. |
| `widgets[].x` | integer | yes |  |
| `widgets[].y` | integer | yes |  |
| `widgets[].w` | integer | yes |  |
| `widgets[].h` | integer | yes |  |
| `widgets[].words` | object | no | A Finding only: its words. |
| `widgets[].words.kicker` | string, at most 200 characters | no | The small line above the headline. |
| `widgets[].words.headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `widgets[].words.subline` | string, at most 200 characters | no |  |
| `widgets[].words.footnote` | string, at most 500 characters | no |  |
| `widgets[].words.source` | string, at most 200 characters | no |  |
| `widgets[].display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` | no | The period it shows its Metric by, when longer than the Metric's own (GLOSSARY: Display Period). |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys. Or the key's creator's role may not create (Guests).
- 404: `not_found`: nothing here the key's creator may see.
- 409: The Idempotency-Key was used with another body, or its first creation is still running.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Make a dashboard from a Dashboard Template

`POST /dashboards/from-template` · scope `dashboards:write`

Makes a whole dashboard owned by the key's creator from a Dashboard Template, with Metrics for each Slot. It is an independent copy. Counts towards the 50 new dashboards a day.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `Idempotency-Key` | header | string | no | A repeat with the same key and body within 24 hours gets the first answer, with `Idempotent-Replayed: true`. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `template` | string or integer | yes | A Dashboard Template's id from GET /templates?kind=dashboard. |
| `name` | string, at most 120 characters | no | Default: the template's name. |
| `fills` | array of array of string, at most 100 characters (at most 50) (at most 50) | yes | Metric slugs for each Slot, in the template's order: one each, or one or more for a Slot that takes several. |

**Answer** (201)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `id` | integer | yes | Stable id. |
| `name` | string | yes |  |
| `role` | `"owner"`, `"editor"`, `"viewer"` | yes | The key's creator's role on it; only an owner or editor can change it. |
| `url` | string | yes | Where to open it in Ziffr. |
| `intro` | string | yes | Its introduction, shown above it and first in its Read view; empty when it has none. |
| `widgets` | array of object | yes |  |
| `widgets[].id` | integer | yes |  |
| `widgets[].view` | string | yes | Its built-in view. |
| `widgets[].title` | string or null | yes |  |
| `widgets[].metrics` | array of string | yes | Slugs of the Metrics it draws. |
| `widgets[].x` | integer | yes |  |
| `widgets[].y` | integer | yes |  |
| `widgets[].w` | integer | yes |  |
| `widgets[].h` | integer | yes |  |
| `widgets[].words` | object | no | A Finding only: its words. |
| `widgets[].words.kicker` | string, at most 200 characters | no | The small line above the headline. |
| `widgets[].words.headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `widgets[].words.subline` | string, at most 200 characters | no |  |
| `widgets[].words.footnote` | string, at most 500 characters | no |  |
| `widgets[].words.source` | string, at most 200 characters | no |  |
| `widgets[].display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` | no | The period it shows its Metric by, when longer than the Metric's own (GLOSSARY: Display Period). |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys. Or the key's creator's role may not create (Guests).
- 404: `not_found`: nothing here the key's creator may see.
- 409: The Idempotency-Key was used with another body, or its first creation is still running.
- 422: No such template, a Slot not filled, or a Metric the key's creator does not see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Describe a dashboard

`GET /dashboards/{id}` · scope `dashboards:read`

One dashboard with its introduction and its widgets (Findings with their words) in reading order. Metrics are named by slug; values are read per Metric.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `id` | path | integer | yes | The dashboard's id. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `id` | integer | yes | Stable id. |
| `name` | string | yes |  |
| `role` | `"owner"`, `"editor"`, `"viewer"` | yes | The key's creator's role on it; only an owner or editor can change it. |
| `url` | string | yes | Where to open it in Ziffr. |
| `intro` | string | yes | Its introduction, shown above it and first in its Read view; empty when it has none. |
| `widgets` | array of object | yes |  |
| `widgets[].id` | integer | yes |  |
| `widgets[].view` | string | yes | Its built-in view. |
| `widgets[].title` | string or null | yes |  |
| `widgets[].metrics` | array of string | yes | Slugs of the Metrics it draws. |
| `widgets[].x` | integer | yes |  |
| `widgets[].y` | integer | yes |  |
| `widgets[].w` | integer | yes |  |
| `widgets[].h` | integer | yes |  |
| `widgets[].words` | object | no | A Finding only: its words. |
| `widgets[].words.kicker` | string, at most 200 characters | no | The small line above the headline. |
| `widgets[].words.headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `widgets[].words.subline` | string, at most 200 characters | no |  |
| `widgets[].words.footnote` | string, at most 500 characters | no |  |
| `widgets[].words.source` | string, at most 200 characters | no |  |
| `widgets[].display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` | no | The period it shows its Metric by, when longer than the Metric's own (GLOSSARY: Display Period). |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Change a dashboard's name or introduction

`PATCH /dashboards/{id}` · scope `dashboards:write`

Changes the words above a dashboard: its name, and the introduction shown above it and first in its Read view.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `id` | path | integer | yes | The dashboard's id. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `name` | string, at most 120 characters | no |  |
| `intro` | string, at most 4000 characters | no |  |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `id` | integer | yes | Stable id. |
| `name` | string | yes |  |
| `role` | `"owner"`, `"editor"`, `"viewer"` | yes | The key's creator's role on it; only an owner or editor can change it. |
| `url` | string | yes | Where to open it in Ziffr. |
| `intro` | string | yes | Its introduction, shown above it and first in its Read view; empty when it has none. |
| `widgets` | array of object | yes |  |
| `widgets[].id` | integer | yes |  |
| `widgets[].view` | string | yes | Its built-in view. |
| `widgets[].title` | string or null | yes |  |
| `widgets[].metrics` | array of string | yes | Slugs of the Metrics it draws. |
| `widgets[].x` | integer | yes |  |
| `widgets[].y` | integer | yes |  |
| `widgets[].w` | integer | yes |  |
| `widgets[].h` | integer | yes |  |
| `widgets[].words` | object | no | A Finding only: its words. |
| `widgets[].words.kicker` | string, at most 200 characters | no | The small line above the headline. |
| `widgets[].words.headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `widgets[].words.subline` | string, at most 200 characters | no |  |
| `widgets[].words.footnote` | string, at most 500 characters | no |  |
| `widgets[].words.source` | string, at most 200 characters | no |  |
| `widgets[].display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` | no | The period it shows its Metric by, when longer than the Metric's own (GLOSSARY: Display Period). |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Add a widget

`POST /dashboards/{id}/widgets` · scope `dashboards:write`

Adds a widget to a dashboard the key's creator may change, in the first free place in reading order: a built-in view with Metrics, or a team Widget Template with its Slots filled. The dashboard's history names the key. Each key may make 500 changes in any 24 hours.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `id` | path | integer | yes | The dashboard's id. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `view` | `"number"`, `"line"`, `"bars"`, `"gauge"`, `"table"`, `"forecast"`, `"correlation"`, `"matrix"`, `"drivers"`, `"ranked"`, `"share"`, `"pictogram"`, `"story-line"` | no | Default number. Leave out when using `template`. |
| `template` | integer | no | A team Widget Template's id from GET /templates?kind=widget. |
| `metrics` | array of string, at most 100 characters (at most 50) | no | With `view`: the Metrics it draws. |
| `fills` | array of array of string, at most 100 characters (at most 50) (at most 50) | no | With `template`: Metric slugs for each Slot, in order. |
| `title` | string, at most 200 characters | no |  |
| `settings` | object | no |  |
| `settings.window` | integer, 1 to 120 | no | Periods shown. |
| `settings.showTarget` | boolean | no | Draw the target band. |
| `settings.showForecast` | boolean | no | Draw a forecast (line). |
| `settings.rows` | integer, 1 to 50 | no | Rows shown (history table). |
| `settings.display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` or null | no | Show by: a period longer than the Metric's own, its values combined by its Aggregation (number, line, bars, table, forecast); null for the Metric's own period. Ignored when not longer, or for a Metric whose Aggregation is none. |

**Answer** (201)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `id` | integer | yes |  |
| `view` | string | yes | Its built-in view. |
| `title` | string or null | yes |  |
| `metrics` | array of string | yes | Slugs of the Metrics it draws. |
| `x` | integer | yes |  |
| `y` | integer | yes |  |
| `w` | integer | yes |  |
| `h` | integer | yes |  |
| `words` | object | no | A Finding only: its words. |
| `words.kicker` | string, at most 200 characters | no | The small line above the headline. |
| `words.headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `words.subline` | string, at most 200 characters | no |  |
| `words.footnote` | string, at most 500 characters | no |  |
| `words.source` | string, at most 200 characters | no |  |
| `display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` | no | The period it shows its Metric by, when longer than the Metric's own (GLOSSARY: Display Period). |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 422: A view a key may not place (add a Finding with POST /dashboards/{id}/findings), or a Metric the key's creator does not see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Change a widget

`PATCH /dashboards/{id}/widgets/{widgetId}` · scope `dashboards:write`

Changes a widget's view, Metrics, title or settings. A Free Layout is changed only in Ziffr.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `id` | path | integer | yes | The dashboard's id. |
| `widgetId` | path | integer | yes | The widget's or Finding's id. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `view` | `"number"`, `"line"`, `"bars"`, `"gauge"`, `"table"`, `"forecast"`, `"correlation"`, `"matrix"`, `"drivers"`, `"ranked"`, `"share"`, `"pictogram"`, `"story-line"` | no | A built-in view; GET /templates?kind=view lists them with what each is for. |
| `metrics` | array of string, at most 100 characters (at most 50) | no |  |
| `title` | string, at most 200 characters or null | no | null shows the Metric's name. |
| `settings` | object | no |  |
| `settings.window` | integer, 1 to 120 | no | Periods shown. |
| `settings.showTarget` | boolean | no | Draw the target band. |
| `settings.showForecast` | boolean | no | Draw a forecast (line). |
| `settings.rows` | integer, 1 to 50 | no | Rows shown (history table). |
| `settings.display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` or null | no | Show by: a period longer than the Metric's own, its values combined by its Aggregation (number, line, bars, table, forecast); null for the Metric's own period. Ignored when not longer, or for a Metric whose Aggregation is none. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `id` | integer | yes |  |
| `view` | string | yes | Its built-in view. |
| `title` | string or null | yes |  |
| `metrics` | array of string | yes | Slugs of the Metrics it draws. |
| `x` | integer | yes |  |
| `y` | integer | yes |  |
| `w` | integer | yes |  |
| `h` | integer | yes |  |
| `words` | object | no | A Finding only: its words. |
| `words.kicker` | string, at most 200 characters | no | The small line above the headline. |
| `words.headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `words.subline` | string, at most 200 characters | no |  |
| `words.footnote` | string, at most 500 characters | no |  |
| `words.source` | string, at most 200 characters | no |  |
| `display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` | no | The period it shows its Metric by, when longer than the Metric's own (GLOSSARY: Display Period). |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 422: A view a key may not use, a widget only Ziffr changes, or a Metric the key's creator does not see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Remove a widget or Finding

`DELETE /dashboards/{id}/widgets/{widgetId}` · scope `dashboards:write`

Removes a widget or a Finding from a dashboard. The history keeps it, so it can be restored.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `id` | path | integer | yes | The dashboard's id. |
| `widgetId` | path | integer | yes | The widget's or Finding's id. |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `removed` | integer | yes |  |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Add a Finding

`POST /dashboards/{id}/findings` · scope `dashboards:write`

Adds a Finding about one Metric below everything on a dashboard, full width, with its words. Words may hold Placeholders such as {metric} or {change yoy}; empty ones fall back to words drawn from the data.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `id` | path | integer | yes | The dashboard's id. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `kicker` | string, at most 200 characters | no | The small line above the headline. |
| `headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `subline` | string, at most 200 characters | no |  |
| `footnote` | string, at most 500 characters | no |  |
| `source` | string, at most 200 characters | no |  |
| `metric` | string, at most 100 characters | yes | The slug of the Metric it is about. |

**Answer** (201)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `id` | integer | yes |  |
| `view` | string | yes | Its built-in view. |
| `title` | string or null | yes |  |
| `metrics` | array of string | yes | Slugs of the Metrics it draws. |
| `x` | integer | yes |  |
| `y` | integer | yes |  |
| `w` | integer | yes |  |
| `h` | integer | yes |  |
| `words` | object | no | A Finding only: its words. |
| `words.kicker` | string, at most 200 characters | no | The small line above the headline. |
| `words.headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `words.subline` | string, at most 200 characters | no |  |
| `words.footnote` | string, at most 500 characters | no |  |
| `words.source` | string, at most 200 characters | no |  |
| `display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` | no | The period it shows its Metric by, when longer than the Metric's own (GLOSSARY: Display Period). |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 422: A Metric the key's creator does not see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Change a Finding's words

`PATCH /dashboards/{id}/findings/{findingId}` · scope `dashboards:write`

Changes a Finding's kicker, headline, subline, footnote or source. An empty text falls back to words drawn from the data.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `id` | path | integer | yes | The dashboard's id. |
| `findingId` | path | integer | yes | The Finding's id. |

**Body** (JSON)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `kicker` | string, at most 200 characters | no | The small line above the headline. |
| `headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `subline` | string, at most 200 characters | no |  |
| `footnote` | string, at most 500 characters | no |  |
| `source` | string, at most 200 characters | no |  |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `id` | integer | yes |  |
| `view` | string | yes | Its built-in view. |
| `title` | string or null | yes |  |
| `metrics` | array of string | yes | Slugs of the Metrics it draws. |
| `x` | integer | yes |  |
| `y` | integer | yes |  |
| `w` | integer | yes |  |
| `h` | integer | yes |  |
| `words` | object | no | A Finding only: its words. |
| `words.kicker` | string, at most 200 characters | no | The small line above the headline. |
| `words.headline` | string, at most 200 characters | no | States the finding, such as "Churn doubled after the price change". |
| `words.subline` | string, at most 200 characters | no |  |
| `words.footnote` | string, at most 500 characters | no |  |
| `words.source` | string, at most 200 characters | no |  |
| `display` | `"week"`, `"month"`, `"quarter"`, `"half"`, `"year"` | no | The period it shows its Metric by, when longer than the Metric's own (GLOSSARY: Display Period). |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 422: A widget that is not a Finding: only a Finding has words.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## List templates

`GET /templates` · scope `dashboards:read`

What a key can build with: the built-in views, the team's Widget Templates and the Dashboard Templates, with their Slots and the Metrics suggested for each that the key's creator sees.

**Parameters**

| Name | In | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| `kind` | query | `"view"`, `"widget"`, `"dashboard"` | no |  |

**Answer** (200)

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `items` | array of object | yes |  |
| `items[].id` | string or integer | yes | A view's or built-in Dashboard Template's text id, or a team template's number. |
| `items[].kind` | `"view"`, `"widget"`, `"dashboard"` | yes | A built-in view, a team Widget Template, or a Dashboard Template. |
| `items[].name` | string | yes |  |
| `items[].description` | string | yes |  |
| `items[].slots` | array of object | yes | Empty for a view, which takes any Metrics. |
| `items[].slots[].label` | string | yes | What to fill it with. |
| `items[].slots[].multiple` | boolean | yes | Takes one or more Metrics instead of one. |
| `items[].slots[].suggested` | array of string | yes | Slugs it was made with that the key's creator sees. |

**Errors**

- 400: `invalid_request`: the query, path or body does not match.
- 401: `unauthorized`: no key, or one that ended, was revoked, or whose creator left.
- 403: `forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys.
- 404: `not_found`: nothing here the key's creator may see.
- 429: `rate_limited`: too many calls; wait for `Retry-After` seconds.
- 500: `internal`: something went wrong on the server.

## Errors

Every error answer has this shape:

```json
{ "error": { "code": "not_found", "message": "Not found." } }
```
