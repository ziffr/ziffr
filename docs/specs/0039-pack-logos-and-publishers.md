# 0039 Pack logos and publishers: whose Pack this is, shown on the Packs page and the Marketplace

**Status:** draft. **Ticket:** #654 (the owner's decision, 2026-11-22); the tracking issue is #654 and its sub-issues are labelled `spec:0039`.

## Problem Statement

A Pack (spec 0030) tells who made it in one line of text: its `author`. On the Packs page and the Marketplace that is a row of names, and a good Pack from a known business looks like any other. The creator has no mark of their own, and a Workspace that installs a "board meeting deck" Pack with a Theme gets a Theme without the logo that made it recognisable. Spec 0030 kept images out of Pack contents for good reasons (type, size, metadata and script checks) and left a Theme's logo to its Owner after installing. Since then Ziffr has the checks: Theme logos are PNG, JPEG or plain SVG, size-limited and checked by `logoOk` and `svgIsPlain`, and the Marketplace signs every file.

The owner's decision (2026-11-22): a Pack may bring **one logo and a publisher name**, shown on the Packs page and in the Marketplace, and a Theme in the Pack may use the logo.

## Solution

1. **A logo in the Pack's manifest**, one picture, checked by the same rules as a Theme's logo (and a little stricter in size). It is covered by the Marketplace's signature like the rest of the file.
2. **The publisher is the `author`.** No second field: the `author` name of every Pack, the five starting ones included, is the publisher name. The screens show it with the logo and say plainly who vouches for it: the Marketplace, which signed and reviewed the file, or nobody, for an uploaded one.
3. **A Theme in a Pack may use the Pack's logo** (`"logo": "pack"`), and installing sets the installed Theme's logo to it.
4. **Packs page, install preview and Marketplace** show the logo and publisher, always in a fixed, bordered box and never as part of Ziffr's own chrome.
5. **Export as Pack** can carry a logo, and updating and uninstalling follow spec 0030's rules for changed items.

## User Stories

1. As a creator, I want my Pack to show my logo and name on the Packs page and the Marketplace, so that people recognise whose work it is.
2. As an Owner or Admin looking at a Pack, I want to see its logo and publisher before I install, and to be told whether the Marketplace vouches for them, so that I am not fooled by a logo on an uploaded file.
3. As an Owner, I want a Theme from a Pack to come with the Pack's logo, so that I do not hunt for the picture and set it by hand.
4. As an Owner, I want installing and updating a Pack never to put someone else's logo on my emails, forms and View Link pages unless I made that Theme the default myself, and to be told when I do.
5. As an Owner uninstalling a Pack, I want to be able to take the publisher's logo out of the Themes I keep, so that their mark does not stay in my Workspace by accident.
6. As a creator, I want **Export as Pack** to take a logo from one of my Themes, so that the Pack I share looks like the Theme I built.
7. As a self-hoster, I want a Pack's logo checked exactly like any other untrusted file, so that a picture cannot run anything or weigh down a page.
8. As the Marketplace's reviewer, I want a changed logo or publisher name in a later version to come to me, so that a trusted Pack cannot turn into someone else's brand.

## Implementation Decisions

### The logo in the file

- **Where:** a new optional manifest field `logo`, beside `listing`, holding one data address (`data:image/png|jpeg|svg+xml;base64,…`). Not in `contents`: spec 0030's rule "no images, fonts or links in the contents" stays as it is, and its sentence about Themes is replaced by this spec (a change-of-course note at the top of spec 0030 says so). One logo per Pack, no other image anywhere, still no fonts, no backgrounds and no links outside `listing`.
- **Format and checks:** PNG, JPEG or plain SVG, run through `logoOk` and `svgIsPlain`: at most 512 pixels on each side for PNG and JPEG, SVG without script, handlers, foreign content, external references or `<!DOCTYPE>`. **One implementation:** those checks move into `@ziffr/pack` (MIT, no dependencies) and the core imports them for Theme logos, so `npx @ziffr/pack check` and the server cannot disagree and there is no second copy to drift. The hostile table for logos is added to the existing Pack tests.
- **Size:** at most **128,000 bytes** decoded for a Pack logo (a constant beside `PACK_LIMITS`; the Theme limit stays 256,000). Reason: the Marketplace lists Packs by the dozen with a logo each, and a mark does not need more. The whole file stays under 1 MiB, so a logo of this size leaves the room it had.
- **Format version:** `logo` is one optional field in `ziffr.pack/1`; older Ziffr versions refuse unknown fields, so a Pack that carries a logo says so in its `ziffr` minimum version, as for any added field. No `/2`.
- **Alternative text:** the logo has none of its own; every place it is shown says "Logo of <publisher>" for people who cannot see it.
- **No metadata trusted:** a PNG or JPEG is only measured, never executed or parsed for text. When the Marketplace shows a logo it serves the bytes as an image with `X-Content-Type-Options: nosniff` and a `Content-Security-Policy: sandbox` header, SVG included, and never inlines an SVG into a page. Ziffr draws it in an `img`, which runs no script.
- **Licence:** a Pack's licence covers its contents, not anyone's trademark. The creators' guide and the Marketplace terms say that a logo stays the publisher's, and that putting someone else's in a Pack is grounds for taking it down.

### The publisher

- **`author.name` is the publisher.** It exists, it is checked (plain text, 80 characters), every Pack has one, and the glossary says "author". A second field would give two names for one thing and a Pack could contradict itself. The screens write "by <name>" and the glossary's **Pack** entry gains "and optionally a logo".
- **What a person is told they can rely on**, in two states that spec 0030 already has:
  - **From the Marketplace** (the signature holds, spec 0030): the page says "Published through the Marketplace as @<handle>". The handle is the first part of the Pack's `id`, and the Marketplace signs a file only for the account that owns that handle, so the handle is real. The author name and the logo were **seen by a person** at the creator's first Pack and at every later version that changes either (below), and the page says so: "Name and logo checked by the Marketplace."
  - **An uploaded file:** the page says "Uploaded file. The Marketplace did not check it. Its name and logo are what the file says about itself." The Pack's `id` is shown as written, with the note that only the Marketplace can prove a handle; a file whose `id` begins with `ziffr/` and is not signed carries one more line: "This file says it is from Ziffr. It is not signed by the Marketplace." Both states are the ones the page already shows; no "verified" badge is added, because a badge people learn to trust is what a faker copies. What a person sees differs by words and by a line, not by an icon.
- **Nothing the file says makes it more trusted:** the logo and name never change which checks run, who may install (Owners and Admins; Owners for Themes) or what installing may do.

### Where the logo is shown

- **The Packs page, the install preview and the update page:** next to the Pack's name, in a fixed box (at most 48 pixels high and 160 wide, a visible border, the logo scaled to fit and never beyond), under the line that says who vouches for it. Nowhere else in Ziffr: not the sidebar, not notifications, not emails, not a Workspace's header. Ziffr's own chrome never carries someone else's mark.
- **The installed Pack's record** (`pack_installs`) keeps the manifest as installed, logo included, and the Packs page draws it from there, through a checked address of its own (like `/api/brand/logo/...`: signed-in people only, served only if the install belongs to their Workspace and the picture passes the checks again), not as a picture carried in every page.
- **The Marketplace** shows the logo on its listing and Pack page from the signed file of the latest listed version, so the listing cannot show a picture the file does not hold.
- **Self-hosted without the connection** (spec 0030): the starting Packs in `packs/` may carry the Ziffr logo; an uploaded file shows its logo in the preview as above.

### A Theme that uses the Pack's logo

- **In the file:** a Theme in a Pack may say `"slides": { "logo": "pack" }`, and nothing else is accepted in that field in version 1. A Theme file on its own (outside a Pack) with it is refused ("a logo comes only from a Pack"), and so is a Pack Theme that says it when the Pack has no `logo`, so the schema keeps spec 0030's rule that a standalone Theme file holds no image. The existing `logoWidth` and `logoPosition` apply; the ratio is read from the picture.
- **Installing** copies the Pack's logo into the new Theme's own logo (`slides.logo`), checked again by `logoOk`: the Theme then works like any Theme with a logo, in one database step with the rest of the install. Installing still never makes a Theme the team default, so **nothing the Workspace sends changes by installing.**
- **When an Owner makes such a Theme the team default,** or sets a dashboard or deck to use it, the page names whose logo it is ("This Theme shows <publisher>'s logo. The team default Theme also dresses your emails, forms, View Link pages and Slack messages.") and asks once. The Theme is marked as carrying the Pack's logo for as long as its logo is the Pack's, exactly (compared by hash).
- **The item hash** (spec 0030: a hash of the item as installed, to see whether the Workspace changed it) is computed on the Theme as a file, with `"logo": "pack"` where its logo equals the Pack's and nothing where it has another or none. So an Owner who sets a logo of their own does not count as changing the Pack's Theme, and one who replaces or removes the Pack's logo does.

### Updating and uninstalling

- **A new version with a new logo:** the update page shows the old and the new logo side by side and says "the logo changed", for Owners and Admins to read before they take the update (like a changed item). A Theme that is unchanged in the Workspace and still says `"pack"` gets the new logo with the replacement; a Theme the Workspace changed is kept as it is, and the new version is offered beside it with **Take the new version**, as in spec 0030.
- **A new version without a logo:** an unchanged Theme that said `"pack"` loses its logo with the replacement; one the Workspace changed keeps what it has.
- **A new version whose Theme stops saying `"pack"`:** an unchanged Theme becomes one without a logo. A Pack whose version still says `"pack"` without a `logo` is refused by the checks.
- **Uninstalling:** the Pack's record and its logo go. A Theme that is kept, because the Workspace changed it or uses it, **keeps the logo it holds** (it is an independent copy now, as every kept item is), and the uninstall page lists those Themes and offers **Also remove <publisher>'s logo from these Themes**, ticked by default: the relationship that put the logo there ends with the uninstall. Only a logo that still equals the Pack's is removed; a logo the Owner chose stays.

### Checks on the Marketplace

- **Automatic, every version:** the logo passes the shared checks (it decodes as the type it says, within the size); the author name passes the plain-text rules.
- **A person reviews** the first Pack of a creator and every paid Pack's every version, as in spec 0030. **New in this spec:** a later free version whose **logo or author name differs from the last listed version** also goes to a person, because the cheapest way to impersonate a business is a harmless Pack that changes its mark later. The review asks: is this the creator's own mark, or a lookalike of someone else's? A logo that is the same picture (equal hash) needs nothing new.
- **Taking a Pack down** for a logo that is not the creator's follows spec 0030's taking down: new installs and updates stop, installed copies stay, and the Packs page of those Workspaces says why in one line.

### Export as Pack

- **Export as Pack** (spec 0030, ticket 8) gains an optional **Logo** step: pick the logo of one of the Workspace's Themes, or upload a picture, checked by the same checks; the Preview shows it and the author line (the person's name or the Workspace's name, editable, as today).
- **Themes in the export** whose logo is the chosen one carry `"logo": "pack"`; Themes with another logo carry none, as now, so no second picture is ever in the file.
- The round trip of spec 0030 (export, install elsewhere, export again gives the same file) holds with a logo: the installed Theme's logo equals the Pack's, so it exports as `"pack"` and the logo is chosen again as the same picture.

### Glossary, docs and the threat model

- **Glossary:** **Pack** says "its name, version, author, licence and optionally a logo"; **Theme** says that a Theme from a Pack may use the Pack's logo, and that the team default Theme's logo dresses what Ziffr sends. No new term: the creator is the **author**, the logo is a logo. "Publisher" is not a glossary word; the screens say "by <author>".
- **Docs:** `docs/guides/packs.md` (the field, the limits, the licence line, `check`), `docs/guides/themes.md` (the Pack logo and the file), the user guide chapters on Packs and on Decks and Themes (the logo on the Packs page, the update and uninstall pages, the default-Theme question).
- **Threat model:** boundary "Packs as files from outside" gains the logo as the one image a file may bring: what it is checked for, that it is shown only in a bordered box, never in Ziffr's chrome, and that a logo on an uploaded file is self-declared. Impersonation by lookalike logo is an accepted risk on the Marketplace, with the review above as its answer.

## Testing Decisions

- **Hostile table** for `logo` (in `@ziffr/pack`'s tests, run against the server's checks too): too big, too many pixels, WebP, a PNG header that lies, an SVG with `<script>`, `onload`, `<use href>`, `<image>`, an external `href`, `<!DOCTYPE>` and an entity, a text file declared as PNG, a data address of another type, bad base64, a second logo, `"logo": "pack"` in a Theme of a Pack without one, `"logo": "pack"` in a standalone Theme file, any other string in `slides.logo`.
- **Install** (`packs.db.test.ts`): a Pack with a logo and a Theme saying `"pack"` installs the Theme with the logo, in one step with the rest; a failure half-way leaves nothing; installing never sets a default Theme; the Marketplace path with a broken signature is refused whatever the logo says.
- **Item hash and update:** an Owner's own logo does not count as a change; replacing or removing the Pack's does; the four update cases above; **Take the new version** keeps the old Theme in its Versions.
- **Uninstall:** a kept Theme keeps the logo by default of the list and loses it when ticked; a Theme with the Owner's own logo is untouched; the Pack's logo address stops serving.
- **The checked address:** serves only to people of the install's Workspace; refuses a picture that fails the checks; cache headers right.
- **Marketplace review rule** (in the Marketplace's own repository): a changed logo or author name routes a free later version to a person; the same logo does not.
- **Export as Pack** round trip with a logo; the Preview shows it; a Theme with a different logo carries none.
- **Pages** tried in the running app (Packs page, install preview, update page, uninstall page, the default-Theme question) with an uploaded file and a signed one, and the user guide chapters updated.

## Out of Scope

- More than one image per Pack, screenshots, banners, icons per item, fonts, backgrounds, or any image in a Pack's contents.
- A "verified publisher" badge, publisher pages with several Packs, and publisher accounts in Ziffr itself (the Marketplace's own service keeps creators).
- Logos on Metric Catalog entries, Dashboard Templates or Workflow Templates.
- Showing a Pack's logo anywhere outside the Packs page, the install and update pages and the Marketplace.
- Trademark checks by machine: a person reviews, the Marketplace takes down.

## Decisions (2026-11-22, by the owner)

1. A Pack may bring one logo and a publisher name, shown on the Packs page and the Marketplace.
2. A Theme in the Pack may use the logo.

Proposed in this spec, open to change: the publisher name is the existing `author`, with no new field and no "verified" badge, only a plain line saying who vouches for it; the Pack logo may weigh at most 128,000 bytes; installing never makes a Theme the team default, and making one the default asks once; uninstalling offers to remove the publisher's logo from kept Themes, ticked by default; a later version that changes the logo or the author name goes to a person.

## Tickets

1. The shared logo checks in `@ziffr/pack` (`logoOk`, `svgIsPlain`, the limits), imported by the core; the `logo` manifest field and its limit; `"logo": "pack"` in the Theme file; the hostile table; the generated schema reference; the glossary. Not blocked.
2. Installing: the logo kept with the install record, the Theme's logo set from it, the item hash rule, the checked address for the Packs page, db tests. Blocked by 1.
3. Pages: logo and "by <author>" with the voucher line on the Packs page, the install preview and the update page; the default-Theme question; the user guide chapters. Blocked by 2.
4. Updating and uninstalling with logos: the four update cases, the old and new logo on the update page, **Also remove the logo** on the uninstall page, db tests. Blocked by 2.
5. Export as Pack with a logo and the round trip; the creators' guide and `docs/guides/themes.md`. Blocked by 1.
6. Docs and a security review of the whole spec: the threat model boundary, the Marketplace terms line on logos, the Packs guide. Blocked by 2 to 5.

In Ziffr Cloud's own repository, not a sub-issue here: the Marketplace shows the logo (served with `nosniff` and `sandbox`), signs it with the file, and routes a changed logo or author name to a person. It is noted on the tracking issue when ticket 1 lands.
