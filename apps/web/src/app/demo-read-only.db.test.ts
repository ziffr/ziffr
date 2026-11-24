// Demo Mode is read-only (spec 0029, #271; GLOSSARY: Demo Mode): every server action, run during a demo visit as one
// of the demo's made-up people, refuses with the one sentence and changes no row. The table below names every export
// of every "use server" file, so a new action fails here until someone says what it does in the demo. The database's
// own refusal and the seed are tested in the core (packages/core/src/demo-read-only.db.test.ts).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { demoReadOnlyWords } from "@ziffr/core/demo";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { STANDARD_THEMES } from "@ziffr/core/standard-themes";
import { themeToFile } from "@ziffr/core/theme-file";
import { demoBackToSeed, demoFingerprint, demoFullSeed, demoGeneration, demoLatestId, demoOpenForVisitors, demoWalkIds } from "@ziffr/core/test/demo-walk";
import { demoAllows, demoClassOf } from "@ziffr/core/demo-changes";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// A demo visit as Sara, the demo's Owner, who may try everything a role allows.
const jar = vi.hoisted(() => ({ "ziffr-demo": { value: "1" }, "ziffr-viewer": { value: "sara" } } as Record<string, { value: string }>));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => jar[name], set: () => {}, delete: () => {}, getAll: () => [] }),
  headers: async () => new Headers({ host: "ziffr.test", "x-forwarded-for": "203.0.113.9" }),
}));

const APP = join(__dirname);
const files = (function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) && /^\s*["']use server["']/.test(readFileSync(p, "utf8")) ? [p] : [];
  });
})(APP);

/** A small Pack of one Metric, for installing one in the demo. */
const PACK = JSON.stringify({
  format: "ziffr.pack/1", id: "visitor/one-metric", name: "One metric", version: "1.0.0", summary: "One Metric.", author: { name: "A visitor" },
  license: "CC-BY-4.0", ziffr: ">=0.11", contents: { metrics: [{ key: "visits", metric: { format: "ziffr.metric/1", name: "Site visits", period: "month", aggregation: "sum", polarity: "higher" } }] },
});

/** The demo's ids the actions are called with, read once. */
type Ids = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- ids and seed objects of every shape
let ids: Ids = {};
const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const day = (n = 0) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// What each action is called with, or why it is not a change to the demo: it reads, it acts outside the demo
// Workspace (signing in, the Installation, a trial's guide), or only chooses whose view is shown.
// `nothing`: in the seeded demo there is nothing for it to change (no such row), so it answers before any write; the
// rows are checked all the same.
// `blocked`: refused with the sentence and no row changes. `open`: succeeds and some row of the demo changes (none yet: a
// later ticket of spec 0051 moves an action here and in demo-changes.ts together). The class must agree with demo-changes.ts.
type Case = { blocked: (i: Ids) => unknown[] } | { open: (i: Ids) => unknown[]; nothing?: string } | { reads: (i: Ids) => unknown[] } | { nothing: string; blocked: (i: Ids) => unknown[] } | { outside: string };
const CASES: Record<string, Case> = {
  "access-actions:whoCanSee": { reads: (i) => ["dashboard", i.dashboard] },
  "access-actions:requestAccess": { blocked: (i) => ["dashboard", i.otherDashboard] },
  "access-actions:decideAccess": { nothing: "the demo holds no access request to decide", blocked: () => [1, true] },
  "actions:setViewer": { outside: "chooses whose view is shown: a cookie, no row" },
  "actions:createMetric": { blocked: () => [form({ name: "Visitor metric", period: "month", format: "number", submission_rule: "overwrite", polarity: "higher", aggregation: "sum", decimals: "0", sources: "web_form" })] },
  "actions:createDerivedMetric": { blocked: () => [null, form({ name: "Visitor calculation", formula: "{revenue} * 2" })] },
  "actions:simulateMessage": { reads: () => [{ source: "slack", sender: "@sara", text: "closed 2 deals" }] },
  "actions:submitWebForm": { blocked: (i) => [i.formCode, null, form({ value: "42" })] },
  "actions:createAction": { blocked: (i) => [{ metricId: i.metric, period: i.period, assigneeId: "ben", question: "Why?" }] },
  "actions:replyToAction": { blocked: (i) => [i.action, form({ body: "A reply" })] },
  "actions:decideCorrection": { nothing: "the demo holds no proposed Correction", blocked: (i) => [i.message, true] },
  "actions:setActionStatus": { blocked: (i) => [i.action, "open"] },
  "assistant-actions:disconnectAssistant": { nothing: "the demo has no connected assistants", blocked: () => [1] },
  "auth-actions:sendSignInLink": { outside: "signing in, not the demo Workspace" },
  "auth-actions:signInWith": { outside: "signing in, not the demo Workspace" },
  "auth-actions:signInAgainForExport": { outside: "signs the Owner out to sign in again before a Workspace Export; the demo cannot be exported" },
  "auth-actions:signOut": { outside: "signing out, not the demo Workspace" },
  "workspace-import-actions:openImported": { outside: "opens a Workspace of one's own that an import made, never the demo" },
  "auth-actions:createWorkspace": { outside: "a Workspace of one's own, never the demo; refused during a demo visit" },
  "auth-actions:switchWorkspace": { outside: "chooses one's own Workspace: a cookie" },
  "auth-actions:acceptInvite": { outside: "joins a real Workspace by its invitation" },
  "auth-actions:askToJoin": { outside: "asks to join a real Workspace" },
  "auth-actions:endMyTrial": { outside: "a Trial Workspace, never the demo" },
  "calendar-link-actions:makeCalendarLink": { blocked: () => [{}] },
  "calendar-link-actions:setCalendarNoNames": { nothing: "nobody in the demo has a Calendar Link", blocked: () => [true] },
  "calendar-link-actions:revokeCalendarLink": { nothing: "nobody in the demo has a Calendar Link", blocked: () => [] },
  "canvas-actions:placeWidget": { open: (i) => [i.dashboard, { type: "metric", id: i.metric }] },
  "canvas-actions:saveDashboardText": { open: (i) => [i.dashboard, { name: "Renamed by a visitor" }] },
  "canvas-actions:saveLayout": { open: (i) => [i.dashboard, [{ i: String(i.widget), x: 0, y: 0, w: 4, h: 3 }]] },
  "canvas-actions:updateWidget": { open: (i) => [i.widget, { title: "Retitled" }] },
  "canvas-actions:applyTemplate": { open: (i) => [i.widget, i.template, [[i.metric]]] },
  "canvas-actions:removeWidget": { open: (i) => [i.widget] },
  "canvas-actions:saveToPool": { open: (i) => [{ type: "widget", id: i.widget }, "Pooled"] },
  "canvas-actions:deleteSavedWidget": { open: (i) => [i.savedWidget] },
  "canvas-actions:createDashboardNamed": { open: () => ["Visitor dashboard"] },
  "canvas-actions:setShare": { blocked: (i) => ["dashboard", i.dashboard, "ben", "editor"] },
  "canvas-actions:setGroupShare": { blocked: (i) => ["dashboard", i.dashboard, i.group, "viewer"] },
  "canvas-actions:canvasAdd": { blocked: (i) => [[i.metric]] },
  "canvas-actions:canvasRemove": { nothing: "nothing is on the demo's analysis canvas to remove", blocked: (i) => [i.metric] },
  "canvas-actions:canvasSet": { blocked: (i) => [[i.metric]] },
  "canvas-actions:canvasExplain": { nothing: "nothing is on the demo's analysis canvas to mark", blocked: (i) => [i.metric] },
  "canvas-actions:getHistory": { reads: (i) => [i.metric] },
  "picker-actions:pickerList": { reads: (i) => [[i.metric]] },
  "picker-actions:pickerRun": { reads: (i) => [{ entry: "forecast", slots: { metric: [i.metric] } }] },
  "canvas-actions:assignInPlace": { blocked: (i) => [{ metricId: i.metric, period: i.period, assigneeId: "ben", kind: "task", text: "Check this" }] },
  "canvas-actions:markTaskDone": { nothing: "Sara has no open task in the demo", blocked: (i) => [i.task] },
  "connector-actions:sendTestMessage": { blocked: () => ["email"] },
  "connector-actions:setTelegram": { blocked: () => [true] },
  "connector-actions:telegramLinkStart": { blocked: () => [] },
  "connector-actions:telegramFormLinkStart": { nothing: "Telegram is off in the demo", blocked: (i) => [i.formCode] },
  "connector-actions:telegramRemindersAgain": { nothing: "nobody in the demo stopped Telegram reminders", blocked: () => [] },
  "connector-actions:telegramUnlink": { nothing: "nobody in the demo is linked to Telegram", blocked: () => [] },
  "connector-actions:emailRemindersAgain": { nothing: "nobody in the demo stopped email reminders", blocked: () => [] },
  "connector-actions:connectSlack": { blocked: () => [] },
  "connector-actions:disconnectSlack": { blocked: () => [] },
  "connector-actions:slackLinkCode": { nothing: "Slack is not connected in the demo", blocked: () => [] },
  "connector-actions:slackRemindersAgain": { nothing: "nobody in the demo stopped Slack reminders", blocked: () => [] },
  "pin-actions:pinDashboard": { blocked: (i) => [i.dashboard] },
  "pin-actions:unpinDashboard": { blocked: (i) => [i.dashboard] },
  "pin-actions:reorderPinned": { blocked: () => [[]] },
  "alert-actions:createAlert": { blocked: (i) => [{ metricId: i.metric, condition: { kind: "at_or_above", value: "1" } }] },
  "alert-actions:updateAlert": { nothing: "the demo has no Alert of the visitor's own", blocked: () => [1, { paused: true }] },
  "alert-actions:deleteAlert": { nothing: "the demo has no Alert of the visitor's own", blocked: () => [1] },
  "tell-actions:setTellStopped": { blocked: () => [1, true] },
  "connector-actions:unlinkSlack": { nothing: "nobody in the demo is linked to Slack", blocked: () => [] },
  "connector-actions:setPreference": { blocked: () => ["sara", "question", "slack"] },
  "connector-actions:simulateReply": { reads: (i) => [i.actionDelivery, "Done, see the sheet"] },
  "connector-actions:simulateTicketClose": { reads: (i) => [i.ticketDelivery] },
  "connector-actions:sendDueReminders": { nothing: "nothing is due right after the seed, which sent the reminders", blocked: () => [] },
  "connector-actions:askForMissingValues": { nothing: "the seed already asked for every missing value", blocked: () => [] },
  "connector-actions:simulatePromptAnswer": { reads: (i) => [i.promptDelivery, "42"] },
  "convert-actions:makeDeckFromSnapshot": { blocked: (i) => [i.snapshot] },
  "convert-actions:makeDeck": { blocked: (i) => [i.dashboard] },
  "convert-actions:deckChoices": { reads: () => [] },
  // Clears this browser's own Add to deck… cookie; nothing of the demo.
  "convert-actions:doneAddingToDeck": { reads: () => [] },
  // Onto a new deck: making it is the change refused.
  "convert-actions:addToDeck": { blocked: (i) => [i.widget, null, null] },
  "dashboard-template-actions:createFromDashboardTemplate": { open: (i) => ["overview", "From a template", [[i.metric], [i.metric], [i.metric], [i.metric]]] },
  "dashboard-template-actions:draftDashboardTemplate": { reads: (i) => [i.dashboard] },
  "dashboard-template-actions:saveAsDashboardTemplate": { open: (i) => [{ dashboardId: i.dashboard, name: "Visitor template", description: "", labels: [] }] },
  "deck-workflow-template-actions:saveAsDeckTemplate": { blocked: (i) => [{ deckId: i.deck, name: "Visitor deck template", description: "", labels: [], choices: {} }] },
  "deck-workflow-template-actions:createDeckFromTemplate": { nothing: "the demo has no Deck Templates", blocked: () => [1, "From a template", []] },
  "deck-workflow-template-actions:saveAsWorkflowTemplate": { blocked: (i) => [{ workflowId: i.workflow, name: "Visitor workflow template", description: "" }] },
  "deck-workflow-template-actions:createWorkflowFromTemplate": { nothing: "the demo has no Workflow Templates", blocked: () => [1, "From a template", []] },
  "deck-actions:createDeck": { blocked: () => [form({ name: "Visitor deck" })] },
  "deck-actions:saveDeck": { blocked: (i) => [i.deck, { store: {}, schema: {} }] },
  "deck-actions:renameDeck": { blocked: (i) => [i.deck, "Renamed deck"] },
  "deck-actions:deleteDeck": { blocked: (i) => [i.deck] },
  "deck-actions:setDeckFooter": { blocked: (i) => [i.deck, "A footer"] },
  "deck-actions:noteDeckExport": { nothing: "it only records an Audit event, and the demo keeps no Audit Log", blocked: (i) => [i.deck, "pdf"] },
  "design-actions:addViewDesign": { blocked: () => [JSON.stringify(BUILT_IN_DESIGNS.number)] },
  "design-actions:removeViewDesign": { nothing: "the demo has no View Designs", blocked: () => [1] },
  "fill-in-actions:fillInForSubmitter": { blocked: (i) => [{ metricId: i.metric, period: "2026-03-01", for: "someone", value: "42" }] },
  "feed-actions:createFeed": { blocked: () => ["Visitor feed"] },
  "feed-actions:renameFeed": { blocked: () => ["feed-x", "Renamed"] },
  "feed-actions:deleteFeed": { blocked: () => ["feed-x"] },
  "feed-actions:createFeedKey": { blocked: () => ["feed-x", { name: "k", expiresOn: day(30) }] },
  "feed-actions:revokeFeedKey": { blocked: () => [1] },
  "feed-actions:addFeedToMetric": { nothing: "the demo has no Feeds", blocked: (i) => [i.metric, "feed-x"] },
  "feed-template-actions:downloadFeedTemplate": { nothing: "the demo has no Feeds", blocked: (i) => [{ template: "google-sheets", metrics: [i.metric], feedId: null, newFeedName: "x", makeKey: false }] },
  "feed-actions:removeFeedFromMetric": { nothing: "the demo has no Feeds", blocked: (i) => [i.metric, "feed-x"] },
  "feedback-actions:sendFeedback": { nothing: "feedback is hosted Ziffr only, never in the demo, and the core refuses a demo actor", blocked: () => [{ kind: "idea", words: "More charts", route: "/dashboards" }] },
  "feedback-actions:myFeedback": { nothing: "feedback is hosted Ziffr only, never in the demo, and the core refuses a demo actor", blocked: () => [] },
  "feedback-actions:myFeedbackThread": { nothing: "feedback is hosted Ziffr only, never in the demo, and the core refuses a demo actor", blocked: () => ["00000000-0000-0000-0000-000000000000"] },
  "feedback-actions:replyToMyFeedback": { nothing: "feedback is hosted Ziffr only, never in the demo, and the core refuses a demo actor", blocked: () => [{ id: "00000000-0000-0000-0000-000000000000", words: "Thanks" }] },
  "feedback-prompt-actions:feedbackPromptShown": { nothing: "the card is never shown in the demo, and the core refuses a demo actor", blocked: () => [] },
  "feedback-prompt-actions:stopFeedbackPrompt": { nothing: "the card is never shown in the demo, and the core refuses a demo actor", blocked: () => ["never"] },
  "feedback-prompt-actions:sayWhatIsMissing": { nothing: "the card is never shown in the demo, and the core refuses a demo actor", blocked: () => ["More charts"] },
  "home-actions:setHome": { blocked: (i) => [i.dashboard] },
  "home-actions:newDashboard": { open: () => [null, form({ name: "Visitor dashboard" })] },
  "installation-actions:claimInstallation": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:addInstallationAdmin": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:removeInstallationAdmin": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:saveInstallationSettings": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:checkTelegram": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:sendTestEmail": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:startTelegramTest": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:setWorkspaceLimit": { outside: "the Installation, not the demo Workspace" },
  "installation-feedback-actions:approveFeedbackAction": { outside: "the Installation, not the demo Workspace" },
  "installation-feedback-actions:rejectFeedbackAction": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:changeWorkspaceKey": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:makeInboundSecret": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:makeUsageKey": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:revokeUsageKey": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:startReplyTest": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:replyTestStatus": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:telegramTestStatus": { outside: "the Installation, not the demo Workspace" },
  "personal-webhook-actions:createPersonalWebhook": { blocked: () => [{ name: "Visitor hook", url: "https://example.test/hook", events: ["action.done"], metricIds: [] }] },
  "personal-webhook-actions:updatePersonalWebhook": { blocked: () => ["00000000-0000-4000-8000-000000000001", { name: "Renamed" }] },
  "personal-webhook-actions:replacePersonalWebhookSecret": { blocked: () => ["00000000-0000-4000-8000-000000000001"] },
  "personal-webhook-actions:setPersonalWebhookEnabled": { blocked: () => ["00000000-0000-4000-8000-000000000001", false] },
  "personal-webhook-actions:deletePersonalWebhook": { blocked: () => ["00000000-0000-4000-8000-000000000001"] },
  "personal-webhook-actions:forgetHiddenPersonalMetrics": { blocked: () => ["00000000-0000-4000-8000-000000000001"] },
  "personal-webhook-actions:sendTestPersonalWebhook": { blocked: () => ["00000000-0000-4000-8000-000000000001"] },
  "personal-webhook-actions:setPersonalWebhooksAllowed": { blocked: () => [true] },
  "personal-webhook-actions:removePersonalWebhook": { blocked: () => ["00000000-0000-4000-8000-000000000001"] },
  "webhook-actions:createWebhook": { blocked: () => [{ name: "Visitor hook", url: "https://example.test/hook", events: ["action.done"] }] },
  "webhook-actions:updateWebhook": { blocked: () => ["00000000-0000-4000-8000-000000000001", { name: "Renamed" }] },
  "webhook-actions:replaceWebhookSecret": { blocked: () => ["00000000-0000-4000-8000-000000000001"] },
  "webhook-actions:setWebhookEnabled": { blocked: () => ["00000000-0000-4000-8000-000000000001", false] },
  "webhook-actions:deleteWebhook": { blocked: () => ["00000000-0000-4000-8000-000000000001"] },
  "webhook-actions:sendTestWebhook": { blocked: () => ["00000000-0000-4000-8000-000000000001"] },
  "webhook-actions:resendWebhookSend": { blocked: () => ["00000000-0000-4000-8000-000000000001"] },
  "key-actions:createKey": { blocked: () => [{ name: "Visitor key", scopes: ["metrics:read"], expiresOn: day(30) }] },
  "key-actions:revokeKey": { nothing: "the demo has no Access Keys", blocked: () => [1] },
  "oauth/authorize/actions:answerConsent": { outside: "connects an assistant to one's own Workspace; refused during a demo visit" },
  "observation-actions:observationDetailsAction": { reads: () => ["revenue", "2026-03-01"] },
  "paste-actions:previewPaste": { reads: () => [{ text: "Revenue\t42" }] },
  "paste-actions:recordPaste": { blocked: () => [{ text: "Revenue\t42" }] },
  "paste-actions:pasteTemplateFile": { reads: () => [{ kind: "rows" }] },
  "quick-look-actions:metricQuickLook": { reads: () => ["revenue"] },
  "metric-actions-actions:metricActions": { reads: () => [["revenue"]] },
  // Reading or fetching a Pack is refused in the demo like a change: it would make work for an anonymous visitor.
  "pack-actions:readPack": { blocked: () => [PACK] },
  "pack-actions:exportAsPack": { reads: (i) => [{ id: "visitor/export", name: "Export", version: "1.0.0", summary: "An export.", author: "A visitor", license: "CC-BY-4.0" }, { metrics: [i.metric] }] },
  "pack-actions:themeLogoPreview": { reads: () => [1] },
  "pack-actions:installPack": { blocked: () => [PACK, { unsigned: true, assistantTexts: true }] },
  "pack-actions:readUpdate": { nothing: "the demo has no Pack installed to update", blocked: () => [1, PACK] },
  "pack-actions:updatePack": { nothing: "the demo has no Pack installed to update", blocked: () => [1, PACK, { unsigned: true, assistantTexts: true }] },
  "pack-actions:readUninstallPlan": { nothing: "the demo has no Pack installed to uninstall", blocked: () => [1] },
  "pack-actions:uninstall": { nothing: "the demo has no Pack installed to uninstall", blocked: () => [1] },
  "pack-actions:searchPacks": { blocked: () => ["saas"] },
  "pack-actions:readFromMarketplace": { blocked: () => ["ziffr/saas-metrics", "1.0.0"] },
  "pack-actions:installFromTheMarketplace": { nothing: "the Marketplace connection is off here, so nothing is fetched to install", blocked: () => ["ziffr/saas-metrics", "1.0.0", { assistantTexts: true }] },
  "pack-actions:readMarketplaceUpdatePlan": { nothing: "the demo has no Pack installed to update", blocked: () => [1, "1.0.0"] },
  "pack-actions:updateFromTheMarketplace": { nothing: "the demo has no Pack installed to update", blocked: () => [1, "1.0.0", { assistantTexts: true }] },
  "pack-actions:readIncludedPackFile": { blocked: () => ["ziffr/sales"] },
  "pack-actions:installIncludedPackFile": { blocked: () => ["ziffr/sales", { assistantTexts: true }] },
  "pack-actions:readIncludedUpdatePlan": { nothing: "the demo has no Pack installed to update", blocked: () => [1] },
  "pack-actions:updateIncludedPackFile": { nothing: "the demo has no Pack installed to update", blocked: () => [1, { assistantTexts: true }] },
  "pack-actions:takeOffer": { nothing: "the demo has no new version of a Pack's item waiting", blocked: () => ["templates", 1] },
  "pack-setup-actions:packSetup": { blocked: () => [1] },
  "pack-setup-actions:setUpPack": { nothing: "the demo has no installed Pack to set up from", blocked: () => [1, { metrics: ["orders"] }] },
  "retention-actions:previewRetention": { blocked: (i) => [i.ownMetric, { keep_months: 25, then: "delete" }] },
  "retention-actions:setMetricRetention": { blocked: (i) => [i.ownMetric, { keep_months: 25, then: "delete" }, "shown"] },
  "retention-actions:cancelMetricRetention": { blocked: (i) => [i.ownMetric] },
  "retention-actions:setWorkspaceRetention": { blocked: () => [{ keep_months: 25, then: "delete" }] },
  "retention-actions:previewRetentionForAll": { blocked: () => [{ keep_months: 25, then: "delete" }] },
  "retention-actions:applyRetentionToAll": { blocked: () => [{ keep_months: 25, then: "delete" }, "shown", "delete"] },
  "search-actions:searchEverything": { reads: () => ["churn march 2026"] },
  "search-actions:searchStart": { reads: () => [] },
  "series-actions:sameNamedMetrics": { reads: () => ["Revenue"] },
  "series-actions:saveSeriesRows": { blocked: (i) => [i.metric, "target", [{ period: i.period, value: 10 }], "Visitor target"] },
  "series-actions:removeSeriesRows": { blocked: (i) => [i.targetMetric, "target", [i.targetPeriod]] },
  "series-actions:deleteMetric": { nothing: "every Metric of the demo is in use, which is refused before anything changes", blocked: (i) => [i.ownMetric, i.ownMetricName] },
  "series-actions:handOverMetricTo": { blocked: (i) => [i.ownMetric, "t-nobody"] },
  "series-actions:archiveMetric": { blocked: (i) => [i.ownMetric] },
  "series-actions:restoreMetric": { nothing: "no Metric of the demo is archived", blocked: (i) => [i.ownMetric] },
  "tag-actions:addTags": { blocked: (i) => [i.ownMetric, ["visitor"]] },
  "tag-actions:removeTag": { blocked: (i) => [i.ownMetric, "visitor"] },
  "tag-actions:tagImpact": { reads: () => ["00000000-0000-4000-8000-000000000000"] },
  "tag-actions:renameTag": { blocked: () => ["00000000-0000-4000-8000-000000000000", "Visitors"] },
  "tag-actions:mergeTags": { blocked: () => ["00000000-0000-4000-8000-000000000000", "00000000-0000-4000-8000-000000000001"] },
  "tag-actions:deleteTag": { blocked: () => ["00000000-0000-4000-8000-000000000000"] },
  "usage-actions:archiveUnused": { blocked: (i) => [[i.ownMetric]] },
  "size-actions:archiveForRoom": { blocked: (i) => [[i.ownMetric]] },
  "series-actions:setMetricSources": { blocked: (i) => [i.ownMetric, ["web_form", "slack"]] },
  "series-actions:updateMetricDetails": { blocked: (i) => [i.ownMetric, { description: "Changed by a visitor" }] },
  "series-actions:askMeNow": { blocked: (i) => [i.ownMetric] },
  "series-actions:recordValue": { blocked: (i) => [i.ownMetric, { value: "42" }] },
  "settings-actions:updateMyProfile": { blocked: () => [{ name: "Not Sara" }] },
  "settings-actions:setMyBusinessFunction": { blocked: () => ["sales"] },
  "settings-actions:setAppearance": { outside: "in the demo the choice is a cookie of the visitor's browser, no row" },
  "settings-actions:renameWorkspace": { blocked: () => ["Visitor's company"] },
  "settings-actions:setYearStart": { blocked: () => [4] },
  "settings-actions:setMyQuietHours": { blocked: () => [{ fromHour: 19, toHour: 7, days: [0, 6], timeZone: null }] },
  "settings-actions:setWorkspaceQuietHours": { blocked: () => [{ fromHour: 19, toHour: 7, days: [] }] },
  "settings-actions:setNumberStyle": { blocked: () => ["1.234,5"] },
  "settings-actions:setAnswerLanguages": { blocked: () => [["en", "de"]] },
  "settings-actions:setAttainmentMethod": { blocked: () => ["distance"] },
  "settings-actions:setWorkspaceSettableLimit": { blocked: () => ["viewLinkDays", 30] },
  "settings-actions:setMySettableLimit": { blocked: () => ["overdueDaysBack", 14] },
  "settings-actions:setWorkspaceProfile": { blocked: () => [{ industry: "retail", segment: null, country: "DE", currency: "EUR", employeeBand: null, revenueBand: null }] },
  "settings-actions:setEmailReminders": { blocked: () => [false] },
  "heads-up-actions:markHeadsUpNotUseful": { blocked: () => ["moving-together:1:2"] },
  "heads-up-actions:muteHeadsUpMetric": { blocked: () => [1] },
  "heads-up-actions:unmuteHeadsUpMetric": { blocked: () => [1] },
  "heads-up-actions:setHeadsUpChoices": { blocked: () => [{ byMessage: true }] },
  "settings-actions:setUsageDigestOn": { blocked: () => [false] },
  "snapshot-actions:takeSnapshot": { blocked: (i) => [i.dashboard, "month", i.lastMonth] },
  "snapshot-actions:setAutoSnapshots": { blocked: (i) => [i.dashboard, "month", 2] },
  "snapshot-actions:editSnapshotWords": { nothing: "words for none of its widgets change nothing", blocked: (i) => [i.snapshot, { summary: "Changed" }] },
  "snapshot-actions:showSnapshot": { nothing: "the demo's Snapshots are shown already", blocked: (i) => [i.snapshot] },
  "snapshot-actions:deleteSnapshot": { blocked: (i) => [i.snapshot, i.snapshotDashboard] },
  "team-actions:createGroup": { blocked: () => ["Visitors"] },
  "team-actions:renameGroup": { blocked: (i) => [i.group, "Renamed group"] },
  "team-actions:deleteGroup": { blocked: (i) => [i.group] },
  "team-actions:setMember": { blocked: (i) => [i.group, "anna", true] },
  "team-actions:addContact": { blocked: () => [{ name: "Ann Other", email: "ann@contact.test" }] },
  "team-actions:removeContact": { nothing: "the demo has no Contacts", blocked: () => ["nobody"] },
  "team-actions:inviteMember": { blocked: () => [{ email: "someone@invite.test", role: "member" }] },
  "team-actions:setWorkspaceClock": { blocked: () => [{ timeZone: "Europe/Berlin", runHour: 7, weekStart: 0 }] },
  "team-actions:resendInvitation": { blocked: () => [1] },
  "team-actions:inviteEveryone": { blocked: () => [] },
  "team-actions:setHeldRole": { nothing: "the demo holds no invitation from an imported file", blocked: () => [1, "member"] },
  "team-actions:createInviteLink": { blocked: () => ["member"] },
  "team-actions:revokeInvitation": { nothing: "the demo has no Invitations", blocked: () => [1] },
  "team-actions:changeRole": { blocked: () => ["ben", "admin"] },
  "team-actions:setDomainJoining": { nothing: "it needs the Owner's own signed-in address, which a demo visit has not", blocked: () => [true] },
  "team-actions:decideJoin": { nothing: "the demo has no requests to join", blocked: () => [1, true] },
  "team-actions:removeMemberWithHandover": { blocked: () => ["ben", "anna"] },
  "template-actions:saveSlideLayout": { blocked: (i) => [{ deckId: i.deck, shapes: [], name: "Layout", description: "", labels: [], choices: {} }] },
  "template-actions:saveTemplate": { open: (i) => [{ widgetId: i.widget, name: "Visitor template", description: "", labels: [], choices: {} }] },
  "template-actions:renameTemplate": { open: (i) => [i.template, "Renamed", ""] },
  "template-actions:deleteTemplate": { open: (i) => [i.template] },
  "theme-actions:saveTheme": { open: (i) => [i.theme, "Renamed theme", i.themeTokens, i.themeSlides] },
  "theme-actions:duplicateTheme": { open: (i) => [i.theme] },
  "theme-actions:addStandardTheme": { open: () => ["tokyo"] },
  "theme-actions:importTheme": { blocked: () => [JSON.stringify(themeToFile("Our look", STANDARD_THEMES[0].tokens, STANDARD_THEMES[0].slides))] },
  "theme-actions:themeLogoSource": { reads: (i) => [i.theme] },
  "theme-actions:deleteTheme": { open: (i) => [i.otherTheme] },
  "theme-actions:setDefaultTheme": { blocked: (i) => [i.theme] },
  "theme-actions:setDashboardTheme": { open: (i) => [i.dashboard, i.theme] },
  "theme-actions:setDeckTheme": { blocked: (i) => [i.deck, i.theme] },
  "try/start/actions:moveGuide": { outside: "a Trial Workspace's guide, never the demo" },
  "try/start/actions:skipGuide": { outside: "a Trial Workspace's guide, never the demo" },
  "try/start/actions:askGuide": { outside: "a Trial Workspace's guide, never the demo" },
  "try/start/actions:guideValue": { outside: "a Trial Workspace's guide, never the demo" },
  "try/start/actions:makeN8nKey": { outside: "a Trial Workspace's guide, never the demo" },
  "version-actions:listVersions": { reads: (i) => ["dashboard", i.dashboard] },
  "version-actions:nameVersion": { nothing: "the demo has no Versions", open: () => [1, "Named"] },
  "version-actions:restoreVersion": { nothing: "the demo has no Versions", open: () => [1] },
  "version-actions:saveNamedVersion": { open: (i) => ["dashboard", i.dashboard, "A visitor's version"] },
  "view-link-actions:listViewLinks": { reads: (i) => ["dashboard", i.dashboard] },
  "view-link-actions:createViewLink": { blocked: (i) => ["dashboard", i.dashboard, { label: "For the board", expires: day(7), frozen: false }] },
  "view-link-actions:shownSnapshots": { reads: (i) => [i.snapshotDashboard] },
  "share-proposal-actions:confirmProposal": { nothing: "the demo has no Share Proposals", blocked: () => [1, ""] },
  "share-proposal-actions:declineProposal": { nothing: "the demo has no Share Proposals", blocked: () => [1] },
  "view-link-actions:tagListsToFix": { reads: (i) => [i.dashboard] },
  "view-link-actions:fixListsForLink": { nothing: "the demo has no View Links, so no list needs fixing", blocked: () => [1] },
  "view-link-actions:setViewLinkNames": { nothing: "the demo has no View Links", blocked: () => [1, true] },
  "view-link-actions:revokeViewLink": { nothing: "the demo has no View Links", blocked: () => [1] },
  "workflow-actions:saveWorkflow": { blocked: (i) => [i.workflow, "Renamed workflow", i.workflowConfig] },
  "workflow-actions:deleteWorkflow": { blocked: (i) => [i.workflow] },
  "workflow-actions:setMetricWorkflow": { blocked: (i) => [i.ownMetric, null] },
  "workflow-actions:runWorkflowsNow": { blocked: () => [day()] },
  "workflow-actions:runTodayNow": { blocked: () => [] },
  "workflow-actions:approveValue": { nothing: "no Approval in the demo waits for Sara", blocked: (i) => [i.approval] },
  "workflow-actions:sendValueBack": { nothing: "no Approval in the demo waits for Sara", blocked: (i) => [i.approval, "Please check"] },
  "workflow-actions:proposeValueCorrection": { blocked: (i) => [i.action, 1, "Please check"] },
  "workflow-actions:confirmOwnValue": { nothing: "no Self-check in the demo waits for Sara", blocked: (i) => [i.approval] },
  "workflow-actions:correctOwnValue": { nothing: "no Self-check in the demo waits for Sara", blocked: (i) => [i.approval, 1] },
  "workflow-actions:lockPeriod": { blocked: (i) => [i.ownMetric, i.twoMonthsAgo, false, "Reopening"] },
  "workflow-actions:closeWorkflowPeriod": { blocked: (i) => [i.workflow, day()] },
  "workflow-actions:setStandIn": { nothing: "Ben submits none of Sara's first Metric", blocked: (i) => [i.ownMetric, "ben", "anna"] },
  "workflow-actions:setAway": { blocked: () => ["sara", day(1), day(5)] },
};

let before: Record<string, string>;
beforeAll(async () => {
  // The baseline is the demo as a full Demo Reset makes it (the SQL seed alone lacks Snapshots, the close and the Outbox).
  await demoFullSeed();
  ids = (await demoWalkIds()) as Ids;
  before = await demoFingerprint();
});

afterAll(async () => {
  // Whatever any action did, the demo is as it was.
  expect(await demoFingerprint()).toEqual(before);
});

const exportsOf = async (file: string) => Object.entries(await import(file)).filter(([, v]) => typeof v === "function") as [string, (...a: unknown[]) => Promise<unknown>][];
const keyOf = (file: string, name: string) => `${relative(APP, file).replace(/\.tsx?$/, "")}:${name}`;

describe("every server action in the demo", () => {
  it("is in the table", async () => {
    const all = (await Promise.all(files.map(async (f) => (await exportsOf(f)).map(([n]) => keyOf(f, n))))).flat().sort();
    expect(all.filter((k) => !(k in CASES))).toEqual([]);
    expect(Object.keys(CASES).filter((k) => !all.includes(k))).toEqual([]);
  });

  it("is classified in demo-changes.ts as the table says, and nothing is allowed yet", () => {
    const wrong: string[] = [];
    for (const [key, c] of Object.entries(CASES)) {
      const said = demoClassOf(key)?.class;
      const want = "outside" in c ? "outside" : "reads" in c ? "reads" : "open" in c ? ["open", "limited"] : "blocked";
      if (!([want].flat() as (string | undefined)[]).includes(said)) wrong.push(`${key}: the table says ${[want].flat().join(" or ")}, demo-changes.ts says ${said}`);
      // With the setting in effect, an action is allowed exactly when it is open or limited there.
      const allowed = demoAllows(key, { ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_CHANGES: "1" });
      if (allowed !== (said === "open" || said === "limited")) wrong.push(`${key}: demoAllows disagrees with its class`);
    }
    expect(wrong).toEqual([]);
  });

  it("refuses a change with the one sentence and saves nothing, the open ones too while the setting is off", async () => {
    const sentence = demoReadOnlyWords();
    const wrong: string[] = [];
    for (const file of files) {
      for (const [name, fn] of await exportsOf(file)) {
        const c = CASES[keyOf(file, name)];
        if (!c || "outside" in c) continue;
        let answer: unknown;
        let thrown: unknown;
        try {
          answer = await fn(...("reads" in c ? c.reads(ids) : "open" in c ? c.open(ids) : c.blocked(ids)));
        } catch (e) {
          thrown = e;
        }
        const words = thrown instanceof Error ? thrown.message : (answer as { error?: unknown } | undefined)?.error;
        // The setting is off here, so an open action is refused as a blocked one is: nothing opens without it (the next test opens it).
        if (("blocked" in c || "open" in c) && !("nothing" in c) && words !== sentence) wrong.push(`${keyOf(file, name)}: ${thrown ? `threw ${String(words)}` : `answered ${JSON.stringify(answer)?.slice(0, 160)}`}`);
        // A read or a preview never meets the sentence: it changes nothing to be refused.
        if ("reads" in c && words === sentence) wrong.push(`${keyOf(file, name)}: a read refused as a change`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

// With the setting in effect (a demo-only Installation, the Installation setting on, the reset job having opened the demo)
// the actions the demo opens succeed for a visit and change the demo: the visitor's own dashboards, widgets, the Pool, Themes,
// Versions and templates (spec 0051, ticket 9). Last in the file: a Demo Reset follows, so the ids above are gone, and the
// demo is then as its seed was (the fingerprint test of afterAll).
describe("with the setting in effect, a visit", () => {
  const VISIT = "0123456789abcdef0123456789abcdef";
  const ENV = ["ZIFFR_DEMO_ONLY", "ZIFFR_DEMO_CHANGES", "ZIFFR_DEMO_ADDRESS_KEY", "ZIFFR_PROXY_HOPS"] as const;
  const savedEnv: Record<string, string | undefined> = {};
  const call = async (key: string, ...args: unknown[]): Promise<unknown> => {
    const [file, name] = key.split(":");
    const fn = (await import(join(APP, file)))[name] as (...a: unknown[]) => Promise<unknown>;
    try { return await fn(...args); } catch (e) {
      // `redirect` ends a plain form's action by throwing: that is how it succeeds.
      if (String((e as { digest?: unknown })?.digest ?? "").startsWith("NEXT_REDIRECT")) return "redirected";
      throw e;
    }
  };
  /** An answer that is a refusal, not a success. */
  const refused = (r: unknown) => typeof r === "object" && r !== null && "error" in r;

  beforeAll(async () => {
    for (const n of ENV) savedEnv[n] = process.env[n];
    Object.assign(process.env, { ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_CHANGES: "1", ZIFFR_DEMO_ADDRESS_KEY: "k".repeat(40), ZIFFR_PROXY_HOPS: "1" });
    await demoOpenForVisitors();
    ids = (await demoWalkIds()) as Ids;
    jar["ziffr-demo"] = { value: VISIT };
    jar["ziffr-demo-gen"] = { value: String(await demoGeneration()) };
  }, 180_000);

  afterAll(async () => {
    for (const n of ENV) { if (savedEnv[n] === undefined) delete process.env[n]; else process.env[n] = savedEnv[n]; }
    jar["ziffr-demo"] = { value: "1" };
    delete jar["ziffr-demo-gen"];
    await demoBackToSeed();
  }, 180_000);

  it("makes, changes and removes its own dashboards, widgets, Pool, Themes, Versions and templates, as one made-up person", async () => {
    const wrong: string[] = [];
    const ok = async (key: string, ...args: unknown[]) => {
      const r = await call(key, ...args);
      if (refused(r)) wrong.push(`${key}: ${JSON.stringify(r)}`);
      return r;
    };
    const m = ids.metric;
    const dash = (await ok("canvas-actions:createDashboardNamed", "Visitor dashboard")) as number;
    await ok("home-actions:newDashboard", null, form({ name: "Visitor dashboard 2" }));
    await ok("dashboard-template-actions:createFromDashboardTemplate", "overview", "From a template", [[m], [m], [m], [m]]);
    await ok("canvas-actions:placeWidget", dash, { type: "metric", id: m });
    const widget = await demoLatestId("widgets", { dashboard_id: dash });
    await ok("canvas-actions:updateWidget", widget, { title: "Retitled" });
    await ok("canvas-actions:saveLayout", dash, [{ i: String(widget), x: 0, y: 0, w: 4, h: 3 }]);
    await ok("canvas-actions:saveDashboardText", dash, { name: "Renamed by a visitor", intro: "A plain note." });
    await ok("canvas-actions:saveToPool", { type: "widget", id: widget }, "Pooled");
    const saved = await demoLatestId("widgets", { saved: true });
    await ok("template-actions:saveTemplate", { widgetId: widget, name: "Visitor template", description: "", labels: [], choices: {} });
    const template = await demoLatestId("team_templates", { kind: "widget" });
    await ok("template-actions:renameTemplate", template, "Renamed", "");
    await ok("canvas-actions:applyTemplate", widget, template, [[m]]);
    await ok("dashboard-template-actions:saveAsDashboardTemplate", { dashboardId: dash, name: "Visitor dashboard template", description: "", labels: [] });
    await ok("template-actions:deleteTemplate", await demoLatestId("team_templates", { kind: "dashboard" }));
    await ok("template-actions:deleteTemplate", template);
    await ok("canvas-actions:deleteSavedWidget", saved);
    await ok("version-actions:saveNamedVersion", "dashboard", dash, "A visitor's version");
    const version = await demoLatestId("versions", { object_type: "dashboard", object_id: dash });
    await ok("version-actions:nameVersion", version, "Named again");
    await ok("version-actions:restoreVersion", version);
    await ok("theme-actions:duplicateTheme", ids.otherTheme);
    const theme = await demoLatestId("themes", {});
    await ok("theme-actions:saveTheme", theme, "My look", ids.otherThemeTokens, ids.otherThemeSlides);
    await ok("theme-actions:setDashboardTheme", dash, theme);
    await ok("theme-actions:addStandardTheme", "tokyo");
    await ok("theme-actions:deleteTheme", theme);
    await ok("canvas-actions:removeWidget", await demoLatestId("widgets", { dashboard_id: dash }));
    expect(wrong).toEqual([]);
  }, 180_000);

  it("is refused, with the sentence, what the demo keeps blocked, and with the words of the demo what it protects", async () => {
    const sentence = demoReadOnlyWords();
    for (const [key, args] of [
      ["theme-actions:setDefaultTheme", [ids.otherTheme]], ["theme-actions:importTheme", [JSON.stringify(themeToFile("Our look", STANDARD_THEMES[0].tokens, STANDARD_THEMES[0].slides))]],
      ["design-actions:addViewDesign", [JSON.stringify(BUILT_IN_DESIGNS.number)]], ["canvas-actions:setShare", ["dashboard", ids.dashboard, "ben", "editor"]],
      ["view-link-actions:createViewLink", ["dashboard", ids.dashboard, { label: "For the board", expires: day(7), frozen: false }]],
    ] as [string, unknown[]][]) {
      const r = (await call(key, ...args)) as { error?: string };
      expect(r?.error, key).toBe(sentence);
    }
    // The showcase and the seed's words: a refusal in the demo's own words, never a change.
    const showcase = (await call("canvas-actions:placeWidget", ids.dashboard, { type: "metric", id: ids.metric })) as { error?: string };
    expect(showcase?.error).toBe("Everyone sees this one as it is. Make your own to change it.");
    const text = (await call("canvas-actions:createDashboardNamed", "see www.example.com")) as { error?: string };
    expect(text?.error).toMatch(/link|address/i);
  }, 180_000);
});
