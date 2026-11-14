# 0006 Your profile, Workspace settings and the Workspace Profile

**Status:** done. **Tracking issue:** #93 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0006`.

## Problem Statement

Nobody can change their own name or colour: they are set once, at sign-up, from the address. The account menu switches workspaces, adds one and signs out, and that is all. The rest is spread over pages made for something else: Delivery Preferences sit in a table of everyone on Connectors, Away dates in the Team page's group table, "Workspace time" and Access Keys on the Team page. Stopping Prompts by email works only from the link in an email. The workspace's name cannot be changed at all.

Ziffr also knows nothing about the business a workspace belongs to. The Metric Catalog cannot suggest what a B2B software company or a retailer usually tracks, and nothing says which currency the workspace's money is in.

The top bar has nine equal items and the demo's controls; on a phone it takes two rows.

## Solution

- **Your profile** (`/settings/profile`): your name and colour, the email address you signed in with (read only) and signing out.
- **Your Deliveries** (`/settings/deliveries`): your own Delivery Preferences, whether Prompts and reminders reach you by email, and your Away dates.
- **Workspace settings** (`/settings/workspace`), for Owners and Admins to change and everyone else to read: the workspace's name, its time zone and run hour (moved from the Team page), and its Workspace Profile. A side nav on every settings page links to Members and Groups (the Team page), Connectors, Workflows, Sources, Access Keys (moved to `/settings/keys`), Activity and the Audit log (`/audit`, built in its own spec).
- **The Workspace Profile:** industry, segment, country, currency, employee band and revenue band, each picked from a fixed list.
- **Navigation:** the top bar keeps Dashboards, Metrics, Analyze and Decks; Actions becomes an inbox icon with its count; a "Workspace" menu holds the rest; the account menu holds the workspace switcher, your settings and signing out. On a phone one menu button opens all of it. The demo keeps "Viewing as", reset and "Leave the demo" in view.

## User Stories

1. As a member, I want to correct my name, so others see me as I am called, in every workspace I belong to.
2. As a member, I want to pick my colour, so I am told apart in share dialogs and forms.
3. As a member, I want to see which email address I signed in with, so I know where Ziffr's emails go.
4. As a member, I want to choose in one place where questions, tasks, reminders and replies reach me.
5. As a member, I want to stop and restart Prompts and reminders by email from Ziffr itself, not only from an email.
6. As a member, I want to set my Away dates without opening the group table.
7. As an Owner or Admin, I want to rename the workspace.
8. As an Owner or Admin, I want the workspace's time and its people, Connectors, Workflows, keys and Audit log in one settings area.
9. As an Owner or Admin, I want to say what kind of business we are (industry, segment, country, currency, size), so Ziffr can suggest the Metrics such teams track.
10. As a Member or Guest, I want to see the workspace's settings without being able to change them.
11. As anyone, I want a top bar that shows what I use every day and fits on one row on a phone.
12. As a demo visitor, I want to look at every settings page, and keep switching people, resetting and leaving.
13. As a maintainer of the Metric Catalog, I want one core function that says what kind of business the workspace is.

## Implementation Decisions

- **Your name and colour.** `updateMyProfile(actor, { name, color })` in `packages/core/src/profile.ts` changes only the actor's own profile: there is no person id to pass. A name is trimmed, 1 to 80 characters, without control characters; a colour is one of the six people colours (`PERSON_COLORS`) new people get today. Refused in the demo, whose made-up people are shared by every visitor, and for a demo person anywhere. A Contact has no login, so never acts and cannot reach it. A profile is one per person, so the new name shows in every workspace they belong to; the page says so.
- **Your email.** Shown from the signed-in session's proven address (the same rule as sign-in), never editable here: changing it is a sign-in question for later.
- **Stopping email from Ziffr.** `optOutOfEmail(actor)` in `email-opt-out.ts` does what the email's link does for the actor's own workspace, including telling the Metric owners; they are told once a day at most, however often someone switches email off and on (kept in `email_opt_out_notices` and claimed in one statement). `optBackIn` exists. Not in the demo.
- **Your Delivery Preferences and Away dates** reuse `setPreference` and `setAway` as they are (each person sets their own). The Connectors page keeps its table for the team default and for seeing everyone's, and the Team page keeps its Away column, where Owners and Admins set anyone's dates.
- **The workspace's name.** `renameWorkspace(actor, name)` in `workspace-settings.ts`, for Owners and Admins, 1 to 80 characters, not in the demo.
- **The Workspace Profile.** New nullable columns on `workspaces`: `industry`, `segment`, `country` (ISO 3166-1 alpha-2), `currency` (ISO 4217), `employee_band`, `revenue_band`. Each has a check constraint against the same fixed list as the core, so nothing else gets stored even by mistake. The lists live in a pure module, `workspace-profile.ts`, with unit tests:
  - **Industry** (18): `saas`, `ecommerce`, `retail`, `wholesale`, `manufacturing`, `construction`, `real_estate`, `professional_services`, `agency`, `financial_services`, `healthcare`, `education`, `hospitality`, `logistics`, `energy`, `media`, `agriculture`, `other`. The Metric Catalog tags its Metrics with the same industry and segment keys, so it can be filtered by a workspace's profile. A short list a person picks from in one look; finer codes such as NACE are out of scope.
  - **Segment:** `b2b`, `b2c`, `b2b2c`, `public_sector`, `non_profit`.
  - **Country:** every ISO 3166-1 alpha-2 code; names come from the browser (`Intl.DisplayNames`).
  - **Currency:** the active ISO 4217 codes. When a country is picked and no currency was chosen, the country's currency is proposed (`currencyFor(country)`); the person can change it.
  - **Employee band:** `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1000+`.
  - **Revenue band**, a year's revenue in the workspace currency: `<1m`, `1m-10m`, `10m-50m`, `50m-250m`, `250m-1b`, `1b+`.
  - `setWorkspaceProfile(actor, input)` is for Owners and Admins, never in the demo, and checks every field against its list; `null` clears a field. The demo's own Workspace Profile is set by its migration.
- **Reading it.** `workspaceProfile(actor)` returns, for any member of the workspace (a Guest included: it describes the team, not a person):

  ```ts
  type WorkspaceProfile = {
    industry: Industry | null;      // e.g. "saas"
    segment: Segment | null;        // e.g. "b2b"
    country: string | null;         // ISO 3166-1 alpha-2, e.g. "DE"
    currency: string | null;        // ISO 4217, e.g. "EUR"
    employeeBand: EmployeeBand | null; // e.g. "11-50"
    revenueBand: RevenueBand | null;   // e.g. "1m-10m", in `currency`
  };
  ```

  Every field is `null` until someone sets it; a caller suggesting Metrics treats `null` as "any". The Metric Catalog spec reads it; this spec does not change the catalog.
- **No second team concept.** "Teams within the workspace" are Groups: a named set of people that things are shared with. A Group is already what a department or a team is in Ziffr, and the glossary lists "team" under its _Avoid_ words. This spec adds nothing of the kind.
- **Who sees the settings area.** Everyone in the workspace opens it; only Owners and Admins get forms on the workspace pages, others read. The core refuses anyone else whatever the page shows.
- **Navigation.** Main: Dashboards, Metrics, Analyze, Decks. Actions: an inbox icon with the count of what waits for you. "Workspace" menu: Members and Groups, Connectors, Workflows, Sources, Activity, Access Keys, Settings, and the Audit log for Owners and Admins. Account menu: workspace switcher, new workspace, your profile, your Deliveries, sign out. Below the `md` breakpoint one menu button opens all of these; the demo's controls stay in the bar.

## Testing Decisions

- **Your profile:** database tests for renaming and recolouring oneself, refusing empty, long and control-character names and unknown colours, refusing the demo and demo people; nothing about another person changes.
- **Email:** opting out from Ziffr stops Prompts by email like the link does, tells owners once, and opting back in works; not in the demo.
- **The workspace's name and Workspace Profile:** Owners and Admins set them, Members and Guests are refused, the demo is refused, every value outside a list is refused, `null` clears; another workspace never changes. `workspaceProfile` reads only the actor's workspace. The pure lists get unit tests (every country has a currency that is in the currency list).
- **Navigation:** tried in the running app at 1440 and 390 pixels wide, signed in and in the demo.

## Out of Scope

Changing one's email address or sign-in method; avatars from pictures; per-person time zones; the Audit log itself (`/audit`, its own spec); suggesting Metrics from the Workspace Profile (the Metric Catalog spec); formatting money in the workspace currency (Metrics show € today); a second "team" concept beside Groups.

## Further Notes

- `/audit` 404s until the Audit log is merged; the link is shown to Owners and Admins only.
- Moving pieces keeps their behaviour and tests; page wording is polished separately.
