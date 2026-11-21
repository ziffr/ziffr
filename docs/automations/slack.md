# Slack channel (Automation Template)

Two n8n workflows that put Ziffr's Tasks and Alerts into one Slack channel, and bring a tick or a reply back. They are an [Automation Template](../../GLOSSARY.md): files in this repository that you import into your own n8n. Ziffr never runs them and never holds your Slack token. Ziffr does not support Slack through them; if Slack changes something and a template breaks, it is fixed by a pull request. The messages and the endpoint they use are in the [Webhooks guide](../guides/webhooks.md).

This is for **a channel**. It does not replace the Slack Connector, which reaches one person by direct message, matches them by their proven address, takes a number as the answer to a Prompt and has buttons for Approval.

**Tried against a real n8n and Slack:** not yet — owner to try.

| File | Direction | What it does |
|---|---|---|
| [`slack-from-ziffr.json`](slack-from-ziffr.json) | Ziffr to Slack | A Task given to someone is posted to the channel; a Task done in Ziffr gets a note in the message's thread and a :white_check_mark:; an Alert that fired is posted. |
| [`slack-to-ziffr.json`](slack-to-ziffr.json) | Slack to Ziffr | A :white_check_mark: on the message marks the Task done (removing it reopens), and each reply in the **message's own thread** becomes a message in the Thread. |

## Set up

1. In Slack, create an app with a bot token and the scopes `chat:write`, `reactions:write`, `reactions:read`, `channels:history` (and `groups:history` for a private channel). Invite the bot to the channel. Note the channel's id and the bot's user id (Slack: `auth.test`).
2. In Ziffr, **Workspace → Webhooks**: add a Webhook with the events `action.created`, `action.done` and `alert.fired`. Copy its **id** and its **secret** (shown once). The address comes in step 6.
3. In n8n, import both files (**Workflows → Import from file**).
4. In each workflow open the **Settings** node and fill in your Ziffr address, the Webhook's id and secret, the channel id and the bot's user id. In *Slack to Ziffr* also fill in **allowedUsers**: the Slack user ids (comma separated) of the people whose reaction or reply counts, or `ANYONE` to let everyone in the channel answer.
5. Add the credential **Slack API** (the bot token) in n8n and choose it in the HTTP Request nodes.
6. In *Ziffr to Slack*, replace the Webhook path with a long random string, activate the workflow, and put its **production URL** into the Webhook in Ziffr. Use **Send test event**: the log shows `200`.
7. Activate *Slack to Ziffr*.

The secret sits in the Settings node of your n8n, so only people who may edit workflows there can read it. On a self-hosted n8n the Code nodes need `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.

## What the workflows do

Ziffr to Slack: the Webhook node keeps the **raw body**; a Code node checks the signature and the five-minute window, drops a delivery it has handled (the message `id` in the signed body, one day; the `X-Ziffr-Delivery` header carries the same value but is not signed), and an event older than the last it saw for that ref. It answers `200` at once. A new Task is posted as one message (first line `Ziffr ref: ZIF-12`, then the title, who it is for, the due date, the Metric, who asked and a link); a first event reads the channel for a message of the bot with that ref before posting, so a retry does not post twice, and then calls `link` with `<channel>:<message time>` as the external id. A Task done adds a short note to the message's thread and a :white_check_mark: to the message. An `alert.fired` is posted as a message of its own and is not linked to anything. Everything Ziffr sends has its line breaks removed and `&`, `<` and `>` escaped, so no name can ping `@channel`, mention a person or build a link.

Slack to Ziffr: every five minutes the newest 40 top-level messages of the bot that start with a ref are read. For each, its reactions say whether a person ticked it, and **only the replies in that message's thread** are sent, once each and in order, as `reply`. Nothing in the channel at large is ever read as a reply, and the text of the message itself is never read for one. A reply that failed is tried again before any later one is recorded.

## Why a reaction and not a button

A button needs Slack to call a public address of yours and a second signature, Slack's own, to check. A reaction needs only the bot token and the five-minute read, so the template stays two files with one secret.

## Limits

- **Tasks only.** A Question is not posted: it is answered in Ziffr, not ticked off. A redacted message (a Metric not shared with Everyone) becomes a message "A Ziffr task for you (ZIF-12)" with a link, and nothing else. An update to a Task does not edit the posted message.
- **Anyone you name can answer.** Slack does not tell the workflow who in Ziffr a person is, so a tick or a reply by someone in **allowedUsers** counts as the assignee's, shown in Ziffr as "via" the Webhook. Until you fill the setting in, nobody can answer. The bot's own reactions and messages, other apps' messages and messages that are not plain replies (joins, edits) never count.
- **One channel, the newest 40.** The workflow reads the channel's latest 100 messages and the newest 40 tasks among them; older tasks can no longer be ticked from Slack. For several channels, import the pair once per channel.
- **Five minutes** until a tick or a reply reaches Ziffr (the workflow reads, Slack does not push).
- **Replies are plain text**, up to 1,000 characters, with line breaks turned into spaces. Slack's markup (`<@U123>`) comes through as written.
- **Memory is n8n's static data**, which holds only while the workflow is active. The worst case after losing it is a `done` sent twice, which Ziffr takes as `changed: false`, or a reply sent again.
- **Ziffr allows 60 requests a minute** per Webhook; a run sends at most 30.
- **A task speaks only for its own Action.** Ticks and replies name the Action by the message's `<channel>:<time>` (the link made when it was posted), never by a ref written in a message, and only messages of the bot count, so no one can act on another Action by typing a ref.
- Ziffr's rules win: a Task Ziffr closed itself cannot be reopened from Slack, and the answer `409` is written down. The first change wins.
- **The secret is in n8n's saved runs.** The Settings node's output is stored with each execution. In the workflow's settings, set **Save successful production executions** to *Do not save* (and failed ones too, if you can spare them), and keep who may open executions small.
- **A step that fails after Ziffr was answered is not tried again.** The workflow answers `200` first so Ziffr does not wait for Slack; if Slack then refuses (a busy moment), that message or tick is lost, and a Task done in Ziffr may stay without its :white_check_mark:.
