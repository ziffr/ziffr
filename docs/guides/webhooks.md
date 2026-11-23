# Webhooks

A Webhook sends signed messages out of Ziffr when something happens, such as a task given or done, and takes status back, so a small program can keep another system in step: Microsoft To Do, Google Tasks, Slack, Asana, Todoist, or anything an automation tool such as n8n can reach ([spec 0034](../specs/0034-webhooks-and-automation-templates.md)). This guide is for the person who builds that receiving side. The person who adds the Webhook in Ziffr (an Owner or Admin) is covered in the [user guide](../user-guide/16-workspace-settings.md#webhooks).

Ziffr does not support the other system. A recipe that breaks because that system changed is fixed by a pull request, like any other file in this repository.

## What you get

Every message is one JSON object, `POST`ed to your address:

```json
{
  "id": "evt_00000000000000000000000000000001",
  "type": "action.created",
  "created_at": "2026-11-20T09:15:02.000Z",
  "workspace": { "id": "0d4f6a52-8f0e-4a39-9c1b-5f1d1c0f7a01" },
  "data": {}
}
```

`id` is one per happening and Webhook and is the same on every retry. `workspace` is the id only. Ignore fields you do not know: new ones may come. The [schema](../reference/webhook-events.schema.json) describes every message, and [`docs/automations/fixtures/`](../automations/fixtures/) has one example of each, made by the same code that makes the real ones.

Each Webhook chooses its events; none by default.

| Event | When | Example |
|---|---|---|
| `action.created` | A Task or Question is given to someone. | [action-created.json](../automations/fixtures/action-created.json) |
| `action.updated` | The text, assignee or Due Date changed, a reply came into the Thread, or a Task was reopened. `status` says which state it is in now. | [action-updated-reply.json](../automations/fixtures/action-updated-reply.json) |
| `action.answered` | A Question was answered, before it is closed. | [action-answered.json](../automations/fixtures/action-answered.json) |
| `action.done` | A Task is done or a Question is closed, for whatever reason (`data.reason`). | [action-done.json](../automations/fixtures/action-done.json) |
| `value.recorded` | A value counted for a Metric, after Approval where one is needed. Never for an Import or a Derived Metric. | [value-recorded.json](../automations/fixtures/value-recorded.json) |
| `value.unusual` | A value waits for Approval because it is an Unusual Value. It carries no value. | [value-unusual.json](../automations/fixtures/value-unusual.json) |
| `ping` | The **Send test event** button. No `workspace`; `data.webhook.name` only. | [ping.json](../automations/fixtures/ping.json) |

An Action is a Task or a Question, so there are no separate question events: read `data.kind`.

### Action events

| Field | Meaning |
|---|---|
| `ref` | The Action's reference, such as `ZIF-12`. Write it into the external task so a person sees where it came from. |
| `kind`, `status` | `task` or `question`; `open`, `answered` or `closed`. A Task marked done is `answered`. |
| `title` | The task or question text, cut to 200 characters. |
| `due` | A date, or `null`. |
| `metric`, `period` | The Metric the Action is about (`id`, `name`) and its period. |
| `assignee` | `id`, `name` and `email`. Find the person in the other system by the address. |
| `asker` | `name` only. |
| `link` | A link into the app. Signing in applies; it is never a View Link. |
| `updated_at` | When the Action last changed. |
| `reply` | On a reply or an answer: `text`, cut to 1,000 characters. Never the Thread's older messages. |
| `reason` | On `action.done` only: `done`, `answered`, `closed`, `metric_archived`, `metric_deleted`, `assignee_left` or `workspace_closing`. The last four are Ziffr closing the Action itself, so no external task lingers. |
| `source` | Where the change came from: `app`, `api`, `mcp`, `email`, `slack`, `telegram`, `web_form`, `ticket_system`, `workflow`, `system` or `webhook`. For `webhook`, `webhook_id` is the id of the Webhook that reported it. Nothing about the person. |
| `external_ids` | The external tasks **this** Webhook linked to the Action (see `link` under [Status back into Ziffr](#status-back-into-ziffr)): `system`, `external_id` and `url`. Use them to find the task to update or close. Never another Webhook's. |

Metric and value events carry `metric` (`id`, `name`), `period` and `link`; `value.recorded` adds `value` and `target` as text (`target` may be `null`).

### Redacted messages

A Webhook is not a person. It hears what every Member of the Workspace may see, and other things reach it with their words left out:

- A value event for a Metric that is not shared with Everyone is not sent at all, and nothing in the log hints at it.
- An Action event for such a Metric, or for a Thread limited to a Group, is sent **redacted**: `ref`, `kind`, `status`, `due`, `assignee`, `link`, `updated_at`, `source`, `external_ids`, `reason` when done, and `"redacted": true`. No title, Metric, asker or reply. The assignee's own list can still say "A Ziffr task for you, due Friday, open it here".

Check `data.redacted` before reading `title`. The decision is made when the message is sent, not when the thing happened.

### What is never sent

Breakdowns, Contacts, dashboards, Share lists, the names of people other than the assignee and (in a full message) the asker, the Thread's older messages, and the value of an Unusual Value. A Personal Webhook (spec 0037) is the exception to the words and the value: it acts as its person and gets a message in full for what that person may see when it is sent, and for an Unusual Value the number only where they may see a value waiting for Approval; it is never sent another person's email address. Personal Alerts never go to a Workspace Webhook. A change that came in from a Webhook is not sent back to that Webhook.

Messages go out in **clear text over TLS**. Workspace Keys seal data in the database, not on its way out, and the receiving system keeps what it gets as it sees fit. This is not end-to-end encryption.

## Verifying a message

Ziffr sends four headers, the same scheme as [signed replies by email](email.md#taking-replies):

| Header | Value |
|---|---|
| `X-Ziffr-Timestamp` | Unix seconds when the message was signed. Every try is signed again. |
| `X-Ziffr-Signature` | `sha256=<hex>`: the HMAC-SHA256 of `<timestamp>.<raw body>` with the Webhook's secret. |
| `X-Ziffr-Event` | The event type. |
| `X-Ziffr-Delivery` | The message `id`. |

Verify before you do anything else, and verify the **raw body**, exactly as received: parsing it and writing it out again changes it. Reject a timestamp more than five minutes from now, compare in constant time, and answer `401` or `403` to what fails.

The secret starts with `whsec_` and is shown once, when the Webhook is made or its secret replaced. Keep it where the receiver can read it, never in the recipe's file. For 24 hours after a replacement both secrets sign: the signature header then holds two values, new first, separated by a comma, so you can switch without a gap. Check against both until the old one is gone.

[`signing-example.json`](../automations/fixtures/signing-example.json) has a secret, a timestamp, a body and the headers they give, to test your code against.

### Node

```js
// ziffr-test: verify
const { createHmac, timingSafeEqual } = require("node:crypto");

// secrets: your current secret, and the old one while a replacement overlaps.
// headers: lower-case names. rawBody: the body as a string, exactly as received.
function verify(secrets, headers, rawBody, nowSeconds = Math.floor(Date.now() / 1000)) {
  const timestamp = headers["x-ziffr-timestamp"];
  const header = headers["x-ziffr-signature"];
  if (!/^\d{1,12}$/.test(timestamp || "") || !header) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const given = header.split(",").map((h) => h.trim()).filter((h) => /^sha256=[0-9a-f]{64}$/.test(h));
  let ok = false;
  for (const secret of secrets) {
    const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(timestamp + "." + rawBody).digest("hex"));
    for (const g of given) if (timingSafeEqual(Buffer.from(g), expected)) ok = true;
  }
  return ok;
}

module.exports = { verify };
```

In n8n, switch the Webhook node's **Raw Body** option on, take the body from the binary data, and call a function like this in a Code node. A Code node may only `require` modules your n8n allows (`NODE_FUNCTION_ALLOW_BUILTIN=crypto`).

### Python

```python
# ziffr-test: verify
import hashlib, hmac, re, time

def verify(secrets, headers, raw_body, now=None):
    """secrets: current secret and the old one during a replacement. headers: lower-case names. raw_body: str as received."""
    now = time.time() if now is None else now
    timestamp = headers.get("x-ziffr-timestamp", "")
    header = headers.get("x-ziffr-signature", "")
    if not re.fullmatch(r"\d{1,12}", timestamp) or not header:
        return False
    if abs(now - int(timestamp)) > 300:
        return False
    given = [h.strip() for h in header.split(",") if re.fullmatch(r"sha256=[0-9a-f]{64}", h.strip())]
    ok = False
    for secret in secrets:
        mac = hmac.new(secret.encode(), f"{timestamp}.{raw_body}".encode(), hashlib.sha256).hexdigest()
        for g in given:
            if hmac.compare_digest(g, "sha256=" + mac):
                ok = True
    return ok
```

Both snippets are run by a test in this repository against the signing example, so they work as printed.

## Answering, retries and doing nothing twice

Answer with any `2xx` within **10 seconds**, and do the slow work afterwards. Ziffr does not follow redirects, and only sends to `https` addresses that are public. A self-hoster may let named hosts inside their own network through (`ZIFFR_WEBHOOK_PRIVATE_HOSTS`, in the [self-hosting guide](self-hosting.md)).

| Your answer | What Ziffr does |
|---|---|
| `2xx` | Done. |
| Network error, timeout, `408`, `429`, `5xx` | Tries again after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, then the send has failed. A `Retry-After` of up to an hour is honoured. |
| `410 Gone` | Switches the Webhook off. |
| Any other `4xx` | The send fails at once, with no retry. |

A Webhook that fails 20 sends in a row, or has had no success for three days, is switched off, and every Owner gets an email. Turning it on again resends nothing. The Webhook's page keeps a log of the last 14 days (the event, what it was about, the answer's status and the number of tries, never a body), and a failed send has **Send again**.

At least once is the promise, in no particular order. So:

- **Dedupe on the message `id` in the signed body** (`X-Ziffr-Delivery` carries the same value, but only the body is signed). Keep the ids you have handled for a day and skip a repeat.
- **Apply the newest.** Compare `updated_at` with the last one you saw for that `ref` and ignore what is older.
- **Check before you change.** Closing an external task that is closed is a no-op; creating one that exists is a lookup. Find the task by `external_ids`, and for a first event by the `ref` in its notes.
- **Ignore your own echo:** an event whose `source.webhook_id` is this Webhook's own id.

A Task given to someone who also gets it in Slack is one Action: an answer in Slack sends `action.done` with `source.type: "slack"` to your Webhook, so your recipe closes the external task.

## Status back into Ziffr

A recipe reports to one address:

```
POST https://<your Ziffr>/api/webhooks/<webhook id>/in
```

The id is in the Webhook's page. The body is JSON of at most 16 KB, signed **exactly as the messages you get**: `X-Ziffr-Timestamp` and `X-Ziffr-Signature: sha256=<hex>` over `<timestamp>.<raw body>` with the Webhook's secret. A request is taken once, by its timestamp and body, and the signature header must be exactly one `sha256=<64 lowercase hex>` entry (two, comma-separated without spaces, during a secret overlap): to try again, sign again with a new timestamp. Anything unknown, unsigned, old, replayed or switched off answers `404` alike, so the answer says nothing about whether the id exists.

In Node, signing is one line:

```js skip="a fragment: secret and body come from the receiving code"
const { createHmac } = require("node:crypto");
const timestamp = Math.floor(Date.now() / 1000);
const signature = "sha256=" + createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
```

The request acts **as the Webhook**, not as a person (a Personal Webhook acts as its person: see [Personal Webhooks](#personal-webhooks)), and only on Actions that were sent to it. It reads nothing. In Ziffr the change shows "via" the Webhook's name, and the Audit Log names the Webhook.

| `op` | Body | What it does |
|---|---|---|
| `link` | `{ "op": "link", "ref": "ZIF-12", "system": "microsoft-todo", "external_id": "…", "url": "https://…" }` | Says "this Action is that external task". `system` is a short label you choose (letters, digits and dashes, at most 40), `external_id` at most 200 characters, `url` optional and `https`. An Action holds up to 10 links, one per system. Every later event to this Webhook carries them in `external_ids`. Do it right after you create the external task. |
| `done` | `{ "op": "done", "ref": "ZIF-12" }` | Marks a **Task** done. A Question is answered, not marked done. |
| `reopen` | `{ "op": "reopen", "ref": "ZIF-12" }` | Reopens a Task that was marked done, when the person un-ticks it. Not a Question, and not a Task Ziffr closed itself. |
| `reply` | `{ "op": "reply", "ref": "ZIF-12", "text": "…" }` | Adds a message to the Thread. Up to 1,000 characters. |
| `answer` | `{ "op": "answer", "ref": "ZIF-12", "text": "…" }` | Answers a **Question**. |

Name the Action by `ref`, or, once linked, by `"system"` and `"external_id"` instead. The text of `reply` and `answer` is untrusted: it is only ever shown, never read as a command, a value or a Correction.

Every call that is understood answers `200` with the result, so any call may be repeated:

```json
{ "changed": true, "status": "answered" }
```

`changed: false` means the Action was already in that state, and counts as success. **The first change wins**: a Task done in Slack and then in To Do stays as the first made it.

| Status | Meaning |
|---|---|
| `400` | The body is not JSON, or a field is missing or wrong (`message` says which). |
| `404` | Unknown, unsigned, old, replayed or switched off; or the Action was never sent to this Webhook and never linked by it. |
| `409` | Ziffr's rules do not allow it: a Question marked done, a Task Ziffr closed reopened, an Approval or Self-check, an external task already linked to another Action, too many links. |
| `413` | Over 16 KB. |
| `429` | More than 60 signed requests in a minute, or too many failed requests from your address (see Limits). Wait for `Retry-After`. |

## Personal Webhooks

A **Personal Webhook** is a Webhook that one person adds for themselves, under **You → Your Webhooks**, once an Owner or Admin has switched on **People may add their own Webhooks** on **Settings → Webhooks** ([spec 0037](../specs/0037-personal-webhooks.md)). Everything above applies to it, the signing, the secret, the retries, the log and the status back, except what it hears and who it acts as. The person who adds it is covered in the [user guide](../user-guide/17-your-settings.md#your-webhooks); this section is for the program that receives.

**What it hears.** A Personal Webhook acts as its person. When a message is about to go out, Ziffr asks, with the same rules that decide what that person sees in the app, whether they may see it now: their role, Shares, Groups and Thread limits as they are at that moment, not as they were when the thing happened. If they may, the message is sent **in full**; if not, it is **not sent**, and nothing in the log hints at it. There is no redacted form, so `data.redacted` never appears. Which events:

| Event | What it hears |
|---|---|
| `action.created`, `action.updated`, `action.answered`, `action.done` | Actions given to the person or asked by them, not every Action they could see; and only if they may read its Thread. |
| `value.recorded`, `value.unusual` | The Metrics the person picked, up to 50, each one they see (not archived, not Derived). On `value.unusual` the number is there only where the person may see a value waiting for Approval: the Metric's Owner, an Approver, the one who submitted it. Others get the message without it. |
| `alert.fired` | The person's own Alerts that name this Webhook (below). |
| `ping` | The test button. |

None is chosen by default. A picked Metric the person has lost sight of is skipped, and the page says so.

**The full message** has every field described under [What you get](#what-you-get) and nothing else: no Breakdowns, Contacts, dashboards, Share lists or older Thread messages. Of people, a message names the assignee and the asker, and carries an email address only when it is the person's own: a Personal Webhook is not a way to collect teammates' addresses, so `assignee.email` can be `null` on a Task the person asked of someone else.

**Alerts.** An Alert's form has **Also send to** with the person's Personal Webhooks (up to 3 per Alert; none ticked at first). The Alert still tells the person as usual; a ticked Webhook also gets `alert.fired` with `metric`, `period`, `value`, `target`, the condition and a link, once each time the Alert fires. It is judged again when it is sent: if the person lost sight of the Metric, the Alert is paused or no longer names the Webhook, the Webhook is off or gone, or the value no longer meets the condition, nothing is sent. Only the person can tick a Webhook on their Alert: an Access Key, an API call or an assistant cannot. A Workspace Webhook never gets an Alert.

**Status back as the person.** `POST /api/webhooks/<id>/in` takes a Personal Webhook's signed requests, with the same body, signature, replay claim and answers. It acts **as the person**, for Actions sent to this Webhook that the person can still see: `link`, `done`, `reply`, `answer` and `reopen`. `done`, `reopen` and `answer` only for Actions given to the person; `reply` also for one they asked. The Thread says "Marked done in <Webhook name>" and the change is the person's. It can never approve or send back a value, share, invite or change a setting. The switch, the person's role and their sight are checked at every request; a request that fails any of them answers the same `404` as an unknown id.

**Limits.** 3 Personal Webhooks per person per Workspace (they do not count against the Workspace's 5); 1,000 sends per person per day, and every send also counts against the Workspace's 10,000 a day. The address rules are the Workspace Webhooks': https only, no private, loopback or link-local address, no redirect. The operator's `ZIFFR_WEBHOOK_PRIVATE_HOSTS` applies to Personal Webhooks too, except in a trial.

**When it stops.** Turning the Workspace's switch off pauses every Personal Webhook: events in that time are dropped, not queued, and each person's page says why; turning it on again resumes them. A Personal Webhook ends, with its queue and log, when its person leaves the Workspace, becomes a Guest or Contact, or deletes their account. An Owner or Admin can remove one (the person is told who did), and sees whose it is, its masked address, events, state and the log's statuses and times, never the messages. After a run of failed sends it switches itself off and tells its person.

**Trials.** A Trial Workspace may add Webhooks of both kinds, 2 in all and 200 sends a day, to public addresses only. The operator can switch that off (see Limits).

**What leaves** is the same as for any Webhook: clear text over TLS, not end-to-end, kept by the receiving system as it sees fit. The person answers for where their data goes there.

## Limits

| | |
|---|---|
| Webhooks per Workspace | 5 |
| Message size | 16 KB |
| Sends per Workspace per day | 10,000; past that they wait for tomorrow and the page says so |
| Log | 14 days |
| Answer within | 10 seconds |
| Requests back | 60 a minute per Webhook, 16 KB each |
| Failed requests, before the secret is opened | 20 a minute per Webhook and network address (an IPv6 sender counts by its /56) or 100 a minute to all Webhooks together, then 429; past 600 a minute for the Webhook as a whole only known senders pass, plus up to 60 new addresses a minute that have not failed (an address whose valid signed request was taken in the last day, 16 per Webhook, remembered by the Ziffr process that saw it). A known sender whose address keeps failing against that Webhook (counted since its last success) is refused too, and an address with 200 failures a minute to one Webhook is refused whatever its successes, but failures by others behind the same address against other Webhooks do not revoke it. A sender that is neither known nor lucky in the new-address budget waits until a flood eases. Signed requests are never counted by it, and made-up Webhook ids count only against their sender's address. A gate in memory, per Ziffr process |
| Links per Action | 10 |
| Secret overlap after a replacement | 24 hours |

Self-hosting: the gate counts per network address only when `ZIFFR_PROXY_HOPS` is set. Without it no sender can be known or admitted as new, so a flood of failed requests past 600 a minute locks out the real sender until it stops.

Webhooks are available at every Size. The demo has none. A trial may have 2 and send 200 a day, to public addresses only (the operator's `ZIFFR_WEBHOOK_PRIVATE_HOSTS` never applies to a trial); the operator can switch Webhooks off for trials with `ZIFFR_TRIAL_WEBHOOKS=false` or **Installation settings → Trials → Webhooks in trials** (spec 0037).

## Templates

Ready-made n8n workflows, both directions, are in [`docs/automations/`](../automations/): [Microsoft To Do](../automations/microsoft-todo.md), [Google Tasks](../automations/google-tasks.md), [Planner](../automations/planner.md), [Asana](../automations/asana.md), [Todoist](../automations/todoist.md) and [Slack](../automations/slack.md). A Webhook is sent every Action of the Workspace, so the task-list workflows take only the Tasks of the person whose address you put in their `assigneeEmail` setting. Import them, fill in the Settings node and they do what this guide describes: verify, dedupe, link and report back. Ziffr does not support the other system.

## Trying it

Add a Webhook on **Workspace → Webhooks** with your address, choose events and use **Send test event**: it sends a `ping`, signed like the rest, and the log shows the answer. To test a receiver without Ziffr, post a fixture with the headers from `signing-example.json`.
