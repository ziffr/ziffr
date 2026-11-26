# 0059 The community Marketplace: anyone publishes free Packs, and nobody waits for one person

**Status:** draft. **Tracking issue:** #1165 (label `tracking`); tickets #1192 to #1197, labelled `spec:0059`, are the work that needs no account, key or private repository of the owner's. The rest waits for the [one-time steps](#one-time-steps-for-the-owner). Decision 2 (who moderates) is open, and **public opening waits for it**. **Amended on 2026-11-26** (by the owner): it runs on a server of the owner's, not on AWS, and the signer also takes signatures of moderators and of the release pipeline and signs withdrawals. Builds on spec 0030 and ADR 0013; spec 0058 lets a Pack say who does what and keeps where things came from; the draft spec 0044 (#770) covers paid Packs on self-hosted Ziffr. It changes parts of specs 0030, 0039 and 0044, listed under [Changes to earlier specs](#changes-to-earlier-specs).

## Problem Statement

Ziffr can check, install, update and export Packs, and its server can ask a Marketplace for them. There is no Marketplace to ask. A person who built a good setup can only hand over a file.

The owner wants a community Marketplace of free Packs, Ziffr's own first, where people share their setup (Metrics, Workflows, Deck Templates and Positions) and others browse and import it. The owner decided on 2026-11-26 that **everyone who wants to contribute can, without the owner doing anything**, and that nothing depends on the owner's own computer. Some Packs will be paid later.

## What exists today

Checked on 2026-11-26 against `main` at `ee5d1ae2`.

### In this repository

| Part | Where | State |
| --- | --- | --- |
| The Pack format, its checks and `npx @ziffr/pack check` | `packages/pack` | built |
| Install from a file, update, uninstall, Set up | `packs.ts`, `pack-updates.ts`, `pack-setup.ts` in the core | built |
| Ziffr's own Packs, installed with no download | `packs/`, `included-packs.ts` | built (twelve) |
| Export as Pack | `pack-export.ts` | built; gives a file to download, publishes nothing |
| The connection: search free Packs, fetch a version, check its signature, ask for newer versions | `marketplace.ts` | built, off unless turned on; tested against a stand-in only |
| Search, preview, install and update on the Packs page | `apps/web/src/app/settings/packs` | built |
| The line that says who vouches for a Pack | `pack-voucher.ts` | built |

### Not there

- **No service.** `marketplace.ziffr.net`, the default address, does not resolve (`NXDOMAIN`). `https://ziffr.net/marketplace` and `/packs` answer 404.
- **No service repository found.** None under the `ziffr` GitHub account, as far as the access used for the check can list, is named or described as a Marketplace or as Ziffr Cloud. A search of that account's code finds the address only in this repository. Code kept elsewhere would not show.
- **No key.** `MARKETPLACE_PUBLIC_KEYS` is empty, so no signature was ever accepted from Ziffr's Marketplace. Unless a server names a key of its own, every file from a Marketplace is refused.
- **No withdrawal.** Spec 0030 says a taken-down Pack's Workspaces are told why. Nothing in the code reads or shows that.
- **Updates are asked for only when someone looks.** The once-a-day question starts when an Owner or Admin opens the Packs page; no job asks.
- Also not built: a way to report a Pack, a signature recognised on an uploaded file, browsing before a search (the core accepts an empty search; the page shows nothing until one is made), an update badge outside the Packs page, publishing, "works with Ziffr" listings, paid Packs.

Whether hosted Ziffr has the connection turned on was not checked.

## The contract with Ziffr

| Request | Answer today's client expects | Limits it holds it to |
| --- | --- | --- |
| `GET v1/packs?q=` | `{ "packs": [ { "id", "name", "summary", "author", "license", "version" } ] }` | 256 KiB, the first 50 used; a bad entry is dropped; paid ones are hidden |
| `GET v1/packs/{handle}/{slug}/versions/{version}` | `{ "file", "signature" }`: the Pack's text, and a base64 Ed25519 signature of its exact bytes | file at most 1 MiB; it must be the Pack and version asked for |
| `POST v1/updates` with `{ "ziffr", "installed": [ { "id", "version" } ] }` | `{ "updates": [ { "id", "version" } ] }` | 256 KiB, the first 500 used |

All over https, no redirects, 10 seconds. 404 reads as "does not know that Pack"; anything but 200 or 404 as "cannot be reached".

**What changes before launch:** the version answer becomes `{ "file", "statement", "signature" }` (signing, below), the updates answer gains `"withdrawals"`, both can carry key revocations, and a listing gains a "new creator" mark.

| New in the contract | Shape |
| --- | --- |
| The signed statement | `{ "format": "ziffr.pack-signature/1", "id", "version", "sha256", "key", "signed", "reviewed" }`; `reviewed` says whether a moderator looked |
| A revocation, in `"revocations"` of the version and updates answers | `{ "statement", "signature" }`, the statement `{ "format": "ziffr.key-revocation/1", "key", "signed" }`, signed by the reserve key |
| A withdrawal, or its taking back, in the updates answer | `"withdrawals": [{ "statement", "signature" }]`, the statement `{ "format": "ziffr.pack-withdrawal/1", "id", "state", "reason", "sequence", "key", "signed" }`; `state` is `withdrawn`, with a reason in plain text of at most 200 characters, or `restored` |
| A listing | may add `"newCreator": true` |
| Web pages under the Marketplace's address | `packs/{handle}/{slug}` and `packs/{handle}/{slug}/report?version=` |

No key has shipped, so changing the signature breaks nobody who uses Ziffr's Marketplace. Someone who runs a Marketplace of their own with their own key would have to follow.

## Solution

A small web service, run by programs, with people only where judgement is needed.

- **Accounts anyone can make**, with a verified email address. Upload on the web; later from inside Ziffr.
- **Checks, signing and publishing are automatic.** A file that passes is listed within moments.
- **Held only when a program cannot tell:** words aimed at assistants, a close match with another listing, a lookalike name or logo.
- **Every Pack can be reported.** Moderators, who need not include the owner, decide.
- **When nobody moderates, the Marketplace narrows itself**: it stops taking new uploads rather than publishing unwatched.

Three steps:

1. **Step A:** the service, with Ziffr's own Packs only, published by the release pipeline.
2. **Step B:** open to everyone. It opens only when reporting, at least two moderators and the lawyer's answers are in place.
3. **Step C, later:** publishing from inside Ziffr, and payments.

Free Packs only (CC BY 4.0 or MIT) until payments.

**This is much more than a static file host.** Accounts, uploads, reports and moderation make it a web application that holds personal data and has to be kept running. That is the price of open publishing.

## User Stories

1. As an Owner of a new Workspace, I want to browse Packs from Ziffr and from others, so that I start from a setup someone already uses.
2. As an Installation Admin of a self-hosted Ziffr, I want to turn the connection on and have it work, with nothing about my Workspaces leaving the server.
3. As anyone on the web, I want to read what a Pack holds and download its file without an account.
4. As a creator, I want to sign up, upload my Pack and see it listed in minutes, without asking anyone.
5. As a creator, when my upload is held or refused, I want to know exactly why and what I can change.
6. As a creator, I want nobody else to publish under my handle or pass my work off as theirs.
7. As anyone, I want to report a Pack, with or without an account, and learn what was done.
8. As a creator whose Pack was reported, I want the reasons for any step and a way to disagree.
9. As an Owner who installed a Pack that was withdrawn, I want to be told, and to keep what I have.
10. As a moderator, I want one queue, the facts beside each case, and every decision recorded.
11. As Ziffr's owner, I want to set it up once and never be the person publishing waits for.

## Implementation Decisions

### The pieces

- **A private repository**, `marketplace` (the service is closed, ADR 0013). The server runs a released commit of it, installed by a step only the maintainer starts. Nothing runs from anyone's own computer.
- **A web service** for the public pages and published files, with a short cache, and for accounts, uploads, checks, search, the updates question, reports and moderation.
- **A database** of accounts, handles, versions, held items, reports, decisions and the audit record.
- **A signer**, a separate small program under a user of its own that alone may use the signing key. It keeps its own ledger of what it signed and its own copy of the record.
- **Ziffr's checks themselves:** the service runs `@ziffr/pack` of the latest release, the same code as an install.

### Accounts

- **Sign-up is self-service:** an email address, confirmed by a link, which is also how one signs in (spec 0030). A bot check guards the forms. Accounts never confirmed are deleted after 7 days.
- **A handle** is claimed at the first publish, first come. `ziffr` and names like it, and a list of reserved words, are refused. A claim that someone else's brand was taken is a report.
- **A creator can** publish a new version, withdraw their own Pack, see its cases and delete their account (their published Packs are withdrawn; what law needs kept is kept).

### Upload and publishing

1. The creator makes a file with **Export as Pack** and uploads it on the web.
2. The checks run at once.
3. The result is one of **published** (signed and listed), **refused** (each problem with its line) or **held** (which check, which item, what to change).

- **A published version never changes** and its number is not used again.
- A held upload is never published by a timer. The creator can change what held it and upload again, which needs nobody. After 30 days it is dropped.
- **From Ziffr (step C):** a button on the Export dialog posts the file from the person's browser to the upload page, where they sign in and confirm. The Installation's server sends nothing.

### Automatic checks, for every version

| Check | A hit |
| --- | --- |
| The Pack's checks, exactly as on install; version higher than the last; license `CC-BY-4.0` or `MIT`; the handle is the account's | refused |
| The logo (spec 0039); listing addresses reachable over https, not redirecting elsewhere, not on a blocklist | refused |
| Things that look like an email address, phone number or bank account in any text | refused, with the lines |
| Words aimed at assistants (spec 0030) | held |
| A close match with another publisher's listing | held |
| An author name or logo the same as, or close to, another publisher's | held |

A changed author name or logo that matches nobody is published, and the page says when it changed. Listing addresses are checked again from time to time; one that turns bad hides the Pack.

### Copies are fought at listing

- Every upload is compared **item by item** with everything listed, free and, later, paid. Keys, spaces and capitals are evened out; near-identical wording counts. Items found in Ziffr's own Packs, the Metric Catalog or several unrelated publishers are ignored.
- A **close match** (several items, or most of a small Pack, matching one other listing) is **held and decided by a person**. The creator can instead remove the matching items and publish at once.
- A match with a free Pack that the file credits (`basedOn`, spec 0058) is what the license allows. It publishes, with the credit shown (decision 3).
- **A claim that someone copied** is a report. A moderator decides, using the publication dates the Marketplace keeps, and whatever else both sides show. Being first here is evidence, not proof.
- **Private files are never compared and never blocked.** Only what someone asks to list is looked at.

### Limits, and the "New creator" mark

Decided (decision 4). They are settings of the service and change without a release.

| Limit | New creator | Established |
| --- | --- | --- |
| Packs | 3 | 20 |
| Versions a day | 3 | 20 |
| Upload attempts a day | 10 | 50 |

- For everyone: a file of at most 1 MiB; 5 sign-in links an hour for an address; 3 new accounts a day from one network address; limits on search, download and updates requests per address.
- **A creator is new** for 30 days after the first publish, and longer while a report against them is upheld. Listings, Pack pages and Ziffr's search say **New creator**.
- **A burst:** when new creators' uploads pass a daily total, further ones wait in line and publish by themselves later.
- A limit that is reached says so and when it ends.

### What a signature now says

- Every page and, in Ziffr, the voucher line say what was done: **"Published through the Marketplace as @handle. Checked by program. No person reviewed it."** The last sentence is dropped only where a moderator did look, which the signed statement says.
- A signature shows where a file came from. The checks on install are the protection (spec 0030).

### Signing and keys

- **A signed statement** replaces the signature over the file (shape above), with the file's SHA-256, the key's id and the time. Ed25519 signs the statement's exact bytes. Ziffr checks the signature with a key it trusts, then that id, version and hash are the file's.
- **The signing key is a file on the server** that only the signer's user reads. The web service can neither read it nor change the signer's configuration or state. The signer is asked by a Pack's name over a local connection, builds each statement itself from what is stored, and never signs bytes handed to it. A managed key service can take the file's place later: a statement is small enough for one.
- **The signer checks again before it signs** a file it has not signed: the Pack's checks and the holds of [automatic checks](#automatic-checks-for-every-version), against its own ledger; that a handle stays with the account that first published under it; that a version number only goes up; and that a signed version's file never changes. It signs only so many new files and new handles in a time.
- **Two keys from the start:** the signing key, and a reserve key made and kept on a machine that stays offline. Both public keys ship in `MARKETPLACE_PUBLIC_KEYS` in one release, each with its part.
- **Watching:** each signature is matched against a publication, and the record is copied where the web service cannot write. A signature without a match, a changed line of the record, or far more signatures than usual **switches the signer off by itself** and tells the maintainer. Publishing stops; downloads go on.
- **Rotation** is on an incident, not a calendar: the reserve becomes the signing key, every statement of a version and of a withdrawal is signed again (a command with a runbook), and a new reserve key's public part ships in a later release.
- **Revocation:** only the reserve key can revoke the signing key, so a thief of the signing key cannot revoke anything. The revocation travels in the version and updates answers. Ziffr keeps it and refuses that key's statements. A release removes the key for good. Until it ships a new reserve key, the promoted one cannot be revoked without a release.
- **Both keys lost:** nothing new is published until a release ships new ones. Installed Packs stay.

#### Signatures the signer asks for

Some steps need more than the web service's word. Each is a signature by a key that is not on the server, over a statement that names exactly what it allows; the signer holds the public keys and verifies it.

| Step | Signed by | The statement names |
| --- | --- | --- |
| A Pack under `ziffr/` is signed | the release pipeline (`ziffr.release/1`) | the Pack, the version and the file's SHA-256 |
| A held upload is published, and its statement says `reviewed` | a moderator (`ziffr.approval/1`), after reading the file | the Pack, the version and the file's SHA-256 |
| A withdrawal is taken back | a moderator (`ziffr.restoration/1`) | the Pack and the number of the withdrawal taken back |

#### Signed withdrawals

- **The signer signs every withdrawal** and every taking back, with a **sequence number** higher than in any earlier statement about that Pack. It signs nothing more of a Pack while it holds it as withdrawn.
- **Ziffr believes only these statements**, signed by a key that may sign, and keeps the newest it has seen for each Pack it took from the Marketplace. An answer that leaves a Pack out, or repeats an older statement, changes nothing: a withdrawal ends only with a newer statement that restores the Pack.
- A statement of a key revoked since stays until a statement of a trusted key replaces it.
- A withdrawal takes effect on the Marketplace at once; its statement follows as soon as the signer gives it.

### Browsing

- **On the web:** a list with search, two parts, **From Ziffr** and **Community**; a page per Pack with name, handle, version, license, summary, credits, every item's name and description, Positions and Repeats (spec 0058), the logo in its box (served with `nosniff` and a `sandbox` policy), the voucher line, New creator, **Download**, **Report this Pack** and how to install. Everything a creator wrote is shown as text, never as markup. No scripts from others except the bot check on forms; no analytics cookies.
- **In Ziffr:** the newest Packs show before a search; the same two parts, "From Ziffr" only for signed `ziffr/` Packs; New creator and the voucher line; **Report this Pack**; Ziffr's own Packs already installed are marked.
- **No ratings, download counts or ranking by who is asking.** The Pack Audience ranks on the Installation only (spec 0052).
- **What the service learns from an Installation:** its network address, search words, which version is fetched and, once a day at most, which Packs it took from the Marketplace.

### Reporting a Pack

Parts that follow from law are **to be confirmed by a lawyer before the Marketplace opens to the public** (marked **[lawyer]**).

**Where.** Every Pack page on the web, and **Report this Pack** in Ziffr on a Marketplace Pack's preview and on an installed one. In Ziffr it is a link that opens the web page with the Pack's id and version, with no referrer; the Installation sends nothing.

**Reasons:** illegal; copyright or trademark; harmful or misleading; spam; other. Each asks what is wrong and which item.

**Who.** Anyone.

- With an account: sent at once.
- Without one: an email address, confirmed by a link, and the bot check.
- For illegal content and rights claims the form also asks for a name, an email address and a statement of good faith, and for a rights claim where the work was first published **[lawyer]** (Digital Services Act, article 16).
- A report of child sexual abuse material is taken without name or address, which that article allows **[lawyer]**, and goes to every moderator and the legal contact at once.

**Abuse limits.** 5 reports a day for an unaccounted address, 20 for an account; one open report per person and Pack; limits per network address. After a warning, a person whose reports are repeatedly unfounded counts for nothing towards hiding and is read last for 90 days. A notice the law requires us to take is never blocked **[lawyer]**.

**What each side is told.**

- **The reporter:** a receipt at once with a case number; the decision, its reasons and how to appeal **[lawyer]**.
- **The creator:** when anything is done to the Pack, or a moderator asks for a reply: what, why, and how to appeal. Not the reporter's identity, unless a rights claim or the law needs it **[lawyer]**. A report that leads to nothing is closed without troubling them.

**Hiding before a decision.** A hidden Pack leaves search and browsing, its page says it is being checked, and new downloads and updates pause. Installed copies are untouched.

| What hides it without a moderator | Applies to |
| --- | --- |
| A program check that now fails (a listing address on a blocklist, for example) | every Pack |
| A report from an appointed trusted reporter | every Pack |
| 3 reports for the same reason within 7 days, each from an account older than 30 days with no recent unfounded report, from different network addresses | New creators' Packs only |

- Reports without an account, and "other", never count towards hiding.
- An account counts once against a creator in 30 days.
- A version a moderator restored cannot be hidden by count again.
- **An established creator's Pack is never hidden by a number of reports.**
- Someone who ages several accounts could still hide a new creator's Pack for a while. The rules raise the cost; no rule removes it.

**Statement of reasons.** Every refusal, hiding, withdrawal and suspension says what was done, the rule or law, the facts, whether a program or a person decided, and how to appeal **[lawyer]** (article 17).

**Appeal.** Creator and reporter, for six months. A person decides, another one than before where possible, never a program alone **[lawyer]** (article 20 asks this of larger platforms; micro and small firms are excused under article 19; we offer it regardless).

**Withdrawal and installed copies (spec 0030).** A withdrawn Pack stops new installs and updates, and its version requests answer 404. The updates answer carries its signed statement ([signed withdrawals](#signed-withdrawals)), and the Packs page of a Workspace that installed it shows one line. **Installed copies stay**; Ziffr removes nothing from a Workspace. Files already downloaded and their signatures stay valid.

**The record.** An add-only log keeps each report, step and decision, who or which program did it, the reasons, the times and the messages sent. Moderators read it; a creator sees their own cases. Nothing in it is edited. How long it is kept, what is deleted on request, and which numbers must be published **[lawyer]**. The counts are produced by the service, not by hand.

### Moderators, and what still needs a person

- **Moderators** are accounts with that role and a second factor. At least two, neither needs to be the owner, before step B. The owner appoints each on the server; a moderator sets up the second factor themselves. Their sessions are short, and withdrawing or suspending asks for a new code. Who they are, their pay and their response times are open (decision 2).
- They decide held uploads, reports and appeals, hide, withdraw and suspend. Each has a key of their own, on their own computer, for the [signatures the signer asks for](#signatures-the-signer-asks-for). They cannot sign for the Marketplace and cannot touch its keys.
- **A maintainer** handles incidents, key changes and updates that do not apply by themselves.

What no program does:

- reports that need judgement, appeals, and disputes over copies, names and handles;
- legal notices and orders from authorities, through a named **legal contact**;
- onboarding sellers, once there are payments;
- a suspected misuse of the key;
- keeping the software running. Dependency updates and tests are automatic; an outage is not.

**Handing work over does not hand over the duty.** Whoever operates the service most likely stays answerable for it **[lawyer]**.

### What happens when nobody acts

| Waiting | By itself |
| --- | --- |
| An upload that passes | published at once |
| A held upload | stays held, never published; dropped after 30 days; the creator may change it and upload again |
| An open report | moderators reminded after 2 days, all of them and the legal contact after 5; nothing is hidden by waiting |
| A Pack hidden by count, no decision | shown again after 14 days, if the reason was harmful, misleading or spam |
| A Pack hidden for illegal content or a rights claim, or by a trusted reporter | stays hidden until a person decides |
| An appeal | the decision stands; reminders go on |
| A report or appeal has waited 14 days | **new creators' uploads pause**, and the site says reports are slow |
| The same for 30 days | **all uploads pause**; browsing, downloads and updates go on; it resumes when the queue is worked off |
| The cap on mail anyone can ask for is reached | the maintainer is told; sign-in links wait |
| Signing that matches no publication, or a changed line of the record | the signer switches off |

A timer cannot meet a duty to answer a legal notice **[lawyer]**. The pauses limit how much goes unwatched; they do not replace a person.

### Risks open publishing adds

| Risk | What is done | What remains |
| --- | --- | --- |
| Spam and advertising | verified email, bot check, limits, reports | slow, patient spam |
| Passing off as someone else, lookalike logos | name and logo comparison, reports | a lookalike no program notices |
| Copied work | item comparison, dates, reports | reworded copies |
| Illegal or offensive words | reports, hiding, withdrawal | it is visible until someone reports it |
| A creator's own private data published by mistake | patterns refused, spec 0058's name check, withdrawal | company figures in a sentence |
| Text steering an assistant | held on the obvious; assistants are limited by their key's scopes | wording that evades a filter |
| A Pack proposing Shares that show too much | spec 0058: Shares start unticked and are listed | a person ticking without reading |
| Misleading formulas or descriptions | reports | nobody checks the arithmetic of a business |
| People trusting "published" as "safe" | the voucher line says no person reviewed it | some will anyway |
| Report brigading | the hiding rules above | aged accounts |
| Flooding and cost attacks | limits, a short cache, the cap on mail | a large attack costs uptime |
| A taken-over creator or moderator account | sign-in link, second factor for moderators, record | a taken-over mailbox |
| Legal exposure from slow answers | reminders, pauses, legal contact | the operator's |

Code from others never runs (ADR 0013), which removes the worst risk a plugin store has.

### Hosting, scaling and cost

| Option | For and against | Judgement |
| --- | --- | --- |
| **A. A server of the owner's**, with the safeguards below | Paid for already, one place to look; updates, backups and watching are the operator's; no managed key | **Decided on 2026-11-26** (replaces B) |
| B. AWS, in an EU region: a cache and file storage, functions, a key-value database, email, KMS | The signer gets its right from a role, with no stored secret; a service to learn and a bill that moves with traffic | Possible later |
| C. Cloudflare for pages and service, AWS KMS for signing | Cheap and simple to run; a long-lived AWS credential has to be stored there | Not chosen |
| D. Google Cloud | Works with its KMS; Ed25519 at software level only; not priced | Not chosen |

**The safeguards:**

- The web service and the signer run as **users of their own**, **isolated from other applications** on the server, with limits on their memory and processor.
- **The signer is separated** from the web service: its own user, key, configuration and state; it reaches nothing but the mail service.
- Visitors reach only the web service, through a proxy or tunnel that is the one way in.
- **Cloudflare Turnstile** (free) as the bot check, verified on the server; a **mail account** with a sending name of its own.
- **Backups**, encrypted before they leave the server, stored where the server cannot delete them, and restored as a rehearsal before opening.
- The **legal pages** before opening to the public.
- Installing it follows a step-by-step plan the owner approves, with a way back for each step.

- **Estimate, not a quote:** a few euros a month beside the server: mail costs cents ([SES](https://aws.amazon.com/ses/pricing/): 0.10 US dollars for 1,000 messages), the bot check is free ([Turnstile](https://developers.cloudflare.com/turnstile/plans/)), backups of this size cost little or nothing. Not estimated: moderators, the lawyer, an attack.
- **Scaling:** one server with a short cache holds a catalogue of thousands of Packs. The service takes standard web requests and can move. People are what does not scale, hence the limits and pauses.

### One-time steps for the owner

Each once. None of them recurs for publishing.

1. Create the private repository.
2. Approve the setup plan for the server.
3. Create the DNS records for `marketplace.ziffr.net` and for sending its mail, the mail login and the backup storage.
4. Create the bot check.
5. Make the keys: the signing key on the server, the reserve key offline, the release pipeline's; merge the change that puts the two public keys in Ziffr, and release it with the Release button.
6. Appoint two moderators, who each make their own key, a maintainer and a legal contact, and agree response times and pay.
7. Take the questions below to a lawyer; publish imprint, privacy notice, terms and publishing rules.
8. Turn the connection on for hosted Ziffr.
9. Open step B.

What may still reach the owner: bills, the server's updates when they need a person, a moderator who leaves with none to replace them, and the legal duties of an operator.

### Legal duties: questions for a lawyer, before opening to the public

A list to take to a lawyer, not advice. The owner decided that these are answered **before the Marketplace opens to the public**. Step A needs the first two.

1. Imprint, privacy notice, and the agreements with the host and mail service.
2. Email addresses, logs and the case record: legal basis, how long, and deletion requests against a published file.
3. The EU Digital Services Act: whether it applies and in which role; contact points; terms; notice and action; statements of reasons; complaints; trusted reporters; measures against misuse; reporting duties; what a small business is excused from.
4. Regulation 2019/1150 on platforms and their business users, for free listings.
5. Creators' terms: rights granted, promises made, liability for a copy or harmful Pack, minimum age.
6. CC BY and MIT against a takedown: a license already given likely cannot be called back.
7. Trademarks, logos and handles: notice, reply and counter-notice.
8. Liability for a misleading Pack, and for what moderators do or fail to do.
9. What must be reported to authorities, and how fast.
10. Before payments: seller identity, consumer rights for digital goods, who is the seller for VAT, tax reporting.

## Paid Packs and copies (a later step)

Spec 0030's gate stands: about 20 good free Packs first. Of what follows, only the listing comparison (step B) and where things came from (spec 0058, in place before any paid Pack exists) are built before then.

### Decided by the owner on 2026-11-26

There is **no "Marketplace only" rule**: free Packs and one's own exports are still imported from a file, so offline self-hosting and moving Packs between one's own Workspaces keep working.

1. **On hosted Ziffr a paid Pack is never a download.** It goes straight into the buyer's Workspace.
2. **Self-hosted installs a paid file only with a signed Purchase Receipt** (draft spec 0044), and shows the licensee.
3. **A file marked paid is refused without a receipt.** Removing the mark gets round it, and the copy then shows as unverified.
4. **Installed items remember where they came from**, through edits and "save as template". Export as Pack leaves out paid items and credits free ones by itself (spec 0058).
5. **A purchase belongs to the buyer's account**, who may apply it to their own Workspaces. Creators get their own Packs free.
6. **Copies are fought at listing** (above): item by item, close matches decided by a person, no automatic blocking of private files, false claims decided by a person using publication dates.

### Options considered

The owner had suggested: "you can import packs exclusively from the community marketplace; that limits copy fraud". Only paid Packs have copies to protect against: CC BY and MIT allow copying, with credit.

| Option | Why not, or why |
| --- | --- |
| Marketplace only, everywhere | Breaks installing from a file with the connection off (spec 0030), private Packs, trying a Pack before listing it and moving a setup between one's own Workspaces. A Marketplace outage stops installs. A changed Ziffr ignores it, and an export under a new name gets round it |
| Marketplace only on hosted Ziffr | The same losses for hosted users, and the same way round |
| Hosted Ziffr compares each uploaded file with fingerprints of paid Packs (an earlier plan, **dropped**) | Would catch unchanged copies passed as files. It could refuse a person's own file, for example after someone listed their private work as paid, and changed copies would pass anyway |
| **No paid downloads on hosted Ziffr, receipts, remembered origin, comparison at listing (decided)** | No private file is blocked. What gets through is listed below |

### How it works

- **"Own" Workspaces:** those where the person whose proven address is the account's is an **Owner** when applying, **at most 10 for one purchase** (decision 6). The Pack stays if they later stop being one; it is not applied anew.
- **On hosted Ziffr:** an Owner chooses **Add a Pack you bought**. The handover of spec 0029 tells Ziffr Cloud which Workspace and whose address, as for a Size. Ziffr Cloud delivers the file to that Workspace over its signed calls, through a new address with a size limit of its own. The Owner sees the Preview and installs. Updates arrive the same way. The file is offered nowhere as a download. This is a new way into a Workspace and gets its own threat model entry.
- **For a self-hosted Installation** the buyer downloads file and receipt from their account. A buyer says which of the two a purchase is for. The receipt stays per Installation, as spec 0044 has it.
- **A file marked paid** uploaded to hosted Ziffr is always refused, with the way to add a purchase. A creator tries a paid Pack before listing it under a free license mark.
- **The open code** accepts `Ziffr-Pack-1.0` only delivered or with a receipt. Today it hides and refuses it from the Marketplace, but installs it from an uploaded file.
- **Creators** have every Pack of their own handle as a purchase, marked as publisher, so Export as Pack does not leave their own work out.

### What still gets through

- Anyone who has a paid file (a self-hosted buyer, or someone they give it to) can remove the mark. It installs anywhere and shows as unverified.
- A buyer can read what was installed and type it again, take it from the API or a Workspace Export, or have an assistant rebuild it.
- Whoever changes the code of their own Installation is bound by no check. Ziffr is source-available (ADR 0002).
- A receipt shared with its file works on another Installation, under the buyer's name.
- Making a buyer an Owner of one's Workspace lets them apply their purchase there, up to the limit of 10; Ziffr cannot tell organisations apart.
- A reworded copy can pass the listing comparison. A copy passed on privately is never looked at.

These are copies a determined person makes. The measures make paying the easy way, keep credit by default and keep copies off the Marketplace. They are not copy protection, as spec 0044 already says.

### What else payments need

Accounts for buyers, payments, VAT, invoices and payouts (spec 0030: 80 % to the creator) in Ziffr Cloud; sellers' onboarding by a person; the license text; question 10; a moderator's review of a seller's first paid version (decision 7).

## Changes to earlier specs

| Spec | It said | Now |
| --- | --- | --- |
| 0030 | A person reviews a creator's first Pack, and every paid version | **No review before listing a free Pack.** Programs check; a person looks at held uploads and reports. A moderator reviews a seller's first paid version only |
| 0030 | A text aimed at assistants stops the listing for a person | The same, and the creator may change the words and upload again |
| 0030 | The Marketplace signs each published version | It signs a statement about the file, with a key id and time |
| 0030 | A paid Pack is bought for a Workspace by an Owner; the license covers the buying organisation's Workspaces | A purchase belongs to an account, applied to its own Workspaces. The license text follows |
| 0039 | A changed logo or author name goes to a person | Only when it resembles another publisher's |
| 0044 (draft) | One receipt per purchase, for an Installation; refuses unsigned paid files | Unchanged for self-hosted; add: bought from an account, chosen for self-hosted, a publisher mark |

## Docs and the threat model

The service has a threat model of its own: uploads as hostile files (data only, never run, never written into a page unescaped), account takeover, the signer and key, the server and its network, search input, report abuse, moderator rights, flooding. This repository's boundary 17 gains the signed statement, revocations, signed withdrawals and the report link. An independent security review precedes steps A and B.

## Testing Decisions

- **The contract:** the service answers for Ziffr's own Packs, and Ziffr's client accepts every answer: statement, hash, key, listing fields. A broken signature, another key, a wrong hash, id or version and a revoked key are refused.
- **Publishing:** a hostile table for every refusal and hold; limits; a changed published version refused; a held upload never listed by time.
- **Copies:** a copied item held; common items ignored; a credited free remix published.
- **Reporting:** each row of the hiding table, and each thing that must not hide; messages to both sides; the record.
- **Nobody acts:** each row of that table, with the clock moved.
- **Signer:** the web service cannot read the key or the signer's state; what its own checks hold, `ziffr/` and the taking back of a withdrawal are signed only with the signature named above; an unmatched signature switches it off.
- **Withdrawals:** Ziffr takes a signed withdrawal and its restoration, and nothing unsigned; an older or missing statement changes nothing.
- **Step A** ends with a fresh self-hosted Installation installing and updating one Pack from the real address.
- **Before step B:** a rehearsal in which a moderator, not the owner, takes a report from receipt to appeal.

## Tickets

Open now: in this repository, needing no account, key or private repository of the owner's.

| Ticket | What | Blocked by |
| --- | --- | --- |
| #1192 | The contract as a reference with JSON schemas, and a check the service can run | |
| #1193 | The client verifies the signed statement and key revocations, tested with test keys | #1192 |
| #1194 | Withdrawn Packs: the updates answer, storage, the line on the Packs page | #1192 |
| #1195 | Browsing in Ziffr: newest first, From Ziffr and Community, New creator, the voucher line | #1193 |
| #1196 | **Report this Pack** links | #1192 |
| #1197 | Threat model, user guide, release notes and an independent security review of these | #1193 to #1196 |

Not opened yet, because they need the one-time steps:

- Ship the two public keys in Ziffr. Needs the keys.
- The release pipeline publishes Ziffr's own Packs. Needs a publishing identity.
- In the private repository: the server's setup, deployment, keys, signer and its watching; published files, search, updates and web pages (step A); accounts, upload, checks and limits; the listing comparison and held uploads; signed withdrawals; reports, hiding, statements of reasons, appeals and the record; the moderator queue, reminders and pauses; terms and rules pages, runbooks and the rehearsal (step B).

Later: publishing from Ziffr; payments and delivery of bought Packs.

## Out of Scope

- Payments and paid Packs, beyond the design above.
- Ratings, reviews by users, download counts.
- "Works with Ziffr" listings (spec 0030), which come after step B.
- Code of any kind in a Pack (ADR 0013).

## Decisions (2026-11-26, by the owner)

### The direction

- A community Marketplace with free Packs, starting with Ziffr's own.
- The six points on paid Packs and copies above; no "Marketplace only" rule.
- **No bottleneck:** self-service accounts and upload, automatic checks, signing and publishing, a managed key (replaced later that day, point 1), nothing on the owner's computer. This overrides the earlier recommendations (submissions by email, signing by the owner, review of every version, invited creators first).
- **Every Pack can be reported**, with the duties confirmed by a lawyer before the Marketplace opens to the public.

### The points proposed in this spec

1. **Hosting** on a server of the owner's, with the safeguards [above](#hosting-scaling-and-cost). It replaces the first choice, AWS in an EU region.
2. **Open:** who moderates, whether they are paid, and the response times. **Public opening (step B) waits for it.**
3. **A credited remix of a free Pack publishes by itself.**
4. **Limits and the New creator period** as in the table above.
5. **A number of reports hides only a new creator's Pack.**
6. **One purchase applies to at most 10 Workspaces** of the buyer's own, those where they are an Owner.
7. **A moderator reviews a seller's first paid version.**
8. **Uploads pause** after 14 and 30 days without moderation.
