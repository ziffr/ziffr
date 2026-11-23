// What a visitor of the demo may change (GLOSSARY: Demo Mode; spec 0051, ticket 4): the core's own list of every
// server action, in the keys of the demo walk (`apps/web/src/app/demo-read-only.db.test.ts`: the file under `app/`
// and the export, "canvas-actions:placeWidget"), classified as the database's allow-list is (`demo_open_tables`). It is
// pure, so the classification and the test that no action is missing are tried without a database.
//
// Today EVERY change is `blocked`: `demoAllows` says no to all of them, whatever the setting, so the demo is as read-only
// as before. A later ticket (8 to 11) opens an area by moving its keys from `not-yet` to `OPEN` or `LIMITED` here and
// nowhere else; the database's list still has to hold the tables it writes, so a forgotten line refuses a visitor
// and opens nothing. The classification only ever opens what the database would also let through.
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
  "canvas-actions:getHistory",
  "connector-actions:simulatePromptAnswer",
  "connector-actions:simulateReply",
  "connector-actions:simulateTicketClose",
  "convert-actions:deckChoices",
  "convert-actions:doneAddingToDeck",
  "dashboard-template-actions:draftDashboardTemplate",
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
  "installation-actions:makeInboundSecret",
  "installation-actions:makeUsageKey",
  "installation-actions:removeInstallationAdmin",
  "installation-actions:replyTestStatus",
  "installation-actions:revokeUsageKey",
  "installation-actions:saveInstallationSettings",
  "installation-actions:sendTestEmail",
  "installation-actions:setWorkspaceLimit",
  "installation-actions:startReplyTest",
  "installation-actions:startTelegramTest",
  "installation-actions:telegramTestStatus",
  "installation-feedback-actions:approveFeedbackAction",
  "installation-feedback-actions:rejectFeedbackAction",
  "oauth/authorize/actions:answerConsent",
  "settings-actions:setAppearance",
  "try/start/actions:askGuide",
  "try/start/actions:guideValue",
  "try/start/actions:makeN8nKey",
  "try/start/actions:moveGuide",
  "try/start/actions:skipGuide",
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
    "share-proposal-actions:confirmProposal",
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
    "connector-actions:disconnectSlack",
    "connector-actions:emailRemindersAgain",
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
    "settings-actions:updateMyProfile",
    "size-actions:archiveForRoom",
    "team-actions:changeRole",
    "team-actions:decideJoin",
    "team-actions:removeMemberWithHandover",
    "team-actions:setDomainJoining",
    "team-actions:setHeldRole",
    "team-actions:setWorkspaceClock",
    "usage-actions:archiveUnused",
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
  ],
  // The everyday work spec 0051's inventory recommends opening; each later ticket (8 to 11) moves its actions to `OPEN` or `LIMITED`.
  "not-yet": [
    "access-actions:decideAccess",
    "access-actions:requestAccess",
    "actions:createAction",
    "actions:createDerivedMetric",
    "actions:createMetric",
    "actions:decideCorrection",
    "actions:replyToAction",
    "actions:setActionStatus",
    "actions:submitWebForm",
    "canvas-actions:applyTemplate",
    "canvas-actions:assignInPlace",
    "canvas-actions:canvasAdd",
    "canvas-actions:canvasRemove",
    "canvas-actions:canvasSet",
    "canvas-actions:createDashboardNamed",
    "canvas-actions:deleteSavedWidget",
    "canvas-actions:markTaskDone",
    "canvas-actions:placeWidget",
    "canvas-actions:removeWidget",
    "canvas-actions:saveDashboardText",
    "canvas-actions:saveLayout",
    "canvas-actions:saveToPool",
    "canvas-actions:setGroupShare",
    "canvas-actions:setShare",
    "canvas-actions:updateWidget",
    "connector-actions:askForMissingValues",
    "connector-actions:sendDueReminders",
    "connector-actions:setPreference",
    "convert-actions:addToDeck",
    "convert-actions:makeDeck",
    "convert-actions:makeDeckFromSnapshot",
    "dashboard-template-actions:createFromDashboardTemplate",
    "dashboard-template-actions:saveAsDashboardTemplate",
    "deck-actions:createDeck",
    "deck-actions:deleteDeck",
    "deck-actions:renameDeck",
    "deck-actions:saveDeck",
    "deck-actions:setDeckFooter",
    "deck-workflow-template-actions:createDeckFromTemplate",
    "deck-workflow-template-actions:createWorkflowFromTemplate",
    "deck-workflow-template-actions:saveAsDeckTemplate",
    "deck-workflow-template-actions:saveAsWorkflowTemplate",
    "fill-in-actions:fillInForSubmitter",
    "home-actions:newDashboard",
    "home-actions:setHome",
    "paste-actions:recordPaste",
    "pin-actions:pinDashboard",
    "pin-actions:reorderPinned",
    "pin-actions:unpinDashboard",
    "series-actions:archiveMetric",
    "series-actions:askMeNow",
    "series-actions:deleteMetric",
    "series-actions:handOverMetricTo",
    "series-actions:recordValue",
    "series-actions:removeSeriesRows",
    "series-actions:restoreMetric",
    "series-actions:saveSeriesRows",
    "series-actions:setMetricSources",
    "series-actions:updateMetricDetails",
    "snapshot-actions:deleteSnapshot",
    "snapshot-actions:editSnapshotWords",
    "snapshot-actions:showSnapshot",
    "snapshot-actions:takeSnapshot",
    "tag-actions:addTags",
    "tag-actions:deleteTag",
    "tag-actions:mergeTags",
    "tag-actions:removeTag",
    "tag-actions:renameTag",
    "team-actions:addContact",
    "team-actions:createGroup",
    "team-actions:deleteGroup",
    "team-actions:removeContact",
    "team-actions:renameGroup",
    "team-actions:setMember",
    "template-actions:deleteTemplate",
    "template-actions:renameTemplate",
    "template-actions:saveSlideLayout",
    "template-actions:saveTemplate",
    "theme-actions:addStandardTheme",
    "theme-actions:deleteTheme",
    "theme-actions:duplicateTheme",
    "theme-actions:saveTheme",
    "theme-actions:setDashboardTheme",
    "theme-actions:setDeckTheme",
    "theme-actions:setDefaultTheme",
    "version-actions:nameVersion",
    "version-actions:restoreVersion",
    "version-actions:saveNamedVersion",
    "workflow-actions:approveValue",
    "workflow-actions:closeWorkflowPeriod",
    "workflow-actions:confirmOwnValue",
    "workflow-actions:correctOwnValue",
    "workflow-actions:deleteWorkflow",
    "workflow-actions:lockPeriod",
    "workflow-actions:proposeValueCorrection",
    "workflow-actions:runTodayNow",
    "workflow-actions:runWorkflowsNow",
    "workflow-actions:saveWorkflow",
    "workflow-actions:sendValueBack",
    "workflow-actions:setAway",
    "workflow-actions:setMetricWorkflow",
    "workflow-actions:setStandIn",
  ],
};

/** Server actions a visitor may use freely. None yet. */
const OPEN: readonly string[] = [];

/** Server actions a visitor may use within a limit, by the limit's key (a list in the core, ticket 5). None yet. */
const LIMITED: Readonly<Record<string, readonly string[]>> = {};

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
 * refusal point (`refuseInDemo`) asks it; today it is no for every action. */
export function demoAllows(operation: string, settings: Record<string, string | undefined> = settingsInEffectNow()): boolean {
  if (!demoChangesInEffect(settings)) return false;
  const c = CLASSES.get(operation);
  return c?.class === "open" || c?.class === "limited";
}
