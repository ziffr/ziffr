# Microsoft To Do (Automation Template)

Two n8n workflows that keep Microsoft To Do in step with the Tasks given in Ziffr. They are an [Automation Template](../../GLOSSARY.md): files in this repository that you import into your own n8n. Ziffr never runs them and never holds your Microsoft account. Ziffr does not support Microsoft To Do; if Microsoft changes something and a template breaks, it is fixed by a pull request. The messages and the endpoint they use are in the [Webhooks guide](../guides/webhooks.md).

**Tried against a real n8n and Microsoft To Do:** not yet — owner to try.

| File | Direction | What it does |
|---|---|---|
| [`microsoft-todo-from-ziffr.json`](microsoft-todo-from-ziffr.json) | Ziffr to To Do | A Task given to someone becomes a To Do task; changes to its text, due date or state follow; a Task done in Ziffr is ticked off. |
| [`microsoft-todo-to-ziffr.json`](microsoft-todo-to-ziffr.json) | To Do to Ziffr | Ticking a task marks the Task done, un-ticking reopens it, and a line `Reply: …` after the line `--- end of Ziffr text ---` in the notes becomes a message in the Thread. |

Import one or both: each works alone, but without the first, tasks have no ref in their notes and the second has nothing to report.

## Set up

1. In Ziffr, **Workspace → Webhooks**: add a Webhook with the events `action.created`, `action.updated` and `action.done`. Copy its **id** and its **secret** (shown once). The address comes in step 4.
2. In n8n, import both files (**Workflows → Import from file**).
3. In each workflow open the **Settings** node and fill in your Ziffr address, the Webhook's id and secret, and the id of the To Do list (Microsoft Graph, `GET /me/todo/lists`, the `id` of the list).
4. Add the credential **Microsoft To Do OAuth2 API** in n8n and choose it in the HTTP Request nodes (*List tasks*, *Create task*, *Update task*).
5. In *Ziffr to Microsoft To Do*, replace the Webhook path with a long random string, activate the workflow, and put its **production URL** into the Webhook in Ziffr. Use **Send test event**: the log shows `200`.
6. Activate *Microsoft To Do to Ziffr*.

The secret sits in the Settings node of your n8n, so only people who may edit workflows there can read it. On a self-hosted n8n the Code nodes need `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.

## What the workflows do

Ziffr to To Do: the Webhook node keeps the **raw body**; a Code node checks the signature and the five-minute window, drops a delivery it has handled (`X-Ziffr-Delivery`, one day), an event older than the last it saw for that ref (`updated_at`), and an event this Webhook reported itself (`source.webhook_id`). It then answers `200` at once, so Ziffr does not wait for Microsoft. A first event looks the list up for a task with the ref in its notes before creating one, so a retry does not make a second task, and then calls `link` so every later event carries the task's id in `external_ids`. Later events change the linked task directly. The ref (`Ziffr ref: ZIF-12`), the link back into Ziffr, the Metric and the person who asked go into the task's notes.

To Do to Ziffr: every five minutes the list's tasks are read, and for each task with a ref the workflow compares its state with what Ziffr was last told, and signs and sends `done`, `reopen` or `reply`. An answer of `200` (even `changed: false`) or `409` is written down, so it is not sent again; anything else is tried again next time.

## Limits

- **Tasks only.** A Question is ignored: it is answered in Ziffr, not ticked off. A redacted message (a Metric not shared with Everyone) becomes a task titled "A Ziffr task for you (ZIF-12)" with a link, and nothing else.
- **A person, not an assignee.** The task lands in the one list you chose, in the account of the credential. It does not look up the assignee by email; one workflow serves one list. For several people, import the pair once per person and list.
- **Five minutes** until a tick in To Do reaches Ziffr (To Do does not push). The workflow reads the first 100 tasks of the list: keep the list short, or the newest tasks may not be seen.
- **Replies are one line.** Below the line `--- end of Ziffr text ---` that the workflow writes, `Reply:` followed by text in the notes, up to 1,000 characters; a changed line is sent again as a new message. To Do shows no Thread back.
- **Memory is n8n's static data**, which holds only while the workflow is active. Deactivating and reactivating keeps it; deleting the workflow loses it, and the worst case is a `done` sent twice, which Ziffr takes as `changed: false`.
- **Ziffr allows 60 requests a minute** per Webhook; a run sends at most 30.
- Editing the title in To Do does not change it in Ziffr, and a due date set in To Do is not sent either.
- Ziffr's rules win: a Task Ziffr closed itself (a Metric archived) cannot be reopened from To Do, and the answer `409` is written down.
- **Notes are written safely.** Every value Ziffr sends (a name, the link) has line breaks and other control characters stripped before it goes into the notes, and only a `Reply:` line **after** the closing marker line is read, so no name can forge a reply.
- **A task speaks only for its own Action.** Ticks and replies name the Action by the task's id (the link made when it was created), never by a ref written in a task, so someone who can edit the list cannot act on other Actions by typing a ref.
- **The secret is in n8n's saved runs.** The Settings node's output is stored with each execution. In the workflow's settings, set **Save successful production executions** to *Do not save* (and failed ones too, if you can spare them), and keep who may open executions small.
