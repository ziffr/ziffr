# API coverage

Which of the core's operations that change data a program can reach. The REST API reaches them, and the MCP server, which only calls the API, offers some of them as tools. Every operation that changes data and is not reached from `apps/web/src/app/api/v1` is listed here with the reason. `packages/core/src/api-coverage.test.ts` keeps this list true: it fails when an operation is missing, listed though the API now reaches it, or gone. When you add a route for an operation, delete its line; when you add an operation the API does not reach, add one under the reason that fits.

Permission checks (`assert…`, `can…`) are guards, not operations, and are left out by rule, as are functions that only read.

## app-only: the browser's building tools

Decks, Themes, View Designs, the canvas, Packs and the pages that edit them are built by a person at the screen. Programs build Metrics and dashboards through the API.

- `recordDeckExport` (audit-log.ts): Deck export is noted in the Audit Log
- `saveLayout` (dashboards.ts): the dashboard canvas
- `applyTemplate` (dashboards.ts): the dashboard canvas
- `saveToPool` (dashboards.ts): the dashboard canvas
- `deleteSavedWidget` (dashboards.ts): the dashboard canvas
- `setDashboardTheme` (dashboards.ts): Themes
- `canvasAdd` (dashboards.ts): the dashboard canvas
- `canvasRemove` (dashboards.ts): the dashboard canvas
- `canvasSet` (dashboards.ts): the dashboard canvas
- `newDeckFor` (deck-additions.ts): Deck building
- `createDeckFromTemplate` (deck-templates.ts): Deck Templates
- `createDeck` (decks.ts): Deck building
- `saveDeck` (decks.ts): Deck building
- `renameDeck` (decks.ts): Deck building
- `deleteDeck` (decks.ts): Deck building
- `setDeckFooter` (decks.ts): Deck building
- `setDeckTheme` (decks.ts): Deck building
- `setHomeDashboard` (home.ts): choosing one's own home dashboard
- `searchMarketplace` (marketplace.ts): the Marketplace
- `readMarketplacePack` (marketplace.ts): the Marketplace
- `installFromMarketplace` (marketplace.ts): the Marketplace
- `readMarketplaceUpdate` (marketplace.ts): the Marketplace
- `updateFromMarketplace` (marketplace.ts): the Marketplace
- `marketplaceUpdates` (marketplace.ts): the Marketplace
- `saveSeriesRows` (metrics.ts): editing Target Series and Projections in a table (the API has its own)
- `removeSeriesRows` (metrics.ts): editing Target Series and Projections in a table (the API has its own)
- `packSetupOptions` (pack-setup.ts): Packs
- `setUpFromPack` (pack-setup.ts): Packs
- `readPackUpdate` (pack-updates.ts): Packs
- `updatePackFile` (pack-updates.ts): Packs
- `updatePack` (pack-updates.ts): Packs
- `readUninstall` (pack-updates.ts): Packs
- `uninstallPack` (pack-updates.ts): Packs
- `takeNewVersion` (pack-updates.ts): Packs
- `readPackFile` (packs.ts): Packs
- `previewPack` (packs.ts): Packs
- `installPackFile` (packs.ts): Packs
- `installPack` (packs.ts): Packs
- `previewValues` (paste-values.ts): pasting a table of values (the API takes values one by one)
- `recordPastedValues` (paste-values.ts): pasting a table of values (the API takes values one by one)
- `editSnapshotWords` (snapshots.ts): a Snapshot's words, showing it and deleting it stay with people (programs take and read Snapshots)
- `showSnapshot` (snapshots.ts): a Snapshot's words, showing it and deleting it stay with people (programs take and read Snapshots)
- `deleteSnapshot` (snapshots.ts): a Snapshot's words, showing it and deleting it stay with people (programs take and read Snapshots)
- `saveSlideLayout` (templates.ts): saving and managing templates and slide layouts
- `saveDeckTemplate` (templates.ts): saving and managing templates and slide layouts
- `saveWorkflowTemplate` (templates.ts): saving and managing templates and slide layouts
- `saveTemplate` (templates.ts): saving and managing templates and slide layouts
- `saveDashboardTemplate` (templates.ts): saving and managing templates and slide layouts
- `renameTemplate` (templates.ts): saving and managing templates and slide layouts
- `deleteTemplate` (templates.ts): saving and managing templates and slide layouts
- `nameVersion` (version-history.ts): a page's version history
- `saveNamedVersion` (version-history.ts): a page's version history
- `restoreVersion` (version-history.ts): a page's version history
- `addViewDesign` (view-designs.ts): View Designs
- `removeViewDesign` (view-designs.ts): View Designs
- `saveTheme` (workspace-themes.ts): Themes
- `duplicateTheme` (workspace-themes.ts): Themes
- `deleteTheme` (workspace-themes.ts): Themes
- `setDefaultTheme` (workspace-themes.ts): Themes

## app-only: a person's own settings and channels

Acts as the person, with their own sign-in, Slack or Telegram account or email address.

- `askMeNow` (ask-now.ts): asking for one's own open Questions now
- `approveConnection` (assistant-connections.ts): one's own assistant connections
- `disconnectMine` (assistant-connections.ts): one's own assistant connections
- `makeCalendarLink` (calendar-links.ts): one's own Calendar Link
- `setCalendarNoNames` (calendar-links.ts): one's own Calendar Link
- `revokeCalendarLink` (calendar-links.ts): one's own Calendar Link
- `optOutOfEmail` (email-opt-out.ts): one's own email choices
- `optBackIn` (email-opt-out.ts): one's own email choices
- `setTellStopped` (tell.ts): one's own "stop telling me" setting
- `updateMyProfile` (profile.ts): one's own profile
- `setPreference` (questions.ts): one's own reminder channel
- `startSlackLink` (slack-people.ts): linking oneself to Slack
- `slackOptBackIn` (slack-people.ts): linking oneself to Slack
- `unlinkSlack` (slack-people.ts): linking oneself to Slack
- `startTelegramLink` (telegram-people.ts): linking oneself to Telegram
- `telegramOptBackIn` (telegram-people.ts): linking oneself to Telegram
- `unlinkTelegram` (telegram-people.ts): linking oneself to Telegram
- `setUsageDigest` (usage-digest.ts): one's own usage digest

## app-only: Workspace and Installation administration

Settings an Owner or Installation Admin makes at the screen. Programs with a key do not change who runs the Workspace.

- `createAccessKey` (access-keys.ts): Access Keys: a key must not make or end keys
- `revokeAccessKey` (access-keys.ts): Access Keys: a key must not make or end keys
- `setAutoSnapshots` (auto-snapshots.ts): Workspace settings
- `createFeed` (feeds.ts): Feeds and their keys are set up by a person in Settings
- `renameFeed` (feeds.ts): Feeds and their keys are set up by a person in Settings
- `deleteFeed` (feeds.ts): Feeds and their keys are set up by a person in Settings
- `createFeedKey` (feeds.ts): Feeds and their keys are set up by a person in Settings
- `revokeFeedKey` (feeds.ts): Feeds and their keys are set up by a person in Settings
- `setYearStart` (fiscal-year.ts): Workspace settings
- `claimInstallation` (installation-admins.ts): claiming the Installation's first admin seat
- `addInstallationAdmin` (installation-admins.ts): Installation administration
- `removeInstallationAdmin` (installation-admins.ts): Installation administration
- `makeInboundSecret` (installation-replies.ts): Installation settings
- `inboundMx` (installation-replies.ts): Installation settings
- `startReplyTest` (installation-replies.ts): Installation settings
- `replyTestStatus` (installation-replies.ts): Installation settings
- `installationSettingsView` (installation-settings.ts): Installation settings
- `saveInstallationSettings` (installation-settings.ts): Installation settings
- `checkTelegram` (installation-settings.ts): Installation settings
- `sendTestEmail` (installation-settings.ts): Installation settings
- `startTelegramTest` (installation-telegram-test.ts): Installation settings
- `telegramTestStatus` (installation-telegram-test.ts): Installation settings
- `makeUsageKey` (installation-usage.ts): Installation settings
- `revokeUsageKey` (installation-usage.ts): Installation settings
- `archiveForRoom` (make-room.ts): making room when a limit is reached
- `startSlackInstall` (slack-connection.ts): the Slack connection
- `finishSlackInstall` (slack-connection.ts): the Slack connection
- `disconnectSlack` (slack-connection.ts): the Slack connection
- `slackConnection` (slack-connection.ts): the Slack connection
- `telegramConnection` (telegram-connection.ts): the Telegram connection
- `setTelegramEnabled` (telegram-connection.ts): the Telegram connection
- `trialGuide` (trial-guide.ts): a Trial's guide
- `saveTrialGuide` (trial-guide.ts): a Trial's guide
- `finishTrialGuide` (trial-guide.ts): a Trial's guide
- `askTrialGuide` (trial-guide.ts): a Trial's guide
- `trialGuideValue` (trial-guide.ts): a Trial's guide
- `makeGuideFeedKey` (trial-guide.ts): a Trial's guide
- `workspaceUsage` (usage-report.ts): the Usage page
- `archiveMetrics` (usage-report.ts): the Usage page
- `createWebhook` (webhooks.ts): Webhooks settings (#401)
- `listWebhooks` (webhooks.ts): Webhooks settings (#401)
- `updateWebhook` (webhooks.ts): Webhooks settings (#401)
- `replaceWebhookSecret` (webhooks.ts): Webhooks settings (#401)
- `setWebhookEnabled` (webhooks.ts): Webhooks settings (#401)
- `deleteWebhook` (webhooks.ts): Webhooks settings (#401)
- `sendTestWebhook` (webhook-log.ts): Webhooks settings (#401)
- `resendWebhookSend` (webhook-log.ts): Webhooks settings (#401)
- `setWorkspaceClock` (workspace-clock.ts): Workspace settings
- `workspaceLimitRows` (workspace-limits-admin.ts): Installation limits
- `setWorkspaceLimit` (workspace-limits-admin.ts): Installation limits
- `renameWorkspace` (workspace-settings.ts): Workspace settings
- `setWorkspaceProfile` (workspace-settings.ts): Workspace settings
- `setNumberStyle` (workspace-settings.ts): Workspace settings
- `setAnswerLanguages` (workspace-settings.ts): Workspace settings
- `setAttainmentMethod` (workspace-settings.ts): Workspace settings
- `sizeAndUsage` (workspace-usage.ts): the Usage page
- `metricsOfLimit` (workspace-usage.ts): the Usage page

## app-only: what a page reads

Reads for a screen that also note that something was seen or logged; the API has its own reads.

- `auditLog` (audit-log.ts): the Audit Log page and its export
- `exportAuditLog` (audit-log.ts): the Audit Log page and its export
- `metricHistory` (dashboards.ts): the history page
- `connectorsView` (page-data.ts): what a page reads
- `sourcesView` (page-data.ts): what a page reads
- `teamView` (page-data.ts): what a page reads
- `actionThread` (page-data.ts): what a page reads
- `periodRecord` (period-record.ts): the period page
- `calendarEntries` (schedule.ts): the schedule page
- `search` (search.ts): the search page

## keys-only: needs a person's check

To come through the API only, behind a scope of their own, never ticked by default and not offered through MCP: text in a Thread must not talk an assistant into approving, sharing or publishing.

- `removeMember` (handover.ts): removing people, #434
- `inviteByEmail` (invitations.ts): inviting and managing people, #434
- `resendInvitation` (invitations.ts): inviting and managing people, #434
- `createInviteLink` (invitations.ts): inviting and managing people, #434
- `revokeInvitation` (invitations.ts): inviting and managing people, #434
- `setRole` (invitations.ts): inviting and managing people, #434
- `setJoinDomain` (invitations.ts): inviting and managing people, #434
- `decideJoinRequest` (invitations.ts): inviting and managing people, #434
- `share` (sharing.ts): Shares, access requests, #434
- `shareWithGroup` (sharing.ts): Shares, access requests, #434
- `whoCanSee` (sharing.ts): who can see an item, a person's question, #434
- `requestAccess` (sharing.ts): Shares, access requests, #434
- `decideAccess` (sharing.ts): Shares, access requests, #434
- `decideCorrection` (submissions.ts): deciding a proposed Correction is an approval, #427
- `createGroup` (team.ts): Groups and contacts, #434
- `renameGroup` (team.ts): Groups and contacts, #434
- `deleteGroup` (team.ts): Groups and contacts, #434
- `setGroupMember` (team.ts): Groups and contacts, #434
- `addContact` (team.ts): Groups and contacts, #434
- `removeContact` (team.ts): Groups and contacts, #434
- `lockPeriod` (workflows.ts): locking a period, #427
- `setStandIn` (workflows.ts): Stand-ins decide who approves, #427
- `setAway` (workflows.ts): being away hands approvals to a Stand-in, #427

## planned: coming to the API

Ticketed. MCP follows where the ticket says so.

- `ask` (questions.ts): Questions and Tasks for programs, #427
- `createWorkflowFromTemplate` (workflow-templates.ts): Workflows for programs, #433
- `saveWorkflow` (workflows.ts): Workflows for programs, #433
- `deleteWorkflow` (workflows.ts): Workflows for programs, #433
- `setMetricWorkflow` (workflows.ts): Workflows for programs, #433
- `runTodayNow` (workflows.ts): running a Workflow now, with Workflows for programs, #433
- `closeWorkflowPeriod` (workflows.ts): closing a period, with Workflows for programs, #433

## internal: not for programs

Plumbing the core's other operations use, jobs the schedule runs, and the demo.

- `applyWebhookAction` (webhook-inbound.ts): a Webhook's own signed route, `POST /api/webhooks/{id}/in`, not an Access Key's
- `askMeNowBy` (ask-now.ts): used by the Connectors' reply handling
- `handover` (cloud-api.ts): hands a Workspace over, for Ziffr Cloud
- `simulateMessage` (demo-channels.ts): the demo's pretend channels
- `simulatePromptAnswer` (demo-channels.ts): the demo's pretend channels
- `sendDueReminders` (questions.ts): what the schedule runs; the button asks for it now
- `askForMissingValues` (questions.ts): what the schedule runs; the button asks for it now
- `noticeEffectsFor` (sharing.ts): what the Share functions use to tell people
- `endTrialNow` (trial-end.ts): ends a Trial Workspace
- `trialValuesCsv` (trial-end.ts): ends a Trial Workspace
- `seedTrialWorkspace` (trial-seed.ts): makes a Trial Workspace
- `runWorkflowsAsOf` (workflows.ts): what the schedule runs
- `newMetricRefusal` (workspace-limits.ts): what the Metric functions use to refuse at a limit

