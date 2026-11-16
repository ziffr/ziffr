# 0016 Telegram: a Connector anyone can set up in minutes

**Status:** draft. **Tracking issue:** opened when the spec is agreed (label `tracking`); tickets carry `spec:0016`.

## Problem Statement

Ziffr reaches people by email and Slack. Slack fits teams that already live in it; many of the people Ziffr asks for numbers do not: a shop owner, a freelancer, a franchise partner, a field team, someone who tracks numbers for themselves. They read their phone's messenger first. WhatsApp would reach them, but needs a Meta business account, approved message templates and a 24-hour window per conversation, which is why it is still simulated (#6). Telegram has none of that: a bot is made in two minutes with @BotFather, costs nothing, and can send, take replies and show buttons. A Prompt answered from the lock screen in ten seconds is the promise of Ziffr ("values captured where people already work") kept for people without Slack.

## Solution

A Telegram Connector that sends real messages and takes real answers, built like Slack's (spec 0007) and on the same queue, limits and reply routing. One Telegram bot per Installation, made by the self-hoster with @BotFather. Owners and Admins turn Telegram on for their workspace. A bot cannot write to anyone first and cannot look people up, so every person links themselves once: **Connect Telegram** in Ziffr opens the bot with a one-time code, they tap **Start**, and from then on Prompts, reminders, questions, tasks and replies reach them in Telegram. They answer by replying to the message: a number answers a Prompt, text goes into the Thread, "Correction: 1234" proposes a Correction. Buttons approve an Unusual Value and stop Prompts and reminders on Telegram. Without a bot token, or before a workspace turns it on, Telegram stays off, and the demo never sends anything.

## User Stories

1. As a self-hoster, I want to make the bot with @BotFather and set one token, so that Telegram works without an account with anyone else.
2. As an Owner or Admin, I want to turn Telegram on and off for our workspace, so that we decide whether our numbers travel through it.
3. As a member, I want to connect my Telegram with one tap from my profile, and disconnect it there or by blocking the bot, so that I control it.
4. As a Contact without a login, I want to connect Telegram from my form page, so that I get Prompts there instead of by email.
5. As a Submitter, I want a Prompt as a Telegram message and to answer by replying with the number, so that it is recorded without opening Ziffr.
6. As a Metric owner, I want questions, tasks, reminders and replies on Telegram, and a reply to land in the Thread.
7. As an Approver, I want to approve an Unusual Value with one button, since Telegram tells Ziffr who pressed it.
8. As anyone getting Prompts and reminders on Telegram, I want to stop them with one button, and the Metric owners to learn that I did.
9. As an Owner, I want to see in the Outbox whether a Telegram message was sent, is waiting or failed.
10. As a Metric owner, I want a message from anyone other than the person a Delivery went to ignored, so nobody can answer for someone else.
11. As a developer, I want Telegram to work on my laptop without a public address, so that trying it needs no tunnel.
12. As a self-hoster without a bot token, and as a demo visitor, I want Ziffr to work as before and send nothing.

## Implementation Decisions

- **One bot per Installation.** The self-hoster makes it with @BotFather and sets `ZIFFR_TELEGRAM_BOT_TOKEN`. On start, and when an Owner or Admin opens the Connectors page, Ziffr calls `getMe` to learn the bot's username (for links) and to show whether the token works. Calls go only to `https://api.telegram.org` (or `ZIFFR_TELEGRAM_API_URL`, for a self-hosted Bot API server), never to an address taken from data. The token stays in the environment: unlike Slack's per-workspace tokens, there is none to store. Without it, Telegram is off. Sources: [Bot API](https://core.telegram.org/bots/api), [BotFather](https://core.telegram.org/bots/features#botfather).
- **Per workspace, on or off.** An Owner or Admin turns Telegram on for the workspace on the Connectors page; it is off until then. Turning it off stops sending at once (queued Telegram Deliveries fail with "Telegram is off in this workspace") and keeps the links, so turning it on again needs nobody to connect again. One bot serves every workspace of the Installation; a reply finds its workspace through the message it replies to.
- **Linking a person (the only way to be reached).** A bot cannot write first, and Telegram has no lookup by email or phone number. **Connect Telegram** on the profile page (members) or on a Contact's form page creates a one-time code: 32 random bytes in base64url (43 characters, inside Telegram's limit of 64 characters from `A-Z a-z 0-9 _ -`), stored only as a hash, valid for ten minutes, bound to the person (or Contact) and workspace. The button opens `https://t.me/<bot>?start=<code>`; Telegram shows **Start**, which sends `/start <code>` to the bot. The signed update names the Telegram user and their private chat; Ziffr claims the code once and stores the link (workspace, person or Contact, Telegram user id, chat id, linked time). This proves both ends: only the signed-in person (or the holder of the Contact's form link) saw the code, and only the Telegram account that tapped Start sent it. One Telegram user is one person per workspace; the same Telegram user may be linked in several workspaces. Only private chats count; a code sent in a group is refused. Sources: [Deep linking](https://core.telegram.org/bots/features#deep-linking).
- **Unlinking.** Disconnect on the profile page or form page; `/stop` to the bot; or the bot being blocked, which Telegram answers with `403 Forbidden` on the next send, and a `my_chat_member` update showing `kicked`. Each removes the link; queued Telegram Deliveries to that person then fail with "Not connected to Telegram".
- **Sending.** Telegram Deliveries use the queue email and Slack use: `queued` when the workspace has Telegram on and the person is linked, retries after 1, 2, 4 and 8 minutes, five attempts, sent by `POST /api/jobs/deliveries`. Limits, claimed in the database under locks like Slack's: 500 a day per workspace, 20 an hour per recipient, 300 a day per sender, and at most one message a second per chat and 25 a second per bot, below Telegram's stated limits. A `429` waits for its `parameters.retry_after` without using an attempt. Messages use `parse_mode: HTML`, and every piece of workspace text is escaped (`&`, `<`, `>`), so nobody can write a link or a mention in someone else's name; text is cut to 4,096 characters. A Prompt's form link is added only when it is sent, as for email. The sent message's chat id and message id are kept, so a reply finds it. Sources: [sendMessage](https://core.telegram.org/bots/api#sendmessage), [Limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits).
- **Receiving, in production: a webhook.** `POST /api/telegram/updates`, registered with `setWebhook` (by an Owner or Admin's **Turn on**, or by the self-hoster with a command) with `allowed_updates` `message`, `callback_query` and `my_chat_member`, and a `secret_token` derived from the bot token and `ZIFFR_SECRETS_KEY` (HMAC, 64 characters). A request counts only with that value in `X-Telegram-Bot-Api-Secret-Token`, compared in constant time; bodies at most 64 KB. Every update is claimed by its `update_id` first, so Telegram's retries change nothing. Work is done inline, a few queries and at most one Telegram call. Sources: [setWebhook](https://core.telegram.org/bots/api#setwebhook).
- **Receiving, on a laptop: polling.** With `ZIFFR_TELEGRAM_POLLING=1`, a script (`pnpm telegram:poll`) calls `getUpdates` in a loop and hands each update to the same code the webhook uses, so no tunnel is needed. Telegram allows only one of the two at a time: polling deletes the webhook first and says so. Not for production.
- **Routing a reply.** A text message in a private chat that replies to a sent Delivery (`reply_to_message`) is taken only from the Telegram user that Delivery went to (as linked now), within 30 days, at most 20 per Delivery; then it goes the way an email or Slack reply goes, through the shared routing: a Prompt answer is `submitValue` with source `telegram` (Submission Rule, Locks, Approvals apply), a reply about an Action goes into its Thread, a "Correction:" line proposes a Correction. A message that replies to nothing gets a hint to reply to the message it answers, at most ten hints a minute per chat: guessing could record a number for the wrong Metric. The bot replies with what became of it.
- **Approvals by Telegram** are taken, like Slack's and unlike unverified email: each update arrives with the secret only Telegram and Ziffr know and names the Telegram user who pressed, and that user must be the one the Delivery went to, linked by the code above.
- **Buttons.** Inline keyboards: a Delivery for an Approval carries **Approve**; Prompts and reminders carry **Stop these on Telegram**. `callback_data` names the Delivery and the action only (at most 64 bytes, no workspace data). A press is taken only from the recipient on that very message, claimed once by its `callback_query.id`, and answered with `answerCallbackQuery`. Stopping works like email's opt-out, per person and workspace, for Telegram only; the Metric owners are told, and the person can turn it on again on the Connectors page. Sources: [InlineKeyboardMarkup](https://core.telegram.org/bots/api#inlinekeyboardmarkup), [answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery).
- **Glossary.** No new term: Telegram is a Connector, and "link themselves" is how GLOSSARY.md already says a person is reached on one. **Connector** lists Telegram among its examples, and **Outbox** names it among the Connectors that really send.
- **Settings and docs.** `.env.example` and `docker/README.md` gain `ZIFFR_TELEGRAM_BOT_TOKEN` (and the two optional ones); a new `docs/guides/telegram.md` has the steps with @BotFather; the threat model gains Telegram as a trust boundary; the user guide's Connectors and profile chapters describe turning it on and connecting.

## Testing Decisions

- The core is tested against the database with a fake Bot API: a local HTTP server in the test that answers `getMe`, `setWebhook`, `deleteWebhook`, `sendMessage`, `answerCallbackQuery` and `getUpdates` and records what it was sent. No internal function is mocked.
- Linking: a fresh code links once; an expired, used, other workspace's or group-chat code is refused; one Telegram user is one person per workspace; disconnect, `/stop` and a blocked bot unlink.
- Sending: queued, sent, failed, retried, waiting on a limit and on `429`; nothing in the demo, without a token, with Telegram off or to an unlinked person; text escaped and cut.
- Receiving: a reply records a value, replies in a Thread, proposes a Correction, approves; another Telegram user, an unknown or old message, a message that replies to nothing and a repeated update are refused. Route tests cover the secret header, its absence, size and dedupe by `update_id`.

## Tickets

1. The bot: settings, `getMe`, turning Telegram on and off per workspace, `setWebhook`, the fake Bot API, the Connectors page.
2. Linking: one-time codes, **Connect Telegram** on the profile and form pages, `/start`, unlinking, blocked bots.
3. Sending: the shared queue and its limits, HTML escaping, form links, `429`.
4. Receiving: the webhook route, `update_id` dedupe, reply routing; polling for local development.
5. Buttons: Approve and Stop, `callback_query` dedupe.
6. Docs and review: `docs/guides/telegram.md`, settings, threat model, user guide chapters, release note, and a security review of the whole spec.

## Out of Scope

Groups and channels (only private chats); several bots per Installation, or one per workspace; Telegram Login for signing in to Ziffr; files, photos and voice messages; Mini Apps; WhatsApp and ticket systems (they stay simulated).

## Further Notes

- **Telegram stores bot conversations on its servers**, not end-to-end encrypted: numbers and questions sent by Telegram are readable by Telegram. The guide and the Connectors page say so, next to the switch an Owner or Admin uses to turn it on.
- **Trust.** Linking proves a Telegram account at the moment of the link. Someone who later takes over that Telegram account receives the person's Prompts and can answer them, approvals included. Unlike Slack, no workspace admin can redirect accounts, so the trust is in each person's own Telegram account; the guide recommends Telegram's two-step verification.
- **Why not WhatsApp first:** see Problem Statement; once Telegram's Connector exists, a WhatsApp one (#6) mostly differs in its sending rules (templates, 24-hour window), and reuses the rest.
