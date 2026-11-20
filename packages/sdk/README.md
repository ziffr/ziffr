# @ziffr/sdk

Call the [Ziffr](https://github.com/ziffr/ziffr) API from TypeScript or JavaScript: read the Metrics an Access Key may see and their values, and submit values. MIT licensed, no dependencies, Node 20 or later (or any runtime with `fetch`).

## A first call

1. In Ziffr, open the Team page and create an Access Key. Give it "Read metrics", and "Submit values" if your program records values. Copy the key: it is shown once.
2. Install and call:

```sh
npm install @ziffr/sdk
```

```ts
import { Ziffr } from "@ziffr/sdk";

const ziffr = new Ziffr({ url: "https://ziffr.example.com", accessKey: process.env.ZIFFR_ACCESS_KEY! });

for await (const metric of ziffr.metrics.all()) console.log(metric.slug, metric.name);

const { items } = await ziffr.observations.list("revenue", { from: "2026-01-01", to: "2026-03-01" });
console.log(items.map((o) => `${o.period}: ${o.value}`));

const result = await ziffr.observations.submit("orders", { value: 42 });
console.log(result.status); // "recorded", or "awaiting_approval" for an unusual value
```

## What it does for you

- **Pages for you.** Every list has `list({ limit, cursor })` for one page and `all()` to iterate over every item.
- **Waits out limits.** On a 429 it waits as long as the server's `Retry-After` says and tries again, up to `maxRetries` (default 3) and `maxRetryWait` seconds (default 60). A longer wait, such as the daily limit on values, throws at once.
- **Never makes a Metric twice.** `metrics.create` sends a fresh idempotency key too; it needs a key with "Create metrics", and the Metric belongs to the key's creator.
- **Never records a value twice.** Each `submit` sends a fresh idempotency key, so its own retries are safe. To make retries across runs of your program safe too, pass your own: `submit("orders", { value: 42 }, { idempotencyKey: "orders-2026-11" })`. A repeat with the same key and value gets the first answer back, with `replayed: true`.
- **One kind of error.** Every failure is a `ZiffrError` with the HTTP `status` and the API's stable `code` (`not_found`, `forbidden`, `locked`, `rate_limited`, and so on; `network` when Ziffr could not be reached).

A key sees exactly what the person who made it sees, no more. A Metric it may not see is `not_found`, the same as one that does not exist.

## Calls

| Call | API |
| --- | --- |
| `metrics.list(options)`, `metrics.all()` | `GET /api/v1/metrics` |
| `metrics.get(slug)` | `GET /api/v1/metrics/{slug}` |
| `metrics.create({ name, period, unit, submit, ... }, { idempotencyKey })` | `POST /api/v1/metrics` |
| `metrics.update(slug, { target_min, target_max, polarity, attainment_method })` | `PATCH /api/v1/metrics/{slug}` |
| `targetSeries.list(slug)`, `targetSeries.set(slug, [{ period, value }])` | `GET`, `POST /api/v1/metrics/{slug}/target-series` (value null removes a period) |
| `metrics.submitters(slug)`, `metrics.setSubmitters(slug, { add, remove })` | `GET`, `POST /api/v1/metrics/{slug}/submitters` (people and Contacts from `people`, Feeds from `feeds()`) |
| `feeds()` | `GET /api/v1/feeds`: live Feeds to name as Submitters |
| `metrics.unusualValueCheck(slug)`, `metrics.setUnusualValueCheck(slug, { change_pct, outside_target })` | `GET`, `PATCH /api/v1/metrics/{slug}/unusual-value-check`: the check step of the Metric's Workflow, shared by its Metrics |
| `projections.list(slug)`, `projections.set(slug, [{ period, value }])` | `GET`, `POST /api/v1/metrics/{slug}/projections` (the current period or later) |
| `observations.list(slug, { from, to, limit, cursor })`, `observations.all(slug, { from, to })` | `GET /api/v1/metrics/{slug}/observations` |
| `observations.submit(slug, { value, period, breakdown }, { idempotencyKey })` | `POST /api/v1/metrics/{slug}/observations` |
| `workspace()` | `GET /api/v1/workspace`: the month the fiscal year starts in, where quarters and years begin |
| `schedule({ from, to, person_id })` | `GET /api/v1/schedule`: what the key's creator has to do, overdue first, then by day; an Owner or Admin may name a teammate |
| `people.list(options)`, `people.all()` | `GET /api/v1/people` |
| `groups.list(options)`, `groups.all()` | `GET /api/v1/groups` |
| `actions.list(options)`, `actions.all(options)`, `actions.reply(id, body, correction)`, `actions.close(id)`, `actions.reopen(id)`, `actions.done(id)`, `actions.confirm(id)`, `actions.correct(id, value)`, `actions.approve(id)`, `actions.sendBack(id, comment)` | `GET /api/v1/actions`, `POST .../replies`, `PATCH /api/v1/actions/{id}`, `POST .../done`, `POST .../self-check`, `POST .../approval`: the key's creator's own Questions and Tasks; scopes `actions:read`, `actions:write`, `values:submit` (Self-check) and `values:approve` (Approval, a program's key only) |
| `alerts.list({ metric })`, `alerts.create(input)`, `alerts.update(id, patch)`, `alerts.remove(id)` | `GET`, `POST /api/v1/alerts`, `PATCH`, `DELETE /api/v1/alerts/{id}`: the key's creator's own Alerts only; listing needs Read metrics, the rest Manage alerts |

Fields, limits and errors of each are in the [API reference](https://github.com/ziffr/ziffr/blob/next/docs/reference/api.md).
