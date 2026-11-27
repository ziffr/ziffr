# Screens on a phone

Read this before you add or change a page, or anything that opens over one. Ziffr is **one app** for phone and desktop: one core, one permission model, the same words and the same addresses. A link opened on a phone shows the same page as on a laptop. A phone is for looking and for quick actions, a desktop for building.

These rules come from [spec 0055](../specs/0055-one-app-for-phone-and-desktop.md), which also names what is still planned. This page describes what the code does today. A change to a shared part, a breakpoint or the check changes this page in the same pull request.

## The checklist

For every new screen, and every change to one:

1. **Route Tier.** Say which tier the page is in and [add it to the route table](#route-tiers). A test fails until you do.
2. **Look at it** in a real browser at **390** and **320** px wide, light and dark. Use the browser's phone emulation with touch, not only a narrow desktop window.
3. **No sideways page scroll** at 320 px. A wide thing scrolls inside its own frame.
4. **Tap targets are at least 44 px** high and wide, and **fields have text of at least 16 px**. iOS Safari zooms in on smaller text.
5. **Plain words.** Use the words of the [Glossary](../../GLOSSARY.md) and none of its *Avoid* words. Explain a word the screen needs.
6. **Visibility.** A phone gets only what that person may see, as everywhere. A smaller layout never loads more, and never takes away data or rights.

Say in the pull request what you looked at, with screenshots, and update the [user guide](../user-guide/README.md) chapter of the screen.

## Route Tiers

Every page in `apps/web/src/app` has a **Route Tier**: how much a phone has to do well on it. A tier never hides a page or changes who may see it.

| Tier | In the table | What a phone must do | Examples | Checked in a browser by CI |
| --- | --- | --- | --- | --- |
| Phone-first | `phone-first` | Made for a thumb | Dashboards, a Metric's page, recording a value, the Schedule, signing in | Yes, unless the walk skips the page |
| Phone-OK | `phone-ok` | Everything can be read and the common change made. It may be cramped, with no sideways scroll and no control out of reach | Settings, Team, the Audit Log, Decks, the guide | No: look yourself |
| Desktop-first | `desktop-first` | Made for a pointer and a large screen. It shows the [desktop-only note](#the-desktop-only-note), and what only reads stays readable | The deck editor, Workflows, Connectors, Analyze | No: look yourself |

The table is [`apps/web/src/lib/route-tiers.ts`](../../apps/web/src/lib/route-tiers.ts), the one list of every page. A new `page.tsx` gets a line there. A Phone-first page also gets a line in [`apps/web/phone/walk.ts`](../../apps/web/phone/walk.ts): how the check opens it and words that show it is the right screen, or why it is skipped. `route-tiers.test.ts` fails when a page is in no tier, when the table names a page that is gone, or when the walk and the Phone-first pages differ. `pnpm precheck` runs it.

A dashboard's page is Phone-first for looking at it. Editing on the same page is made for a larger screen, so Edit mode shows the desktop-only note.

## Breakpoints

Take these. Do not invent others.

| Screen | Rule | In Tailwind | What changes |
| --- | --- | --- | --- |
| Phone | below 640 px | `max-sm:`, and `sm:` for 640 and up | A short Slide-over is a bottom sheet; the desktop-only note shows |
| Below the desktop shell | below 768 px | `max-md:`, and `md:` for 768 and up | The bottom tab bar replaces the sidebar; tap targets are 44 px |
| Small phone | below 420 px and below 360 px | `max-[420px]:`, `max-[360px]:` | Tight rows wrap or drop to icons that keep their names |
| Smallest supported | 320 px wide | | Nothing scrolls the page sideways |
| Touch | `(pointer: coarse)` | `pointer-coarse:` | Fields have 16 px text and tap targets are 44 px, at any width |
| Desktop | 768 px and up | `md:`, `lg:` (1024) | The sidebar; wider layouts from `lg:` or 1280 px |

Layout follows the width. Behaviour that depends on touch, such as sizes or actions that show on hover, follows the pointer. Never decide by the browser's name. A tablet gets the phone shell below 768 px and the desktop one above, and touch sizes when its pointer is coarse.

Prefer CSS: a window that is resized or turned then keeps what a person has typed. For the few layouts CSS cannot say, use `useMedia` from `apps/web/src/lib/use-media.ts`.

## Shared building blocks

A screen gets its phone form from one of these, not from media queries of its own. File names below are under `apps/web/src`.

### App shell and bottom tab bar

`components/app-shell.tsx`. Below 768 px the sidebar gives way to a tab bar: Dashboards, Metrics, Schedule, Search and More. More lists the rest in a bottom sheet. It is the one way around on a phone.

### Slide-over and bottom sheet

Anything a person looks at or edits while the page stays in view is a **Slide-over**; [the side panel guide](side-panel.md) says how to build one. Below 640 px it takes one of two shapes:

- A **work panel**, the default, covers the screen: a Metric's Quick look, Help, Version history.
- A **short panel** (`short: true` in `panel.open`, `short` on `SlideOverWindow` or `SheetContent`) is a **bottom sheet** of at most 85 % of the screen, with a grab bar: Share, Alert me, Add to deck. The grab bar is a look only; there is no swipe.

`<SheetContent side="bottom">` is the same sheet, for a menu. Do not build another.

A dialog (`components/ui/dialog.tsx`) has no phone shape of its own: it stays a box in the middle. Keep it to a confirmation or a single yes or no, short enough that its buttons stay in reach.

### Forms

- On a touch screen, `app/globals.css` gives inputs, selects and text areas 16 px text. Below 768 px or with touch, it makes buttons, selects, inputs, menu items and links drawn as buttons at least 44 px high, and buttons that hold only an icon as wide. Switches, checkboxes, radio buttons and sliders keep their own size. Do not undo these rules with sizes of your own.
- It does not make everything big enough. A plain link on its own line, or a button with a short word, may still be too small; give it the size yourself.
- The `phone-fields` class puts a label above its field and makes a checkbox with its words one 44 px line, below 768 px. The app shell sets it on the Settings pages, and the Installation settings set it themselves.
- `app/setup/phone.ts` holds class strings for fields, buttons and rows of actions that stack on a phone. Use them rather than writing the same sizes again.

### Tables

A wide table scrolls inside its own frame, never the page. `Table` from `components/ui/table.tsx` brings that frame.

### Tabs

A tab strip never widens the page. A Metric's page (`app/metrics/[slug]/metric-tabs.tsx`) scrolls the strip sideways, fades the clipped side and brings the open tab into view. The Settings (`components/settings-nav.tsx`) become one "Section" menu below 768 px, which always shows where you are. Follow one of the two.

### One question per screen

A flow that asks one question per screen, such as First Steps, takes its frame from `components/guided-frame.tsx`. From 768 px the steps and the answers so far stand beside the screen and stay in view; below that, a bar above the screen says "Step 2 of 5" and holds the ways out. The question and choice cards are in `app/first-steps/parts.tsx`; each step's heading takes the focus.

### The desktop-only note

A Desktop-first screen, and the dashboard's Edit mode, say at the top, below 640 px: "This is easier on a larger screen." A line says why, with **Send me the link** and, where a view only reads, **Look at it**. The note never blocks the screen below it. **Send me the link** is not offered in the demo, to a Guest or to a person without a Workspace.

To add it to a screen:

1. Add the path, its name and one sentence why to the list in [`packages/core/src/desktop-screens.ts`](../../packages/core/src/desktop-screens.ts), with its cases in `desktop-screens.test.ts`. A path that is not on the list shows no note.
2. On a server page, render `<DesktopOnly path="…" look="…" />` from `components/desktop-only.tsx` (`look` is optional). A client screen renders `LargerScreenNote`, with `send` worked out on the server by `maySendLink`.

`route-tiers.test.ts` fails when a Desktop-first page has no words in that list, or when the list names a page that is not Desktop-first (the dashboard's page is the one exception, for Edit mode). No test sees whether the page renders the note, so do step 2.

**Send me the link** emails the person a **Screen Link**. The list in `desktop-screens.ts` is also the only list of addresses such an email may lead to: a new entry matches one whole path of this Ziffr and nothing else, and needs a security review. The core (`screen-link.ts`) sends only to the acting person's own address, within the limit of Test Messages, and never for an Access Key, a Guest or the demo.

## The phone viewport check

`apps/web/phone/` opens the Phone-first pages with Playwright at 390 and 320 px wide, with touch, light and dark, as Sara of the demo. A page fails when:

- something is wider than the screen and no frame of its own holds it;
- something to tap is under 44 by 44 px (a field's label counts, and a link inside a sentence is let off);
- a field has text under 16 px.

It runs in CI's `core-db` job, on a demo that was just reset, and in `pnpm ci:local` (not with `--quick`). To run it against your running app, with the demo's data:

```sh skip="needs a running app and a browser"
pnpm --filter @ziffr/web exec playwright install chromium-headless-shell   # once
pnpm --filter @ziffr/web test:phone                                        # ZIFFR_TEST_URL for another address
```

It only reads. Fix what it finds. Where a rule cannot hold, [`allowed.ts`](../../apps/web/phone/allowed.ts) takes one entry for one rule: a narrow selector, the pages and the reason.

## What the check does not see

- It measures a page where its walk ends. A panel, menu or dialog that the walk does not leave open is not measured.
- It measures sizes and widths only. Reading order, words and whether a thumb reaches the main button take a person's look.
- It does not walk Phone-OK or Desktop-first pages, nor the pages `walk.ts` skips.
- A resized browser does not show the keyboard covering a field, the safe areas at the top and bottom, input zoom or the installed app. Check these in the iOS Simulator before a release that changes the app shell, and note the result in the pull request.
