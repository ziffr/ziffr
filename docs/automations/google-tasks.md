# Google Tasks (Automation Template)

Two n8n workflows that keep Google Tasks in step with the Tasks given in Ziffr. They are an [Automation Template](../../GLOSSARY.md): files in this repository that you import into your own n8n. Ziffr never runs them and never holds your Google account. Ziffr does not support Google Tasks; if Google changes something and a template breaks, it is fixed by a pull request. The messages and the endpoint they use are in the [Webhooks guide](../guides/webhooks.md). They are the same pair as for [Microsoft To Do](microsoft-todo.md), which describes what they do in more detail.

**Tried against a real n8n and Google Tasks:** not yet — owner to try.

| File | Direction | What it does |
|---|---|---|
| [`google-tasks-from-ziffr.json`](google-tasks-from-ziffr.json) | Ziffr to Google Tasks | A Task given to someone becomes a Google task; changes to its text, due date or state follow; a Task done in Ziffr is ticked off. |
| [`google-tasks-to-ziffr.json`](google-tasks-to-ziffr.json) | Google Tasks to Ziffr | Ticking a task marks the Task done, un-ticking reopens it, and a line `Reply: …` after the line `--- end of Ziffr text ---` in the task's details becomes a message in the Thread. |

Import one or both: each works alone, but without the first, tasks have no ref in their details and the second has nothing to report.

## Set up

1. In Ziffr, **Workspace → Webhooks**: add a Webhook with the events `action.created`, `action.updated` and `action.done`. Copy its **id** and its **secret** (shown once). The address comes in step 5.
2. In n8n, import both files (**Workflows → Import from file**).
3. In each workflow open the **Settings** node and fill in your Ziffr address, the Webhook's id and secret, and the id of the task list: `@default` is your main list, others are listed by `GET https://tasks.googleapis.com/tasks/v1/users/@me/lists`.
4. Add the credential **Google Tasks OAuth2 API** in n8n (the Google Tasks API must be enabled in the Google Cloud project its OAuth client belongs to) and choose it in the HTTP Request nodes (*List tasks*, *Create task*, *Update task*).
5. In *Ziffr to Google Tasks*, replace the Webhook path with a long random string, activate the workflow, and put its **production URL** into the Webhook in Ziffr. Use **Send test event**: the log shows `200`.
6. Activate *Google Tasks to Ziffr*.

The secret sits in the Settings node of your n8n, so only people who may edit workflows there can read it. On a self-hosted n8n the Code nodes need `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.

## Limits

The limits of the To Do templates apply, with these differences:

- **Tasks only**, in the one list you chose, in the account of the credential; no lookup of the assignee. A redacted message becomes a task titled "A Ziffr task for you (ZIF-12)" with a link.
- **The date only.** Google Tasks keeps a due date without a time, so a due date reaches it as a day.
- **Five minutes** until a tick reaches Ziffr (Google Tasks does not push). The workflow asks for tasks changed in the last seven days, at most 100, including completed and hidden ones (a task cleared from the completed list is hidden, not gone); a list with more changes than that in a week may miss some.
- **Replies** are a line `Reply:` below the line `--- end of Ziffr text ---` followed by text in the task's details, up to 1,000 characters.
- **Memory is n8n's static data**, which holds only while the workflow is active; the worst case after losing it is a `done` sent twice, which Ziffr takes as `changed: false`.
- **Ziffr allows 60 requests a minute** per Webhook; a run sends at most 30.
- Editing the title or date in Google Tasks does not change it in Ziffr. Ziffr's rules win: a Task Ziffr closed itself cannot be reopened from Google Tasks.
- **Details are written safely.** Every value Ziffr sends (a name, the link) has line breaks and other control characters stripped before it goes into the details, and only a `Reply:` line **after** the closing marker line is read, so no name can forge a reply.
- **A task speaks only for its own Action.** Ticks and replies name the Action by the task's id (the link made when it was created), never by a ref written in a task, so someone who can edit the list cannot act on other Actions by typing a ref.
- **The secret is in n8n's saved runs.** The Settings node's output is stored with each execution. In the workflow's settings, set **Save successful production executions** to *Do not save* (and failed ones too, if you can spare them), and keep who may open executions small.
