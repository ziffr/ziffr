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
| `external_ids` | The external tasks **this** Webhook linked to the Action (see [`link`](#link)): `system`, `external_id` and `url`. Use them to find the task to update or close. Never another Webhook's. |

Metric and value events carry `metric` (`id`, `name`), `period` and `link`; `value.recorded` adds `value` and `target` as text (`target` may be `null`).

### Redacted messages

A Webhook is not a person. It hears what every Member of the Workspace may see, and other things reach it with their words left out:

- A value event for a Metric that is not shared with Everyone is not sent at all, and nothing in the log hints at it.
- An Action event for such a Metric, or for a Thread limited to a Group, is sent **redacted**: `ref`, `kind`, `status`, `due`, `assignee`, `link`, `updated_at`, `source`, `external_ids`, `reason` when done, and `"redacted": true`. No title, Metric, asker or reply. The assignee's own list can still say "A Ziffr task for you, due Friday, open it here".

Check `data.redacted` before reading `title`. The decision is made when the message is sent, not when the thing happened.

### What is never sent

Breakdowns, Contacts, dashboards, Share lists, the names of people other than the assignee and (in a full message) the asker, the Thread's older messages, and the value of an Unusual Value. Personal Alerts never go to a Webhook. A change that came in from a Webhook is not sent back to that Webhook.

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

The id is in the Webhook's page. The body is JSON of at most 16 KB, signed **exactly as the messages you get**: `X-Ziffr-Timestamp` and `X-Ziffr-Signature: sha256=<hex>` over `<timestamp>.<raw body>` with the Webhook's secret. A request is taken once, by its signature: to try again, sign again with a new timestamp. Anything unknown, unsigned, old, replayed or switched off answers `404` alike, so the answer says nothing about whether the id exists.

In Node, signing is one line:

```js
const { createHmac } = require("node:crypto");
const timestamp = Math.floor(Date.now() / 1000);
const signature = "sha256=" + createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
```

The request acts **as the Webhook**, not as a person, and only on Actions that were sent to it. It reads nothing. In Ziffr the change shows "via" the Webhook's name, and the Audit Log names the Webhook.

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
| `404` | Unknown, unsigned, old, replayed or switched off; or the Action was never sent to this Webhook. |
| `409` | Ziffr's rules do not allow it: a Question marked done, a Task Ziffr closed reopened, an Approval or Self-check, an external task already linked to another Action, too many links. |
| `413` | Over 16 KB. |
| `429` | More than 60 requests in a minute. Wait for `Retry-After`. |

## Limits

| | |
|---|---|
| Webhooks per Workspace | 5 |
| Message size | 16 KB |
| Sends per Workspace per day | 10,000; past that they wait for tomorrow and the page says so |
| Log | 14 days |
| Answer within | 10 seconds |
| Requests back | 60 a minute per Webhook, 16 KB each |
| Links per Action | 10 |
| Secret overlap after a replacement | 24 hours |

Webhooks are available on Free and every paid Size. The demo and a trial have none, since they would send a Workspace's data to an address outside Ziffr.

## Templates

Ready-made n8n workflows, both directions, are in [`docs/automations/`](../automations/): [Microsoft To Do](../automations/microsoft-todo.md) and [Google Tasks](../automations/google-tasks.md). Import them, fill in the Settings node and they do what this guide describes: verify, dedupe, link and report back. Ziffr does not support the other system.

## Trying it

Add a Webhook on **Workspace → Webhooks** with your address, choose events and use **Send test event**: it sends a `ping`, signed like the rest, and the log shows the answer. To test a receiver without Ziffr, post a fixture with the headers from `signing-example.json`.
