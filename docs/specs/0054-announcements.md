# 0054 Announcements: an Installation or a Workspace tells everyone one plain line, for a while

**Status:** in progress (tickets 1 to 4 and 7 built; 5 and 6 to come). **Ticket:** tracking issue #1084, tickets #1085, #1086, #1087, #1088, #1089, #1090, #1091 (the owner's decisions, 2026-11-24).

**Progress, ticket 2 done:** the Announcements section of the Installation settings (`apps/web/src/app/installation/announcements.tsx`): the list, a side panel to add or change (fields of the spec, character count, preview drawn by the shell's own `AnnouncementWords`), switch off or on, and delete behind a confirmation; times are typed and shown in the browser's time zone, named beside the field; the five audit kinds have words under Changes; the four server actions are classified as outside the demo; the user guide chapter 18 has the section. The shell does not yet show the level, so the preview shows it as a word beside the line until ticket 3.

## Problem Statement

An operator who is about to take Ziffr down for maintenance, or a Workspace admin who wants their team to read one thing, has no way to say it inside the app. Today the only Announcement is the demo's reset notice, fixed in code. The mechanism is built (the Announcement line, pull request #1083, branch `announcement-line`); what is missing is that people can write Announcements themselves, with a window in time, and that they work the same on ziffr.net and on a self-hosted Installation.

## Solution

An **Announcement** is one plain line shown on every screen of the app (the phone included) until the person dismisses it; it comes back with every sign-in or fresh session. The word, its glossary entry and the line itself come from #1083; this spec adds who may write them.

1. **Installation Announcements**, managed only by Installation Admins in the Installation settings: a list with add, edit, switch off and delete. Fields: the **text** (plain, at most 280 characters), an optional **link** (https only, with a label), a **level** (info or warning), an optional **start** and **end** (so a maintenance window can be announced a day ahead and goes by itself), the **audience** (everyone, or the demo only), **public** (also shown on the sign-in page), and **cannot be dismissed** (for a maintenance window that is running). Several active ones show one after the other, most urgent first (warning before info, then the earlier start); each can be dismissed on its own for the session unless it cannot be dismissed. It works the same on ziffr.net and on a self-hosted Installation.
2. **The demo's reset notice** becomes a built-in Installation Announcement that cannot be deleted or edited and shows whenever the interactive demo is on (spec 0051). It keeps its countdown.
3. **Workspace Announcements**, managed only by the Admins of that Workspace in its settings: the same fields without public and audience. Shown only to people of that Workspace, never on the sign-in page. An Admin of one Workspace cannot read or change another's. Installation Announcements always rank above Workspace ones.
4. **The sign-in page** shows the public Announcements that are active now, with text, link and level and nothing else: nothing about people, Workspaces or the Installation's settings.

## User Stories

1. As an operator, I want to announce tomorrow's maintenance today and have it vanish on its own, so that I do not have to remember to remove it.
2. As an operator, I want people who cannot sign in to still read that it is down on purpose, so that they do not write to me.
3. As an operator, I want the running maintenance notice to stay, so that nobody dismisses it and then wonders why saving fails.
4. As an operator of a self-hosted Installation, I want the same, with no service of ours involved.
5. As a Workspace admin, I want to tell my team one thing (a new Due Date, a changed Metric) without email, and to see that it reaches only my team.
6. As a person, I want an Announcement to be one line I can dismiss, never a pop-up and never markup.
7. As a demo visitor, I want to see the demo notice, and no visitor can write an Announcement.

## Implementation Decisions

### Words

**Announcement** is the term from #1083; use its glossary entry and extend it in the ticket that builds the first table: who writes one (an Installation Admin or a Workspace Admin), the window, the level and the sign-in page. Avoid _Banner_, _notification_, _toast_ as there. If #1083 has not merged when ticket 1 starts, ticket 1 waits for it rather than adding a second entry. Translations are not part of this spec: the text is shown as written.

### Data

- Two tables, `installation_announcements` and `workspace_announcements` (the second keyed by Workspace), each with: id, text, link (https URL and label, both optional), level (`info` | `warning`), `starts_at`, `ends_at` (nullable, `ends_at` after `starts_at`), `active` (the switch), `dismissible`, who created and last changed it, and the times. The Installation table also has `audience` (`everyone` | `demo`) and `public`. The built-in demo notice is not a row: it stays computed from the Installation (as #1083 does) and joins the list in the core, so no write can change or delete it.
- Caps on the server: text 1 to 280 characters, link label up to 40, URL up to 500 and `https:` only (parsed, no credentials in it, never `javascript:` or `data:`); at most **20 active** Installation Announcements and **10 active** per Workspace (checked in the same transaction as the write, so two writes cannot both pass).
- **Plain text only.** The text is stored and sent as text and rendered as a text node, never as HTML or markdown; control and bidirectional characters are removed on write.

### Core

- All reads and writes are functions in `packages/core` with the `Actor` first. Installation operations check Installation Admin in the core; Workspace operations check the Workspace and the Admin role in the core. The page and the server action never query a table.
- `activeAnnouncementsFor(actor)` returns, for the shell, the ordered list of what this person may see now: Installation ones that match the audience, then those of the person's current Workspace, each reduced to id, text, link, level and dismissible. A short-lived cache is fine; the end of a window must show within a minute.
- `publicAnnouncements()` is the only unauthenticated read: a narrow query of rows that are public, active and inside their window, returning text, link and level, at most the cap. It is called from the sign-in page and from nothing else, and a test fails if another column can reach it.
- Changes are written to the audit trail next to the change, as other governance events are: Installation changes to the Installation's audit, Workspace changes to that Workspace's Audit Log (who, what kind, the Announcement's text at the time; no more). New audit kinds go into `audit-kinds.ts` with its test.

### Safety and the demo

- Row level security and grants like the other tables: no direct table access for browsers; the service role's writes are revoked where the repository's convention does so for governance tables.
- Both tables are classified for the demo as **closed** (`demo_closed_tables`): a visitor never writes one, and `demo_unclassified_tables()` stays empty. There is no demo seed; the built-in notice is enough.
- Data from the browser (text, link, dates, flags) is validated again on the server; ids are checked against the Workspace; no filter is built from strings.
- The sign-in page and the shell carry only what the line shows (AGENTS.md rule 3); a comment says so.

### The line

- #1083's mechanism takes a list, so ordering, per-item dismissal and the non-dismissible case are changes to it, not a second mechanism. A dismissal is kept per visit as there; a non-dismissible Announcement shows no button. The level is carried by an icon and a word ("Warning"), never by colour alone.
- On the sign-in page there is no visit to dismiss in, so a public Announcement there is simply shown.

## Testing Decisions

- Database tests (`*.db.test.ts`) for both tables: only an Installation Admin writes Installation rows; only an Admin of that Workspace writes its rows; a member and an Admin of another Workspace are refused; the caps (text, count of active, link rules); the window (not yet, active, past); a Workspace Announcement is never in another Workspace's list; the public read returns only public, active, in-window rows and only three fields; a demo visitor cannot write; the built-in notice cannot be deleted.
- Pure tests for the link and text rules and the ordering.
- A component test that the order is Installation before Workspace, warning before info, and that a non-dismissible one has no button.
- Audit tests: each change leaves one event with the actor.

## Tickets

1. **Installation Announcements: table, core functions and database tests.** Migration (add-only), the rules, the audit kinds, the demo classification, `publicAnnouncements()`. First (and after #1083 is merged). **Needs an Opus security review** (visibility, untrusted input, an unauthenticated read).
2. **The Installation settings screen:** a section with the list and the add, edit, switch off and delete forms, and the user guide chapter (`docs/user-guide/18-installation-settings.md`). Blocked by 1.
3. **Show them in the shell and on the sign-in page:** extend #1083's mechanism (ordering, per-item dismissal, non-dismissible) and read the public ones on the sign-in page. Blocked by 1 and #1083. **Needs an Opus security review for the sign-in part** (what an unauthenticated visitor can read).
4. **The built-in demo notice joins the list** (cannot be deleted, shows whenever the interactive demo is on, keeps its countdown). Blocked by 3 and #1083.
5. **Workspace Announcements: table, core functions and database tests.** Blocked by 1 (it reuses its rules). **Needs an Opus security review** (one Workspace must never reach another).
6. **The Workspace settings screen** and the user guide chapter (`docs/user-guide/16-workspace-settings.md`), and the Workspace ones in the shell (below the Installation ones). Blocked by 3 and 5.
7. **Docs:** a section "Announcing maintenance" in the operator guide (`docs/guides/self-hosting.md`) and a row in the threat model (`docs/security/threat-model.md`). Blocked by 2.

## Out of Scope

- Sending Announcements as email, Slack or Telegram messages.
- Markdown or any rich text, images, buttons.
- Targeting single people or Groups.
- Translations (a later idea: one text per language).
- Repeating schedules (a window is one start and one end).

## Further Notes

The second group (tickets 5 and 6) comes after tickets 1 to 4 are merged, so the Installation level is proven first. The threat model row names what an Announcement can do if an admin account is taken over: put a link in front of everyone. That is why links are https only, labelled, never opened by themselves, and every change is in the audit trail.

Announcement text is stored in clear, not sealed with the Workspace Key, like the names of dashboards: it is plain words meant for every person of the Workspace (or Installation), so sealing it would protect nothing from them, and the sign-in page and the shell read it for people who hold no Workspace Key. Sealing it can be added later if a reason comes.

## Progress

- Ticket 1 (#1085, #1095): table, core functions, `publicAnnouncements()`: merged.
- Tickets 3 and 4 (#1087, #1088): built. The shell reads `activeInstallationAnnouncements({ demo })` (new, takes no person: it reads the Installation only, and a visit in the demo also gets the lines for the demo only), orders them with the built-in demo notice (first where visitors may change the demo, else ranked as an info), keys each dismissal by id and last change, shows three at once with "+N more", and gives a line that cannot be dismissed no button. The sign-in page shows `publicAnnouncements()` through the same component, with no dismissal there (as the spec says). Workspace Announcements (tickets 5 and 6) are not part of this.
- Ticket 7 (#1091): the section "Announcing maintenance" in the operator guide and row 29 of the threat model, for the Installation level. Both are extended when tickets 5 and 6 (Workspace Announcements) are built.
