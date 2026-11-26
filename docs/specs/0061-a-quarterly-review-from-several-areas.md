# 0061 A quarterly review from several areas: Snapshot Parts on a deck, and Needs attention

**Status:** Part 1 accepted and being built; Part 2 draft. **Ticket:** tracking issue #1203, tickets #1204, #1205, #1207, #1208, #1209, #1210.

## The owner's instruction, 2026-11-26

On the fault in problem 2: "that must be fixed, and we need the option to create a deck either on live numbers or on a Snapshot." So wherever a deck is started from a dashboard or a Snapshot, the person chooses between **Live numbers** and a Snapshot's kept numbers. A slide that keeps numbers says so on screen, when presenting and in PDF and PowerPoint ("Numbers as of ..."), and its values, targets, comparisons, Breakdowns and derived figures never change. Adding a Snapshot's slides to a deck that exists is part of it. Decks already made from a Snapshot keep working as they are, and the app says that their numbers are live.

The owner also decided that day, the stricter way: **a deck's Share opens nothing through a Snapshot Part.** Each reader also needs access to the dashboard the part came from.

## Problem Statement

Several areas of one business, such as Sales, Marketing and Operations, share a Workspace. Each quarter they meet for a review. Each area lead owns a dashboard and answers for its quarter. One person, here the **assembler**, puts the deck for the meeting together.

Much of this works today. An area lead owns the dashboard and shares it with a Group. The dashboard's owner or an Editor takes the quarter's Snapshot, or Ziffr takes it by itself, and it stays a draft until one of them shows it. A Workflow's Send Snapshot step can take, show and send it. These things do not work:

1. **A Snapshot reaches only a new deck.** **Make a deck** starts one deck from one Snapshot. Nothing adds a Snapshot to a deck that exists.
2. **That deck does not keep the Snapshot's numbers.** Its slides hold ordinary Widgets marked with the period's last day. They draw the values recorded now, cut at that day, against the targets as they are now ([spec 0013](0013-dashboard-snapshots.md) decided this, because decks kept no data). A value corrected or recorded late changes the slide. The user guide says the slides are "drawn from the values the Snapshot kept", which the code does not do.
3. **The meeting grows with the number of Metrics, and then breaks.** A Widget that follows a Tag draws up to 50 Metrics. The Scoreboard takes at most 12, so from the 13th tagged Metric it shows one sentence instead of a table.
4. **The Scoreboard's Target column skips the Target Series.** It judges against the Target Range only, while Attainment and the Metric table Slide Element use the period's Target Series value where there is one.

## Solution

Two things, built in this order.

1. **Snapshot Parts.** **Add to a deck…** on a shown Snapshot adds its parts to a deck that exists, and **Make a deck** offers the same numbers for a new one. A part draws the numbers the Snapshot kept, and each person sees it only if the Snapshot itself would show it to them.
2. **Needs attention.** A Scoreboard can show only the Metrics that are off target or changed most, however many it follows.

A quarter then goes like this. Once, each area lead shares their dashboard with a Group such as "Quarterly review". Each quarter, the lead takes the Snapshot, writes its words and shows it. The assembler adds each shown Snapshot to the review deck, shares the deck with the same Group, and presents or exports it.

## User Stories

1. As an area lead, I decide what my part of the review says: I take, write, show and delete my Snapshot, and I decide who may open my dashboard.
2. As an assembler, I add each area's Snapshot to one deck without retyping or redrawing anything.
3. As an assembler, the numbers on those slides are the numbers each area showed, also after someone corrects a value.
4. As an assembler, I see before the meeting who will not see which parts, so I can ask the area to share its dashboard.
5. As an attendee, I see the parts I may see, and learn nothing about the others.
6. As an area lead with 30 Metrics, the meeting sees the few that need a conversation, and why.

## Implementation Decisions

### Part 1: Snapshot Parts

#### What a part is

New in the glossary: **Snapshot Part**, one part of a dashboard's shown Snapshot on a deck's slide. It is either one Widget as the Snapshot kept it, or the **opening part** with the dashboard's name, the period and the Snapshot's introduction. _Avoid_: embed, frozen widget, imported slide.

In the deck's document a part is a shape of its own kind. It stores its size, the Snapshot's id and a part number: the id of the Widget in the Snapshot, or 0 for the opening part. **It stores nothing else**: no name, title, period, word, value or Metric id. Everyone the deck is shared with receives the document, so anything written into it would reach people who may not see the Snapshot. The part therefore draws its own title; no text box is added for it, unlike **Make a deck**.

No migration is needed.

#### What stays and what follows

| On a part | Comes from |
| --- | --- |
| Values, Breakdowns, layout of the Widget | The Snapshot's kept data. A later correction, late value or Retention does not change it. |
| Targets, Projections, Attainment method | The Snapshot, as when it is opened. |
| "To date", comparisons | Counted from the day after the period, as when it is opened. |
| Start of the Fiscal Year | As the Snapshot kept it, so a quarter on a part never changes its months. The Snapshot's own screen follows the Workspace's year start now ([spec 0017](0017-quarterly-and-yearly-metrics.md)). |
| Number Style | The Workspace now: how a number is written, never which number. |
| Titles, headlines, sentences, introduction | The Snapshot's words **now**. The area may reword after showing; every change is a Version. |
| Colours and fonts | The deck's Theme. |

Under each part stands the dashboard's name, the period and the day it was taken. If a value the part draws was corrected since, a viewer who may see it also reads "Corrected since: see the Snapshot".

A Snapshot cannot be retaken. An area that must change a number deletes the Snapshot and takes it again, which makes a new one. Parts of the old one say it was deleted, and the assembler adds the new one. Ziffr never swaps one Snapshot for another by itself.

#### Who sees a part

A part shows a person exactly what opening the Snapshot would show them there. All of these must hold, checked by the core each time:

- they may open the dashboard,
- the Snapshot is shown,
- they may see every Metric the part draws, now.

**The deck's Share opens none of this.** A part adds no Metric to the deck: it does not count among the deck's Metrics for Shares, "who can see this" or View Links. A live Widget elsewhere in the same deck still opens its Metric as today, but never the dashboard, so it does not open the part.

| The viewer | Sees |
| --- | --- |
| May open the dashboard and sees every Metric of the part | The part. |
| May open the dashboard, looking at the opening part | The name, period and introduction, as on the Snapshot. |
| May open the dashboard, not every Metric of the part | "This part is not available to you." |
| May not open the dashboard, such as someone who only has the deck | The same sentence. No name, period, title or count. |
| May open the dashboard; the Snapshot was deleted | "This Snapshot was deleted." |
| The dashboard was deleted | "This part is not available to you." |

The server sends the browser, for each part the viewer gets, only that part's Widget, words and the kept data of its Metrics. An id from a browser is untrusted: one that does not exist or belongs to another Workspace answers as one that is not shared.

Two things follow from the Snapshot's own rules and are said in the user guide:

- A Metric that someone saw only through the dashboard, and that is later taken off it, disappears for them from the part too.
- A dashboard's Share does not open a Metric shown through a Tag ([spec 0038](0038-tags.md)), neither live nor in a Snapshot. In a Snapshot, a Widget that followed a Tag is shown only to people who may see all the Metrics it kept. The dashboard's Share gives them only those that a fixed Widget on the live dashboard also shows. An area that uses Tags shares those Metrics with the review's Group.

#### Slides that keep numbers

A slide **keeps numbers** when it holds a Snapshot Part, or was made by adding a Snapshot (its frame stores the Snapshot's id and nothing else, so deleting the part does not turn the slide live). Everything on such a slide that draws numbers, Widgets and [Slide Elements](0057-designed-slides.md) alike, draws that Snapshot's kept numbers, by the rules below for a part. Nothing on it draws a live number:

- A viewer who may not open the Snapshot, or may not see one of the shape's Metrics, or looks at a Metric the Snapshot did not keep, reads "These numbers are not shown to you: this slide keeps a Snapshot's numbers." in its place.
- A Widget or element there adds no Metric to the deck either, so the deck's Share opens nothing through it.
- A slide with parts of two Snapshots and no mark of its own draws no other numbers: the shape asks to be moved to a slide of one.
- A slide with such numbers says "Numbers as of" with the day the Snapshot was taken, its dashboard and period.
- View Links leave these shapes out with the parts.

A Widget moved to a slide that keeps no numbers is live again, and saving it asks once more that whoever saves sees its Metrics.

#### Live numbers or a Snapshot

**Make a deck**, on a dashboard and on a Snapshot, asks which numbers the deck shows:

| Started from | Default | Also offered |
| --- | --- | --- |
| A dashboard | **Live numbers**: one editable slide for each Widget, as before. | One of the dashboard's shown Snapshots. |
| A shown Snapshot | **This Snapshot's numbers**: the opening part and one part for each Widget. | **Live numbers**: the dashboard as it is now. |
| A draft Snapshot | **Live numbers**. | Nothing: the draft is shown first. |

A deck made from a Snapshot before this (its Widgets marked with the period's last day) stays as it is. Its editor says that its numbers are live, and each such slide says "Live numbers, periods up to" that day, also when presenting and exported.

#### Adding a Snapshot to a deck

**Add to a deck…** stands on the Snapshot's screen beside **Make a deck**. It offers the decks the person may edit, and **New deck**.

| To add, a person needs | |
| --- | --- |
| For the deck | To be its owner or an Editor, and not a Guest. The demo's own decks stay as they are. |
| For the Snapshot | It is shown, and they may open it. Their role on the dashboard does not matter: the assembler is usually only its Viewer. |
| For each part | They may see it. Others are left out, and the person is told how many. If none is left, nothing is added. |

A draft cannot be added: showing the Snapshot is the area saying it is ready.

The deck gets, after its last slide, one slide with the opening part and then one slide for each other part in reading order. Nothing already on the deck changes. The request is used once, as with **Add to… ▸ Deck…**. Adding the same Snapshot twice adds it twice. Editors of the deck may move, resize and delete a part; nobody changes what is in it from the deck.

The area stays in charge: only the dashboard's owner and Editors take, write and show; only its owner deletes. Deleting the Snapshot, or taking the dashboard's Share away, takes the parts' numbers out of every deck at once for those concerned. Files exported earlier keep them.

**Make a deck** with live numbers keeps its editable Widgets; with a Snapshot's numbers it makes the same slides as **Add to a deck…** in a new deck. The user guide's old sentence is corrected.

#### The deck's owner sees who is left out

The deck's Share panel adds, for each person and Group the deck is shared with, a line such as "Cannot see 3 Snapshot Parts (Sales, Q3 2026). Ask the dashboard's owner to share it." A Group is listed when any member cannot. It speaks only of parts the deck's owner may see. Parts the owner may not see (an Editor may have added them) are counted in one line without a name.

#### Presenting, exporting and everywhere else

| Place | What happens to a part |
| --- | --- |
| Presenting | The same checks for whoever presents. |
| PowerPoint and PDF | The file holds what the exporting person sees; other parts export their sentence. A slide whose only numbers are parts carries the line under the part instead of "Data as of" today. |
| View Links to a deck, live and frozen | **Left out** in this spec, with every shape that draws numbers on a slide that keeps them. The core removes them from what a link sends, and the View Link window says how many are left out. Without this step the shape would pass, since a link filters Widgets only. |
| Dashboards, Free layouts | Refused. |
| Slide layouts, Deck Templates, Packs, Workspace Export | Left out, and said so. |
| Versions | Restoring brings the references back; the checks apply when they are read. |
| Demo | The demo's deck rules accept the shape with its two numbers; otherwise a visit's deck holding one could not be saved. |
| Limits | At most 100 parts from at most 20 Snapshots in one deck, checked when it is saved. |
| Audit Log | Nothing new: adding a part shares nothing. Exports are noted already. |

### Part 2: Needs attention

A setting of the Scoreboard, chosen in its menu by the dashboard's owner and Editors:

| Setting | Choices | Default |
| --- | --- | --- |
| Show | All Metrics, Needs attention | All Metrics |
| At most (rows) | 3, 5, 8, 12 | 5 |
| Count a change from | 5 %, 10 %, 20 %, 50 % | 10 % |

It works on a Scoreboard that follows a Tag and on one with a fixed list (up to 50 Metrics, which may then be more than 12). The difference between the two is who sees the Metrics: a dashboard's Share opens a fixed list and never a Tag.

New in the glossary: **Needs attention**, the Scoreboard's choice to show only the Metrics off target or changed most. The Timeline in Actions writes the same words beside an Approval that waits; that is a different thing, and the entry says so. _Avoid_: exceptions, RAG status. It is not an Alert: it tells nobody anything.

#### The rule

One pure function in the core, over what **one viewer** may see:

1. Each Metric is judged on the latest value the Scoreboard shows, by the Metric's own period. In a Snapshot, as of its period's last day. A value waiting for Approval counts and is marked. An old value counts, and the row names its period, as today.
2. **Off target:** the value is outside the target of its period: the Target Series value where there is one, else the Target Range. This is the target Attainment uses. The Scoreboard's Target column judges the same way in both settings, which closes problem 4.
3. **Changed:** the change against the period before (the Change column's), as a share of the earlier value, is at least the chosen size, up or down, good or bad. With no earlier value, or an earlier value of 0, there is no change to count.
4. **Order:** off target first, the lowest Attainment first (by the Metric's method), those without a percentage after them by name. Then changed, the largest first. Equal ones by name. A Metric appears once.
5. At most the chosen number of rows. Above them stands "5 of 23 need attention: 3 off target, 2 changed by 10 % or more." Below them "and 4 more need attention" where there are more, and "2 have nothing to judge" for Metrics with no value, or with neither a target nor an earlier value. With none: "Nothing needs attention", with the same counts.

Every row says why in words (such as "Too low", or the arrow and percentage), also on a narrow card, where today the Target column is hidden. The minimum of 3 Metrics does not apply, and neither does the maximum of 12.

Every count is over the Metrics this viewer may see. Nobody learns how many they cannot see. Two people may see different rows and different counts.

#### With a Tag, in Snapshots and decks, and on View Links

- **Live:** the core judges every tagged Metric the viewer may see, up to 200 by name (and says when there are more), before anything is cut. Today the first 50 by name are taken. Only the shown rows' values go to the browser.
- **Snapshots and decks** (made with **Make a deck** or **Add to… ▸ Deck…**) keep the setting and **every judged Metric**, up to 50, those that need attention first. The rule then runs for each reader over what was kept. A Snapshot judges as of its period's last day and never changes its answer.
- As today, a Snapshot leaves a Widget out whole for a reader who may not see one of its Metrics.
- **Keep today's Metrics, stop following the Tag** and **Fix the list** also keep every judged Metric up to 50, not only the rows on screen. Their dialogs say how many Metrics are then shown to everyone the dashboard is shared with.
- **View Links** agree to the Widget's whole list when made, and the core sends only the rows each opening shows.

The setting is checked on the server wherever Widget settings arrive: the app, the API, the MCP Server and the demo.

## Tickets

| Ticket | What | Needs first |
| --- | --- | --- |
| #1204 | Snapshot Parts: core, visibility, where they are refused or left out | |
| #1205 | Drawing them: editor, presenting, exports, glossary, guide | #1204 |
| #1207 | Add to a deck…, **Make a deck** with the choice of numbers, and the guide | #1205 |
| #1208 | The Share panel says who is left out | #1204, #1207 |
| #1209 | Needs attention: rule, Tags, Snapshots and decks, View Links | |
| #1210 | Needs attention: setting, drawing, guide | #1209 |

## Testing Decisions

The visibility table of Part 1 is tested row by row against the database. So are three promises: a deck's Share opens no Metric through a part, no View Link payload holds one, and a corrected value changes nothing on one. The Needs attention rule has unit tests for each of its steps. Database tests cover two viewers of one Tag, more than 50 tagged Metrics, a Snapshot of an earlier period and what a View Link sends. Tickets #1204, #1208 and #1209 get a security review. The screens are tried at desktop and phone width.

## Out of Scope: later items

1. **Two people overwriting one deck.** Saving a deck replaces its whole document with what that browser holds, a moment after each change, without checking that the deck is still the one it loaded. Two Editors, two tabs, or **Add to a deck…** while someone else has the deck open: the last save wins, and slides can disappear. Until this is fixed, the guide advises one assembler who adds all the parts.
2. **A quarterly review Pack:** a Dashboard Template per area, a Deck Template with the agenda, and a Workflow with a Send Snapshot step. Snapshot Parts cannot be in a Pack, so the Pack's guide says where to add them.
3. Snapshot Parts on View Links.
4. Replacing the parts of a deleted Snapshot with those of the new one in one step.
5. Needs attention counting a missing or late value.
6. Showing the assembler which areas have not shown their Snapshot yet.

## Decisions

### Decided by the owner, 2026-11-26

1. **A deck's Share opens nothing through a part.** Each reader also needs access to the dashboard it came from, so each area shares its dashboard with the audience.
2. **Both kinds of deck**: live numbers or a Snapshot's, chosen where the deck is started. (The draft had **Make a deck** stay live.)

### Built as recommended, the most restrictive choice; open to the owner

3. **Anyone who may open a shown Snapshot may add it** to a deck of theirs, a dashboard Viewer included. They can export it, as they can capture the screen today. Alternative: only the dashboard's owner and Editors, who then need to be Editors of the review deck.
4. **Only shown Snapshots** can be added or picked, so nobody sees an empty slide where a draft is.
5. **View Links leave parts out.** An outside audience gets a PDF or PowerPoint file. The question for later: may a deck's owner send another area's Snapshot outside, when for the Snapshot itself only the dashboard's owner makes a View Link?
6. **Numbers stay, words follow.** Alternative: keep the words as they were when added, which would need the deck to keep text that not everyone may read.
7. **A slide that keeps numbers keeps all of them**, Widgets and Slide Elements put on it included. Alternative: they stay live beside the part, which mixes two sets of numbers on one slide.
8. **The start of the Fiscal Year is the Snapshot's** on a slide, and the Workspace's now on the Snapshot's own screen ([spec 0017](0017-quarterly-and-yearly-metrics.md)). Alternative: change one of the two so that both agree.

### Part 2, for the owner to check

9. **Tags stay closed to the dashboard's Share**, also in Snapshots, and a Widget is left out whole for a reader who lacks one Metric. With Tags, each area must share its Metrics with the audience. Alternative: narrow the table to the Metrics the reader may see.
10. **A change counts in both directions** from 10 %, and a missing value does not count. A share of a small number makes a large change; a Metric in percent is judged the same way.
11. **The Scoreboard's Target column starts using the Target Series** in both settings. Number Widgets keep judging their chip against the Target Range, so for a Metric with a Target Series the two may differ; changing the chips everywhere would be a ticket of its own.
12. **Needs attention is also offered for a fixed list**, since that is the way to have it opened by the dashboard's Share.
13. **The name** is already on the Timeline for something else. Alternative: "Off target or changed".
