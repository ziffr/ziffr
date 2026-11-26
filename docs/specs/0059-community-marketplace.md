# 0059 The community Marketplace: free Packs first, on the smallest service that can sign them

**Status:** draft. **Tracking issue:** #1165 (label `tracking`); its tickets will be sub-issues labelled `spec:0059`, opened once the owner has taken the decisions at the end. The owner approved the direction on 2026-11-26. Builds on spec 0030 and ADR 0013; spec 0058 lets a Pack say who does what; the draft spec 0044 (#770) covers paid Packs on self-hosted Ziffr.

## Problem Statement

Ziffr can check, install, update and export Packs, and its server can ask a Marketplace for them. There is no Marketplace to ask. A person who built a good setup can only hand over a file.

The owner wants a community Marketplace: free Packs, Ziffr's own first, where people share their setup (Metrics, Workflows, Deck Templates and Positions) and others browse and import it. Some Packs will be paid later.

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
- **No key.** `MARKETPLACE_PUBLIC_KEYS` is empty. Unless the server names a key of its own, every file from a Marketplace is refused.
- **No withdrawal.** Spec 0030 says a taken-down Pack's Workspaces are told why. Nothing in the code reads or shows that.
- **Updates are asked for only when someone looks.** The once-a-day question starts when an Owner or Admin opens the Packs page; no job asks.
- Also not built: a signature recognised on an uploaded file, browsing before a search (the core accepts an empty search; the page shows nothing until one is made), a link to a Pack's web page, an update badge outside the Packs page, publishing from Ziffr, "works with Ziffr" listings, paid Packs.

Whether hosted Ziffr has the connection turned on was not checked.

## The contract the shipped code already expects

The first release serves exactly this, so no Installation needs new code to browse and install.

| Request | Answer | Limits the client holds it to |
| --- | --- | --- |
| `GET v1/packs?q=` | `{ "packs": [ { "id", "name", "summary", "author", "license", "version" } ] }` | 256 KiB, the first 50 used; a bad entry is dropped; paid ones are hidden |
| `GET v1/packs/{handle}/{slug}/versions/{version}` | `{ "file", "signature" }`: the Pack's text, and a base64 Ed25519 signature of its exact bytes | file at most 1 MiB; it must be the Pack and version asked for |
| `POST v1/updates` with `{ "ziffr", "installed": [ { "id", "version" } ] }` | `{ "updates": [ { "id", "version" } ] }` | 256 KiB, the first 500 used |

All over https, no redirects, 10 seconds. 404 reads as "does not know that Pack"; anything but 200 or 404 as "cannot be reached". The signature has no date, no key id and no end: **a signed file stays valid for ever**, also after it is taken down.

## Solution: three steps

1. **Step A, Ziffr's own Packs.** A static service with the twelve Packs, signed. It proves the domain, the keys and the contract with nothing from strangers.
2. **Step B, community Packs.** People send a Pack by email. It is checked by program, reviewed by a person, signed and listed.
3. **Step C, later.** Upload on the web with a creator's account (email sign-in links, as spec 0030 describes), once email intake costs more than building it.

Free Packs only (CC BY 4.0 or MIT) in all three.

## User Stories

1. As an Owner of a new Workspace, I want to browse Packs from Ziffr and from others, so that I start from a setup someone already uses.
2. As an Installation Admin of a self-hosted Ziffr, I want to turn the connection on and have it work, with nothing about my Workspaces leaving the server.
3. As anyone on the web, I want to read what a Pack holds and download its file without an account.
4. As a creator, I want to send my exported Pack with no GitHub account, and hear what is wrong with it or when it is listed.
5. As a creator, I want nobody else to publish under my handle.
6. As a rights holder, I want to report a Pack and learn what was done.
7. As an Owner who installed a Pack that was taken down, I want to be told, and to keep what I have.
8. As Ziffr's owner, I want to run it for a few euros a month and a few minutes per submission.

## Implementation Decisions

### The pieces

- **A private repository**, `marketplace` (the service is closed, ADR 0013): the published files and their signatures, the list of handles and who owns each, the list of taken-down Packs with a one-line reason, the build and publish commands.
- **A build** that checks every file again, writes the web pages and an index, and a copy of each version's answer as a static file.
- **One small server function** for the two requests a static host cannot answer: the search and the updates question. It reads the index. No database, no accounts, no cookies.
- **Signing and publishing** as one command, run by a person.

### Publishing

1. The creator makes the file with **Export as Pack** and may check it with `npx @ziffr/pack check`.
2. They send it to a submissions address with the handle they want and a statement: the work is theirs to share under the license, the logo is theirs, it names no private person and holds no confidential figures, they accept the terms.
3. The file is added on a branch, the checks run, and the creator gets the problems back if there are any.
4. A person reviews it.
5. Publishing signs it, merges it and deploys. The creator gets the page's address.

- **Handles** belong to the first address that published under them. A later version is accepted only after a reply to a message sent to that address, since a sender's address can be forged. `ziffr` and names like it are reserved; a handle that reads as a known brand needs proof.
- **A published version never changes** and its number is not used again.
- **In Ziffr**, Export as Pack gains one line with the address and the creators' terms. Nothing is uploaded from an Installation in this release.

### Automatic checks, for every version

- The Pack's checks, exactly as on install, with the `@ziffr/pack` of the latest release; the minimum Ziffr it states.
- The handle belongs to the sender; the version is higher than the last; the license is `CC-BY-4.0` or `MIT`; a paid license is refused.
- The logo's checks (spec 0039). Listing addresses reachable over https, not redirecting elsewhere, not on a blocklist.
- Flags for the reviewer, which never pass or fail alone: words aimed at assistants; things that look like an email address, phone number or bank account; items that match another publisher's Pack after spaces and capitals are evened out; a changed author name or logo.

### Review

- **Every version is reviewed in this release.** Spec 0030 lists a creator's later free versions after the checks alone; that can return when review time hurts.
- The reviewer installs and sets up the Pack in a throwaway Workspace, then asks: does it do what its summary says; are its words fit to show; is it a copy; are the name and logo the creator's; does it hold a person's or a company's private information; would a Metric description mislead; with spec 0058, who would see what if every Share were ticked.
- A refusal says which rule and why, in writing, and that the creator may reply.

### Signing and keys

- **Ed25519 over the file's exact bytes**, as the shipped client checks.
- **Two key pairs made at the start**, one in use and one spare. Both public keys ship in `MARKETPLACE_PUBLIC_KEYS` in one Ziffr release, so changing keys needs no upgrade.
- **The private key stays off the web host and off CI.** The owner signs on their own computer, the key in a password manager or on a hardware token that can sign Ed25519 over the whole file. The spare is kept offline in another place.
- **Why not a cloud key service yet:** AWS KMS signs messages of at most 4,096 bytes, and its plain Ed25519 needs the whole message; a Pack may be 1 MiB ([AWS documentation](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html)). Its pre-hashed variant makes a signature Ziffr does not verify. Other providers were not checked. Signing in GitHub Actions with a required reviewer needs a paid plan for a private repository.
- **A stolen key** alone installs nothing: the signature is only trusted on answers from the Marketplace address, so the thief also needs that address or an operator who points elsewhere. The answer is a Ziffr release without the key, the spare put to use, and every file signed again. Installations that do not upgrade go on trusting the old key.
- **Both keys lost:** nothing new can be published until a release ships new ones. Installed Packs and files stay.
- If a signature is ever recognised on uploaded files, a stolen key is worth more. That change then needs a signed statement with a date and key id, and a way to withdraw.

### Browsing

- **On the web** (`marketplace.ziffr.net`): a list with search, two parts, **From Ziffr** and **Community**; a page per Pack with its name, publisher handle, version, license, summary, every item's name and description, its Positions and Repeats (spec 0058), the logo in its box (served with `nosniff` and a `sandbox` policy), **Download**, **Report this Pack** and how to install. Text only: no drawing with Sample Data yet, no script from others, no analytics cookies.
- **In Ziffr** (changes in this repository): the newest Packs show before a search; the same two parts, "From Ziffr" only for signed `ziffr/` Packs; a link to the web page and the report address; Ziffr's own Packs already installed are marked.
- **No ratings, counts or ranking by who is asking.** The Pack Audience ranks on the Installation only (spec 0052); nothing about a Workspace is sent.
- **What the service learns:** the calling server's network address, search words, which version is fetched, and, once a day at most, which Packs an Installation took from the Marketplace. The privacy notice says so. The service keeps no log of its own; what the host keeps, and for how long, goes into that notice.

### Taking a Pack down

- **Reasons:** a legal duty, someone's rights, harm, the publisher's wish.
- The Pack goes on the taken-down list and the site is deployed: it leaves search, its page says it was withdrawn, no update points to it, and its version requests answer 404.
- **Telling Installations** (new here): the updates answer gains `"withdrawn": [{ "id", "reason" }]`, which older Ziffr ignores. The Packs page shows one line. This needs a release.
- **What it cannot do:** installed copies stay (spec 0030), downloaded files stay, and their signatures stay valid.
- The publisher is told why. A file that must disappear entirely is also removed from the repository's history.

### Moderation and legal duties: questions for a lawyer

This is a list to take to a lawyer, not advice. Step A needs the first two; step B needs them all.

1. What imprint and privacy notice the site needs, and which agreement with the host.
2. Whether email addresses and logs are handled lawfully, and for how long; how a deletion request meets a published file and its history.
3. Whether the EU Digital Services Act applies and how: contact points, terms, a way to report content, a statement of reasons, an internal complaint route, and what a small business is excused from.
4. Whether the EU rules for platforms and their business users (Regulation 2019/1150) apply to free listings.
5. Creators' terms: the rights they grant, what they promise, who answers for a copy or a harmful Pack, whether minors may publish.
6. How CC BY and MIT work with a takedown: the license already given likely cannot be called back.
7. Trademarks and logos: notice, reply and counter-notice.
8. Liability for a Pack that misleads (a wrong formula in finance, say), and what the site may disclaim.
9. Before payments: seller identity checks, consumer rights for digital goods, who is the seller for VAT, tax reporting about creators.

### Hosting

| Option | What it takes | Running cost | Judgement |
| --- | --- | --- | --- |
| **A. Static files and one Cloudflare Worker** | The `ziffr.net` zone is already on Cloudflare's name servers; deploy from the owner's machine | Free plan: 100,000 Worker requests a day, static asset requests free; the paid plan starts at 5 US dollars a month ([Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/)) | **Recommended** |
| B. A small server of one's own | A web server, a small service, patches, backups, monitoring | The server's rent (not priced here) | More to look after, nothing gained |
| C. A web application with a database and accounts | Sign-in, upload, review queue, the most code and personal data | Paid app and database hosting (not priced here) | Step C or payments |
| D. A static host alone | Cannot answer the search or the updates question the shipped client sends | Free | Does not fit the contract |

- **Estimate for A:** 0 to 5 US dollars a month. A subdomain costs nothing extra, and a private repository at this volume should stay within GitHub's included usage. Not estimated: the lawyer, mail addresses, and the owner's review time (a guess: half an hour a submission).
- Prices were read on 2026-11-26 and can change.

### What only the owner can do

1. Create the private repository.
2. Choose the host, make the account and a deploy token.
3. Create the DNS record for `marketplace.ziffr.net`.
4. Make both key pairs on their own machine, keep them, and give the two public keys for a release.
5. Set up the addresses for submissions and reports.
6. Take the questions above to a lawyer and publish imprint, privacy notice and terms.
7. Release the Ziffr version that carries the keys; until then no Installation installs from the Marketplace without naming the key itself.
8. Turn the connection on for hosted Ziffr.
9. Review, sign and publish; decide how fast reports are answered.

### Payments, a later step

Not built here. What then changes:

- Spec 0030's gate stands: about 20 good free Packs first.
- Accounts for creators and buyers, payments, VAT, invoices and payouts to creators (spec 0030: 80 % to the creator), in Ziffr Cloud.
- **Paid files are no longer public.** The download must learn who asks. The shipped connection sends nothing that identifies an Installation or Workspace. Self-hosted: the Purchase Receipt of the draft spec 0044 (PR #773). Hosted: specs 0030 and 0044 have Ziffr Cloud record the purchase per Workspace, which the connection cannot name today. So on hosted Ziffr either Ziffr Cloud hands over the file with the purchase, or the contract changes, with its own threat model entry.
- The open code installs a `Ziffr-Pack-1.0` file, from the Marketplace or an upload, only with proof of purchase.
- Hosted Ziffr and the Marketplace recognise copies, and Export as Pack leaves paid items out (below).
- The license text and the lawyer's question 9; review of every paid version.
- Hosting moves towards option C.

### Files, paid Packs and copies (decided 2026-11-26)

The owner suggested: "you can import packs exclusively from the community marketplace; that limits copy fraud". After the analysis below, the owner decided on 2026-11-26. **There is no "Marketplace only" rule.**

1. **A paid Pack installs only with proof of purchase** for that Workspace or organisation: on hosted Ziffr the purchase Ziffr Cloud records for the Workspace (spec 0030), self-hosted the Purchase Receipt (draft spec 0044).
2. **Hosted Ziffr and the Marketplace recognise copies of paid Packs**: the Marketplace does not list them, and hosted Ziffr does not install them. Changed copies can still slip through, and Ziffr says so plainly.
3. **Free Packs and one's own exports can still be imported from a file**, so offline self-hosting and moving Packs between one's own Workspaces keep working.

Decisions 1 and 2 are built in the payments step. Nothing in steps A to C refuses a file for them.

#### Why

**What copying harms.** Free Packs are CC BY 4.0 or MIT: copying and passing them on is allowed. The wrongs left are dropping the credit or posing as the publisher. Only a paid Pack has copies to protect against.

**Today** an uploaded file marked `Ziffr-Pack-1.0` installs like any other; only the Marketplace path hides and refuses it. Decision 1 changes that.

**What no rule in Ziffr can do:**

- Ziffr is source-available (ADR 0002). Whoever runs it may change it, and the check with it. On a self-hosted Installation a rule binds only those who keep the code as shipped.
- A signed file is bytes. A copy has the same valid signature, which names no buyer.
- What a Pack installs is readable in the Workspace. **Export as Pack** writes a new file from it today, under any id and author, without credit. A copier needs no file upload, and could submit the new file to the Marketplace.
- A Pack is a small file of words and settings. It can be typed again.

**What "Marketplace only" would have broken:**

- Spec 0030, story 13: a self-hoster with the connection off installs from a file. Every Installation would have to talk to the Marketplace to install anything, though spec 0030 keeps that connection off by default.
- Moving a setup between one's own Workspaces with Export as Pack would have meant publishing it to the world.
- Creators could not try a Pack before publishing it. A consultant could not give a client a private one.
- A Marketplace outage would stop every install except Ziffr's own bundled Packs.

#### Options considered

| Option | Hinders casual copying of paid Packs | Offline self-hosting | Private and own Packs | Removable by changing the code |
| --- | --- | --- | --- | --- |
| As today: files and Marketplace everywhere; license, publishing checks and takedown | little | keeps | keeps | nothing to remove |
| Marketplace only, everywhere (the suggestion as said) | where the code is unchanged, until someone exports again | breaks | breaks | yes |
| Marketplace only on hosted Ziffr, files elsewhere | on hosted Ziffr, until someone exports again | keeps | breaks on hosted Ziffr | not by hosted users |
| Proof of purchase for paid Packs only | where the code is unchanged, for files that still say they are paid | keeps | keeps | yes, on self-hosted |
| **Proof of purchase, and copies recognised by hosted Ziffr and the Marketplace (decided)** | also unchanged items under another name or license, on hosted Ziffr and in listings | keeps | keeps, except files that hold paid items not bought | yes, on self-hosted |

#### How a copy is recognised

- A **fingerprint** per item of a paid Pack: its content with keys, spaces and capitals evened out. Fingerprints of items that were earlier in a free Pack, one of Ziffr's own Packs or the Metric Catalog are left out, so common things match nothing.
- A file counts as a copy when several items of one paid Pack match. A single plain entry such as "Revenue" never does. The numbers are set in the payments step, against real Packs.
- **The Marketplace** compares each submission with the paid Packs it already holds. A match goes to the reviewer, and a copy is refused with the reason.
- **Hosted Ziffr** compares an uploaded Pack file itself. Ziffr Cloud hands it the list of fingerprints and each Workspace's purchases, over the signed calls it already makes to set limits. A Workspace that bought the Pack installs the file. Another is told which items match which Pack, and to buy it or take them out.
- **Self-hosted Ziffr compares nothing.** It asks for a receipt only for a file that says it is paid.

#### Problems with recognising copies

- **Privacy (spec 0030).** The Marketplace is never sent a Workspace's data. Sending it an uploaded file to check would break that, since a person's own export holds their Metric descriptions and Workflow words. Sending fingerprints of the file would too: common items can be guessed from them, and the request says what someone holds. **So the comparison runs inside hosted Ziffr, and nothing about an upload leaves it**, neither to the Marketplace nor to Ziffr Cloud. A refusal is recorded only in that Workspace.
- **What each side must learn.** Hosted Ziffr learns fingerprints of paid items and which Workspace bought which Pack. Ziffr Cloud, as the seller, knows the second already. The list goes only to hosted Ziffr, since anyone holding it could test which change gets past it.
- **Changed copies get through.** A reworded sentence changes a fingerprint. So do items typed again or saved as templates by hand. A Workspace Export import brings templates in too, and this check does not read it. Ziffr describes the check as catching copies passed on unchanged, never as copy protection.
- **Own exports can be refused.** A person's own Pack that carries paid items into a Workspace that did not buy them is refused, as decision 1 asks. Spec 0030's license covers the buying organisation's Workspaces, but hosted Ziffr knows no organisation, only Workspaces. A buyer needs a way to add a purchase to their other Workspaces, and a creator's own Workspaces must count as having their Packs.
- **False matches.** Someone could publish as paid what another person made privately, and that person's own file would then be refused. The answers are review of every paid version, an address to complain to, and takedown, which removes the fingerprints.

#### Measures beside it

- Now, the Marketplace flags a submission that matches another publisher's free Pack, and takes down copies that dropped the credit.
- With spec 0058's new format, an export of items from a CC BY or MIT Pack carries "based on <Pack> by <author>".
- With payments, Export as Pack leaves paid items out.

### Docs and the threat model

The service has a threat model of its own in its repository: forged senders, a hostile file against the build (files are data, and nothing from them is ever run or written into a page unescaped), the search as untrusted input, key theft, flooding. This repository's boundary 17 gains the withdrawn list and the web links. A security review precedes each of steps A and B.

## Testing Decisions

- **The contract:** a test in the service builds the index from `packs/` and answers the three requests; Ziffr's own client code, `signedByMarketplace` and the listing checks, accepts every answer.
- **Publishing:** a hostile table (paid license, taken handle, lower version, changed published version, an oversized or broken file) is refused; flags appear for the reviewer.
- **Takedown:** gone from search, page and updates; the withdrawn line shows in Ziffr (`marketplace.db.test.ts`); older answers without the field still read.
- **Keys:** a file signed by the spare installs; a broken or foreign signature is refused.
- **Step A** ends with a fresh self-hosted Installation installing and updating one Pack from the real address.

## Tickets (not opened yet)

In this repository:

1. The contract written as a reference with its JSON schema, and a check the service's build can run.
2. Ship the two public keys; the self-hosting guide. Needs the owner's keys.
3. Withdrawn Packs: the updates answer, storage, the line on the Packs page.
4. Browsing in Ziffr: newest first, From Ziffr and Community, web and report links.
5. The submissions line on Export as Pack and the creators' guide.
6. Credit on export, with spec 0058.
7. Threat model, user guide, release notes and an independent security review.

In the private repository:

8. Repository, checks, build, sign and publish commands.
9. The server function and static answers; deployment.
10. The web pages.
11. Step A: Ziffr's own Packs listed, and listed again after each Ziffr release.
12. Step B: intake, review checklist, terms pages.
13. Runbooks for takedown and key change.

## Out of Scope

- Paid Packs and payouts.
- Creator accounts and web upload (step C), publishing from inside an Installation.
- "Works with Ziffr" listings (spec 0030), which come after step B.
- Ratings, reviews by users, download counts.
- Code of any kind in a Pack (ADR 0013).

## Decisions (2026-11-26, by the owner)

1. **A paid Pack installs only with proof of purchase** for that Workspace or organisation.
2. **Hosted Ziffr and the Marketplace recognise copies of paid Packs** and refuse to install or list them, saying plainly that changed copies can still slip through.
3. **Free Packs and one's own exports can still be imported from a file.** No "Marketplace only" rule.

## Decisions still open

All proposed, none taken.

1. **How creators submit:** email to a private repository (recommended), pull requests to a public repository (cheap and open, but needs a GitHub account and keeps refused files in its history), or a web upload with accounts.
2. **Hosting:** static files and one Cloudflare Worker (recommended).
3. **Signing on the owner's machine** with a spare key offline (recommended).
4. **A person reviews every version** at first (recommended; spec 0030 reviews only a creator's first).
5. **Step B opens to invited creators first** (recommended), or to anyone at once.
6. **Legal advice before step B**, and imprint and privacy notice before step A (recommended).
