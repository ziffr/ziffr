# 0002 The API and the MCP server

**Status:** done. **Tracking issue:** #45 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0002`.

## Problem Statement

A team keeps its numbers in Ziffr, but only people in a browser can reach them. A script that knows last month's revenue has to send it by email or a form link. A spreadsheet or another tool cannot pull a Metric's values. An AI assistant cannot read the numbers it is asked about. Access Keys exist (spec 0001), but nothing accepts them yet.

## Solution

A versioned REST API at `/api/v1` and a local MCP server, both acting with an Access Key and both on the same core as the web app. In this first release a program can read the Metrics its key's creator sees, with their values, read the names of the workspace's people and Groups, and submit values. Each submission follows the same rules as one from a form or Slack. Every call is limited and logged per key, and Owners see the log. The API is described by an OpenAPI document generated from the server's own validation, and a small MIT-licensed TypeScript SDK wraps it; the MCP server is built on the SDK.

## User Stories

1. As a developer, I want to call Ziffr with an Access Key in the `Authorization` header, so that my script needs no sign-in.
2. As a developer, I want to list the Metrics my key may read, so that I know what I can ask for.
3. As a developer, I want a Metric's values for a range of periods, so that I can chart or check them elsewhere.
4. As a developer, I want a Metric's description (period, format, unit, Polarity, target), so that I show its values correctly.
5. As a developer, I want to find a Metric by its slug, so that my code reads well and survives renames of the display name.
6. As a developer, I want to submit a value for a Metric and period, so that my numbers arrive without a person typing them.
7. As a developer, I want a repeated submission with the same `Idempotency-Key` to return the first result, so that retries never record a value twice.
8. As a developer, I want to know whether my value was recorded, is waiting for Approval, or was refused because the period is locked, so that my script reacts correctly.
9. As a developer, I want the names of the workspace's people and Groups, so that I can show who owns or submitted a value.
10. As a developer, I want lists to page with a cursor, so that large workspaces do not time out.
11. As a developer, I want every error in one JSON shape with a stable code, so that I handle errors once.
12. As a developer, I want a 429 with a `Retry-After` header when I go too fast, so that my client can back off.
13. As a developer, I want an OpenAPI document at `/api/v1/openapi.json`, so that I can generate a client in any language.
14. As a developer, I want a reference page in the docs, so that I can read what each endpoint does.
15. As a developer, I want a TypeScript SDK (`@ziffr/sdk`, MIT), so that I can call the API with types and without writing HTTP code.
16. As a developer, I want the SDK to retry on 429 and send an idempotency key with submissions, so that the safe behaviour is the default.
17. As someone using Claude Desktop or Claude Code, I want to run `npx @ziffr/mcp` with an Access Key, so that my assistant can read our Metrics.
18. As someone using an assistant, I want it to list Metrics, read a Metric's values and submit a value, so that I can ask "what was revenue in March" or "record 42 orders for this week".
19. As someone using an assistant, I want to attach a Metric to a conversation as a resource, so that the assistant has its values in context.
20. As someone using an assistant, I want the assistant to see only what my key allows, so that connecting it does not widen anyone's access.
21. As a Member, I want a key to read only the Metrics I see myself, so that a program never sees more than I do.
22. As a Member, I want a key without the submit scope to be refused when it submits, so that a read-only key stays read-only.
23. As an Owner, I want to see every call made with each key in my workspace (when, which endpoint, the result), so that I notice a leaked or misbehaving key.
24. As an Owner, I want the log kept for 90 days, so that it is useful without growing for ever.
25. As an Owner, I want each key limited to about 60 requests a minute and 1,000 submitted values a day, so that a leaked key cannot flood the workspace.
26. As an Owner, I want a key to stop working the moment I revoke it, so that revoking is a real defence.
27. As an Owner, I want a key to stop when its creator leaves, so that nobody acts for someone who has gone.
28. As a member of another workspace, I want my key to get 404 for any Metric that is not in my workspace, so that keys cannot learn what exists elsewhere.
29. As a Member, I want a key to get 404 for a Metric I may not see, so that its existence stays private.
30. As a Submitter, I want a value submitted by a program to show in the Metric's history with the key named, so that people know where it came from.
31. As a Metric Owner, I want values from a program to go through the Metric's Submission Rule and Approvals, so that a program cannot skip a check a person could not.
32. As a demo visitor, I want to see that the demo has no Access Keys, so that the demo cannot be reached by programs.
33. As a maintainer, I want every endpoint to be a thin layer over a core function written for keys, so that the API gets the same checks as the web app.
34. As a maintainer, I want each endpoint to have a test against the database, so that permission rules are proven for programs too.
35. As a maintainer, I want the OpenAPI document generated from the validation schemas, so that the description and the server cannot drift apart.

## Implementation Decisions

- **Where it runs.** The API is a set of Next.js route handlers in the web app under `/api/v1`, deployed with it. They call only core functions that accept a `KeyActor`; they hold no permission code. It can move to an app of its own later without changing URLs.
- **Authentication.** `Authorization: Bearer <access key>`. The core's `actorForKey` turns the key into a `KeyActor`, checking end date, revocation, membership and scopes. A missing or unknown key returns 401; a key without the scope returns 403. API routes never read the sign-in cookie, and they accept no cross-site browser calls (no CORS headers).
- **Scopes.** `metrics:read` covers listing Metrics, a Metric's description and values, and reading people's and Groups' names. `values:submit` covers submissions. Nothing else is writable in this spec.
- **What a program may see.** Exactly what the key's creator sees, within the scopes. People come with id and name only, never contact details. A Metric another workspace owns, or one the creator may not see, returns 404, never 403.
- **Endpoints (version 1):**
  - `GET /api/v1/metrics`: the visible Metrics, cursor-paged.
  - `GET /api/v1/metrics/{slug}`: one Metric's description.
  - `GET /api/v1/metrics/{slug}/observations?from=&to=`: its Observations for a range of periods, with Breakdowns.
  - `POST /api/v1/metrics/{slug}/observations`: submits a value for a period (default: the current one).
  - `GET /api/v1/people` and `GET /api/v1/groups`: names only, cursor-paged.
  - `GET /api/v1/openapi.json`: the description.
- **Submissions** go through the same core path as a form or Slack submission: Submission Rule, Locks, Approvals and Unusual Values apply, and the value's Version names the key. The answer says `recorded`, `awaiting_approval` or `locked`.
- **Idempotency.** An optional `Idempotency-Key` header on submissions; a repeat with the same key and body within 24 hours returns the stored first answer, and the same key with a different body returns 409. Stored per Access Key.
- **Errors** are `{ "error": { "code": "...", "message": "..." } }` with 400 (malformed), 401, 403, 404, 409, 422 (valid shape, refused by a rule) and 429 (with `Retry-After`).
- **Lists** page with an opaque cursor; at most 100 items per page, 50 by default.
- **Limits** are counted in Postgres, per key: about 60 requests a minute, and 1,000 submitted values a day. No Redis.
- **Access Log.** Every call with a key is recorded: key, time, method, route, status. No request bodies or values. Owners and Admins see it for every key, a creator for their own, on the Team page. Entries older than 90 days are deleted.
- **Validation and description.** Each endpoint has zod schemas for its input and output; the server validates with them, and the OpenAPI document is generated from them at build time. The reference page in the docs is generated from it and never edited by hand.
- **SDK.** `packages/sdk`, published as `@ziffr/sdk` under MIT, with no dependency on the core. It retries 429s after `Retry-After` and sends an idempotency key with each submission by default.
- **MCP server.** `packages/mcp`, published as `@ziffr/mcp` under MIT, run locally over stdio with `ZIFFR_URL` and `ZIFFR_ACCESS_KEY` from its settings. Tools: `list_metrics`, `get_metric` (description and values for a range), `submit_value` and `list_people`, each one SDK call. Each visible Metric is also a read-only resource. It has no other way in and no state of its own.
- **Demo.** The demo workspace has no Access Keys (spec 0001), so the API refuses every call that names it.

## Testing Decisions

- **One seam, as in spec 0001:** the core functions written for keys, tested with a `KeyActor` against the database (`*.db.test.ts`). Each has an "another workspace" case, a "not shared with the creator" case and a "missing scope" case.
- **The HTTP layer** gets a few tests per endpoint that call the route handler with a request and check status, error shape, paging and headers; they do not repeat the permission cases the core tests prove.
- **Limits and idempotency** are tested in the core against the database: the 61st request in a minute and the 1,001st value in a day are refused; a repeated idempotency key returns the stored answer.
- **The SDK** is tested against a running app in CI (the core-db job already starts Supabase), not against mocks.
- **The MCP server** gets one test that lists its tools and calls each against the same running app.
- A good test checks what comes back or what was stored, never how it was done. Prior art: `access-keys.db.test.ts`, `page-data.db.test.ts`, `submissions.db.test.ts`.

## Out of Scope

Writing anything other than values (Metrics, dashboards, Questions, Threads); a hosted MCP server and OAuth sign-in for programs; webhooks; SDKs in other languages; real Connectors; Redis or any other store for limits.

## Further Notes

- The threat model gains the API and the MCP server as trust boundaries, and its "API and MCP" open item closes with this spec.
- Access Keys show "last used" already; the Access Log adds the detail behind it.
- Version 1 is a promise: a change that breaks a client goes into `/api/v2`. Adding fields or endpoints is not breaking.
