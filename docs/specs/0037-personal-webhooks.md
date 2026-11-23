# 0037 Personal Webhooks: a person's own address for what happens to their numbers and tasks

**Status:** done. **Ticket:** #639 (the owner's wish, 2026-11-22); the tracking issue is #639 and its sub-issues are labelled `spec:0037`.

## Problem Statement

A Webhook (spec 0034) belongs to the Workspace: an Owner or Admin adds it, it hears only what every Member may see, and anything else reaches it with its words left out. That is right for a bridge the whole team relies on, such as tasks into Microsoft To Do.

It leaves out the single person. Ana wants her own n8n flow to log every value of the three Metrics she owns into her notes, to put the Tasks given to her into her own task list with their full text, or to post her own Alerts into her phone's automation app. Today she has to ask an Owner, and even then the Workspace Webhook leaves out the words of anything that is not shared with Everyone, which is most of what is hers.

The owner's view of who answers for what (2026-11-22): **the person decides where their data goes and answers for what happens to it there; the Admin decides whether that is allowed at all; Ziffr makes sure the tool cannot do more than its rules.** In Ziffr's part: a Personal Webhook carries only what its person may see at the moment it is sent, never reaches the Installation's own network, is signed, limited and audited, and ends when the person leaves.

The owner also decided that Trial Workspaces get Webhooks, Workspace and personal ones, as they already get email, Telegram, Slack and the MCP Server: a trial should show every way out of Ziffr, not all but one.

## Solution

1. A **Personal Webhook**: an https address a person adds for themselves in one Workspace, under **You → Your Webhooks**, next to Connected assistants. It acts as that person: each message carries in full what the person may see at the moment it is sent, and nothing they may not.
2. An **Admin switch**: **Settings → Webhooks → People may add their own Webhooks**, off unless an Owner or Admin switches it on. Off pauses every Personal Webhook of the Workspace.
3. **Status back** as the person: ticking a task off in their own list marks it done in Ziffr as them, as for a Workspace Webhook.
4. **Their own Alerts** may go to a Personal Webhook, as `alert.fired`.
5. **Trial Workspaces** may add Webhooks of both kinds, within smaller limits, unless the operator turns that off.

Everything else is spec 0034's machinery: signing, the secret shown once and replaced without a gap, retries, the log, switching off after failures, the outbound request rules and the inbound endpoint.

## User Stories

1. As a Member, I want to add my own Webhook without asking an Owner, so that my own tools hear about my own numbers and tasks.
2. As a Member, I want the Tasks and Questions given to me sent in full, with their title and Metric, so that my own task list says what to do, not "a Ziffr task".
3. As a Member, I want to pick which Metrics' values my Webhook hears, so that my automation gets what it needs and not every value of the Workspace.
4. As a Member, I want my own Alerts sent to my Webhook, so that my phone's automation can act on them.
5. As a Member, I want to tick a task off in my own list and see it done in Ziffr as me, so that nobody asks me twice.
6. As an Owner or Admin, I want to decide whether people may add their own Webhooks, so that our Workspace's data leaves only if we agreed that it may.
7. As an Owner or Admin, I want to see every Personal Webhook, whose it is and where it points, and remove one, so that I can act when someone points one somewhere they should not.
8. As a teammate, I want nobody's Personal Webhook to carry my private Metric or a Thread kept to my Group, unless that person may see it, so that sharing stays what I set.
9. As an Owner, I want a person's Webhooks to end when they leave the Workspace, so that a leaver's tools hear nothing more.
10. As a person trying Ziffr, I want to add a Webhook in my Trial Workspace, so that I can see the bridge to my own tools work before I decide.
11. As a self-hoster, I want no Webhook of a Trial Workspace to reach my private network, and a way to switch Webhooks off for trials, so that free trials are not an abuse path.

## Implementation Decisions

### Words

- **Personal Webhook** is new (glossary): a Webhook that one person adds for themselves in one Workspace and that acts as that person. It is a Webhook in everything but who it belongs to and what it may hear. _Avoid_: my webhook, user webhook, private webhook.
- The glossary's **Webhook** entry says that a Workspace's Webhook belongs to the Workspace and names the personal kind; in the app the two lists are headed **Workspace Webhooks** and **Personal Webhooks**, and "Webhook" alone keeps meaning the Workspace's.
- Not a Connector and not a Delivery Preference way: a Personal Webhook reaches a program, not the person.

### Who, where, how many

- **Who may add one:** Owners, Admins and Members of the Workspace, once the switch is on. Not Guests (they see only what is shared with them and are outside the team; a later spec may add them), not Contacts, not assistants or programs. As for Workspace Webhooks, there is **no API and no MCP tool to create, change or point a Personal Webhook anywhere**: changing where data leaves is exactly what a prompt-injected assistant would be asked to do, and the page is enough.
- **The switch:** **Settings → Webhooks → People may add their own Webhooks**, Owners and Admins, off for every Workspace, existing ones included. Turning it off **pauses** every Personal Webhook (nothing is queued while paused; events in that time are dropped, and each person's page says why) and hides **Add**; turning it on again resumes them. Both are in the Audit Log.
- **The person's page:** **You → Your Webhooks** lists their Personal Webhooks of the current Workspace: name, masked address, events, state, last send, and the log. Add, change, **Send test event**, replace secret, switch off, delete. Without the switch the page says "Your Workspace does not allow personal Webhooks; ask an Owner or Admin" and names none of them.
- **The Admins' view:** **Settings → Webhooks** gets a second list, **Personal Webhooks**: whose, name, masked address, events, state and last send, and **Remove**. Admins see the log's statuses and times, not the messages: what was sent is the person's. Removing one tells its person (a notice through their Delivery Preference, naming who removed it) and is in the Audit Log.
- **Limits** (constants beside `webhook-limits.ts`): 3 Personal Webhooks per person per Workspace; 1,000 sends per person per day; every send also counts against the Workspace's daily cap of spec 0034, so the server's load stays bounded by one number. The Workspace's 5 counts Workspace Webhooks only.
- **The address and its rules** are spec 0034's, unchanged: https only, checked at save and at every send by the shared outbound request (private, loopback, link-local and metadata addresses refused, DNS rebinding, no redirect, the answer read to 64 KB and thrown away, 10 seconds). The operator's `ZIFFR_WEBHOOK_PRIVATE_HOSTS` applies to Personal Webhooks too, **except in Trial Workspaces** (below). Address and secret are sealed with the Workspace Key (ADR 0012).

### What a Personal Webhook hears

- **It acts as its person.** Every event is checked **at the moment of sending** with the same rules that decide what that person sees in the app, through the core's visibility functions with the person as the Actor: their role, Shares, Groups and Thread limits as they are then. If the person may see it, the message goes out **in full**, with every field of spec 0034's schema; if not, the event is **not sent** and nothing in the log hints at it. There is no redacted form: a redacted message is how the Workspace Webhook stays useful to everyone, and a Personal Webhook has only one reader.
- **Events it may choose**, none by default:
  - `action.created`, `action.updated`, `action.answered`, `action.done` for **Actions given to the person or asked by them**, not every Action they could see.
  - `value.recorded` and `value.unusual` for **the Metrics the person picks**, up to 50, each one they may see when they pick it (and checked again at every send). `value.unusual` carries the value when the person may see a value waiting for Approval (a Metric Owner, an Approver, its Submitter), and leaves it out otherwise, as spec 0034 does.
  - `alert.fired` for **the person's own Alerts** that name this Webhook (below).
  - `ping` from the test button.
- **Never sent**, as in spec 0034: Breakdowns, Contacts, dashboards, Share lists, the Thread's older messages. Of people, a message names the assignee and the asker, and carries an email address only when it is the person's own: a Personal Webhook is not a way to collect teammates' addresses.
- **What changes for spec 0034's rule** that personal Alerts never go to a Webhook: it keeps holding for Workspace Webhooks. A personal Alert may name the person's own Personal Webhook, since it is the person's to begin with.

### Alerts

- An Alert's form gets **Also send to** with the person's Personal Webhooks of that Workspace (none ticked by default). The Alert still tells the person through their Delivery Preference; the Webhook gets `alert.fired` with the Metric, period, value, target, the condition and a link, once per crossing, the same moments the Alert fires.
- If the Webhook is deleted, paused or the person loses sight of the Metric, the Alert simply stops sending to it, as an Alert stops when its Metric is no longer seen.

### Status back

- The inbound endpoint of spec 0034 (`POST /api/webhooks/{id}/in`) takes a Personal Webhook's signed requests too. It acts **as the person** (an Actor for that person, marked as coming through this Webhook), for Actions sent to this Webhook only: `link`, `done`, `reply`, `answer`, `reopen`, with the same limits, replay claim and uniform 404s. The Thread says "Marked done in <Webhook name>" and the change is the person's, as if they had pressed the button.
- It asks the app's own question: the people on a Thread may read and answer it whether or not they still see its Metric, so a Personal Webhook may too, and not otherwise.
- It can never approve or send back a value, share, invite, or change a setting, as no Webhook can.

### Lifecycle

- **Ends with the person's place in the Workspace:** removed when the person leaves or is removed from the Workspace, becomes a Contact, or deletes their account; the send queue and log go with it. The Audit Log records the removal with the reason.
- **Follows the person's sight:** a role change, a Share taken away or a Group left needs nothing extra, because each send is checked then. A picked Metric the person no longer sees is skipped, and the page marks it.
- **Fails like any Webhook:** after spec 0034's run of failures it switches itself off and tells **its person** (not the Owners).
- A Trial Workspace that is deleted takes its Webhooks with it, and destroying its Workspace Key makes their sealed addresses unreadable in old backups (spec 0028).

### Trial Workspaces

- **Owner decision, 2026-11-22:** Trial Workspaces may add Webhooks, Workspace and Personal ones, as they get email, Telegram, Slack and the MCP Server. This replaces spec 0034's "Trial Workspaces cannot add one" (decision 7 there keeps the demo without any).
- **What keeps it from being an abuse path:** smaller limits (2 Webhooks of both kinds together, 200 sends a day, the test button once a minute, as everywhere); the operator's private hosts **never** apply, so a trial reaches only public addresses; the same outbound rules otherwise. The operator can switch it off under **Installation settings → Trials → Webhooks in trials** (on by default), and `ZIFFR_TRIAL_WEBHOOKS=false` does the same, environment over page as in spec 0025.
- A trial has one person, its Owner, so its Personal Webhooks and Workspace Webhooks reach the same person; both are offered so a trial shows what the real thing has. The Trial Guide's last step lists Webhooks among the ways out, next to the MCP Server and Feeds.
- The demo stays without Webhooks: it is read-only.

### Sealed, visible, audited

- **Tables:** `personal_webhooks` beside `webhooks`, or `webhooks` with an owner column; whichever the implementation picks, a Personal Webhook's row names its person and every query that lists or sends checks it. The secret and address are sealed; the log keeps statuses and times for 14 days.
- **Audit Log:** the switch on and off; a Personal Webhook added, changed (address or events), its secret replaced, removed (by the person, an Admin, or because the person left), switched off after failures.
- **Threat model** (`docs/security/threat-model.md`): a Personal Webhook as a way out of the Workspace that the Admin allowed and the person points; what it may carry (what the person sees) and may not (anything else); a prompt-injected assistant cannot make one; a trial cannot reach private hosts.
- **What leaves** is said on both pages, as for Workspace Webhooks: clear text over TLS, not end-to-end, kept by the receiving system as it sees fit.

## Testing Decisions

- **Visibility, the main test:** `personalWebhookMayHear(person, event)` as a table: a Metric private to the person, shared with them only, shared with a Group they are in and one they are not, a Thread kept to a Group, an Action given to them and one given to a teammate, a Metric made private between event and send, a person demoted between event and send, a waiting value for its Approver and for a plain viewer. Full messages hold nothing outside spec 0034's fields; no other person's email appears.
- **Switch and lifecycle:** off by default; off pauses and drops; on resumes; leaving, becoming a Contact and deleting the account remove them; an Admin's removal tells the person.
- **No other way in:** no API route or MCP tool creates or changes one (a test lists the routes and tools); a Guest and a Contact cannot add one.
- **Status back** as the person, only for Actions sent to that Webhook; never for another person's Action; never an approval.
- **Trials:** a trial adds Webhooks within its limits; the private hosts list does not apply; the operator switch and the environment value turn it off.
- **Limits:** the 4th Personal Webhook, the person's daily cap, the Workspace cap counting both kinds.
- **SSRF:** spec 0034's tests run for Personal Webhooks through the same transport (no second copy of the rules).
- **Pages** tried in the running app (both lists, the switch, Your Webhooks, Also send to on an Alert), and the user guide chapters updated.

## Out of Scope

- Guests' Personal Webhooks; Personal Webhooks across Workspaces (each belongs to one).
- A Personal Webhook as a Delivery Preference way for Prompts, tasks or reminders: the person's own channels stay what reaches them.
- A Workflow's Tell step naming a Personal Webhook.
- Creating or changing Webhooks through the API or MCP.
- Events beyond spec 0034's list (a Snapshot taken, a dashboard changed).

## Decisions (2026-11-22, by the owner)

1. The person answers for where their data goes; the Admin decides whether it may; Ziffr enforces the rules.
2. An Admin switch allows Personal Webhooks; they are removed when the person leaves.
3. A Personal Webhook sends what comes with the event in full, for what its person may see.
4. The person manages theirs under their own settings, next to the assistant connection.
5. Trial Workspaces get Webhooks too, both kinds.

Proposed in this spec, open to change: off by default; Guests not in v1; Actions only those given to or asked by the person; up to 50 picked Metrics; 3 per person and 1,000 sends a day; trials 2 and 200 a day without private hosts.

## Tickets

1. Personal Webhooks in the core: the owner on the row (sealed), the Workspace switch, add, change, replace secret, test, switch off and delete as the person, the Admins' list and removal with its notice, limits, the lifecycle on leaving, becoming a Contact and deleting the account, the Audit Log, the glossary, db tests. Not blocked.
2. Hearing as the person: `personalWebhookMayHear` through the core's visibility functions at send time, full messages, the event choice (own Actions, picked Metrics), `value.unusual` with the value only where the person may see it, the caps, db tests. Blocked by 1.
3. Status back as the person through the existing endpoint, limited to Actions sent to the Webhook, tests. Blocked by 2.
4. Alerts: **Also send to** on an Alert, `alert.fired` to the person's Personal Webhook, tests. Blocked by 2.
5. Pages: **You → Your Webhooks**, the **Personal Webhooks** list and the switch on **Settings → Webhooks**, the user guide chapters (Your settings, Workspace settings). Blocked by 1; its sending parts by 2.
6. Webhooks in Trial Workspaces: both kinds, the trial limits, no private hosts, the operator setting and environment value, the Trial Guide's ways out, spec 0034's line updated, the user guide (Installation settings). Not blocked.
7. Docs and a security review of the whole spec: the Webhooks guide's section on Personal Webhooks, the threat model entries, what leaves. Blocked by 2 to 6.
