# 0007 Real Slack: the second real Connector

**Status:** done. **Tracking issue:** #99 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0007`.

## Problem Statement

Spec 0004 made email real; Slack is still simulated. A Delivery or Prompt "by Slack" is worded as a direct message and recorded in the Outbox, and nobody receives it. Many small teams live in Slack and read email late: a Prompt there is answered in a minute, the same Prompt by email in a day. Delivery Preferences already let people choose Slack, so today choosing it means choosing silence.

## Solution

The Slack Connector sends real direct messages and takes real answers. Each Ziffr workspace connects one Slack workspace with "Add to Slack" (OAuth v2), done by an Owner or Admin; the bot token is stored encrypted and never leaves the server. People are matched to Slack users by their proven email address, or by a code they send the bot. Every Delivery and Prompt the core already words for Slack goes out as a direct message from the bot, through the same queue, retries and limits as email. A reply in the message's thread routes as an email reply does: a number answers a Prompt, text replies in the Thread, "Correction: 1234" proposes a Correction. Buttons approve an Unusual Value and stop Prompts and reminders on Slack. Without Slack settings, or before a workspace connects, Slack stays simulated as today, and the demo never sends anything.

## User Stories

1. As an Owner or Admin, I want to connect our Slack workspace with "Add to Slack", so that Ziffr can message our people there.
2. As an Owner or Admin, I want to disconnect it again, and Ziffr to stop when the app is removed in Slack, so that Slack access ends when we say.
3. As a member, I want to be found on Slack by the email address I sign in with, so that nobody has to set anything up.
4. As a member whose Slack address differs, I want to link my Slack account by sending the bot a code from Ziffr, so that I am still reached.
5. As a Submitter, I want a Prompt as a direct message, and to answer in its thread with the number, so that it is recorded without opening Ziffr.
6. As a Contact without a login, I want the same, found by the address the workspace keeps for me.
7. As a Metric owner, I want questions, tasks, reminders and replies on Slack, and my reply in the thread to land in the Thread.
8. As an Approver, I want to approve an Unusual Value with one button in Slack, since Slack tells Ziffr who pressed it.
9. As anyone getting Prompts and reminders on Slack, I want to stop them with one button, and the Metric owners to learn that I did.
10. As an Owner, I want to see in the Outbox whether a Slack message was sent, is waiting or failed.
11. As a Metric owner, I want a message from anyone other than the person a Delivery went to ignored, so nobody can answer for someone else.
12. As a self-hoster, I want to create the Slack app from a manifest in the guide, so that setup takes minutes and needs no account with us.
13. As a self-hoster without Slack settings, I want Ziffr to work as before.
14. As a demo visitor, I want the demo to send nothing to Slack.
15. As a maintainer, I want Slack to reuse email's queue, limits and reply routing, so the next Connector has less to build.

## Implementation Decisions

- **One Slack app per installation.** The self-hoster creates it from the manifest in `docs/guides/slack.md` and sets `ZIFFR_SLACK_CLIENT_ID`, `ZIFFR_SLACK_CLIENT_SECRET` and `ZIFFR_SLACK_SIGNING_SECRET`, plus `ZIFFR_SECRETS_KEY` and `ZIFFR_SITE_URL`. Bot scopes: `chat:write` (post), `im:write` (open the direct message), `im:history` (receive `message.im`), `users:read` and `users:read.email` (find people by address). No user scopes. Calls go only to `https://slack.com/api` (or `ZIFFR_SLACK_API_URL`, for GovSlack), never to an address taken from data.
- **Connecting (OAuth v2).** An Owner or Admin starts it; Ziffr stores a one-time `state` (24 random bytes, ten minutes, bound to that person and workspace) and sends them to `slack.com/oauth/v2/authorize`. The callback is accepted only with that state, by the same person, still an Owner or Admin there; Ziffr exchanges the code with `oauth.v2.access` and keeps the team id and name, the app id, the bot user id and the bot token. Enterprise Grid org-wide installs are refused. One Slack workspace connects to at most one Ziffr workspace: a thread in a direct message must name one Ziffr workspace, and the bot has one direct message per Slack user. Sources: [Installing with OAuth](https://docs.slack.dev/authentication/installing-with-oauth).
- **The bot token at rest.** AES-256-GCM with a key from `ZIFFR_SECRETS_KEY` (32 bytes, base64 or hex), a random 12-byte IV per encryption, and the workspace id as additional data, so a ciphertext copied to another workspace's row does not decrypt. Only the core's Slack sending code decrypts it; no loader selects it. Changing the key means connecting again (rotation is out of scope). Without the key, Slack stays off.
- **Disconnecting.** An Owner or Admin disconnects in Ziffr (`auth.revoke` is called, and the row marked revoked); the `app_uninstalled` and `tokens_revoked` events, and an `invalid_auth`/`token_revoked` answer from Slack, do the same. Queued Slack Deliveries then fail with "Slack is not connected".
- **Matching people.** A Delivery goes only to a member or Contact of its workspace, to a Slack user of the connected Slack workspace who is neither deleted nor a bot:
  - a member by their proven address (the one their sign-in confirmed), through `users.lookupByEmail`; Slack confirms addresses when people join, and the connected Slack workspace is one the Owner chose to trust;
  - a member by a link they make themselves: Ziffr shows a one-time code (ten minutes), they send `link <code>` to the bot, and the signed event names their Slack user. This proves both ends and overrides an email match;
  - a Contact by the address the workspace keeps for them, the same trust as email. A Contact's Slack handle is never used: display names in Slack are neither unique nor stable, and nobody proved it.
  The match is stored per workspace and person (with the address it was found by, so a changed address looks again); one Slack user is one person per workspace.
- **Sending.** Slack Deliveries use the queue email has: `mail_state` (now the sending state of every real Connector) is `queued` when the workspace is connected, retries after 1, 2, 4 and 8 minutes, five attempts, `POST /api/jobs/deliveries` sends what waits. The send is claimed in the database (`claim_slack_send`) under locks with limits: 500 a day per workspace, 20 an hour per recipient, 300 a day per sender, and 40 a minute per Slack workspace, below `chat.postMessage`'s workspace limit. A `429` waits for its `Retry-After` without using an attempt. The message goes by `conversations.open` and `chat.postMessage`; its channel and `ts` are kept, so a reply in its thread finds it. Workspace text in the message is escaped (`&`, `<`, `>`), so nobody can write a disguised link or a mention. A Prompt's form link is added only when it is sent, as for email. Sources: [Rate limits](https://docs.slack.dev/apis/web-api/rate-limits), [users.lookupByEmail](https://docs.slack.dev/reference/methods/users.lookupByEmail).
- **Receiving.** `POST /api/slack/events` and `POST /api/slack/interactions` take only requests signed by Slack: `X-Slack-Signature` is `v0=` and the HMAC-SHA256 of `v0:<timestamp>:<raw body>` with the signing secret, compared in constant time, with `X-Slack-Request-Timestamp` within five minutes; bodies at most 64 KB. `url_verification` is answered only when signed. Every event is claimed by its `event_id` before anything else, so Slack's retries change nothing. Work is done inline: a few queries and at most one Slack call, well inside Slack's three seconds; a slow answer is retried by Slack and then ignored as a duplicate. Events count only for a connected Slack workspace and the app's own id. Sources: [Verifying requests](https://docs.slack.dev/authentication/verifying-requests-from-slack), [Events API](https://docs.slack.dev/apis/events-api/), [Handling user interaction](https://docs.slack.dev/interactivity/handling-user-interaction).
- **Routing a reply.** A `message.im` from a person (no subtype, no bot) in the thread of a sent Delivery is taken only from the Slack user that Delivery went to (as matched now), within 30 days, at most 20 per Delivery; then it goes the way an email reply goes, through the shared routing: a Prompt answer is `submitValue` with source `slack` (Submission Rule, Locks, Approvals apply), a reply about an Action goes into its Thread, a "Correction:" line proposes a Correction. A message outside a thread gets a hint to answer in the thread: guessing which message it answers could record a number for the wrong Metric. The bot answers in the thread with what became of it.
- **Approvals by Slack** are taken, unlike unverified email: each request is signed by Slack with the app's own secret and names the Slack user who wrote or pressed, which only Slack can vouch for, and that user must be the one the Delivery went to. A forged From header has no Slack equivalent.
- **Buttons.** A Delivery for an Approval carries "Approve"; Prompts and reminders carry "Stop these on Slack". A button press is taken only from the recipient's Slack user on that very message. Stopping works like email's opt-out, per person and workspace, for Slack only; the Metric owners are told, and the person can turn them on again on the Connectors page.
- **Settings and docs.** `.env.example` gains the settings; `docs/guides/slack.md` holds the manifest and the steps; the threat model gains Slack as a trust boundary.

## Testing Decisions

- The core is tested against the database with a fake Slack Web API: a local HTTP server in the test that answers `oauth.v2.access`, `users.lookupByEmail`, `conversations.open`, `chat.postMessage` and `auth.revoke` and records what it was sent. No internal function is mocked.
- Connecting: a good callback stores an encrypted token; a wrong, used, expired or other person's state, a Member, an org install and a Slack workspace connected elsewhere are refused; the token decrypts only for its workspace.
- Matching: by proven address, by link code, Contacts by address, never by handle, never a deleted user or a bot, never across workspaces.
- Sending: queued, sent, failed, retried, waiting on a limit and on `429`; nothing in the demo, without settings or after a disconnect; text escaped.
- Receiving: a thread reply records a value, replies in a Thread, proposes a Correction, approves; another Slack user, another Slack workspace, an unknown thread, an old Delivery and a repeated event are refused. Route tests cover the signature, its age, `url_verification`, size and dedupe by event id.

## Out of Scope

Channels (only direct messages); modals and slash commands; Enterprise Grid org installs; several Slack workspaces per Ziffr workspace; rotating `ZIFFR_SECRETS_KEY`; Socket Mode; WhatsApp and ticket systems (they stay simulated).

## Further Notes

- The security review of the whole spec (ticket #105) led to four changes, now part of the decisions above:
  - Notices on Slack are escaped like every other message.
  - A member's proven address outweighs a Contact's, so a Contact found first by a member's address gives way.
  - A button press is claimed once by its `trigger_id`, so a replayed request does nothing.
  - The bot answers messages outside a thread at most ten times a minute per workspace, so a flood cannot use up the Slack workspace's sending budget.

- Approving by Slack trusts the connected Slack workspace's admins, who can change a user's address or take over an account. That is the trust the Owner gives by connecting it; it is written in the guide.
