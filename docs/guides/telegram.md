# Telegram

Ziffr can send messages by Telegram and take the answers ([spec 0016](../specs/0016-telegram.md)). Prompts asking for a number, reminders, questions, tasks and Thread replies arrive as messages from your Ziffr bot. People answer by replying to them: a number records the value, text goes into the Thread, and "Correction: 1234" proposes a Correction. Approvers approve with a button. It suits people who live on their phone rather than in Slack or their inbox, and it needs no account with anyone but Telegram.

## 1. Make the bot

Every Ziffr installation uses a bot of its own.

1. In Telegram, open **@BotFather** and send `/newbot`.
2. Give it a name people will see, such as "Acme Ziffr", and a username ending in `bot`, such as `acme_ziffr_bot`.
3. BotFather answers with the bot's **token**, such as `7000000001:AAF…`. Keep it secret: whoever has it can send and read as the bot.

Optional, in BotFather: `/setdescription` and `/setuserpic`, so people recognise the bot when they connect. For the picture, send [`ziffr-telegram-bot.png`](../../apps/web/public/brand/ziffr-telegram-bot.png) (640 × 640, the mark sits inside the circle Telegram crops to); the Installation settings page offers it too, and [docs/brand](../brand/README.md) lists all of Ziffr's brand files. Telegram has one bot and one picture for every Workspace, so messages cannot carry a Workspace's own logo there.

## 2. Give Ziffr the token

**On the page (easiest).** An Installation Admin opens **Installation settings** (`/installation`), pastes the token under **Telegram** and chooses **Save**. Ziffr asks Telegram whether the token is a bot's (getMe) and stores nothing Telegram refuses. It then tells Telegram where to send answers (setWebhook) and shows the bot's name, such as "Saved: @acme_ziffr_bot". If Telegram cannot be told, the token is still saved and the page says so; **Check Telegram** tries again and shows Telegram's last error about reaching this Ziffr. **Remove** tells Telegram to stop sending here (deleteWebhook). Replacing the token does the same for the old bot. The token is sealed with `ZIFFR_SECRETS_KEY` and never shown again. No restart is needed. See [Installation settings](../user-guide/18-installation-settings.md).

**Test Telegram** on the same page proves both directions. Its link opens the bot with a one-time code (`zt_…`, ten minutes, once, only for the Installation Admin who made it, stored as a hash). On **Start** the bot sends a test message, which shows Ziffr reaches Telegram. A reply with a number comes back through the webhook, which shows Telegram reaches Ziffr, and the page shows "Tested …: message sent, answer received". It connects nobody to a Workspace: test codes have their own shape and table, and a Workspace's "Connect Telegram" code is never taken as one. The chat is kept only until the answer, or ten minutes. Five tests an hour per admin.

**Or in the server's settings**, which win over the page:

```sh skip="settings from a Telegram bot"
ZIFFR_SITE_URL=https://ziffr.example.com
ZIFFR_TELEGRAM_BOT_TOKEN=<the token from BotFather>
ZIFFR_SECRETS_KEY=$(openssl rand -base64 32)
```

`ZIFFR_SITE_URL` must be https and reachable from the internet: Telegram sends every answer to `https://ziffr.example.com/api/telegram/updates`. `ZIFFR_SECRETS_KEY` is the key Slack uses too; keep it if it is set already. Ziffr derives the secret Telegram sends with each answer from it and the token, so a request without that secret is refused, and changing either means telling Telegram the new one: saving the token on the page, **Check Telegram** there, or turning Telegram on again in a workspace (step 3).

With Docker Compose, put the token in the `.env` next to `compose.yml` (see [docker/README.md](../../docker/README.md)); `ZIFFR_SITE_URL` comes from `ZIFFR_DOMAIN` there.

Only for a Bot API server of your own: `ZIFFR_TELEGRAM_API_URL`. Ziffr talks to nothing but `https://api.telegram.org` otherwise.

## 3. Turn it on in a workspace

An Owner or Admin opens **Connectors** and chooses **Turn on** in the Telegram box. Ziffr checks the token with Telegram and tells Telegram where to send answers; if either fails, Telegram stays off and the box says why. **Turn off** stops all messages by Telegram in that workspace at once, and keeps who connected.

## Who gets messages

A bot cannot write to anyone first, and Telegram cannot look people up by email or phone number. So everyone connects their own Telegram, once per workspace:

- **Members**: **Connect Telegram** in the Telegram box on the Connectors page, then **Open Telegram** and **Start**.
- **Contacts** (no login): **Connect Telegram** on their personal form page, **Open Telegram** and **Start**, then the link in the email Ziffr sends them, the number the bot shows and **Confirm**.

The link holds a one-time code, valid ten minutes; Ziffr keeps only its hash. When Telegram reports a member's **Start**, the account and its private chat are linked to them. Then they choose Telegram where they want their messages, under **Who gets what, where** on the Connectors page, or the team default does.

A Contact has no sign-in, so their **Start** connects nothing yet. Ziffr emails the address the Workspace keeps for them a link bound to that Contact and that chat. The bot answers with a four-digit number that is neither in the email nor on the page. The link opens a page that says what connecting does and asks for that number; only typing it and pressing **Confirm** (a POST, so mail scanners that open links change nothing) connects, once, within 30 minutes. Three wrong numbers end the request. The bot says whether the email has left; one that cannot be sent is tried again like any email, or ends the request, and the bot says so. Until then Ziffr sends that chat nothing for the Contact and takes nothing from it. Then the bot and an email to the Contact both say that it is connected. A newer request ends the one before, and a Contact gets at most three of these emails in an hour and five in a day. This needs email: set up the mail server ([email guide](email.md)) before Contacts can connect. Without one, without an address for the Contact, or in a trial (which sends nothing to Contacts), their form says that it cannot connect Telegram and who can help. Proxies should not log paths under `/api/confirm-telegram/`.

When an account becomes a member's, Ziffr also emails the member's own address, with the account's name, the time and a button that disconnects it without signing in; whoever's account was connected to someone else in the workspace is emailed too (see [the user guide](../user-guide/16-workspace-settings.md#when-an-account-is-connected-to-you)). Proxies should not log paths under `/api/disconnect-chat/`.

On a form only a Contact can connect, never over a Telegram already connected, and a form cannot disconnect: only `/stop` from the connected account does. The bot's confirmation names the person and workspace ("Connected as Cleo in Acme"). Whenever a member's messages move to another Telegram account, the chat they went to is told.

Someone stops everything from the bot with `/stop`, by blocking the bot, or with **Disconnect** on the Connectors page (members). Someone who leaves the workspace gets nothing more, also nothing queued before.

## What an answer does

An answer counts only as a **reply** to a message from Ziffr (swipe it to the left, or press and hold it and choose Reply), from the Telegram account its recipient connected, within 30 days, at most twenty times per message. Then:

- to a Prompt: the number is recorded with the Source "Telegram", as if typed in the form, with the Metric's Submission Rule, Locks and Approvals. A Metric that does not take values by Telegram answers with the form link instead.
- to a question or task: the text goes into the Thread; a line "Correction: 1234" proposes a Correction.
- **Approve** under an approval task approves the value, only for the Approver it went to.

A message that replies to nothing gets a hint: guessing which message it answers could record a number for the wrong Metric. The bot answers one account at most ten times a minute.

Messages are plain text: nothing anyone writes in Ziffr becomes formatting or a hidden link in Telegram.

## Stopping Prompts and reminders

**Stop these on Telegram** under a Prompt or reminder stops them for that person in that workspace; the Metric owners are told. Questions, tasks and replies keep coming. **Get them on Telegram again** on the Connectors page undoes it.

## Trust and privacy

- **Telegram can read what its bots send and receive.** Bot chats are not end-to-end encrypted: numbers, questions and answers sent this way pass through Telegram's servers. Turn Telegram on only for numbers you are willing to share with Telegram; the Connectors page says so next to the switch.
- **Each person's own Telegram account is trusted.** A link proves the account at the moment it is made. Someone who later takes over that account receives the person's messages and can answer them, approvals included. Recommend Telegram's **two-step verification** (Settings, Privacy and Security) to everyone who connects, Approvers above all.
- **The token is the bot.** It stays in the environment: Ziffr never stores it, never shows it, and keeps no error text or address that could contain it.
- **One bot for every workspace.** Any Owner or Admin of any workspace on this installation can turn Telegram on and invite people to the bot. The bot always names the workspace and person a chat is connected for, and people stop it with `/stop`.

## Trying it locally

On a laptop, Telegram cannot reach `localhost`. Two ways:

- **Polling**, no public address needed: set `ZIFFR_TELEGRAM_POLLING=1` and `ZIFFR_JOB_SECRET` (at least 32 characters) in `.env.local`, run `pnpm dev`, and in a second terminal `pnpm telegram:poll`, which fetches updates through the app every few seconds. The first round removes a webhook the bot may have; turning Telegram on with polling registers none.
- **A tunnel** to `localhost:3000`, such as `cloudflared`, with its https address as `ZIFFR_SITE_URL`: then the webhook works as in production.

The database tests use a fake Bot API (`packages/core/src/test/fake-telegram.ts`) and need no bot.
