# Slack

Ziffr can send real Slack messages and take the answers ([spec 0007](../specs/0007-real-slack.md)). Prompts asking for a number, reminders, questions, tasks and Thread replies arrive as direct messages from the Ziffr app. A reply in the message's thread records the number, answers in the Thread or proposes a Correction. Buttons approve an Unusual Value and stop Prompts and reminders on Slack. Without the settings below, or until a workspace connects Slack, Slack messages stay in the Outbox, as before. The demo never sends anything to Slack.

## 1. Create the Slack app

Every Ziffr installation uses a Slack app of its own. On [api.slack.com/apps](https://api.slack.com/apps) choose **Create New App**, then **From a manifest**, pick the Slack workspace that owns the app, and paste this. Replace `ziffr.example.com` with your Ziffr's address (`ZIFFR_SITE_URL`):

```yaml
display_information:
  name: Ziffr
  description: Asks for your numbers and brings your answers back.
features:
  bot_user:
    display_name: Ziffr
    always_online: true
  app_home:
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
oauth_config:
  redirect_urls:
    - https://ziffr.example.com/api/slack/oauth
  scopes:
    bot:
      - chat:write        # send direct messages
      - im:write          # open the direct message with a person
      - im:history        # read replies in those direct messages
      - users:read        # needed with the next one
      - users:read.email  # find people by their email address
settings:
  event_subscriptions:
    request_url: https://ziffr.example.com/api/slack/events
    bot_events:
      - message.im
      - app_uninstalled
      - tokens_revoked
  interactivity:
    is_enabled: true
    request_url: https://ziffr.example.com/api/slack/interactions
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

Ziffr must be reachable from the internet at that address before Slack accepts the event URL: Slack checks it with a signed `url_verification` request, which Ziffr answers once the settings below are set. Keep token rotation off: Ziffr keeps the bot token Slack gives it and does not refresh it.

To connect Slack workspaces other than the one that owns the app, turn on **Manage Distribution** for the app. A team that only connects its own Slack workspace does not need to.

## 2. Settings

From the app's **Basic Information** page, set these where Ziffr runs:

```sh
ZIFFR_SITE_URL=https://ziffr.example.com
ZIFFR_SLACK_CLIENT_ID=1234567890.1234567890
ZIFFR_SLACK_CLIENT_SECRET=<Client Secret>
ZIFFR_SLACK_SIGNING_SECRET=<Signing Secret>
ZIFFR_SECRETS_KEY=$(openssl rand -base64 32)
```

`ZIFFR_SECRETS_KEY` seals the bot tokens Ziffr stores (AES-256-GCM). Keep it with your other secrets and back it up: with another key the stored tokens do not open, and every workspace has to connect Slack again. On GovSlack, also set `ZIFFR_SLACK_API_URL=https://slack-gov.com/api`.

Slack messages that could not go out at once are retried by the same job as email: have a scheduler call `POST /api/jobs/deliveries` every few minutes ([scheduled jobs](jobs.md)).

## 3. Connect a workspace

An Owner or Admin opens **Connectors** in Ziffr and presses **Add to Slack**, then allows the app in Slack. One Ziffr workspace connects one Slack workspace, and a Slack workspace can be connected to one Ziffr workspace only. **Disconnect Slack** on the same page ends it. Removing the app in Slack ends it too.

## Who gets messages

A Slack message goes only to a member or Contact of the Ziffr workspace, and only once Ziffr knows who they are on the connected Slack workspace:

- **Members** are found by the email address they sign in to Ziffr with, if a Slack user of that workspace has the same address. A member whose Slack address is another one presses **Link my Slack account** on the Connectors page and sends the app the message it shows (`link ZIF-…`) within ten minutes.
- **Contacts** are found by the email address the workspace keeps for them.
- A Slack handle stored for a Contact is never used: Slack display names are neither unique nor proven.

Deactivated Slack users and bots are never messaged. The Outbox shows each Slack message as **Sent on Slack**, **Waiting to send** or **Not sent**, with the reason, for example "Nobody on the connected Slack has their address."

**Limits.** A workspace sends at most 500 Slack messages a day, one person gets at most 20 an hour, and one person causes at most 300 a day. Ziffr also sends at most 40 a minute to one Slack workspace, below Slack's own limit. Messages over a limit wait in the queue. When Slack asks Ziffr to wait, it waits as long as Slack says.

## What an answer does

Answer **in the thread** of the message you are answering:

- **To a Prompt:** the number is recorded, or a Breakdown with one row per line. The Metric's Submission Rule, Locks and Approvals apply, and the app answers in the thread with what became of it. If the Metric does not take values from Slack, you get your form link instead.
- **To a question or task:** the reply lands in the Thread. A line `Correction: 1234` proposes a Correction.
- **Approve:** the button on an approval task approves the value, as in Ziffr. Writing `approve` in the thread does the same, and `send back: <why>` sends it back.

Ziffr ignores:

- a message outside a thread (the app tells you to answer in the thread);
- a reply by anyone other than the person the message went to;
- edits;
- a reply after 30 days;
- more than 20 replies to one message.

Every request from Slack must carry Slack's signature, made with the signing secret and no older than five minutes, so nobody else can answer for you.

## Stopping Prompts and reminders

Every Prompt and reminder on Slack has a **Stop these on Slack** button. It stops Prompts and reminders on Slack for that person in that workspace, and the owners of the Metrics they submit to are told. Questions, tasks and replies in their Threads keep coming. The person can turn them on again on the Connectors page.

## Trust

Connecting a Slack workspace trusts its admins: someone who can change a Slack user's email address, or take over a Slack account, can get that person's Prompts and answer them, approvals included. Connect only a Slack workspace whose admins you trust with your numbers.

## Trying it locally

Slack must reach Ziffr over the internet, so a local Ziffr needs a tunnel (for example `cloudflared tunnel --url http://localhost:3000`). Use the tunnel's address in the manifest and as `ZIFFR_SITE_URL`. The database tests use a fake Slack Web API (`packages/core/src/test/fake-slack.ts`) and need no Slack at all.
