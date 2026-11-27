# 0044 Paid Packs on self-hosted Ziffr: a signed Purchase Receipt that works offline

**Status:** draft. **Ticket:** #770 (the owner's wish, 2026-11-22); the tracking issue is #770 and its sub-issues are labelled `spec:0044`.

## Problem Statement

Spec 0030 lets creators sell a Pack once the Marketplace holds about 20 good free ones, and says "paid Packs on self-hosted Ziffr come later: they need a way to prove a purchase without an account at Ziffr, which this spec does not design". That is the gap. People who run Ziffr themselves are the most likely to be technical, to build the best Packs and to care most about what leaves their Installation. If they cannot buy, the best creators will sell elsewhere and the Marketplace will hold only what is free.

Whatever we build has to keep what ADR 0013 and spec 0030 promise: the open code holds no prices; an Installation talks to nobody it did not choose; Ziffr Cloud never learns which Workspace or Installation a Pack went to; and a Pack is data that anyone can read.

## Solution

A **Purchase Receipt**: a small signed file that Ziffr Cloud gives the buyer when they pay, which an Installation Admin adds to their Installation. An Installation checks the signature with a public key that ships in the open code, offline, and then lets its Workspaces install the Pack the receipt names.

1. **Buying** happens in a browser at Ziffr Cloud (Stripe, VAT as for Sizes, 80 % or whatever spec 0030 settles on to the creator). The buyer enters the name of their organisation for the invoice. They download the Pack and the receipt.
2. **Adding** the receipt is an Installation Admin's step: Installation settings, **Packs bought**, **Add a receipt…**. The Installation checks it and keeps it.
3. **Installing** a Pack with the Ziffr Pack License on a self-hosted Installation then works as installing any Pack from a file, with one more check: the Installation holds a valid receipt for its id and version.
4. **Nothing is sent** to Ziffr to check a receipt. An Installation whose Marketplace connection is on also asks once a day for a short list of withdrawn receipts (refunds and fraud), the way it asks for updates.

## User Stories

1. As someone running Ziffr myself, I want to buy a paid Pack in my browser and use it on my Installation with no connection from my server to anyone, so that my Installation stays closed.
2. As an Installation Admin, I want to add a receipt once and have every Workspace of my Installation able to install that Pack, so that I do not hand the file to each Owner.
3. As an Owner, I want the Packs page to say a Pack is licensed to my organisation by name, so that I know whose license it is.
4. As a Pack creator, I want a self-hoster's purchase to pay me as any other, so that I do not have to choose between my best customers and the Marketplace.
5. As a creator, I want my price to cover updates within the version I sold, so that a fix does not need a second purchase.
6. As Ziffr, I want a refunded or fraudulent receipt to be withdrawable where the Installation's connection is on, so that a chargeback does not leave the Pack usable forever.
7. As a buyer who loses the receipt, I want to download it again from my account, so that a lost file is not a lost purchase.
8. As a maintainer, I want anyone to be able to verify a receipt with open code, so that no one has to trust a closed check, and I want the signing key to be replaceable without a release.

## Implementation Decisions

### Words

- **Purchase Receipt:** the signed file that proves a purchase of one Pack by one organisation (new in the glossary). Not a _licence key_, an _entitlement_ (the glossary's _Avoid_ words for Workspace Limits) or an _invoice_ (that comes from Ziffr Cloud and Stripe). **Packs bought** is the Installation settings section that lists them.
- The Pack's **Ziffr Pack License** (spec 0030) stays the legal terms; the Receipt is only what lets the Installation check that someone paid.

### What a Receipt is

- **A JSON file, signed:** `ziffr.receipt/1`, a compact JWS with an Ed25519 signature. Its claims: `id` (a random id, for withdrawal), `pack` (the Pack's id, such as `acme/hr-core`), `major` (the major version covered), `licensee` (the organisation's name as the buyer entered it, at most 120 characters of plain text), `issued` (a date), and nothing else: no email address, no Workspace, no Installation, no price.
- **It covers every version of that major version.** A buyer of 1.x gets 1.0 to 1.99 and any update within; 2.0 is a new purchase unless the creator says otherwise (a creator may offer an upgrade price; Ziffr Cloud then issues a receipt for 2).
- **It has no end date.** One-time prices only; subscriptions for Packs are out of scope.
- **The key:** Ziffr Cloud signs with a private key it alone holds. The open code carries the public keys it trusts, as a list with ids (`kid`), so a key can be replaced by a release and a receipt names the key that signed it. A receipt signed by a key not in the list is refused.
- **Where the code is:** the schema, the signature check and the checks of the claims are in `@ziffr/pack` (MIT, ADR 0002), so anyone can verify a receipt without Ziffr, and the server and `npx @ziffr/pack check-receipt <file>` give the same answer. The private signing code is in Ziffr Cloud's own repository.

### Adding and keeping a Receipt

- **Who:** only an Installation Admin, never through a key. **Where:** Installation settings, **Packs bought**. The page lists each receipt: the Pack, the licensee, the major version, the date, and whether it holds ("signature holds", "withdrawn", "unknown key").
- **Storage:** a new table `pack_receipts` (service role only): the receipt's `id` (unique), the Pack's id, the major version, the licensee, the date, the compact file as given, who added it and when. An added receipt is checked again before every use, not trusted from the table.
- **Size and shape:** a receipt file is at most 2 KB; the claims are exactly the list above, a value of another type or an extra claim is refused, the licensee has no control characters and is shown as text, never as markup.
- **Audited:** `pack_receipt.added` and `pack_receipt.removed`, with the Pack and the receipt's id.

### Installing with a Receipt

- **When it is needed:** installing a Pack whose license is `Ziffr-Pack-1.0` on an Installation where Ziffr Cloud is not set up. On hosted Ziffr, a paid Pack's purchase is recorded by Ziffr Cloud for the Workspace and checked there (spec 0030), and receipts are not used.
- **What is checked, in the core, before anything is written:** the Installation holds a receipt that is signed by a key in the list, names this Pack's id, covers this version's major, and is not on the list of withdrawn receipts the Installation has. The Pack file's own signature is checked as for any Marketplace Pack (a paid Pack that is not signed is refused: there is no one to say whose it is).
- **Who may install:** Owners (Admins for Packs with no Theme), in a Workspace of this Installation, as today. The receipt licenses the buying organisation's use (the Pack License), and the Installation is the unit a receipt reaches: any Workspace of it may install the Pack, and the Packs page says whose receipt it is.
- **Updates:** an update of the same major version needs no new receipt. An update to a new major version says so and needs one.
- **The record:** `pack_installs` gains the receipt's id, so the Packs page can say "licensed to ACME GmbH" and an uninstall does not touch the receipt.
- **The demo** installs no Packs (spec 0030).

### Withdrawing

- **A list, not a call:** with the Marketplace connection on, the daily update ask (spec 0030) also fetches `withdrawn-receipts`: signed (by a key in the list), a list of receipt ids and the date, nothing else. An Installation without the connection never learns of a withdrawal, which is the price of working offline, and the page says so.
- **What a withdrawal does:** the receipt shows as withdrawn; installing and updating that Pack from it is refused with the reason. A Pack already installed keeps working: Ziffr removes nothing from a Workspace (the same rule as a Size's grace in spec 0029), and the licence terms, not code, bind the buyer from then on.
- **What the request carries:** nothing of the Installation (as spec 0030 requires of every request to the Marketplace): the same request for everyone, an ETag for the list.

### What it does and does not do

- **It does not stop a determined person from copying a Pack.** A Pack is data in an open format; a file shared by a buyer is a file shared. What a Receipt gives is a clean way to pay, the buyer's name on the Packs page, the Pack License as the legal tool, and a way to withdraw a purchase that was refunded. That is enough for prices in the range of a few euros to a few tens of euros, and creators should price for that, and keep the value in updates and support.
- **It does not phone home**, check a Workspace, count Installations or limit the number of Workspaces.
- **It adds nothing to the Workspace Limit.** Installing a Pack never counts (spec 0030).

### Docs and the threat model

- A guide, `docs/guides/packs.md`, for buyers and creators; the Installation settings section in `docs/guides/self-hosting.md`; the user guide chapter on Packs; the threat model gains the boundary "a receipt file from outside" (shape, size, signature, kid, no markup).

## Testing Decisions

- **The receipt format** (`@ziffr/pack`): a table of valid and hostile receipts: wrong signature, unknown `kid`, an algorithm other than EdDSA (including `none`), an extra claim, a missing claim, a licensee with markup or control characters, an oversized file, a `major` that is not a whole number, a Pack id that is not one. `check-receipt` and the server agree on every row.
- **Adding** (`pack-receipts.db.test.ts`): only an Installation Admin, not through a key; the same receipt twice is one; a removed receipt is gone from the check; audit events hold no file.
- **Installing:** a paid Pack with no receipt, with a receipt for another Pack, for another major version, withdrawn, and with a good one, on self-hosted and on an Installation with Ziffr Cloud set up; the Packs page names the licensee.
- **Withdrawing:** a signed list withdraws; a list signed by an unknown key or tampered with is refused; the request holds nothing of the Installation (a test server records the request, as spec 0030's connection test does).
- **Offline:** with `ZIFFR_MARKETPLACE` off no request leaves, and a good receipt still installs.

## Tickets

1. **The Receipt format and the checks** in `@ziffr/pack`, the key list, `check-receipt`, the hostile table, the glossary entry. Blocked by nothing.
2. **Adding receipts**: `pack_receipts`, **Packs bought**, the audit events. Blocked by 1.
3. **Installing and updating a paid Pack** with the check, the licensee on the Packs page. Blocked by 2.
4. **Withdrawn receipts** through the Marketplace connection. Blocked by 2.
5. In Ziffr Cloud's repository, not sub-issues here: buying (Stripe, VAT, the organisation's name), issuing and re-downloading receipts, the signing key and its rotation, the withdrawn list, paying creators through Stripe Connect. Blocked by spec 0030's paid Packs.
6. Docs, the threat model, release notes and an independent security review of the whole spec (Opus).

## Out of Scope

- Subscriptions and rental of Packs, and receipts with an end date.
- A receipt per Workspace or per number of seats; the Installation is the unit.
- Checking a receipt against Ziffr Cloud on each install (it would make Ziffr's availability a condition of installing).
- Hiding or encrypting a Pack's contents; the format is open by design (ADR 0013).
- Paid Packs on hosted Ziffr (spec 0030).

## Decisions (proposed 2026-11-22)

1. **One signed file, verified offline with a key that ships in the open code.** The simplest thing that keeps an Installation closed and needs no account at Ziffr.
2. **The Installation, not the Workspace, holds the receipt.** One Admin step covers every Workspace of the Installation; the Pack License already speaks of the buying organisation's Workspaces.
3. **Nothing about the buyer but the organisation's name.** No email, no Workspace, no Installation: a receipt is less than an invoice.
4. **Withdrawal only where the connection is on, and it never removes an installed Pack.** An honest limit of working offline.
5. **Price for honest buyers.** A Receipt is not copy protection; creators are told so, plainly.

## Further Notes

- The same signed-file idea (a public key in the open code, a private key in Ziffr Cloud, a kid list) is what a licence for the first `ee/` feature would use (proposed in ADR 0016), so the key list and the check can be one piece of code.
