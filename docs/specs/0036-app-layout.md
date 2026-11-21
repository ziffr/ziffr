# 0036 App layout: sidebar, inset page, slide-overs

**Status:** the sidebar is the default since 2026-11-21 (#511 step 1); the top bar, its switch and the settings pages' own side list go in #511 step 2. **Ticket:** #502.

## Problem Statement

The top bar holds a wordmark, four destinations, a Workspace menu, search, Actions, help and the account menu. It works, but:

- the Workspace's own pages (up to a dozen for an Owner) hide in one dropdown, so people who live in them click twice for everything;
- the Workspace switcher is mixed into the account menu, so it is hard to see which Workspace you are in;
- a detail (a Metric's Alerts, a quick look at a number) either leaves the page or opens a centred dialog that covers what you were reading;
- on a phone the whole bar becomes one hamburger menu, so the two places people use most are two taps away;
- the demo's controls take a row of their own above every page.

## Solution

One frame, chosen per browser: a collapsible **sidebar** with the page as a raised card beside it, search first, details sliding in from the right, and a tab bar on phones. Same pages, same links, same permissions; only the frame changes.

Decisions (agreed with the owner):

- shadcn `sidebar-07` (collapses to icons) in the **inset** style: the page is a card on a tinted ground. Written for Base UI like our other components (`components/ui/sidebar.tsx`); no Radix is added.
- Top of the sidebar: the **Workspace switcher** (today's Workspace list, **The demo** below a line, **New workspace**), then a visible **Search ⌘K** field. Bottom: **User guide** and the **user menu** (Your settings, Installation settings for Installation Admins, Sign out).
- Middle: **Actions** with its count first, then **Dashboards, Decks, Metrics, Analyze**, then one **Workspace** row that opens the pages `workspaceTree(role)` gives this role (see *The tree* below). It is closed unless the current page is one of them (up to 13 rows at once read like an admin panel); with the sidebar shrunk to icons it is a single icon to the first page.
- ⌘K (#412) stays the main way to find anything. Ctrl+B collapses the sidebar.
- **Slide-overs** (a Sheet from the right) for details instead of page changes. The preview does two: **Details** on a Metrics list row (latest value, target, recent values, then **Open the Metric**), and **Alert me…** on a Metric's page.
- A quiet, dense look: 13px rows, tabular figures, colour only for status (the existing target chips), all from today's tokens, so Themes keep working.
- The demo's controls (**Viewing as**, **Leave the demo**) sit in a slim bar at the top of the page card.

## The tree (ticket #529, from the usability review #504)

```
Workspace switcher          Search ⌘K
Actions (count)             Schedule (values due)
Dashboards (pinned: #509)   Metrics   Decks   Analyze
Workspace (closed unless you are in it)
  Members and Groups · Workflows · Connectors · Sources (joins Connectors with #532) · Settings
User guide
You menu: Your profile · Your Deliveries · Your Alerts · Connected assistants · Installation settings (Installation Admins) · Sign out
```

- **Schedule** is a row of its own with the count of values due (overdue and due today), linking to `/schedule`; it moved out from under settings, and `/settings/schedule` redirects.
- **Settings** is one page with a grouped list beside it (`settingsGroups(role)`): Workspace (General, Size and Retention, Themes, Packs), Programs (Access Keys, Feeds, Webhooks), Records (Changes, Usage, Audit log). It is drawn only on those pages, by the frame, so the page's own side list is gone in this layout; the top bar's layout keeps today's list.
- **Guests** get no Workspace group (#504 Q1). Every row appears only for roles that can use the page: Feeds, Webhooks, Size and Retention, Usage and the Audit log are for Owners and Admins.
- **Phone:** the tabs stay; More no longer repeats them and shows Schedule, Decks, Analyze, **Workspace** as one expandable row, the guide, your own pages and switching.

## What moves where

| Today (top bar) | Sidebar layout |
| --- | --- |
| Wordmark | Workspace switcher tile at the top; the wordmark on phones |
| Dashboards, Decks, Metrics, Analyze | Sidebar, under Actions |
| Workspace menu (dropdown) | **Workspace** row in the sidebar that expands its pages |
| Search button | **Search ⌘K** field at the top of the sidebar; Search tab on phones |
| Actions icon with count | **Actions** row with count, first in the list; Actions tab on phones |
| User guide icon | **User guide** row at the bottom |
| Account menu: Workspace list, New workspace | Workspace switcher at the top |
| Account menu: your pages, Installation settings, Sign out | User menu at the bottom |
| Demo controls row | **Viewing as** person in the sidebar footer, where the user menu is (opens the picker and Leave the demo); a slim row on phones |
| Phone hamburger | Bottom tab bar: Dashboards, Metrics, Actions, Search, More |
| Alert me… dialog | Slide-over |

## Phone layout

Below 768px there is no sidebar. A bar fixed at the bottom has **Dashboards, Metrics, Actions** (with its count), **Search** (opens the same search) and **More**, which opens everything else from the bottom: Decks, Analyze, the Workspace pages, Your settings, the Workspace switcher, Sign out. Each tab is at least 44px wide and tall. The page keeps room under it, also with the home-bar inset on phones.

## Demo controls

In the demo, the sidebar footer shows what the signed-in app shows there: the **Viewing as** person (initial, name, role). It opens the picker of the demo's made-up people and **Leave the demo**, so the demo looks like the signed-in app and the top of the page stays free. The line "Look around as anyone…" stays under the page header. On a phone, which has no sidebar, the same two controls keep a slim row at the top of the page.

## Themes

The frame uses only the app's tokens (`--sidebar*`, `--background`, `--border`, `--ring`), which are already defined from the Coral tokens. A Theme colours the content a dashboard shows, not the frame, so Themes work unchanged. The app has no dark mode today (`color-scheme: light`); see question 5.

## Accessibility

- Every sidebar row is a link or button with a visible focus ring; a "Skip to the page" link comes first.
- Landmarks: the sidebar is a labelled region with a `nav` named Main; the phone's tabs are a `nav` named Tabs; the current page has `aria-current="page"`.
- Collapsed to icons, each row keeps its name for screen readers and shows a **tooltip** on hover and on keyboard focus. Actions keeps its count in its name ("Actions, 3 waiting for you").
- A slide-over is a Base UI dialog: focus moves in, Esc closes, focus returns to the button that opened it, the page behind is inert.
- Motion: the width change and slide-over use 150 to 200 ms and are off with `prefers-reduced-motion`.
- Touch targets on phones are at least 44px; rows in the sidebar are 28px for the pointer (a dense, desktop-only choice).

## Rollout

1. **Preview** (this pull request): the switch in **Your profile → Try the new layout (preview)**, or `?layout=sidebar` and `?layout=top` for a link. A cookie in this browser; nothing is stored on the server. The top bar was the default.
2. **Default** (done, 2026-11-21): the sidebar is the default for everyone, a browser without the cookie gets it, and the switch offers **Use the classic top bar** (cookie `top`; `?layout=top` still works). Every screen is checked in both frames; screens that assume the top bar's width are fixed.
3. **Remove** the top bar and the switch one release later.

In the sidebar layout the Settings pages carry only the grouped Settings list (#529); the top bar's layout keeps its single side list (`settings-nav`) until the top bar is removed.

## Not in this spec

More slide-overs (Share, Version history, Add to deck) and moving each into a Sheet; a customisable sidebar (pinned dashboards in it); dark mode.

## Decided (owner, 2026-11-21)

All eight recommendations were accepted:

1. **Frame:** sidebar with the inset card.
2. **Workspace pages:** a collapsible group, closed unless the current page is in it; Owners and Admins open it with one click.
3. **Pinned dashboards in the sidebar:** yes, after the preview: #509.
4. **More slide-overs** (Alert me…, Share, Version history, a Metric's quick look first; forms that create something stay dialogs): #510.
5. **Dark mode:** later, as its own ticket: #505. The frame already uses tokens only.
6. **Phone tabs:** Dashboards, Metrics, Actions, Search, More.
7. **Collapsed by default:** no; expanded, remembering the person's last choice.
8. **Switch:** the sidebar is now the default, with "Use the classic top bar" for one release (#511 step 1, done); removing the top bar and the switch comes one release later (#511 step 2).

The preview was delivered first as opt-in; the default changed in #511 step 1.
