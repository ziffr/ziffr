# Connect any system to Ziffr

A guide for the person who connects things: a CRM, a shop, a database, a help desk, a spreadsheet, a script. Ziffr does not need a connector of its own for each. **Anything that can make one web call can send numbers to Ziffr**, through a [Feed](feeds.md).

Ziffr never calls your system, never holds its password and never runs your code. Your system, or a tool between the two, sends the numbers to Ziffr.

| Your system | Use |
|---|---|
| has a ready [Automation Template](../automations/README.md) (spreadsheets, billing, CRMs, warehouses) | [n8n](#n8n), with **Fill from n8n** |
| can be read by a workflow tool you have | [n8n](#n8n), [Zapier](#zapier), [Make](#make) or [Power Automate](#power-automate) |
| is a database or has an API, and you can run a script | [a scheduled script](#a-scheduled-script-cron) |
| can only send webhooks | [one step in between](#a-system-that-only-sends-webhooks) |

## Before you start

You need to be an Owner or Admin.

1. Make the Metrics, or pick ones you have. Each has a **slug**, the last part of its address, such as `pipeline-value`.
2. **Settings → Feeds**: make a Feed named after the system ("CRM"), and a **Feed Key** with an end date within a year. Copy the key. It is shown once.
3. On each Metric, open **Who submits** and add the Feed. This also turns on the Metric's API Source ("API and Feeds").

A Feed Key can record values for its Feed's Metrics and see which periods have one. It cannot read a value, see a person or touch another Metric. Use it rather than your own Access Key: it keeps working when you leave. Keep it in the tool's store for secrets, never in an address, a web page or a file you share.

Your Ziffr must be reachable from where the call is made: a cloud tool cannot reach a Ziffr on your private network.

## The one call

`POST /api/v1/feed/observations`, with your key and a list of values. Replace `https://your-ziffr.example` with your Ziffr's address:

```sh run
curl -X POST https://your-ziffr.example/api/v1/feed/observations \
  -H "Authorization: Bearer $ZIFFR_FEED_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: crm-first-try" \
  -d '{ "items": [{ "metric": "pipeline-value", "value": 125000 }] }'
```

Ziffr answers with one result for each item, in the order you sent them:

```json
{ "results": [{ "metric": "pipeline-value", "period": "2026-11-23", "status": "recorded", "imported": false, "detail": "Recorded." }] }
```

What an item takes, and nothing else:

| Field | Needed | What |
|---|---|---|
| `metric` | yes | The Metric's slug. |
| `value` | yes | A JSON number: `125000` or `-3.5`. Not `"125000"`, not `125.000,00`, no unit or sign. |
| `period` | no | The first day of the period, `YYYY-MM-DD`. Left out: the current period. |
| `breakdown` | no | The value's parts: `[{ "label": "North", "value": 70000 }]`. |

The body is `{ "items": [ … ] }` with 1 to 500 items. A field Ziffr does not know, anywhere, refuses the whole call.

**Look at `status`, not only at the HTTP code.** The call answers 200 also when an item was not taken:

| `status` | Meaning |
|---|---|
| `recorded` | The value is in. |
| `awaiting_approval` | It is in and waits for a person to approve it. Do not send it again. |
| `locked` | The period is closed. The value went to the Metric's owner as a proposed Correction. |
| `refused` | Not taken. `code` and `detail` say why; the other items were handled all the same. |

## Which period a value goes to

- Without `period`, the value is for the running period. With it, send the period's first day: a week's Monday, `2026-11-01` for a month, and for quarters and years the day your Workspace's year makes them start.
- A day that does not start a period of that Metric, or lies in the future, is refused.
- A value for a **past period that has none** is an [Import](../../GLOSSARY.md): it is recorded without the Unusual Value check. Under a Workflow that approves every value, one for the period the Workflow is closing, or a later one, still waits for approval.
- A value for a period that **has one** follows the Metric's **Submission Rule**: it may replace it, add to it, stand beside it or be refused. For a number your system keeps current, choose "overwrite".

## Ask which periods are filled

Before you send past periods, ask. `GET /api/v1/feed` lists the Metrics of your Feed and, for each, the periods that already have a value. It never shows a value.

```sh run
curl "https://your-ziffr.example/api/v1/feed?limit=100" \
  -H "Authorization: Bearer $ZIFFR_FEED_KEY"
```

```json
{
  "name": "CRM",
  "year_start_month": 1,
  "metrics": {
    "items": [{ "slug": "pipeline-value", "name": "Pipeline value", "period": "week", "unit": "€", "format": "currency", "decimals": 0, "current": "2026-11-23", "due_working_days": 2, "filled": ["2026-11-09", "2026-11-16"] }],
    "next": null
  }
}
```

- `current` is the running period as Ziffr counts it, on its server's clock (normally UTC). Use it rather than your own.
- `filled` holds at most the latest 1,000 periods. A period with a value that waits for approval counts as filled.
- `limit` is 1 to 100 (50 if left out). When `next` is not null, ask again with `&cursor=` and that value.
- A Metric that is missing here does not have the Feed under **Who submits**, has its API Source off, or is calculated.

A sender that never overwrites history sends a past period only when it is not in `filled`.

## Sending the same thing twice

Networks fail, and tools retry. Send an `Idempotency-Key` header (1 to 200 visible ASCII characters, no spaces) that names this delivery, such as `crm-2026-11-23`.

| You send, within 24 hours | Ziffr does |
|---|---|
| the same key with the same items | Answers as the first time, with the header `Idempotent-Replayed: true`, and records nothing. |
| the same key with other items | 409 `conflict`. Use a new key for new numbers. |
| the same key while the first call still runs | 409 `conflict`. Wait. |
| the same key after a 429 or 500 | Handles it as new. |

The stored answer includes refused items. After you fix what refused them, use a new key. Without a key, or after 24 hours, a repeat is a new value, and the Submission Rule applies again: under "add up" it counts twice.

## Errors

A refused call is `{ "error": { "code": "…", "message": "…" } }`; nothing in it was recorded.

| HTTP | Usual cause |
|---|---|
| 400 | Not JSON, no `Content-Type: application/json`, a field of the wrong shape (the message names it), or a body over 1 MB. |
| 401 | No `Authorization: Bearer …` header, or the key is wrong, ended or revoked. A key in the address is not read. |
| 403 | Your own Access Key instead of a Feed Key. |
| 409 | An `Idempotency-Key` used again with other items, or still running. |
| 429 | Too many calls or values, or another batch still runs. Wait for the seconds in `Retry-After`. |
| 500 | A fault in Ziffr. Send again with the same `Idempotency-Key`. |

Every code, also for refused items, is in the Feeds guide under [When something goes wrong](feeds.md#when-something-goes-wrong).

## Limits

For each Feed, over all its keys:

- About **60 calls a minute**, `GET` and `POST` together.
- **10,000 values in 24 hours**. Refused items count too; a batch that would pass the limit is refused whole.
- **500 items** and **1 MB** in one call, and one `POST` at a time.

Whoever runs your Ziffr can change the first two. Send many numbers in one call rather than one call each.

## n8n

- **A ready template.** On a Metric, under **Who submits**, choose **Fill from n8n**: you get a workflow with your Ziffr's address in it, for the systems under [Automation Templates](../automations/README.md).
- **Your own workflow.** Read your system with its n8n node, then add an **HTTP Request** node: method `POST`, URL `…/api/v1/feed/observations`, authentication **Header Auth** (name `Authorization`, value `Bearer ` and your key), a header `Idempotency-Key`, and a JSON body. [`n8n-feed-workflow.json`](n8n-feed-workflow.json) is a small one to start from.
- Add a check after it that fails the run when a result says `refused`, so you hear of it.

## Zapier

After the step that gets your number, add **Webhooks by Zapier** with the event **Custom Request** (Zapier does not offer this app on its free plan):

- Method `POST`, URL `https://your-ziffr.example/api/v1/feed/observations`.
- Headers: `Authorization` = `Bearer zk_…`, `Content-Type` = `application/json`.
- Data: `{ "items": [{ "metric": "pipeline-value", "value": 125000 }] }`. Put your field where the number stands, **without quotes**. It must be a plain number: no thousands separator, no currency sign.

Zapier sends the Data exactly as typed. Test the step and read the answer.

## Make

After the module that gets your number, add the **HTTP** app's **Make a request**:

- URL `https://your-ziffr.example/api/v1/feed/observations`, method `POST`.
- Authentication: your key as an **API key** sent in a header named `Authorization`, with the value `Bearer zk_…`.
- Body content type **application/JSON**, body input method **JSON string**, with the body shown above. Map the number without quotes.
- **Parse response** yes, and **Return error if HTTP request fails** yes. A refused item is not an HTTP failure: add a filter or router on `results[].status`.

## Power Automate

After the action that gets your number, add the **HTTP** action (it usually needs a premium licence: check yours):

- Method `POST`, URI `https://your-ziffr.example/api/v1/feed/observations`.
- Headers: `Authorization` = `Bearer zk_…`, `Content-Type` = `application/json`.
- Body: the JSON above, with your number inserted without quotes.
- In the action's settings, turn on **Secure inputs**, so the key is not shown in the run history.

Then check each result's `status` in a condition.

## A scheduled script (cron)

Any computer that can run a script on a timer will do. Put the header in a file only the script's user can read, so the key shows neither in the script nor in the list of processes:

```sh skip="needs a key file and your own system"
# once: umask 077 && echo "Authorization: Bearer zk_..." > /etc/ziffr/header
```

```sh skip="needs a key file and your own system"
#!/bin/sh
set -eu
value=$(/opt/crm/open-pipeline-total)   # your own command: prints one plain number
today=$(date -u +%Y-%m-%d)
answer=$(curl --silent --show-error --fail-with-body --retry 3 \
  -X POST https://your-ziffr.example/api/v1/feed/observations \
  -H @/etc/ziffr/header -H "Content-Type: application/json" \
  -H "Idempotency-Key: pipeline-$today-$value" \
  -d "{ \"items\": [{ \"metric\": \"pipeline-value\", \"value\": $value }] }")
echo "$answer"
# A 200 can still hold a value that was not taken.
case $answer in *'"status":"refused"'*|*'"status":"locked"'*) exit 1 ;; esac
```

```text
30 6 * * *  /opt/ziffr/send-pipeline.sh >> /var/log/ziffr-pipeline.log 2>&1
```

The script needs curl 7.76 or later. It sends the running period, so each run replaces the last value under "overwrite". For a database, the [SQL Feed](../../packages/feed-sql/README.md) does all of this from one query a Metric, and [`@ziffr/feed-kit`](../../packages/feed-kit/README.md) does it for a TypeScript program, including asking which periods are filled.

## A system that only sends webhooks

Many systems can tell another address that something happened. **Most cannot post that straight to Ziffr**, because Ziffr takes only:

- your Feed Key in the header `Authorization: Bearer …` (never in the address),
- `Content-Type: application/json`,
- and exactly the body `{ "items": [{ "metric": …, "value": … }] }`. A system's own record, with its own field names, is refused with 400.

If your system lets you set both headers and write the whole body yourself, it can call Ziffr directly. If not, put **one step in between** that receives its message and makes the call above. (Ziffr's [Webhooks](webhooks.md) are the other direction. The address they report back to takes the status of a Task, never a value.)

**Decide what to send first.** A webhook announces an event; Ziffr keeps a number for a period.

- **Better:** let the webhook only start the step, which asks your system for the current total and sends that, to a Metric with the rule "overwrite". A lost or repeated message then does no harm.
- **Counting events:** send `1` for each, to a Metric with the rule "add up", with an `Idempotency-Key` made from the event's id. A repeat within 24 hours is not counted again; a later one is, and a message that never arrives is never counted.

**With n8n**, import [`n8n-webhook-workflow.json`](n8n-webhook-workflow.json) and set it up as the [Feeds guide](feeds.md#a-webhook-that-other-systems-call) says. As it comes, it takes `{ "metric": …, "value": … }` and wants a secret in the header `X-Webhook-Secret`. For your system's own message, change the node **Check and shape**: replace the line that begins `const raw =` with your translation, for example one that counts won deals:

```js skip="a line of an n8n Code node; the field names are your system's"
const raw = body.deal?.status === 'won' ? [{ metric: 'deals-won', value: 1 }] : [];
```

An event that does not count then gets the answer "Send 1 to 500 items." and sends nothing; add an **If** node before it if your system treats that as a failure. To count each event once, also replace the line that begins `const idem =` with `const idem = 'deal-' + String(body.deal?.id ?? '');`. If your system cannot send the secret header, use another proof it can give, such as its signature, checked in n8n; an address nobody knows is weak protection, and whoever knows it can send values.

**With Zapier, Make or Power Automate** the shape is the same: a trigger that receives a webhook (Zapier: **Webhooks by Zapier**, **Catch Hook**; Make: **Webhooks**, **Custom webhook**; Power Automate: **When an HTTP request is received**), then the call from its section above.

## Check that it works

- **Settings → Feeds** shows each Feed's keys and their recent calls, when it last called, and how many values were recorded and refused in the last 24 hours.
- The Metric's history shows the value under the Feed's name.
- Give the Metric's Workflow an **Escalation** step. Nobody asks a Feed for a value, so this is how the owner hears that your system stopped sending.

## More

[Feeds](feeds.md) · [API reference](../reference/api.md) · [API guide](api.md) for a person's own Access Key, one value at a time · [Fill from a data warehouse](../user-guide/10-metrics.md#fill-from-a-data-warehouse) · [Paste values from a spreadsheet](../user-guide/10-metrics.md#paste-values-from-a-spreadsheet), for history.
