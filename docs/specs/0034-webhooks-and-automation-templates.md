# 0034 Webhooks and Automation Templates: tasks and questions reach the systems people already work in

**Status:** in progress. **Ticket:** #392 (the owner's wish, 2026-11-20); the tracking issue is #392 and its sub-issues are labelled `spec:0034`.

## Problem Statement

People already keep their work in Microsoft To Do, Planner, Google Tasks, Slack, Asana or Todoist. A task Ziffr gives someone is one more list to open, and a task finished in their own list stays open in Ziffr. Ziffr cannot build and maintain a Connector for every one of those systems, and most of them need no more than "a task appeared", "it is done" and "someone replied".

We need a small, safe way out of Ziffr and back in, so that a Workspace can bridge to any system with an automation tool such as n8n, and a few ready-made bridges that work the day they are imported. It must not become a way for data to reach an address that may not have it, a way to reach the Installation's own network, or a way to act in Ziffr without someone answering for it.

## Solution

1. A **Webhook**: an https address that a Workspace's Owner or Admin sets, with the events it gets. Ziffr sends each event as a signed JSON message, retries when the address fails, keeps a log of what it sent, and switches the Webhook off when it keeps failing. It belongs to the Workspace, like a Feed.
2. **Status back**: the Webhook's own secret signs requests to one endpoint that links an Action to the other system's id, marks a Task done, adds a Thread reply, or answers a Question, each attributed to the Webhook by name.
3. **Automation Templates**: importable n8n workflows in the repository, first both directions for Microsoft To Do and Google Tasks, then Slack, Asana and Todoist, with a guide and tests.

**One rule governs all of it: Ziffr is the single source of truth for an Action's state; every channel and every external system only mirrors it.** Whichever way an Action changes (Slack, email, Telegram, the app, the API, MCP, a Workflow step or a status coming back from outside), Ziffr records it once and tells every Webhook once.

Slack's Connector, which reaches a person by direct message, stays native. Jira, Linear and GitHub Issues (#7) stay open as native Connectors only where the demand shows (below).

## User Stories

1. As an Owner, I want a task given to Ana in Ziffr to appear in her Microsoft To Do (or Google Tasks), so that she does not have to open another tool.
2. As Ana, I want the task I tick off in my own list to become done in Ziffr, so that nobody asks me twice.
3. As an Owner or Admin, I want to add a Webhook with an address and choose its events, so that I decide what leaves Ziffr and where it goes.
4. As an Owner, I want the secret shown once, a way to replace it without a gap, and a way to switch the Webhook off, so that a leaked secret is a small incident.
5. As an Owner, I want a log of what each Webhook was sent and what came back, so that I can see why a task did not arrive.
6. As an Owner, I want a Webhook that keeps failing to switch itself off and tell the Owners, so that nobody finds out a month later that nothing arrived.
7. As the person who runs the receiving system, I want every message signed with a timestamp and carrying a stable id, so that I can reject forgeries and replays and do nothing twice on a retry.
8. As a Member, I want no webhook to carry something I could not see myself, so that a bridge cannot show my private Metric or a limited Thread.
9. As a teammate, I want a reply in Slack, or an answer to a Question typed into another tool, to arrive in the Thread marked with where it came from, so that the conversation stays in one place.
10. As a self-hoster, I want no Webhook to reach my internal network unless I allowed that address, so that a Workspace Admin cannot probe it.
11. As a person who has read about n8n, I want to import a template, fill in three values and see it work, so that bridging takes minutes.
12. As Ana, I want to answer a task in Slack, email, Telegram or the app and see it closed in my Microsoft To Do too, without doing it twice, and the other way round.
13. As an Owner, I want a task closed because its Metric was archived or its assignee left to close in the other tools as well, so that no stale task lingers there.
14. As a maintainer, I want the templates and the event messages tested against each other, so that a change to an event cannot silently break every bridge.

## Implementation Decisions

### Words

- **Webhook** is new (glossary below): a Workspace's address that receives signed messages about it, set by an Owner or Admin. It is **not a Connector**: a Connector reaches a person through a system they use; a Webhook reaches a program and, like a Feed, belongs to the Workspace, not to a person. _Avoid_: callback, trigger, integration, subscription.
- **Automation Template** is new: an importable file for an automation tool (n8n first) that bridges a Webhook to another system. "Recipe" is taken by **Analysis Recipe** (spec 0024, a calculation file Ziffr verifies); a second "Recipe" would make "import the To Do recipe" and "run the growth recipe" two different things. The glossary already calls an n8n flow an "automation" (Feed), so that word stays. _Avoid_: recipe, plugin, integration, flow. The folder is `docs/automations/`, not `docs/recipes/`.
- **Event** is what happened; a Webhook's messages are **sends** in its log. **Delivery** stays what it is, a message to a person through a Connector: a send is never a Delivery and never appears in the Outbox.
- The **Webhook secret** is the Webhook's signing key: not an Access Key, not a Token.

### Who, how many, and the address

- **Who:** Owners and Admins, on a new page **Settings, Webhooks** (the Workspace settings chapter). Not Members, Guests, Contacts, Feeds, assistants or programs: v1 has **no API and no MCP tool to create or change a Webhook**. Changing where data leaves is exactly what a prompt-injected assistant would be asked to do, and the page is enough.
- **Limits** (constants in `webhook-limits.ts`, to be tuned): 5 Webhooks per Workspace; a message of at most 16 KB; 10,000 sends per Workspace per day, claimed one by one in the database so runs at the same moment cannot pass it (past that, sends wait for tomorrow and the page says so); the log is kept 14 days.
- **The address:** `https` only; no user name or password in it; no fragment; at most 2,000 characters; the host a name or a public IP; any port. It is **sealed** with the Workspace Key (ADR 0012), since automation tools put a secret in the path (n8n, Zapier and Make addresses do), and shown masked afterwards (host and the first characters of the path). There is no import of Webhooks from a file.
- **SSRF, as the Marketplace connection has it** (`packages/core/src/marketplace.ts`, spec 0030): the shared piece, `pinnedRequest` with `mailHostResolver`, `privateAddress` and `privateMailHost`, moves to `outbound-request.ts` and both use it. The name is resolved, every address must be public, the connection goes only to an address that was checked (so a name that changes its answer between check and use, DNS rebinding, gets nowhere), TLS checks the name, no redirect is followed, the answer is read to at most 64 KB and then thrown away (never stored, never shown), and the whole send ends within 10 seconds. The check runs when the Webhook is saved **and at every send**. An address written as an IP, `localhost`, link-local and the cloud metadata addresses, IPv6 forms that map to any of those, and any name that resolves to one, are refused.
- **A self-hoster's own n8n** on a private network is a real need: the operator, not a Workspace Admin, may name exact hosts in `ZIFFR_WEBHOOK_PRIVATE_HOSTS` (comma-separated host names, never ranges). Only those pass the private-address check; `http` stays refused. The Installation Settings page lists them read-only.
- **Test:** a **Send test event** button sends `ping` (id, time, the Webhook's name, nothing of the Workspace) at most once a minute, and the log shows what came back.
- **Where not:** the demo has no Webhooks (it is read-only, spec 0029); Trial Workspaces cannot add one (a free trial that can make the server call any address is an abuse path); every other Workspace can, on Free and on every paid Size (every Size includes every feature).

### Events

One type per kind of happening, named `noun.verb`. The spec departs from the ticket's list in one place: **`question.asked` and `question.answered` are folded into the Action events**, since an Action is a Task or a Question and carries its `kind`; two names for one happening would make every template filter twice.

| Event | When |
|---|---|
| `action.created` | A Task or Question is given to someone (when its Delivery is made). |
| `action.updated` | The text, assignee or Due Date changed, a reply came into the Thread, or a Task was reopened (`status` says which state it is now in). |
| `action.answered` | A Question was answered, before it is closed. |
| `action.done` | A Task is done or a Question is closed, **for whatever reason** (`reason`, below). |
| `value.recorded` | A value counted for a Metric, after Approval where one is needed; never for an Import, never for a Derived Metric's recomputation. |
| `value.unusual` | A value waits for Approval because it is an Unusual Value. **It carries no value** (the reasoning of Alerts: a number its Approver may send back is a rumour): Metric, period and a link only. |
| `alert.fired` | A Workflow's **Tell** step (spec 0032) fires and names a Webhook among those told. **Personal Alerts never go to a Webhook** (spec 0032: only to the person). Needs spec 0032's Tell step; until then the event does not exist. |

Each Webhook chooses its events; none by default.

**The message** is one JSON object, the same shape for every event:

```json
{
  "id": "evt_01J…",
  "type": "action.created",
  "created_at": "2026-11-20T09:15:02Z",
  "workspace": { "id": "…" },
  "data": { }
}
```

`id` is one per happening and Webhook, the same on every retry; `workspace` is the id only, no name; receivers ignore fields they do not know.

**`data` is only what the event needs** (AGENTS.md rule 3, said in a comment at the builder):

- **Actions:** `ref` (`ZIF-123`), `kind`, `status`, `title` (the question or task text, cut to 200 characters), `due` (a date or null), `metric` (id and name), `period`, `assignee` (id, name, email: the receiving system finds the person by the address, as the ticket-system Connector does), `asker` (name), `link`, `updated_at`, `source` and `external_ids` (both below), for `action.done` the `reason`, and for a reply the new text (cut to 1,000). Never the Thread's older messages; never a value unless the Action is about one, and then only as the text of the reply.
- **`value.recorded`:** `metric` (id, name), `period`, `value` as text, `target` as text or null, `link`.
- **`value.unusual`:** `metric`, `period`, `link`.
- **`alert.fired`:** what an Alert's message says (Metric, period, value, target, condition, link), nothing more.
- **Never:** Breakdowns, Contacts, names of people other than the assignee and the asker, dashboards, Share lists.
- **Plain text, said so:** Workspace Keys seal data in the database; a webhook goes out in clear text over TLS, opened for sending, and the receiving system keeps it as it sees fit. The page says so when an Owner adds the first Webhook, and the guide says it. This is not end-to-end encryption and does not claim to be.

### One state change, one event, in one place

- **One core function owns every change of an Action's state:** `changeActionState(actor, action, change, source)` in `packages/core` (the existing done, answer, close, reopen, reassign and reply paths call it; none writes the state or makes an event on its own). It makes the change with one conditional update (`where status = <expected>`), and **only the call that changed the row writes the send rows**, one per Webhook that chose that event. So a change made twice (two channels at once, a retry, a recipe closing a task that is already closed) produces one event and the later calls are no-ops. A db test greps the core for any other writer of `actions.status` so a new channel cannot bypass it.
- **Every way in goes through it:** the app, the API, MCP, each Connector's inbound (email, Slack, Telegram, the web form, the ticket-system Connector), a Workflow step (an Escalation, a closing step), the Webhook's own inbound route, and the system closes below. A new Connector gets the event for free, which is the point of putting it in the core and not in each channel.
- **`source`** says where the change came from, in every Action event: `{ "type": "app" | "api" | "mcp" | "email" | "slack" | "telegram" | "web_form" | "ticket_system" | "workflow" | "system" | "webhook", "webhook_id": "…" }` (`webhook_id` only for `webhook`, and then the Webhook's own id, which is not a secret). Nothing about the person who made it.
- **`reason` on `action.done`:** `done` (a Task carried out), `answered` (a Question answered and closed), `closed` (closed by the asker or an Owner without an answer), `metric_archived`, `metric_deleted`, `assignee_left` (the person left the Workspace or became a Contact) and `workspace_closing` (the Trial ended or the Workspace is being deleted). The system closes in the last four fire the event once per Action, through the same function with `source: system`, so no external task lingers. They are sent redacted where the Metric is not Everyone's, as any Action event is. When a Metric or a deleted Trial Workspace takes its Actions with it, the close is made and sent **before** the rows go (one try, no retry, since the send rows go with them); a person removed from the Workspace hands what was asked of them to the successor, which is an `action.updated` (the new assignee in it; the reason `assignee_left` stays for a close without a successor, which removal never makes, since it always names one), and a closing Trial closes what is open with `workspace_closing` (ticket #430).
- **The first change wins.** An Action closed in Slack and then answered in the app, or done in To Do and then answered in Slack, keeps the first change; the later one is refused with a clear word in the app and Slack as today, and from a Webhook answers `200 { "changed": false, "status": "done" }`: the same state is not an error and an inbound call may be repeated safely. Nothing is merged and no second event is sent.
- **Reopening:** a reopen in the app or API reopens in Ziffr as today and fires `action.updated` with `status: open`, so a recipe can reopen the external task. A reopen **from a Webhook** (`reopen`, below) reopens a **Task** in Ziffr, never a Question (an answer cannot be un-given from a list), and never one that the system closed (`metric_archived`, `metric_deleted`, `assignee_left`, `workspace_closing`: there is no one to do it). It fires `action.updated` to every Webhook except the one it came from, with `source: webhook`.
- **No echoes:** Ziffr is the single source of truth, so a change that came in from Webhook Z is **not sent back to Z**. Every other Webhook gets it, marked with `source.type = "webhook"` and `source.webhook_id = Z`, and acts on it normally: a task done in To Do closes the one in Planner. A recipe still ignores events whose `source.webhook_id` is its own (a Webhook that was replaced or reached through two addresses), and is idempotent anyway: closing a closed external task is a no-op, and its `done` call back answers `changed: false`. The guide says: **a recipe must treat every event as possibly repeated and out of order, and must check the external task's state before it changes it.**
- **The same Task, several channels and systems:** a Task that goes out by Slack and also reaches To Do through a Webhook is one Action; an answer in Slack fires `action.done` (`source: slack`, `reason: done` or `answered`) to the To Do Webhook, whose recipe closes the external task through the `external_ids` the event carries.

### What a Webhook may see: the Workspace-wide rule

A Webhook is not a person, so there is no "what this person may see". The rule is that **a Webhook sees only what every Member sees** (the built-in Everyone Group, `withEveryone` in `visibility.ts`; Guests are not in it):

- A **value event** goes out only for a Metric that Everyone sees. Otherwise nothing is sent, and nothing in the log hints at it.
- An **Action event** goes out in full when its Metric is one Everyone sees **and** its Thread is not limited to a Group (`read_group_id` is empty). Otherwise it goes out **redacted**: `ref`, `kind`, `status`, `due`, `assignee`, `updated_at` and `link` only, with `"redacted": true`, so the assignee's own list still gets "A Ziffr task for you, due Friday, open it here" and the link's sign-in applies. That keeps the main use (a task in someone's list) without the words of a private Thread.
- **Checked at the moment of sending** against the current facts, not when the event happened, so a Metric made private between event and send is redacted or skipped. It is the rule of an Alert's message too.
- **The link** goes to the app, where the sign-in applies. It is never a View Link.
- `visibility.ts` gets one pure function, `webhookMayHear(ws, event, facts)`, so the rule has one home and a table test.

### Signing, the secret, rotation

- **Headers**, the same scheme as the inbound email route (`/api/inbound/email`, `docs/guides/email.md`), so there is one idea in the docs: `X-Ziffr-Timestamp` (Unix seconds); `X-Ziffr-Signature: sha256=<hex>`, the HMAC-SHA256 of `<timestamp>.<raw body>` with the Webhook secret; `X-Ziffr-Event` (the type); `X-Ziffr-Delivery` (the event `id`, for idempotency). Receivers must reject a timestamp older than five minutes and compare in constant time; the guide has the snippet in Node and for n8n's Code node.
- **The secret:** `whsec_` and 32 random bytes, shown once when the Webhook is made. Unlike a Usage Key (stored as a hash, spec 0031) it **must be kept to sign with**, so it is sealed with the Workspace Key and never shown again.
- **Rotation:** **Replace secret** makes a new one (shown once). For 24 hours both sign: `X-Ziffr-Signature` holds two comma-separated values, new first, so the receiver switches without a gap; then the old one is gone. Replacing again within the 24 hours ends the older one at once.

### Sending, retries, the log, switching off

- **When:** the core function that makes the change (the one that makes a Delivery or records a value) writes a **send** row for each Webhook that chose the event, after its own change succeeded and never inside it, so a Webhook can never fail an Action or a value. The row holds the inputs as ids; the message is built at send time (so the visibility check is current) and kept sealed until delivered or for 7 days.
- **The job:** the existing `POST /api/jobs/deliveries` job sends them every few minutes, each claimed by one conditional update (`queued` to `sending`) so two runs send once; a send is also tried at once after the event where the Installation runs a worker. No new job, no new secret.
- **Success** is any `2xx` within 10 seconds. **Retry** on a network error, a timeout, `408`, `429` (honouring `Retry-After` up to an hour) and `5xx`: after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, then **failed**. Any other `4xx` fails at once, except `410 Gone`, which switches the Webhook off.
- **Order is not promised:** every message carries `created_at` and, for Actions, `updated_at`; the guide says to apply the newest and ignore what is older. At least once is the promise; the `id` makes a repeat harmless. A send that is still being sent five minutes after it was taken (a run that died, or one that was slow) is taken again and sent with the **same id**, so a receiver **must dedupe on the id** (Automation Templates do); the claim is not extended, because a dead run would then hold its messages back for as long.
- **The log** on the Webhook's page: the last 14 days of sends with the event type, the `ref` or Metric, the time, the status (queued, delivered, retrying, failed), the answer's status code and the number of attempts; a failed send has **Send again**. It stores no answer body and no sent body after delivery; an Owner who wants a body looks in the receiving tool. Only Owners and Admins read it.
- **Switching off:** after **20 sends in a row failed**, or when the first failure is more than **3 days** old with no success since, the Webhook is switched off (`disabled_at`, with its reason shown), queued sends are dropped, and every Owner gets one email through `deliverNotice` saying which Webhook and why, with the link. Turning it on again is a click and resends nothing. A Webhook that has had no event for 90 days is not switched off.
- **Told on every change:** adding, changing, replacing the secret, switching on or off and deleting a Webhook go into the **Audit Log** (it changes where Workspace data goes) and send the other Owners a notice. The address in the log is masked as on the page.
- **No echoes, only marked changes for the others:** a Webhook's own inbound change is not sent back to it; the other Webhooks get it marked with its origin (see above).
- **Deleting a Workspace** destroys the Webhook rows with the Workspace Key, as other sealed data; **removing a person** changes nothing here, since a Webhook belongs to the Workspace.

### Status back into Ziffr

**Decision:** one endpoint, authenticated by the **Webhook's own secret** with the same signature as outgoing messages, not by an Access Key. Reason: an Access Key acts for a person within that person's rights, and whoever ticks off Ana's task in Microsoft To Do is Ana, not the Owner who made the key. A Webhook request instead acts as **the Webhook**, a Workspace-owned Actor like a Feed's, with a small fixed set of operations, only on Actions that were sent to it, and reading nothing.

- **Route:** `POST /api/webhooks/{webhook id}/in`, body at most 16 KB, signed as above (timestamp within five minutes, constant-time compare; the request's delivery id is claimed so a replay changes nothing, the discipline of Slack's `event_id` in spec 0007). `404` for anything unknown, unsigned or off, with no hint whether the id exists.
- **Operations** (`op`):
  - `link`: `{ ref, system, external_id, url? }` says "Action X is external task Y in system Z" for an Action this Webhook was sent. `system` is a short label the recipe chooses (`microsoft-todo`, `planner`, `google-tasks`; at most 40 characters, letters, digits and dashes), `external_id` at most 200 characters, `url` an optional `https` link shown in Ziffr as "also in Microsoft To Do". **An Action may have several, one per Webhook and system** (To Do and Planner at once, or two Workspaces' tools); the pair (Webhook, system, external_id) is unique, and linking the same system again for the same Action replaces its id. Up to 10 per Action. **Every later event to that Webhook carries them back** as `external_ids: [{ system, external_id, url }]` (only those that Webhook linked, never another Webhook's), so the recipe closes or updates the right external task and keeps no database of its own. Linking is the first thing a recipe does after creating the external task; an event that arrives before the link (a quick `done`) is why the recipe must also be able to find the task by the `ref` it wrote into the task's notes.
  - `done`: marks a **Task** done (if it is already done or closed: `200 { "changed": false }`, no event) as **the assignee, via the Webhook** (the Thread shows "Marked done in Microsoft To Do", the Audit Log "by Webhook Microsoft To Do"). A Question is not marked done this way: it is done by being answered.
  - `reply`: `{ text }` (at most 1,000 characters) adds a Thread message by the assignee, marked "via <Webhook name>". The text is untrusted: escaped wherever shown, never parsed as a command, never read as a value or a Correction (a reply "42" to a Slack Prompt records a value; a reply here never does).
  - `answer`: `{ text }` answers a **Question** as the assignee, as a reply does in the app, marked the same.
  - `reopen`: reopens a **Task** that was marked done (in Ziffr or elsewhere) when the person un-ticks it in the other system, with the limits under "Reopening" above.
  - **All of them** go through `changeActionState` and answer `{ "changed": true | false, "status": "…" }`, so a recipe may repeat any call.
- **Addressing an Action:** by `ref` (the message carries it) or by `{ system, external_id }` linked before. An Action the Webhook was never sent (no send row) is refused, so a leaked secret reaches no further than what was already sent to that Webhook and can read, create, reassign or reopen nothing. Actions on a Metric the assignee can no longer see are refused too.
- **One core function:** `applyWebhookAction(webhookActor, input)`, taking an Actor of a new kind (`WebhookActor`, with a Workspace and no person), which calls the same internal functions as the app's own done, reply and answer, so the state rules (a closed Action stays closed) live in one place.
- **Not in v1:** reopening a Question, reassigning, changing a Due Date or the text from outside, creating an Action, recording a value. (Values come in through a Feed; Actions are given by people in Ziffr.)
- **Rate:** 60 requests a minute per Webhook, then `429`.

### Automation Templates

- **Where:** `docs/automations/<system>-<direction>.json` (n8n workflows, one file per direction so each can be imported alone), a `README.md` for each (what it does, what to fill in, what it cannot do), `docs/automations/fixtures/` (one sample message per event) and the guide `docs/guides/webhooks.md` (adding a Webhook, the signature, the message, the inbound endpoint, a walkthrough per template). A template is an artefact of the repository; Ziffr never runs it and never holds the other system's credentials (the rule for Feeds, ADR 0006).
- **Order:** (1) Microsoft To Do (Microsoft Graph `me/todo`); (2) Google Tasks; both ways; then (3) Slack (a channel message for `action.created`, `action.done` and `alert.fired`; replies in its thread come back through `reply`); (4) Asana; (5) Todoist; Planner after Google Tasks, since a Planner task needs a plan and a bucket and so is not "my list". Zapier and Make later, from the same messages.
- **Shape of a two-way pair.** _Ziffr to the list:_ a Webhook node receives; a Code node checks the signature and the five-minute window and drops what is older than what it has already seen (n8n's static data holds the last `updated_at` per `ref`); it ignores events whose `source.webhook_id` is its own; a Switch on `type` creates, updates, completes or reopens the task, finding it by the `external_ids` in the event (and, for a first event, by the `ref` in the notes) and checking its state first, so every step is idempotent; after creating a task an HTTP Request calls `link` with the new task's id. _List to Ziffr:_ a Schedule trigger every five minutes asks the list for tasks completed since the last run (neither To Do nor Google Tasks pushes), finds the `ref` the task carries in its notes, signs the request in a Code node and calls `done` (or `reopen` for one that was un-ticked); a `changed: false` answer is success. The `ref` is written into the task's notes so a person sees where it came from.
- **Credentials** stay in n8n's credential store; the Webhook secret and the Ziffr address are placeholders in the file, never filled in.
- **Tested**, as the Feed workflow (`docs/guides/n8n-feed-workflow.json`, the pattern, which stays) is: (1) **shape:** each file parses, node ids are unique, every connection names a node that exists, only node types on a short allowlist are used, nothing is shaped like a key, the Webhook path is a placeholder; (2) **a fixture run:** the Code nodes' JavaScript is extracted and run in Node's `vm` against the fixtures signed with a test secret, asserting that a correct message is accepted, a wrong signature, an old timestamp and an older `updated_at` are not, and that the To Do and Google Tasks request bodies equal expected files; the signing node signs a request that Ziffr's real verifier (the route's pure function) accepts; (3) **a contract test:** the fixtures are produced by the core's own message builder from seeded data and checked against `docs/reference/webhook-events.schema.json` (generated from the schema the builder uses, never edited by hand), so a change to an event fails until the fixtures and templates follow. n8n itself and the other systems' APIs are not tested here (they need accounts): each template's README says "tried against <system> on <date>", filled in by hand when it was.
- **Maintaining:** a template that breaks because another system changed is a bug in the repository's docs, fixed by pull request; the guide says Ziffr does not support the other system.

### Relation to #7 and to the Slack Connector

- **The Slack Connector stays native** (spec 0007). It reaches **a person** by direct message, matches them by their proven address, takes a number as the answer to a Prompt and has buttons for Approval. None of that fits a Webhook, which does not know who is in the channel. The Slack template is for **a channel**: Tasks given, Tasks done, team Alerts; a reply in a message's thread comes back as a Thread message and never as a value.
- **Task lists go through Webhooks** (Microsoft To Do, Planner, Google Tasks, Asana, Todoist, and anything with an API and an automation tool): the need is a task and its done state, which the events, `link`, `done`, `reply` and `answer` cover.
- **#7 (a real Jira, Linear or GitHub Issues Connector)** stays native only if the work needs what Webhooks do not give: matching and sign-in per person, comment-by-comment threads in both directions, statuses beyond done (in progress, won't fix) and attachments. That is the bar. Recommendation: keep #7 open and do not start it until the templates have been used for a while, then ask which system's users still ask for more; the simulated ticket-system Connector stays the prototype. The spec for #7 would then say what a Connector adds over a Webhook, and this spec makes that comparison possible.
- **The external id is Webhook-scoped,** so the same task can be in To Do through one Webhook and in Slack through another without a clash.

### Sealed, visible, audited

- **Sealed with the Workspace Key** (spec 0028, in the ticket that adds the tables): the address, the secret, `external_id`, `url` and queued messages. A dump holds nothing readable.
- **Audit Log:** every change to a Webhook and every inbound operation (`done`, `reply`, `answer`, naming the Webhook). Sends are not in it; they are in the log on the page.
- **Access:** the tables are service-role only and read through core functions taking the Actor; only Owners and Admins read Webhooks and their log.
- **Threat model** (`docs/security/threat-model.md`): new entries for requests to addresses people name (SSRF, DNS rebinding, redirect, slow answer), for a leaked Webhook secret (what it can and cannot do) and for data leaving the Installation (what leaves, said on the page); the Accepted risks list notes that clear text leaves by design.

## Testing Decisions

- **Visibility, the main test:** `webhookMayHear` as a table (Metric private, shared with Everyone, with a Guest only, an Action limited to a Group, a Metric made private between event and send). Full and redacted messages hold nothing outside the lists above, tried on a hostile Workspace (names with markup, a Metric named like an email address, a Thread limited to a Group). `value.unusual` never holds a value; no Breakdown or Contact ever appears.
- **SSRF** against the real transport, with a local server standing in for DNS answers: private, loopback, link-local, metadata, IPv6 mapped, a name that answers public and then private, a redirect, a slow trickle, an over-large answer; `http` refused; the operator list lets in exactly the named host and not its neighbours.
- **Signing:** the HMAC equals the documented one (a fixed vector in the guide, tested); the timestamp window; both secrets during a rotation and one after; the verifier is constant-time and refuses a missing, malformed or short signature.
- **Sending:** retries on the schedule (a fake clock), `Retry-After`, `410`, an ordinary `4xx` fails at once; two job runs send once; the same `id` on every retry; a failing Webhook never fails the Action; auto-disable after 20 failures or three days, one email to each Owner, nothing resent on turning it on.
- **Inbound:** unsigned, old, replayed, wrong id and off Webhook all answer 404 alike; `done` works on a Task sent to it, and not on a Question, a Task never sent to it or an Action of another Workspace, and on a closed Action it answers `changed: false`; `reply` and `answer` text with markup, a bare number and "Correction: 12" record nothing but a Thread message; the rate limit.
- **One change, one event, any channel:** answering a Task by Slack, by email, by Telegram, in the app, by API, by MCP and by a Workflow step each sends exactly one `action.done` (with the right `source`) to every Webhook that chose it, and to none that did not; **answering a Task by Slack sends `action.done` to a To Do Webhook**; the same change made twice at once and in a retry sends one; a grep-test proves no other code writes `actions.status`; `reason` is right for done, answered, closed, archived Metric, deleted Metric, assignee left and a closing Workspace, and a system close sends one event per Action.
- **Echo and conflicts:** a `done` coming back from Webhook Z is sent to every other Webhook with `source.webhook_id = Z` and to Z not at all; replaying the call answers `changed: false` with no second event; a Task done in To Do and then answered in Slack keeps the first and sends one event; a `reopen` from a Webhook reopens a Task, is refused for a Question and for a system-closed Task, and sends `action.updated` to every other Webhook.
- **External ids:** two ids on one Action (two systems), replacing one, the 11th refused, the event to Webhook A carries only A's ids, never B's; the same id for another Action is refused.
- **Limits:** the 6th Webhook, an oversize message, the daily cap, parallel creations under the limit.
- **Sealing and deletion:** a database dump holds no address, secret, external id or message in clear; deleting the Workspace leaves nothing readable.
- **Templates:** the three tests above (shape, fixture run, contract).
- The core against the database (`*.db.test.ts`), nothing inside it mocked except the network. Tried in the running app against a small local receiver and once against a real n8n with the To Do template.

## Out of Scope

- Webhooks set through the API or MCP, or by Members for themselves (a person who wants to hear gets an Alert).
- Personal Alerts to a Webhook; a Webhook that gets everything one person sees.
- Events for dashboards, Snapshots, decks, Comparisons, Metrics being made or changed, people or Groups.
- Reassigning, changing a Due Date or text, or creating Actions, and recording values, from outside through a Webhook (values: a Feed); reopening a Question from outside.
- Zapier and Make templates (the same message works there); a template store or gallery.
- A native Jira, Linear or GitHub Issues Connector (#7) and a native Microsoft Teams or Google Chat Connector.
- Payload transformations, per-event filters (by Metric or Group) and any signing scheme other than HMAC.
- Streaming, batching or ordering guarantees; at least once is the promise.
- Paid features and `ee/`.

## Decisions (2026-11-20, by the owner)

The owner accepted every recommendation of the draft, with one change to the seventh. They are written into the sections above and are:

1. Actions the whole Workspace may not see go out redacted (ref, status, due date, assignee, link), not withheld.
2. A self-hoster's private n8n is reached only through the operator's list of exact hosts, `ZIFFR_WEBHOOK_PRIVATE_HOSTS`; a Workspace Admin cannot turn it on.
3. No API or MCP to manage Webhooks in the first version; the page only.
4. `alert.fired` is sent only through a Workflow's Tell step, never for personal Alerts.
5. Status comes back by the Webhook's own secret, acting as the assignee, limited to Actions sent to it.
6. The words are Automation Template and `docs/automations/`, not "Recipe".
7. Every Size includes every feature (spec 0029, ADR 0013), so Webhooks are allowed on Free (the default limit) and on every paid Size. Only Trial Workspaces and the demo have none.
8. Microsoft To Do and Google Tasks come first; Planner is its own template after Google Tasks.
9. #7 stays open and is not started until the templates have been used for a while.
10. A reopen from outside reopens a Task in Ziffr (Tasks only, never one the system closed), as an event to every Webhook.

## Tickets

1. Shared transport (the glossary entries are made with this spec): `outbound-request.ts` moved out of `marketplace.ts` with the private-address rules and the operator list, SSRF tests, the threat-model entry. Not blocked.
2. Webhooks in the core: the tables (sealed, spec 0028), create, change, replace secret, switch on and off, delete (Actor first, Owner or Admin, limits), the Audit Log, notices to Owners, db tests; no sending yet. Blocked by 1 and spec 0028's sealing.
3. Events and sending: `changeActionState` as the one writer of an Action's state (all the channels, the app, API, MCP and Workflow steps moved onto it, with the `source` and `reason` and the grep-test), the pure `webhookMayHear` and the message builders with their schema (`docs/reference/webhook-events.schema.json`, generated), the send rows written by the core's changes, signing, the sending path in the deliveries job, retries, auto-disable with the Owners' email, quiet loops. Blocked by 2.
4. Settings, Webhooks page: add, events, secret shown once, masked address, Send test event, the log with Send again, switch off, replace secret; user guide chapter 16, the clear-text note, a release note. Blocked by 3.
5. Status back: `POST /api/webhooks/{id}/in`, `WebhookActor`, `applyWebhookAction` with `link` (several external ids per Action, returned in later events), `done`, `reply`, `answer`, `reopen`, idempotent answers, the link shown on the Action, replay claim, rate limit, tests. Blocked by 3.
6. Guide and fixtures: `docs/guides/webhooks.md`, `docs/automations/fixtures/` produced by the builders, the contract test. Blocked by 3 and 5.
7. Microsoft To Do templates (both directions), their tests (shape and fixture run), README. Blocked by 6.
8. Google Tasks templates (both directions) in the same way. Blocked by 6.
9. Slack channel template, then Asana, Todoist and Planner (each its own pull request). Blocked by 7.
10. The Tell step can name a Webhook and `alert.fired` starts (only once spec 0032's Tell step exists). Blocked by 3 and spec 0032 ticket 6.
11. Docs and a security review of the whole spec (what leaves, redaction, SSRF, the secret, inbound limits, sealing). Blocked by 4, 5 and 7.
