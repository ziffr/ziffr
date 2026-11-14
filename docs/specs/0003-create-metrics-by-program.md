# 0003 Creating Metrics through the API

**Status:** done. **Tracking issue:** #63 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0003`.

## Problem Statement

Programs can read Metrics and submit values (spec 0002), but a new Metric still has to be made by a person in the browser. A script that starts tracking a new number, a tool that sets up a team's Metrics from a list, or an assistant asked to "start tracking weekly signups" has to stop and send someone to the web form. Spec 0002 left all writing other than values out on purpose: a key held none of its creator's role capabilities.

## Solution

A new scope, `metrics:write`, lets a key create Metrics owned by its creator, through the same core function and the same checks as the web form. `POST /api/v1/metrics` takes the Metric's description; the SDK gets `metrics.create` and the MCP server a `create_metric` tool. Nothing else becomes writable: a program cannot change, share or delete a Metric, or pick its Submitters beyond the key's creator.

## User Stories

1. As a developer, I want to create a Metric with a name, description, unit, format, period, Submission Rule, Polarity, Aggregation and target, so that my script can start tracking a number without a person.
2. As a developer, I want the answer to carry the new Metric's slug, so that I can submit values to it right away.
3. As a developer, I want the key's creator to become the Metric's Submitter if I ask for it, so that the same key can submit its first value at once.
4. As a developer, I want a repeated creation with the same `Idempotency-Key` to return the first answer, so that a retry never makes two Metrics.
5. As a developer, I want the SDK to send an idempotency key with each creation by default, so that the safe behaviour is the default here too.
6. As someone using an assistant, I want to say "start tracking weekly signups" and have it create the Metric, so that I do not leave the conversation.
7. As a Member, I want a key to create Metrics only if I gave it the "Create metrics" scope, so that keys I made before cannot suddenly do more.
8. As a Guest, I want to be refused a key that creates Metrics, so that a key never does what my role does not allow.
9. As an Owner, I want a key to stop creating Metrics when its creator's role no longer allows it, so that a changed role takes effect at once.
10. As an Owner, I want each key limited to 50 new Metrics a day, so that a runaway script cannot fill the workspace.
11. As a Metric Owner, I want the Metric's history to say it was created through the API and with which key, so that people know where it came from.
12. As a demo visitor, I want the demo to stay without keys, so that programs cannot create Metrics there.
13. As a maintainer, I want the endpoint to be a thin layer over a core function written for keys, with database tests, so that programs get the same checks as the form.

## Implementation Decisions

- **Scope.** `metrics:write` joins `metrics:read` and `values:submit`, shown on the Team page as "Create metrics". Existing keys do not have it. `createAccessKey` refuses it when the creator's role cannot create (Guests); every call checks the creator's current role again.
- **Core.** `createMetricWithKey(actor: Actor | KeyActor, input)` checks the scope, then acts as the key's creator: it calls the same `createMetric` the web form uses, with the creator's own Actor, so every field is checked the same way and Guests are refused the same way. The Metric's owner is the key's creator. A program may name no Submitter but the creator (`submit: true`), no Catalog entry and no Derived Metric formula. Sources default to the personal form link, as in the form, so the API may submit to it.
- **Version.** The first Version's message says "Created through the API (key «name»)".
- **Endpoint.** `POST /api/v1/metrics` with a JSON body (name required; the rest as `GET /api/v1/metrics/{slug}` describes a Metric, plus `submit`). Answers 201 with the Metric as `GET /api/v1/metrics/{slug}` shows it. Idempotency as for values: same key and body within 24 hours return the first answer, another body 409.
- **Limit.** 50 Metrics in any 24 hours per key; 429 with `Retry-After`. A Metric a key created names the key (`metrics.access_key_id`), and a database trigger holds the count under a lock on the key's row, so parallel calls cannot pass it and a replayed answer does not count. The minute's limit applies as for every call.
- **SDK.** `ziffr.metrics.create(input, { idempotencyKey })`, with a fresh idempotency key by default.
- **MCP server.** A `create_metric` tool, marked as not read-only, whose description says to create a Metric only when the user asks for one. The setup notes say to give an assistant this scope only when it should create Metrics.
- **Description.** The OpenAPI document and the reference page pick the endpoint up from its schemas, as in spec 0002.

## Testing Decisions

- The core function gets database tests with a `KeyActor`: a key without the scope, a Guest's key, a creator whose role changed, the demo, another workspace's slug clash not mattering, the creator as Submitter, fields checked like the form (bad values fall back, never pass through), and the 51st Metric in a day.
- The HTTP layer gets route tests: 201 and its shape, 400 for a bad body, 403 without the scope, 409 for a reused Idempotency-Key with another body, a replay.
- The SDK and the MCP server get their call added to the tests that run against the app.

## Out of Scope

Changing, sharing, archiving or deleting a Metric through the API; Derived Metrics; Catalog entries; picking Submitters other than the key's creator; Target Series and Projections; Workflows.

## Further Notes

- The threat model's "A leaked Access Key" row gains: a key with `metrics:write` can create Metrics owned by its creator, at most 50 a day, each named in its history.
- This adds to version 1 of the API without breaking it.
