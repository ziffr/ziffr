# 0055 One app for phone and desktop: the same Ziffr everywhere, looking after what a phone is good for

**Status:** draft. **Ticket:** tracking issue TRACKING, tickets TICKETS (the owner's decisions, 2026-11-25).

## Problem Statement

Ziffr was written desktop-first. More and more first visits arrive on a phone: someone is sent a link, signs in from a Prompt, or opens a dashboard shared with them. The audit of 2026-11-24 found screens that scroll sideways, controls too small to tap, tab strips that are cut off and editors that cannot be used with a thumb. We fixed the worst of it screen by screen (#1099, #1104, #1113, #1115, #1118, #1119, #1127, #1128), and the backlog of what is left is open (#1121 to #1126). Fixing screens one by one will not hold: the next new screen is built on a desktop and breaks on a phone again. The first impression on a phone must be a good one, and it needs a rule, shared parts and a check, not only another round of repairs.

## Solution

Ziffr stays **one app**: one core, one permission model, one vocabulary and the same addresses. A link shared from a phone opens on a laptop and the other way round, with the same words and the same visibility (AGENTS.md rules 2 and 3).

**Two apps, one for desktop and one for mobile, are rejected.** It would double the work for every feature, and every Share, Group and Stand-in rule would have to be right in two places: two places for a visibility bug is the opposite of "visibility is the product". A native app is not built now either (see Decision below).

What differs between a phone and a desktop is the **shell** (how you move around) and the **layout** of a screen, chosen by the device class. It is done in a few shared building blocks, not by a hack on each screen.

The principle: **a phone is for looking and for quick actions; a desktop is for building.**

- On a phone: check a number, record a value, answer a Question, approve, read a Thread, look at a dashboard, see what waits for me.
- On a desktop: design dashboards and decks, build Workflows, set up Connectors, install Packs, change Installation settings.

A phone never loses data or rights compared with the desktop; a screen made for building simply says honestly that it is better on a larger screen and offers a way to continue there.

## User Stories

1. As someone who got a link to a dashboard, I want it to open readable on my phone, so that I look at the numbers at once.
2. As someone asked for a value, I want to record it from the Prompt in a few taps, so that I do not need to find the Metric first.
3. As a Member on the way, I want to see what waits for me (Questions, Tasks, values due, Approvals) as the first thing on my phone.
4. As someone who opens a deck editor on a phone, I want to be told plainly that it is made for a larger screen, and to be able to send myself the link, so that I am not left with a broken page.
5. As a Workspace admin, I want a new screen to be checked on a phone before it is merged, so that I do not find out from a new person.
6. As someone who shares a link from my phone with a colleague at a desk, I want it to open the same screen there.

## Implementation Decisions

### Three tiers of screens

Every route in `apps/web/src/app` belongs to one tier. The tier says how much a phone has to do well; it never hides a route or changes who may see it.

**Phone-first** (designed for a thumb, checked at 390 and 320 wide in every release):

- Dashboards: `/dashboards`, `/dashboards/[id]`, `/dashboards/[id]/present`, `/dashboards/[id]/snapshots/[sid]`, View Links `/v/[token]`, the Gallery `/gallery`.
- Quick look and Record a value: `/metrics/[slug]` and `/metrics/[slug]/[period]`, `/submit/[code]`, `/schedule/submit/[slug]`, `/paste-values`.
- Schedule `/schedule`, and what it holds: Actions, Threads and Questions (`/actions`, `/actions/[id]`, `/actions/share/[id]`).
- Search (the command search in the shell) and the Metrics list `/metrics`.
- Getting in: `/login`, `/invite/[token]`, `/welcome`, `/setup`, `/try`, `/try/start`, `/demo/confirm`, `/oauth/authorize`.
- Stories `/stories`, `/stories/[id]` (reading).

**Phone-OK** (everything can be read and the common change can be made; it may be cramped but has no sideways page scroll and no unreachable control):

- Settings: `/settings` and its sections (`profile`, `appearance`, `alerts`, `deliveries`, `schedule`, `tags`, `keys`, `webhooks`, `your-webhooks`, `workspace`, `usage`, `export`, `feeds`, `assistants`, `size`).
- People `/team`, the Audit Log `/audit`, Changes `/changes`, lists such as `/workflows`, `/connectors/outbox`, `/sources`, `/decks`, `/stories`, guide pages `/guide`, `/guide/[chapter]`, `/themes`, `/settings/library`.
- Presenting a deck `/decks/[id]/present`.

**Desktop-first** (made for a pointer and a large screen; on a phone they show the honest short message below, and read-only parts stay readable):

- The dashboard editor (editing on `/dashboards/[id]`) and the deck editor `/decks/[id]`.
- The Workflow editor (`/workflows`, a Workflow's page), Connectors (`/connectors`, `/connectors/send`, `/connectors/sources`, `/connectors/who-gets-what`).
- Packs: `/settings/packs` and its install, and the Library playground `/settings/library/playground`.
- Installation settings: `/installation` and `/installation/feedback`.
- The Analysis builders: `/analyze`, and creating a Metric with its Sources (`/metrics/new`, a first Metric on `/welcome/import`, `/welcome/import/[id]`).

The list above was read from the routes (`find apps/web/src/app -name page.tsx`) on 2026-11-25. Ticket 1 keeps a **route table** in code (route pattern and tier) so the check and the message use one source, and a test fails when a page exists that is in no tier, as a new route would otherwise go unnoticed.

### Device classes and the breakpoints

The code already uses these; the spec names them so new code takes them and does not invent others.

- **Phone:** `max-width: 640px` (Tailwind's `sm:` is 640 and up; the shell's bottom tab bar and the tour use `md:` 768 and `max-width: 767px`). Below 768 the shell shows the bottom tab bar and no sidebar.
- **Small phone:** `max-[420px]` and `max-[360px]`, with 320 wide as the smallest we support. The Setup Guide and dashboards were fixed down to 320.
- **Touch:** `(pointer: coarse)`. Together with `max-width: 767px` it turns on the 44 px tap target rule in `globals.css`. A tablet with a pointer that is coarse gets touch sizes even when it is wide.
- **Desktop:** 768 and up with a fine pointer; `lg:` (1024) and `min-width: 1280px` for the wider layouts that exist.

Layout follows width; behaviour that depends on touch (sizes, hover-only actions) follows the pointer. A screen never decides by the browser's name or user agent.

### Shared building blocks and their phone variants

A screen should get its phone form from one of these, not from its own media queries. Where one is missing, the ticket named adds it.

- **App shell and bottom tab bar.** Exists (`app-shell.tsx`): four places and More, with the badge of what waits. Stays the one way around on a phone.
- **Slide-over** (`slide-over-host.tsx`). On a phone it covers the screen. Work panels (a Metric's Quick look, Help, Version history) stay full screen. Short ones (Share, Alert me, a choice) become a **bottom sheet** that covers at most most of the screen, with a grab bar and the close button reachable by the thumb. Ticket 2.
- **Table to card list.** A wide table (Metrics, People, Audit Log, lists) becomes a list of cards on a phone: the name first, two or three facts, the rest behind the card. One shared helper, so a table does not scroll sideways. Ticket 3.
- **Tab strip.** Where a screen has tabs (a Metric's page, Settings sections), the strip scrolls sideways on a phone and keeps the active tab in view, or becomes a picker when there are more than five. The page itself never scrolls sideways. The pieces exist (#1104, #1122 covers the Settings); the rule is the shared one.
- **Forms.** Inputs are at least 16 px so iOS does not zoom, controls are at least 44 px high and wide where they are tapped, a label stays beside its field, and the one main button sits where the thumb is (at the bottom of a sheet). The 44 px rule already exists in `globals.css`.
- **Dialogs.** A dialog on a phone is a bottom sheet or full screen, never a small box with an unreachable close button. Confirmations stay short.
- **Desktop-only message.** One component for the tier above. Ticket 4.

### Rules for every new screen

A short checklist, the same for a person and for an agent. It goes into AGENTS.md and CONTRIBUTING.md and into a guide chapter (ticket 8):

1. Say which tier the screen is in, and add it to the route table.
2. Look at it in a real browser at **390** and **320** wide, in light and dark, not only the resized desktop window.
3. No sideways page scroll at 320; a wide thing scrolls inside its own frame.
4. Tap targets are at least 44 px and inputs 16 px.
5. Plain words, no jargon the screen does not explain (the Glossary's words, none of its Avoid words).
6. Anything sent to the phone is only what that person may see, as everywhere.

**What CI can check.** The scripts used in the phone audit of 2026-11-24 (a browser walk over the main routes at 390 and 320 wide, in light and dark, measuring page width against the viewport, the size of tappable elements and the font size of inputs) are the starting point for an automated check on the **main routes of the Phone-first tier**. It fails on a page wider than its viewport, a tappable element under 44 px (with a short list of allowed exceptions, such as the drag handles) and an input under 16 px. It runs against the seeded demo data and signs in as the demo's people, so it needs no real data. Ticket 1. It does not replace looking: it catches the repeat offenders only (width, size), and reading, order and words stay a person's look.

### The phone shortcuts to build

Three things make a phone worth opening, and they are the next work after the checks:

- **Record a value as a very short flow.** From a Prompt, a push or an email, the link opens straight to the field for that Metric and period with the Metric name, the period and the last value shown, one number input, one button and a note you may skip. After saving, one line says what happened and offers the next value that is due. It is the same operation as everywhere (`submit_value` through the core), just a shorter screen. Ticket 5.
- **A phone home of what waits for me.** The first screen after sign-in on a phone is the Schedule's To do view cut down to what needs a thumb: values due, Approvals, Questions and Tasks, the one most overdue first, each one a tap away from answering. It is the To do view of the Schedule, not a new thing, so no new glossary word. Ticket 6.
- **Links that open into the right screen.** Every Prompt, email and notification link already names an address; the rule is that the address opens the right screen on a phone, after sign-in, and does not lose the target when the person has to sign in first. This is checked inside tickets 5 and 6 and in the flow of the existing delivery messages; it needs no new mechanism.

### The desktop-only message

For the Desktop-first screens a phone shows, instead of an editor that cannot be used, a short plain message at the top: "This is easier on a larger screen." then one line about what it is for ("Dashboards are laid out with a mouse or a trackpad."), and two buttons: **Send me the link** (an email to the person's own address, the same operation as other Prompts, rate limited) and **Look at it** where a read-only view exists (a dashboard opens to its normal view; a Workflow shows its steps). It does not block: someone who still wants to edit may. It never says "not supported". Ticket 4.

### Testing

- A **Playwright phone project** (a 390 wide iPhone profile with touch, and a 320 wide one) runs the check of ticket 1 in CI on the demo seed. Other projects keep the desktop size.
- **iOS Simulator spot checks** for what a resized browser cannot show: the keyboard covering a field, the safe areas at the top and bottom, input zoom, the home screen app. A person or an agent does them before a release that changes the shell, and notes the result in the pull request. They are not automated.

### Decision: nothing else for now

- **No native app now.** The web app already installs from the browser (manifest, icons and offline page, #143). A native app would be a second thing to keep in step with the permission model, and nothing in the audit needs one.
- **PWA:** the install exists. What is open is whether people find it. Ticket 7 checks the installed app on iOS and Android (start page, safe areas, theme colour, icon) and adds a short hint, shown once on a phone after the first sign-in, that Ziffr can be added to the home screen. Push notifications are not part of this spec: they need their own decision on delivery, consent and the Delivery Preferences.

## Testing Decisions

- The check of ticket 1 is the test of the rule; it is run in CI and by `pnpm` locally. It must fail on a deliberately wide page (a fixture) so we know it can fail.
- Each shared block has a component test in the way the others do (the bottom sheet: it opens, closes with Escape, keeps focus; the card list: it renders a row as a card with the same text as the table; the message: both buttons).
- The Record a value flow gets a test that it calls the same core operation and cannot reach a Metric the person may not see (it has no query of its own).
- The phone home reads through the same loaders as the Schedule, so it has no new visibility rule to test beyond "same as the Schedule".

## Tickets

Each ticket is one pull request. "Check" says how to know it is done. Already covered, and not repeated here: #1121 to #1126 (the phone fixes of the screens that remain).

1. **A phone viewport check in CI for the main routes.** A Playwright phone project (390 and 320, light and dark) that signs in as a demo person and walks the Phone-first routes; fails on sideways page scroll, a tappable element under 44 px and an input under 16 px; a route table in code with the three tiers and a test that every page is in a tier; the audit scripts are the starting point. Check: it runs in CI, it passes on `main`, and it fails on a fixture page that is too wide. First; blocks the others only in that they use its table.
2. **The shared slide-over becomes a bottom sheet on a phone.** Short panels (Share, Alert me, choices) open from the bottom; work panels stay full screen; focus, Escape and `?panel=` still work. Check: a component test, and a look at 390 and 320 in light and dark with before and after screenshots.
3. **A table-to-card-list helper, used on Metrics, People and the Audit Log.** One shared component or hook; the three screens use it below 640. Check: no sideways scroll on them at 320, same words and same rows as the table, screenshots. Related: #1124 (Metrics screens) and #1125 (Audit Log), which this ticket does not close.
4. **The desktop-only message component and its use on the editors.** The message of the section above on the dashboard editor, the deck editor, the Workflow editor, Connectors, Packs install, Installation settings and the Analysis builders, with Send me the link. Check: on a 390 wide screen each of these shows the message and a normal 1280 screen does not; the link is sent only to the person's own address. Needs a security look (it sends a message).
5. **Record a value: a very short flow on a phone.** The screen of the section above for `/submit/[code]` and `/schedule/submit/[slug]`, one number, one button, a skippable note and the next due value. Check: a Prompt link opens it, saving calls the existing operation, a link opened while signed out lands on the same screen after sign-in, and a guest sees only what they may.
6. **The phone home of what waits for me.** The first screen on a phone after sign-in is the Schedule's To do view cut down for a thumb; it reads through the Schedule's loaders. Check: for a demo person it lists exactly what the Schedule lists, one tap reaches the answer screen, and 320 wide has no sideways scroll. Blocked by 5 for the Record a value tap.
7. **PWA: check the installed app and say that it can be added.** Check the manifest and icons on an iPhone (Simulator) and an Android browser, the safe areas and theme colour; add the once-only hint after first sign-in on a phone. Check: the installed app opens at `/`, nothing sits under the notch or the home bar, and the hint shows once and not again.
8. **The rules for new screens in AGENTS.md, CONTRIBUTING.md and the guides.** The checklist, the tiers, the breakpoints and the shared blocks, in `docs/guides` (a chapter for phone screens). Check: `pnpm precheck` is green and AGENTS.md points to the chapter. Blocked by 1.

## Out of Scope

- A native app, and push notifications (a separate decision).
- A second layout of the whole app for tablets: a tablet takes the phone shell below 768 and the desktop one above.
- Editing dashboards, decks or Workflows well on a phone. The phone tier for them is a message, not a port.
- Translations and the design system (spec 0047, which is its own work).

## Further Notes

Open question for the owner: is the Record a value flow the first screen of a Prompt link for everyone, or only on a phone? The spec assumes only on a phone, so the desktop keeps its fuller screen, and both open the same address.
