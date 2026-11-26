# 0058 Who does what in a Pack: named Positions such as "Sales lead", filled at Set up

**Status:** draft. **Tracking issue:** #1164 (label `tracking`); its tickets will be sub-issues labelled `spec:0058`, opened once the owner has taken the decisions at the end. The owner approved the direction on 2026-11-26. Builds on spec 0030 (Packs) and spec 0045 (Checklist Items and Send Snapshot); the community Marketplace that shares such Packs is spec 0059.

## Problem Statement

A good setup is mostly about people: who sends which number, who approves it, who stands in, who gets the month's Snapshot. A Pack (spec 0030) can say none of that.

### What exists today

- **A Workflow Template names no person.** An Approve step says only how many Approvers to pick. A Checklist Item keeps its words and days, a Send Snapshot step only that it is there. Assignees, Stand-ins, recipients and the dashboard are left open.
- **A Tell step is left out** of a template, because it names people.
- **Set up from this Pack** asks for the Approvers, and whether the person setting up or a Feed sends the values. Everything else is wired by hand afterwards, on each Metric and Workflow.
- **The Metric list of a Pack is fixed.** A sales team of eight who each report the same six numbers needs 48 Metrics. A Pack can only hold one set, and holds at most 50 Metric Catalog entries.
- **Export as Pack** drops people. It takes Dashboard, Deck and Workflow Templates, so a live Workflow has to be saved as a template first.
- **Where something came from is soon forgotten.** An installed copy is marked with its Pack. Uninstalling or an update that drops it removes the mark from what is kept. A dashboard, deck or Workflow made from a template carries none. Export as Pack gives no credit.

## Solution

1. A Pack names **Positions**, such as "Sales lead" and "Salesperson". Its Metrics, dashboards and Workflows say which Position does what.
2. **Set up** asks who fills each Position, shows who will then see what and which messages go out, and writes the people into the ordinary places. The result is ordinary Metrics, Shares and Workflows, as if made by hand.
3. A Pack may have a **Repeat**: a part that Set up makes once for each salesperson, site or company a person lists, with its own Metrics.
4. **Export as Pack** turns the people in a setup back into Positions. No name, address or id goes into the file, and Ziffr checks the file's words for names before it hands it out.
5. **Ziffr remembers where things came from**, so an export credits free Packs by itself and leaves paid ones out (spec 0059).

## The word

**Position** is the recommendation. The owner confirms it before ticket 1.

| Word | Why not, or why |
| --- | --- |
| Role | Taken three times over: a **Workspace Role** is what a person may do in the whole Workspace, Viewer is "a role on one shared thing", and Group and Business Function both avoid it. "This Pack has the role Sales lead" would read as a permission. |
| Pack Role | Still reads as a permission, and a Workflow Template saved outside a Pack would carry it too. |
| Seat | Reads as a paid seat. ADR 0013 rejects prices per person. |
| Part | Reads as a part of a Pack or of a formula. |
| Persona | Avoided already (Pack Audience), and means a made-up user. |
| Assignee, Owner | Both exist and mean one person on one thing. |
| **Position** | "Sales lead" and "Salesperson" are positions in plain English, and the word promises no permission. |

Two costs are accepted. Code already says `position` for where a logo or a widget sits, which no person reads. Business Function avoids "job title"; a Position is not a title kept on a person, it is a blank in a setup.

On screen the Pack's own words do most of the work: "Who is the Sales lead?". The word Position appears only in headings and for creators.

### Glossary (added by ticket 1)

**Position**: A named place in a Pack that people fill when it is set up, such as "Sales lead" or "Salesperson": who submits, approves, stands in, ticks off a Checklist Task, is told, gets a Snapshot or is shared with. It grants nothing by itself: filling it writes the people into those ordinary places. Not a Workspace Role, not a Viewer or Editor, not a Group, not a Business Function, and not a Slot, which takes a Metric. _Avoid_: Role, seat, persona, job title

**Repeat**: A named part of a Pack that Set up makes once for each entry of a list a person types, such as each salesperson, site or company: its own Metrics, and its own Positions, Workflow or dashboard where the Pack says so. _Avoid_: Instance, copy, segment, dimension

## User Stories

1. As an Owner setting up a sales Pack, I want to say once who the Sales lead is, so that they approve, stand in and get the Snapshot without my wiring each Metric.
2. As them, I want to list my eight salespeople and get one set of Metrics for each, so that each reports their own numbers.
3. As a facility manager, I want one set of Metrics and one approver per site, so that each site manager answers for their site.
4. As an accountant, I want one set per client company, with the company's name on its Metrics.
5. As an Owner, I want to see, before anything is made, which person will see which Metrics and who will get a message today.
6. As an Owner, I want to leave a Position empty and fill it later, where Ziffr allows an empty place.
7. As an Owner whose team grew, I want to add one more salesperson to what I set up, without making the rest again.
8. As a salesperson, I want to see my own numbers and not my colleagues', unless someone chose to share them with me.
9. As a creator, I want Export as Pack to turn my people into Positions, so that I can share how we work without saying who we are.
10. As anyone whose name is in a Workspace, I want my name never to travel in a Pack by accident.
11. As a creator, I want whoever builds on my free Pack to credit me without having to think of it.
12. As a creator of a paid Pack, I want an export from a buyer's Workspace to leave my work out.

## Implementation Decisions

### What a Position is, and is not

- A Position is **part of a file, filled at Set up**. It is not a thing in the Workspace that rules look up later. After Set up, a Metric has Submitters and a Workflow has Approvers, exactly as today.
- Changing who does something later is done where it is done today: on the Metric, the Workflow or the Share. **Live Positions** (change the holder once, everything follows) are not in this spec: every send and every visibility rule would have to look them up, and Groups already serve the sharing part. This is open decision 2.
- A Position says how many people fill it: `"people": "one"` or `"several"` (at most 20, as a Tell step takes today).

### What carries a Position

| Place | Position takes | Who may fill it (today's rule, unchanged) |
| --- | --- | --- |
| Submitter of a Metric | one or several | Members, Guests and Contacts |
| Stand-in of that Submitter | one | A Member or Contact, never a Guest, never the Submitter |
| Viewer or Editor Share of a Metric or dashboard | one or several | People with a Workspace Role, not Contacts |
| Approvers of an Approve step, in order (1 to 3) | one each | As the Workflow editor allows today |
| Checklist Item for information: who is told | one or several | People with a Workspace Role |
| Checklist Item to tick off: Assignee and Stand-in | one each | People with a Workspace Role; the Stand-in never a Guest |
| Tell step: who is told | one or several | People with a Workspace Role |
| Send Snapshot step: who gets it | one or several | People with a Workspace Role |

- **Escalate** already says "Stand-in" or "owner" and needs no Position.
- **Tell steps** can now be in a template, but only those that wait for a share (`share_of_target`, `changed_more`). A level (`at_or_above`, `below`) is a number from someone's business and stays out. A Webhook never travels.
- **Send Snapshot** may name a Dashboard Template of the same Pack. Set up fills it only when that dashboard is made in the same run and the Workflow locks. The step shares nothing: a recipient who cannot open the dashboard is skipped, and the preview says so.
- **A place never changes a Workspace Role.** Set up invites nobody and makes no Contact. A person missing from the list is invited on the Members page first.
- **Never carried:** Metric Owner and Workflow owner (whoever sets up owns what is made, and may hand a Metric over), Asking Schedules, Alerts, Webhooks, Feeds, View Links, Calendar Links, Access Keys, Groups, the Group a Checklist Item is kept to, Away dates and Delivery Preferences.

### Format and versioning

- The Pack manifest gains `positions` and `repeats`. The wrapper of a Metric entry gains `per`, `submitters`, `standIn`, `viewers` and `editors`; a dashboard's gains `per`, `viewers` and `editors`; a Workflow's gains `per`.
- Steps of a Workflow Template name Positions inside the template document: `by` (Approve), `assignee` and `standIn` (to tick off), `to` (information, Tell, Send Snapshot), `dashboard` (Send Snapshot).
- A Metric Description (`ziffr.metric/1`) stays without people, and Dashboard Template documents do not change.
- The manifest also gains an optional `basedOn`: up to 10 Packs (id, name, author, license) whose items this one carries, and an item's wrapper says which of them it is `from`. So credit travels (spec 0059). It is plain text, shown on the Pack's page and proved by nothing.

```json
{
  "format": "ziffr.pack/2",
  "positions": [
    { "key": "area-lead", "name": "Area lead", "people": "one" },
    { "key": "site-manager", "name": "Site manager", "people": "one", "per": "site" }
  ],
  "repeats": [{ "key": "site", "name": "Site", "max": 30 }],
  "contents": {
    "metrics": [{ "key": "incidents", "per": "site", "submitters": ["site-manager"], "standIn": "area-lead", "viewers": ["area-lead"], "metric": { "format": "ziffr.metric/1", "name": "Incidents" } }],
    "workflows": [{ "key": "weekly", "per": "site", "template": { "format": "ziffr.workflow-template/2", "name": "Weekly site report", "dueWorkingDays": 2, "steps": [{ "type": "approve", "approvers": 1, "by": ["area-lead"] }] } }]
  }
}
```

(The manifest and the Metric are cut short.)

- **New format versions:** `ziffr.pack/2` and `ziffr.workflow-template/2`. Ziffr writes `/2` only when a file uses something new, and reads `/1` for ever.
- Earlier optional fields (the logo, Tags, the Pack Audience) stayed in `/1`. These do not: they change what Set up does, and an older Ziffr then says "This file is in format ziffr.pack/2; this Ziffr reads ziffr.pack/1" instead of "unknown field".
- Spec 0057 adds `ziffr.deck-template/2` and `ziffr.theme/2` on its own; the two do not touch the same fields. A Workspace Export carries no Positions; it gains where things came from, below.
- **Keys** of Positions and Repeats are kept across versions, like item keys.
- **Checks** (in `@ziffr/pack`, so the server and `npx @ziffr/pack check` agree): at most 20 Positions and 5 Repeats; names are plain text of at most 60 characters and are searched for words aimed at assistants; every key named exists; a Position for several people is refused where one is needed; the number of `by` entries equals `approvers`.
- **Inside and outside a Repeat:** a Position of a Repeat, used in an item outside it, means everyone in all its entries where the place takes several, and is refused where it takes one.

### Set up

Set up from this Pack (spec 0030) gains three parts. A Pack without Positions looks as it does today.

1. **Lists.** For each Repeat: one line per entry, with its name ("Munich") and the people for its Positions. Lines can be pasted. The name is not filled in from a person's name by itself.
2. **People.** One picker per Position, offering only those who may fill every place it is used in; the form says why someone is missing. In a Workspace of one, that person is filled in.
3. **Check before you set up.** Computed by the core with the same visibility rules as the app, from the planned result:
   - how many Metrics, Workflows and dashboards are made, against the Workspace Limit;
   - **who will see what**: each person with the Metrics they will see, and why (submits, shared, through a dashboard);
   - every Share, each with its own tick;
   - **messages now**: who would get a Prompt or a notice at once.

- **Empty Positions** leave the place open as a template does today: no Submitter, "nobody yet" on a Checklist Task, nobody told. An Approve step is the exception: a Workflow is not made while one of its Approvers is empty.
- **Shares start unticked** where they would show someone a Metric they do not already see in this plan. A Pack is a stranger's file, and sharing is a decision (open decision 3).
- **Prompts to others wait** for the Workflow's next run. "Ask them for the current period now" is a tick, off by default, with the number of messages beside it. Prompts to the person setting up behave as today. Sending Limits and Quiet Hours apply as always.
- **Self-approval** is not made possible: where one person is both Submitter and Approver, the preview says that the existing rules apply (nobody approves their own value; the Approve step's Self-check or count).
- **Order:** Workflows, Metrics, Submitters, Stand-ins, dashboards, Shares, the Send Snapshot step. Each goes through the existing core function, so permissions, limits and the Audit Log apply as by hand.
- **Who:** Owners and Admins, as today, never through an Access Key, never in the demo.

### One set of Metrics per salesperson, site or company

- An entry with `per` becomes one Metric for each line of that Repeat, named "<entry>, <line's name>" ("Incidents, Munich"). Two lines of a Repeat may not share a name.
- **Visibility follows the Metrics.** A site manager who only submits to Munich's Metrics sees only Munich's. This is why a Repeat makes separate Metrics and not one Metric with a Breakdown: Submitters, Approval, targets and sight belong to a Metric.
- **Names are words everyone reads.** The form says that a line's name appears in Metric names, read by everyone who sees them, Guests included.
- A Derived Metric per entry may use entries of the same Repeat and entries outside it. One outside a Repeat may not use an entry inside it, so there is no team total yet (open decision 6).
- **Workflows and dashboards** with `per` are made once per line. Without it, one Workflow takes all lines' Metrics.
- A dashboard outside the Repeat may use a repeated entry only in a Slot that takes several Metrics, which is filled with every line's Metric. A shared dashboard shows all of them to whoever it is shared with, and the preview says so by name.
- **Limits:** at most 50 lines in a Repeat (Set up fills a Slot with at most 50 Metrics today) and 200 Metrics in one Set up (today 50). The Workspace Limit and a trial's cap are checked for the whole set before anything is made. A run this large works in steps and says what was made if it stops.

### The record of a Set up, and adding a line

- Ziffr keeps what a Set up did: the install, Pack version, who and when, the people per Position, the lines and their names (sealed with the Workspace Key), and the ids of what was made, by Pack key and line.
- **The record decides nothing.** No permission, message or sight is ever worked out from it.
- Owners and Admins read it, and see names of only those Metrics, dashboards and Workflows they may see. Removing a person takes them out of it. Uninstalling the Pack deletes it and leaves everything made. The new tables are classified for the demo and for deletion, and a Workspace Export leaves the record out and says so.
- **Add a site** (the Repeat's own word) on the Pack's page runs Set up for one new line, with the same preview. It also offers to add the new Metrics to the shared Workflow and to the several-Metric widgets, each ticked and listed, only where this person may change them. What it cannot change, it lists.
- Removing a line is not automated: archive its Metrics by hand.
- Updating a Pack never changes what was set up. The update page says which Positions and Repeats are new or gone.

### Starting a Workflow from a template

A Workflow Template from a Pack, used on the Workflows page, asks "Who is the …?" for each Position it names, under the same rules. Templates saved from a Workflow inside Ziffr stay without Positions, as today.

### Export as Pack: people become Positions

- **What can be picked** gains live Workflows, dashboards and decks, converted by the same functions that save templates. A person picks only what they may see; Shares are offered only for things they own; Checklist Items kept to a Group stay out, as today.
- **A step "Who does what":** each distinct set of places held by one person or Group is one line, for example "Anna Berger: approves Weekly close; submits Revenue". The person types a Position name for it, merges lines, or leaves those places open. Names show on screen only.
- **Position names are never filled in** from a person's name, an address or a Group's name. A Pack's own Position names are offered again when the setup came from that Pack.
- **Repeats:** the person marks picked Metrics as "made once for each …" and picks one example set. Only that set goes out. Where the setup has a record, the example set is preselected and the line's name is taken off the Metric names.
- **Checking the words:** before download, every text of the file is searched for the names, first names, email addresses and handles of everyone in the Workspace, former members and Contacts included (the list that already hides names from Guests), for Group names and for the record's line names. Each hit is shown with where it is. The download waits until the text is changed for the export, or the person confirms that this word is not about a person ("May", "Will").
- **What a machine cannot find** (customers, suppliers, a company's own figures in a sentence or a Target Range) is why the step ends with "Read what goes out": every text and every Target Range in the file, each of which can be left out.
- **Credit and paid items** follow where each thing came from (next section). Credit for a CC BY or MIT Pack is added by itself and cannot be unticked. Parts that came from a paid Pack stay out and are listed with the Pack's name.
- **Never in the file:** a person's or Group's id, name, address, handle or phone number, a Metric Owner, a value, a Tell level, a Webhook. The one name that travels on purpose is the author: the one the exporter writes, and those in `basedOn` as their Packs wrote them.

### Where things came from

Spec 0059's decisions on paid Packs need this, and it **has to be in place before any paid Pack exists**.

- **An origin** names a Pack something was made from: id, version, author and license. A thing made from several keeps each.
- **Where it is kept:** Metric Catalog entries, Metrics, templates of every kind, View Designs, Themes, dashboards, decks, Workflows, and each widget on a dashboard or slide.
- **Every copy Ziffr makes carries it:** installing, Set up, adding a line, starting from a template, **save as template**, applying a template, duplicating, placing a saved widget, taking a new version, restoring a Version.
- **It stays** through edits, updates and uninstalling. The link to the install may go; the origin does not. Nothing in the app, the API or an assistant removes it.
- **The server keeps it, never the browser.** A browser cannot set or clear it. A new widget whose View Design or words equal those of a paid item installed in the Workspace is marked too.
- **Workspace Export and import** keep it, in a new `ziffr.workspace-export/2`, written only when something has an origin. A Workspace Export is the Owner's own data and holds paid items too.
- **Export as Pack** reads it: free origins become `basedOn` and `from`; paid ones are left out, unless the Workspace's purchase marks this person's account as the Pack's publisher (spec 0059).
- **Who sees it:** whoever sees the thing, as one line, "From <Pack> by <author>". Never Guests, View Links, Snapshots or Webhooks.
- **Existing Workspaces** get origins filled in from today's marks. What lost its mark earlier cannot be recovered.
- **What it does not catch:** words typed again, a Metric made by hand or by a program after reading another, an exported file edited afterwards, and changed code on one's own Installation. Heavy editing does not free a paid item either: a dashboard rebuilt from one stays marked.

### Visibility and untrusted input

- A Pack's Positions, names and Shares are untrusted input, checked on the server. Person ids and line names from the browser are checked against the Workspace and the plain-text rules, and matched through Maps.
- The preview and the record never show a person a Metric they may not see. Guests see neither.
- The Audit Log records `pack.set_up` with counts (Positions filled, lines, Shares made, messages sent), never names; each Share, hand-over and Workflow change keeps its own event.
- The threat model's boundary for Packs gains: a Pack that proposes Shares, the check for names on export, and the record of a Set up. A security review of the whole spec precedes "done".

## Testing Decisions

- **Format** (`@ziffr/pack`): `/1` files check as before; a hostile table of unknown keys, a several-people Position in a one-person place, a Repeat's Position used outside it, a wrong number of `by`, a Tell level, a Send Snapshot dashboard not in the Pack, markup and web addresses in names, every limit, `__proto__`.
- **Set up** (`pack-setup.db.test.ts`): every place filled by the right person; who may fill each; unticked Shares make none; no Prompt to others without the tick; an empty Approver refuses the Workflow; the Workspace Limit refuses the whole set; Admins only, never a key or the demo.
- **Visibility:** the "who will see what" list equals what each person sees afterwards, compared for every person; a salesperson sees only their line.
- **Add a line:** makes only the new line; changes only what the actor may change.
- **Export:** a test greps the file for every id, name, first name, address, handle, Group name and line name of a seeded Workspace; round trip (export, install, set up with the same people, export again) gives the same file.
- **Origin:** a table of every way to copy, each keeping it; uninstall and update keep it; a browser cannot clear it; an export credits free items and leaves paid ones out; the import of a Workspace Export keeps it.
- **Pages** tried in the running app at phone and desktop widths.

## Tickets (not opened yet)

1. The formats `ziffr.pack/2` and `ziffr.workflow-template/2`, with `basedOn` and `from`, their checks, hostile table, generated reference and glossary entries. Blocked by decisions 1 and 5.
2. The Pack's page shows its Positions, Repeats and what each does. Blocked by 1.
3. Set up with Positions: the pickers, "who will see what", Share ticks, messages, the record. Blocked by 1 and decisions 2 to 4.
4. Repeats in Set up: lines, names, limits, working in steps. Blocked by 3.
5. Add a line. Blocked by 4.
6. Starting a Workflow from a template with Positions. Blocked by 1.
7. Where things came from: the origin, every copy, the existing Workspaces, `ziffr.workspace-export/2`. Not blocked; before any paid Pack.
8. Export as Pack: live items, "Who does what", the name check, "Read what goes out", credit and paid items. Blocked by 1 and 7.
9. Export of Repeats and the round trip. Blocked by 4 and 8.
10. Ziffr's Sales Pack gains Positions and a Repeat; the creators' guide. Blocked by 4.
11. User guide, threat model, release notes and an independent security review of the whole spec. Blocked by 2 to 9.

## Out of Scope

- Live Positions that the Workspace keeps and rules look up.
- Inviting people or making Contacts from Set up.
- A Position that sets a Workspace Role or manages Groups.
- Team totals over a Repeat, and a Repeat inside a Repeat.
- Removing a line automatically.
- Positions in Deck Templates (Set up makes no deck).
- Copy protection. Where things came from is a record, not a lock.

## Decisions (2026-11-26, by the owner)

- Installed items remember where they came from, through edits and "save as template". Export as Pack leaves out paid items and credits free ones by itself. This is part of this spec's work, before any paid Pack (spec 0059).

## Decisions for the owner

All proposed, none taken.

1. **The word:** Position (recommended), with Repeat for the part made once per line.
2. **Filled once at Set up, with a record** (recommended), or live Positions.
3. **Shares from a Pack start unticked** where they show someone more (recommended), or ticked.
4. **Prompts to others wait** for the next run unless ticked (recommended), or go at once as today's "Ask me" does.
5. **Tell steps travel** when they wait for a share, not a level (recommended), or stay out as today.
6. **Team totals** over a Repeat come later (recommended), or in the first release, which needs a new formula form for Packs.
