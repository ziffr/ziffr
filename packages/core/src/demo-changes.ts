// What a visitor of the demo may change (GLOSSARY: Demo Mode; spec 0051, ticket 4): the core's own list of every
// server action, in the keys of the demo walk (`apps/web/src/app/demo-read-only.db.test.ts`: the file under `app/`
// and the export, "canvas-actions:placeWidget"), classified as the database's allow-list is (`demo_open_tables`). It is
// pure, so the classification and the test that no action is missing are tried without a database.
//
// Ticket 4 made every change `blocked`; each opening ticket of spec 0051 moves its keys from `not-yet` to `OPEN` or
// `LIMITED` here and nowhere else (ticket 8: the work around a value, recording, approving, locking, the Workflows' run to the
// Outbox, Stand-ins, Away; ticket 9: dashboards, widgets, the Pool, Themes of a visitor's own, Versions and templates; ticket 11: Metrics, Targets, Tags, Questions and Tasks, Shares and Groups among the made-up people, the preferred channel; ticket 10: decks, their templates and slide layouts, and Snapshots). `demoAllows` says no to everything unless the setting is in effect, so with it off the demo is as read-only as
// before. The database's list still has to hold the tables an action writes, so a forgotten line refuses a visitor and
// opens nothing. The classification only ever opens what the database would also let through.
import { demoChangesInEffect } from "./demo-reset-decision";
import { settingsInEffectNow } from "./settings-in-effect";

/** Why a change stays refused in the demo; `not-yet` is everyday work a later ticket of spec 0051 opens. */
export type BlockedReason = "reaches-outside" | "sends" | "changes-what-everyone-sees" | "does-nothing" | "not-yet";

/** How the demo treats one server action: it `reads` or `outside` (never a change to the demo), is `open`, `limited` by
 * the limit named by its key (spec 0051's Limits), or `blocked` with its reason. */
export type DemoClass =
  | { class: "reads" }
  | { class: "outside" }
  | { class: "open" }
  | { class: "limited"; limit: string }
  | { class: "blocked"; reason: BlockedReason };


/** Server actions that only read or preview, and change nothing, so they are never refused. */
const READS: readonly string[] = [
  "access-actions:whoCanSee",
  "actions:simulateMessage",
  "setup/first-metric-actions:checkFirstMetric",
  "setup/actions:readSetupSteps",
  "canvas-actions:getHistory",
  "connector-actions:simulatePromptAnswer",
  "connector-actions:simulateReply",
  "connector-actions:simulateTicketClose",
  "convert-actions:deckChoices",
  "convert-actions:doneAddingToDeck",
  "dashboard-template-actions:draftDashboardTemplate",
  "deck-actions:deckShareLeftOut",
  "deck-actions:readDeckNumbers",
  "metric-actions-actions:metricActions",
  "observation-actions:observationDetailsAction",
  "pack-actions:exportAsPack",
  "pack-actions:themeLogoPreview",
  "paste-actions:pasteTemplateFile",
  "paste-actions:previewPaste",
  "picker-actions:pickerList",
  "picker-actions:pickerRun",
  "quick-look-actions:metricQuickLook",
  "search-actions:searchEverything",
  "search-actions:searchStart",
  "series-actions:sameNamedMetrics",
  "tag-actions:tagImpact",
  "theme-actions:themeLogoSource",
  "version-actions:listVersions",
  "view-link-actions:listViewLinks",
  "view-link-actions:shownSnapshots",
  "view-link-actions:tagListsToFix",
];

/** Server actions that act outside the demo Workspace (signing in, the Installation, a trial's guide) or only choose
 * whose view is shown: a visit does not reach them. */
const OUTSIDE: readonly string[] = [
  "actions:setViewer",
  "auth-actions:acceptInvite",
  "auth-actions:askToJoin",
  "auth-actions:createWorkspace",
  "auth-actions:endMyTrial",
  "auth-actions:sendSignInLink",
  "auth-actions:signInAgainForExport",
  "auth-actions:signInWith",
  "auth-actions:signOut",
  "auth-actions:switchWorkspace",
  "installation-actions:addInstallationAdmin",
  "installation-actions:changeWorkspaceKey",
  "installation-actions:checkTelegram",
  "installation-actions:claimInstallation",
  "installation-actions:createInstallationAnnouncement",
  "installation-actions:deleteInstallationAnnouncement",
  "installation-actions:makeInboundSecret",
  "installation-actions:makeUsageKey",
  "installation-actions:removeInstallationAdmin",
  "installation-actions:replyTestStatus",
  "installation-actions:revokeUsageKey",
  "installation-actions:saveInstallationSettings",
  "installation-actions:sendTestEmail",
  "installation-actions:setInstallationAnnouncementActive",
  "installation-actions:setWorkspaceLimit",
  "installation-actions:startReplyTest",
  "installation-actions:startTelegramTest",
  "installation-actions:telegramTestStatus",
  "installation-actions:updateInstallationAnnouncement",
  "installation-feedback-actions:approveFeedbackAction",
  "installation-feedback-actions:rejectFeedbackAction",
  "oauth/authorize/actions:answerConsent",
  "settings-actions:setAppearance",
  "try/n8n/actions:makeN8nKey",
  "workspace-import-actions:openImported",
];

/** What is refused, by why. */
const BLOCKED: Record<BlockedReason, readonly string[]> = {
  // A person, key, address, file or fetch outside the demo: a profile, a Feed or Access Key, a View Link, a Calendar
  // Link, a Pack, a View Design, a Theme file, feedback filed on GitHub.
  "reaches-outside": [
    "assistant-actions:disconnectAssistant",
    "calendar-link-actions:makeCalendarLink",
    "calendar-link-actions:revokeCalendarLink",
    "calendar-link-actions:setCalendarNoNames",
    "design-actions:addViewDesign",
    "design-actions:removeViewDesign",
    "feed-actions:addFeedToMetric",
    "feed-actions:createFeed",
    "feed-actions:createFeedKey",
    "feed-actions:deleteFeed",
    "feed-actions:removeFeedFromMetric",
    "feed-actions:renameFeed",
    "feed-actions:revokeFeedKey",
    "feed-template-actions:downloadFeedTemplate",
    "feedback-actions:myFeedback",
    "feedback-actions:myFeedbackThread",
    "feedback-actions:replyToMyFeedback",
    "feedback-actions:sendFeedback",
    "key-actions:createKey",
    "key-actions:revokeKey",
    "pack-actions:installFromTheMarketplace",
    "pack-actions:installIncludedPackFile",
    "pack-actions:installPack",
    "pack-actions:readFromMarketplace",
    "pack-actions:readIncludedPackFile",
    "pack-actions:readIncludedUpdatePlan",
    "pack-actions:readMarketplaceUpdatePlan",
    "pack-actions:readPack",
    "pack-actions:readUninstallPlan",
    "pack-actions:readUpdate",
    "pack-actions:searchPacks",
    "pack-actions:takeOffer",
    "pack-actions:uninstall",
    "pack-actions:updateFromTheMarketplace",
    "pack-actions:updateIncludedPackFile",
    "pack-actions:updatePack",
    "pack-setup-actions:packSetup",
    "pack-setup-actions:setUpPack",
    "setup/actions:setUpFromPackInGuide",
    "share-proposal-actions:confirmProposal",
    "team-actions:addContact",
    "team-actions:removeContact",
    "share-proposal-actions:declineProposal",
    "theme-actions:importTheme",
    "view-link-actions:createViewLink",
    "view-link-actions:fixListsForLink",
    "view-link-actions:revokeViewLink",
    "view-link-actions:setViewLinkNames",
  ],
  // Messages: email, Slack, Telegram, an invitation, a Webhook.
  sends: [
    "connector-actions:connectSlack",
    "setup/ways-actions:connectSlackFromGuide",
    "setup/first-metric-actions:askFirstMetric",
    "setup/team-actions:askForMetric",
    "connector-actions:disconnectSlack",
    "connector-actions:emailRemindersAgain",
    "connector-actions:sendScreenLink",
    "connector-actions:sendTestMessage",
    "connector-actions:setTelegram",
    "connector-actions:slackLinkCode",
    "connector-actions:slackRemindersAgain",
    "connector-actions:telegramFormLinkStart",
    "connector-actions:telegramLinkStart",
    "connector-actions:telegramRemindersAgain",
    "connector-actions:telegramUnlink",
    "connector-actions:unlinkSlack",
    "personal-webhook-actions:createPersonalWebhook",
    "personal-webhook-actions:deletePersonalWebhook",
    "personal-webhook-actions:forgetHiddenPersonalMetrics",
    "personal-webhook-actions:removePersonalWebhook",
    "personal-webhook-actions:replacePersonalWebhookSecret",
    "personal-webhook-actions:sendTestPersonalWebhook",
    "personal-webhook-actions:setPersonalWebhookEnabled",
    "personal-webhook-actions:setPersonalWebhooksAllowed",
    "personal-webhook-actions:updatePersonalWebhook",
    "team-actions:createInviteLink",
    "team-actions:inviteEveryone",
    "team-actions:inviteMember",
    "team-actions:resendInvitation",
    "team-actions:revokeInvitation",
    "webhook-actions:createWebhook",
    "webhook-actions:deleteWebhook",
    "webhook-actions:replaceWebhookSecret",
    "webhook-actions:resendWebhookSend",
    "webhook-actions:sendTestWebhook",
    "webhook-actions:setWebhookEnabled",
    "webhook-actions:updateWebhook",
  ],
  // The Workspace's own settings, its people and roles, Retention: what every visitor sees would change for all of them.
  "changes-what-everyone-sees": [
    "setup/actions:saveAboutYou",
    "setup/actions:skipStep",
    "setup/actions:hideSetup",
    "setup/actions:reopenSetup",
    "setup/actions:chooseExplore",
    "setup/first-metric-actions:pickMetric",
    "total-actions:addTotalPart",
    "total-actions:closeTotal",
    "total-actions:createTotal",
    "total-actions:openTotal",
    "total-actions:previewTotalOpening",
    "total-actions:removeTotalPart",
    "total-actions:setTotalPartPeriods",
    "total-actions:setTotalTargets",
    "retention-actions:applyRetentionToAll",
    "retention-actions:cancelMetricRetention",
    "retention-actions:previewRetention",
    "retention-actions:previewRetentionForAll",
    "retention-actions:setMetricRetention",
    "retention-actions:setWorkspaceRetention",
    "settings-actions:renameWorkspace",
    "settings-actions:setAnswerLanguages",
    "settings-actions:setAttainmentMethod",
    "settings-actions:setEmailReminders",
    "settings-actions:setMyQuietHours",
    "settings-actions:setMyBusinessFunction",
    "settings-actions:setMySettableLimit",
    "settings-actions:setNumberStyle",
    "settings-actions:setUsageDigestOn",
    "settings-actions:setWorkspaceProfile",
    "settings-actions:setWorkspaceQuietHours",
    "settings-actions:setWorkspaceSettableLimit",
    "settings-actions:setYearStart",
    "settings-actions:createWorkspaceAnnouncement",
    "settings-actions:updateWorkspaceAnnouncement",
    "settings-actions:setWorkspaceAnnouncementActive",
    "settings-actions:deleteWorkspaceAnnouncement",
    "settings-actions:updateMyProfile",
    "size-actions:archiveForRoom",
    "team-actions:changeRole",
    "team-actions:decideJoin",
    "team-actions:removeMemberWithHandover",
    "team-actions:setDomainJoining",
    "team-actions:setHeldRole",
    "team-actions:setWorkspaceClock",
    "usage-actions:archiveUnused",
    "theme-actions:setDefaultTheme",
  ],
  // Promises what does not happen in the demo (an Alert, a Heads-up, an automatic Snapshot) or records nothing there.
  "does-nothing": [
    "alert-actions:createAlert",
    "alert-actions:deleteAlert",
    "alert-actions:updateAlert",
    "deck-actions:noteDeckExport",
    "feedback-prompt-actions:feedbackPromptShown",
    "feedback-prompt-actions:sayWhatIsMissing",
    "feedback-prompt-actions:stopFeedbackPrompt",
    "heads-up-actions:markHeadsUpNotUseful",
    "heads-up-actions:muteHeadsUpMetric",
    "heads-up-actions:setHeadsUpChoices",
    "heads-up-actions:unmuteHeadsUpMetric",
    "snapshot-actions:setAutoSnapshots",
    "tell-actions:setTellStopped",
    "workflow-actions:runTodayNow",
    // The Setup Guide is for a Workspace of one's own: the demo never shows it, and a person's way of being asked is set on the Delivery settings (`setPreference`).
    "setup/ways-actions:saveAskMeBy",
    "home-actions:setHome",
    "pin-actions:pinDashboard",
    "pin-actions:reorderPinned",
    "pin-actions:unpinDashboard",
    "canvas-actions:canvasAdd",
    "canvas-actions:canvasExplain",
    "canvas-actions:canvasRemove",
    "canvas-actions:canvasSet",
  ],
  // The everyday work spec 0051's inventory recommends opening; each later ticket (8 to 11) moves its actions to `OPEN` or `LIMITED`. Ticket 11
  // leaves two of its own here on purpose: deleting a Metric and handing one over (the hand-over rewrites Shares and open Questions of
  // the seed's people and sends Notices; a deletion removes what dashboards of other visitors may show) wait for a decision of the owner.
  "not-yet": [
    "deck-workflow-template-actions:createWorkflowFromTemplate",
    "deck-workflow-template-actions:saveAsWorkflowTemplate",
    "setup/first-metric-actions:askMeForIt",
    "setup/first-metric-actions:sendFirstValue",
    "series-actions:deleteMetric",
    "series-actions:handOverMetricTo",
    "workflow-actions:deleteWorkflow",
    "workflow-actions:saveWorkflow",
    "workflow-actions:setMetricWorkflow",
  ],
};

/** Server actions a visitor may use freely: they change rows of tables that are open (spec 0051, ticket 9: dashboards,
 * widgets, Versions, Themes, templates) but make no new kind of row beyond a Version. Each is checked by the budget
 * (`checkDemoBudget`) and its words by the text rules (`demo-visitor-words.ts`) in the web app's `attemptAsVisitor`, and
 * the database lets it through only for a demo visit. */
const OPEN: readonly string[] = [
  // Ticket 8: the work around a value.
  "actions:decideCorrection",
  "connector-actions:recordSimulatedTicketClose",
  "series-actions:askMeNow",
  "workflow-actions:approveValue",
  "workflow-actions:closeWorkflowPeriod",
  "workflow-actions:confirmOwnValue",
  "workflow-actions:correctOwnValue",
  "workflow-actions:lockPeriod",
  "workflow-actions:sendValueBack",
  "workflow-actions:setAway",
  "workflow-actions:setStandIn",
  "canvas-actions:applyTemplate",
  "canvas-actions:deleteSavedWidget",
  "canvas-actions:removeWidget",
  "canvas-actions:saveDashboardText",
  "canvas-actions:saveLayout",
  "canvas-actions:updateWidget",
  // Ticket 10: a visitor's own decks and Snapshots (the seed's refuse, in the core and in the database).
  "deck-actions:deleteDeck",
  "deck-actions:renameDeck",
  "deck-actions:saveDeck",
  "deck-actions:setDeckFooter",
  "snapshot-actions:deleteSnapshot",
  "snapshot-actions:editSnapshotWords",
  "snapshot-actions:showSnapshot",
  "template-actions:deleteTemplate",
  "template-actions:renameTemplate",
  "theme-actions:deleteTheme",
  "theme-actions:saveTheme",
  "theme-actions:setDashboardTheme",
  "theme-actions:setDeckTheme",
  "version-actions:nameVersion",
  // Ticket 11: Metrics (archive and restore of a visitor's own, their details and Sources), Targets and Projections removed, Tags,
  // Groups of a visitor's own, a made-up person's preferred channel, and the Threads' status and access requests decided.
  "actions:setActionStatus",
  "connector-actions:setPreference",
  "series-actions:archiveMetric",
  "series-actions:removeSeriesRows",
  "series-actions:restoreMetric",
  "series-actions:setMetricSources",
  "series-actions:updateMetricDetails",
  "tag-actions:deleteTag",
  "tag-actions:mergeTags",
  "tag-actions:removeTag",
  "tag-actions:renameTag",
  "team-actions:deleteGroup",
  "team-actions:renameGroup",
];

/** Server actions a visitor may use within a limit, by the limit's key (`demo-limits.ts`, the same kinds as `demo_limits`):
 * the ones that make rows of a kind that is capped. */
const LIMITED: Readonly<Record<string, readonly string[]>> = {
  // Ticket 8: `values` is the values' row cap (and their periods and a paste's rows); `workflow_run` the one run a minute in the whole demo.
  values: [
    "actions:recordSimulatedMessage",
    "actions:submitWebForm",
    "connector-actions:recordSimulatedPromptAnswer",
    "fill-in-actions:fillInForSubmitter",
    "paste-actions:recordPaste",
    "series-actions:recordValue",
  ],
  workflow_run: [
    "connector-actions:askForMissingValues",
    "connector-actions:sendDueReminders",
    "workflow-actions:runWorkflowsNow",
  ],
  dashboards: [
    "canvas-actions:createDashboardNamed",
    "dashboard-template-actions:createFromDashboardTemplate",
    "home-actions:newDashboard",
  ],
  widgets_per_dashboard: [
    "canvas-actions:placeWidget",
    "version-actions:restoreVersion",
  ],
  saved_widgets: [
    "canvas-actions:saveToPool",
  ],
  decks: [
    "convert-actions:addSnapshotToDeck",
    "convert-actions:addToDeck",
    "convert-actions:makeDeck",
    "convert-actions:makeDeckFromSnapshot",
    "deck-actions:createDeck",
    "deck-workflow-template-actions:createDeckFromTemplate",
  ],
  snapshots: [
    "snapshot-actions:takeSnapshot",
  ],
  templates: [
    "dashboard-template-actions:saveAsDashboardTemplate",
    "deck-workflow-template-actions:saveAsDeckTemplate",
    "template-actions:saveSlideLayout",
    "template-actions:saveTemplate",
  ],
  themes: [
    "theme-actions:addStandardTheme",
    "theme-actions:duplicateTheme",
  ],
  versions: [
    "version-actions:saveNamedVersion",
  ],
  // Ticket 11: `access_requests`.
  access_requests: [
    "access-actions:requestAccess",
  ],
  // Ticket 11: `open_actions`.
  open_actions: [
    "actions:createAction",
    "canvas-actions:assignInPlace",
  ],
  // Ticket 11: `metrics`.
  metrics: [
    "actions:createMetric",
  ],
  // Ticket 11: `derived_metrics`.
  derived_metrics: [
    "actions:createDerivedMetric",
  ],
  // Ticket 11: `thread_messages`.
  thread_messages: [
    "actions:replyToAction",
    "canvas-actions:markTaskDone",
    "connector-actions:recordSimulatedReply",
    "workflow-actions:proposeValueCorrection",
  ],
  // Ticket 11: `shares`.
  shares: [
    "access-actions:decideAccess",
    "canvas-actions:setShare",
    "canvas-actions:setGroupShare",
  ],
  // Ticket 11: `series_rows`.
  series_rows: [
    "series-actions:saveSeriesRows",
  ],
  // Ticket 11: `tags`.
  tags: [
    "tag-actions:addTags",
  ],
  // Ticket 11: `groups`.
  groups: [
    "team-actions:createGroup",
  ],
  // Ticket 11: `group_members`.
  group_members: [
    "team-actions:setMember",
  ],
};

function build(): ReadonlyMap<string, DemoClass> {
  const all = new Map<string, DemoClass>();
  const put = (keys: readonly string[], c: DemoClass) => {
    for (const k of keys) {
      if (all.has(k)) throw new Error(`demo-changes.ts: "${k}" is classified twice.`);
      all.set(k, c);
    }
  };
  put(READS, { class: "reads" });
  put(OUTSIDE, { class: "outside" });
  put(OPEN, { class: "open" });
  for (const [limit, keys] of Object.entries(LIMITED)) put(keys, { class: "limited", limit });
  for (const [reason, keys] of Object.entries(BLOCKED)) put(keys, { class: "blocked", reason: reason as BlockedReason });
  return all;
}
const CLASSES = build();

/** Every server action the classification knows, by key; the walk's test compares it with the actions that exist. */
export function demoOperations(): string[] {
  return [...CLASSES.keys()].sort();
}

/** How the demo treats a server action, or null for one that is not classified (which a test fails on). */
export function demoClassOf(operation: string): DemoClass | null {
  return CLASSES.get(operation) ?? null;
}

/** Whether a visitor's change by this server action may go on: only where visitors may change the demo (the setting in
 * effect) and the action is `open` or `limited`. Anything unknown, blocked, or asked with the setting off is no. The
 * refusal point (`refuseInDemo`) asks it. */
export function demoAllows(operation: string, settings: Record<string, string | undefined> = settingsInEffectNow()): boolean {
  if (!demoChangesInEffect(settings)) return false;
  const c = CLASSES.get(operation);
  return c?.class === "open" || c?.class === "limited";
}
