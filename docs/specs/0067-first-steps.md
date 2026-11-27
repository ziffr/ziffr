# 0067 First Steps: from sign-in to a first number, one question at a time

**Status:** in progress (2026-11-27). Tracking issue #1325. Replaces the Owner's and Admin's Setup Guide of spec 0052.

**Screens:** [0067/screens.html](0067/screens.html) is the clickable draft (open it in a browser). It is the reference for flow, words, layout and simplicity. **Its styling is not the reference**: the app has one design (below). Its sets, suggestions, sample numbers and "Berlin" are examples. Where it differs from this spec, the spec wins.

## Problem

The owner, 2026-11-27: "we MUST KEEP this onboarding as simple as possible, think a business lead who has no time and patience". Explain in everyday words and do not rely on the person understanding screens. Today the Setup Guide opens with a long form, relies on a step bar, can end on a phone at "This is easier on a larger screen", and never says plainly that something waits for a first number.

The most important requirement: where something needs a first number first, say so, ask for the number, and let the person reply.

## Solution

**First Steps**: one question per screen in three chapters (About you, Your Workspace, Your numbers). A side panel shows the chapters and the answers so far; on a phone it is a top bar. The route is `/first-steps`, Route Tier phone-first.

**One design for the whole app** (the owner, 2026-11-27: "we should not have two different looks, there must be one design for the entire app"). The screens are built only from the app's shared tokens and components: the same cards, buttons, fields, side navigation style and chart renderer, with no colours, radii, shadows, fonts or components of their own. A piece that is missing is added to the shared components, in the app's style. **Decided by the owner on 2026-11-27:** the app keeps its look of today, and these screens look like the rest of it. The darker styling of the clickable draft is not used.

### Screens and words

| Id | Heading and lead | Choices, and what happens |
| --- | --- | --- |
| `who` | "Who will use Ziffr?" "We tailor the setup to your answer. It takes about two minutes." | "My team or business" / "Just me". Where a company Workspace can be asked to join, that offer (**Ask to join**) stands above. |
| `role` (team) | "What is your role?" "So that relevant metrics come first." | The Business Functions. "Skip this question". |
| `business` (team) | "What kind of business is it?" | Eight industries, "Show all industries", skip. |
| `customers` (team) | "Who are your customers?" | The segments, skip. |
| `topic` (just me) | "What would you like to track?" | Health and fitness, Money, Habits and time, A club or hobby, Something else; skip. |
| `workspace` | "Set up your Workspace" "A Workspace is your own space in Ziffr for your numbers and charts. Only people you invite can see it." | Name. Time zone, currency, week start read from the browser, with **Change** (also country). **Create Workspace**. In a trial one more line: it ends after N days and is then deleted. Where import is offered: "Coming from another Ziffr? Start from a Workspace Export". |
| `start` | "How would you like to start?" "Either way, everything can be changed later." | "Start with a ready-made set: Metrics, a dashboard and reminders, prepared for your kind of work." / "Start from a clean slate: An empty Workspace. We add your first metric together." Nothing preselected. |
| `sets` | "Choose a ready-made set" "In Ziffr these are called Packs." | Three best matches with "Matches your …", "Show all N sets", "Start from a clean slate instead". |
| `set` | The Pack's name and summary | Its real dashboard drawn with Sample Data ("Example dashboard, shown with sample numbers."), some Metric names, **Use this set**, "See other sets". |
| `first` | "Let's add your first metric together" "A metric is one number you follow over time. Pick a suggestion or define your own." | Up to five suggestions, "Define your own". Nothing calculated. |
| `own` | "Define your metric" | Name; then Unit (Number, Money, Percent, Hours); then How often (Daily, Weekly, Monthly); then **Add metric**. Each appears once the one before is answered. |
| `value` | "Now send your first value" "Until it is in, your dashboard stays empty and you cannot invite colleagues." | "Ask me by email" / "Type it in here" / "Do this later". See below. |
| `sender` | "Who provides this number from now on?" (a set: "these numbers") | "I will" / "A colleague" / "Nobody for now". See below. |
| `done` | "Your Workspace is ready", or "One thing is still open" | Summary (Workspace, set or Metric, first value, who is asked). **Open dashboard** or **Send my first value**. Optional: "Invite your team" (open, or locked with the reason), "Connect Slack or Telegram". |

## What a first value unlocks

Checked in the code (`invite-gate.ts`, migration `20270116500000_people_in_trial.sql`). **Nothing here is loosened.**

| Who and where | Locked until a first value | Otherwise |
| --- | --- | --- |
| Trial, Owner | **Invitations by email**, also of a Contact. Opens when an Owner has a value of their own in the Workspace (reply, form link, Record a value, their own key or assistant). Values from a Feed or an Import do not count. The database refuses (`ZF439`). | Dashboards, decks, Metrics, Packs are not locked; charts are only empty. |
| Trial, Admin | The same; only an Owner's value opens it. | |
| Trial, whatever the value | not unlocked by it | No invite links, no Domain Joining, no Share by email, nothing to Contacts or to anyone who has not accepted, Trial Limits (people, invitation emails a day, messages a day). |
| Ordinary Workspace (self-hosted or subscribed) | **Nothing.** | Charts are empty until values arrive. |
| Invited Member or Guest | Nothing; they cannot invite either way. | |
| Demo, Practice Workspace | Not by a value: invitations are refused there anyway. | No First Steps. |

A colleague as Submitter: the code does not tie this to a first value. A Submitter is a Member or a Contact; an Owner or Admin may add a Contact and make them a Submitter at any time. In a trial, though, nothing is ever sent to a Contact, and the invitation that would reach the person is locked. So First Steps shows "A colleague" as locked exactly when `inviteGate` says `waiting`.

### `value`: closing the loop

The heading's lead follows the gate: "and you cannot invite colleagues" appears only where invitations really wait (a trial). For a set: "One value of the set is enough." The Metric is the first made one that takes values; "Choose another" lists the others.

- **Ask me by email.** Where the Owner does not submit the Metric yet, `askMeForFirstMetric` (adds them and sends the one Prompt); else `askForFirstMetric`. The ten minutes between asks and the daily caps apply. The screen says to which address the email went, what its subject starts with, and "Reply to it with the number" (replies off: "Open the link in the email and type the number"). It polls `setupFirstValue`. Offered only where email is really sent.
- **Type it in here.** The Owner is added as Submitter **without any message**, then the value goes through `sendFirstMetricValue` (the web form's intake, same rules).
- **Received:** "Your reply arrived" or "Value recorded", the value and period, then "Now open to you": "Your dashboard shows its first number" and, when the gate opened, "You can invite colleagues". A value that waits for approval says so; it counts.
- **Email not set up** (self-hosted): only typing, with "This Ziffr cannot send email yet. Whoever runs it can set that up in the Installation settings."
- **Held by Quiet Hours:** today's words, with typing offered.
- **Late, refused or lost reply.** "Nothing arrived?" shows today's checks (`didntArrive`) and, new, what became of a reply to the person's own request, in fixed words: refused ("Your reply was not recorded. Ziffr emailed you why."), held ("Check your inbox for a link that confirms your reply."), from another address ("A reply came from another address, so it was not counted. Reply from {address}."), too late (after 30 days: "That request is too old. Ask again."). Never the mail's text or any address but the person's own. Ask again, or type it in.
- **Do this later:** goes to `sender`; the lock is said again there and on `done`.
- If the notes of spec 0064 ask for a note after a bare number, the value counts as in and that request is shown unchanged.

### `sender`: from now on

Nothing on this screen sends a request for a value at once. The lead names when Ziffr first asks.

| Choice | What happens |
| --- | --- |
| I will | The Owner is Submitter of every made Metric that people send, added without a message. A Metric without a Workflow joins one that asks for its period (Daily; Weekly on Monday; Monthly on the 1st; at the Workspace's asking hour), made once per period. |
| A colleague ("Someone else" for just me); one field, their email address | **Ordinary Workspace:** a Contact (named by the part of the address before @) is added and made Submitter in the Owner's place, without a message; the Workflow asks them from its next run. **Trial, after the Owner's value:** the same, plus one invitation by email as a **Guest**, tied to the Contact, so that on accepting they take over its Tokens; they are asked once they accept, and the screen says so. A refusal (people limit, invitations a day) shows today's words and removes the Contact again; an invitation held by a limit shows the link to send. An address that is already a Member or Contact is used as it is; the Owner's own address means "I will". Where email is not set up: "The request waits in the Outbox." Contact and sending limits apply. |
| Nobody for now | Made Metrics are taken off their Workflow; the Owner stays Submitter and can type values any time. |

**Who closes the loop** when the choice is a colleague or nobody: in a trial only the Owner's own value opens invitations, whoever is asked later. If it was skipped, `done` reads "One thing is still open", with **Send my first value**; the invite row reads "Invite your team (locked). Send your first value to open invitations." In an ordinary Workspace nothing is locked and the row is open; `done` still says the dashboard is empty.

### Locked later in the app

Every closed invite form already says why (`InviteLock`). Its "Go to the First Metric step" becomes "Send your first value" and leads to `/first-steps?step=value`. While First Steps is unfinished, a line at the top of each page reads "Next: send your first value" (or the next open step), with **Continue** and **Hide**, and in a trial says that invitations stay closed. An empty chart keeps today's **Record today's value**.

## The two ways in

**Changed by [spec 0068](0068-guided-pack-set-up.md):** **Use this set** opens its guided Pack set-up; the one-press operation described here is not built, and no Pack is left out for having Positions or Repeats.

**Ready-made set.** Offered: Ziffr's own Packs except `board-meeting`, `workspace-usage` and `ziffr-operations`; for just me only `sports-club`. Order and reasons from `recommendedPacks`; the dashboard from `readIncludedPack` and the Packs page's own preview. **Use this set** is one press and one core operation: `installIncludedPack`, then `setUpFromPack` with every entry, the dashboard, and the Workflow when it asks for at most one Approver (the Owner), **no Submitters, nothing sent, nothing shared**. Kept: the box "I read the words aimed at assistants" with the texts, shown only when there are any; Owner for a Pack with Themes; Workspace Limit and trial Metric limit, in their own words. A press that failed half way can be pressed again and makes nothing twice. A Pack with Positions or Repeats is offered only if it sets up whole without lines; ticket 2 checks and otherwise leaves it out.

**Clean slate.** Suggestions are Metric Catalog entries: by role and industry for a team (#1321's `suggestMetrics`), by topic for just me (Health: Running distance, Body weight, Hours of sleep. Money: Money saved, Spending, Account balance. Habits: Cups of coffee, Pages read, Screen time. Club: Club members, Training attendance, Fees received. None or other: Running distance, Money saved, Cups of coffee). Picking one makes it at once from the entry; own metric defaults: higher is better, overwrite, no target; Number 0 decimals, adds up; Money in the Workspace currency, adds up; Percent 1 decimal, average; Hours unit "h", adds up. In both cases every Source is open (so a reply by email counts), no Submitter, nothing sent, and a dashboard named after the Workspace is made with the Metric on it.

## Answers, reload, Back, second device

- Before the Workspace exists the answers are kept **in this browser only** (`localStorage`, per person id), cleared on creation, Start over and sign-out. Reload restores them; browser Back and the screen's **Back** step through (`?step=`). A second device starts again. A colleague's address is never stored.
- **Create Workspace** is one core operation: it validates every answer against the fixed lists and sizes first, calls `createWorkspace` (trial rules and Workspace limits unchanged), then saves name, Business Function, industry, segment, country, currency, clock, and "Just me".
- Afterwards the screen to resume at is worked out from facts: no Metric: `start`; no own value and nobody chosen: `value`; own value and nobody chosen: `sender`; chosen but no own value: `done` (open); both: finished. Stored (add-only migration): `workspaces.used_by` (`team` or `me`), `setup_guides.first_steps_at` (set only by this flow) and `providers_chosen_at`.
- **Start over** (confirm once a Workspace exists: "Start the questions again? Nothing you made is deleted.") goes to `who`. It never deletes anything and never makes a second Workspace; the `workspace` screen then saves changes ("Save").
- **Finish later** (once a Workspace exists) opens Home; the line, the start screen's "Continue setting up" and Help bring the person back. Before that there is nowhere to go, so the place shows **Sign out**.

## Who sees it

| Audience | What happens |
| --- | --- |
| New person (hosted trial or self-hosted) | `/welcome` leads to First Steps. |
| Person creating another Workspace (`?another=1`) | The same. |
| Invited Member or Guest, Domain Joining | No First Steps. A Member keeps today's two-step guide; a Guest none. |
| Owner or Admin of an existing Workspace | Never pushed in. Their Setup line and Setup Guide go; `/setup?step=ways` leads to Connectors, `?step=team` to Team, anything else to Home. |
| Admin joining a First Steps Workspace | None. First Steps is the Owner's. |
| Several Workspaces | Per Workspace. |
| Import of a Workspace Export | No First Steps. |
| Demo, Practice Workspace | Never. |

The coffee example is no longer offered to new Owners (Cups of coffee remains a suggestion); existing examples and their pages stay. "Where would you like to start?" stays; its setup choice reads "Continue setting up". The ways of the old guide live on Connectors.

## Quality

- Shared tokens and components only; nothing styled just for these screens.
- 390 and 320 wide, light and dark; no sideways scroll; every screen, and every page `done` links to, works on a phone. Tap targets 44 px, fields 16 px.
- Choices are real buttons with their state; focus moves to the heading on each step; only status lines are live regions; the dashboard preview has a text name; reduced motion is respected; colour never stands alone.
- Dates, currency and numbers follow the browser and the Workspace as today.

## Decisions taken (the owner can overrule)

1. A colleague in a trial is invited as a **Guest**, the least that can send values.
2. First Steps **replaces** the Setup Guide for Owners and Admins, also in existing Workspaces; Members keep their short one.
3. Answers before the Workspace stay in the browser, not on the server.
4. "A colleague" in an ordinary Workspace adds a Contact and invites nobody; "Invite your team" stays optional.
5. The clean slate path makes a dashboard, so "Open dashboard" always has somewhere to go.
6. "Just me" is offered one set (Sports club); seven Personal catalog entries and three for clubs are added.
7. No "Finish later" before the Workspace exists.

## Tickets

Built behind `/first-steps`, which answers "not found" while one constant is off; nothing links to it. Only ticket 5 turns it on.

1. #1326 Shell, About you, Workspace, How to start. Needs nothing. Opus security review.
2. #1327 Ready-made set: the two screens (rewritten by spec 0068). Needs 1. Sonnet review.
3. #1328 Clean slate. Needs 1 and #1321 merged. Sonnet review.
4. #1330 First value, who provides, done. Needs 1. Opus security review.
5. #1331 Switch over and remove the old guide. Needs 2, 3, 4. Sonnet review; Opus if it changes who may call anything.

2, 3 and 4 can be built at the same time.

From #1321 (`feat/1321-guided-first-number`) ticket 3 reuses `suggestMetrics`, its plain sentences and `HOW_OFTEN` (moved to a place both can use). Its guided New metric page and Setup line changes are removed by ticket 5 with the guide.

## Out of scope

A new look for the app, a server-side draft, calculated Metrics, CSV upload, changes to any limit or to who may invite.
