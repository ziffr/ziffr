# 0068 Guided Pack set-up: "Use this pack", one question at a time

**Status:** in progress (2026-11-27). Tracking issue #1341. Builds on spec 0030 (Packs) and spec 0058 (Positions, Repeats); changes how spec 0067 (First Steps) uses a Pack.

**Screens:** [0068/screens.html](0068/screens.html) is the clickable draft (open it in a browser). It is the reference for flow and words. **Its styling is not**: only the app's shared tokens and components. Its names and numbers are made up. Where it differs from this spec, the spec wins.

## Problem

The owner, 2026-11-27: "i don't understand a clue of all of this" (the sales forecast Pack's guide). "it tells me to create the sales users in members, and at this point i may not even know where to do this". "during onboarding it looked so easy, but now within the app it feels VERY complicated". "how do we make this also accessible for third parties who want to create a pack". On the proposal below: "yes build it on that basis".

Today a person installs a Pack, then sets up from it on a long form, then still adds people, quotas and slides by hand.

## Solution

One flow, **Use this pack**, from First Steps, the Packs page and the Marketplace: preview, the few questions this Pack needs (one per screen, people added right there), check and start, done. The Pack **declares** what has to be asked; Ziffr draws every Pack the same way. A Pack brings short plain text only: no screens, markup or code.

Everyday words, whole on a phone, **nothing is sent unless the person chooses it**, and where something waits for a first number the screen says so and takes the number.

## What a Pack declares: `ziffr.pack/3`

`ziffr.pack/2` is released (0.20.0) and refuses unknown fields, so the new fields make a new format, in 0.21.0.

| Field | Limit | What it is |
| --- | --- | --- |
| `setUp.line` | required in `setUp`, 120 | One sentence under the name |
| `setUp.happens` | 1 to 4, 90 each | The lines under "Every week" |
| `setUp.needs` | 0 to 4, 90 each | The lines under "You need" |
| `positions[].question`, `.hint` | 90, 140 | The question that fills a Position |
| `repeats[].question` | 90 | The question that lists a Repeat's lines |
| `contents.metrics[].ask` | `question` 90, `name` 40, `every`: `month`, `quarter` or `year`; 3 per Pack | Ask a number at set-up (one per line where the entry is made per line) and write it as this Metric's target |

- Every field is optional. All are plain text (the format's `plainText`) and are read by the check for words aimed at assistants.
- `ask` is refused on a Derived Metric or a Total, and on a Metric whose period is longer than `every`. The number is written **unchanged** to each period of the span: not divided.
- A `/3` file holds everything `/2` holds. Export writes the oldest format that holds the Pack. `/1` and `/2` keep their meaning for ever and use the flow with Ziffr's own fallback words (`summary`; "Who is <Position name>?"; no numbers asked).
- An older Ziffr refuses `/3` with its usual "this Ziffr reads ..." words. `ziffr-pack check` runs the same checks; the generated reference gains the schema. The Marketplace must run the new kit before it accepts a `/3` file.
- An install keeps the declarations in its manifest (`ask` with the places).
- The "Every ..." heading is Ziffr's, from the period of the first Workflow Template, else "What happens".
- All thirteen shipped Packs become `/3` with `setUp` and the questions their parts need, and a raised version (ticket 1). With the switch-over (ticket 6, so the old screens never lose their steps) each gets a **short guide**: "What it's for" (what it does and what happens weekly or monthly), "What you need" (Ziffr's new title for `beforeYouStart`), at most three Questions, 1,200 characters in all. "First steps" and "Each part" are removed from them.

Sales forecast: line "A weekly forecast meeting, prepared for you."; happens "Monday: your salespeople are asked for their figures", "The sales lead approves them", "The dashboard and meeting slides fill in"; needs "Names and email addresses of your salespeople", "Their quotas (can come later)"; Repeat "Who is in your sales team?"; sales lead "Who approves the figures?", "This person checks the numbers each week and sees the whole team."; on `commit`: "What is each quota this quarter?", name "Quota", every quarter.

## From declarations to screens

One **pure** function turns the declarations into steps, used by the flow and by "Try it". A step with nothing to ask is left out.

| Step | When | What it asks |
| --- | --- | --- |
| preview | always | Name, `line`, the first dashboard drawn with Sample Data (a Pack without one: the first slides of its first deck, up to three, drawn with Sample Data), "Every week", "You need", **Use this pack**. The view of #1339 |
| lines | each Repeat | Name and email per line, or pick someone already here. A Repeat no Position submits for asks a name; further one-person Positions of the Repeat add a person field to the line. "+ Add another", and paste a list |
| who | each Position outside a Repeat that is used | "I do" (preselected), someone already here, or "Someone else" (name and email) |
| providers | a number that takes values has no Position that submits it (every Pack without Positions) | "Who provides these numbers?": "I do", "Other people" (up to 5: pick, or name and email; "I do" may be ticked too), or "Nobody for now" |
| numbers | each `ask` | One field per line, or one. Sum shown where a Total adds the targets up. "Add later" |
| source | a number that takes values comes from a system | "People type them" or "From our system or a spreadsheet" (the Pack's `feeds` templates where it names any). Typing is preselected, except where **every** number comes from a system |
| check | always | Who, who approves, who is asked and when, what is made, the confirmations. **Set it up**, "Nothing is sent yet" |
| done | after | Below |

- **No Positions** (twelve of the thirteen shipped Packs): preview, providers, source if any, check. One answer holds for all those numbers; different people per Metric are set on each Metric's page. "I do" is preselected, so a Pack with nothing else to ask takes one confirmation. Where every number comes from a system, "Nobody for now" and "From our system" are preselected.
- What is made: every Metric (once per line where per line); the first dashboard and first Workflow of the Pack and of each Repeat; every Deck whose Slots the Pack's own entries all fill. A Workflow that needs more Approvers than the answers give is left out, and the check screen says so.
- Typed numbers: whoever is chosen to provide a number (the Position's people, or the providers answer) also submits it where it comes from a system, in both source choices. With the system choice, done offers the template download where there is one and says to remove the people from those Metrics once it is connected.
- **Limits** are said on the first screen they bind, before anything is written. Lines allowed = the lowest of the Repeat's `max`, the room for Metrics divided by Metrics per line (after the others), the 200 of one Set up and, in a trial, the free places for people. A trial holds 25 Metrics and 5 people, so the forecast Pack shows "4 places in your trial" (8 for the team, 4 per salesperson). A sales lead who is someone else takes one place: three salespeople can then be invited, and the screen says so. A Pack that does not fit at all keeps its button off, with the reason.

### What makes Ziffr ask

A person is asked when they are Submitter of a Metric that follows a Workflow: it sends the Prompt at its next run. The flow never sends at once.

- The Metrics follow the first Workflow made (of their Repeat, else of the Pack).
- Where the Pack has no Workflow Template, or it is left out, and people were named, the Metrics join one that asks for their period: the rule and operation of spec 0067's `sender` step (#1330: daily; weekly on Monday; monthly on the 1st; at the Workspace's asking hour; one per period, reused), with quarterly and yearly Metrics asked on the first day of theirs.
- "Nobody for now": nobody is asked. Done and the Pack's card say so, with **Choose who provides them**.

## Every shipped Pack goes through it

| Pack | Preview draws | Questions between preview and check | Workflow |
| --- | --- | --- | --- |
| agency, customer-support, fulfilment, online-shop, people, sports-club | dashboard | providers | the Pack's |
| finance | dashboard | providers (the runner approves) | the Pack's |
| sales | dashboard | providers, source | the Pack's |
| saas-metrics | dashboard | providers (the runner approves) | its first |
| board-meeting | **deck** | providers (the runner approves) | the Pack's |
| sales-forecast | dashboard | lines, who, numbers, source (no providers) | the Pack's |
| workspace-usage | dashboard | providers (nobody preselected), source (system preselected) | none: by period, if people are named |
| ziffr-operations | dashboard | as workspace-usage; its 36 Metrics do not fit a trial, and it says so | none: by period, if people are named |

The ten Packs without a deck get one in #1340 (approved by the owner; every Slot suggests an entry of the Pack, so the flow fills it). Each gets `setUp` in ticket 1 and the short guide in ticket 6, both after #1340, since all change the Pack files. Tests run the pure steps and, against the database, the whole start for **every** shipped Pack.

## People: today's rules, nothing loosened

Only Owners and Admins run the flow. A person is found by email first (a Member, Guest or Contact is used as they are; the runner's own address means "I do"). Two lines with one address are refused.

| Answer | Ordinary Workspace | Trial Workspace |
| --- | --- | --- |
| A new person whose Position only submits (and stands in) | A Contact is added and made Submitter. Nothing is sent now; the Workflow asks them from its next run, and the check screen names them and the day | A Contact is added and made Submitter. **Nothing is ever sent to a Contact.** After the Owner's own first value, done offers **Invite them** (one invitation each, as Guest, tied to the Contact) |
| A new person whose Position needs a role (approves, is shared with, is told, gets a Snapshot, ticks off a Task) | A Contact is added, **the runner holds the Position**, and the screen says "You approve until they have joined". Done offers **Invite them** (Member). After they joined, the Pack's page has **Change who approves** | The same; the invitation opens after the Owner's first value |
| Someone already here | As `whyNot` allows (a Contact or Guest is not offered where the Position refuses them) | The same |
| Providers of a Pack without Positions | Members, Guests, Contacts or new Contacts: an Owner or Admin may make each a Submitter by hand (today's Pack form offers only members). A Contact gains no place that needs a role | The same; invitations as in the first row |

- Invitations go only by their own button on done or the Pack's page, through `inviteByEmail`: who may grant what, people per trial, invitations a day, Contact limits and `ZF439` hold unchanged, each refusal shown beside its person.
- **Practice Workspace:** no new people (Contacts and invitations are refused there); only people already in it can be picked. **Demo:** no flow.
- **Sharing** is offered only for Shares the Pack proposes, between people who can be shared with now, and a Share that shows someone more is off by default, as today. So the draft's "Salespeople see the team dashboard" is not offered: they are not in Ziffr yet. Done says to share the dashboard once they have joined.

## Starting: order, half failures, leaving

Nothing is written before **Set it up** (for a Marketplace or uploaded file, installing happens on the preview, as today, with today's confirmations).

1. Check everything that can be checked: rights, limits, addresses, duplicates, confirmations.
2. Install, if the Workspace does not have the Pack.
3. Add the Contacts that are missing.
4. Set up in steps of 20 Metrics (`setUpStep`; `askNow` is never set); Metrics that need a Workflow by period join it.
5. Write the numbers as targets: every period from the earlier of the span's first and the last ended one, to the span's end (the Workspace's quarters and year).
6. Make each deck, owned by the runner, its Slots filled, so opening it shows filled slides, also from the phone.

A failure stops, says in plain words what was made, and **Try again** makes only what is missing: people are found by address, the install is found, the Set up record is taken up (a stopped run of this flow stays open to the same choices), targets are written over, a deck is not made twice. Answers are kept in this browser tab only (`sessionStorage`, per person, Workspace and Pack), cleared on success and sign-out. A person who left finds **Finish setting up** on the Pack's card; if the answers are gone it lists what was made and offers the rest.

## Done: closing the loop

- **Trial, no value of the Owner's own yet:** the first thing is **Send your first number**, "Needed before colleagues can be emailed". The person picks one made number and types it; Ziffr records it as theirs, adding them as Submitter without a message and removing them again if they were not one. Then **Invite them** opens on the same screen.
- Otherwise it says who is asked and when. **Open the dashboard**, **Open the slides**.
- No Workflow, or email not set up: said in plain words (nothing asks by itself; requests wait in the Outbox).

## Later, on the Pack's page

Installed Packs show: **Set it up** (never set up), or **Open dashboard**, **Choose who provides them**, **Add a <Repeat name>** (today's), **Set <name>s for a new quarter** (the numbers step again), **Change who approves** (puts a Member into the Position's places: the Approve steps, proposed Shares, Stand-in and Snapshot of what this Set up made, through the operations used by hand), **Invite the people from this set-up**, and **Choose parts yourself** (today's detailed form). A Pack installed before this shows the same, from its record or the lack of one.

A Pack with **no Dashboard, Deck or Workflow Template** (only catalog entries, Themes, View Designs or Recipes) has **Add to my Workspace** instead of Use this pack: it installs, and says what was added and where it is. "Install" and "Set up from this Pack" leave the screens.

## Who, and what stays

Owners and Admins, never through a key, never in the demo. A Pack with Themes still needs an Owner to install (an Admin may use one that is installed); others read "Ask an Owner". The confirmation for an unsigned file and the box for texts aimed at assistants, with the texts, stay: on the preview for a file or Marketplace Pack, on the check screen for Ziffr's own.

## Pack authors

Export as Pack's "Describe your Pack" gains **Set-up questions**: the three preview fields, a question for every Position and Repeat in the file (they appear once export writes them, #1187 and #1189), and "Ask a number at set-up" per Metric. Each field says its limit. **Try it** walks the same screens with the fallbacks and made-up people, from the file as it would be written, and **writes nothing**: no install, no person, no message. It works in every Workspace, so it does not need a Practice Workspace.

## First Steps

#1327 is rewritten: it builds the screens `sets` and `set` only, and **Use this set** opens this flow. Its one-press operation and its exclusion of Packs with Positions or Repeats are dropped. When the flow started from First Steps, done continues to `value`. `sender` is skipped for a set, because the flow asked who provides the numbers and notes that providers are chosen.

## Contract between the tickets

`packages/core/src/pack-start-steps.ts` (pure, client-safe): the declarations type (every new field optional) and `startSteps(declarations, room)`.
`packages/core/src/pack-start.ts` (Actor first):

- `startOptions(actor, ref)` with `ref` = `{ included: packId }` or `{ install: id }`: declarations, room, people who may be picked, whether this is a trial, confirmations needed, why blocked.
- `startPackStep(actor, ref, choices, run?)` returns `{ done: false, run, made, of }` or `{ done: true, result }`.
- After: `sendFirstPackNumber`, `invitePackPeople`, `setPackNumbers`, `setPackProviders`, `changePackHolder`.

A browser names ids, keys, typed names, addresses and numbers, all checked on the server. What comes back is only what the person may see.

## Quality

390 and 320 wide, light and dark, desktop; no sideways scroll; 44 px targets, 16 px fields; keyboard only works; focus moves to the heading on each step. Database tests in a trial and an ordinary Workspace.

## Decisions taken (the owner can overrule)

1. New fields make `ziffr.pack/3`; `/2` is not changed after its release.
2. Someone new who must approve does not hold the Position until they joined; the runner does, and swaps them in with one press later. No role is granted in advance.
3. No sharing with new salespeople at set-up (a Contact cannot be shared with).
4. People type system numbers until a Feed is connected.
5. A typed quota is written to every week of the quarter; a new quarter is set by hand on the Pack's page, without a reminder.
6. A flow makes the first dashboard and Workflow; the rest, and picking single Metrics, stay under "Choose parts yourself".
7. Answers stay in the browser tab, not on the server.
8. Marketplace and uploaded Packs are installed on the preview, Ziffr's own at "Set it up".
9. "Try it" writes nothing and uses no Practice Workspace.
10. Shipped guides lose "First steps" and "Each part"; the user guide holds the detail.
11. One answer to "Who provides these numbers?" holds for the whole Pack; no choice per group of Metrics.

## Tickets

Built at `/use-pack/[ref]`, which answers "not found" while one constant is off and nothing links to it. Only ticket 6 turns it on, so `main` is never half switched.

1. #1342 `ziffr.pack/3`, the declarations kept at install and in all thirteen shipped Packs. Needs #1340 merged for the Pack files; the format itself can be built meanwhile.
2. #1343 Core: steps, people, set up, numbers and decks. Needs nothing.
3. #1344 The screens, from preview to done. Needs 2 and #1339.
4. #1345 After the set-up: first number, invitations, new quarter, who approves. Needs 2 and 3.
5. #1346 Export as Pack: Set-up questions and Try it. Needs 1 and 3.
6. #1347 Switch over: Packs page, Marketplace, First Steps, the short guides. Needs 1, 4, 5 and #1327.

1 and 2 run at the same time; then 3; then 4 and 5 together; then 6. Ticket 3 may start on the contract above while 2 is in review.

## Out of scope

Screens made by Pack authors, conditional questions, a quarter reminder, several dashboards in one flow, any change to who may invite, share or approve, or to a limit.
