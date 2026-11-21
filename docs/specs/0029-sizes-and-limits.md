# 0029 Sizes and limits: a Size per Workspace on hosted Ziffr, and Workspace Limits in the open code

**Status:** done. **Tracking issue:** #258 (label `tracking`); tickets #264 to #272 carry `spec:0029`. Its security review is in #272. The decisions that are hard to reverse, and the options weighed, are in [ADR 0013](../adr/0013-hosted-ziffr-priced-by-size-billing-outside-marketplace-without-code.md).

## Problem Statement

Ziffr can be run by anyone, but most teams will not run a server to track their numbers. They want to sign up, try it and pay by card. Nothing in Ziffr today can be paid for: a Trial Workspace (spec 0021) is deleted after its days are over, and an ordinary Workspace has no limit at all.

Whatever hosted Ziffr sells must not leak into the code self-hosters run. A self-hoster should never meet a price, a payment screen or a limit they did not set. And the people paying need to know, at every moment, what they pay for, what happens when they grow past it, and that their numbers never stop arriving because of a bill.

## Solution

**Hosted Ziffr** is an Installation run by Ziffr in the EU. Each Workspace on it has a **Size**, booked self-serve by card by one of its Owners. The Size is named by how many Metrics the Workspace may hold, and nothing else: members are unlimited and every feature is included at every Size. Self-hosting stays free and without limits.

The work splits in two:

- **In the open code (this repository):** a generic **Workspace Limit**, the most Metrics a Workspace may hold, unlimited unless someone sets it. An Installation Admin sets it, or **Ziffr Cloud** does through an API with a credential of its own. Around it come the rules any operator could want: what happens over the limit, a trial that turns into an ordinary Workspace instead of being deleted, deleting Workspaces nobody uses, and showing Owners and Admins their Size and usage. **Archived Metrics** make room without deleting history.
- **In Ziffr Cloud (a private repository):** Sizes and prices, Stripe Billing with Stripe Tax, invoices, and the pages where Owners book and pay. This spec describes Ziffr Cloud only as the interface it uses.

## User Stories

1. As someone trying Ziffr, I want 14 days with every feature, and then to keep my Workspace for free instead of losing it, so that trying costs me nothing and I can decide later.
2. As an Owner, I want to see on one page which Size my Workspace has, how many of its Metrics I use, and when anything changes, so that I am never surprised by a limit or a bill.
3. As an Owner, I want to book a bigger Size with my card in a few minutes, and have it apply at once, so that my team is never held up.
4. As an Owner, I want to pay yearly and get two months free, so that a tool we keep costs less.
5. As an Owner of a business, I want prices without VAT, a correct EU VAT invoice, and reverse charge with our VAT ID, so that our bookkeeping accepts it.
6. As an Owner, I want to move to a smaller Size at the end of the period, and be told which Metrics to archive first if we hold too many, so that I never pay for more than we use.
7. As an Owner, I want to cancel at any time, effective at the end of the period, and keep my Workspace on Free, so that cancelling never deletes our numbers.
8. As an Admin, I want to see the Size and how many Metrics we use, but never the payment details, so that I can plan without seeing the card.
9. As anyone who creates Metrics, I want to see when the Workspace is near its limit and what happens when it is reached, so that I know why I cannot make another.
10. As a team that grew past its Size, I want 14 days and a little room (10 % more Metrics) before new Metrics wait, so that a busy week does not stop us.
11. As a team over its Size, I want every existing Metric, value, Prompt, Workflow and dashboard to keep working, and every value to keep arriving, so that a bill never costs us data.
12. As a Metric Owner, I want to archive a Metric we no longer track, keep its history readable, and bring it back later, so that making room does not mean deleting.
13. As an Owner of a Free Workspace I stopped using, I want an email before it is deleted, and to keep it with one sign-in, so that nothing disappears by surprise.
14. As someone who left a Free Workspace unused, I want it deleted, key and all, so that a service I forgot does not keep my data.
15. As a self-hoster, I want Ziffr without limits, prices or payment screens unless I set a limit myself, so that hosting it costs me nothing.
16. As an Installation Admin, I want to set a limit for one Workspace, or a default for all, so that I can run Ziffr for several teams with fair shares.
17. As whoever runs hosted Ziffr, I want Ziffr Cloud to set limits through an API that can do nothing else, so that a leak of its key reveals no Workspace's data.

## Implementation Decisions

### What hosted Ziffr sells (Ziffr Cloud, for reference)

| Size | Metrics | Monthly | Yearly (two months free) |
| --- | ---: | ---: | ---: |
| Free | 10 | €0 | €0 |
| Small | 50 | €29 | €290 |
| Team | 200 | €79 | €790 |
| Business | 1,000 | €199 | €1,990 |
| Larger | more than 1,000 | on request | on request |

- Prices are in EUR only and shown without VAT for businesses. people buying for themselves see prices with VAT, as EU consumer law requires; Ziffr Cloud asks "business or private" before showing a price.
- Members are unlimited. Guests, Contacts, Feeds and assistants never cost anything. Every feature is in every Size.
- Values per day and storage are safeguards against abuse, the same at every Size, never a price. They are the limits Ziffr already has (per Access Key, per Feed, per Workspace for email), not new ones.
- None of this table is in the open code. Ziffr itself knows a Size only as a Workspace Limit with a name.

### Workspace Limits in the open code

- **What is limited:** the number of Metrics a Workspace holds, Derived Metrics included, Archived Metrics not. Nothing else, so that "every feature at every Size" holds by construction.
- **Where it is stored:** a new table `workspace_limits` (service role only): the Workspace, `metrics` (a whole number, or none for no limit), `label` (the name to show, such as "Small", plain text of at most 30 characters), an optional coming change (`next_label`, `next_on`) shown to Owners and Admins, who set it (`installation_admin` or `cloud`) and when. A Workspace without a row has the Installation's default.
- **The Installation's default:** two new Installation Settings in a section "Workspace Limits", `ZIFFR_DEFAULT_METRICS_LIMIT` (unset means no limit) and `ZIFFR_DEFAULT_LIMIT_LABEL` (such as "Free"). Hosted Ziffr sets 10 and "Free". A self-hoster sets nothing and sees no limit anywhere.
- **Who sets one:** an Installation Admin on the Installation Settings page, or Ziffr Cloud through its API (below). Both write the same row; the last write wins, and the page says when the limit it overrides was set by Ziffr Cloud. A Workspace Owner never sets their own limit.
- **What the Installation Admin sees:** the Workspace Limits section lists Workspaces by name with their Metric count, limit, label and who set it, and nothing else of them. Being an Installation Admin still shows no Workspace's data (spec 0025); a name and a count are what they need to pick the right Workspace.
- **Where it is enforced:** in the database, as the trial's 25 Metrics are today (`metrics_per_trial`). A trigger on `metrics`, before insert and before an Archived Metric is brought back, locks the Workspace's row, counts its Metrics and refuses with `ZF441` when the rule below says so. Every way a Metric is made goes through it: the form, the Metric Catalog, Duplicate, the API, the MCP Server, a Pack (spec 0030) and the trial's sample data.
- **What a refusal says:** the core turns `ZF441` into one message, "This Workspace holds 50 Metrics, as many as its Size Small allows. Archive a Metric, or ask an Owner to change the Size." The API answers 403 with the code `workspace_limit` and the count and limit; the MCP Server's tools return the same words.
- **The demo** has no limit.

### Over the limit: 14 days and 10 % more

The rule, in the core (`workspace-limits.ts`) and in the trigger, with the same numbers:

- **The room:** a Workspace may go over its limit by 10 %, at least one Metric: 11 on Free, 55 on Small, 220 on Team, 1,100 on Business.
- **The grace:** the first time a Metric takes the Workspace over its limit, `workspaces.over_limit_since` is set. For 14 days after that, new Metrics may be made up to the room.
- **After the grace:** no new Metric may be made while the Workspace holds as many Metrics as its limit or more.
- **Back under:** once the Workspace holds no more than its limit (by archiving, deleting or a bigger Size), `over_limit_since` is cleared, and a later step over starts a new grace.
- **What never stops:** existing Metrics, their values, Prompts, Workflows, Approvals, dashboards, Snapshots, View Links, Feeds and the API keep working. Values keep arriving by every Source. Only making a new Metric, or bringing an Archived Metric back, waits.
- **A limit set below the count** (a trial that ends with 25 Metrics, a cancelled Size, an Installation Admin's choice) starts the grace the same way. The Workspace is then above its room, so nothing new is made, and the 14 days only decide when the Owners' banner changes from "until 3 December" to "now".
- **Who is told:** Owners and Admins see a banner on every page while the Workspace is over its limit, with the days left and a link to Size and usage. Owners get one email when the grace starts and one when it ends. Members see the note on the New Metric form.

### Archived Metrics

- **What it is:** a Metric kept with its description, values, history and Versions, that asks for nothing and takes no values. It does not count towards the Workspace Limit. Owners, Admins and the Metric's own Metric Owner archive it and bring it back; bringing it back counts again and may be refused by the limit.
- **What it does:** Workflows skip it, so no Prompt, reminder or Escalation goes out for it. A value sent for it by any Source is refused with "This Metric is archived". Feeds that submit to it get the same answer for it and keep working for their other Metrics.
- **Where it shows:** under a filter "Archived" on the Metrics page, not in the Pool and not in pickers. A widget that shows it keeps drawing its history, marked "Archived". The API lists it only when asked (`archived=true`).
- **Glossary:** adds **Archived Metric**. "Archive" was an _Avoid_ word for Snapshot; it comes off that list, which now avoids "archived copy" instead. A Snapshot keeps what a dashboard showed; archiving puts a Metric aside. The two never meet in one sentence.

### Demo Mode becomes read-only

- **The rule:** visitors look around the demo and switch between its made-up people to see each one's view, but nothing they do changes it. Nothing is saved, so there is nothing to reset, and the **Reset** button goes.
- **One refusal, everywhere:** every core function that writes refuses an Actor in the demo Workspace with one sentence, "The demo can't be changed. Start a trial to try it with your own numbers." (or, where trials are not offered, "The demo can't be changed."). Server actions show it as any other refusal (#232's way of saying why). The demo has no Access Keys, so the API and the MCP Server never reach it; their write endpoints refuse it the same way if they ever do.
- **One check, not many:** the check lives where an Actor is turned into a write, in the core (`assertCan` and the few writes outside it), not in each page. Today's scattered demo checks that refuse one thing each ("Contacts cannot be added in the demo") become the one sentence.
- **What the screens do:** forms, buttons and menus that write stay visible so visitors see what Ziffr offers, but say the sentence when used instead of failing. The Sources page and the simulated answers in the Outbox (`demo-channels.ts`), which today let a visitor play a submitter or a recipient, show what would happen without saving it.
- **The seed:** `demo_reset` stays as the function that fills the demo, for Docker's first start (`docker/migrate.mjs`) and for `prototype:reset`. The nightly `POST /api/jobs/demo-reset` (`docker/clock.mjs`, 03:30 UTC) stays only if the seed's dates must move with the calendar so the demo keeps a current period; the ticket checks which, and removes the job otherwise.
- **Why:** a shared demo that anyone may change shows the next visitor someone else's mess, needs a reset that races with visitors, and is one more place where a write path must be kept safe. A Trial Workspace (spec 0021) is where people try Ziffr with their own numbers.
- **Glossary:** **Demo Mode** loses "resetting it" and says that nothing a visitor does is saved.

### Size and usage, in the app

- **Workspace settings** gains a section **Size and usage** for Owners and Admins: the label ("Small"), "38 of 50 Metrics", the grace if there is one, and the coming change ("Changes to Team on 1 December 2026"). On a self-hosted Installation without limits the section shows only the count of Metrics.
- **For Owners only**, where `ZIFFR_CLOUD_URL` is set: **Change Size** and **Billing and invoices**, which hand them over to Ziffr Cloud (below). Admins see the same section without these buttons and without any payment details, which Ziffr never holds.
- **The New Metric form**, the Metric Catalog and Duplicate show "48 of 50 Metrics" once the Workspace holds 90 % of its limit or more. They show the refusal's words before anyone fills in the form, not after.
- **The Audit Log** records `workspace.limit_changed` with the old and new limit and label and who set it (an Installation Admin, by name, or Ziffr Cloud), and `metric.archived` and `metric.restored`.

### Trials on hosted Ziffr: 14 days, then Free

- **The trial is spec 0021's Trial Workspace.** Hosted Ziffr sets `ZIFFR_TRIAL_DAYS=14`, so every new Workspace starts as one, with every feature. Spec 0021's note that a paid trial "needs a different word" is answered: the owner chose to keep the one word.
- **A new setting, `ZIFFR_TRIAL_THEN`:** `delete` (the default, as spec 0021 has it today, for the public demo) or `keep`. With `keep`, at `trial_ends_at` the Workspace is not closed. It becomes an ordinary Workspace with the Installation's default limit (10 Metrics, "Free" on hosted Ziffr). `trial_ends_at` stays as a record, and `trial_kept_at` is set.
- **What changes at that moment:** invitations open, Connectors reach everyone as in any Workspace, and Access Keys and Feed Keys keep the end date they were made with instead of the trial's. A trial with more than 10 Metrics is then over its limit, and the grace above applies.
- **Booking during the trial ends it at once:** a limit Ziffr Cloud sets with `endTrial` turns the Trial Workspace into an ordinary one with that limit, the same way.
- **The words:** the trial bar and the email the day before say "Your trial ends on 3 December. Your Workspace then stays, on Free: up to 10 Metrics." with the label and number from the settings. The ended screen of spec 0021 is not shown on such an Installation.
- during its 14 days the trial keeps spec 0021's rules: it reaches only its Owner, nobody can be invited, and it holds at most 25 Metrics. "Every feature" means every feature, not every person. A public sign-up page must not become a way to send invitations to any address someone types (ADR 0010). Booking a Size lifts this at once; a card proves more than an email address. The other way, letting trials invite, is weighed in Further Notes.
- one person may own at most three Workspaces on the default limit on such an Installation (`ZIFFR_DEFAULT_LIMIT_PER_PERSON`, default 3, unset on self-hosted Installations). Without it, one person could hold any number of Free Workspaces of 10 Metrics each, which is a Business Size for nothing.

### Unused Workspaces on the default limit

- **Which:** only Workspaces on the Installation's default limit (on hosted Ziffr, Free), only where `ZIFFR_DELETE_UNUSED_AFTER_DAYS` is set (hosted Ziffr: 90), never in a trial, never the demo. A Workspace with a limit of its own (a paid Size, or one an Installation Admin set) is never deleted for being unused.
- **What counts as used:** anyone of the Workspace signing in to it, or a value recorded for any of its Metrics by any Source. the owner named sign-ins and values from Feeds or email; counting every Source (Slack, Telegram, the form, the API) as well keeps a team that only answers Prompts from losing its Workspace. `workspaces.last_used_at` is updated at most once an hour per Workspace: where a sign-in is recorded in the Audit Log today (`audit-log.ts`), and in `record_observation`.
- **The warning:** after 90 days without use, one email goes to every Owner: what will be deleted, on which day (14 days later), that one sign-in or one value keeps it, and a link to sign in and download its values as CSV first. `unused_warned_at` is set.
- **The deletion:** 14 days after the warning, if still unused, the Workspace is deleted with its key destroyed first (spec 0028, ticket 5). As with trials, a person whose only Workspace this was is deleted with their sign-in. The Installation's audit keeps one line: the Workspace's id, that it was deleted as unused, and when.
- **Stopping it:** any use clears `unused_warned_at`, and the count starts again.
- **The job:** `POST /api/jobs/unused-workspaces`, with the job secret, daily, like `trial-cleanup`. It sends at most one warning per Workspace per 90 days and never deletes a Workspace it has not warned.

### Changing the Size (Ziffr Cloud, with one page in Ziffr)

- **Upgrading** takes effect at once and is charged prorated for the rest of the period (Stripe's proration). Ziffr Cloud sets the new limit as soon as Stripe confirms the payment.
- **Downgrading** takes effect at the end of the period, and only if the Workspace fits the smaller Size at the time it is booked. Ziffr Cloud reads the count through its API. If the Workspace does not fit, Ziffr Cloud sends the Owner back to **Make room** in Ziffr (`/settings/size/make-room?to=50`). That page lists the Metrics to archive, the ones with the oldest latest value first, ticked until enough are ticked. Ziffr Cloud never sees a Metric's name.
- **The downgrade at the end of the period:** Ziffr Cloud sets the new limit with the coming change shown until then. If the Workspace has grown past it again in the meantime, the grace applies; nothing is archived by itself.
- **cancelling** is always possible, takes effect at the end of the period, and moves the Workspace to the default limit (Free), even when it holds more Metrics than Free allows; the grace then applies. A rule that refused a cancellation would not be allowed for consumers and would feel like a trap to everyone else.
- **a failed payment** follows Stripe's retries for up to 14 days with emails to the booking Owner; then the Size is cancelled as above. The Workspace never stops collecting values.
- **deleting a Workspace with a paid Size** is refused until the Size is cancelled, so Ziffr never deletes something Ziffr Cloud still charges for. Deleting an ordinary Workspace is itself still to come (spec 0028).

### Who books

- **Only Workspace Owners** book, change and cancel a Size and see invoices. Admins see the Size and usage only (above). This matches the Workspace Role: an Owner manages billing, an Admin everything else.
- **The billing address** is the booking Owner's own: they enter it in Ziffr Cloud (company or name, address, VAT ID for a business), and Ziffr Cloud and Stripe keep it, never Ziffr. when that Owner leaves the Workspace, the Size keeps running; another Owner takes over billing in Ziffr Cloud with their own details, and until then the invoices still go to the address on file.

### The Ziffr Cloud API

- **Its own credential:** `ZIFFR_CLOUD_KEY` (at least 32 bytes), set in the server's environment only, never on the Installation Settings page. Without it, every endpoint below answers 404 and the handover buttons do not show. Two keys are derived from it with HKDF and labels of their own (`ziffr/cloud-api/v1`, `ziffr/cloud-handover/v1`), so a handover token can never sign an API call.
- **Signed requests, not a bearer key:** every call carries `Ziffr-Cloud-Signature: t=<unix time>, v1=<HMAC-SHA256 of the time, the method, the path and the SHA-256 of the body>`. It is checked in constant time and refused when it is more than five minutes old, as inbound email is (spec 0004). It is not an Access Key: it never reaches `/api/v1`, `/mcp` or a person's data.
- **What it can read:** `GET /api/cloud/v1/workspaces/{id}` gives whether the Workspace exists, its Metric count, its limit, label and room, `over_limit_since`, `trial_ends_at` and who set the limit. `GET /api/cloud/v1/limits` pages through every Workspace with a limit Ziffr Cloud set, for reconciling with Stripe. Nothing else: no name, no Metric, no value, no person.
- **What it can write:** `PUT /api/cloud/v1/workspaces/{id}/limit` with `metrics` (1 to 1,000,000, or none to fall back to the default), `label`, an optional `next` ({ label, on }) and an optional `endTrial`. The body is checked with zod at most 4 KB, and the label is plain text. It answers with the same shape as the read.
- **Handing an Owner over to Ziffr Cloud:** **Change Size** posts to `/settings/size/handover`. There the core checks that the person is an Owner of the Workspace (the session's person, never the demo's "view as"). It then builds a token of the Workspace's id and name, the person's id and proven email address, the role, a random nonce and an expiry five minutes ahead, signed with the handover key. The page submits it to `ZIFFR_CLOUD_URL` in a form post, so it never sits in a browser history, a server log or a `Referer`. Ziffr Cloud accepts each nonce once. The Workspace's name is in it so the Owner sees which Workspace they are booking for.
- **Coming back:** Ziffr Cloud sends the Owner back to Ziffr's Size and usage, which reads the limit from the database. Nothing Ziffr Cloud puts in that address is shown or trusted.
- **Audit and limits:** each write is recorded in the Workspace's Audit Log and the Installation's audit. The endpoints take at most 60 calls a minute; Ziffr Cloud needs far fewer.
- **What a leaked key can do:** set any Workspace's limit, which stops new Metrics in it, and read Metric counts. It cannot read data, make or delete anything, or stop values arriving. The threat model says so.

### Ziffr Cloud itself (outside this repository)

Listed so the interface above is complete; the work is tracked in Ziffr Cloud's own repository.

- **Stripe Billing** for Sizes, monthly and yearly; **Stripe Checkout** for booking by card; Stripe's customer portal for cards and invoices; proration on upgrade, changes at period end on downgrade.
- **Stripe Tax** for VAT: reverse charge for EU businesses with a valid VAT ID, VAT of the buyer's country for others, filed through the One-Stop Shop. Invoices from Ziffr's company.
- **Pages:** the Sizes with their prices, booking, changing, cancelling, invoices; all behind the handover token, for Owners only.
- **Larger than Business:** a contact form; Ziffr sets the agreed limit by hand.
- **Creators of paid Packs** (spec 0030) are paid later through Stripe Connect.

### Where hosted Ziffr runs

- Hosted in the EU only: the app, the database, backups and email sending.
- Backups are kept for 30 days. With spec 0028, a deleted Workspace is unreadable in every backup at most 30 days after it was deleted. The privacy page says so, in those words and nothing stronger.
- These are facts of the hosted Installation, not settings of the open code. The self-hosting guide keeps its own advice.

### Self-hosters

- Nothing changes unless they set something. Without `ZIFFR_DEFAULT_METRICS_LIMIT`, a Workspace Limit or `ZIFFR_CLOUD_KEY`, Ziffr has no limits, shows no Size and no billing buttons, and deletes nothing for being unused. Archiving Metrics is for everyone.
- An Installation Admin who runs Ziffr for several teams may set a default and limits per Workspace, and the same grace applies.

### Glossary

Adds **Size**, **Workspace Limit**, **Archived Metric** and **Ziffr Cloud**. Changes **Trial Workspace** to say that an Installation may keep a trial as an ordinary Workspace at its end.

### Docs and the threat model

- `docs/security/threat-model.md` gains the Ziffr Cloud API as a boundary when ticket 4 lands; until then, an entry under "Open work" names it.
- `docs/guides/self-hosting.md` gains "Limits per Workspace": the settings, the rule over the limit and the unused-Workspace job.
- The user guide's Workspace settings chapter gains Size and usage, and the Metrics chapter gains archiving.
- `.env.example` and `docker/README.md` gain the new settings.

## Testing Decisions

- The core against the database (`*.db.test.ts`), nothing inside it mocked, as every spec does.
- **The rule over the limit,** as a pure table test: under, at, over within the room, beyond the room, within and after the 14 days, back under and over again, a limit set below the count, the rounding of 10 % (1 at least). The trigger and the core give the same answer for every row: one test runs both.
- **Every way a Metric is made** is refused past the rule: the form's action, the Metric Catalog, Duplicate, the API, the MCP tool, a Pack and the trial seed. Parallel creations under the lock never pass the room (as the trial test does for 25).
- **What never stops:** over the limit, a Prompt goes out, a value arrives by email, Slack, the form, the API and a Feed, a Workflow runs and a View Link opens.
- **Archived Metrics:** refuse values from every Source, are skipped by Workflows, leave the count, are refused when brought back past the rule, and are listed by the API only when asked.
- **Trials kept:** with `keep`, a trial at its end becomes ordinary with the default limit, invitations open, keys keep their own dates, and the grace starts when it holds more; with `delete`, spec 0021's tests still pass unchanged. `endTrial` ends it at once.
- **Unused Workspaces:** last use is updated by a sign-in and by a value; the warning goes once after the days, to Owners only; the deletion waits 14 days and destroys the key; one sign-in or one value in between stops it; a Workspace with a limit of its own, a trial and the demo are never touched.
- **The Ziffr Cloud API:** a missing, wrong, old or replayed signature, a body changed after signing, and a handover token used as an API signature are all refused; without `ZIFFR_CLOUD_KEY` every endpoint answers 404. The read holds no name, Metric, value or person (a test lists the keys of the answer). A handover is refused to Admins and Members, and in the demo.
- **Size and usage:** Owners see the handover buttons, Admins see the same page without them; tried in the running app.

## Tickets

1. Archived Metrics: archive and bring back in the core, the Metrics page filter, Workflows skip them, values refused, the API's `archived` and the MCP tools; glossary. 
2. Workspace Limits: the table, the default settings, the trigger and the rule with the grace, the refusal's words in the app, API and MCP; the Installation Settings section. Blocked by 1.
3. Size and usage in Workspace settings, the near-limit note, the Owners' banner and emails, the Audit Log events. Blocked by 2.
4. The Ziffr Cloud API: signed requests, read, list and write, the handover for Owners, audit and limits; the threat model boundary. Blocked by 2.
5. Trials kept: `ZIFFR_TRIAL_THEN`, the end turning a trial into an ordinary Workspace, the words, `endTrial`, one Free Workspace per person. Blocked by 2 and 4.
6. Unused Workspaces: last use, the warning, the job, deletion with the key destroyed. Blocked by 2 and spec 0028's ticket 5.
7. **Make room**: the page that names the Metrics to archive for a smaller Size. Blocked by 1 and 4.
8. Demo Mode becomes read-only: one refusal in the core for every write by an Actor in the demo, the screens saying it, the Reset button and `resetDemo` gone, the simulated channels showing without saving, the nightly reset kept or removed; the glossary. Not blocked.
9. Docs: the self-hosting guide, the user guide chapters, `.env.example`, `docker/README.md`, release notes, and a security review of the whole spec.

In Ziffr Cloud's own repository, not sub-issues here: Stripe Billing and Tax, Checkout and the portal, the Size pages, proration and changes at period end, failed payments, the privacy page, EU hosting with backups kept 30 days.

## Out of Scope

- Prices, Stripe and invoices in this repository (ADR 0013).
- Limits on anything but Metrics: members, Guests, Contacts, Feeds, assistants, dashboards, values or storage. The existing safeguards against abuse stay as they are.
- Paid features and `ee/` (ADR 0013).
- Payment by SEPA Direct Debit or invoice; card only to start.
- Moving a Workspace between Installations, such as from hosted Ziffr to a self-hosted one, beyond the CSV export.
- Deleting an ordinary Workspace by its Owner (spec 0028 names it as still to come).
- Paid Packs and paying their creators (spec 0030).

## Decisions (2026-11-19, by the owner)

From a grilling session, written as decided:

1. **Who pays:** hosted Ziffr first, booked self-serve by card. Self-hosting stays free.
2. **The unit:** a flat price per Workspace by Size. The Size grows only with the number of Metrics. Members are unlimited and every feature is included at every Size. Guests, Contacts, Feeds and assistants never cost anything. Values per day and storage are only safeguards against abuse, never a price lever.
3. **Prices to start,** monthly, with two months free on a yearly plan, in EUR only, shown without VAT for businesses: Free, 10 Metrics, €0; Small, 50 Metrics, €29; Team, 200 Metrics, €79; Business, 1,000 Metrics, €199; more than 1,000 Metrics on request.
4. **`ee/` stays empty for now.** Money comes from hosting, the Marketplace and the managed-service license for IT providers (on request, ADR 0009). Recorded in ADR 0013, and can be revisited.
5. **The trial** (spec 0021) runs 14 days with everything, then becomes Free instead of being deleted.
6. **Over the Size:** 14 days of grace with up to 10 % more Metrics, then new Metrics are blocked. Existing Metrics, values, Prompts and dashboards keep working, and collecting values never stops. The same rule applies when a trial ends with more than 10 Metrics.
7. **Changing Size:** an upgrade takes effect at once, prorated. A downgrade takes effect at period end, and only if the Workspace fits the smaller Size; otherwise Ziffr names the Metrics to archive first.
8. **Unused Free Workspaces:** after 3 months with no sign-in and no values from Feeds or email, a warning email goes to the Owners. 14 days later the Workspace is deleted with its key destroyed (spec 0028). One sign-in, or values arriving, stops it.
9. **Who books:** only Workspace Owners, with a billing address of their own. Admins see the Size and usage, never the payment details.
10. **Where it runs:** hosted in the EU only, with backups kept for 30 days. So a deleted Workspace is unreadable in every backup at most 30 days after deletion. The privacy page will say so.
11. **Payments:** Stripe Billing with Stripe Tax, EU VAT through OSS. Creators are paid later through Stripe Connect.
12. **Billing code:** in a separate private service, Ziffr Cloud, in its own repository. The open code knows only generic limits per Workspace (number of Metrics), unlimited by default, set by an Installation Admin or by Ziffr Cloud. Self-hosters get no limits.

After reading the draft (also 2026-11-19), the owner accepted every point decided while writing, with these changes:

- **Free is one Workspace per person,** besides the demo (the draft had three).
- **The demo cannot be changed.** Visitors look around and switch between its made-up people, but nothing they do is saved, so there is no reset. Every server action and the API refuse writes in Demo Mode with one clear sentence.
- **The title** is "Sizes and limits": "plan" is an _Avoid_ word.
- **"Archive" stays the word for Metrics,** and comes off the _Avoid_ list under Snapshot.

## Decided while writing

Proposed in the draft and accepted by the owner on 2026-11-19, with the changes above; each is written into the decisions above.

1. **Prices for people buying for themselves** are shown with VAT, as EU consumer law requires; Ziffr Cloud asks "business or private" first.
2. **The Installation Admin's list** of Workspace Limits shows each Workspace's name and Metric count, nothing else.
3. **"Archive"** is the word for Metrics (a new glossary term, Archived Metric); it is no longer an _Avoid_ word for Snapshot.
4. **The trial keeps spec 0021's reach** for its 14 days: only its Owner, no invitations, at most 25 Metrics. Booking a Size ends the trial at once.
5. **One Free Workspace per person** (the owner changed this from three), besides the demo.
6. **Every Source counts as use** of a Workspace, not only Feeds and email.
7. **Cancelling** is always possible and moves the Workspace to Free at period end, even when it holds more Metrics; the grace applies.
8. **A failed payment** is retried for up to 14 days, then the Size is cancelled.
9. **A Workspace with a paid Size cannot be deleted** until the Size is cancelled.
10. **When the booking Owner leaves,** the Size keeps running and another Owner takes over billing with their own details.
11. **The unused-Workspace rule** is a setting of the Installation (`ZIFFR_DELETE_UNUSED_AFTER_DAYS`) that applies only to Workspaces on the default limit. Ziffr Cloud cannot delete a Workspace through its API.

## Further Notes

- **Why the limit counts Metrics.** It is the number that grows with the value a Workspace gets from Ziffr, it is easy to see and to count, and it costs nothing to be generous elsewhere: a team can invite everyone, connect every Feed and ask every assistant.
- **Why Ziffr Cloud cannot delete.** Deleting destroys a key and cannot be undone. The open code deletes only by its own rule, after a warning, and a single sign-in stops it. A key that only sets limits is a much smaller thing to lose.
- **Letting trials invite.** It would show Ziffr's team features in the trial itself. But the hosted sign-up is public, and a trial that can invite turns Ziffr into a way to mail any address (ADR 0010). A Free Workspace after 14 days can invite, within the invitation limits Ziffr already has (50 a day per Workspace and per person, three a day per inbox). Booking lifts it at once. If trials convert badly because of this, a middle way is to allow a few invitations, each to an address at the Owner's own email domain.
