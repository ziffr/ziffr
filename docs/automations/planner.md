# Planner (Automation Template)

Two n8n workflows that keep Planner in step with the Tasks given in Ziffr. They are an [Automation Template](../../GLOSSARY.md): files in this repository that you import into your own n8n. Ziffr never runs them and never holds your Planner account. Ziffr does not support Planner; if Planner changes something and a template breaks, it is fixed by a pull request. The messages and the endpoint they use are in the [Webhooks guide](../guides/webhooks.md).

**Tried against a real n8n and Planner:** not yet — owner to try.

| File | Direction | What it does |
|---|---|---|
| [`planner-from-ziffr.json`](planner-from-ziffr.json) | Ziffr to Planner | A Task given to someone becomes a task; changes to its text or due date follow; a Task done in Ziffr is ticked off. |
| [`planner-to-ziffr.json`](planner-to-ziffr.json) | Planner to Ziffr | Completing a task (100 %) marks the Task done, setting it back reopens the Task, and a line `Reply: …` after the line `--- end of Ziffr text ---` in the task's notes becomes a message in the Thread. |

Import one or both: each works alone, but without the first, tasks have no ref in their notes (the task's description) and the second has nothing to report.

## Set up

1. In Ziffr, **Workspace → Webhooks**: add a Webhook with the events `action.created`, `action.updated` and `action.done`. Copy its **id** and its **secret** (shown once). The address comes in step 5.
2. In n8n, import both files (**Workflows → Import from file**).
3. In each workflow open the **Settings** node and fill in your Ziffr address, the Webhook's id and secret, and the id of the plan and of the bucket new tasks go into (Microsoft Graph: `GET /me/planner/plans`, `GET /planner/plans/{id}/buckets`).
4. Add a credential **OAuth2 API** in n8n for Microsoft Graph (the Microsoft identity platform, scope `https://graph.microsoft.com/Tasks.ReadWrite offline_access`) and choose it in the HTTP Request nodes.
5. In *Ziffr to Planner*, replace the Webhook path with a long random string, activate the workflow, and put its **production URL** into the Webhook in Ziffr. Use **Send test event**: the log shows `200`.
6. Activate *Planner to Ziffr*.

The secret sits in the Settings node of your n8n, so only people who may edit workflows there can read it. On a self-hosted n8n the Code nodes need `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.

## What the workflows do

Ziffr to Planner: the Webhook node keeps the **raw body**; a Code node checks the signature and the five-minute window, drops a delivery it has handled (the message `id` in the signed body, one day; the `X-Ziffr-Delivery` header carries the same value but is not signed), an event older than the last it saw for that ref (`updated_at`), and an event this Webhook reported itself (`source.webhook_id`). It then answers `200` at once, so Ziffr does not wait for Planner. A Planner task keeps its text in a separate *details* object, so a new task takes three calls (create, read the details, write the notes) and an update reads the task first for the `If-Match` value Planner demands. The ref leads the title, `[ZIF-12] Send the report`, and also the first line of the notes; a task is read only when **both** name the same ref. A first event looks the plan up for a task with exactly the title it would write before creating one.

Planner to Ziffr: every five minutes the plan is read, and for each task with a ref the workflow compares its state with what Ziffr was last told, and signs and sends `done`, `reopen` or `reply`. An answer of `200` (even `changed: false`) or `409` is written down, so it is not sent again; anything else is tried again next time.

## Limits

- **Tasks only.** A Question is ignored: it is answered in Ziffr. A redacted message (a Metric not shared with Everyone) becomes a task titled "A Ziffr task for you (ZIF-12)" with a link, and nothing else.
- **One plan.** Tasks land in the one plan you chose, in the account of the credential; the workflow does not look up the assignee. For several people, import the pair once per person.
- **Five minutes** until a change in Planner reaches Ziffr (Planner is read, not pushed). The workflow looks at the plan's tasks whose title starts with a ref, the newest 40.
- **Replies are one line.** Below the line `--- end of Ziffr text ---` that the workflow writes, `Reply:` followed by text in the notes (the task's description), up to 1,000 characters; a changed line is sent again as a new message.
- **Memory is n8n's static data**, which holds only while the workflow is active. The worst case after losing it is a `done` sent twice, which Ziffr takes as `changed: false`.
- **Ziffr allows 60 requests a minute** per Webhook; a run sends at most 30.
- Editing the title or the due date in Planner does not change it in Ziffr. Ziffr's rules win: a Task Ziffr closed itself cannot be reopened from here, and the answer `409` is written down.
- **Notes (the task's description) are written safely.** Every value Ziffr sends has line breaks and other control characters stripped before it goes into the notes (the task's description), and only a `Reply:` line **after** the closing marker line is read, so no name can forge a reply.
- **A task speaks only for its own Action.** Ticks and replies name the Action by the task's id (the link made when it was created), never by a ref written in a task, so someone who can edit the plan cannot act on other Actions by typing a ref.
- **The secret is in n8n's saved runs.** The Settings node's output is stored with each execution. In the workflow's settings, set **Save successful production executions** to *Do not save* (and failed ones too, if you can spare them), and keep who may open executions small.
- If Planner changes its API and a template breaks, it is fixed by a pull request; Ziffr does not support Planner.
- **Not assigned.** A new task lands in the bucket unassigned; Planner needs a person's directory id for that, which the workflow does not look up.
- **Titles carry the ref.** `[ZIF-12]` at the start of the title is how the workflow finds its tasks again; keep it when you rename a task.
- **A plan, not a list.** A Planner task needs a plan and a bucket, so it is not "my list" as in To Do: everyone in the plan sees it.
- **Everyone in the plan speaks for the assignee.** The workflow cannot tell who in Planner ticked a task or wrote a `Reply:` line, so anyone who can edit the plan can mark a Task done or add a Thread message as the person it was given to, shown in Ziffr as "via" the Webhook. Use a plan that only that person (and people you trust) can edit.
- **An existing task is taken as the workflow's own only if it holds exactly what the workflow would have written** (the same notes, in Planner the same title); a task someone else made with a ref in it is not. A first event's retry therefore finds its task, and a task whose text changed in the meantime (a renamed Metric, an added `Reply:` line) may be created a second time.
- **A step that fails after Ziffr was answered is not tried again.** The workflow answers `200` first so Ziffr does not wait for Planner; if Planner then refuses (a busy moment, a concurrent edit), that change is lost, and the next change to the Task brings the task up to date.
- Ids from Ziffr are checked for their shape before they go into a request address.
