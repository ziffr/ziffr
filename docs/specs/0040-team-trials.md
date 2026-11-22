# 0040 Trials for teams, only on hosted Ziffr, with Trial Limits that are numbers

**Status:** in progress. **Ticket:** #670 (the owner's decisions, 2026-11-22); the tracking issue is #670 and its sub-issues are labelled `spec:0040`. The owner reviewed the proposals on 2026-11-22 and accepted them as recorded under Decisions.

## Problem Statement

A Trial Workspace (spec 0021) shows Ziffr to one person. It reaches only its Owner and nobody can be invited (ADR 0010), so a team cannot try the thing a team buys Ziffr for: asking many people for numbers and showing the numbers to many more. The trial is also an Installation setting, `ZIFFR_TRIAL_DAYS`, that any operator can switch on, so a self-hoster can end up running a public sign-up for strangers, with all the abuse that follows, which is why ADR 0010 closed the trial so tightly.

The owner decided on 2026-11-22:

1. **A trial exists only on hosted Ziffr (ziffr.net), never on an Installation someone else runs.** After a trial a person has two ways on: subscribe (a Size on hosted Ziffr) or run Ziffr themselves.
2. **Teams may use a trial.** A trial is for getting a feeling whether Ziffr is worth it, so it offers as many features as possible, inviting colleagues included.
3. **The trial's limits are easy to adjust.** Not feature switches per Size (ADR 0013: every Size has every feature), but **Trial Limits**: numbers that can be changed in one place.

The reason ADR 0010 could not allow invitations was an operator of any size sending mail from its own domain to any address a stranger types. On hosted Ziffr that operator is Ziffr itself, who answers for the sender reputation of ziffr.net, can watch the whole picture and can move every number. That changes the trade-off, and ADR 0015 records it.

## Solution

1. **Trials belong to Ziffr Cloud.** An Installation offers trials only where `ZIFFR_CLOUD_KEY` is set. Without it the trial settings, the Installation settings page's Trials section and the sign-in page's trial column do not exist.
2. **Teams in a trial.** The Owner may invite colleagues (Members, Admins, Guests) within Trial Limits. They accept by signing in, which proves their address, and from then on every Connector reaches them as in any Workspace. Only people who have not accepted, and Contacts, stay out of reach.
3. **Trial Limits.** One short list of numbers (people, invitations a day, Metrics, messages a day, keys, Feeds, assistants, Webhooks, days, grace days) with defaults and ranges, set in one place and shown to the trial's Owner.
4. **The end.** Subscribing hands the Workspace over to Ziffr Cloud and keeps everything. Not subscribing closes it, and its Owner downloads a **Workspace Export** that a self-hosted Ziffr imports. The Workspace Export and its import are new and are most of the tickets. **There is no Free Size**: whoever wants Ziffr for free runs it themselves.

An operator can change the code of an open-source product, and nothing here pretends otherwise. This is about what the product offers by itself: a self-hosted Ziffr does not come with a trial to switch on, not about stopping anyone who edits the source.

## User Stories

1. As a person who wants to know whether Ziffr is worth it for my team, I want to invite my colleagues into my trial, so that I see Ziffr ask them for numbers.
2. As an invited colleague, I want the invitation and the first page to say that this is a trial, until when, and what happens after, so that I know what I am joining.
3. As an Owner in a trial, I want to see my Trial Limits (5 people, 10 invitations a day, 25 Metrics and so on) and how much of each I have used, so that I never hit one by surprise.
4. As an Owner, I want a View Link for a trial dashboard to end with the trial at the latest, so that I can show it outside the team during the trial.
5. As an Owner at the end of my trial, I want to subscribe with a card and find everything as it was, colleagues included, so that nobody starts again.
6. As an Owner at the end of my trial, I want to download the whole Workspace and run it on my own Ziffr, so that the trial is not wasted if I do not subscribe.
7. As a self-hoster, I want to import such a Workspace Export into my Installation and get my Metrics, values, dashboards, decks and Workflows back, with people as invitations I choose to send.
8. As someone who runs Ziffr myself, I want no trial, no trial setting and no sign-in text about one, so that my Installation has nothing it did not ask for.
9. As the operator of hosted Ziffr, I want to change a Trial Limit and have it apply to running trials without a release, so that I can answer abuse or a campaign the same day.
10. As someone whose address a stranger typed into an invitation, I want it to be one email at most, saying who sent it, and to be able to stop it, so that Ziffr is not a way to spam me.
11. As an Owner of ziffr.net, I want a trial never to send more email to strangers than I allow in total, whatever a thousand trials do.

## Implementation Decisions

Everything below is proposed by this spec and marked so in Decisions. The owner's three decisions above are the only fixed points.

### Words

- **Trial Workspace** changes: a Workspace on hosted Ziffr that a person or team makes to try Ziffr for a set number of days. It can have Members, and it ends by being subscribed to or closed.
- **Trial Limit** is new: one of the numbers that bound a Trial Workspace, set for every trial at once by Ziffr Cloud or by an Installation Admin of an Installation that offers trials. Not a Workspace Limit (counts Metrics of an ordinary Workspace), not a Sending Limit (the abuse safeguards that are the same for every Workspace), not a Settable Limit (set by levels). Avoid: plan limit, quota, entitlement.
- **Workspace Export** is new: the file an Owner downloads that holds a whole Workspace, for running it on another Installation. Avoid: backup, dump, archive (an Archived Metric is something else).
- **Trial Guide** keeps its meaning; one more step is added (invite colleagues, skippable). **Installation** changes: whether it offers trials is no longer a setting of its operator. **Ziffr Cloud** gains: it also sets the Trial Limits.

### Only on hosted Ziffr

- **The rule, in one function.** `trialsOffered()` in `packages/core/src/trials.ts` is true only when `ZIFFR_CLOUD_KEY` is set and the Trial Limits give a number of days. Every place that makes a trial, shows trial wording, runs the trial jobs for new trials, or reads `ZIFFR_TRIAL_*` asks it. Nothing else reads those settings.
- **What disappears without Ziffr Cloud:** the **Trials** section of the Installation settings page, the sign-in page's "Try it for real" column and its welcome page, `ZIFFR_TRIAL_DAYS`, `ZIFFR_TRIAL_MAX`, `ZIFFR_TRIAL_THEN` and `ZIFFR_TRIAL_WEBHOOKS` from the self-hosting guide (the settings move to the Cloud section as Trial Limits), and Try it for people who are not in a trial. The demo (`ZIFFR_DEMO`) is not a trial and stays; its refusal sentence points to hosted Ziffr's trial where one is offered (spec 0029's wording) and says nothing about trials elsewhere.
- **Exception:** how an existing trial ends (`ZIFFR_TRIAL_THEN`, `ZIFFR_TRIAL_WEBHOOKS`, `ZIFFR_TRIAL_GRACE_DAYS`) is still read without a Cloud key, so trials that exist never change their fate; and a `ZIFFR_TRIAL_DAYS` that is set without the key makes no Workspace at all until it is removed (fail closed, as a wrong value always did).
- **Without Ziffr Cloud there are simply no trials and no trial settings.** No self-hosted Installation offers trials today, so there is nothing to migrate and no warning to write.
- **What stays for an operator who wants a public demo of their own:** the shared demo. Spec 0029's `ZIFFR_TRIAL_THEN=keep` is no longer a setting: a trial that is subscribed to is made ordinary by Ziffr Cloud's `endTrial`, which exists already.
- **Not DRM.** The check is a flag in code any operator may edit, as every other check is. We do not obfuscate it, add a licence check or phone home. If someone patches it, they run a Ziffr that offers trials to strangers at their own risk and sender reputation; the product does not offer it.

### Trial Limits

Defaults are what hosted Ziffr starts with; the range is what the setting accepts (a value outside it is ignored and the default applies, as for other Installation Settings). They are constants in one file, `packages/core/src/trial-limits.ts`, with one test that every limit is listed in the self-hosting reference, the user guide and the Cloud API reference.

| Trial Limit | Default | Range | Today |
| --- | --- | --- | --- |
| Days a trial lasts | 14 | 1 to 30 | `ZIFFR_TRIAL_DAYS` (14 on hosted Ziffr, spec 0029) |
| Days its data stays after the end | 7 | 1 to 60 | `ZIFFR_TRIAL_GRACE_DAYS` |
| Trials at once | 500 | 1 to 100,000 | `ZIFFR_TRIAL_MAX` (200) |
| People in a trial (Members, Admins and Guests, counting the Owner and invitations still open) | 5 | 1 to 25 | none: 1 |
| Invitation emails a trial sends a day | 10 | 0 to 50 | none |
| Invitation emails all trials together send a day | 500 | 0 to 5,000 | none |
| Metrics | 25 | 5 to 100 | `TRIAL_METRICS_MAX` (25) |
| Messages a trial sends a day, over all Connectors | 100 | 10 to 500 | 50 |
| Access Keys that work | 2 | 1 to 10 | `TRIAL_KEYS_MAX` (2) |
| Feeds, and Feed Keys per Feed | 2 | 1 to 10 | 2 |
| Connected assistants | 1 | 1 to 5 | 1 |
| Webhooks (Workspace and personal together), and their sends a day | 2 and 200 | 0 to 10; 10 to 1,000 | spec 0037 |
| View Links that work | 5 | 0 to 20 | none |

- **One more rule is not a number:** the colleague part opens only after the Owner has recorded a value of their own (the Trial Guide's last step). A bot that signs in cannot answer a Prompt, so it cannot reach the invitations cheaply. Proposed; the number of values is 1.
- **Who sets them.** Ziffr Cloud, through a new signed call `PUT /api/cloud/v1/trial-limits` (and `GET`), in the Cloud API's format, body at most 4 KB, any limit left out is removed back to its default. It writes the same Installation setting rows the page does and marks them "set by Ziffr Cloud". **Hosted Ziffr's Installation settings page** shows the same numbers in a **Trial Limits** section for its Installation Admins; where Ziffr Cloud has set them the page shows them read-only, "Set by Ziffr Cloud", as spec 0029 already does for the Workspace Limits and the trial's days. The environment still wins over both, as in spec 0025. Ziffr Cloud cannot set a number outside its range, and cannot read anything of a trial but what its API reads today.
- **Applying them.** Changed numbers apply to every running trial at once, except the days, which apply to trials made afterwards (`trial_ends_at` is set when a Workspace is made and never moved, spec 0021). Lowering a Trial Limit never deletes or stops what a trial has: a trial over a new number keeps what it has and cannot add more, as with a Workspace Limit.
- **Enforced in the database, read from one place.** Today the trial's caps are literals in triggers (`metrics_per_trial`, `access_keys_in_trial`, `feeds_in_trial` and the assistant cap) and constants in the core. They move to one `trial_limits` row that the triggers and the core read, so a change needs no migration. A migration adds `trial_limits`, replaces the triggers (add-only: new migration files that `create or replace`), and adds two triggers: `people_in_trial` on `memberships` and `invitations` (a new error code, `ZF435`) and the invitation claim's daily counts for a trial (`claim_invitation_email` already counts per Workspace and per address; it gains the trial's and the Installation's counts, `ZF436`). Counts are taken under a lock on the Workspace row, as the Metric cap is, so invitations sent at once do not pass them.
- **Shown to the Owner.** The trial bar and **Try it** show "Your trial: until 3 December. 3 of 5 people, 4 of 10 invitations today, 12 of 25 Metrics" and the words of any limit that was reached, with when it resets. These come from one core function that returns the limits and what is used, for the Owner and Admins only; Members see the end date and what happens after, never the counts.

### Teams in a trial

- **Invitations** are the Workspace's own (spec 0004) with the Trial Limits on top, and everything the Workspace Limit and the invitation limits already do still applies. Roles: Member, Admin and Guest; a second Owner only by an Owner as everywhere. Per address: the three a day from all Workspaces that already exist, plus, in a trial, one open invitation per address per trial.
- **What an invited person is told**, in the invitation email, on the accept page and in the trial bar every Member sees: "<Owner's name> invited you to a trial of Ziffr that ends on 3 December. After that it either becomes a subscription or is closed and its data is deleted." The email names the sender and carries a one-click "Do not invite me again" link that stops invitation mail to that address from every Workspace on the Installation (a new row in a table only the service role reads; proposed). Members who joined a trial that is then closed are told so on the page and by email once, and a person whose only Workspace was it is deleted with their sign-in after the grace days, as spec 0021 has it for an Owner.
- **Connectors.** A Prompt, reminder, task or Alert is sent for real to every Member, Admin and Guest who accepted, on the Connector they chose; they proved their address by signing in. Slack and Telegram work as in any Workspace. The test is one change in `trialHoldsBack`: a recipient who is a member is no longer held back (ADR 0010's check was "is the Owner"). **Contacts stay simulated** in a trial: their details were typed by someone and nothing proves them, which is ADR 0010's original reason. The messages-a-day limit counts all of them together. An open invitation that has not been accepted is not a recipient.
- **View Links** work in a trial, within the number of links that work, and **end no later than the trial**, as Access Keys do today. A link shows a dashboard to someone outside the team and sends nothing, so it is no abuse path for mail. After a subscription the links keep the end date they were made with, as keys do.
- **Guests** may be invited, counted as people. **Domain Joining stays off in a trial**: it is an Owner approving strangers who ask, and nothing in a trial needs it. Offered again on subscription.
- **Packs, templates, the Metric Catalog and the API** work as in any Workspace. The MCP Server and Webhooks work as spec 0037 decided.
- **What a trial still never does:** write to Contacts for real, run past its end date, send more than its Trial Limits, make its Owner pay by itself (nothing is billed unless the Owner subscribes).

### The abuse analysis, again

ADR 0010 was right that a public sign-up must never become a way to message people who did not ask for it. What is different on hosted Ziffr, and why the line moves from "reaches only its Owner" to "reaches only people who accepted, and one invitation to the rest":

- **There is one message that goes to an address nobody proved: the invitation.** Everything else (Prompts, tasks, Alerts, replies) goes to people who clicked their invitation and signed in, so their address is proven and they said yes. That is a far smaller surface than ADR 0010 faced, where every Prompt to every typed Contact was one.
- **Who answers.** On an operator's Installation the operator of a public sign-up answers for a reputation they may not watch. On ziffr.net it is Ziffr, who watches sender reputation, bounces and complaints, and can set a Trial Limit to 0 the same day.
- **The numbers.** Per trial: 10 invitation emails a day and 5 people; per address: the existing 3 a day and one open invitation per trial; for all trials together: 500 invitation emails a day. A thousand trials therefore send at most 500 emails to strangers a day, not 50 each. All three are Trial Limits and the third is the lever against a campaign of abuse.
- **The sign-in.** A Trial Workspace needs a signed-in Owner, so the Turnstile check and the sign-in link limits of spec 0021 stay in front of it. The colleague part opens only after the Owner records a value.
- **The Outbox.** Whatever is over a limit is kept in the Outbox with the reason, as today, never dropped and never sent; the Owner sees "invitation emails today: 10 of 10, send the link yourself", as the existing text says.
- **The one-click stop** above, and a plain sender name, keep an invited stranger from being mailed again by this or another trial.
- **What this does not close.** A person with a real address can invite five addresses of their choice a day; that is also true of every ordinary Workspace on every Installation today, at 50. The numbers are lower, and they are numbers, so changing them is cheap. If it goes wrong the first step is `0`, which turns colleagues off without a release.

### The end of a trial

- **Subscribing.** **Change Size** (the handover of spec 0029) works in a trial. Ziffr Cloud sets the limit with `endTrial: true`; the Workspace becomes ordinary at once with the Size as its Workspace Limit, **keeping everything**: Members, invitations, Connectors (which now also reach Contacts), keys (with the end dates they were made with) and View Links. This is spec 0029's behaviour with the trial's Members added.
- **Not subscribing.** At its end the trial closes: the Owner and Admins may sign in and download, nobody can add or send anything, keys and Connector links are revoked, and Members see "This trial has ended" and who to ask. It is deleted after the grace days (7 by default, a Trial Limit), with its Workspace Key destroyed first. The Owner gets reminders 3 days and 1 day before the end, and one on the day it closes, each naming the two ways on and the deletion date. **The Owner may end it earlier** and may **Delete it now**, as today.
- **No Free Size (the owner, 2026-11-22).** Spec 0029 turned an unsubscribed trial into a Free Workspace of 10 Metrics, and cancelling a Size into a move to Free. Both go: a trial that is not subscribed to closes and is deleted after the grace days, `ZIFFR_TRIAL_THEN` goes, and the Sizes are Small, Team and Business, larger on request. Spec 0029 carries a change-of-course note. The code that seeds or names a Free Size, the "one default Workspace per person" rule, the unused-Free-Workspace rule on hosted Ziffr and the `workspaces_free` count in the usage API are tidied in ticket 6. **Decided by the owner, 2026-11-22:** cancelling a Size (or a failed payment's end) closes the Workspace as an ended trial is closed: read-only for the grace days with a Workspace Export, then deleted. Spec 0029 said cancelling never deletes numbers; a person who cancels is told this when they cancel, in the same words as a trial's end. The Workspace Limit and Size of self-hosted Installations, and their default label, are not affected.

### Workspace Export and import

Checked today: there is no export of a Workspace and no import. What exists is the Owner's CSV of values (`trialValuesCsv` and `valuesCsv` in `trial-end.ts`) and Export as Pack (`pack-export.ts`), which carries Metric Descriptions and templates but never a value, a person or a Workflow's state. This spec adds both directions, because "run it yourself" is a promise that needs them, and they are useful to anyone moving between Installations.

- **Who and how.** The Owner of a Workspace, from its settings (and from the trial's ended screen), downloads it as one file, after signing in again within the last 10 minutes. The file is built on the fly and streamed, never stored by Ziffr, and the download is in the Audit Log (who, when, size, not content). Admins and Members cannot; the demo cannot.
- **Format.** `ziffr-workspace` version 1: JSON Lines (one record per line, gzip allowed), the first line a header with the format name, the version, the Ziffr version, the Workspace's name and the date. Reference in `docs/reference/workspace-export.md` (hand-written prose) and `docs/reference/workspace-export.schema.json` (generated from the checks' definition, as the Pack's schemas are). Where a thing has a Pack file format already (Metric Descriptions, dashboard, deck and Workflow templates, Themes, in `@ziffr/pack`) the record reuses it, so the same checks serve both. Everything else has its own record kind with a JSON schema in the same package, MIT as the Pack format is, so anyone can read or write one.
- **Carried in version 1:** Metrics with their Descriptions, period, aggregation, polarity, formats, Tags, Target Ranges, Target Series and Projections; every value with its period, its Source and when it was recorded, and who submitted it as a name (never an id); Breakdowns; dashboards with their widgets; decks; Workflows; Themes; Groups and Shares as names of Groups and of people; the Workspace settings an Owner chose; **people as invitations**: name, email, Workspace Role and Groups, so that the new Owner decides whom to invite. Later versions may add Threads, Findings, Snapshots, Alerts and Retentions; each addition is a version number, and an import says what a newer file holds that this Ziffr does not read.
- **Never carried:** Access Keys, Feed Keys, Webhook addresses and secrets (the page lists their names so they can be made again), Connector links (Slack, Telegram), Contacts' details, anything sealed in the form it has in the database, the Workspace Key, the Audit Log, Delivery history and the Outbox. A person's Delivery Preferences and Alerts wait for a later version.
- **Sealed data.** Export opens sealed data with the Workspace Key (ADR 0012) and writes it in the clear into the file; the file is as private as the Workspace was, and the download page says so. Import writes through the core's ordinary operations, so everything sensitive is **sealed again under the new Workspace's own key**, which the Installation wraps with its own `ZIFFR_SECRETS_KEY`. No ciphertext, wrapped key or key id crosses.
- **Import creates a new Workspace.** It does not merge into an existing one. The person who imports becomes its Owner; every id in the file is read as a label and replaced by a new one, so a file cannot name a row of another Workspace. Values are recorded as Imports (Source), with the submitter's name kept as text. People become open invitations that send nothing until the new Owner presses **Invite everyone** (within the new Installation's limits).
- **Checks, as for any untrusted file (AGENTS rule 4):** the size of the file and of the unzipped text are capped before reading (default 200 MB and 1 GB, an Installation setting), a record and line count is capped, every record is checked against its schema, strings by the Pack's plain-text rules (length, no control characters, no markup that is later rendered as such), numbers are finite and within the field's precision, periods and dates are valid and in range, references resolve inside the file, names are unique where the Workspace needs them, and no query is built from a string in the file. A file that fails reports the line and the reason and creates nothing: the import writes into a Workspace marked importing, in batches, and deletes it (key destroyed) on the first failure, so a half import is never left.
- **Limits.** The import is refused up front when the file holds more Metrics than the destination's Workspace Limit allows, and says how many; it never goes over by grace. Its values count as any other imports for the daily value limits' purposes only where those apply to Imports today. It runs as a job with a progress page, not in one request.
- **Where it is offered:** on every Installation that is not hosted Ziffr, as **New Workspace → From a Workspace Export**, for anyone who may make a Workspace there. Not on hosted Ziffr in version 1: a new Workspace there is a trial and a trial is for trying. (If wanted, "import after subscribing" is a later ticket.)
- **Why it matters, in the owner's words:** export and import are also a friendly way to move a trial to a self-hosted Installation, not only the way out for someone who did not subscribe.
- **Round trip, the test that matters:** export a seeded Workspace, import it into a second stack, and compare every Metric's values, targets and dashboards value for value, with different ids and a different key.

### What changes for self-hosters

- `docs/guides/self-hosting.md`: the "Trials" settings table and "Offering trials" are replaced by a short section "Trials are hosted Ziffr's", saying what an Installation with `ZIFFR_TRIAL_DAYS` does now and that the Workspace Export is how a trial's data arrives. `ZIFFR_TRIAL_*` leave the reference; `docs/reference/cloud-api.md` gains the Trial Limits call. The sign-in page loses the trial column where no Ziffr Cloud key is set. The user guide's Installation settings chapter loses **Trials** and gains **From a Workspace Export** in the Workspaces chapter. `.env.example` and `docker/README.md` lose the trial settings. Migrations are add-only, new files only.
- The Docker image and the compose file change nothing else.

## Testing Decisions

- **The rule:** a table of settings (Cloud key set or not, days set or not) against what `trialsOffered`, the sign-in page and the welcome page do; a Workspace cannot be made as a trial without the Cloud key, and no trial setting is read without it.
- **Trial Limits:** each number and its range, at the lower and upper edge; the environment, the page and Ziffr Cloud in that order; a changed number applies to a running trial; lowering never deletes. A test lists the limits in `trial-limits.ts` and fails when one is missing from the user guide, the self-hosting reference or the Cloud API reference.
- **Teams:** the 6th person, the 11th invitation email, the 501st invitation email of the Installation, and ten invitations at once under the lock, all by the database; an open invitation counts as a person; a second open invitation to one address; no invitations before the Owner's first value.
- **Reaching:** a Member's Prompt is sent for real in a trial and a Contact's stays in the Outbox with the reason; an unaccepted invitation is not a recipient; the messages-a-day limit holds under parallel sends.
- **View Links and keys:** a link made in a trial never outlives it, and the number that work holds.
- **End:** a trial that is not subscribed to is closed and deleted, never made Free, and cancelling a Size closes the Workspace the same way; subscribing keeps Members, invitations, keys and links and makes Connectors reach Contacts; closing revokes and holds back; deletion destroys the key and every row (the existing test of tables with a `workspace_id`).
- **Export and import:** the round trip above; a Member and an Admin cannot export; the export needs a recent sign-in; no key, secret or Webhook address is in the file (a search of the file for known secrets); import refuses a file that is too big, has a wrong type, an unknown reference, an id of another Workspace, a huge number, markup in a name, a count over the Workspace Limit; a failed import leaves no Workspace and no key; everything sensitive is sealed under the new key (a read with the old key fails).
- **Words and pages** tried in the running app (the trial bar, Try it, the invitation email and accept page, the ended screen, the Export and import pages), vale on all docs, and the user guide updated.

## Out of Scope

- Feature switches per Size, a catalogue of "what each Size includes", or any price in the open code (ADR 0013).
- Trials on Installations others run, in any form, and a licence or technical lock against patching the check.
- Merging an import into an existing Workspace; importing on hosted Ziffr; exporting for a one-way move into hosted Ziffr; a passphrase on the Workspace Export file (the file is as private as the Workspace; people may encrypt it themselves).
- Domain Joining in a trial; Contacts reached for real in a trial; more than one trial per person (spec 0021's rule stays: one live trial, and Ziffr Cloud's three-Workspaces rule for the default limit).
- Threads, Findings, Snapshots, Alerts, Retentions and Delivery Preferences in the Workspace Export's first version.
- A per-Workspace override of a Trial Limit (extending one trial for one customer). A later Ziffr Cloud call may do it; today the numbers are the same for every trial.

## Decisions

**Fixed by the owner on 2026-11-22, before this spec:** trials only on hosted Ziffr; teams may use them; the limits are adjustable numbers and not feature switches.

**Accepted by the owner on 2026-11-22, after reading the proposals (#671):**

1. A trial exists only where `ZIFFR_CLOUD_KEY` is set; the trial settings, the settings page's Trials section and the sign-in column disappear without it. This is a product choice, not DRM. There are no self-hosted Installations yet, so no transition is written: without the key there are simply no trials and no trial settings.
2. Trial Limits and their defaults as in the table: 14 days, 7 grace days, 5 people, 10 invitation emails a day (500 for all trials together), **25 Metrics**, 100 messages a day, 2 keys, 2 Feeds, 1 assistant, 2 Webhooks, 5 View Links.
3. Ziffr Cloud sets Trial Limits through its signed API, the hosted settings page shows them (read-only where Cloud set them), the environment wins, a change applies to running trials at once, and the database reads them from one row.
4. Invitations open after the Owner's first value; Guests allowed; Domain Joining off; Contacts stay simulated; View Links allowed and end with the trial.
5. Invited people are told it is a trial, until when and what happens after; the invitation email has a one-click "Do not invite me again" that works across the Installation.
6. Subscribing keeps everything (Members included); not subscribing closes the trial, offers the Owner a Workspace Export and deletes after the grace days. **There is no Free Size any more**; whoever wants Ziffr for free runs it themselves.
7. A Workspace Export, Owner only, after a recent sign-in, streamed and not stored, in version 1 carrying Metrics, values, targets, dashboards, decks, Workflows, Themes, Groups, Shares and people as invitations, and none of the secrets, keys or Connector links; an import into a new Workspace on Installations that are not hosted Ziffr, re-sealed under its own key and checked as an untrusted file. Export and import are also a friendly way to move a trial to a self-hosted Installation.

**Decided by the owner, 2026-11-22:** cancelling a Size closes the Workspace like an ended trial: read-only for the grace days with the Workspace Export offered, then deleted. The emails before the deletion offer the export.

## Tickets

Each is one pull request, a sub-issue of #670.

1. **Trials belong to Ziffr Cloud:** `trialsOffered()`, the settings and page sections and the sign-in column gone without a Cloud key, the self-hosting guide, tests. Not blocked.
2. **Trial Limits as numbers:** `trial-limits.ts`, the `trial_limits` row, the triggers and the core reading it (Metrics, keys, Feeds, assistants, messages, Webhooks), the Installation settings section and `PUT/GET /api/cloud/v1/trial-limits`, the docs test, db tests. Blocked by 1.
3. **People in a trial:** the people limit and `ZF435`, the invitation limits (per trial, per Installation, one open per address) with `ZF436`, the first-value gate, the Owner's view of usage on Try it and the trial bar, db tests. Blocked by 2.
4. **Reaching the team:** `trialHoldsBack` lets accepted members through, the messages-a-day limit over all of them, Contacts stay simulated, the words in the Outbox and on Try it, Webhooks and View Links in a trial (View Links end with the trial), db tests. Blocked by 3.
5. **What an invited person is told:** the invitation email and accept page, the trial bar for Members, the stop link ("Do not invite me again") and its table, the ended message. Blocked by 3.
6. **The end of a trial for a team, and no Free Size:** subscribe keeps Members and everything (`endTrial` with Members), closing for the team, the reminders (3 days, 1 day, the day), the deletion with the key, `ZIFFR_TRIAL_THEN` removed, cancelling a Size closing the Workspace like an ended trial, the code that seeds or names a Free Size (`ZIFFR_ONE_DEFAULT_PER_PERSON` on hosted Ziffr, the unused-Workspace rule there, `workspaces_free` in the usage API, tests and screens that say Free), the user guide's trial lines. Blocked by 4.
7. **The Workspace Export format:** `docs/reference/workspace-export.md`, the record schemas and checks in `@ziffr/pack` (reusing the Pack's), a reader and writer in the core with no database, round-trip tests of the format. Not blocked.
8. **Export as the Owner:** `exportWorkspace(actor)` streaming the file, the recent sign-in, the Audit Log line, the page and the trial's ended screen, db tests that no secret is in it. Blocked by 7.
9. **Import into a new Workspace:** the staged import job with its checks and limits, the failure that leaves nothing, re-sealing, **New Workspace → From a Workspace Export**, the progress page, not on hosted Ziffr, db tests, the round trip on a second stack. Blocked by 7 and 8.
10. **Docs and a security review:** the self-hosting guide section, the user guide (Installation settings, Workspaces, Trials), the threat model entries (invitations from a trial, the export file, an untrusted import), release notes, and an Opus review of the whole spec. Blocked by 1 to 9.
11. **Hosted Ziffr runs on it:** set `ZIFFR_CLOUD_KEY` on the demo and app deployments that offer trials, move their trial settings to Trial Limits, check sender reputation before turning the invitation numbers on; done by the person who runs it. Blocked by 2.
