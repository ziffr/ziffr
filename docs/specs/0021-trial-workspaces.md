# 0021 Trial Workspaces: every Connector, real, for anyone trying Ziffr

**Status:** in progress. **Tracking issue:** #81 (label `tracking`); tickets #82 to #92 carry `spec:0021`.

## Problem Statement

The demo shows what Ziffr looks like, but not what it does. Ziffr's point is the loop outside the browser: a Prompt reaches someone by email, Slack or Telegram, they answer with a number, a program sends values through a Feed, an AI assistant reads them through the MCP Server. In the demo every one of these is simulated or switched off, on purpose. The demo is one Workspace shared by every visitor, its people are made up, and anyone may act as any of them (ADR 0005). A real Connector there would let a visitor send mail to any address, or show one visitor's messages to the next. Specs 0002, 0004, 0007 and 0016 each say so: the demo sends no email, nothing to Slack or Telegram, and has no Access Keys.

So someone evaluating Ziffr can only try the real thing by installing it. ADR 0005 named the way out and postponed it: "a private demo copy per signed-in person: not now; it needs an account first".

## Solution

An Installation can offer **Trial Workspaces**. Anyone may sign in with their email address, which proves it, and make one Trial Workspace. It comes with sample Metrics, a dashboard and Workflows that ask its Owner. Every Connector works in it for real, but only towards that one person: email to their proven address, Slack in a Slack workspace they connect, Telegram after they link themselves, Access Keys for the API and the MCP Server, and Feeds with Feed Keys (with the n8n automation from the Feeds guide). Nothing in a Trial Workspace reaches anyone else: no invitations go out, and Contacts stay simulated. A Trial Workspace ends after a set number of days and is then deleted.

The shared demo stays as it is, for people who want to look around without signing in. The public demo at ziffr-demo.stefansonntag.com offers both.

## User Stories

1. As someone evaluating Ziffr, I want to sign in with my email address and get a workspace of my own in a minute, so that I can try the real thing without installing it.
2. As them, I want it filled with sample Metrics, history, a dashboard and Workflows that ask me, so that I see the loop at once instead of setting it up first.
3. As them, I want to press **Ask me now** on a Metric and get its Prompt straight away by email, Slack or Telegram, and answer it there, so that I need not wait for the Due Date.
4. As them, I want to reply to that email with a number and see it recorded, so that I see email work both ways.
5. As them, I want to connect my own Slack workspace with "Add to Slack" and get Prompts as direct messages, so that I see how my team would use it.
6. As them, I want to connect Telegram and answer a Prompt there, so that I see the messenger path.
7. As them, I want to make an Access Key, paste it into Claude Desktop or Claude Code with `@ziffr/mcp`, and ask about my numbers, so that I see the MCP Server work.
8. As them, I want to make a Feed and a Feed Key and send values from n8n, a script or `@ziffr/feed-kit`, so that I see how my systems would feed Ziffr.
9. As them, I want to see on every page how many days my trial has left, and get one email the day before it ends, so that nothing disappears by surprise.
10. As them, I want to end my trial myself and have everything deleted, so that I decide when my data goes.
11. As them, I want to keep using what I built by moving to my own Installation, so that the trial is not wasted (a CSV export only; see Out of Scope).
12. As someone who never signed up, I want a Trial Workspace never to send me anything, so that a public Ziffr cannot be used to spam me.
13. As the person running a public Installation, I want one setting to offer Trial Workspaces, limits on how many exist and what each may send, and a check on the sign-in form against bots, so that offering them costs me a known amount.
14. As them, I want Trial Workspaces deleted on time without my doing anything, so that the Installation does not fill up.
15. As a self-hoster who does not set the setting, I want Ziffr to work exactly as before.
16. As a demo visitor, I want the shared demo to stay open without an account.
17. As someone on the login page, I want to see side by side what the shared demo and a Trial Workspace can do, what each cannot, and what a Trial Workspace asks of me (my email address, deletion after N days), so that I choose knowing what I get.
18. As a demo visitor, I want to be told on the page, and on every simulated message in the Outbox, that nothing here is sent for real and where I can try it for real, so that I do not wait for an email that never comes.
19. As the Owner of a Trial Workspace, I want a **Try it** page that lists every Connector with whether it is real, simulated or off on this Installation, why, its limit, and the steps to try it, so that I know what to expect before I start.
20. As them, I want a message that stayed in the Outbox, or a limit I reached, to say exactly why ("Contacts are not sent to in a trial", "50 of 50 messages today"), so that nothing looks broken when it is working as meant.

## Implementation Decisions

- **One setting.** `ZIFFR_TRIAL_DAYS` (1 to 30) turns Trial Workspaces on for the Installation. With it set, every Workspace made on the Installation is a Trial Workspace: there are no ordinary ones next to them, so no rule has to tell them apart by anything a person chose. It replaces `ZIFFR_DEMO_ONLY` for a public demo: sign-in opens, and the shared demo stays offered. Unset, nothing changes. The workspace row gets `trial_ends_at`; it is set when the workspace is made and never moved.
- **One per person, few in all.** A person may own one live Trial Workspace and belong to no other workspace on that Installation: there are no invitations, so nobody can join one. `ZIFFR_TRIAL_MAX` (default 200) caps live Trial Workspaces on the Installation; when it is reached, the welcome page says so and offers the shared demo.
- **Sign-in against bots.** Sign-in stays the email link. On an Installation with Trial Workspaces, the sign-in form needs a Cloudflare Turnstile check when `ZIFFR_TURNSTILE_SITE_KEY` and `ZIFFR_TURNSTILE_SECRET` are set, verified on the server before any mail is sent. The limits on sign-in links Ziffr already has apply (spec 0009, `sign-in-limits.ts`): 5 an hour per address from one network, 30 an hour per address from anywhere (high on purpose, so nobody can lock a person out), and 20 an hour per network. The link goes only to the address typed, so the worst a bot can do is make Ziffr send sign-in links to addresses it does not own. The limits and the check keep that small.
- **Sample data, through the core.** Making a Trial Workspace runs `seedTrialWorkspace(actor)` in the core. It uses the same operations a person would. The sample has to show every calculation correctly, so it covers:
  - **Every period:** at least one Metric each by day, week, month, quarter and year.
  - **Every aggregation:** sum (sign-ups, revenue, orders), average (NPS, delivery time), last (headcount, cash balance) and none (margin and return rate, percentages that cannot be added). Each one is shown on the dashboard in a display period longer than its own, such as daily sign-ups by month or weekly NPS by quarter, so rolling up is visible.
  - **Unfinished periods:** history runs up to today. A summed Metric has values for the periods that are over, as real ones arrive (a month's revenue once the month is over), so the current month holds its finished days, the current quarter its finished months and the current year its finished quarters. "To date" figures (month to date, quarter to date, year to date) and the comparison with the same span of the period before come out right, and no half-finished period reads as a drop. An average or a last value has a value for the current period too. The current period of some Metrics is left open on purpose, so there is something to answer with **Ask me now**.
  - **The rest a dashboard needs:** a Breakdown by country on revenue, target ranges and a Target Series on two Metrics, a gap of one missing period to show how a missing value looks, and a derived Metric (average order value from revenue and orders).
  - **How it looks:** values with a trend, a seasonal swing and noise, generated from a fixed seed per trial, so tests can check the totals.
  - **Around it:** a dashboard from a Template that shows all of it, and a Workflow for each Metric that asks the Owner.

  Past periods are recorded as Imports; the current periods as ordinary values. It does not copy the demo's SQL seed: that seed writes to the demo workspace's fixed id and would need a copy of every table, which breaks each time a table is added. The made-up people of the demo are not copied either: the Owner is the only person, and a few Contacts with no address show the Outbox.
- **Only the Owner is reached.** In a Trial Workspace a Delivery is sent for real only when its recipient is the Owner. Email goes to their proven address; Slack to the Slack user found by that address or linked by code (spec 0007); Telegram to their linked chat (spec 0016). A Delivery to anyone else, such as a Contact, stays in the Outbox as it does in the demo. Invitations cannot be made at all. This is one check in the shared delivery queue, next to the demo check that is already there, so no Connector can forget it.
- **Ask me now.** A Metric's page gets **Ask me now** for its owner when they are its Submitter. It queues the current period's Prompt to them at once, on their chosen Connector, through the same Prompt wording and queue as the Workflow. It is open to every Workspace, not only trials, and at most once every ten minutes per Metric.
- **Saying what works here, from one source.** A core function, `whatWorksHere(actor)`, answers for each Connector (email out, email replies, Slack, Telegram, the web form, the API, the MCP Server, Feeds, WhatsApp) one of `real`, `simulated` or `off`, with the reason and the limit that applies, such as "real, to your address only, 50 a day" or "simulated: this Installation has no mail server". It is built from the same settings and rules the delivery queue and the API check, so the explanation cannot say "real" while the queue keeps a message back. Unauthenticated pages get an Installation-wide version without any workspace data. Every place below reads it; no page writes its own list.
  - **Login page:** two columns, "Look around" (the shared demo: no account, everything simulated, shared with other visitors, reset often) and "Try it for real" (a Trial Workspace: your email address, real Connectors towards you only, deleted after N days), each with what it can and cannot do. When trials are full or off, the second column says so.
  - **Shared demo:** a line in the demo bar, "Messages here are simulated. To get them for real, start a trial", linked to the login page when trials are offered. Every Outbox entry is marked "Simulated, not sent".
  - **Try it page** in a Trial Workspace, opened first after sign-up and linked from the trial bar: one card per Connector with its state, the reason, the limit and the steps (Ask me now by email; Add to Slack; Connect Telegram; make an Access Key and copy the `claude mcp add` line; make a Feed Key and import the n8n automation). A card ticks itself off once it worked (a value arrived by that Source), so the Owner sees their progress. Below the cards is a short list of what a trial never does: invite people, write to Contacts, run past its end date, move to another Installation.
  - **Where a rule acts:** an Outbox entry kept back in a trial names the rule ("Contacts are not sent to in a trial"); a limit reached names the limit and when it resets; the Connectors page shows each Connector's state as a badge next to its switch.
  - **Words:** the texts use the glossary terms, are written in the user guide's voice, and each one links to the user guide chapter on Trial Workspaces.
- **Limits per Trial Workspace**, claimed in the database like the existing Connector limits: 50 real Deliveries a day; 25 Metrics; 2 Access Keys and 2 Feeds with 2 Feed Keys each, all ending no later than the trial; the existing API and Feed limits on top. Reaching a limit says which one and does not fail silently.
- **Slack.** The Installation's Slack app has public distribution turned on (unlisted, so no Slack review is needed), so any Slack workspace can add it. Each Trial Workspace connects its own Slack workspace, as any workspace does in spec 0007. Ziffr messages nobody there but the Owner.
- **Email in and out.** Real email needs `ZIFFR_SMTP_*`, `ZIFFR_INBOUND_DOMAIN` and `ZIFFR_INBOUND_SECRET` (docs/guides/email.md). Without them, Trial Workspaces still work, and their email lands in the Outbox as before. The page then says that email is simulated on this Installation.
- **The MCP Server and the API** work in Trial Workspaces as anywhere: an Access Key is bound to the Workspace and ends with it. The Connectors page of a Trial Workspace shows the `claude mcp add` line and the Claude Desktop setting, filled in with the Installation's address.
- **Feeds.** A Trial Workspace's Owner may make Feeds and Feed Keys as any Owner. The Feeds guide's n8n automation works with the trial's key unchanged.
- **The end.** Every page of a Trial Workspace shows the days left. The day before `trial_ends_at`, one email goes to the Owner, unless they ended it already. At `trial_ends_at`, the workspace is closed: signing in shows "This trial has ended" and a CSV export of its Metrics and their values, new with this spec (one file, each row a Metric, period and value, made by the core for the Owner only). Every key stops and every Connector link is removed. Seven days later, `POST /api/jobs/trial-cleanup` (on the clock, like the other jobs) deletes the workspace with everything in it. **End my trial** on the Try it page (and **Delete it now** on the ended screen) does both at once, after a confirmation; those are the pages a trial's Owner reads. The download is `GET /try/download`. A person whose only workspace was deleted is deleted with their sign-in, so the Installation keeps no addresses of people who are gone.
- **Glossary.** Adds **Trial Workspace**: "A Workspace on an Installation that offers trials, made by one person to try Ziffr. Its Connectors are real but reach only its Owner, nobody can be invited to it, and it is deleted a set number of days after it was made. _Avoid_: Sandbox, test workspace, free trial". Changes **Demo Mode**: it says that the shared demo has no real Connectors and that a Trial Workspace does. Changes **Installation**: it gives offering trials as one of the settings its operator decides. The glossary changes land with the first ticket.
- **ADR.** A new ADR records that a public Installation sends from Trial Workspaces only to their Owner, and why that is the line rather than per-address consent. It amends ADR 0005's "not now".
- **Settings and docs.** `.env.example` and `docker/README.md` gain `ZIFFR_TRIAL_DAYS`, `ZIFFR_TRIAL_MAX` and the two Turnstile settings. `docs/guides/self-hosting.md` gains "Offering trials", with the Slack distribution step and the email settings. The user guide gains a short chapter on what a Trial Workspace is and how it ends. The threat model gains a public sign-in as an entry point.

## Testing Decisions

- The core is tested against the database (`*.db.test.ts`) with the existing fakes: Mailpit for SMTP, the fake Slack API and the fake Bot API. Nothing inside the core is mocked.
- Making: one live Trial Workspace per person; none past `ZIFFR_TRIAL_MAX`; none without the setting; the seed records Imports and makes Workflows that ask the Owner.
- Sample data: there is a Metric for each period and each aggregation; summed Metrics have values for every period that is over and none for the current one, averages and last values for the current one too; for a fixed seed and date, the month-, quarter- and year-to-date figures and their comparison with the period before match totals worked out by hand in the test; a derived Metric computes from its inputs.
- Reaching: in a Trial Workspace, a Delivery to the Owner is sent by email, Slack and Telegram; one to a Contact, or to a Slack or Telegram user who is not the Owner, stays in the Outbox; an invitation is refused; the daily limit holds under parallel sends.
- Keys: Access Keys and Feed Keys stop at the trial's end, even when made with a later date; the per-trial counts hold.
- Ending: the reminder goes once; at the end, keys stop and links go; seven days later the cleanup deletes every row of the workspace, and the person when it was their only workspace. A test lists the tables with a `workspace_id` and fails when one is not emptied, so a new table cannot escape the cleanup.
- Sign-in: Turnstile is verified on the server and a missing or wrong answer sends nothing; the per-address and per-IP limits hold.
- What works here: for each combination of settings (no mail server, SMTP without inbound, Slack app set or not, Telegram token set or not, trials on or off, the demo), `whatWorksHere` answers what the delivery queue then does. A test sends one Delivery per Connector and checks that "real" means sent and "simulated" means kept in the Outbox, so the explanation and the behaviour cannot drift apart. The Installation-wide version holds no workspace data.
- Ask me now: queues one Prompt, to the right Connector, at most once in ten minutes; it is refused to anyone who is not the Metric's owner and Submitter.
- The app is tried end to end on a second Supabase stack with real email to Mailpit, the Telegram bot by polling, Slack through the dev tunnel, and `@ziffr/mcp` with a trial's key.

## Tickets

1. #82 The setting, `trial_ends_at`, one per person, the cap, no invitations; glossary and ADR.
2. #83 Sample data: `seedTrialWorkspace` through the core.
3. #84 Only the Owner is reached: the check in the delivery queue, the per-trial limits.
4. #85 **Ask me now** on a Metric.
5. #86 What works here: `whatWorksHere`, the login page's two columns, the demo bar line and "Simulated, not sent" in the Outbox, the reasons on kept-back entries and reached limits, the badges on the Connectors page.
6. #87 The **Try it** page: cards per Connector with steps, ticking off, and the list of what a trial never does (needs 4 and 5).
7. #88 Keys and Feeds in trials: counts, end dates; the MCP setup box on the Connectors page.
8. #89 Sign-in against bots: Turnstile and the limits.
9. #90 The end: days left, the reminder, closing, the CSV export, `trial-cleanup`, **End my trial**.
10. #91 Docs, settings, threat model, user guide chapter, release note, and a security review of the whole spec.
11. #92 The public demo on the VPS: real SMTP and inbound mail, the Telegram bot, the Slack app's distribution, Turnstile, `ZIFFR_TRIAL_DAYS`; done by the person who runs it, with the steps from ticket 10.

## Out of Scope

Turning a Trial Workspace into an ordinary one, or moving it to another Installation (beyond the CSV export); paid plans and billing (`ee/`, rule 9); inviting a second person into a trial; copying the demo company into a trial; real WhatsApp (it stays simulated, #6); a hosted n8n or a webhook inside Ziffr; Trial Workspaces next to ordinary ones on one Installation.

## Further Notes

- **Why only the Owner, not consent per address.** Letting a trial invite colleagues would show Ziffr better, but a public Installation would then mail any address someone types. Asking each address first ("X wants to send you Prompts, accept?") is itself a mail to a typed address. The Owner proved their address by signing in. Everything else waits for a real Installation.
- **Accepted in the review of ticket 3.** An Owner can hand their own Telegram start link or Slack code to someone else, who then gets the Owner's messages. That takes the other person's own action and reaches nobody new against their will. A message a trial holds back for a Contact still reads "answer by replying"; ticket 5 words what the Outbox shows. Answers to a reply (Slack, Telegram, email) do not count towards the 50 a day: they go only to whoever wrote first, at most twenty per message, and an ended trial gives none.
- **"Trial" and paid plans.** If Ziffr ever has paid plans with a trial period, that is a different thing and needs a different word. This spec's Trial Workspace is about trying Ziffr on a public Installation, not about billing.
- **A showcase without signing in.** For the shared demo, a Feed that only its operator holds the key to (seeded by the demo reset from a setting) could show values arriving live from the operator's n8n. It is a smaller change to ADR 0005 and is tracked separately, if at all.
- **Cost on the public demo.** On the VPS, 200 Trial Workspaces of four Metrics and eighteen periods each are a few thousand rows. Mail volume is capped at 50 a day per trial, and the SMTP provider's own limits apply on top.
