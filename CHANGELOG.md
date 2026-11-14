# Changelog

What changes for people who use or run Ziffr, newest version first. Each section is written by `pnpm release` from the release notes that pull requests leave in `.changeset/` (ADR 0004), and the GitHub release of a version shows exactly its section. Notes waiting for the next release are in `.changeset/`.

## 0.6.0 (2026-11-14)

### For self-hosters

- `ZIFFR_SECRETS_KEY` can be changed without connecting Slack again: put the old key in `ZIFFR_SECRETS_KEY_PREVIOUS` until every token was sealed again (see `docs/guides/slack.md`).
- Ziffr now limits sign-in links itself, whatever Supabase's settings say: an hour allows 5 per address from one network address, 30 per address and 20 per network address. Set `ZIFFR_PROXY_HOPS` (usually `1`) to the number of proxies in front of Ziffr so it can tell network addresses apart.

### New and changed

- Slides and free layouts keep only images you paste or drop in: links, link previews, embedded pages and images from other sites are no longer placed, and ones saved before are left out when the deck or layout is shown, so showing it tells no other site that someone looked.
- A Metric's owner can now delete it from its page by typing its name. Ziffr refuses while another Metric's formula, a widget, a deck or a working View Link uses it, and the Audit Log keeps who deleted it.

### Fixed

- The Audit Log can be exported at most 10 times an hour per workspace.
- Someone signed in who opens a link to the demo now sees a page asking whether to open it, so no link from another site can drop them into the shared demo.
- Dashboards in the starter theme Coral show their figures in the text font with aligned digits instead of a code-like monospace font; a figures font someone picked stays. End dates of Access Keys, invitations and view links read like every other date, e.g. "4 Nov 2026".

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.5.1 (2026-11-14)

### Fixed

- Dashboards, decks, Analyze and presenting load faster: a page now sends only the numbers of what it shows, and a Metric you place or pick is fetched when you need it (hovering it in the Pool starts that early).

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.5.0 (2026-11-14)

### For self-hosters

- The daily Workflow run and reminders sent in bulk now queue their emails, and the deliveries job (`POST /api/jobs/deliveries`) sends them within minutes, so a slow mail server no longer holds the run up. Keep that job scheduled every few minutes.

### New and changed

- Owners and Admins can see who did what, and when, at `/audit`: role changes, removals, invitations, Shares, Groups, View Links, Access Keys, Locks, Approvals, Corrections, settings, exports and sign-ins. They can filter it and download it as CSV. Events are kept for two years and cannot be changed or removed.
- The Metric Catalog now holds 132 common business Metrics, from finance and sales to support and e-commerce, each with a definition of what it counts. On the New metric page you can search it and filter it by category.
- With an industry in the Workspace Profile, the Metric Catalog offers a filter for the Metrics written for that industry.
- The deck editor has Group and Ungroup buttons: select two or more shapes on a slide to keep them together, then move or resize them as one.
- A Metric's page has a Duplicate button: it opens the new-metric form filled in with the same description, Workflow and Submitters, for you to review before saving. Values, Shares, Target Series and history stay with the original.
- A Metric's owner can remove a saved target or projection from the targets table.
- The top bar now shows Dashboards, Metrics, Analyze and Decks, with Actions as an inbox showing how many wait for you. Members and Groups, Connectors, Workflows, Sources, Access Keys, Activity and the workspace's settings are in the Workspace menu; your profile, your Deliveries, switching workspaces and signing out are under your name. On a phone, one menu button opens all of it.
- Owners and Admins can connect the workspace's Slack with "Add to Slack" on the Connectors page, and disconnect it again. Self-hosters: this needs a Slack app and four new settings, `ZIFFR_SLACK_CLIENT_ID`, `ZIFFR_SLACK_CLIENT_SECRET`, `ZIFFR_SLACK_SIGNING_SECRET` and `ZIFFR_SECRETS_KEY` (see `.env.example`).
- Answering a Slack message in its thread records the number, replies in the Thread or proposes a Correction, and the buttons approve a value or stop Prompts and reminders on Slack. Self-hosters: `docs/guides/slack.md` has the Slack app's manifest and the setup steps.
- Once a workspace connects Slack, Prompts, reminders, questions, tasks and replies chosen for Slack arrive as real direct messages from the Ziffr app, and the Outbox shows whether each was sent, is waiting or failed. Self-hosters: the deliveries job now also retries Slack messages.
- Colour now means one thing: green or red says whether a value is on target, shown as a small "Below target" or "On target" chip next to a neutral number, while arrows and signs show which way it changed. Dashboards and metric pages have one main Share button (with "Who can see this" and view links inside it), and Theme, Versions and the rest sit in a ⋯ menu.
- A metric's page is split into Overview, Analysis, Targets, History and Settings tabs instead of one long scroll, and says which target applies to the latest period. Targets and projections are now an editable table: add a row, change a value, or paste two columns from a spreadsheet and check the preview before saving.
- Ziffr reads like a finished product: no more "prototype" labels or developer hints, deleting or locking asks in a proper dialog that says what happens, dates read "4 Nov 2026" everywhere, and values use the body font with aligned digits. A new workspace gets a short checklist on the Dashboards page, and demo-only buttons (playing a recipient, running the schedule by hand, previews of analyses still to come) now show only in the demo; owners and admins elsewhere find "Run now" on the Connectors page.
- Owners and Admins find the workspace's name, its time and its new Workspace Profile (industry, customers, country, currency, size and revenue) under Settings, Workspace, and Access Keys under Settings, Access Keys; both left the Team page. The settings side nav links Members and Groups, Connectors, Workflows, Sources, Activity and the Audit log.
- You can change your own name and colour under Settings, Your profile, which also shows the address you signed in with. Your Deliveries gathers where Ziffr reaches you, whether Prompts and reminders come by email (now also stopped from Ziffr itself, not only from an email) and your Away dates.

### Fixed

- Only Owners and Admins can start the scheduled requests and reminders by hand ("Run now" on Connectors); in the demo everyone still can.
- The Sources page shows each person only the Prompts and incoming messages that are their own, and no one else's Token code; the demo still shows all of them.
- Charts, the Metrics list and the API no longer leave out the newest values once a workspace has many of them, and Breakdowns no longer go missing on Metrics with a long history. Self-hosters: keep Max Rows in your Supabase project's API settings at 1000 or more.
- Pages that decide who sees what load faster in workspaces with many people, Groups and shares, and the Sources page shows the latest 300 Prompts and the latest 300 incoming messages.

### For developers

- `pnpm ci:local` runs everything CI checks on your machine, against the local Supabase; CI on GitHub runs less often and cancels runs a newer push replaces.

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.4.0 (2026-11-14)

### For self-hosters

- `docs/guides/self-hosting.md` takes Ziffr from an empty Supabase project to a team using it (migrations, sign-in settings, the app's settings, build and run, the scheduler, upgrading, backups) and ends with a checklist for production. The README now describes Ziffr as it is.

### New and changed

- The Workflows page shows when Workflows run in your workspace, how the last run went, and lets Owners and Admins run today's steps now, once. Pretending it is another day is left to the demo, and closing a period counts from your workspace's today.
- Workflows run on their own: a job your scheduler calls every hour runs each workspace's Workflows once a day at its run hour, in its own time zone, asking for missing values, reminding and escalating on the days the Workflow says, and reminding people of tasks due within two days. Self-hosters: run the new migration and call `POST /api/jobs/workflows` hourly with `ZIFFR_JOB_SECRET` (see `docs/guides/jobs.md`).
- Owners and Admins set the workspace's time zone and the hour its Workflows run each morning, on the Team page (UTC and 08:00 until they do). It decides which day "today" is for the team, ready for Workflows that run on their own. Self-hosters: run the new migration.

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.3.0 (2026-11-14)

### New and changed

- Invitations by email are now emailed, with the link to join, once email is set up. The Team page shows whether each went out, and why not if it failed, and you can resend one (at most three times). The link is still shown, for sending it some other way. Self-hosters: run the new migration.
- Every request for a number and every reminder by email has a one-click link to stop them (also in the mail client's unsubscribe button); the Metric owners are told, and the person can turn them on again on the Connectors page. A workspace sends at most 500 emails a day, one inbox gets at most 20 an hour and one person causes at most 300 a day, from all workspaces together; the rest wait. The Outbox no longer shows the sender of a request other people's form links. The Connectors page says when email is real. Self-hosters: run the new migration, and see `docs/guides/email.md` for setting up sending and replies.
- Replies by email come back into Ziffr: answering a Prompt with the number records it (a Breakdown too, one row per line), and answering a question or task puts the reply in its Thread, where a "Correction: 1234" line proposes a Correction. Quoted text and signatures are left out, and the person is told what became of their number. Only the person the email went to can answer it. Self-hosters: run the new migration, set `ZIFFR_INBOUND_DOMAIN`, `ZIFFR_INBOUND_SECRET` and, so senders are checked, `ZIFFR_INBOUND_AUTHSERV_ID` (without it, Approvals are not taken by email), and have your mail provider forward replies to `POST /api/inbound/email`, signed (the self-hosting guide follows).
- Ziffr can send real email: Prompts, reminders, questions, tasks and replies by the Email Connector now go out through your SMTP server, with links back into Ziffr. The Outbox shows whether each was emailed, is waiting or failed. Self-hosters: run the new migration, set `ZIFFR_SMTP_URL` and `ZIFFR_MAIL_FROM` (and `ZIFFR_SITE_URL`, for the links) to turn sending on (without them nothing is sent, as before), and have a scheduler call `POST /api/jobs/deliveries` with `ZIFFR_JOB_SECRET` to retry failed sends. The demo never sends.

### Fixed

- Replies by email check the mail provider's verdict on the sender more strictly: text the sender wrote inside the provider's Authentication-Results header can no longer pass as a verdict.
- The retry job for email now picks the emails that are due in the database, so emails waiting out a limit can never keep others from going out. Self-hosters: run the new migration.
- Invitation emails are limited: a workspace sends at most 50 a day, a person at most 50 a day from all their workspaces, and one inbox gets at most three a day from all workspaces together. Over that, the Team page asks you to send the link yourself. The subject no longer carries the workspace's name. Self-hosters: run the new migration.

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.2.0 (2026-11-14)

### For self-hosters

- The demo is on by default and lives in its own workspace beside your real ones; set ZIFFR_DEMO=0 to offer none. `pnpm demo` is now the same as `pnpm dev`.
- Email confirmations are now required (supabase/config.toml, enable_confirmations = true); set the same in production, so a confirmed address is one the person controls. Only the email link and Google count as proving an address for invitations, domain joining and existing people.
- Every table now belongs to a Workspace and people get a Workspace Role through memberships; existing data moves into one workspace. Set `ZIFFR_SITE_URL` to where Ziffr is reached, and to offer sign-in providers list them in `ZIFFR_AUTH_PROVIDERS` (google, azure, github, linkedin_oidc) with their keys in `SUPABASE_AUTH_EXTERNAL_<PROVIDER>_CLIENT_ID` and `_SECRET`.

### New and changed

- Access Keys: on the Team page, create a key that lets a program read metrics or submit values for you in this workspace until a day you pick, and revoke it any time; Owners see and revoke every key. A key sees no more than you do, and stops when you leave the workspace. Self-hosters: run the new migration.
- The API now limits each Access Key to about 60 calls a minute; a program that goes over gets a 429 answer with `Retry-After` and gets in again after waiting. Every call with a key goes into its Access Log (when, which endpoint, the result; never the data sent), shown under the key on the Team page and kept for 90 days. Owners and Admins see every key and its log, everyone else their own; only Owners and a key's creator can revoke it. Self-hosters: run the new migration.
- Workspace admins can now change themes, groups and team settings, like owners.
- Programs can create metrics: `POST /api/v1/metrics` with a key that may create metrics. The metric belongs to the key's creator, who can be made its Submitter in the same call, and an `Idempotency-Key` keeps a retry from making two. See the API guide.
- Programs can list the Metrics they may read through the new API: `GET /api/v1/metrics` with an Access Key in the `Authorization` header. Errors share one JSON shape, lists page with a cursor, and a Metric the key's creator may not see is not found. See `docs/guides/api.md`.
- The API describes itself: `GET /api/v1/openapi.json` serves an OpenAPI 3.1 document, so you can generate a client in any language, and `docs/reference/api.md` lists every endpoint with its parameters, answers and errors. Both are generated from the server's own validation, so they always match what the server does.
- Programs can now read more through the API: a Metric's description (`GET /api/v1/metrics/{slug}`), its values for a range of periods with Breakdowns and whether each is recorded, waiting for Approval or locked (`/observations?from=&to=`), and the names of the workspace's people and Groups (`/people`, `/groups`). People come with id and name only, never an email or phone. A Metric the key's creator may not see answers 404, like one that doesn't exist.
- Programs can submit values: `POST /api/v1/metrics/{slug}/observations` with a key that may submit values. The value goes through the same rules as one from a form or Slack (Submission Rule, Locks, Approvals), and the answer says whether it was recorded, waits for Approval or hit a locked period. Send an `Idempotency-Key` so a retry never records a value twice. Each key may submit 1,000 values a day. The Metric's history shows such values as from the API, with the key's name. Self-hosters: run the new migration.
- Keep Contacts: people without a login, such as a field worker or an outside bookkeeper, with their email, Slack handle or phone (Team page). Make them submitters of a Metric, and their values by Slack, email or form link are recorded under their name. Removing a Contact keeps their values and stops their links.
- Share with "Everyone in the workspace" in one click: every workspace has this group, which always holds all its members except guests. Start another workspace from the + next to your name, and switch between yours there.
- Removing a member on the Team page asks who takes over: their metrics, dashboards, decks, templates, themes and Workflows pass to that person, open tasks and approvals go along, and their Tokens, stand-in roles, shares and Access Keys end at once. Nothing is deleted, and the handover shows in each object's version history. Self-hosters: run the new migration.
- Invite people by email or with a link, each with a role; an invited Contact becomes a member and keeps their history. Owners and Admins change roles on the Team page (only Owners make Owners, and the last Owner stays). Owners can let people with an address at the company domain ask to join; an Owner or Admin lets each one in. Self-hosters: run the new migration.
- Access Keys can now be allowed to create metrics ("Create metrics" on the Team page). Such a metric belongs to the key's creator, is checked like one made in the form, and its history names the key; a key creates at most 50 a day, and never more than its creator's role allows.
- People now sign in with an email link (or Google, Microsoft, GitHub or LinkedIn once set up), create a workspace on first sign-in and see only their own workspaces. "View as", reset and the tour stay in Demo Mode (`pnpm demo`); `pnpm prototype` still starts the demo.
- Anyone can try Ziffr without an account: "Try the demo" on the login page opens a made-up online shop next to the real workspaces. Switching between its people and resetting it only ever touch the demo.

### Fixed

- A late value for a locked period, once accepted as a Correction, now replaces the value that was there (which is kept as the original) instead of being added next to it.
- Guests can no longer create dashboards or save widgets to the Pool. Widget positions and sizes stay in range, and very large widget settings are refused.
- A View Link shows only the widgets the dashboard had when the link was made, and only widgets whose every Metric is shown; restoring an old version checks the Metrics named inside widgets too. Guests can no longer create decks or templates.
- Messages listed on the Connectors page name the recipient instead of showing their Slack handle or phone number.
- Guests can no longer create Metrics; a new Metric only takes known formats, periods, rules and Sources.
- Guests can no longer share, grant access or make View Links, also not for things they owned before becoming a Guest.
- Live View Links open again for people without an account; they had sent visitors to the sign-in page since workspaces arrived.
- Links to personal submission forms are now random and can no longer be guessed from a person and a Metric; links sent before keep working.
- A View Link to a deck shows only the shapes the deck had when the link was made, and widgets that name a hidden Metric anywhere in their settings are refused or left out. Self-hosters: run the new migration; the image optimizer is switched off (Ziffr does not use it).
- Guests can no longer create or run Workflows, or send reminders; restoring a Workflow version saves it as the person restoring it.

### For developers

- Questions and tasks, Threads, Deliveries and Delivery Preferences, Workflows, approvals and Locks, the Connectors and the demo's simulated channels all live in the core. The web app has no permission code of its own any more: every server action calls a core function that takes the Actor first.
- Dashboards, widgets, layouts, Free Layouts, the Analysis Canvas and View Links go through the core (`@ziffr/core/dashboards`, `view-links`), and versions and the built-in widget templates live there too.
- Decks, Themes, Widget Templates and slide layouts, and the version history (list, name, restore) go through the core (`@ziffr/core/decks`, `workspace-themes`, `templates`, `version-history`). Self-hosters: run the new migration (View Links remember their widgets).
- The core's exports and modules must be documented, prose in the docs is checked by Vale, and pull requests that change the public surface must change docs or the glossary, or add a release note.
- `@ziffr/mcp`, an MIT-licensed MCP server, lets an assistant such as Claude Desktop or Claude Code read your Metrics and submit values with an Access Key: run `npx @ziffr/mcp` with `ZIFFR_URL` and `ZIFFR_ACCESS_KEY`. It offers `list_metrics`, `get_metric`, `submit_value` and `list_people`, and every visible Metric as a resource. It sees only what the key's creator sees. See `packages/mcp/README.md`.
- The app lives in `apps/web`, shared domain rules in `packages/core`; `pnpm typecheck`, `pnpm lint` and `pnpm test` run across all of them, and CI runs them on every pull request.
- Every page reads through the core (`@ziffr/core/page-data`, Actor first); the web app touches the database only to find the signed-in person and for the demo, and CI checks that it stays so.
- Every pull request that changes what people use or run adds a release note (`pnpm changeset`); `pnpm release` sets the version, writes the changelog section and tags it, and the GitHub release shows the same text.
- `@ziffr/sdk` gains `metrics.create`, and `@ziffr/mcp` a `create_metric` tool, so a script or an assistant can start tracking a new metric with a key that may create metrics. Both send an idempotency key, so a retry never makes two.
- `@ziffr/sdk`, an MIT-licensed TypeScript client for the API. It has typed calls for every endpoint, iterates over pages for you, waits out a 429 as `Retry-After` says, and sends an idempotency key with every submission so a retry never records a value twice. See `packages/sdk/README.md`.
- A threat model in docs/security; CI scans the whole history for secrets, fails on known-vulnerable production dependencies, and refuses client components that import core code reaching the database.
- Creating Metrics and uploading their series, sharing, "who can see this", access requests, Groups and Contacts go through the core (`@ziffr/core/metrics`, `sharing`, `team`), with permission tests against the database. What a person sees is loaded in `@ziffr/core/access` and `workspace-data`.
- Submitting values (intake, the web form, answers to Prompts) and deciding Corrections live in `@ziffr/core/submissions` and are tested against a real database (`pnpm --filter @ziffr/core test:db`, also in CI).
- Who sees what is decided in `@ziffr/core/visibility`, which ignores data from any other workspace; the app loads only the current workspace's data.

This version becomes available under AGPL-3.0 on 2029-11-14.
