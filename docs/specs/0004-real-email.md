# 0004 Real email: the first real Connector

**Status:** done. **Tracking issue:** #70 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0004`.

## Problem Statement

Every Connector in Ziffr is simulated. A Prompt asking for this month's number, a reminder, a question to a Metric owner, an invitation to the workspace: all of them land in the Outbox and nobody receives them. Answers can only be typed into the simulator. A team can try Ziffr, but it cannot run on it: the loop of asking, answering and checking that the product is built around never leaves the building.

## Solution

The Email Connector sends real email and takes real replies. Outbound, every Delivery and Prompt the core already words is sent through SMTP, so any mail provider works and a self-hoster needs no account with us. Inbound, each message carries a reply address of its own; the provider forwards replies to a signed webhook, and the core routes them as it already routes simulated mail: a number answers a Prompt, text replies in the Thread, "Correction: 1234" proposes a Correction. Invitations are emailed. Without SMTP settings Ziffr behaves as today (the Outbox only), and the demo never sends anything.

## User Stories

1. As a Submitter, I want a Prompt by email, so that I am asked for the number where I already work.
2. As a Submitter, I want to reply to that email with the number, so that it is recorded without opening Ziffr.
3. As a Submitter, I want a reply with one row per line to record a Breakdown, as the simulator does today.
4. As a Contact without a login, I want the same, so that I can submit without an account.
5. As a Metric owner, I want questions, tasks, reminders and Escalations by email, and my reply to land in the Thread.
6. As a Metric owner, I want a late value for a locked period to come to me as a proposed Correction, also when it arrives by email.
7. As an Owner, I want an email invitation to actually reach the person, with the link to join.
8. As anyone receiving these emails, I want to stop Prompts and reminders with one click, so that I am not mailed against my will; the Metric owner learns that I stopped.
9. As a self-hoster, I want to use any mail provider through SMTP, so that I choose where mail goes.
10. As a self-hoster, I want inbound mail through a webhook my provider calls, so that replies work with Postmark, Mailgun, SES or Cloudflare Email Routing.
11. As a self-hoster without mail settings, I want Ziffr to work as before, so that email is opt-in.
12. As an Owner, I want to see in the Outbox whether a message was sent, is waiting or failed, so that I know who was really reached.
13. As a Metric owner, I want a reply that does not belong to a message Ziffr sent to be ignored, so that nobody can write into my workspace by guessing an address.
14. As a demo visitor, I want the demo to send no email, so that its made-up people never get mail and the demo cannot be used to send any.
15. As a maintainer, I want sending and receiving to go through core functions with database tests, and the email words to stay in the Connector, so that the other Connectors can follow the same path.

## Implementation Decisions

- **Outbound through SMTP.** `ZIFFR_SMTP_URL` (for example `smtps://user:pass@smtp.example.com:465`) and `ZIFFR_MAIL_FROM` turn sending on. A core module sends a Delivery's subject and body as plain text; no HTML, so no markup from workspace content reaches a mail client. Subjects and addresses are checked for line breaks before they become headers.
- **Sending.** Deliveries gain a state: `queued`, `sent` or `failed`, with attempts and the provider's message id. `deliver`, `deliverPrompt` and `deliverNotice` queue as they insert today and then try to send at once; a failed send is retried by a job route (`POST /api/jobs/deliveries`, `Authorization: Bearer $ZIFFR_JOB_SECRET`) that any cron can call, at most five attempts. The Outbox shows the state.
- **Who gets mail.** Only members and Contacts of the Delivery's workspace, at the address the workspace keeps for them (a member's proven address, a Contact's stored one). Never in the demo workspace.
- **Reply addresses.** Each sent message carries `Reply-To: reply+<token>@<ZIFFR_INBOUND_DOMAIN>`, where the token is random (24 bytes), stored with the Delivery or Prompt, and names exactly one recipient, one workspace and one Thread or Prompt. A reply is accepted only for a known token, from the address it was sent to, within 30 days.
- **Inbound webhook.** `POST /api/inbound/email` takes the raw message (RFC 5322) and an HMAC-SHA256 signature of the body with `ZIFFR_INBOUND_SECRET`, checked in constant time; anything unsigned, too large (1 MB) or not parseable is refused without detail. The guide shows how to forward to it from common providers. Parsing keeps the reply's new text and drops quoted history and signatures.
- **Routing a reply** goes through the core paths that exist: a reply to a Prompt is `submitValue` with source `mail` (Submission Rule, Locks, Approvals apply); a reply to a Delivery about an Action is a Thread reply, and a "Correction:" line a proposed Correction. A reply to a Prompt for a Metric that does not take mail is answered with the form link, never recorded.
- **Invitations** by email are sent with the join link, through the same sending path.
- **Opting out.** Prompts and reminders carry `List-Unsubscribe` (RFC 8058, one click) pointing to a signed link; using it stops Prompts and reminders by email for that person in that workspace and tells the Metric owners concerned. Questions, tasks and replies to Threads the person takes part in keep coming.
- **Limits.** At most 500 emails per workspace per day and 20 per recipient per hour; the rest wait in the queue. Inbound replies are limited per token.
- **Settings and docs.** `.env.example` and a self-hosting guide gain the five settings; the threat model gains outbound mail and the inbound webhook as trust boundaries and closes its "Real Connectors and email" item for email.
- **Libraries.** `nodemailer` to send, `postal-mime` to parse; both widely used and small.

## Testing Decisions

- Sending is tested in the core against the database with a test SMTP server (a local one in CI, such as Mailpit, which local Supabase already runs): queued, sent, failed and retried; nothing sent in the demo or without settings; headers without injected lines.
- Inbound is tested through the core function that takes a parsed message: a known token from the right sender records a value, replies in a Thread, proposes a Correction; an unknown or expired token, another sender, another workspace's token and a Metric without mail are refused. The webhook gets route tests for the signature, size and parsing.
- One end-to-end test sends a Prompt to Mailpit, replies to it through the webhook and finds the value recorded.

## Out of Scope

Real Slack, WhatsApp and ticket Connectors (they follow on the same sending path); HTML email and templates; bounces and complaints from providers; attachments (a CSV of values); sending through a provider's HTTP API instead of SMTP; email sign-in links (Supabase sends those).

## Further Notes

- The server starts making outgoing connections, but only to the SMTP host a self-hoster sets, never to an address taken from data.
- Once email is real, the Outbox is the record of what was sent rather than a simulation; its page says which.
