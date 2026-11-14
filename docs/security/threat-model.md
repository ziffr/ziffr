# Threat model

What Ziffr protects, from whom, and how. Written in the security pass of spec 0001 (ticket #19); the API and the MCP server added with spec 0002. Keep it current: a change to who can see or do what updates this page in the same pull request.

## What we protect

- **A team's numbers.** Metrics, their values, Breakdowns, targets and projections. For a small company these are the business: revenue, cash, headcount.
- **Who said what.** Questions, tasks, Threads and Corrections, and who submitted which value.
- **People's details.** Names, email addresses, Slack handles and phone numbers of members and Contacts.
- **The right to act.** Sessions, Access Keys, Tokens (form links), Invitations and View Links.

## Who might attack

- **Someone outside any workspace:** anyone on the internet. They can reach the login page, the demo, View Links, form links and invitation pages.
- **A member of another workspace.** They are signed in, so every core function runs for them; they must get nothing of a workspace they are not in.
- **A member with a smaller role.** A Guest or Member trying to do what only Owners or Admins may do, or to see what was not shared with them.
- **Someone who left.** A removed member with an old session, link, Token or key.
- **A demo visitor.** Anyone may use the demo, which shares one workspace among all visitors.
- **A leaked secret.** A form link, View Link, invitation link or Access Key that reached the wrong person.
- **A program gone wrong.** A script or an AI assistant with a valid key that calls too often, retries blindly, or was steered by text it read.

## Trust boundaries

1. **Browser to server.** Everything a browser sends is untrusted: ids, text, settings, layouts, documents. Server actions are public endpoints, whatever page they are called from.
2. **App to core.** The web app's pages and server actions only call core functions (`packages/core`). Each takes the acting person (an `Actor`) or a key (`KeyActor`) first. The app has no permission code of its own.
3. **Core to database.** The core reaches the database with the service role. The web app holds it too, only to find the signed-in person and their membership (`apps/web/src/lib/auth.ts`, `viewer.ts`) and for the demo's "view as" and reset; every page read and every change goes through the core (#42); it is never a `NEXT_PUBLIC_` variable, so Next.js never puts it in a browser bundle. Row Level Security is on for every table, with no policies, so the public key reads nothing.
4. **Programs to the API.** `/api/v1` accepts only an Access Key in the `Authorization` header, never a session or the demo cookie, and the middleware leaves it alone. The route handlers turn the key into a `KeyActor`, check the endpoint's scope, validate input with zod, and call only core functions written for keys. Anything the key's creator may not see answers 404. No CORS headers and no caching. Bodies are JSON of at most 64 KB; every query, path and body goes through the endpoint's zod schema, the same schemas the OpenAPI document at `/api/v1/openapi.json` is built from. That document is public: it describes what exists, never anyone's data (spec 0002).
5. **Assistants to the MCP server.** `@ziffr/mcp` runs on the person's own computer over stdio, with the key from the assistant's settings. It is a client of the API like any script: each tool calls the API through `@ziffr/sdk`, it keeps no state, and it can reach nothing the key cannot. What it returns (Metric names, descriptions, values) is workspace content, which reaches the assistant's context.
6. **Outside channels.** Values arriving by Slack, email or a form link are recognised by Token or by the sender's identity in one workspace. Connectors are simulated in the prototype.

## Threats and how they are met

| Threat | Defence | Tested in |
| --- | --- | --- |
| Reading or changing another workspace's data | Every core function works in `actor.workspaceId`; every lookup by an id filters by workspace; rows that belong to another row take its workspace in the database (`workspace_from_parent`); visibility rules ignore rows of other workspaces | `*.db.test.ts` (each has an "another workspace" case), `visibility.test.ts` |
| Seeing what was not shared | Visibility is decided by the pure rules in `visibility.ts`; dashboards, decks, templates and restores check every Metric a widget draws, nested ones included (`widget-metrics.ts`) | `sharing.db.test.ts`, `dashboards.db.test.ts`, `decks.db.test.ts`, `widget-metrics.test.ts` |
| Doing more than one's role allows | Capabilities per Workspace Role (`actor.ts`); Guests create and share nothing; only Owners make or remove Owners; a database trigger keeps the last Owner | `invitations.db.test.ts`, `handover.db.test.ts`, `sharing.db.test.ts` |
| Taking over someone's identity | An address counts only when confirmed through a way of signing in that proves it (email link, Google); email confirmations are required; Contacts carry no address on their person, so nobody can sign in as one | `invitations.db.test.ts`; `provenEmail` in `apps/web/src/lib/auth.ts` |
| A leaked View Link | Unguessable token (24 random bytes); ends within 90 days; revocable; shows only the Metrics it was made with, only the dashboard widgets or deck records it was made with (links made before the security pass have no such list), people's names without contact details, and nothing to act on. A live link shows current values and current text inside the widgets and shapes it was made with, by design | `dashboards.db.test.ts`, `decks.db.test.ts` |
| A leaked form link (Token) | Unguessable code; pages show a code only to its submitter, the Metric's owner and admins; records values only for its Metric and submitter; stops when the Contact is removed or the person leaves | `page-data.db.test.ts`, `submissions.db.test.ts`, `handover.db.test.ts` |
| A leaked Access Key | Stored as a hash; scoped; ends on a day within a year; revocable by its creator and by Owners; stops when its creator leaves; a `KeyActor` is a type of its own that no core function accepts unless written for keys, and it holds no role capability | `access-keys.db.test.ts` (including a compile-time check) |
| A leaked or runaway key flooding the workspace | About 60 calls a minute and 1,000 submitted values a day per key, counted in Postgres from the Access Log; 429 with `Retry-After`. Every call with a key is logged (time, method, route without query or slug, status; never a body or a value), kept 90 days, and shown to the key's creator and the workspace's Owners and Admins | `access-log.db.test.ts`, `api-submissions.db.test.ts` |
| A key creating Metrics | Only with the scope `metrics:write`, which a Guest cannot give a key; every call checks the creator's current role; the Metric is created by the web form's own `createMetric` as the creator, owned by them, its first Version naming the key; at most 50 in 24 hours per key, held by a database trigger that locks the key's row, so parallel calls cannot pass it; nothing else of a Metric (sharing, Submitters beyond the creator, formulas) is writable by a key (spec 0003) | `api-metrics.db.test.ts` |
| A program recording what a person could not | Submissions go through the creator's own Token and the same `submitValue` as a form or Slack: Submission Rule, Locks, Approvals and Unusual Values apply; a key without `values:submit`, or whose creator does not submit to the Metric, records nothing; the value names the key | `api-submissions.db.test.ts` |
| A retry recording a value twice | An Idempotency-Key returns the first answer for 24 hours, per key; another body under the same key is a conflict; the SDK sends a key with every submission | `api-submissions.db.test.ts`, `packages/sdk/test/sdk.app.test.ts` |
| A key reading contact details | The API's people list is loaded without contact details; Groups come without members | `api.db.test.ts` |
| Text in a workspace steering an assistant | Anyone who can name a Metric can put text before an assistant using the MCP server. The server tells the assistant to treat names and descriptions as data, its tools are marked read-only except `submit_value`, and a key without `values:submit` records nothing whatever the assistant is told; the setup notes recommend read-only keys | `packages/mcp/README.md` (accepted, see below) |
| A leaked invitation link | Email invitations work once, for the proven address only; links make Members or Guests only, end within 7 days, are revocable, and are revoked when someone is removed | `invitations.db.test.ts`, `handover.db.test.ts` |
| Someone who left keeps acting | Removal hands everything over in one database step and ends Tokens, stand-in roles, Shares, Group memberships, Access Keys, View Links and invite links; every request checks membership again | `handover.db.test.ts` |
| Abuse of the shared demo | A visit reaches only the demo workspace and its made-up people; no Contacts, invitations, Access Keys or View Links there; the reset touches only the demo and runs at most once a minute | `invitations.db.test.ts`, `sharing.db.test.ts`, `dashboards.db.test.ts`; ADR 0005 |
| Database code in a browser | The service-role key is not a public variable, so no browser bundle can hold it; the browser build fails if any client code pulls in the core's database module, however it is imported (`next.config.ts`); CI also checks client components' imports, and the module refuses to run in a browser | `next.config.ts`, `.github/scripts/client-imports.mjs` |
| Filling the database from a browser | Size limits on widget settings, deck documents, slide layouts, uploads and text fields; layouts clamped; Contacts capped per workspace | `dashboards.db.test.ts` |
| Framing the app or a View Link (clickjacking) | `frame-ancestors 'none'` and `X-Frame-Options: DENY` on every response; `nosniff`; a referrer policy that sends no full URLs to other sites | `next.config.ts` |
| Another site switching a signed-in person into the demo | A cross-site request to `/demo` from someone with a session changes nothing; the demo shows "Leave the demo" at all times | `apps/web/src/middleware.ts` |
| Forged server actions (CSRF) | Next.js accepts a server action only from the same origin; behind a proxy that changes the host, set `serverActions.allowedOrigins` | Next.js |
| Scripts in user content | Text is rendered as text by React; logos and backgrounds must be base64 images, shown through `<img>` or CSS, never inline SVG (`theme-tokens.ts`) | `decks.db.test.ts` (invalid tokens) |
| Open redirects | After sign-in only a path inside Ziffr is followed (`safeNext`), prefixed with `ZIFFR_SITE_URL` | `apps/web/src/lib/sign-in.ts` |
| Building queries from strings | Every filter is a typed call (`eq`, `in`); no query is built from text a person sent | Code review rule (AGENTS.md, rule 4) |

## Gates in CI

- **Secrets.** `gitleaks` scans the whole history on every pull request.
- **Dependencies.** `pnpm audit --prod` fails on any known-vulnerable production dependency. Ignored advisories are listed below, each with its reason.
- **Client imports.** Client components may import only the core's pure modules, and CI's production build fails if the database module is bundled for a browser.
- **Database access from the app.** Outside sign-in, the session refresh and the demo, no file in the web app may import a database module or a Supabase client, or query the database (`.github/scripts/app-db-access.mjs`).
- **Core against a real database.** `pnpm --filter @ziffr/core test:db` runs every operation's permission tests against Postgres with the migrations applied.
- **The API, the SDK and the MCP server.** The route handlers are tested over HTTP against the same database; the app is then built and started, and the SDK and the MCP server are tested against it. The OpenAPI document must validate and match the route handlers, and the committed reference must match it.

## Accepted risks

- **Demo visitors choose who they are.** In the demo anyone may act as any of its made-up people, its Owner included. Nothing there is real, and nothing reaches real workspaces (ADR 0005).
- **Links in deck images.** Image, bookmark and embed shapes in decks may point to other sites, so a browser showing the deck, a View Link's included, loads from them. It can tell those sites that someone looked. Restricting them to uploaded images is open work.
- **Image paths skip the middleware.** Paths ending in an image extension are not seen by the middleware. Pages still check sign-in themselves, and View Link pages are only reached under `/v/`.

- **sharp** (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w), a dependency of Next.js. Ziffr does not use `next/image`, and the image optimizer is switched off (`images.unoptimized`), so sharp never runs. Remove the exception when Next.js is upgraded.
- **image-size** (GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr), a dependency of pptxgenjs. Only its Node build uses it; Ziffr exports decks in the browser, whose build does not include it.
- **Away dates belong to a person, not a workspace.** An Owner or Admin of one workspace can change the away dates of a member who is also in another workspace. The effect is limited to who is asked for values; the dates are visible only to members of a shared workspace.
- **A prefix of an Access Key reveals whether it exists.** Looking up an unknown prefix returns sooner than a known one. The 256-bit rest of the key still protects it. Calls with an unknown key are not limited per key (there is none to count against); limits for them belong with the sign-in rate limits below.
- **Limits may be passed by a burst.** Counting and recording a call are not one transaction, so parallel calls can pass a few over the minute's or the day's limit. The limits are there to stop a flood, not to meter.
- **Assistants read workspace text.** An MCP client puts Metric names, descriptions and values into an AI assistant's context, and text written to mislead it could make it misreport numbers or, with a key that may submit, record a value the person did not ask for. Such a value goes through the Metric's rules, names the key, and shows in the Access Log.

## Open work

- **Sign-in rate limits.** Limits on sign-in links come from Supabase (`supabase/config.toml` for local use); hosted settings must match, and Ziffr adds no limit of its own yet.
- **The demo switch relies on `Sec-Fetch-Site`.** Browsers that do not send it, and sibling subdomains, can still switch a signed-in person into the demo; an explicit "switch to the demo" step would close it.
- **Pinning actions.** CI actions are pinned by major version, not by commit; gitleaks is pinned and checksummed.

- **Real Connectors and email.** Email is being made real (spec 0004): the server now sends mail, but connects only to the SMTP server in `ZIFFR_SMTP_URL`, never to an address taken from data. Messages are plain text with header values on one line (`mail.ts`), and go only to a member or Contact of the message's workspace at the address that workspace keeps, never in the demo; the retry job needs `ZIFFR_JOB_SECRET`. Replies, opting out and sending limits follow in the same spec. Slack, WhatsApp and ticket systems stay simulated; they need signed webhooks, an allowlist of addresses they call, and their own threat review.
- **Lawyer review** of the license texts before the repository is public (ADR 0002).
