# An inventory of fixed values (ticket #508)

Analysis only; nothing is built. Written 2026-11-21 against `origin/main` (6c084553). It sorts every numeric constant in `packages/core/src` into four levels and proposes which should become settable. The owner decides from section 2 and section 4.

**Method.** Constants found with a search for `const NAME = <number>` in the non-test files of `packages/core/src`, read together with their doc comments, plus the inline numbers listed after the inventory. The search finds 259; 15 of them are unit helpers (`DAY`, `MINUTE`, `MS`, `JANUARY`, `CORE_API_VERSION`), which leaves the 244 sorted below (the ticket's 182 was a rougher count). Values enforced inside migrations (for example `METRICS_PER_DAY`, the trial counts, `claim_trial_send`) are listed from their TypeScript twin; making one settable means the database must read the setting too (question 8).

**Who asked.** No ticket or issue asks for any particular value to be settable (searched all issues); the situations below are the realistic ones a self-hoster, a company or a hosted customer would be in, not requests. Say so when you decide.

## 1. Summary

| Level | Constants | What it means |
| --- | --- | --- |
| Fixed | 209 | Changing it opens a hole or breaks a calculation, or it has no consequence worth a setting |
| Operator (`/installation`) | 29 | Capacity and cost of the server, how long logs live, trial and grace days |
| Workspace (Owners) | 3 | How a team works |
| Person | 3 | Their own taste |
| Unit helpers (not counted) | 15 | `DAY`, `MINUTE` and the like |

Of the 244 constants, 209 are Fixed and **35 could be set at a level above Fixed**. The 30 proposed settings in section 2 are those 35 constants grouped (a setting such as the Calendar Link window covers two), with the Workspace and Person levels of the alert limits added on top of their Operator ceilings:

| Proposed setting by level | Count |
| --- | --- |
| Operator | 23 |
| Operator, then lowered by Workspace (and Person) | 2 |
| Workspace | 3 |
| Person | 2 |

**Today** the Installation Settings page already offers 21 settings (mail, replies, Telegram, Slack, bots, trials, demo, Workspace Limits, Marketplace, Usage). Not one of the 209 fixed values is among them. **Two things stand out.** First, almost all of what an operator would want is a cap that protects the server, so the range's lower bound matters more than the default. Second, the number of sending and abuse guards that look settable but must stay fixed is large (section 3); a setting on them would be a way to open a hole by accident.

**Not constants, but in the ticket:** quiet hours and week start. Neither exists in the code today (no column, no constant), so they are new features, not settings of an existing value; question 4.

## 2. Proposed settable values (30)

Rules for every one of them, from the ticket: a range (lower bound protects the server, upper bound the database), each level only within the one above, a default (today's value), a one-line explanation, and Workspace Limits tied to Sizes stay with Ziffr Cloud on hosted Ziffr (ADR 0013). Environment still wins over the page, as in spec 0025.

| # | Setting | What it does | Level | Range | Default | Why someone would change it |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Emails per Workspace per day | Emails one Workspace may send in 24 hours; the rest wait in the queue (`MAIL_PER_WORKSPACE_PER_DAY`). | Operator | 50 to 100,000 | 500 | A small mail provider allows a few hundred emails a day in all; a big install with a dedicated provider needs more. |
| 2 | Telegram and Slack messages per Workspace per day | The same cap for each of the two chat channels (`TELEGRAM_PER_WORKSPACE_PER_DAY`, `SLACK_PER_WORKSPACE_PER_DAY`). | Operator | 50 to 50,000 | 500 each | A company that lives in Slack and sends many Alerts and Prompts there; the provider's own limits stay fixed below it. |
| 3 | Emails per person per day | Emails one person may cause as sender of Prompts, questions and notices across all their Workspaces (`MAIL_PER_SENDER_PER_DAY`). | Operator | 20 to 5,000 | 300 | Follows the mail provider's quota; an Installation with one big Workspace of 500 Submitters has one admin asking all of them. |
| 4 | Send attempts per email | How often a queued email is tried before it counts as failed (`MAX_ATTEMPTS`). | Operator | 1 to 10 | 5 | A slow or flaky mail provider (greylisting, a relay that is down for an hour) needs more tries. |
| 5 | Alerts per person | Alerts one person may hold in one Workspace (`ALERTS_PER_PERSON`). The Operator sets the ceiling, an Owner may lower it for the Workspace. | Operator, then Workspace (down only) | 1 to 200 | 20 | A company wants people to hold few Alerts; a monitoring team of three needs many. |
| 6 | Alert messages per person per day | Messages one person is sent per day; after it Alerts fire into the list only (`ALERT_MESSAGES_PER_PERSON_PER_DAY`). Operator ceiling, Workspace may lower, a person may lower their own. | Operator, then Workspace, then Person (down only) | 1 to 200 | 20 | Someone who wants at most five messages a day; a Workspace that wants a quiet inbox. |
| 7 | Alerts per Workspace | Alerts a Workspace may hold in all (`ALERTS_PER_WORKSPACE`). | Operator | 50 to 10,000 | 500 | A big install with a thousand people. |
| 8 | Alert messages per Workspace per day | Alert messages a Workspace is sent per day, over all channels (`ALERT_MESSAGES_PER_WORKSPACE_PER_DAY`). | Operator | 100 to 100,000 | 2,000 | Capacity of the mail and chat providers. |
| 9 | Invitation emails per Workspace per day | Invitation emails one Workspace may send in 24 hours (`INVITATION_EMAILS_PER_WORKSPACE`). | Operator | 10 to 2,000 | 50 | A company onboarding 300 people in one week; 50 a day stops it on day one. |
| 10 | Values per API key per day | Values one key may submit in 24 hours (`VALUES_PER_DAY`). | Operator | 100 to 1,000,000 | 1,000 | A program that sends every minute for 20 Metrics is 28,800 a day. Same at every Size (ADR 0013). |
| 11 | Values per Feed per day | Values one Feed may record in 24 hours across all its keys (`FEED_VALUES_PER_DAY`); pasting by a person follows it (`PASTED_VALUES_PER_DAY`). | Operator | 1,000 to 10,000,000 | 10,000 | An install with many Feeds that send hourly for hundreds of Metrics. |
| 12 | Calls per API key per minute | Calls one key may make in any 60 seconds (`REQUESTS_PER_MINUTE`). | Operator | 30 to 6,000 | 60 | A Feed-heavy install; or a small server that wants it lower. |
| 13 | Webhooks per Workspace | Webhooks one Workspace may hold (`WEBHOOKS_PER_WORKSPACE`). | Operator | 1 to 50 | 5 | A team with a Slack-like tool per department. |
| 14 | Webhook sends per Workspace per day | Sends a Workspace gets per day; past it they wait for tomorrow (`WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY`). | Operator | 100 to 1,000,000 | 10,000 | Outgoing traffic of a busy install, or a server with little bandwidth. |
| 15 | Sign-in links per network address per hour | Links one network address may ask for in an hour, to any addresses (`LINKS_PER_NETWORK`). | Operator | 5 to 500 | 20 | A company or university behind one address, all signing in on Monday at nine. |
| 16 | Contacts per Workspace | Contacts a Workspace keeps at most (`MAX_CONTACTS`). | Operator | 100 to 100,000 | 1,000 | A club or a school with thousands of people to ask. |
| 17 | Snapshots per Workspace | Snapshots a Workspace keeps at most (`MAX_SNAPSHOTS`). | Operator | 100 to 50,000 | 500 | A regulated company that closes every dashboard monthly for ten years. |
| 18 | Days the API access log is kept | How long the log of calls by key is kept (`LOG_DAYS`). | Operator | 7 to 730 | 90 | Privacy (shorter) or a company that must answer for access for a year. |
| 19 | Days the Audit Log is kept | How long the Audit Log keeps an event (`AUDIT_RETENTION_DAYS`). | Operator | 365 to 3,650 | 730 | A regulated company that must keep it for seven years; never below a year (see question 3). |
| 20 | Days the Webhook send log is kept | How long the log of Webhook sends is kept (`WEBHOOK_LOG_DAYS`). | Operator | 1 to 90 | 14 | Disk on a small server (shorter), or time to find out why a partner stopped answering (longer). |
| 21 | Days View Counts are kept | How long daily View Counts are kept (`VIEW_COUNT_DAYS`). | Operator | 90 to 800 | 400 | Privacy (shorter); a year-on-year view of what was opened needs more than 365. |
| 22 | Values taken per Metric per night by Retention | The most original values one Metric's Retention run takes in a day (`MAX_VALUES_PER_RUN`). | Operator | 500 to 100,000 | 5,000 | A big install with years of hourly values to condense: at 5,000 a day it takes weeks to catch up. |
| 23 | Days a trial's data stays after it ends | Days between a trial's end and its deletion (`TRIAL_GRACE_DAYS`). | Operator | 1 to 60 | 7 | A regulated company wants more time to export; a public demo wants less. |
| 24 | Days between warning and deletion of an unused Workspace | Days after the warning before an unused Workspace on the default limit is deleted (`UNUSED_WAIT_DAYS`). | Operator | 7 to 90 | 14 | Holiday season: a month's wait. The 'after' part (30 to 3,650) is already an Installation Setting. |
| 25 | Days over the Workspace Limit, and days between two such periods | Days a Workspace may stay over its limit (`GRACE_DAYS`, 14) and days that must pass before another (`GRACE_EVERY_DAYS`, 90). On hosted Ziffr Ziffr Cloud keeps them fixed (ADR 0013). | Operator | 0 to 90 and 0 to 730 | 14 and 90 | A self-hoster who wants the limit to bite at once (0) or never to hurt (90). |
| 26 | Longest life of a View Link | The longest a View Link may live, in days (`MAX_DAYS`). Owners may lower it for their Workspace; the 90 days stay the ceiling. | Workspace (down only) | 1 to 90 | 90 | A regulated company that allows links for 30 days at most. |
| 27 | Share of the daily emails Alerts may use | The share of a Workspace's emails per day that Alert messages may use; the rest is kept for Prompts and tasks (`MAIL_ALERT_SHARE`). | Workspace | 10 % to 90 % | 40 % | A monitoring team that is mostly Alerts, or a team that wants Prompts never crowded out. |
| 28 | Days after which a Metric counts as unused | How long without a look or a value before Ziffr suggests a Metric as unused (`UNUSED_DAYS`). Only a suggestion, never an action. | Workspace | 30 to 365 | 90 | A team with yearly Metrics; a startup whose Metrics change monthly. |
| 29 | How far back the overdue list reaches | Days back from today that overdue entries on a person's Schedule show (`OVERDUE_DAYS_BACK`). | Person | 7 to 90 | 90 | Someone who only wants this month's backlog. |
| 30 | Calendar Link window | Days back and ahead that a person's Calendar Link shows events (`CALENDAR_DAYS_BACK`, `CALENDAR_DAYS_AHEAD`). | Person | 0 to 30 back, 7 to 90 ahead | 30 and 90 | Someone with a crowded calendar who wants two weeks. |

## 3. Values that must not become settable, and settings that probably should not be

### Look settable, are not

| Value | Why it stays fixed |
| --- | --- |
| `LINKS_PER_PLACE`, `LINKS_PER_ADDRESS`, `INVITATION_EMAILS_PER_ADDRESS`, `MAIL_PER_RECIPIENT_PER_HOUR`, `INVITATION_EMAILS_PER_SENDER` | They protect other people (a lockout, a mail bomb to a stranger, spam through invitations). Raising one is how an Installation becomes a spam source; lowering one past the Installation's own use locks people out. |
| `ACCESS_TOKEN_SECONDS`, `REUSE_WINDOW_DAYS`, `DEFAULT_CONNECTION_DAYS`, `HANDOVER_SECONDS`, `CLOUD_MAX_AGE_SECONDS`, `AUTH_HOOK_TOLERANCE_SECONDS`, `REPLY_DAYS`, the code and state minutes | Token lifetimes and signature windows are the security of the product. A longer one makes a stolen token or captured request worth more. A shorter one is safe but breaks assistants (a one-hour token is already renewed by its refresh token). |
| `CANCEL_DAYS` (7) and `MIN_KEEP_MONTHS` (13) | The ticket and spec 0033 say fixed: the delay and the floor are what make deleting history safe. |
| `WEBHOOK_SECRET_OVERLAP_HOURS`, the whole inbound gate (`WEBHOOK_INBOUND_*`, `MAX_KEYS`, `MAX_KNOWN`) | One consistent set; changing one number (for example known senders against failures per address) opens a way around the gate or blocks real senders. |
| `WEBHOOK_FAILURES_BEFORE_OFF`, `WEBHOOK_DAYS_FAILING_BEFORE_OFF`, `WEBHOOK_RETRY_WAITS_MS`, `WEBHOOK_RETRY_AFTER_MAX_MS` | What a partner's program relies on (when Ziffr stops, how often it retries); a per-install value makes every Webhook recipe behave differently. |
| `TELEGRAM_PER_BOT_PER_SECOND`, `SLACK_PER_TEAM_PER_MINUTE`, `MAX_TEXT` | The providers' own limits; higher gets the bot blocked. |
| `TRIAL_KEYS_MAX`, `TRIAL_METRICS_MAX`, `DEFAULT_TRIAL_MAX` | A trial must stay small whatever an operator wants, or trials become free hosting (spec 0021). The count of trials already is an Installation Setting. |
| `FORMULA_*`, `LARGEST_VALUE`, `SERIES_VALUE_MAX`, `MAX_DEPTH`, `MAX_WIDGET_NESTING` | Correctness and the database's number range; changing them changes what a number is or lets a formula run away. |
| `MAX_SCHEDULE_*`, `EVERY_N_*`, `MAX_WAIT_DAYS`, `MAX_YEARS_BACK` | Rules of how periods are counted (specs 0022, 0023); the Person-level view ranges in section 2 stay inside them. |
| `USAGE_MIN_WORKSPACES` | Privacy: below it a figure could point at one Workspace. |
| `CLOUD_CALLS_PER_MINUTE`, `CLOUD_BODY_MAX`, `LIMIT_MAX` | The contract with Ziffr Cloud. |
| Input sizes (`*_MAX`, `MAX_BYTES`), page sizes, job batch sizes | What a browser may send and what the database and screens are built for; the lower bound protects the server and the upper bound the database, so there is no useful range. |

### Settable today, and worth a second look

| Setting | Concern | Recommendation |
| --- | --- | --- |
| `ZIFFR_INBOUND_AUTHSERV_ID` (replies by email) | Empty is a valid value. As I read `inbound-email.ts` (the `senderVerified` check and line 169), with it empty a reply is not refused for being unvouched (an Approval still is): any sender who knows a reply address, which lives 30 days, can answer a request. The help says "with it, only vouched-for senders are taken", which understates it. | Keep it settable, but when replies are on and it is empty, say so on the page in plain words (the mail section's test already exists); do not change the behaviour in this ticket. |
| `ZIFFR_DELETE_UNUSED_AFTER_DAYS` | The only setting that deletes data by itself. It is guarded (30 to 3,650, needs working mail, never a trial, the demo or a Workspace with its own limit), and a wrong value is refused rather than guessed. | Keep; the guards are right. Consider a typed confirmation when it is first set. |
| `ZIFFR_TRIAL_MAX` (1 to 1,000,000) | Not a hole, but a trial is a free Workspace: a million is a disk and mail bill. | Keep; maybe a warning above 1,000. |

The rest of the 21 are credentials and switches and are fine as they are.

## 4. Inventory of every constant

Level: **Fixed**, **Operator**, **Workspace**, **Person**. File paths are under `packages/core/src/`. The proposed settings in section 2 are the rows marked Operator, Workspace or Person here.

### Sending (email, Telegram, Slack) (36)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `ask-now.ts` | `ASK_NOW_EVERY_MINUTES` | `10` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `installation-replies.ts` | `REPLY_TESTS_PER_HOUR` | `5` | Fixed | Abuse guard on test buttons that send real email or call Telegram. |
| `installation-replies.ts` | `REPLY_TEST_MINUTES` | `30` | Fixed | Abuse guard on test buttons that send real email or call Telegram. |
| `installation-telegram-test.ts` | `TELEGRAM_TESTS_PER_HOUR` | `5` | Fixed | Abuse guard on test buttons that send real email or call Telegram. |
| `installation-telegram-test.ts` | `TELEGRAM_TEST_MINUTES` | `10` | Fixed | Abuse guard on test buttons that send real email or call Telegram. |
| `invitations.ts` | `INVITATION_EMAILS_PER_ADDRESS` | `3` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `invitations.ts` | `INVITATION_EMAILS_PER_SENDER` | `50` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `invitations.ts` | `INVITATION_EMAILS_PER_WORKSPACE` | `50` | Operator | A company onboarding hundreds of people in a week needs more invitation emails per Workspace. |
| `invitations.ts` | `MAX_SENDS` | `3` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `invitations.ts` | `RESEND_AFTER` | `60_000` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `mail.ts` | `MAIL_ALERT_SHARE` | `0.4` | Workspace | How a team splits its email budget between Alerts and everything else (Prompts, tasks). |
| `mail.ts` | `MAIL_PER_RECIPIENT_PER_HOUR` | `20` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `mail.ts` | `MAIL_PER_SENDER_PER_DAY` | `300` | Operator | Cost cap per person across Workspaces; the right number follows the mail provider's quota. |
| `mail.ts` | `MAIL_PER_WORKSPACE_PER_DAY` | `500` | Operator | Capacity of this server and its mail provider: a small provider allows few emails a day, a big install needs more. |
| `mail.ts` | `MAX_ATTEMPTS` | `5` | Operator | A slow or flaky mail provider needs more tries; a strict one fewer. |
| `slack-connection.ts` | `STATE_MINUTES` | `10` | Fixed | Security: how long a one-time code, state or key step lives; longer widens the window to guess or intercept it. |
| `slack-inbound.ts` | `MAX_ANSWERS_PER_MINUTE` | `10` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `slack-inbound.ts` | `MAX_SLACK_BYTES` | `64 * 1024` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `slack-inbound.ts` | `MAX_SLACK_REPLIES_PER_DELIVERY` | `20` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `slack-inbound.ts` | `REPLY_DAYS` | `30` | Fixed | Security: a reply address must stop working at some point so an old email cannot answer for ever; the same in every channel. |
| `slack-people.ts` | `CODE_MINUTES` | `10` | Fixed | Security: how long a one-time code, state or key step lives; longer widens the window to guess or intercept it. |
| `slack-send.ts` | `SLACK_PER_RECIPIENT_PER_HOUR` | `20` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `slack-send.ts` | `SLACK_PER_SENDER_PER_DAY` | `300` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `slack-send.ts` | `SLACK_PER_TEAM_PER_MINUTE` | `40` | Fixed | The provider's own limit (Telegram, Slack): setting it higher only gets the bot blocked. |
| `slack-send.ts` | `SLACK_PER_WORKSPACE_PER_DAY` | `500` | Operator | Capacity of this server and its mail provider: a small provider allows few emails a day, a big install needs more. |
| `telegram-inbound.ts` | `MAX_ANSWERS_PER_MINUTE` | `10` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `telegram-inbound.ts` | `MAX_ANSWERS_PER_SECOND` | `5` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `telegram-inbound.ts` | `MAX_TELEGRAM_BYTES` | `64 * 1024` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `telegram-inbound.ts` | `MAX_TELEGRAM_REPLIES_PER_DELIVERY` | `20` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `telegram-inbound.ts` | `REPLY_DAYS` | `30` | Fixed | Security: a reply address must stop working at some point so an old email cannot answer for ever; the same in every channel. |
| `telegram-people.ts` | `TELEGRAM_CODE_MINUTES` | `10` | Fixed | Security: how long a one-time code, state or key step lives; longer widens the window to guess or intercept it. |
| `telegram-send.ts` | `MAX_TEXT` | `4096` | Fixed | The provider's own limit (Telegram, Slack): setting it higher only gets the bot blocked. |
| `telegram-send.ts` | `TELEGRAM_PER_BOT_PER_SECOND` | `25` | Fixed | The provider's own limit (Telegram, Slack): setting it higher only gets the bot blocked. |
| `telegram-send.ts` | `TELEGRAM_PER_RECIPIENT_PER_HOUR` | `20` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `telegram-send.ts` | `TELEGRAM_PER_SENDER_PER_DAY` | `300` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `telegram-send.ts` | `TELEGRAM_PER_WORKSPACE_PER_DAY` | `500` | Operator | Capacity of this server and its mail provider: a small provider allows few emails a day, a big install needs more. |

### Inbound replies by email (7)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `inbound-email.ts` | `INBOUND_ALL` | `10_000` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `inbound-email.ts` | `INBOUND_PER_SENDER` | `30` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `inbound-email.ts` | `INBOUND_TOTAL` | `1000` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `inbound-email.ts` | `MAX_INBOUND_BYTES` | `1024 * 1024` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `inbound-email.ts` | `MAX_REPLIES_PER_DELIVERY` | `20` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `inbound-email.ts` | `REFUSALS_PER_DELIVERY` | `50` | Fixed | Abuse guard against flooding or probing the open inbound routes (email, Telegram, Slack); sized above any real traffic. |
| `inbound-email.ts` | `REPLY_DAYS` | `30` | Fixed | Security: a reply address must stop working at some point so an old email cannot answer for ever; the same in every channel. |

### Webhooks (29)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `webhook-inbound-gate.ts` | `MAX_KEYS` | `10_000` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-inbound-gate.ts` | `MAX_KNOWN` | `100_000` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-inbound.ts` | `EXTERNAL_ID_MAX` | `200` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `webhook-inbound.ts` | `TEXT_MAX` | `1_000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `webhook-inbound.ts` | `THREAD_PER_HOUR` | `10` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-inbound.ts` | `URL_MAX` | `500` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `webhook-limits.ts` | `WEBHOOKS_PER_WORKSPACE` | `5` | Operator | Capacity: how many places a Workspace may send to. |
| `webhook-limits.ts` | `WEBHOOK_DAYS_FAILING_BEFORE_OFF` | `3` | Fixed | Correctness of the retry and switch-off rules a partner relies on; changing them changes what delivered and failed mean. |
| `webhook-limits.ts` | `WEBHOOK_EXTERNAL_IDS_PER_ACTION` | `10` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-limits.ts` | `WEBHOOK_FAILURES_BEFORE_OFF` | `20` | Fixed | Correctness of the retry and switch-off rules a partner relies on; changing them changes what delivered and failed mean. |
| `webhook-limits.ts` | `WEBHOOK_INBOUND_FAILURES_PER_ADDRESS` | `20` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-limits.ts` | `WEBHOOK_INBOUND_FAILURES_PER_ADDRESS_ANY_ID` | `100` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-limits.ts` | `WEBHOOK_INBOUND_FAILURES_PER_ID` | `600` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-limits.ts` | `WEBHOOK_INBOUND_KNOWN_SENDERS` | `16` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-limits.ts` | `WEBHOOK_INBOUND_MAX_BYTES` | `16 * 1024` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-limits.ts` | `WEBHOOK_INBOUND_NEW_SENDERS_PER_MINUTE` | `60` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-limits.ts` | `WEBHOOK_INBOUND_PER_MINUTE` | `60` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-limits.ts` | `WEBHOOK_INBOUND_RAW_FAILURES_PER_ADDRESS` | `200` | Fixed | Security: the Webhook inbound gate; the numbers are one set that has to stay consistent to stop probing without blocking real senders. |
| `webhook-limits.ts` | `WEBHOOK_LOG_DAYS` | `14` | Operator | Disk used by the Webhook send log versus time to investigate a partner's problem. |
| `webhook-limits.ts` | `WEBHOOK_MESSAGE_MAX_BYTES` | `16 * 1024` | Fixed | Correctness of the retry and switch-off rules a partner relies on; changing them changes what delivered and failed mean. |
| `webhook-limits.ts` | `WEBHOOK_NAME_MAX` | `80` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `webhook-limits.ts` | `WEBHOOK_RETRY_AFTER_MAX_MS` | `3_600_000` | Fixed | Correctness of the retry and switch-off rules a partner relies on; changing them changes what delivered and failed mean. |
| `webhook-limits.ts` | `WEBHOOK_SECRET_OVERLAP_HOURS` | `24` | Fixed | Security: the overlap during a secret replacement; longer keeps an old, possibly leaked secret working. |
| `webhook-limits.ts` | `WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY` | `10_000` | Operator | Capacity and outgoing traffic; a big install with many Workflows needs more. |
| `webhook-limits.ts` | `WEBHOOK_SEND_CONCURRENCY` | `3` | Fixed | Correctness of the retry and switch-off rules a partner relies on; changing them changes what delivered and failed mean. |
| `webhook-limits.ts` | `WEBHOOK_SEND_NOW_BUDGET_MS` | `15_000` | Fixed | Correctness of the retry and switch-off rules a partner relies on; changing them changes what delivered and failed mean. |
| `webhook-limits.ts` | `WEBHOOK_URL_MAX` | `2_000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `webhook-messages.ts` | `REPLY_MAX` | `1_000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `webhook-messages.ts` | `TITLE_MAX` | `200` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |

### Alerts and Workflows (13)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `alert-limits.ts` | `ALERTS_PER_METRIC` | `5` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `alert-limits.ts` | `ALERTS_PER_PERSON` | `20` | Operator | The ceiling a Workspace may lower for itself: a company wants fewer alert messages per person, a monitoring team more. |
| `alert-limits.ts` | `ALERTS_PER_WORKSPACE` | `500` | Operator | Capacity and outgoing traffic; a big install with many Workflows needs more. |
| `alert-limits.ts` | `ALERT_MESSAGES_PER_PERSON_PER_DAY` | `20` | Operator | The ceiling a Workspace may lower for itself: a company wants fewer alert messages per person, a monitoring team more. |
| `alert-limits.ts` | `ALERT_MESSAGES_PER_WORKSPACE_PER_DAY` | `2000` | Operator | Capacity and outgoing traffic; a big install with many Workflows needs more. |
| `alert-limits.ts` | `TELL_GROUPS_PER_STEP` | `10` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `alert-limits.ts` | `TELL_PEOPLE_PER_STEP` | `20` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `alert-limits.ts` | `TELL_STEPS_PER_WORKFLOW` | `3` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `alert-limits.ts` | `TELL_WEBHOOKS_PER_STEP` | `3` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `alert-rules.ts` | `ALERT_SHARE_MAX` | `1000` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `alert-rules.ts` | `ALERT_SHARE_MIN` | `1` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `alerts.ts` | `ALERT_NO_ACCESS_DAYS` | `180` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `api-workflows.ts` | `MAX_OWN_WORKFLOWS` | `100` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |

### Retention and condensing (17)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `condensed-values.ts` | `AT_A_TIME` | `200` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-job.ts` | `BATCH` | `1000` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-job.ts` | `FAILURES_TO_STOP` | `3` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-job.ts` | `MAX_CALL_MS` | `8 * 60_000` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-job.ts` | `MAX_RUN_MS` | `60_000` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-job.ts` | `MAX_VALUES_PER_RUN` | `5000` | Operator | Bounds one night's work of the Retention job against the server's load; years of backlog take days at 5,000. |
| `retention-rules.ts` | `CANCEL_DAYS` | `7` | Fixed | Safety: the 7 days before a Retention starts and the least keep time protect against losing data by mistake (spec 0033). |
| `retention-rules.ts` | `MAX_KEEP_MONTHS` | `1200` | Fixed | Bound on what a browser may send for a Retention setting. |
| `retention-rules.ts` | `MIN_KEEP_MONTHS` | `13` | Fixed | Safety: the 7 days before a Retention starts and the least keep time protect against losing data by mistake (spec 0033). |
| `retention-setting.ts` | `EXPORT_ROWS` | `250_000` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-setting.ts` | `MAX_METRICS` | `5000` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-setting.ts` | `MAX_NAMES` | `10` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-setting.ts` | `MAX_ROWS` | `100` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-setting.ts` | `MAX_SNAPSHOTS_READ` | `200` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-setting.ts` | `PARALLEL` | `4` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-words.ts` | `SUGGEST_KEEP_MONTHS` | `24` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `retention-words.ts` | `SUGGEST_MIN_VALUES` | `365` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |

### Auth, tokens and keys (23)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `assistant-connections.ts` | `ACCESS_TOKEN_SECONDS` | `3600` | Fixed | Security: token life; a longer one makes a stolen token worth more (a refresh token already renews it). |
| `assistant-connections.ts` | `AUTHORIZATIONS_PER_HOUR` | `2000` | Fixed | Abuse guard against registering clients or filling consent screens; the Installation-wide counts protect the server. |
| `assistant-connections.ts` | `AUTHORIZATIONS_PER_NETWORK` | `60` | Fixed | Abuse guard against registering clients or filling consent screens; the Installation-wide counts protect the server. |
| `assistant-connections.ts` | `DEFAULT_CONNECTION_DAYS` | `90` | Fixed | Security default people may override per connection; a longer default would be picked by most. |
| `assistant-connections.ts` | `REGISTRATIONS_PER_HOUR` | `300` | Fixed | Abuse guard against registering clients or filling consent screens; the Installation-wide counts protect the server. |
| `assistant-connections.ts` | `REGISTRATIONS_PER_NETWORK` | `10` | Fixed | Abuse guard against registering clients or filling consent screens; the Installation-wide counts protect the server. |
| `assistant-connections.ts` | `REUSE_WINDOW_DAYS` | `7` | Fixed | Security: how long a used refresh token is remembered to catch theft; shorter lets a stolen one be replayed. |
| `auth-email.ts` | `AUTH_HOOK_TOLERANCE_SECONDS` | `300` | Fixed | Security: a signature or handover window; wider lets a captured request be replayed. |
| `cloud-api.ts` | `CLOUD_BODY_MAX` | `4096` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `cloud-api.ts` | `CLOUD_CALLS_PER_MINUTE` | `60` | Fixed | The Ziffr Cloud contract: the open code's side of a signed API that Ziffr Cloud is built against. |
| `cloud-api.ts` | `CLOUD_MAX_AGE_SECONDS` | `300` | Fixed | Security: a signature or handover window; wider lets a captured request be replayed. |
| `cloud-api.ts` | `HANDOVER_SECONDS` | `300` | Fixed | Security: a signature or handover window; wider lets a captured request be replayed. |
| `installation-admins.ts` | `SETUP_CODE_TRIES_PER_HOUR` | `5` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `sign-in-limits.ts` | `LINKS_PER_ADDRESS` | `30` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `sign-in-limits.ts` | `LINKS_PER_NETWORK` | `20` | Operator | An office or university behind one network address needs more sign-in links per address than a home user. |
| `sign-in-limits.ts` | `LINKS_PER_PLACE` | `5` | Fixed | Abuse guard: lets nobody lock a person out of sign-in, mail-bomb an address or spam through invitations and test buttons. |
| `view-links.ts` | `MAX_DAYS` | `90` | Workspace | A rule of how a team works with View Links; a regulated company wants a shorter life than the 90-day ceiling. |
| `workspace-key-job.ts` | `SCAN_PAGE` | `100` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `workspace-key-job.ts` | `SEAL_BATCH` | `500` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `workspace-key-job.ts` | `WORKSPACE_SECONDS` | `20` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `workspace-key-progress.ts` | `KEY_PROGRESS_LISTED` | `50` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `workspace-keys.ts` | `KEY_PENDING_SECONDS` | `11 * 60` | Fixed | Security: how long a one-time code, state or key step lives; longer widens the window to guess or intercept it. |
| `workspace-keys.ts` | `KEY_SETTLE_SECONDS` | `15 * 60` | Fixed | Security: how long a one-time code, state or key step lives; longer widens the window to guess or intercept it. |

### API and Feeds (27)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `access-log.ts` | `LOG_DAYS` | `90` | Operator | Privacy and cost of the API access log: shorter for privacy, longer for a regulated company. |
| `access-log.ts` | `REQUESTS_PER_MINUTE` | `60` | Operator | Capacity: Feed-heavy installs call more often than a person-sized one. |
| `access.ts` | `MAX_SERIES_REQUEST` | `200` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api-actions.ts` | `MAX_ACTIONS_PAGE` | `100` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api-dashboards.ts` | `CHANGES_PER_DAY` | `500` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api-dashboards.ts` | `DASHBOARDS_PER_DAY` | `50` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api-metrics.ts` | `FIRST_PROMPTS_PER_PERSON_PER_DAY` | `5` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api-metrics.ts` | `METRICS_PER_DAY` | `50` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api-metrics.ts` | `SERIES_ITEMS_MAX` | `500` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `api-metrics.ts` | `SERIES_VALUE_MAX` | `1e15` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `api-snapshots.ts` | `SNAPSHOT_VALUES_PER_METRIC` | `240` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `api-submissions.ts` | `IDEMPOTENCY_HOURS` | `24` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api-submissions.ts` | `VALUES_PER_DAY` | `1000` | Operator | Abuse-and-capacity ceiling for what one key or person may send in a day; the same at every Size (ADR 0013). |
| `api-usage.ts` | `MAX_METRICS` | `20_000` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `api-usage.ts` | `WORKSPACE_USAGE_CALLS_PER_HOUR` | `30` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api-view-links.ts` | `MAX_VIEW_LINKS_LISTED` | `200` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api-view-links.ts` | `VIEW_LINKS_PER_DAY` | `20` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api.ts` | `MAX_PAGE` | `100` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api.ts` | `MAX_THREADS` | `20` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `api.ts` | `MAX_THREAD_MESSAGES` | `100` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `feeds.ts` | `FEED_BATCH_MAX` | `500` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `feeds.ts` | `FEED_FILLED_MAX` | `1_000` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `feeds.ts` | `FEED_VALUES_PER_DAY` | `10_000` | Operator | Abuse-and-capacity ceiling for what one key or person may send in a day; the same at every Size (ADR 0013). |
| `outbound-request.ts` | `OUTBOUND_TIMEOUT_MS` | `10_000` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `paste-values.ts` | `PASTED_VALUES_PER_DAY` | `10_000` | Operator | Abuse-and-capacity ceiling for what one key or person may send in a day; the same at every Size (ADR 0013). |
| `paste-values.ts` | `PASTED_VALUES_PER_DAY_IN_DEMO` | `500` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `usage-calls.ts` | `USAGE_FLUSH_MS` | `60_000` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |

### Limits, trials and Workspaces (33)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `auto-snapshots.ts` | `MAX_WAIT_DAYS` | `60` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `deck-additions.ts` | `MAX_DECKS` | `30` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `deck-additions.ts` | `MAX_SLIDES` | `60` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `installation-settings.ts` | `MAX_VALUE` | `1000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `installation-settings.ts` | `TEST_EMAILS_PER_HOUR` | `10` | Fixed | Abuse guard on test buttons that send real email or call Telegram. |
| `marketplace.ts` | `CHECK_EVERY_MS` | `24 * 60 * 60 * 1000` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `metrics.ts` | `SUBMITTERS_PER_CHANGE` | `20` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `metrics.ts` | `TRIAL_METRICS_MAX` | `25` | Fixed | A trial must stay small and cheap whatever the operator wants (spec 0021); the count of trials is already an Installation Setting. |
| `pack-setup.ts` | `LONGEST_SLUG` | `130` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `pack-setup.ts` | `MAX_APPROVERS` | `3` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `pack-setup.ts` | `MAX_ENTRIES` | `50` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `pack-setup.ts` | `MAX_SUBMITTERS` | `5` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `profile.ts` | `MAX_NAME` | `80` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `settings-in-effect.ts` | `SETTINGS_CACHE_MS` | `5_000` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `snapshots.ts` | `MAX_FROZEN` | `7_500_000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `snapshots.ts` | `MAX_INTRO` | `4000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `snapshots.ts` | `MAX_SNAPSHOTS` | `500` | Operator | A cap of the same kind as Metrics per Workspace, so it belongs to the Installation. |
| `snapshots.ts` | `MAX_WORD` | `600` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `snapshots.ts` | `MAX_YEARS_BACK` | `10` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `team.ts` | `MAX_CONTACTS` | `1000` | Operator | A cap of the same kind as Metrics per Workspace, so it belongs to the Installation. |
| `trial-end.ts` | `TRIAL_GRACE_DAYS` | `7` | Operator | How long the data of an ended trial can be downloaded before it is deleted; a regulated install wants longer. |
| `trials.ts` | `DEFAULT_TRIAL_MAX` | `200` | Fixed | A trial must stay small and cheap whatever the operator wants (spec 0021); the count of trials is already an Installation Setting. |
| `trials.ts` | `TRIAL_DELIVERIES_PER_DAY` | `50` | Operator | Trial abuse guard that follows the server's mail budget. |
| `trials.ts` | `TRIAL_KEYS_MAX` | `2` | Fixed | A trial must stay small and cheap whatever the operator wants (spec 0021); the count of trials is already an Installation Setting. |
| `unused-workspaces.ts` | `PER_RUN` | `200` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `unused-workspaces.ts` | `UNUSED_WAIT_DAYS` | `14` | Operator | How long a warned unused Workspace gets before deletion; the operator already sets the 'after' part. |
| `view-designs.ts` | `MAX_WORKSPACE_DESIGNS` | `100` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `workspace-limits.ts` | `GRACE_DAYS` | `14` | Operator | Grace is a commercial rule tied to Sizes: open for self-hosters, set by Ziffr Cloud on hosted (ADR 0013). |
| `workspace-limits.ts` | `GRACE_EVERY_DAYS` | `90` | Operator | Grace is a commercial rule tied to Sizes: open for self-hosters, set by Ziffr Cloud on hosted (ADR 0013). |
| `workspace-limits.ts` | `LABEL_MAX` | `30` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `workspace-limits.ts` | `LIMIT_MAX` | `1_000_000` | Fixed | The Ziffr Cloud contract: the open code's side of a signed API that Ziffr Cloud is built against. |
| `workspace-limits.ts` | `SYNC_EVERY_MS` | `5_000` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `workspace-settings.ts` | `MAX_WORKSPACE_NAME` | `80` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |

### Logs, Audit Log and Usage (16)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `audit-log.ts` | `AUDIT_EXPORTS_PER_HOUR` | `10` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `audit-log.ts` | `AUDIT_EXPORT_CAP` | `50_000` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `audit-log.ts` | `AUDIT_PAGE_SIZE` | `100` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `audit-log.ts` | `AUDIT_RETENTION_DAYS` | `730` | Operator | Audit trail length: regulated companies keep it for years; the database refuses to remove younger events. |
| `installation-usage.ts` | `MAX_FILL` | `30` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `installation-usage.ts` | `USAGE_KEY_CALLS_PER_HOUR` | `60` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `installation-usage.ts` | `USAGE_MAX_DAYS` | `400` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `installation-usage.ts` | `USAGE_MIN_WORKSPACES` | `3` | Fixed | Privacy: Usage shows counts only when enough Workspaces stand behind them, so no figure points at one Workspace. |
| `usage-digest.ts` | `BUDGET_MS` | `8 * 60_000` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `usage-digest.ts` | `DIGEST_LAST_DAY` | `7` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `usage-digest.ts` | `DIGEST_NAMES` | `5` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `usage-report.ts` | `COUNT_AT_A_TIME` | `10` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `usage-report.ts` | `LOOKED_DAYS` | `30` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `usage-report.ts` | `MAX_RETENTION_SUGGESTIONS` | `10` | Fixed | Job internals: batch sizes and time budgets of the Retention and condensing jobs; the visible effect is MAX_VALUES_PER_RUN. |
| `usage-report.ts` | `UNUSED_DAYS` | `90` | Workspace | What a team counts as an unused Metric; changes only a suggestion, never data. |
| `usage.ts` | `VIEW_COUNT_DAYS` | `400` | Operator | Privacy and disk: how long daily View Counts are kept; below 90 days Usage numbers get thin. |

### Schedule and asking (14)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `asking-schedule.ts` | `EVERY_N_MAX` | `90` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `asking-schedule.ts` | `EVERY_N_MIN` | `2` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `calendar-links.ts` | `CALENDAR_FETCHES_PER_HOUR` | `60` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `period-record.ts` | `FIRST_WORDS` | `280` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `period-timeline.ts` | `GROUP_MINUTES` | `60` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `period-timeline.ts` | `NOTE_WORDS` | `70` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `record-value.ts` | `ATTEMPTS` | `12` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `record-value.ts` | `BUDGET_MS` | `5000` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `schedule.ts` | `CALENDAR_DAYS_AHEAD` | `90` | Person | A person's own taste: how far ahead their Calendar Link shows events. |
| `schedule.ts` | `CALENDAR_DAYS_BACK` | `30` | Person | A person's own taste: how far back their Calendar Link shows events. |
| `schedule.ts` | `MAX_SCHEDULE_AHEAD` | `366` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `schedule.ts` | `MAX_SCHEDULE_DAYS` | `90` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `schedule.ts` | `OVERDUE_DAYS_BACK` | `90` | Person | A person's own taste: how far back their overdue list reaches. |
| `versions.ts` | `COALESCE_MS` | `10 * 60 * 1000` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |

### Formulas, numbers and display (29)

| File | Constant | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `correlation.ts` | `MIN_PAIRS` | `6` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `dashboards.ts` | `MAX_INTRO` | `4000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `dashboards.ts` | `MAX_SETTINGS` | `200_000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `deck-content.ts` | `MAX_DEPTH` | `4` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `decks.ts` | `MAX_DOCUMENT` | `8_000_000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `design-analysis.ts` | `RECIPE_INPUT_POINTS` | `120` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `forecast.ts` | `FORECAST_MIN_POINTS` | `4` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `format.ts` | `MAX_AXIS_TICKS` | `50` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `formula.ts` | `FORMULA_MAX_BITS` | `8192` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `formula.ts` | `FORMULA_MAX_DIGITS` | `20` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `formula.ts` | `FORMULA_MAX_LENGTH` | `500` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `formula.ts` | `FORMULA_MAX_OPERATIONS` | `50` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `free-place.ts` | `COLUMNS` | `12` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `lock-summary.ts` | `LINES` | `5` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `numbers.ts` | `LARGEST_VALUE` | `1e15` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `numbers/period-words.ts` | `RULES_KEPT` | `16` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `page-data.ts` | `SOURCES_SHOWN` | `300` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `sample-data.ts` | `SAMPLE_PERIODS` | `24` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `search-query.ts` | `MAX_PERIODS` | `3` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `search-query.ts` | `MAX_QUERY` | `100` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `search-query.ts` | `MAX_TERMS` | `6` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `search.ts` | `MAX_BY_KIND` | `8` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `search.ts` | `MAX_PERIOD_RESULTS` | `6` | Fixed | Display or job tuning with no consequence worth a setting: cache lifetimes, flush intervals, list lengths, counts of things in a Workflow or Pack. |
| `snapshot-periods.ts` | `MAX_METRIC_PERIODS` | `400` | Fixed | Correctness: how periods and Schedules are counted (specs 0022, 0023); changing them changes what overdue and next mean. |
| `theme-tokens.ts` | `MAX_IMAGE` | `3_000_000` | Fixed | Bound on what a browser or program may send; the database and the screens are sized for it. |
| `widget-designs.ts` | `MAX_WIDGET_NESTING` | `6` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `widget-metrics.ts` | `MAX_DEPTH` | `5` | Fixed | Correctness: the limits that keep a formula or widget from running away, being slow or giving a wrong number. |
| `workspace-data.ts` | `CLOSED_ACTIONS_SHOWN` | `500` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |
| `workspace-data.ts` | `PAGE_ROWS` | `1000` | Fixed | Protects the database from a runaway program: page sizes, request sizes, idempotency, per-day abuse caps. |

### Not counted above: arrays and inline numbers

| File | What | Value | Level | Reason |
| --- | --- | --- | --- | --- |
| `webhook-limits.ts` | `WEBHOOK_RETRY_WAITS_MS` | 1 min, 5 min, 30 min, 2 h, 12 h | Fixed | What a partner's program relies on (section 3). |
| `installation-settings.ts` | the Turnstile check's timeout | 5 s | Fixed | A wait for a third party on a page a person is looking at. |
| `installation-replies.ts` | the DNS lookup timeout | 4 s | Fixed | Same. |
| `telegram-api.ts`, `slack-api.ts` | request timeouts | 10 s (Telegram plus its long-poll wait) | Fixed | Provider calls; a longer wait holds a worker, a shorter one loses messages. |
| `outbound-request.ts` | `OUTBOUND_TIMEOUT_MS` (10 s) and the deadline's upper bound | 10 s | Fixed | Security: every request to an address a person gave (Webhooks, Calendar Links) is bounded here; a longer one lets a slow address hold the server. |
| `record-value.ts` | back-off between attempts | 5 to 20 ms times the attempt | Fixed | Internal retry on a database conflict. |

## 5. Open questions for the owner

1. **Where do operator values live?** Options: (a) one Installation Setting each, with its own environment variable, as today; (b) one grouped setting per area (sending limits, log lengths, capacity) holding several numbers. *Recommendation: (a) for the 23 Operator rows, named `ZIFFR_LIMIT_*` and `ZIFFR_KEEP_*`, grouped into three new sections on the page ("Sending limits", "How long logs are kept", "Capacity"); that is what spec 0025 already does and the environment still wins.* Say a yes or no to the list in section 2 as a whole, or strike rows.
2. **Hosted Ziffr.** Which values does Ziffr Cloud pin so a hosted Workspace never sees them move (grace days, trial days, the Size's limits)? *Recommendation: all Workspace Limits and grace values, trial days and the unused-Workspace wait are pinned by the hosted deployment and shown on the page as "set by Ziffr Cloud"; every capacity and log value stays the operator's.*
3. **Audit Log below two years.** The page would allow 365 to 3,650 days. A shorter Audit Log is a weaker record of who did what. *Recommendation: floor of 365 days, a plain warning below 730, and never lowered while any Retention or Approval refers to an older event.*
4. **Quiet hours and week start** (named in the ticket) are not constants. They need new columns, a place in a person's settings and rules for who may change them. *Recommendation: separate tickets, a Person setting each, with a Workspace default; not part of this list.*
5. **May a Workspace lower an Operator's alert limits?** Row 5 and 6 let Owners and then each person go down only. *Recommendation: yes, down only, Owners for the Workspace, each person for themselves; never up.*
6. **What happens to what already exists when a cap is lowered** (Webhooks from 5 to 2 on a Workspace with 4). *Recommendation: never delete or switch off; the Workspace keeps what it has and only new ones wait, as with Metrics over the limit.*
7. **Should values per day ever depend on Size?** ADR 0013 says no (they are abuse safeguards, the same everywhere). *Recommendation: confirm; then rows 10 and 11 are Operator-wide and Ziffr Cloud never sets them.*
8. **Limits the database enforces.** `METRICS_PER_DAY`, the trial counts and `claim_trial_send` are checked inside the database, so a page setting must reach SQL. *Recommendation: leave those out of the first round; build the sending, log and job values first (all of them are read in TypeScript), and give each database-enforced one its own migration later.*
9. **Replies with an empty `ZIFFR_INBOUND_AUTHSERV_ID`** (section 3). *Recommendation: show the warning on the page; decide separately in a security ticket whether empty should mean "no replies by email".*
10. **Order of work.** *Recommendation: three tickets: sending and abuse caps (rows 1 to 4 and 7 to 17), keeping and trial days (rows 18 to 25), then the Workspace and Person levels (rows 5, 6 and 26 to 30) after question 4 is answered; each with the ranges above checked by a test, the page's help in plain words and a release note.*
