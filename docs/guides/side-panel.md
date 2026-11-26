# The side panel: when to use it, and when a modal

The **side panel** is the Glossary's **Slide-over**: a panel on the right that opens over the page so the page stays in view. On a phone it covers the screen, or, for a short panel, rises from the bottom (see [On a phone](#on-a-phone)). This guide is the rule for choosing between it and a modal window, and how to build one. It comes from spec 0050 (`docs/specs/0050-side-panel-and-help.md`); a pull request that adds a window checks itself against it.

## The rule

- **Side panel** for anything a person looks at or edits while the page stays in view: sharing, a Metric's quick look, recording a value, version history, choosing a template, editing details.
- **Modal** only for a confirmation or a single yes or no: delete, archive, discard changes. A modal asks one question and the answer is a button.

If the window has a form, a list, a preview or a search, it is a side panel. If a person would want to look at the page behind it while answering, it is a side panel.

## How to build one

There is one host, `SlideOverProvider` in the app shell (`apps/web/src/components/slide-over-host.tsx`). Do not build a `Sheet` of your own.

```tsx
const panel = useSlideOver();
<Button onClick={() => panel.open({ title: "Share", description: "Who can see it", content: <ShareForm … /> })}>Share</Button>
```

- `open` shows the panel in place of what is open and keeps what was open one step back; the panel then shows a **Back** button. `replace` swaps the content without a step back. `back` and `close` do what they say. Going to another page closes the panel.
- The host sets the shape (on a phone see below; 26 rem on a desktop; a reading panel such as Help sets `widthToggle: true` and gets a "Wider" / "Narrower" button, about 48 rem, kept for the session), moves focus into the panel when it opens and gives it back to the button that opened it when it closes. Escape and the close button close it. The title names the panel for screen readers, so every panel has one.
- The panel is a window for keyboard use like any other: Tab stays inside it while it is open, and Escape always leaves. Every control inside needs a name.
- `content` is what the page already may show. Anything that depends on who is asking is read on the server with the person as the actor and passed in; the host holds no data and never fetches.
- A panel that should have its own address (a Metric's quick look, shared by link) uses `?panel=…` through `usePanel` in `apps/web/src/lib/panel-param.ts`, as the panels below do today.

## On a phone

The rules for any screen on a phone, such as breakpoints and tap sizes, are in [Screens on a phone](phone-screens.md). Below 640 px a panel takes one of two shapes (spec 0055). The panel says which; the CSS in `components/ui/sheet.tsx` does the rest, so the address (`?panel=…`), focus, Tab, Escape, the locked page behind and the desktop panel are the same for both.

- **Work panel** (the default): covers the screen. For reading or working for a while: a Metric's quick look, Help, Version history, browsing templates, the Setup Guide.
- **Short panel** (`short: true` in `panel.open`, `short` on `SlideOverWindow` or `SheetContent`): a bottom sheet as high as its content, at most 85 % of the screen, with a grab bar; it scrolls inside, and its close button or a tap above it closes it. For one quick job: Share, Who can see this, View links, Alert me, Add to deck. The grab bar is a look only; there is no swipe.

`<SheetContent side="bottom">` (the phone's "More" menus) is the same bottom sheet with the same grab bar. Do not build another.

## What is a panel and what is a modal today

This is the state when the rule was written. Later tickets of spec 0050 move the screens marked **move**; they are working surfaces that are still modals.

**Side panel on the host** (`useSlideOver()`; `SlideOverWindow` in `slide-over-window.tsx` for a screen that keeps its own "is it open" state):

| Screen | File |
| --- | --- |
| Share (also `?panel=share`) | `apps/web/src/components/share-sheet.tsx` |
| Who can see this | `apps/web/src/components/who-can-see.tsx` |
| View Links (a dashboard's, a deck's, a Snapshot's) | `apps/web/src/components/view-links.tsx` |
| The Slot window ("Use this…"; the Preview is sized from the panel's width) | `slot-dialog.tsx` |
| Browse templates (the Pool's Browse…; Use closes it and the Slot window takes its place) | `template-browser.tsx`, `pool.tsx` |
| Versions of a team template | `template-menu.tsx` |
| Save as template (widget, slide layout, Deck Template, dashboard) | `save-template-dialog.tsx`, `save-dashboard-template-dialog.tsx` |
| Add to deck | `add-to-deck-dialog.tsx` |

Share, Who can see this and View Links open on top of one another with a **Back** button, so Share can lead to Who can see this and View Links and back. None of the three asks for a confirmation: revoking a View Link and answering a request for access act at once and can be undone by making the link again or granting later.

**Side panel, built on the older `Sheet` and not yet on the host:**

| Screen | File |
| --- | --- |
| Record a value | `apps/web/src/app/metrics/[slug]/record-value.tsx` |
| Alert me about a Metric | `apps/web/src/components/alerts.tsx` |
| Quick look at a Metric | `apps/web/src/components/metric-quick-look.tsx` |
| Version history | `apps/web/src/components/versions-sheet.tsx` |
| The "More" menu on a phone (a menu, not a working surface) | `apps/web/src/components/app-shell.tsx`, `object-toolbar.tsx` |

**Modal that should be a panel (move):**

| Screen | File |
| --- | --- |
| Edit details of a Metric | `apps/web/src/app/metrics/[slug]/edit-details.tsx` |
| Retention | `retention-form.tsx` |
| New dashboard, new deck | `new-dashboard-dialog.tsx`, `new-deck-dialog.tsx` |
| Fill in past periods | `apps/web/src/app/metrics/[slug]/fill-past.tsx` |
| Snapshot menu dialogs | `snapshot-menu.tsx` |
| Packs: marketplace, manage, export | `apps/web/src/app/settings/packs/` |
| Gallery, Workflow templates, Themes, deck editor, design view dialogs | `app/gallery/screen.tsx`, `app/workflows/templates.tsx`, `app/themes/screen.tsx`, `app/decks/[id]/editor.tsx`, `views/design-view.tsx` |
| Assistant prompt | `apps/web/src/app/metrics/[slug]/assistant-prompt.tsx` |

**Modal and stays one (confirmation):** `confirm-dialog.tsx`, `delete-metric.tsx`, `archive-metric.tsx`, `delete-deck.tsx`.

**Neither:** the search window (`search-dialog.tsx`, a command palette over the page) and the Widget frame's dialogs in `widget-frame.tsx` are checked one by one when a ticket reaches them. The Preview of a template is not a panel; it is drawn inside one.

A screen that is not in this list is new: choose by the rule above.
