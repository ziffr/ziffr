# 0025 Installation Settings: set up mail, Telegram, Slack and the rest in Ziffr, not in a file

**Status:** draft. **Tracking issue:** #195 (label `tracking`); tickets carry `spec:0025`.

## Problem Statement

What a whole Installation can do is set in environment variables today: the mail server, replies by email, the Telegram bot, the Slack app, the check against bots, trials. Whoever runs Ziffr edits a settings file on the server, restarts it, and learns only from the sign-in page whether it worked. That is fine for a developer and too much for the person who runs Ziffr for a team, a club or a small company, and it was too much for the owner of the public demo: setting up email took four rounds, and Telegram and Slack are still simulated there because nobody wants to edit the file again. A person using Ziffr never sees any of this; they connect Telegram or Slack with one click, but only once the Installation has a bot and an app.

## Solution

A page **Installation settings**, for the people who run the Installation and nobody else. One section per thing the Installation talks to: what it is for, whether it is set up, a form to set it up, and a test that proves it works. Values are kept in the database, the secret ones sealed with the Installation's key, and take effect without a restart. A value set in the environment still wins and is shown as "set on the server", so nothing changes for anyone who set Ziffr up with a file.

## User Stories

1. As the person who runs an Installation, I want to enter the mail server on a page and send myself a test email, so that I know mail works before anyone else signs in.
2. As them, I want to paste a Telegram bot token from @BotFather and have Ziffr register its webhook and show the bot's name, so that Telegram is real for everyone in a minute.
3. As them, I want a button that opens Slack with Ziffr's app manifest filled in, and fields for the three values Slack shows afterwards, so that I never edit the manifest's addresses by hand.
4. As them, I want to set up replies by email (inbound domain, the provider that vouches for senders, the signing secret Ziffr makes for me) with the records to add shown on the page.
5. As them, I want to set the check against bots, trials (on or off, days, how many) and the demo here too.
6. As them, I want to see for each item whether it comes from the page or from the server's settings, and that a server setting wins.
7. As anyone else, including Owners of Workspaces, I never see this page or its values.
8. As the person who runs it, I want every change recorded with who made it and when, without the secret values.

## Implementation Decisions

- **Who.** A new role on the Installation, not in a Workspace: **Installation Admin** (glossary). The first one claims the Installation with a one-time setup code that Ziffr prints in its server log on start while it has no Installation Admin. Holding the server's log proves you run it, which signing up first does not, on an Installation that offers trials to anyone. Installation Admins can add and remove others. `ZIFFR_INSTALLATION_ADMINS` (addresses) also names them, for set-ups that prefer a file.
- **Storage.** One row per setting in a table only the service role reaches. Secret values are sealed with `ZIFFR_SECRETS_KEY`, which Docker already makes and keeps on first start, and are never sent back to a browser: the page shows "set" and the last four characters at most.
- **Precedence.** Environment first, then the database, then the default. One function in the core returns the settings in effect, and every place that reads `process.env` for these settings reads it instead, so the sign-in page, "What works here" and the queue keep saying the same thing.
- **No restart.** Settings are read per request with a short cache; Telegram's webhook is (re)registered when its token is saved.
- **Tests on the page.** Mail: send to the admin's own address. Telegram: getMe, then the webhook. Slack: auth.test with the client id and secret is not possible before installing, so the page shows the app's install link and checks the signing secret with Slack's test request. Replies: the expected MX record and a test message's outcome.
- **Audit.** Every change in the audit log, with the setting's name, never its value.

## Testing Decisions

- Database tests for claiming with the setup code (once, never again, wrong code refused), for who may read and change settings, for sealing (no secret readable in the table or returned by any function a browser can call) and for precedence.
- Tried in a production build: a fresh Docker Installation goes from no settings to real email, Telegram and Slack through the page alone, then the same with values in the environment shown as "set on the server".
- A security review against the threat model before the spec is done: the page and its actions are a new way to change what an Installation does.

## Tickets

1. Installation Admin: claim with the setup code, add and remove; the page shell; glossary and threat model.
2. The settings store, sealing and precedence; the core's settings in effect read everywhere.
3. Mail and replies by email, with their tests.
4. Telegram, with webhook registration.
5. Slack, with the prefilled manifest link.
6. Check against bots, trials and the demo; docs (self-hosting guide, user guide chapter); spec done.

## Out of Scope

- Settings per Workspace (they stay where they are).
- Changing the database or the Installation's address from the page.
- Paid features.
