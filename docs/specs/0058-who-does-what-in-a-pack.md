# 0058 Who does what in a Pack: named Positions such as "Sales lead", filled at Set up

**Status:** draft. **Tracking issue:** #1164 (label `tracking`); tickets #1177 to #1191 and, for team totals, #1225 to #1227 are its sub-issues, labelled `spec:0058`. The owner approved the direction and, on 2026-11-26, the decisions at the end. Builds on spec 0030 (Packs) and spec 0045 (Checklist Items and Send Snapshot); the community Marketplace that shares such Packs is spec 0059.

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

**Position**, decided by the owner on 2026-11-26.

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

### Glossary (added by #1177)

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
- Changing who does something later is done where it is done today: on the Metric, the Workflow or the Share. **Live Positions** (change the holder once, everything follows) are not in this spec: every send and every visibility rule would have to look them up, and Groups already serve the sharing part (decision 2).
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
- **Shares start unticked** where they would show someone a Metric they do not already see in this plan. A Pack is a stranger's file, and sharing is a decision (decision 3). One exception: where a Position submits a number that its holder is not asked for (see "Where it is shown"), a Viewer Share of that Metric is proposed and starts ticked, since the Position would have shown it to them anyway. What else shows no more than they then see, such as their line's dashboard, is ticked with it, and unticked again if that Share is.
- **Prompts wait** for the Workflow's next run, also those to the person setting up (changed by the owner's feedback on 2026-11-26: taking a whole Pack sent them one message per Metric). "Send the first requests now" is one tick, off by default, saying how many messages go to whom. Being made a Submitter sends nothing. Sending Limits and Quiet Hours apply as always.
- **Self-approval** is not made possible: where one person is both Submitter and Approver, the preview says that the existing rules apply (nobody approves their own value; the Approve step's Self-check or count).
- **Order:** Workflows, Metrics, Submitters, Stand-ins, dashboards, Shares, the Send Snapshot step. Each goes through the existing core function, so permissions, limits and the Audit Log apply as by hand.
- **Who:** Owners and Admins, as today, never through an Access Key, never in the demo.

### One set of Metrics per salesperson, site or company

- An entry with `per` becomes one Metric for each line of that Repeat, named "<entry>, <line's name>" ("Incidents, Munich"). Two lines of a Repeat may not share a name.
- **Visibility follows the Metrics.** A site manager who only submits to Munich's Metrics sees only Munich's. This is why a Repeat makes separate Metrics and not one Metric with a Breakdown: Submitters, Approval, targets and sight belong to a Metric.
- **Names are words everyone reads.** The form says that a line's name appears in Metric names, read by everyone who sees them, Guests included.
- A Derived Metric per entry may use entries of the same Repeat and entries outside it. A formula outside a Repeat may not use an entry inside it: it would have to name every line. What adds up a Repeat is a **Total** (see "Team totals" below).
- **Workflows and dashboards** with `per` are made once per line. Without it, one Workflow takes all lines' Metrics.
- A dashboard outside the Repeat may use a repeated entry only in a Slot that takes several Metrics, which is filled with every line's Metric. A shared dashboard shows all of them to whoever it is shared with, and the preview says so by name.
- **Limits:** at most 50 lines in a Repeat (Set up fills a Slot with at most 50 Metrics today) and 200 Metrics in one Set up (today 50). The Workspace Limit and a trial's cap are checked for the whole set before anything is made. A run this large works in steps and says what was made if it stops.

### Team totals

A team wants "the commit of all salespeople", and the list of salespeople changes. A formula cannot say this: it names every input, is limited to 500 characters, and someone would have to rewrite it for every new line. The owner moved team totals forward on 2026-11-26: they are specified here and built with Positions and Repeats.

#### What a Total is

**Total** (added to the glossary by #1225): A Derived Metric that adds up a list of Metrics it keeps, its parts, such as the Commit of every salesperson. Parts are added and ended on the Total, never by editing a formula; each counts from a first period and, once ended, up to a last one. A period has a value only when every part counting in it has one, and it is shown only to people who may see all of those parts, unless the Total's owner opens it. Not a formula, not an Aggregation (which combines one Metric's own periods) and not a Running total. _Avoid_: roll-up, consolidation, group sum.

- **It only adds.** No average, no smallest or largest.
- **Parts:** 1 to 50 Metrics that take values (no Derived Metric, no Total), of the Total's period, with one unit, number format and Aggregation among them, which the Total takes; never Aggregation none.
- **The list is kept on the Total.** The record of a Set up still decides nothing, and nothing follows a Tag, a Group or a Repeat by itself: a part counts because someone with the right to do so added it, and saw it listed.
- **Over longer periods** a Total combines like any Metric: its own period values by its Aggregation. A quarter in which one week has no total is shown as partial, as for any Metric with a gap.
- **Formulas may read a Total** as an input, `target()` included (spec 0062). Parts are never derived, so this adds one level and no cycle. A formula still may not read another formula.
- **Its target** is one of two, chosen on the Total: its **own** Target Series and Target Range, set once as the team's quota, or the **targets of its parts added up**: for each period the sum of what `target()` gives for every counting part, and no target for a period in which one part has none.
- **By hand too:** the flow "Calculated from other Metrics" offers "Add up Metrics". A Total counts towards the Workspace Limit as one Metric and has no Breakdown.

#### New and leaving lines

- Each part has a **first period** and, once it has left, a **last period**. Past totals do not change when the list does.
- **The parts a Total is made with count from their first value**, whenever it comes, unless a first period is named: Set up makes a Total before any value exists, and history pasted or sent later, and the period that ended last, belong in it. Stored as a first period in 1900. A part added later counts from the period it is given.
- **A new person's figure joins a Total through Add a line, ticked and confirmed** (decided by the owner). Add a line (below) offers, ticked and listed, to count the new Metrics in each Total that Set up made, from the first period the line is asked for (shown, and changeable), where this person may change the Total and its owner may share the part. What it cannot change, it lists.
- **A line leaves** by ending its parts: "Count it up to <period>", by default its last period with a value. Archiving a Metric that a Total counts asks this. Counting it again is the same screen.
- Removing a part altogether is possible and says in words that past totals change. A Metric a Total names cannot be deleted, and Retention treats the Total like a Derived Metric that reads it.
- Every change of the list is in the Total's history and the Audit Log.

#### Missing and unapproved values

- A period has a total only when **every part counting in it has a value**. Ziffr never shows a smaller sum as the total, and never takes a missing value as 0: a salesperson with nothing sends 0.
- While one is missing, the period reads "4 of 5 in" to whoever sees every part (they can then see which), and "not all in yet" to others who may see an open Total.
- A value **waiting for Approval or sent back** counts, as it shows on its own Metric, and the period's total is marked **not approved yet** until every part is final. Alerts, Tell steps and Heads-ups read a total only then.
- Nothing is stored: a corrected value changes the total at once. Snapshots and frozen View Links keep what they showed, mark included.

#### Who sees what

Decided by the owner on 2026-11-26. A Total is a Metric: who may open it is chosen on it by sharing, as for any Metric. Its **numbers** are held more tightly than a Derived Metric's, because a part is often one person's figure.

- **A period of a Total is shown only to a person who may see every part counted in it,** unless the Total's owner has opened it. Anyone else it is shared with sees its name, description and own target, and for the period "Not shown: you do not see every Metric it adds up." So from a Total that is not open nobody learns anything: every number they read is made of values they could add up themselves. No smaller sum of the parts they do see stands in its place.
- Its owner must own or edit every part, or it shows no values to anyone (as for any Derived Metric); adding a part needs the right to change the Total and to share that part.
- **Never sent** to someone who does not see a part, open or not: its name, line name, id, value or row, and how many parts there are. There is never a "rest" row.
- The added-up targets of the parts follow the same rule as the values. The Total's own target is its own, seen by whoever sees the Total.

#### Opening a Total

- **Who:** the Total's owner only, in the app, while they own or edit every part. Not an Editor, not an Admin who does not own it, never an Access Key or an assistant, never Set up or a Pack, never in the demo.
- **Per Total:** a setting, "Also show this total to people who do not see every part", off for every new Total, one made by Set up included.
- **Listed and confirmed.** Before it is switched on, the screen lists the parts counted, every person who will newly see its numbers, the working View Links and the Snapshots that show it, and the formulas that read it. It says: "Each of them learns the sum." Where someone sees every part but one, it names the person and the Metric whose value they can then work out. If any of the lists changed before the owner confirms, it asks again.
- **What a viewer then learns:** the sum of each period, past ones included, whether it is not approved yet or not all in, and through subtraction the sum of the parts they do not see, which is one person's figure where only one is hidden. Still no name, row, value or count of a hidden part.
- **While it is open,** sharing it with someone says what they will learn, and only its owner adds a part, confirming that the new figure will be inside what those people see; Add a line lists such a Total as one it cannot change for anyone else.
- **Closing:** the owner, at any time, in effect at once. Handing the Total over closes it; the new owner opens it anew.
- **Audit Log:** `metric.total_opened` and `metric.total_closed`, with who did it, the Total, and how many parts and newly seeing people; never a value or a name of a part.

#### The same rule everywhere

It is worked out per reader and period, at the time of reading.

- **App, API, MCP Server, downloads, Heads-ups and Analyze** give only the periods the reader (for a program, the key's creator) may see. The API says of a Total whether it is open and that periods are withheld; no program opens or closes one.
- **Formulas that read a Total** have no value for a reader in a period whose total they may not see.
- **Snapshots** keep with each period which parts counted. A reader gets it if they may see every one of those now, or the Total is open now; so closing also hides it in older Snapshots. Taking a Snapshot keeps only what its taker may see.
- **View Links:** a visitor sees no part, so a link carries a Total's numbers only while it is open, or where the link itself shows every counted part. Live and frozen links alike: closing takes effect on a frozen one too. Making a link says what will be empty.
- **Messages:** Alerts, Tell steps and Send Snapshot reach a person only with numbers they may see; a Webhook for everyone only where the Total is open or Everyone sees every part.
- **Files** someone already made (a PDF, a download) cannot be taken back, and the confirmation says so.
- The Workspace Export records that a Total is open; an import leaves it closed.

#### The forecast's gap slide, one row per salesperson

- The sales forecast Pack gains a Repeat "Salesperson": Commit, Best case, Closed this quarter and Pipeline value once per line; the team's figures are Totals of them. Each salesperson's quota is the target of their Commit (spec 0062), and the team's quota is either the Total's own or the targets added up.
- A gap table may take **a Total** instead of two Metrics: one row for each part counting in the latest period, named by its line, with the part's target for that period, its value and the gap, ordered by gap. A part without a value reads "–"; a part without one target number has no gap. At most 30 rows, the rest named as left out.
- A viewer gets the rows of the parts they see, with one line saying that others are not shown to them. The slide's total appears only where they may see the Total, and no total is ever worked out from the rows shown.
- The Metric "Quota split" of spec 0062 then leaves the Pack. Existing set-ups that send Breakdowns keep their two-Metric gap table.

#### The forecast Pack's team quota

Decided by the owner on 2026-11-26: **the team's quota is the salespeople's targets added up** to begin with (`"targets": "parts"` on the Total over Commit), so each quota is set once, on a salesperson's Commit. A team may give the Total its own target instead, and the Pack Guide and the user guide say how:

1. On the Total's page, tab **Overview**, section **What it adds up**: under **Target** choose **Its own target** (its owner or an Editor; only the owner while the Total is open).
2. On its **Targets** tab give every week its quota (**Add row** or **Paste from a spreadsheet**), the quarter's quota in each of the quarter's weeks, past weeks that are still read included. **Edit details** and **Target from** give one quota for every week instead, without history.

- **What changes:** every formula that reads `target()` of the Total (quota, gap, share, pipeline coverage), and with them the dashboard and the slides, reads the Total's own target; a week without one has no value, past weeks too.
- **What does not:** the gap slide's rows. Each compares a salesperson with their own Commit's target, so the rows need not add up to the team's gap.
- **Back:** choose **Its Metrics' targets added up**. This removes the Total's own Target Range; its Target Series is kept, unused, and counts again once **Its own target** is chosen again.
- Updating the Pack changes neither choice in what was set up.

#### Format

- A Metric Catalog entry outside a Repeat may say `"total": { "of": "commit", "targets": "parts" }` in place of a formula: `of` names an entry of a Repeat in the same Pack, `targets` is `own` or `parts`. The gap table's element gains the one-Total form.
- Both are new fields that change what Set up and a slide do, so an older Ziffr must refuse them in words: they go into `ziffr.pack/2` and the deck template format only if these have not been released without them, else into the next format version.
- The Workspace Export carries a Total's parts with their first and last periods. Export as Pack turns a Total over the picked example line back into `total`.

### The record of a Set up, and adding a line

- Ziffr keeps what a Set up did: the install, Pack version, who and when, the people per Position, the lines and their names (sealed with the Workspace Key), and the ids of what was made, by Pack key and line.
- **The record decides nothing.** No permission, message or sight is ever worked out from it.
- Owners and Admins read it, and see names of only those Metrics, dashboards and Workflows they may see. Removing a person takes them out of it. Uninstalling the Pack deletes it and leaves everything made. The new tables are classified for the demo and for deletion, and a Workspace Export leaves the record out and says so.
- **Add a site** (the Repeat's own word) on the Pack's page runs Set up for one new line, with the same preview. It also offers to add the new Metrics to the shared Workflow and to the several-Metric widgets, each listed with its own tick, only where this person may change them. The Workflow's offer starts ticked. A widget's offer says who would newly see the new Metrics, and **starts unticked** where anyone its dashboard is shared with would, or where it is shared with a Group, whose later members would too (decided by the owner on 2026-11-26). What it cannot change, it lists.
- Removing a line is not automated: archive its Metrics by hand, which asks on each Total up to which period they count.
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

## The Pack Guide

Whoever opens a stranger's Pack sees a list of items, not why they belong together or what to do first. Added by the owner on 2026-11-26, in the same new format (`ziffr.pack/2`).

### Glossary (added by #1177)

**Pack Guide**: What a Pack's creator tells people about it, in five set sections whose titles Ziffr writes: What it's for, Before you start, First steps, Each part, and Questions. Headings, paragraphs, lists and bold words only; read before installing and, with the installed Pack, in Help. Not the user guide, which is Ziffr's own, not the Setup Guide, and not the summary of one or two sentences. _Avoid_: Readme, manual, documentation, tutorial

### What a creator writes

- **A field of the file,** `guide`, with `whatItsFor`, `beforeYouStart`, `firstSteps`, `eachPart` and `questions`. Each is optional; a guide fills at least one.
- **A section is a list of blocks:** a heading (`{ "type": "heading", "text": "…" }`), a paragraph (`"text"`) or a list (`"list"`, with `items`, and `"numbered": true` for steps in an order). A pair of `**` makes the words between them bold; it is the only formatting inside a text.
- **Written** in an extra "Describe your Pack" step of Export as Pack, pre-filled with a list of the Pack's contents, or edited in the file. Ziffr's own Packs use the same field.

```json
"guide": {
  "whatItsFor": [{ "type": "text", "text": "Each site reports its **incidents** every week." }],
  "firstSteps": [{ "type": "list", "numbered": true, "items": ["Open Packs.", "Choose **Set up from this Pack**."] }]
}
```

### Where it is read

- **Before installing,** with the preview: on the Packs page and for a Marketplace Pack.
- **After installing,** in Help, with the installed Pack.
- By those who may see the Pack today. A guide changes no one's rights and is never in a Snapshot, a View Link or a message.

### It is text from a stranger

- **No links, images, HTML or code.** Every text is held to the plain text of a Pack's names: no web or email address, markup, brace, bracket, backtick, line break or character that turns text around. The text is also checked as it reads with the bold marks taken away, so marks cannot hide an address.
- **Bounded:** the whole guide at most 32,768 bytes; at most 60 blocks in a section, 20 entries in a list, 80 characters in a heading and 600 in a paragraph or entry.
- **The assistant-words check** reads it, as a person reads it, and its hits are shown to whoever installs, like those of any other text of the Pack.
- **Shown as plain structured text:** Ziffr draws the blocks itself and never reads a guide as Markdown or HTML.
- **Reportable** like the rest of the Pack: it is part of the file that a report names (spec 0059).

An install keeps the guide from the ticket that shows it in Help on; the database's limit on what an install keeps of a manifest has to grow with it.

**Later:** pictures, and a guide in more than one language.

## Where each number comes from

A person about to install a Pack needs to know where its numbers will come from and what they must provide themselves. Asked for by the owner on 2026-11-26, in `ziffr.pack/2`.

### Glossary

**Comes From**: What a Pack says of each of its numbers: a person types it, another system sends it, or it is set once as a target; and what Ziffr works out from the Pack: that it calculates a number, which n8n templates are delivered, and what the installer still needs. Not a **Source** (the way a value arrives) and not where a thing came from (its origin). _Avoid_: Provenance, data source, lineage

### What a creator writes

- A field of a Metric Catalog entry's wrapper, `comesFrom`: `by` (`person`, `system` or `target`), with `system` (the kind of system, such as “CRM”, 1 to 60 characters) exactly when `by` is `system`, and an optional `note` of at most 300 characters.

```json skip="one entry of a Pack, not a whole file"
{ "key": "closed-quarter", "comesFrom": { "by": "system", "system": "CRM", "note": "The won deals of the quarter." }, "metric": { "format": "ziffr.metric/1", "name": "Closed this quarter" } }
```

- **Never typed:** a Derived Metric or a Total takes no `comesFrom`, since its formula says it. A formula that only reads a target, `target({x})`, shows as set once as the target of x. The delivered n8n templates are the manifest's `feeds`; without one that fills an entry, another system's number is set up by whoever installs. Workflows, what is included and what is still needed are worked out from the Pack.
- **Optional in the format;** a number without it is described by the ways Ziffr has, worked out from its Sources and the manifest's `feeds` (owner, 2026-11-26: never that the Pack does not say): **Ask a person**, **Ask a person, or another system sends it**, **Ask a person, or fill it from** a system **(template included)**, or, where only the API is a Source, **Another system sends it**. Numbers with the same answer share a row. It is **required for every number that takes values** in order to be listed in the Marketplace (the publish check) and in Ziffr's own Packs (a test).
- **Text from a stranger:** `system` and `note` are held to the plain text of a Pack's names, read by the assistant-words check and drawn as text.

### Where it is shown

- **Before installing,** in the preview, and on the Pack's Marketplace page: a table **Where the numbers come from**, then **Included** and **What you still need**.
- **After installing,** in Help, with the installed Pack. The install keeps the worked-out overview, never the Pack's contents.
- **At Set up:** the same table, and **nobody is asked** for a number another system sends or one set as a target, whether they were picked beside Positions or hold a Position that submits it (decided by the owner on 2026-11-26). The one exception: with **Ask me also for …** ticked, the person setting up is asked where they would submit it; nobody else is asked either way. Such a number gets no Submitter otherwise and no Stand-in, and the Workflow sends no request for it. The plan, also of Add a line and of each step of a large set, says who is not asked and why. A holder keeps sight of it through the ticked Viewer Share above; a Contact cannot be shared with, and the plan says so. Choosing a Feed is unchanged.
- **Export as Pack** asks for each number, with “Ask a person” to begin with, or what the installed Pack it came from said.

`@ziffr/pack` exports the working-out (`packOverview`, `comesFromGroups`, `comesFromWords`, `includedAndNeeded`), so every page shows the same.

## Testing Decisions

- **Format** (`@ziffr/pack`): `/1` files check as before; a hostile table of unknown keys, a several-people Position in a one-person place, a Repeat's Position used outside it, a wrong number of `by`, a Tell level, a Send Snapshot dashboard not in the Pack, markup and web addresses in names, every limit, `__proto__`.
- **Set up** (`pack-setup.db.test.ts`): every place filled by the right person; who may fill each; unticked Shares make none; no Prompt to others without the tick; an empty Approver refuses the Workflow; the Workspace Limit refuses the whole set; Admins only, never a key or the demo.
- **Visibility:** the "who will see what" list equals what each person sees afterwards, compared for every person; a salesperson sees only their line.
- **Add a line:** makes only the new line; changes only what the actor may change.
- **Team totals:** hand-worked cases for lines that join and leave, a missing value, a value not approved yet and longer periods; what each person sees compared for every person, with the Total closed and open and with none and one part hidden, in the app, the API, a formula reading it, a Snapshot, a View Link and a message; who may open one; closing takes effect on older Snapshots and frozen links.
- **Export:** a test greps the file for every id, name, first name, address, handle, Group name and line name of a seeded Workspace; round trip (export, install, set up with the same people, export again) gives the same file.
- **Origin:** a table of every way to copy, each keeping it; uninstall and update keep it; a browser cannot clear it; an export credits free items and leaves paid ones out; the import of a Workspace Export keeps it.
- **Pages** tried in the running app at phone and desktop widths.

## Tickets

| Ticket | What | Blocked by |
| --- | --- | --- |
| #1177 | `ziffr.pack/2` and `ziffr.workflow-template/2`: Positions, Repeats, credit, checks, reference, glossary | |
| #1178 | A Pack's page shows its Positions, Repeats and what each does | #1177 |
| #1179 | Plan a Set up: who may fill each Position, who will see what, which messages go | #1177 |
| #1180 | Set up with Positions: pickers, Share ticks, messages, the record | #1179 |
| #1181 | Repeats in Set up: lines, names, limits, working in steps | #1180 |
| #1182 | Add a line | #1181 |
| #1225 | Team totals: a Total adds up a kept list of Metrics (core, screens, visibility, opening) | #1222 |
| #1226 | Team totals in Packs: Set up, a new line joins, a leaving line stops counting, export | #1182, #1225 |
| #1227 | Gap table with one row per line of a Total; the sales forecast Pack with a Repeat | #1223, #1226 |
| #1183 | Start a Workflow from a template with Positions | #1177 |
| #1184 | Where things came from: every copy, existing Workspaces. Before any paid Pack | |
| #1185 | Where things came from: widgets on dashboards and slides | #1184 |
| #1186 | `ziffr.workspace-export/2` carries where things came from | #1184 |
| #1187 | Export as Pack: live items, "Who does what", the name check | #1177 |
| #1188 | Export as Pack: credit, paid items left out, "Read what goes out" | #1185, #1187 |
| #1189 | Export of Repeats and the round trip | #1181, #1187 |
| #1190 | Ziffr's Sales Pack gains Positions and a Repeat; the creators' guide | #1181 |
| #1191 | Threat model, user guide, release notes and an independent security review of the whole spec | the others |
| #1229 | Pack Guide: read it before installing (Packs page and Marketplace preview) | #1177 |
| #1230 | Pack Guide: the "Describe your Pack" step of Export as Pack | #1177 |
| #1231 | Pack Guide: keep it with the install and read it in Help | #1177 |
| #1232 | Pack Guide: guides for Ziffr's own Packs | #1177 |
| #1246 | Where each number comes from: format, preview, Help, Set up, Export as Pack | #1230 |

## Out of Scope

- Live Positions that the Workspace keeps and rules look up.
- Inviting people or making Contacts from Set up.
- A Position that sets a Workspace Role or manages Groups.
- A Repeat inside a Repeat. Totals that average, a Total of Totals, and a Total that follows a Tag, a Group or a Repeat by itself.
- Removing a line automatically.
- Positions in Deck Templates (Set up makes no deck).
- Copy protection. Where things came from is a record, not a lock.

## Decisions (2026-11-26, by the owner)

1. **The word** is Position, with Repeat for the part made once per line.
2. **Positions are filled once at Set up, with a record.** No live Positions.
3. **Shares from a Pack start unticked** where they show someone more.
4. **Prompts wait** for the next run unless ticked, those to the person setting up included (changed on 2026-11-26).
5. **Tell steps travel** when they wait for a share, never a level.
6. **Team totals** over a Repeat: first postponed; moved forward by the owner on 2026-11-26, specified under "Team totals" and built with Positions and Repeats. Decided by the owner the same day: a Total is shown only to people who may see every counted part, unless its owner deliberately opens it to others; a new person's figure joins a Total through Add a line, ticked and confirmed. Still for the owner to check there: one missing value empties the period, and a value not approved yet counts and marks the total.
7. **Installed items remember where they came from**, through edits and "save as template". Export as Pack leaves out paid items and credits free ones by itself. This is part of this spec's work, before any paid Pack (spec 0059).

## Decisions about the Pack Guide (2026-11-26, by the owner)

1. **A guide inside the Pack,** in the new format: What it's for, Before you start, First steps, Each part, Questions.
2. **Simple formatting only:** headings, lists and bold.
3. **Written** in a "Describe your Pack" step of Export as Pack, pre-filled with a list of the Pack's contents, or in the file.
4. **Read before installing** (Marketplace and Packs page, with the preview) **and after installing** in Help.
5. **Text from strangers:** no links, images, HTML or code, bounded, checked for words aimed at assistants, shown as plain structured text, reportable like the rest of the Pack.
6. **Pictures and translations** come later.
7. **Ziffr's own Packs** use the same field.
