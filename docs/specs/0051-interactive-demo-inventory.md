# 0051 Inventory: every change a visitor could make in the demo

This is the survey behind [spec 0051](0051-interactive-demo.md), read from the code on 2026-11-23 (`main` at `2499ca04`). It lists every kind of change a person can make in Ziffr, grouped by what it changes, with the server actions of `apps/web/src/app` that make it (the keys of the walk in `apps/web/src/app/demo-read-only.db.test.ts`), how the demo stops it today, what could go wrong if visitors of a **shared, public** demo could make it, and the recommendation.

**How the demo stops a change today:**

- **DB**: the demo guard. Every table with a `workspace_id` has the triggers `zz_demo_read_only_new` and `zz_demo_read_only_old` (migrations `20261225110000_demo_read_only.sql`, `20261225190000_attach_demo_guard.sql`), which raise `ZF4D0` for a row of the demo Workspace unless `ziffr.demo_seed` is on for the transaction or the request carries `x-ziffr-demo-seed: on` with the service role. `profiles`, `away` and `ask_now_claims` have guards of their own for the demo's people and Metrics. The core turns `ZF4D0` into `DemoReadOnly`: "The demo can't be changed." (with "Start a trial…" where trials are offered).
- **Core**: `refuseInDemo(actor)` before the write, for what the database cannot take back (a person outside the demo, a call to Slack or Telegram, an email, a URL that works elsewhere). Used in alerts, calendar links, feeds, fill-in, heads-up state, invitations, limits, make-room, metric owner, packs, pack setup, paste, personal webhooks, pins, quiet hours, record-own-value, retention, share proposals, Slack, tags, team, Telegram, tell, usage digest, webhook log and webhooks.
- **Skip**: the job or sender never acts for the demo: email stays in the Outbox (`mail.ts`), Slack and Telegram never send (`slack-send.ts`, `telegram-send.ts`), the Workflow clock, Heads-up scans, Alerts, auto-Snapshots, Retention, the usage digest, Usage counting and the Audit Log all leave the demo out.
- **UI**: the screen pretends without asking the server: the Analysis Canvas keeps its Metrics in the browser (`analyze/screen.tsx`), the Pin button shows off, the appearance is a cookie.
- **Simulated**: the demo controls preview what a message or an answer would do (`demo-channels.ts`) and save nothing.
- **Outside**: the action acts outside the demo Workspace (sign-in, the Installation, a trial's guide) and is not reached by a visit.

**Risk words used below:** *spam* (words others see: offensive text, links), *outbound* (a message, email, webhook or fetch that leaves Ziffr; SSRF), *cost* (CPU, database time), *growth* (rows and storage), *compute* (an expensive calculation a visitor can repeat), *escalation* (reaching more than the demo or its made-up people), *leak* (something that works or shows outside the demo), *broken seed* (the next visitor finds an empty or wrong demo, or the landing page's examples stop being true).

**Recommendation words:** *open* (visitors may do it; the reset undoes it), *open with limits* (as open, within the limits of spec 0051's **Limits**), *keep blocked* (as today, with the sentence), *keep as is* (it already works in a way that fits).

## Dashboards, widgets and the Pool

| Kind of change | Server actions | Today | Risk if opened | Recommendation |
| --- | --- | --- | --- | --- |
| Create a dashboard | `canvas-actions:createDashboardNamed`, `home-actions:newDashboard`, `dashboard-template-actions:createFromDashboardTemplate` | DB | spam (a name in everyone's list), growth | **open with limits**: 25 made by visitors at once, name 80 characters |
| Rename a dashboard, change its words | `canvas-actions:saveDashboardText` | DB | spam on a seeded dashboard everyone opens; broken seed | **open with limits**: a visitor's own dashboards only; a seeded dashboard keeps its words |
| Place, move, resize, retitle, remove widgets; apply a Widget Template | `canvas-actions:placeWidget`, `saveLayout`, `updateWidget`, `applyTemplate`, `removeWidget` | DB | broken seed (the home dashboard emptied), growth | **open with limits**: 40 widgets per dashboard; the Showcase dashboards (spec 0051) refuse |
| Save a widget to the Pool, delete a saved widget | `canvas-actions:saveToPool`, `deleteSavedWidget` | DB | growth | **open with limits**: 50 saved by visitors |
| Home dashboard, pins | `home-actions:setHome`, `pin-actions:pinDashboard`, `unpinDashboard`, `reorderPinned` | DB (home), core (pins); UI shows the pin off | a made-up person's home and pins are shared by everyone who views as them | **open, kept per visit** in a cookie, as the appearance is; never in the database |
| Themes: edit, duplicate, add a standard one, set the default, set a dashboard's or deck's | `theme-actions:saveTheme`, `duplicateTheme`, `addStandardTheme`, `setDefaultTheme`, `setDashboardTheme`, `setDeckTheme`, `deleteTheme` | DB | broken seed (the default look changed for everyone, unreadable colours) | **open with limits**: a visitor's own Themes and the dashboards and decks they made; the default Theme and seeded Themes refuse |
| Import a Theme file, a Theme's logo | `theme-actions:importTheme` (`themeLogoSource` reads) | DB | upload of a file with an image from outside; spam (a logo everyone sees) | **keep blocked** |
| Add or remove a View Design | `design-actions:addViewDesign`, `removeViewDesign` | DB | untrusted JSON drawn for every visitor | **keep blocked** |
| Named Versions: save, name, restore | `version-actions:saveNamedVersion`, `nameVersion`, `restoreVersion` (`listVersions` reads) | DB | growth; restoring a seeded dashboard to an empty Version (broken seed) | **open with limits**: on a visitor's own dashboards and decks |
| Templates: save a dashboard, widget, slide layout, deck or Workflow as a template; rename, delete; make from a template | `dashboard-template-actions:saveAsDashboardTemplate`, `template-actions:saveTemplate`, `saveSlideLayout`, `renameTemplate`, `deleteTemplate`, `deck-workflow-template-actions:saveAsDeckTemplate`, `createDeckFromTemplate`, `saveAsWorkflowTemplate`, `createWorkflowFromTemplate` (`draftDashboardTemplate` reads) | DB | spam in the Gallery every visitor browses; growth | **open with limits**: 15 made by visitors; seeded templates keep their words and cannot be deleted |
| Analysis Canvas: add, remove, set | `canvas-actions:canvasAdd`, `canvasRemove`, `canvasSet` (`getHistory` reads) | UI: kept in the browser | a made-up person's canvas shared by everyone viewing as them; compute | **keep as is**: per visit, in the browser; the Analyses' own caps apply |

## Decks and Snapshots

| Kind of change | Server actions | Today | Risk if opened | Recommendation |
| --- | --- | --- | --- | --- |
| Make a deck (new, from a dashboard, from a Snapshot), add a widget to a deck | `deck-actions:createDeck`, `convert-actions:makeDeck`, `makeDeckFromSnapshot`, `addToDeck`, `addSnapshotToDeck` (`deckChoices`, `doneAddingToDeck`, `deck-actions:readDeckNumbers`, `deck-actions:deckShareLeftOut` read) | DB | growth (a deck's store is a large JSON), spam | **open with limits**: 15 decks made by visitors, a deck's store at most 512 KB |
| Edit a deck: slides, rename, footer, delete | `deck-actions:saveDeck`, `renameDeck`, `setDeckFooter`, `deleteDeck` | DB | broken seed (the seeded decks the tour opens) | **open with limits**: a visitor's own decks; seeded decks refuse |
| Record a deck export | `deck-actions:noteDeckExport` | nothing (the demo keeps no Audit Log) | none: the export itself happens in the browser | **keep as is** |
| Take a Snapshot | `snapshot-actions:takeSnapshot` | DB | compute (every widget's values computed and kept), growth | **open with limits**: 3 per visit per reset window, one at a time in the whole demo, 20 taken by visitors |
| Snapshot words, show, delete; auto-Snapshots | `snapshot-actions:editSnapshotWords`, `showSnapshot`, `deleteSnapshot`, `setAutoSnapshots` | DB | broken seed ("October in short" is a landing-page example); spam | **open with limits**: a visitor's own Snapshots; seeded ones refuse. `setAutoSnapshots` **keep blocked**: the clock never takes them in the demo, so it would promise what does not happen |

## Metrics, values and their history

| Kind of change | Server actions | Today | Risk if opened | Recommendation |
| --- | --- | --- | --- | --- |
| Define a Metric, a Derived Metric | `actions:createMetric`, `actions:createDerivedMetric` | DB | spam, growth, compute (formulas over many Metrics) | **open with limits**: 15 made by visitors, the formula's existing 500-character cap |
| Change a Metric's description, Sources, owner; archive, restore, delete | `series-actions:updateMetricDetails`, `setMetricSources`, `handOverMetricTo`, `archiveMetric`, `restoreMetric`, `deleteMetric` | DB, core (owner) | spam (a seeded Metric's name is on every dashboard); broken seed (archiving Revenue) | **open with limits**: a visitor's own Metrics fully; a seeded Metric keeps its words and cannot be archived or deleted; its Sources, Target Range and owner may change |
| Enter a value (Record a value, the web form, Ask me now) | `series-actions:recordValue`, `actions:submitWebForm`, `series-actions:askMeNow` | DB, core (record-own-value) | spam (huge or silly numbers on seeded charts), growth | **open with limits**: 200 values per visit per reset window, periods from 24 months back to the current one; Ask me now goes to the Outbox only |
| Paste from a spreadsheet | `paste-actions:recordPaste` (`previewPaste`, `pasteTemplateFile` read) | core | growth, cost (500 values a day in the demo is already the cap) | **open with limits**: the values-per-visit limit, 100 rows per paste |
| Fill in for a submitter | `fill-in-actions:fillInForSubmitter` | core | as entering a value | **open with limits** |
| Answer as a made-up person through the simulated Slack, email or a Prompt | `actions:simulateMessage`, `connector-actions:simulatePromptAnswer`, `simulateReply`, `simulateTicketClose` | Simulated: previews, saves nothing | as entering a value; nothing leaves Ziffr (the channels are simulated) | **open with limits**: the answer is recorded in the demo, as it would be for real; still never sent |
| Approve, send back, Self-check, propose or decide a Correction | `workflow-actions:approveValue`, `sendValueBack`, `confirmOwnValue`, `correctOwnValue`, `proposeValueCorrection`, `actions:decideCorrection` | DB | broken seed (a landing-page example's Correction) | **open with limits**: the Showcase periods refuse; a proposed Correction is a Thread message and counts against the address's share of replies |
| Lock or reopen a period, close a Workflow's period | `workflow-actions:lockPeriod`, `closeWorkflowPeriod` | DB | broken seed (Weekly numbers, week 47, "all in and all locked", is a landing-page example) | **open with limits**: the Showcase periods refuse |
| Target Series, Projections | `series-actions:saveSeriesRows`, `removeSeriesRows` (`sameNamedMetrics` reads) | DB | growth | **open with limits**: 60 rows per call, 24 months either side of today |
| Tags: add, remove, rename, merge, delete | `tag-actions:addTags`, `removeTag`, `renameTag`, `mergeTags`, `deleteTag` (`tagImpact` reads) | core | spam (a Tag on every Metric), broken seed (seeded Tags merged away) | **open with limits**: 20 Tags made by visitors, 40 characters; seeded Tags keep their words and cannot be merged or deleted |
| Retention: set, cancel, for all | `retention-actions:setMetricRetention`, `cancelMetricRetention`, `setWorkspaceRetention`, `applyRetentionToAll` (`previewRetention`, `previewRetentionForAll` compute) | core | broken seed (history condensed); compute (the preview reads every value); the job never runs in the demo, so it would promise what does not happen | **keep blocked** |
| Archive unused Metrics, make room | `usage-actions:archiveUnused`, `size-actions:archiveForRoom` | DB, core | broken seed; the demo counts no Usage and has no Size | **keep blocked** |

## Workflows, questions and tasks

| Kind of change | Server actions | Today | Risk if opened | Recommendation |
| --- | --- | --- | --- | --- |
| Create, change, delete a Workflow; give a Metric a Workflow | `workflow-actions:saveWorkflow`, `deleteWorkflow`, `setMetricWorkflow` | DB | broken seed (Weekly numbers deleted) | **open with limits**: 10 made by visitors; seeded Workflows keep their words and cannot be deleted |
| Run the Workflows now, pretend it is another day | `workflow-actions:runWorkflowsNow`, `runTodayNow`, `connector-actions:askForMissingValues`, `sendDueReminders` | DB | compute (a run walks every Metric and person), growth (Deliveries); outbound is already impossible: the demo's Deliveries stay in the Outbox | **open with limits**: one run a minute in the whole demo, Outbox only |
| Stand-ins, Away | `workflow-actions:setStandIn`, `setAway` | DB (`away` has its people's guard) | broken seed (everyone Away) | **open with limits**: Away at most 30 days, from today to 90 days ahead |
| Questions, Tasks, replies, status, done | `actions:createAction`, `replyToAction`, `setActionStatus`, `canvas-actions:assignInPlace`, `markTaskDone` | DB | spam (words in Threads everyone reads, links) | **open with limits**: 1,000 characters, 30 per visit per window, 300 open in the demo, links drawn as plain text |
| Ask for access, decide it | `access-actions:requestAccess`, `decideAccess` (`whoCanSee` reads) | DB | none beyond the demo's made-up people | **open with limits**: granting a request makes a Share, counted against the address's share of Shares |
| Alerts | `alert-actions:createAlert`, `updateAlert`, `deleteAlert` | core; firing skips the demo | an Alert that never fires promises what does not happen | **keep blocked** for now; open later once Alerts fire into the list (never a message) in the demo |
| Tell (a Workflow's messages to a person) | `tell-actions:setTellStopped` | core | none, little to see | **keep blocked** |
| Heads-ups: not useful, mute, choices | `heads-up-actions:markHeadsUpNotUseful`, `muteHeadsUpMetric`, `unmuteHeadsUpMetric`, `setHeadsUpChoices` | core; scans skip the demo | a made-up person's state shared by everyone viewing as them; `byMessage` promises messages | **keep blocked** |

## People, sharing and what leaves the demo

| Kind of change | Server actions | Today | Risk if opened | Recommendation |
| --- | --- | --- | --- | --- |
| Share a dashboard or Metric with a demo person or Group | `canvas-actions:setShare`, `setGroupShare` | DB | none outside the demo: only its made-up people and Groups; changes what "view as" shows | **open**: it is the visibility the demo is for |
| Groups: create, rename, delete, members | `team-actions:createGroup`, `renameGroup`, `deleteGroup`, `setMember` | DB | spam; broken seed (seeded Groups deleted, so shares vanish) | **open with limits**: 10 made by visitors; seeded Groups keep their words and cannot be deleted |
| Invite, invitation links, resend, revoke, roles, remove a member, domain joining, requests to join | `team-actions:inviteMember`, `resendInvitation`, `inviteEveryone`, `createInviteLink`, `revokeInvitation`, `setHeldRole`, `changeRole`, `removeMemberWithHandover`, `setDomainJoining`, `decideJoin` | DB, core | outbound (invitation email to anyone), escalation (a link that joins a Workspace), broken seed (roles changed, so "view as" is wrong) | **keep blocked** |
| Contacts | `team-actions:addContact`, `removeContact` | core: a person outside the demo | escalation (a profile outside the demo), outbound | **keep blocked** |
| Workspace settings: name, year start, clock, quiet hours, number style, answer languages, Attainment, profile, Settable Limits, email reminders, usage digest | `settings-actions:renameWorkspace`, `setYearStart`, `setWorkspaceQuietHours`, `setNumberStyle`, `setAnswerLanguages`, `setAttainmentMethod`, `setWorkspaceProfile`, `setWorkspaceSettableLimit`, `setEmailReminders`, `setUsageDigestOn`, `team-actions:setWorkspaceClock` | DB, core | spam (the name on every page); broken seed (a moved year start shifts every quarter, another time zone moves today, another number style for everyone) | **keep blocked** |
| One's own settings: profile, quiet hours, Settable Limits | `settings-actions:updateMyProfile`, `setMyQuietHours`, `setMySettableLimit` | DB, core | spam (a made-up person's name on every Thread) | **keep blocked**; `setAppearance` **keep as is** (a cookie) |
| View Links | `view-link-actions:createViewLink`, `setViewLinkNames`, `revokeViewLink`, `fixListsForLink` (`listViewLinks`, `shownSnapshots`, `tagListsToFix` read) | DB | leak: a public address under Ziffr's domain that shows a visitor's words to anyone, without the demo; a page for phishing | **keep blocked** |
| Share Proposals | `share-proposal-actions:confirmProposal`, `declineProposal` | core | made only through the MCP Server, which never reaches the demo | **keep blocked** |
| Calendar Links | `calendar-link-actions:makeCalendarLink`, `setCalendarNoNames`, `revokeCalendarLink` | core; the calendar route refuses the demo | leak: an address that works outside the visit | **keep blocked** |
| Workspace Export and import | `auth-actions:signInAgainForExport`, `workspace-import-actions:openImported` | outside; the export refuses the demo | leak; cost | **keep blocked** |
| Export a Pack (reads), deck export, CSV and pictures | `pack-actions:exportAsPack` | reads | cost only | **keep as is** |
| Feedback and the Feedback Prompt | `feedback-actions:sendFeedback`, `myFeedback`, `feedback-prompt-actions:*` | core: never in the demo | outbound (filed on GitHub), spam | **keep blocked** |

## Connectors, programs and outbound channels

| Kind of change | Server actions | Today | Risk if opened | Recommendation |
| --- | --- | --- | --- | --- |
| Slack: connect, disconnect, link, reminders again | `connector-actions:connectSlack`, `disconnectSlack`, `slackLinkCode`, `slackRemindersAgain`, `unlinkSlack` | DB, core, skip | outbound to a real Slack, escalation (a Workspace's bot token) | **keep blocked** |
| Telegram: on, link, form link, reminders again, unlink | `connector-actions:setTelegram`, `telegramLinkStart`, `telegramFormLinkStart`, `telegramRemindersAgain`, `telegramUnlink` | DB, core, skip | outbound to real chats | **keep blocked** |
| Email reminders again | `connector-actions:emailRemindersAgain` | DB | outbound | **keep blocked** |
| A made-up person's preferred channel | `connector-actions:setPreference` | DB | none: the channels are simulated | **open**: it changes where the Outbox shows the next message |
| Feeds and Feed Keys, a Feed's template download | `feed-actions:createFeed`, `renameFeed`, `deleteFeed`, `createFeedKey`, `revokeFeedKey`, `addFeedToMetric`, `removeFeedFromMetric`, `feed-template-actions:downloadFeedTemplate` | core | escalation: a key in an anonymous visitor's hands lets a program write the shared demo from anywhere, without any of the visit's limits; a Feed's person is a profile | **keep blocked** |
| Access Keys (API, MCP Server) | `key-actions:createKey`, `revokeKey` | DB; the demo has none, and the API refuses a demo key | escalation: scripted writes to the shared demo | **keep blocked** |
| Assistants (OAuth, remote MCP) | `oauth/authorize/actions:answerConsent`, `assistant-actions:disconnectAssistant` | outside, refused during a visit | escalation | **keep blocked** |
| Webhooks, Personal Webhooks | `webhook-actions:*` (7), `personal-webhook-actions:*` (9) | core | outbound to any address (SSRF from the server, spam to others' endpoints) | **keep blocked** |
| Packs: read a file, install, update, uninstall, take an offer, set up; search and install from the Marketplace | `pack-actions:readPack`, `installPack`, `readUpdate`, `updatePack`, `readUninstallPlan`, `uninstall`, `takeOffer`, `searchPacks`, `readFromMarketplace`, `installFromTheMarketplace`, `readMarketplaceUpdatePlan`, `updateFromTheMarketplace`, `pack-setup-actions:packSetup`, `setUpPack` (`themeLogoPreview` reads) | core | outbound (the Marketplace is fetched from the server), upload (a file from outside), growth (a Pack makes many rows at once), compute (checking a Pack) | **keep blocked**; installing one of Ziffr's own start Packs could open later |

## Outside the demo Workspace

| Kind of change | Server actions | Today | Recommendation |
| --- | --- | --- | --- |
| Signing in and out, Workspaces of one's own, invitations, trials and their guide | `auth-actions:*` (8), `try/start/actions:*` (5) | outside; a visit is not a sign-in | **keep as is** |
| The Installation and its settings | `installation-actions:*` (15) | outside: only Installation Admins, who are signed in | **keep as is** |
| Choosing whose view is shown | `actions:setViewer` | a cookie | **keep as is** |
| Billing, Size, Ziffr Cloud | `cloud-api.ts` (no server action) | core: refuses the demo | **keep as is** |
| The API, the MCP Server, Feeds' endpoint, form links of a real Workspace | `/api/v1`, `/mcp` | need a key, which the demo never has | **keep as is** |

## Reads that change nothing

Searching (`search-actions:searchEverything`, `searchStart`), quick looks (`quick-look-actions:metricQuickLook`, `metric-actions-actions:metricActions`, `observation-actions:observationDetailsAction`), previews, `whoCanSee`, `listVersions`, `listViewLinks` and every page. They are open today and stay open; spec 0051's limits on computed views apply to them only where a visitor's own rows make them heavier.

## What the survey found besides

- **The demo's ids change at every reset.** `prototype_reset` deletes the demo Workspace and makes it again, and every row takes a new id from the shared sequences (ADR 0005). Today that happens once a night; at every 15 minutes, any open page with a dashboard's or deck's id in its address would point at nothing. Metrics are found by slug, which stays.
- **The reset is two steps, not one.** `demo_reset` is one transaction under the advisory lock `ziffr-demo-reset`, so a reader sees the old demo or the new one, never half. But `resetDemoWorkspace` then runs pins, Snapshots, the finished period of the close, Filled-in Values and the Outbox through the core, each its own transaction; for those seconds the demo has no Snapshots and an empty Outbox.
- **Stale documentation.** `docs/guides/jobs.md` still says the job resets "as its reset button does" and answers false "when a visitor reset it less than a minute before"; both went with the read-only demo (spec 0029). Spec 0051's documentation ticket corrects it.
- **The demo is on by default on a laptop and off by default on a domain** (`docker/init.mjs`), and an Installation with real Workspaces may offer it beside them (ADR 0005). The public demo at demo.ziffr.net is its own Installation (`ZIFFR_DEMO_ONLY=1`) on a server it shares with other services.
- **The demo's made-up people are shared.** Every visitor who views as Sara is the same Sara: whatever is a person's own (pins, the home dashboard, the Analysis Canvas, Heads-up mutes) would be shared between strangers if it were saved.
