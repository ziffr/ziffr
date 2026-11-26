# 0030 Packs and the Marketplace: ready-made Metrics, dashboards and looks, without anyone's code

**Status:** done. **Tracking issue:** #259 (label `tracking`); tickets #273 to #281 carry `spec:0030`, built in #294, #301, #309, #322, #326, #327, #337, #344, #346 and the closing pull request of #281. The decisions that are hard to reverse, and the options weighed, are in [ADR 0013](../adr/0013-hosted-ziffr-priced-by-size-billing-outside-marketplace-without-code.md).

> **Changed course (spec 0059, decided by the owner on 2026-11-26):** anyone publishes a free Pack and programs check it; no person reviews it before it is listed. The Marketplace signs a statement about a file, and a purchase of a paid Pack belongs to an account. What stands below on those points is replaced; spec 0059 lists each change.

> **Changed course (spec 0039):** a Pack may bring one logo and its Themes may use it (`"logo": "pack"`); the rest of "No images, fonts or links in the contents" stands.

## Problem Statement

A new Workspace starts empty, and filling it well takes knowledge many teams do not have. Which Metrics does a SaaS business track, how is a sports club's attendance asked for, what does a good board deck show? Ziffr has pieces of the answer: the Metric Catalog, Dashboard Templates, View Designs and Analysis Recipes (spec 0024), and Themes. But each is made in one Workspace and stays there. Someone who built a good setup for online shops cannot hand it to the next shop, and nobody can earn anything for doing so.

The usual answer, a plugin store, is ruled out: code from others never runs inside Ziffr (ADR 0013). Whatever is shared has to be data Ziffr already knows how to check and draw.

## Solution

A **Pack** is one file of things to add to a Workspace, with no code: Metric Catalog entries, Dashboard Templates, Deck Templates, View Designs, Analysis Recipes, Workflow Templates and Themes. It carries a manifest with its name, version, author and license. Each thing in it uses the format Ziffr already checks, or one this spec adds.

**Installing** a Pack copies each thing into the Workspace, marked with the Pack and version it came from, like a copy from the Metric Catalog but with a record of where it came from. New versions are offered, never applied by themselves. Uninstalling removes what nobody changed.

The **Marketplace** lists Packs that passed automatic checks, and a person's review for a creator's first Pack and every paid one. It also lists programs that run outside Ziffr, such as Feeds, as "works with Ziffr", without selling them. Packs are free at first. Paid Packs come once there are about 20 good free ones, with 80 % to the creator. Self-hosters install free Packs through an outgoing connection that is off by default, or by uploading the file. Ziffr seeds the Marketplace with five free Packs of its own.

## User Stories

1. As an Owner of a new Workspace, I want to pick a Pack for my kind of business and get its Metrics, a dashboard and Workflows ready to fill in, so that I start from a good setup instead of an empty page.
2. As them, I want to see everything a Pack adds, drawn with Sample Data, before I install it, so that I know what I get.
3. As an Owner or Admin, I want to install a Pack without it creating any Metric until I say so, so that installing never fills my Workspace or my Size by surprise.
4. As them, I want to be told when a new version of an installed Pack exists, see what changed, and choose whether to take it, so that nothing I built changes under me.
5. As them, I want my own changes to something from a Pack kept when I update, so that an update never undoes my work.
6. As them, I want to uninstall a Pack and have what I never changed removed, while what I changed or use stays, so that uninstalling cleans up without breaking a dashboard.
7. As a Member, I want to see where a template or design came from (its Pack, version, author and license), so that I know whom to thank or ask.
8. As a creator, I want to make a Pack from things in my Workspace, check it on my own computer, and publish it with a license from a short list, so that others can use it on clear terms.
9. As a creator, I want my first Pack reviewed by a person and every later one checked automatically, so that publishing is quick once I am trusted.
10. As a creator, later, I want to sell a Pack and get 80 % of the price, so that good work pays.
11. As someone running a Feed or another program outside Ziffr, I want it listed as "works with Ziffr" and bill my customers myself, so that people find it without Ziffr taking a share.
12. As an Owner looking for a program outside Ziffr, I want its listing to say what it reads and that it uses only a Feed Key, so that I know what I hand it.
13. As a self-hoster, I want Ziffr to make no connection to the Marketplace unless I turn it on, and to install a Pack from a file instead, so that my Installation talks to nobody I did not choose.
14. As anyone, I want a Pack to be unable to read, send or change anything that I could not do by hand, so that installing one is never a risk to our numbers.

## Implementation Decisions

### What a Pack holds

| In the Pack | Format | Becomes, when installed |
| --- | --- | --- |
| Metric Catalog entries | `ziffr.metric/1`, a Metric Description without owner, Submitters or values | Entries in the Workspace's part of the Metric Catalog, under the Pack's name |
| Dashboard Templates | `ziffr.dashboard-template/1` (new schema for the existing templates) | Dashboard Templates of the Workspace |
| Deck Templates | `ziffr.deck-template/1` (new) | Deck Templates of the Workspace |
| View Designs | `ziffr.view/1` (spec 0024) | View Designs of the Workspace |
| Analysis Recipes | `ziffr.analysis/1` (spec 0024) | Analysis Recipes of the Workspace |
| Workflow Templates | `ziffr.workflow-template/1` (new) | Workflow Templates of the Workspace |
| Themes | `ziffr.theme/1` (new schema for the existing Theme tokens) | Themes of the Workspace |

- **The existing schemas stay the authority.** A View Design in a Pack is checked by `checkViewDesign`, a recipe by the recipe checks, exactly as when pasted into the Playground. The Pack format only wraps them.
- **New schemas for what has none yet:** Dashboard Templates and Themes exist today but have no published file format; this spec gives them one, generated into `docs/reference/` like spec 0024's. Deck Templates and Workflow Templates do not exist yet; ticket 2 adds them as features (save a deck or a Workflow as a template, start from one) and as formats. "Template" alone is never used in UI text without what it is a template of.
- **References inside a Pack** go by an item's `key` and only to items of the same Pack: a Dashboard Template's Slot may suggest a Metric Catalog entry (`"suggests": "mrr"`), a widget may use one of the Pack's View Designs, a Deck Template may name one of its Themes. A reference to anything outside the Pack is refused.
- **No images, fonts or links in the contents.** A Theme in a Pack uses only fonts Ziffr ships and no logo or background image. images would need their own checks (type, size, metadata, SVG scripts) for little gain in version 1; a Theme's logo is set by its Owner after installing.
- **Derived Metrics** may be Metric Catalog entries; their formula names other entries of the same Pack by key, and **Set up** (below) makes their inputs first.

### The manifest

```json
{
  "format": "ziffr.pack/1",
  "id": "ziffr/saas-metrics",
  "name": "SaaS metrics",
  "version": "1.2.0",
  "summary": "MRR, churn and retention, with a monthly dashboard and the Workflow that asks for them.",
  "author": { "name": "Ziffr" },
  "license": "CC-BY-4.0",
  "ziffr": ">=0.12",
  "listing": { "homepage": "https://example.com/saas-pack", "support": "https://example.com/saas-pack/help" },
  "contents": {
    "metrics": [{ "key": "mrr", "metric": { "format": "ziffr.metric/1", "name": "MRR" } }],
    "dashboards": [{ "key": "saas-overview", "template": { "format": "ziffr.dashboard-template/1" } }],
    "workflows": [{ "key": "monthly-close", "template": { "format": "ziffr.workflow-template/1" } }]
  }
}
```

(The items are cut short here; each holds its whole document.)

- **`id`**: the creator's Marketplace handle and a slug, the same for every version.
- **`version`**: three numbers (major, minor, patch). A new version must be higher than every published one.
- **`license`**: one of `CC-BY-4.0` or `MIT` for a free Pack, `Ziffr-Pack-1.0` for a paid one. Nothing else is accepted.
- **`ziffr`**: the oldest Ziffr version that can install it; an older Ziffr says "needs Ziffr 0.12 or later" instead of failing half-way.
- **`listing`**: the only place a Pack may hold web addresses, `https` only, shown on its Marketplace page and its Pack page in Ziffr as plain links (`rel="noopener nofollow ugc"`). Nothing in `contents` may hold one, as spec 0024 already rules for designs.
- **Every item** has a `key` unique in the Pack and kept across versions; updates and uninstalling match items by it.
- **Limits:** the file at most 1 MiB, at most 200 items, at most 50 of a kind; every text with the length and plain-text rules of spec 0024. Unknown fields are refused, duplicate fields refused, `__proto__` read as data.
- **The schema** is published as `docs/reference/pack.schema.json`, generated from the definition the checks run.
- **For creators,** `@ziffr/pack` (MIT, like the other packages others build on, ADR 0002) holds the schemas and a command, `npx @ziffr/pack check my.pack.json`, that runs the same checks as the server. **Export as Pack** in Ziffr makes a Pack from things a person picks in their Workspace, with Sample Data and never their values.

### Installing

- **Who:** Owners and Admins, as for adding a View Design today (spec 0024). A Pack that holds Themes needs an Owner, since only Owners change Themes. Never in the demo. Members see the installed Packs and what each added.
- **From where:** the Marketplace (where the connection is on) or an uploaded file. Both go through the same checks on the server before anything is written.
- **Before installing:** the Pack's page in Ziffr shows every item, drawn as a Preview with Sample Data, with its license and author. A file from outside the Marketplace says so plainly ("Uploaded file. The Marketplace did not check it.").
- **What installing does:** it copies each item into the table it lives in today, with three more columns: the install it came from, its `key`, and a hash of the item as installed. A new table `pack_installs` keeps the Workspace, the Pack's id, version, license, where it came from (Marketplace or upload), whether its signature held, the manifest as installed, who installed it and when. Everything happens in one database step, so a Pack is either installed whole or not at all.
- **What it never does:** create Metrics, Workflows, dashboards or decks, send anything, or change anything already in the Workspace. Metric Catalog entries are only entries; templates are only templates. Installing never counts towards the Workspace Limit (spec 0029).
- **Set up from this Pack** is a separate, optional step after installing. A person picks which of the Pack's Metric Catalog entries to make into Metrics, which Dashboard Template to make into a dashboard with its Slots filled by them, and which Workflow Template to use, with the people picked. Each Metric is made through `createMetric`, so the Workspace Limit, the Audit Log and every rule apply. The result is ordinary Metrics, a dashboard and a Workflow, as if made by hand. keeping installing and setting up apart means installing can never fill a Size or send a Prompt.
- **A Metric made from a Pack's entry** is an independent copy, as from the Metric Catalog today. It records the Pack and entry it came from, as `from_catalog_id` does today, and updating or uninstalling the Pack never changes it.
- **Audit:** `pack.installed`, `pack.updated` and `pack.uninstalled`, with the Pack's id and version.
- **Signatures:** the Marketplace signs each published version (Ed25519) and Ziffr ships the Marketplace's public key. A Pack from the Marketplace whose signature fails is refused. An uploaded file with a valid signature is shown as from the Marketplace; one without is installed as an uploaded file, after the warning above. the signature tells the person where a file came from; the checks, not the signature, are the protection.

### Set up fits the Size (added 2026-11-22, the owner)

Set up already checks the whole set before it makes anything (the Workspace Limit, the trial's cap), so a refused set-up leaves nothing half-built. What was missing is that a person learns it only after pressing the button. So:

- **The form says what it makes, before:** "Makes 18 Metrics. 12 of 50 left in Size Small." The number counts the entries ticked and the inputs of Derived Metrics made with them, as it changes with every box. The core gives the form the Workspace's count, its limit and Size name, how many more Metrics fit within the Size (`left`) and how many may be made now at all, within the room and grace of spec 0029 (`allowed`).
- **Three states:** it fits (`n` within `left`: plain line); it goes over the Size but within the room (`left` below `n` within `allowed`: the line says by how many, that the 14 days over the limit start, and links to Size and usage); it does not fit (`n` above `allowed`: an alert says how many fit, the button waits, and the way on is named: untick some, archive Metrics, or change the Size).
- **The way on is a link, never a dead end:** to **Size and usage** in Workspace settings (Change Size where Ziffr Cloud is set up; "ask whoever runs this Ziffr" where a limit has no Size name).
- **The core still decides.** The form's numbers are for reading only; Set up checks again, as before, and one test holds the form's `allowed` and the refusal the core gives to the same answer for every `n`.
- **For creators:** a Pack's page and `docs/guides/packs.md` say how many Metrics a full Set up makes, and advise a core of about 8 to 12 entries with the rest in a second Pack, so a Pack fits Small (50) beside what a Workspace already has. This is advice, not a format rule.
- **Nothing in a Pack changes:** no manifest field, no new check.

### Updating

- **Offered, never applied:** Ziffr asks the Marketplace once a day which installed Packs have newer versions. The Packs page and a badge on Workspace settings show them to Owners and Admins. Uploaded Packs are updated by uploading the newer file.
- **What the update page shows:** each item as added, changed, removed or the same, and, for each changed item, whether the Workspace changed its copy (its hash differs from the one installed).
- **Applying an update:** an item nobody changed is replaced by the new version; one the Workspace changed is kept as it is, and the new version is offered beside it with **Take the new version**. Taking it replaces the copy; the old one stays in its Versions, so it can be restored. An item removed in the new version is removed when unchanged, and kept, no longer marked as from the Pack, when changed. A major version says so first ("may change how things look or work").

### Uninstalling

- **Removes** every item that is unchanged and not in use. **Keeps** every item that was changed, and every Theme a dashboard, deck or the Workspace's default uses; kept items are no longer marked as from the Pack. The uninstall page lists both before anything is done.
- **Never touches** what was made from a Pack: Metrics, dashboards, decks and Workflows made with **Set up** or from its templates are independent copies. Widgets drawn with one of its View Designs keep their own copy (spec 0024).

### Checks before listing (on the Marketplace)

- **Automatic, for every version:** the Pack's schema and every item's own checks, exactly as on install; the license from the list; the version higher than the last; the `listing` addresses reachable over https, not redirecting elsewhere and not on a blocklist of known bad hosts.
- **Texts aimed at assistants:** descriptions of Metrics reach AI assistants through the MCP Server. Every text is searched for words addressed to an assistant: instructions to ignore, to call a tool, to send or record something. A hit stops the listing for a person to look at. This is a filter for what is obvious, not a protection: assistants reach Ziffr only through their key's scopes (the threat model's accepted risk "Assistants read workspace text").
- **A person reviews** a creator's first Pack, and every paid Pack's every version: does it do what its summary says, are its words fit to show, does it copy someone else's work. a free Pack's later versions are listed after the automatic checks alone, and the Marketplace can take any version down.
- **Taking a Pack down** stops new installs and updates. Installed copies stay, and the Packs page tells their Workspaces that it was withdrawn and why, in one line.

### Licenses

- **Free Packs:** CC BY 4.0 (for content, the natural choice) or MIT. Whoever installs one may change and share it on those terms.
- **Paid Packs:** the **Ziffr Pack License**: use in the buying organisation's Workspaces, changes allowed for that use, no resale and no sharing of the file. The license lawyer of ADR 0002 reviews its text before the first paid Pack.
- Ziffr's own Packs are CC BY 4.0.

### Paid Packs (later)

- Packs are free at first. Paid Packs come once the Marketplace has about 20 good free ones; until then a creator may list only free Packs.
- Ziffr sells a paid Pack in its own name through Ziffr Cloud (Stripe, with VAT as for Sizes) and pays the creator 80 % through Stripe Connect. the 80 % is of the price without VAT, and Stripe's fees come out of Ziffr's 20 %, so a creator can say exactly what they earn.
- A paid Pack is bought for a Workspace by one of its Owners. The Workspace can then install it and its updates.
- Paid Packs on self-hosted Ziffr come later still: they need a way to prove a purchase without an account at Ziffr, which this spec does not design.

### Programs that run outside Ziffr: "works with Ziffr"

- **What is listed:** a program that runs outside Ziffr and sends values in through a Feed, such as a CRM Feed, a warehouse query or an n8n flow. Its listing has its name, its creator, what it does, what it reads and from where, which Metrics it fills, its price as its creator sets it, and a link.
- **The check before listing:** a person checks, briefly, that its setup asks only for a Feed Key (never an Access Key, a Ziffr password or a session) and that it states what it reads. Its code, uptime and handling of other systems' credentials are not checked, and the listing says so in those words.
- **Money:** creators bill their customers themselves. Ziffr takes no share and handles no payment for it (ADR 0013).
- **Not listed for now:** programs that need an Access Key, such as reporting tools or assistants' servers, since they read values. they can come later with their own check of the scopes they ask for.

### The Marketplace, as Ziffr sees it

- The Marketplace is a service of Ziffr Cloud, in its private repository: creators' accounts, listings, checks, the review queue, signing, and later sales. Creators sign in with an email link, as on hosted Ziffr.
- Ziffr itself talks to it through one small read-only interface: list and search Packs, fetch a Pack's page and a version's file, ask which versions are newer. Every call goes from Ziffr's server, never from the browser, to `ZIFFR_MARKETPLACE_URL` (Ziffr's own by default) over https.
- **What Ziffr sends:** only what it asks for (a search, a Pack's id and version) and Ziffr's version. Never a Workspace's id, name or data, nor a person's. Updates are asked for by the list of installed Packs and versions for the whole Installation, so the Marketplace cannot tell Workspaces apart.
- **What Ziffr accepts back:** a list and pages as plain text checked like any other untrusted input; a Pack file at most 1 MiB, checked in full before anything is shown.

### Self-hosted Installations

- **The connection is off by default.** An Installation Admin turns it on in a section "Marketplace" of the Installation Settings (`ZIFFR_MARKETPLACE`, off unless set). The section says what is sent and what is not. Hosted Ziffr has it on.
- **Without it,** Owners and Admins install by uploading a Pack's file, which the Marketplace offers for download. The five starting Packs are also in this repository, so they work offline.
- **Paid Packs** on self-hosted Ziffr come later (above).

### The five starting Packs

Made by Ziffr, CC BY 4.0, kept in this repository under `packs/` and published to the Marketplace with each release. A test checks and installs each one.

1. **SaaS metrics:** Metric Catalog entries for MRR, new, expansion and churned MRR, customers, logo churn, net revenue retention and CAC; a monthly dashboard; a moving-average-of-growth recipe; a Workflow Template for the monthly close.
2. **Online shop:** orders, revenue, average order value (a Derived Metric), conversion rate, return rate and sessions, revenue with a Breakdown by channel; a weekly dashboard; a Workflow Template that asks for the week's numbers on Monday.
3. **Agency or freelancer:** billable hours, utilisation, revenue, effective hourly rate, open invoices and pipeline; a monthly dashboard; a Workflow Template that asks for hours on Fridays.
4. **Sports club:** members, joiners and leavers, attendance per training, fees received and volunteer hours; a season dashboard; a Workflow Template that asks each coach for attendance after training.
5. **Board meeting deck:** a Deck Template for a quarterly board meeting (key figures, revenue against its Target Series, cash and runway, headcount, highlights and risks); a Theme for it; a Workflow Template for the quarter's close.

The Metrics in them use the Metric Catalog's existing entries where one fits, so the catalog and the Packs say the same thing.

### Glossary

Adds **Pack**, **Marketplace**, **Deck Template** and **Workflow Template**. "Plugin" stays an _Avoid_ word, now for Pack too.

### Docs and the threat model

- A guide `docs/guides/packs.md`: making a Pack, checking it with `@ziffr/pack`, the licenses, publishing.
- The user guide gains a chapter on Packs: finding, installing, setting up, updating, uninstalling.
- `docs/security/threat-model.md` gains two boundaries when the tickets land: Packs as files from outside (extending boundary 13), and Ziffr's outgoing connection to the Marketplace. Until then an entry under "Open work" names them.

## Testing Decisions

- **The format:** every starting Pack passes; a table of hostile Packs is refused with the right message: too big, too many items, a key twice, a reference to an item not in the Pack, an address in the contents, a license not on the list, an unknown field, `__proto__`, a View Design or recipe the spec 0024 checks refuse. `@ziffr/pack check` and the server agree on the whole table.
- **Installing** (`packs.db.test.ts`): all or nothing (a failure half-way leaves nothing); no Metric, Workflow, dashboard or Delivery is made; only Owners and Admins, and Owners for Themes; never in the demo; the Audit Log event.
- **Set up:** Metrics made through `createMetric`, refused by the Workspace Limit (spec 0029) as any other; Derived Metrics after their inputs; Slots filled with the Metrics made.
- **Updating:** unchanged items replaced, changed items kept with the new version offered, removed items removed or kept by the same rule; **Take the new version** keeps the old one in Versions.
- **Uninstalling:** unchanged items removed, changed and used ones kept and unmarked; Metrics and dashboards made from the Pack untouched; widgets with its View Designs still draw.
- **Signatures:** a Marketplace file with a broken signature is refused; an uploaded file without one installs only after the warning.
- **The outgoing connection:** with `ZIFFR_MARKETPLACE` off, no request leaves Ziffr (a test server records none). With it on, the requests hold no Workspace id, name or person; answers that are too big, slow or malformed are refused without breaking the page.
- **Round trip:** **Export as Pack**, install in another Workspace, export again gives the same file, and holds no value of the first Workspace.
- The Packs pages are tried in the running app.

## Tickets

1. The Pack format: `ziffr.pack/1`, the schemas for Metric Catalog entries, Dashboard Templates and Themes, the checks and their hostile table, the generated reference; the glossary.
2. Deck Templates and Workflow Templates: save a deck or a Workflow as a template, start from one, and their formats.
3. Installing from an uploaded file: `pack_installs`, the marked copies, the Workspace's part of the Metric Catalog, the Packs page with Previews, the Audit Log. Blocked by 1, and by 2 for those two kinds.
4. Updating and uninstalling. Blocked by 3.
5. **Set up from this Pack**. Blocked by 3 and spec 0029's ticket 2.
6. The Marketplace connection: the Installation setting, the server's requests, signatures, browsing and update badges. Blocked by 3.
7. The five starting Packs in `packs/`, with the test that checks and installs them. Blocked by 3.
8. `@ziffr/pack` and **Export as Pack**, and the guide for creators. Blocked by 1.
9. Docs: the user guide chapter, the threat model boundaries, release notes, and a security review of the whole spec.

In Ziffr Cloud's own repository, not sub-issues here: the Marketplace service (accounts, listings, the automatic checks, the review queue, signing, taking down), the "works with Ziffr" listings. Later: paid Packs, Stripe Connect, the Ziffr Pack License, paid Packs on self-hosted Ziffr.

## Out of Scope

- Code of any kind in a Pack, in the browser or on the server, sandboxed or not (ADR 0013).
- Images, fonts and logos in Packs (version 1).
- Widget Templates on their own in a Pack; they fit the same format and can come when someone asks.
- Selling programs that run outside Ziffr, or taking a share of what they earn.
- Listing programs that need an Access Key.
- Ratings and reviews of Packs on the Marketplace.
- Paid Packs on self-hosted Ziffr.

## Decisions (2026-11-19, by the owner)

From a grilling session, written as decided:

13. **The Marketplace has only code-free Packs:** Analysis Recipes, View Designs, Templates (dashboard, deck, Metric Catalog), Workflow templates and Themes. Code running inside Ziffr is ruled out, as an ADR decision (ADR 0013).
14. **Programs that run outside** (Feeds, connectors) are only listed, as "works with Ziffr". Their creators bill their customers themselves, and Ziffr takes no share. Before listing, a short check: the program uses only a Feed Key and states what it reads.
15. **Selling Packs:** free at first. Later Ziffr sells them, with 80 % to the creator and 20 % to Ziffr. Paid Packs come once there are about 20 good free ones.
16. **Installing** makes a versioned copy, like the Metric Catalog. New versions are offered, never applied automatically. Uninstalling removes what is unchanged.
17. **Checks before listing:** automatic (schema, links, texts aimed at assistants), plus a person for a creator's first Pack and for every paid Pack.
18. **Licenses:** each Pack carries one from a short list: CC BY 4.0 or MIT for free Packs, and a "Ziffr Pack License" for paid ones (use in the buyer organisation's Workspaces, no resale; reviewed by the license lawyer).
19. **Self-hosters** can install free Packs through an outgoing connection that is off by default and turned on by the Installation Admin, or by uploading the file. Paid Packs on self-hosted Ziffr come later.
20. **Ziffr seeds the Marketplace** with 5 free Packs: SaaS metrics, online shop, agency or freelancer, sports club, and a board meeting deck.

The numbers follow the owner's list; points 1 to 12 are in spec 0029 (sizes and limits).

## Decided while writing

Proposed in the draft and accepted by the owner on 2026-11-19 as written; each is in the decisions above.

1. **Installing and setting up are two steps.** Installing adds only catalog entries, templates, designs, recipes and Themes; **Set up from this Pack** makes Metrics, a dashboard and a Workflow, within the Workspace Limit.
2. **No images, fonts or links in a Pack's contents;** addresses only in its listing.
3. **Deck Templates and Workflow Templates** are new features, built in ticket 2 before Packs can carry them, and new glossary terms.
4. **Signatures** show where a file came from; an uploaded file without one installs after a warning.
5. **A free Pack's later versions** are listed after the automatic checks alone; a person reviews the first Pack of each creator and every version of a paid one.
6. **Updates keep local changes** and offer the new version beside them; uninstalling keeps changed items and Themes in use.
7. **A Pack with Themes needs an Owner** to install, since only Owners change Themes.
8. **80 % of the price without VAT** goes to the creator; Stripe's fees come out of Ziffr's 20 %.
9. **Programs that need an Access Key** are not listed for now.
10. **The Marketplace is part of Ziffr Cloud,** closed; the format, the checks and installing are open, and `@ziffr/pack` is MIT.
11. **Asking for updates** sends the Installation's list of installed Packs, never per Workspace.

## Further Notes

- **Why "like the Metric Catalog", but with a record.** A copy from the Metric Catalog has no link back, so nothing can ever change it from outside. An installed item keeps the same independence: nothing changes it unless a person takes an update. The record of its Pack, key and hash only lets Ziffr tell "unchanged" from "changed" and offer updates.
- **Why no ratings yet.** With a handful of Packs, ratings say little and invite gaming. The person's review and Ziffr's own Packs set the bar first.

## As built (2026-11-20)

- **The format and its checks are the MIT package `@ziffr/pack`** (`packages/pack`, ADR 0002's "template and widget formats"); the core uses it, so `npx @ziffr/pack check` and the server run the same code. Its lists of Views, fonts and Attainment methods are its own, held to the app's by a test.
- **Analysis Recipes install as View Designs that draw them**, since a Workspace keeps recipes inside designs.
- **A catalog entry's name is unique within its Pack**, not the Workspace: two Packs may describe Revenue.
- **Limits per Workspace:** 25 Packs, 1,000 catalog entries from Packs, 1,000 templates, 100 View Designs.
- **The demo** reads, fetches and installs no Pack.
- **The Marketplace's address** defaults to `https://marketplace.ziffr.net`; the owner picks the domain. **Its public key** ships once Ziffr Cloud signs (`MARKETPLACE_PUBLIC_KEYS` is empty; a server may trust its own with `ZIFFR_MARKETPLACE_PUBLIC_KEY`).
- **Not built yet:** an update badge outside the Packs page, a Marketplace signature recognised on an uploaded file, paid Packs.

