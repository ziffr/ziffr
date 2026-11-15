# 0014 Building dashboards and stories through the API, and Dashboard Templates

**Status:** done. **Tracking issue:** #184 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0014`.

## Problem Statement

A program can read Metrics, submit values and create Metrics (specs 0002, 0003), but it cannot touch anything people look at. An assistant connected through the MCP server can answer "what was revenue in March" but not "put revenue, signups and churn on a dashboard for the Monday meeting", and not "write up why churn went up". The person has to leave the conversation, open Ziffr, make the dashboard, drag in each Metric and pick its view by hand. Spec 0002 left dashboards out on purpose.

Building a dashboard by hand is slow even without an assistant. A team that wants the same "monthly overview" for each region, product or client rebuilds it widget by widget each time. Widget Templates (spec 0010) let a team reuse one widget with its Slots open, but there is nothing that reuses a whole dashboard: its widgets, their views and words, and where they sit.

## Solution

Two parts that work on their own and fit together.

**Dashboard Templates.** A Dashboard Template is a starting point for a new dashboard: its widgets with their views, settings, words and layout, with the Metrics left open as Slots. One Slot can feed several widgets, so "Revenue" is picked once and appears as a number, a line chart and a bar chart. Ziffr ships a few built-in Dashboard Templates, and anyone who may change a dashboard can save it as a team Dashboard Template. "New dashboard" offers "From a template": pick one, fill its Slots, name the dashboard, done. This needs no AI and no program.

**Dashboards and stories through the API and MCP.** Two new scopes. `dashboards:read` lets a key list and read the dashboards and stories its creator sees. `dashboards:write` lets it create dashboards and stories, make one from a Dashboard Template, add, change and remove widgets, and write a story's title, introduction and Findings. It works only on what the creator may change, through the same core functions as the web app. A program cannot share, delete, make View Links, change themes or move widgets to exact positions. Widgets it adds are placed in the next free spot, and people arrange them afterwards. Every change is a Version that names the key, so a bad change can be restored. The SDK and the MCP server get matching calls and tools. Each answer carries the link to open the result in Ziffr.

With both parts, "make a dashboard for the Monday meeting from our weekly template, for the North region" is one MCP call. The assistant's own model picks which Metrics fill the Slots. Ziffr runs no model and stores no prompts.

## User Stories

### Dashboard Templates

1. As a Member, I want to start a new dashboard from a Dashboard Template, so that I do not build the same dashboard widget by widget again.
2. As a Member, I want to pick a Metric for each Slot once, even when several widgets use it, so that filling a template is quick.
3. As a Member, I want each Slot to say what it is for ("Revenue, a monthly currency Metric") and suggest Metrics, so that I fill it correctly.
4. As a Member, I want to see a Preview of a Dashboard Template before I use it, so that I know what I will get.
5. As a dashboard's owner or Editor, I want to save the dashboard as a team Dashboard Template, choosing which Metrics become Slots and naming each Slot, so that my team can reuse it.
6. As someone saving a template, I want widget titles and Finding words to keep their Placeholders ("{metric} {change yoy} on last year"), so that the words fit whatever Metric fills the Slot.
7. As someone saving a template, I want to be told which widgets cannot be part of it (Free Layouts), so that nothing goes missing silently.
8. As a template's creator, I want to be the only one who changes or deletes it, as with Widget Templates, so that my team's templates do not change under them.
9. As a Member, I want a dashboard made from a template to be my own, independent copy, so that changing the template later does not change my dashboard.
10. As a Guest, I want templates to stay out of my way, since I create nothing.
11. As a Member, I want Ziffr to ship a few built-in Dashboard Templates (such as a monthly overview and a single-Metric deep dive), so that a new workspace has something to start from.

### Programs and assistants

12. As a developer, I want to list the dashboards and stories my key's creator sees, with their names, kind, role and link, so that my program knows what is there.
13. As a developer, I want a dashboard's widgets (view, title, the slugs of the Metrics they draw), so that my program or assistant knows what a dashboard shows before changing it.
14. As a developer, I want to create a dashboard or a story with a name, so that my program can start one.
15. As a developer, I want to list the Dashboard Templates, with their Slots, labels and suggested Metrics, so that my program can choose one and fill it.
16. As a developer, I want to create a dashboard from a Dashboard Template with one Metric per Slot, so that a whole dashboard takes one call.
17. As a developer, I want to add a widget with a built-in Widget Template or a team one, its Metrics and a title, so that I can build a dashboard step by step.
18. As a developer, I want to change a widget's view, title or Metrics and remove a widget, so that I can fix what I built.
19. As a developer, I want widgets I add to land in the next free place in reading order, so that I never deal with grid positions.
20. As a developer, I want to add a Finding to a story and write its kicker, headline, subline, footnote and source, so that an assistant can draft a story for a person to finish.
21. As a developer, I want to write a story's title and introduction, so that the draft reads as a whole.
22. As a developer, I want each answer to carry the link to the dashboard or story in Ziffr, so that the person can open it.
23. As a developer, I want a repeated creation with the same `Idempotency-Key` to return the first answer, so that a retry never makes two dashboards.
24. As someone using an assistant, I want to say "make a dashboard for the Monday meeting from our weekly template, for the North region" and get a link, so that I do not leave the conversation.
25. As someone using an assistant, I want to say "draft a story on why churn went up" and get a story with Findings I can edit, so that the assistant does the first draft and I the last.
26. As a Member, I want a key to read dashboards only with `dashboards:read` and change them only with `dashboards:write`, so that keys I made before cannot suddenly do more.
27. As a Member, I want a key to change only dashboards and stories I may change myself, so that it never does more than I can.
28. As a Guest, I want to be refused a key with `dashboards:write`, so that a key never does what my role does not allow.
29. As a dashboard's owner, I want every change made through a key to be a Version that names the key, so that I can see what a program did and restore what came before.
30. As a dashboard's owner, I want a program never to share, delete, theme or make a View Link of my dashboard, so that who sees it stays a decision people make.
31. As an Owner, I want each key limited to 50 new dashboards and stories and 500 widget changes a day, so that a runaway assistant cannot fill the workspace.
32. As a demo visitor, I want the demo to stay without keys, so that programs cannot change it.
33. As a maintainer, I want every endpoint to be a thin layer over a core function written for keys, with database tests, so that programs get the same checks as the web app.

## Implementation Decisions

### Dashboard Templates

- **Stored as team templates.** A Dashboard Template is a `team_templates` row with `kind = 'dashboard'`. A new migration widens the `kind` check to `('widget','slide','dashboard')`. Its body is a list of widgets, each with its built-in view, settings, title, size and position (`x, y, w, h`), and each Metric reference replaced by a Slot index, as `toTemplate` does for one widget today. Its `slots` are the same `Slot` type (label, multiple, suggested Metrics), shared by every widget in the template.
- **Built-in Dashboard Templates** are plain data in the core, (`packages/core/src/built-in-dashboard-templates.ts`), so they need no migration and show in every workspace. They use only built-in Widget Templates. Three to start: an overview (four Metrics as number + sparkline, the first two also as line charts), one Metric in depth (number, gauge, history table, line, bars, forecast), and two Metrics side by side with their correlation.
- **Using one.** `createDashboardFromTemplate(actor, { templateId, name, fills })`: `fills` holds one list of Metric ids per Slot. It checks every Slot is filled (`fillsComplete`), that the actor sees every Metric (`assertSeesMetrics`), and that the actor may create. It then creates one dashboard owned by the actor with every widget as an independent copy and records one Version, "Made from the template «name»". Placeholders in titles and Finding words stay as they are and are filled when the widget is drawn, as for Widget Templates.
- **Saving one.** `saveDashboardTemplate(actor, { dashboardId, name, description, slots, replaceId? })`: only someone who may change the dashboard and sees every Metric on it, as for Widget Templates (`team-templates.ts`), because the template's suggested Metrics are visible to the whole team. The actor groups the dashboard's Metrics into Slots and labels them. Free Layouts and the Analysis Canvas are left out, and the save dialog lists them. Size limit: 60 widgets and 400 KB.
- **UI.** "New dashboard" gets "From a template": a grid of Dashboard Templates, each with a Preview of the whole dashboard drawn from Sample Data (spec 0011's Preview, #191), then one picker per Slot (suggested Metrics first), then the name. A Preview with the chosen Metrics is left out: the Dashboards page has no series to draw them, and fetching them only for a Preview would add a server path for little. The dashboard's ⋯ menu gets "Save as template". Team Dashboard Templates are listed, changed and deleted where team Widget Templates are.

### Programs and assistants

- **Scopes.** `dashboards:read` ("Read dashboards and stories") and `dashboards:write` ("Build dashboards and stories") join `SCOPES`. Existing keys have neither. `createAccessKey` refuses `dashboards:write` when the creator's role cannot create (Guests), and every call checks the creator's current role again, as for `metrics:write`.
- **Core.** One function per operation in `packages/core/src/api-dashboards.ts`, each taking `Actor | KeyActor` first: it checks the scope, then calls the function the web app uses (`createDashboard`, `createStory`, `placeWidget`, `updateWidget`, `removeWidget`, `saveStoryText`, `addFinding`, `createDashboardFromTemplate`) with the key creator's own Actor, as `createMetricWithKey` does (spec 0003). The API holds no permission code of its own.
- **What a program may see.** Dashboards and stories from `visibleDashboards` for the creator: id, kind, name, the creator's role on it, and its link. A dashboard's widgets come with id, view, title, size, and the slugs of the Metrics they draw, without values and without settings. A program reads values through `GET /api/v1/metrics/{slug}/observations` as before. A dashboard or story in another workspace or not visible to the creator is 404. A comment in the core function says why settings stay out: they can hold Free Layout documents and are not needed to decide what to change.
- **What a program may write.** Widgets with a built-in Widget Template that is not a Free Layout or the Analysis Canvas, or a team Widget Template with its Slots filled, plus a title of up to 200 characters. Settings are limited to a short allow-list per view (`window`, `showTarget`, `showForecast`, `rows`). A program never sends a settings object of its own. Finding words are plain text: kicker, headline, subline and source up to 200 characters, footnote up to 500, Placeholders allowed. A story's introduction is up to the existing `MAX_INTRO`. Any other field is 400.
- **Placement.** A widget a program adds goes to the first place in reading order (top to bottom, left to right on the 12-column grid) where its default size fits, not always below everything as `placeWidget` does today. This becomes `placeWidget`'s behaviour when no position is given, so the Pool's + gets it too. Findings stay one per row, as `addFinding` lays them out.
- **Never through a key:** sharing, deleting a dashboard or story, View Links, themes, `saveLayout`, the Pool, decks, Free Layouts, and saving templates. These stay with people, and the functions refuse a `KeyActor` (`can()` already returns false for keys, and they keep checking it).
- **Versions and audit.** Every change through a key records a Version whose message names the key ("Changed through the API (key «name»)"). Edits within ten minutes still form one Version, so an assistant's twenty small changes are one Version to restore. Creating a dashboard or story through a key writes an audit entry of a new kind, `dashboard.created`, with `via: "api"` and the key id. People creating dashboards in the browser are not audited, as today.
- **Endpoints**, added to version 1:
  - `GET /api/v1/dashboards` (`?kind=dashboard|story`), cursor-paged, and `GET /api/v1/dashboards/{id}` with its widgets.
  - `POST /api/v1/dashboards` `{ name, kind? }` and `POST /api/v1/dashboards/from-template` `{ template, name?, fills: slug[][] }` (one list of slugs per Slot, in order). Both answer 201 with the dashboard as `GET` shows it.
  - `POST /api/v1/dashboards/{id}/widgets` `{ view, metrics: slug[], title?, settings? }` or `{ template, fills: slug[][], title? }`, `PATCH /api/v1/dashboards/{id}/widgets/{widgetId}`, `DELETE /api/v1/dashboards/{id}/widgets/{widgetId}`.
  - `PATCH /api/v1/stories/{id}` `{ name?, intro? }`, `POST /api/v1/stories/{id}/findings` `{ metric, kicker?, headline?, subline?, footnote?, source? }`, `PATCH /api/v1/stories/{id}/findings/{findingId}`. A story is read with `GET /dashboards/{id}`, and a Finding removed with the widget `DELETE`.
  - `GET /api/v1/templates` (`?kind=widget|dashboard`): built-in and team templates with their Slots, labels and suggested Metrics, limited to the suggestions the creator sees.
  - Metrics are named by slug throughout, ids are integers checked on the server, and every body is validated with zod. Idempotency on the two creating endpoints as in spec 0002.
- **Limits.** Per key, in any 24 hours: 50 new dashboards and stories, and 500 widget and Finding changes. Counted in Postgres from the Access Log's successful calls, 429 with `Retry-After`. Unlike spec 0003 there is no trigger, so a parallel burst can pass a few over; the minute's limit keeps that small. The minute's limit applies as for every call.
- **SDK.** `ziffr.dashboards.{all, get, create, fromTemplate, addWidget, updateWidget, removeWidget}`, `ziffr.stories.{update, addFinding, updateFinding}`, `ziffr.templates.all()`, with idempotency keys by default on creation.
- **MCP server.** Tools `list_dashboards`, `get_dashboard`, `list_templates` (read-only); `create_dashboard` (a dashboard or a story), `create_dashboard_from_template`, `add_widget`, `update_widget`, `remove_widget`, `add_finding`, `update_finding`, `update_story` (not read-only, `remove_widget` marked destructive). Descriptions say: check `list_templates` before building by hand; fill Slots only with Metrics from `list_metrics`; write Findings as a draft for the person to finish; change a dashboard someone else owns only when asked to. Every answer ends with the link.
- **Description.** The OpenAPI document and the reference page pick the endpoints up from their schemas, as in spec 0002.

## Testing Decisions

- **Core, against the database** (`dashboard-templates.db.test.ts`, `api-dashboards.db.test.ts`):
  - Templates: one Slot fills several widgets; a missing Slot is refused; a Metric the actor does not see is refused; the new dashboard is the actor's and independent of the template; one Version is recorded; saving needs edit rights and every Metric seen; Free Layouts are left out; only the creator changes a team Dashboard Template; a Guest cannot use one.
  - Keys: each operation needs its scope; a key changes a dashboard its creator edits and gets 404 for one it only views, one not shared, and one in another workspace; a Guest's key is refused `dashboards:write`; a key stops writing when its creator's role changes; every change records a Version naming the key; settings outside the allow-list and a Free Layout template are 400; the 51st dashboard and the 501st change in a day are refused; sharing, deleting and View Links refuse a `KeyActor`; widget answers carry no settings and no values; the demo has no keys.
  - Placement: a narrow widget fills the gap beside another before going below.
- **HTTP layer:** route tests for status, error shape, paging, idempotent replay and 409, without repeating the permission cases.
- **SDK and MCP:** against the running app in CI, as in spec 0002: the MCP test lists the new tools and makes a dashboard from a built-in template.
- **UI:** "From a template" and "Save as template" tried in the running app.
- Prior art: `dashboards.db.test.ts`, `stories.db.test.ts`, `api-metrics` tests, `access-keys.db.test.ts`.

## Out of Scope

An assistant inside Ziffr, or any model run by Ziffr; decks and slides through the API; sharing, deleting, View Links and themes through a key; exact widget positions and `saveLayout` through a key; Free Layouts and the Analysis Canvas in Dashboard Templates or through a key; saving templates through a key; a gallery of Dashboard Templates shared across workspaces; a dashboard that follows later changes to its template.

## Further Notes

- **Glossary.** Adds **Dashboard Template** ("A starting point for a new dashboard: its widgets with their views, settings, words and layout, with the Metrics left open as Slots. One Slot can fill several widgets. Ziffr ships built-in ones; anyone who may change a dashboard can save it as a team template, which only its creator changes. A dashboard made from one is an independent copy. _Avoid_: preset, blueprint, starter dashboard"). Changes **Slot** (a place in a Widget or Dashboard Template) and **Access Key** (the new scopes). "Template" alone stays ambiguous and is never used without "Widget" or "Dashboard" in UI text. The glossary changes landed with the implementation.
- **Threat model.** Prompt injection is the new risk: an assistant reads Metric names and descriptions, Finding words and dashboard names written by other people, and through Feeds by other systems (spec 0012), and could be steered by them. This spec limits what a steered assistant can do instead of trying to detect it. A key can change only what its creator may change, cannot share, delete or publish, is capped per day, and leaves a Version for every change. The worst case is a messed-up dashboard the owner can restore. This changes who can do what, so every ticket that touches scopes, actors or these functions gets a security review of its diff.
- **Order of tickets.** (1) Dashboard Templates in the core with built-ins, and "From a template" in the UI; (2) "Save as template"; (3) the scopes, read endpoints and `list_*` MCP tools; (4) the writing endpoints and tools for dashboards; (5) stories and Findings; (6) placement in reading order (can go first, it is independent). Ticket 1 does not wait for spec 0011; its Previews replaced the plain list in a seventh ticket (#191), after the first six landed together.
- **Decided for now** (revisit after first use): a key may change any dashboard its creator may change. The alternative was to limit it to dashboards the key itself created, at least by default. That is safer against prompt injection, but "add churn to our team dashboard" would stop working.
- **Later.** If people often ask their assistant to draft Findings, that is the signal for an assistant inside Ziffr, scoped to drafting stories, in `ee/`. It would be its own spec.
- This adds to version 1 of the API without breaking it.
