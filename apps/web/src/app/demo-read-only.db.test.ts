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
import { assertDemoIsOnlyWorkspace, demoBackToSeed, demoFingerprint, demoFullSeed, demoGeneration, demoLatestId, demoOpenForVisitors, demoWalkClearCounts, demoWalkIds, demoWalkOutbound } from "@ziffr/core/test/demo-walk";
import { demoCountRows, demoLatestRow } from "@ziffr/core/test/demo-walk-metrics";
import { DEMO_BUDGET_USED, DEMO_BUSY, DEMO_GOING_FAST, DEMO_METRIC_WORDS, DEMO_SEEDED_WORDS, DEMO_SHOWCASE, DEMO_STALE, DEMO_VALUE_WORDS } from "@ziffr/core/demo-words";
import { demoAllows, demoClassOf } from "@ziffr/core/demo-changes";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// A demo visit as Sara, the demo's Owner, who may try everything a role allows.
const jar = vi.hoisted(() => ({ "ziffr-demo": { value: "1" }, "ziffr-viewer": { value: "sara" } } as Record<string, { value: string }>));
// Each change comes from an address of its own (a network of its own): the walk makes far more of a kind than one address may in a
// window (its share of the cap, final review D2), and the shares are tried by their own tests.
const from = vi.hoisted(() => ({ n: 0 }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => jar[name], set: () => {}, delete: () => {}, getAll: () => [] }),
  headers: async () => { from.n += 1; return new Headers({ host: "ziffr.test", "x-forwarded-for": `198.${(from.n >> 8) & 255}.${from.n & 255}.9` }); },
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
  "access-actions:requestAccess": { nothing: "Sara sees every dashboard of the demo, so there is nothing to ask for", open: (i) => ["dashboard", i.otherDashboard] },
  "access-actions:decideAccess": { nothing: "the demo holds no access request to decide", open: () => [1, true] },
  "actions:setViewer": { outside: "chooses whose view is shown: a cookie, no row" },
  "actions:createMetric": { open: () => [form({ name: "Visitor metric", period: "month", format: "number", submission_rule: "overwrite", polarity: "higher", aggregation: "sum", decimals: "0", sources: "web_form" })] },
  "actions:createDerivedMetric": { open: () => [null, form({ name: "Visitor calculation", formula: "{revenue} * 2" })] },
  "actions:simulateMessage": { reads: () => [{ source: "slack", sender: "@sara", text: "closed 2 deals" }] },
  // They record, where visitors may change the demo, what the previews only say would happen (spec 0051, ticket 8): the answer lands in the demo's
  // Thread, values and Outbox, and nothing is sent. The previews above stay reads.
  "actions:recordSimulatedMessage": { open: () => [{ source: "slack", sender: "@sara", text: "closed 2 deals" }] },
  "connector-actions:recordSimulatedReply": { open: (i) => [i.actionDelivery, "Done, see the sheet"] },
  "connector-actions:recordSimulatedTicketClose": { open: (i) => [i.ticketDelivery] },
  "connector-actions:recordSimulatedPromptAnswer": { open: (i) => [i.promptDelivery, "42"] },
  "actions:submitWebForm": { open: (i) => [i.formCode, null, form({ value: "42" })] },
  "actions:submitCombinedWebForm": { nothing: "the demo asks for each figure in a message of its own, so it has no combined form link", blocked: () => ["x".repeat(43), null, form({ "value-1": "42" })] },
  "actions:createAction": { open: (i) => [{ metricId: i.metric, period: i.period, assigneeId: "ben", question: "Why?" }] },
  "actions:replyToAction": { open: (i) => [i.action, form({ body: "A reply" })] },
  "actions:decideCorrection": { nothing: "the demo holds no proposed Correction", open: (i) => [i.message, true] },
  "actions:setActionStatus": { open: (i) => [i.action, "open"] },
  "assistant-actions:disconnectAssistant": { nothing: "the demo has no connected assistants", blocked: () => [1] },
  "auth-actions:sendSignInLink": { outside: "signing in, not the demo Workspace" },
  "auth-actions:signInWith": { outside: "signing in, not the demo Workspace" },
  "auth-actions:signInAgainForExport": { outside: "signs the Owner out to sign in again before a Workspace Export; the demo cannot be exported" },
  "auth-actions:signOut": { outside: "signing out, not the demo Workspace" },
  "workspace-import-actions:openImported": { outside: "opens a Workspace of one's own that an import made, never the demo" },
  "auth-actions:createWorkspace": { outside: "a Workspace of one's own, never the demo; refused during a demo visit" },
  "first-steps/actions:makeWorkspace": { outside: "First Steps makes a Workspace of one's own, never the demo; switched off" },
  "first-steps/actions:saveAnswers": { outside: "the Owner answers First Steps again; the core refuses a demo actor; switched off" },
  "first-steps/set-actions:readSet": { outside: "First Steps' ready-made sets, for an Owner or Admin; reads only; the core refuses a demo actor; switched off" },
  "first-steps/set-actions:readSets": { outside: "First Steps' ready-made sets, for an Owner or Admin; reads only; the core offers a demo actor none; switched off" },
  "first-steps/value-actions:askByEmail": { outside: "First Steps' last screens, for the Owner of a Workspace it made; the core refuses a demo actor; switched off" },
  "first-steps/value-actions:chooseProvider": { outside: "First Steps' last screens, for the Owner of a Workspace it made; the core refuses a demo actor; switched off" },
  "first-steps/value-actions:emailAgain": { outside: "First Steps' last screens, for the Owner of a Workspace it made; the core refuses a demo actor; switched off" },
  "first-steps/value-actions:lookForValue": { outside: "First Steps' last screens, for the Owner of a Workspace it made; the core refuses a demo actor; switched off" },
  "first-steps/value-actions:pickValueMetric": { outside: "First Steps' last screens, for the Owner of a Workspace it made; the core refuses a demo actor; switched off" },
  "first-steps/value-actions:readDone": { outside: "First Steps' last screens, for the Owner of a Workspace it made; the core refuses a demo actor; switched off" },
  "first-steps/value-actions:readFirstValue": { outside: "First Steps' last screens, for the Owner of a Workspace it made; the core refuses a demo actor; switched off" },
  "first-steps/value-actions:readSender": { outside: "First Steps' last screens, for the Owner of a Workspace it made; the core refuses a demo actor; switched off" },
  "first-steps/value-actions:typeValue": { outside: "First Steps' last screens, for the Owner of a Workspace it made; the core refuses a demo actor; switched off" },
  "use-pack/actions:checkPackStart": { outside: "reads what a guided Pack set-up would make; the core refuses a demo actor; switched off" },
  "use-pack/actions:takePackStartStep": { outside: "sets a Pack up in a Workspace of one's own; the core refuses a demo actor; switched off" },
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
  "canvas-actions:setShare": { nothing: "Ben may hold this Share already, so nothing changes", open: (i) => ["dashboard", i.dashboard, "ben", "editor"] },
  "canvas-actions:setGroupShare": { open: (i) => ["dashboard", i.dashboard, i.group, "viewer"] },
  "canvas-actions:canvasAdd": { blocked: (i) => [[i.metric]] },
  "canvas-actions:canvasRemove": { nothing: "nothing is on the demo's analysis canvas to remove", blocked: (i) => [i.metric] },
  "canvas-actions:canvasSet": { blocked: (i) => [[i.metric]] },
  "canvas-actions:canvasExplain": { nothing: "nothing is on the demo's analysis canvas to mark", blocked: (i) => [i.metric] },
  "canvas-actions:getHistory": { reads: (i) => [i.metric] },
  "picker-actions:pickerList": { reads: (i) => [[i.metric]] },
  "picker-actions:pickerRun": { reads: (i) => [{ entry: "forecast", slots: { metric: [i.metric] } }] },
  "canvas-actions:assignInPlace": { open: (i) => [{ metricId: i.metric, period: i.period, assigneeId: "ben", kind: "task", text: "Check this" }] },
  "canvas-actions:markTaskDone": { nothing: "Sara has no open task in the demo", open: (i) => [i.task] },
  "connector-actions:sendTestMessage": { blocked: () => ["email"] },
  "connector-actions:sendScreenLink": { blocked: () => ["/analyze"] },
  "connector-actions:setPracticeWay": { blocked: () => ["email", true] },
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
  "connector-actions:setPreference": { open: () => ["sara", "question", "slack"] },
  "connector-actions:simulateReply": { reads: (i) => [i.actionDelivery, "Done, see the sheet"] },
  "connector-actions:simulateTicketClose": { reads: (i) => [i.ticketDelivery] },
  "connector-actions:sendDueReminders": { nothing: "nothing is due right after the seed, which sent the reminders", open: () => [] },
  "connector-actions:askForMissingValues": { nothing: "the seed already asked for every missing value", open: () => [] },
  "connector-actions:simulatePromptAnswer": { reads: (i) => [i.promptDelivery, "42"] },
  "convert-actions:makeDeckFromSnapshot": { open: (i) => [i.snapshot] },
  "convert-actions:makeDeck": { open: (i) => [i.dashboard] },
  // Onto a new deck, as addToDeck below.
  "convert-actions:addSnapshotToDeck": { open: (i) => [i.snapshot, null] },
  "deck-actions:readDeckNumbers": { reads: (i) => [[{ snapshotId: i.snapshot, parts: [0], metricIds: [] }]] },
  "deck-actions:deckShareLeftOut": { reads: (i) => [i.deck] },
  "convert-actions:deckChoices": { reads: () => [] },
  // Clears this browser's own Add to deck… cookie; nothing of the demo.
  "convert-actions:doneAddingToDeck": { reads: () => [] },
  // Onto a new deck: making it is the change.
  "convert-actions:addToDeck": { open: (i) => [i.widget, null, null] },
  "dashboard-template-actions:createFromDashboardTemplate": { open: (i) => ["overview", "From a template", [[i.metric], [i.metric], [i.metric], [i.metric]]] },
  "dashboard-template-actions:draftDashboardTemplate": { reads: (i) => [i.dashboard] },
  "dashboard-template-actions:saveAsDashboardTemplate": { open: (i) => [{ dashboardId: i.dashboard, name: "Visitor template", description: "", labels: [] }] },
  "deck-workflow-template-actions:saveAsDeckTemplate": { open: (i) => [{ deckId: i.deck, name: "Visitor deck template", description: "", labels: [], choices: {} }] },
  "deck-workflow-template-actions:createDeckFromTemplate": { nothing: "the demo has no Deck Templates", open: () => [1, "From a template", []] },
  "deck-workflow-template-actions:saveAsWorkflowTemplate": { blocked: (i) => [{ workflowId: i.workflow, name: "Visitor workflow template", description: "" }] },
  "deck-workflow-template-actions:createWorkflowFromTemplate": { nothing: "the demo has no Workflow Templates", blocked: () => [1, "From a template", []] },
  "deck-actions:createDeck": { open: () => [null, form({ name: "Visitor deck" })] },
  "deck-actions:saveDeck": { open: (i) => [i.deck, { store: {}, schema: {} }] },
  "deck-actions:renameDeck": { open: (i) => [i.deck, "Renamed deck"] },
  "deck-actions:deleteDeck": { open: (i) => [i.deck] },
  "deck-actions:setDeckFooter": { open: (i) => [i.deck, "A footer"] },
  "deck-actions:noteDeckExport": { nothing: "it only records an Audit event, and the demo keeps no Audit Log", blocked: (i) => [i.deck, "pdf"] },
  "design-actions:addViewDesign": { blocked: () => [JSON.stringify(BUILT_IN_DESIGNS.number)] },
  "design-actions:removeViewDesign": { nothing: "the demo has no View Designs", blocked: () => [1] },
  "fill-in-actions:fillInForSubmitter": { open: (i) => [{ metricId: i.metric, period: "2026-03-01", for: "someone", value: "42" }] },
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
  "home-actions:tryExample": { nothing: "the demo is no trial, and the core refuses a demo actor", blocked: () => [] },
  "home-actions:removeExample": { nothing: "the demo has no trial example, and the core refuses a demo actor", blocked: (i) => [i.dashboard] },
  "home-actions:newDashboard": { open: () => [null, form({ name: "Visitor dashboard" })] },
  "installation-actions:claimInstallation": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:addInstallationAdmin": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:removeInstallationAdmin": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:saveInstallationSettings": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:checkTelegram": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:sendTestEmail": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:startTelegramTest": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:setWorkspaceLimit": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:blockUser": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:unblockUser": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:signOutUser": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:extendTrial": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:createInstallationAnnouncement": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:updateInstallationAnnouncement": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:setInstallationAnnouncementActive": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:deleteInstallationAnnouncement": { outside: "the Installation, not the demo Workspace" },
  "installation-feedback-actions:approveFeedbackAction": { outside: "the Installation, not the demo Workspace" },
  "installation-feedback-actions:rejectFeedbackAction": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:changeWorkspaceKey": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:makeInboundSecret": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:makeUsageKey": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:revokeUsageKey": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:makePracticeWorkspace": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:startOverPracticeWorkspace": { outside: "the Installation, not the demo Workspace" },
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
  "paste-actions:recordPaste": { open: () => [{ text: "Revenue\t42" }] },
  "paste-actions:pasteTemplateFile": { reads: () => [{ kind: "rows" }] },
  "quick-look-actions:metricQuickLook": { reads: () => ["revenue"] },
  "metric-actions-actions:metricActions": { reads: () => [["revenue"]] },
  // Reading or fetching a Pack is refused in the demo like a change: it would make work for an anonymous visitor.
  "pack-actions:readPack": { blocked: () => [PACK] },
  "pack-actions:exportAsPack": { reads: (i) => [{ id: "visitor/export", name: "Export", version: "1.0.0", summary: "An export.", author: "A visitor", license: "CC-BY-4.0" }, { metrics: [i.metric] }] },
  "pack-actions:themeLogoPreview": { reads: () => [1] },
  "pack-guide-actions:readPackGuides": { reads: () => [] },
  "pack-guide-actions:readPackGuide": { reads: () => [1] },
  "pack-guide-actions:describePack": { reads: (i) => ["visitor/export", { metrics: [i.metric] }] },
  "pack-guide-actions:checkPackDescription": { reads: () => [{ whatItsFor: "A guide." }, {}] },
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
  "pack-setup-actions:planSetUp": { blocked: () => [1, { metrics: ["orders"] }] },
  "pack-setup-actions:lineStart": { blocked: () => [1, "site"] },
  "pack-setup-actions:fillMadeUpNumbers": { blocked: () => [1, 0] },
  "pack-setup-actions:setUpPack": { nothing: "the demo has no installed Pack to set up from", blocked: () => [1, { metrics: ["orders"] }] },
  "total-actions:createTotal": { blocked: (i) => [{ name: "All", parts: [i.ownMetric] }] },
  "total-actions:addTotalPart": { blocked: (i) => [i.ownMetric, i.ownMetric, "2026-01-01"] },
  "total-actions:setTotalPartPeriods": { blocked: (i) => [i.ownMetric, i.ownMetric, "2026-01-01"] },
  "total-actions:removeTotalPart": { blocked: (i) => [i.ownMetric, i.ownMetric] },
  "total-actions:setTotalTargets": { blocked: (i) => [i.ownMetric, "parts"] },
  "total-actions:previewTotalOpening": { blocked: (i) => [i.ownMetric] },
  "total-actions:openTotal": { blocked: (i) => [i.ownMetric, "shown"] },
  "total-actions:closeTotal": { blocked: (i) => [i.ownMetric] },
  "retention-actions:previewRetention": { blocked: (i) => [i.ownMetric, { keep_months: 25, then: "delete" }] },
  "retention-actions:setMetricRetention": { blocked: (i) => [i.ownMetric, { keep_months: 25, then: "delete" }, "shown"] },
  "retention-actions:cancelMetricRetention": { blocked: (i) => [i.ownMetric] },
  "retention-actions:setWorkspaceRetention": { blocked: () => [{ keep_months: 25, then: "delete" }] },
  "retention-actions:previewRetentionForAll": { blocked: () => [{ keep_months: 25, then: "delete" }] },
  "retention-actions:applyRetentionToAll": { blocked: () => [{ keep_months: 25, then: "delete" }, "shown", "delete"] },
  "search-actions:searchEverything": { reads: () => ["churn march 2026"] },
  "search-actions:searchStart": { reads: () => [] },
  "series-actions:sameNamedMetrics": { reads: () => ["Revenue"] },
  "series-actions:saveSeriesRows": { open: (i) => [i.metric, "target", [{ period: i.period, value: 10 }], "Visitor target"] },
  "series-actions:removeSeriesRows": { open: (i) => [i.targetMetric, "target", [i.targetPeriod]] },
  "metric-delete-actions:previewMetricDelete": { reads: (i) => [[i.ownMetric], { dashboards: false, decks: false, viewLinks: false }] },
  "metric-delete-actions:deleteMetrics": { blocked: (i) => [[i.ownMetric], { dashboards: true, decks: true, viewLinks: true }, i.ownMetricName, ""] },
  "metric-delete-actions:archiveInstead": { blocked: (i) => [[i.ownMetric]] },
  "series-actions:handOverMetricTo": { blocked: (i) => [i.ownMetric, "t-nobody"] },
  "series-actions:archiveMetric": { open: (i) => [i.ownMetric] },
  "series-actions:restoreMetric": { nothing: "no Metric of the demo is archived", open: (i) => [i.ownMetric] },
  "tag-actions:addTags": { open: (i) => [i.ownMetric, ["visitor"]] },
  "tag-actions:removeTag": { open: (i) => [i.ownMetric, "visitor"] },
  "tag-actions:tagImpact": { reads: () => ["00000000-0000-4000-8000-000000000000"] },
  "tag-actions:renameTag": { open: () => ["00000000-0000-4000-8000-000000000000", "Visitors"] },
  "tag-actions:mergeTags": { open: () => ["00000000-0000-4000-8000-000000000000", "00000000-0000-4000-8000-000000000001"] },
  "tag-actions:deleteTag": { open: () => ["00000000-0000-4000-8000-000000000000"] },
  "usage-actions:archiveUnused": { blocked: (i) => [[i.ownMetric]] },
  "size-actions:archiveForRoom": { blocked: (i) => [[i.ownMetric]] },
  "series-actions:setMetricSources": { open: (i) => [i.ownMetric, ["web_form", "slack"]] },
  "series-actions:updateMetricDetails": { open: (i) => [i.ownMetric, { description: "Changed by a visitor" }] },
  "series-actions:askMeNow": { open: (i) => [i.ownMetric] },
  "series-actions:recordValue": { open: (i) => [i.ownMetric, { value: "42" }] },
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
  "settings-actions:createWorkspaceAnnouncement": { blocked: () => [{ text: "Hello" }] },
  "settings-actions:updateWorkspaceAnnouncement": { blocked: () => ["00000000-0000-4000-8000-000000000000", { text: "Hello" }] },
  "settings-actions:setWorkspaceAnnouncementActive": { blocked: () => ["00000000-0000-4000-8000-000000000000", false] },
  "settings-actions:deleteWorkspaceAnnouncement": { blocked: () => ["00000000-0000-4000-8000-000000000000"] },
  "settings-actions:setMySettableLimit": { blocked: () => ["overdueDaysBack", 14] },
  "settings-actions:setWorkspaceProfile": { blocked: () => [{ industry: "retail", segment: null, country: "DE", currency: "EUR", employeeBand: null, revenueBand: null }] },
  "settings-actions:setEmailReminders": { blocked: () => [false] },
  "heads-up-actions:markHeadsUpNotUseful": { blocked: () => ["moving-together:1:2"] },
  "heads-up-actions:muteHeadsUpMetric": { blocked: () => [1] },
  "heads-up-actions:unmuteHeadsUpMetric": { blocked: () => [1] },
  "heads-up-actions:setHeadsUpChoices": { blocked: () => [{ byMessage: true }] },
  "settings-actions:setUsageDigestOn": { blocked: () => [false] },
  "snapshot-actions:takeSnapshot": { open: (i) => [i.dashboard, "month", i.lastMonth] },
  "snapshot-actions:setAutoSnapshots": { blocked: (i) => [i.dashboard, "month", 2] },
  "snapshot-actions:editSnapshotWords": { nothing: "words for none of its widgets change nothing", open: (i) => [i.snapshot, { summary: "Changed" }] },
  "snapshot-actions:showSnapshot": { nothing: "the demo's Snapshots are shown already", open: (i) => [i.snapshot] },
  "snapshot-actions:deleteSnapshot": { open: (i) => [i.snapshot, i.snapshotDashboard] },
  "team-actions:createGroup": { open: () => ["Visitors"] },
  "team-actions:renameGroup": { open: (i) => [i.group, "Renamed group"] },
  "team-actions:deleteGroup": { open: (i) => [i.group] },
  "team-actions:setMember": { open: (i) => [i.group, "anna", true] },
  "team-actions:addContact": { blocked: () => [{ name: "Ann Other", email: "ann@contact.test" }] },
  "team-actions:removeContact": { nothing: "the demo has no Contacts", blocked: () => ["nobody"] },
  "team-actions:inviteGateNow": { reads: () => [] },
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
  "template-actions:saveSlideLayout": { open: (i) => [{ deckId: i.deck, shapes: [], name: "Layout", description: "", labels: [], choices: {} }] },
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
  "theme-actions:setDeckTheme": { open: (i) => [i.deck, i.theme] },
  "setup/actions:saveAboutYou": { blocked: () => [{ profile: { industry: "retail" }, clock: { timeZone: "Europe/Berlin", runHour: 7, weekStart: 0 }, yearStart: 4 }] },
  "setup/actions:skipStep": { blocked: () => ["about"] },
  "setup/actions:hideSetup": { blocked: () => [] },
  "setup/actions:reopenSetup": { blocked: () => [] },
  "setup/actions:readSetupSteps": { reads: () => [] },
  "setup/actions:chooseExplore": { blocked: () => [] },
  "setup/actions:setUpFromPackInGuide": { nothing: "the demo has no installed Pack to set up from", blocked: () => [1, { metrics: ["orders"] }] },
  "setup/ways-actions:saveAskMeBy": { blocked: () => [["email"]] },
  "setup/ways-actions:connectSlackFromGuide": { blocked: () => [] },
  "setup/first-metric-actions:askFirstMetric": { blocked: () => [] },
  "setup/first-metric-actions:askMeForIt": { blocked: () => [] },
  "setup/first-metric-actions:pickMetric": { blocked: (i) => [i.ownMetric] },
  "setup/first-metric-actions:sendFirstValue": { blocked: () => ["42"] },
  "setup/first-metric-actions:tryExampleHere": { nothing: "the demo is no trial, and the core refuses a demo actor", blocked: () => [] },
  "setup/first-metric-actions:checkFirstMetric": { reads: () => [] },
  "setup/team-actions:askForMetric": { blocked: (i) => [i.metric, "someone"] },
  "submitter-actions:addSubmitter": { blocked: (i) => [i.metric, "ben", true] },
  "submitter-actions:askToGetEmailsAgain": { blocked: (i) => [i.metric, "ben"] },
  "submitter-actions:removeSubmitter": { blocked: (i) => [i.metric, "ben"] },
  "try/n8n/actions:makeN8nKey": { outside: "a Trial Workspace's key for n8n, never the demo" },
  "version-actions:listVersions": { reads: (i) => ["dashboard", i.dashboard] },
  "version-actions:nameVersion": { nothing: "the demo has no Versions", open: () => [1, "Named"] },
  "version-actions:restoreVersion": { nothing: "the demo has no Versions", open: () => [1] },
  "version-actions:saveNamedVersion": { open: (i) => ["dashboard", i.dashboard, "A visitor's version"] },
  "view-link-actions:deletedInLink": { reads: (i) => [i.dashboard, 1] },
  "view-link-actions:emptyInLink": { reads: (i) => ["dashboard", i.dashboard, null] },
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
  "workflow-actions:runWorkflowsNow": { open: () => [day()] },
  "workflow-actions:runTodayNow": { blocked: () => [] },
  "workflow-actions:approveValue": { nothing: "no Approval in the demo waits for Sara", open: (i) => [i.approval] },
  "workflow-actions:sendValueBack": { nothing: "no Approval in the demo waits for Sara", open: (i) => [i.approval, "Please check"] },
  "workflow-actions:proposeValueCorrection": { open: (i) => [i.action, 1, "Please check"] },
  "workflow-actions:confirmOwnValue": { nothing: "no Self-check in the demo waits for Sara", open: (i) => [i.approval] },
  "workflow-actions:correctOwnValue": { nothing: "no Self-check in the demo waits for Sara", open: (i) => [i.approval, 1] },
  "workflow-actions:lockPeriod": { open: (i) => [i.ownMetric, i.twoMonthsAgo, false, "Reopening"] },
  "workflow-actions:closeWorkflowPeriod": { open: (i) => [i.workflow, day()] },
  "workflow-actions:setStandIn": { nothing: "Ben submits none of Sara's first Metric", open: (i) => [i.ownMetric, "ben", "anna"] },
  "workflow-actions:setAway": { open: () => ["sara", day(1), day(5)] },
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
  // Two full seeds differ in what holds times or chance (Snapshots, Heads-up pairs, periods' states, the Audit Log): the rest is the seed.
  const timed = ["audit_events", "dashboard_snapshots", "heads_up_pairs", "period_states"];
  const without = (f: Record<string, string>) => Object.fromEntries(Object.entries(f).filter(([k]) => !timed.includes(k)));
  expect(without(await demoFingerprint())).toEqual(without(before));
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
    await assertDemoIsOnlyWorkspace();
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

  // A slide as the deck editor saves it: one frame with a text in it (and, for a layout, the same text as a shape of the slide).
  const slideWith = (text: string) => ({
    schema: { schemaVersion: 2, sequences: { "com.tldraw.store": 4 } },
    store: {
      "document:document": { id: "document:document", typeName: "document", name: "", gridSize: 10, meta: {} },
      "page:page": { id: "page:page", typeName: "page", name: "Page 1", index: "a1", meta: {} },
      "shape:slide1": { id: "shape:slide1", typeName: "shape", type: "frame", x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, parentId: "page:page", index: "a1", meta: {}, props: { w: 1600, h: 900, name: "Slide 1" } },
      "shape:text1": { id: "shape:text1", typeName: "shape", type: "text", x: 40, y: 40, rotation: 0, isLocked: false, opacity: 1, parentId: "shape:slide1", index: "a1", meta: {}, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }, size: "m", font: "sans", textAlign: "start", autoSize: true, w: 400, scale: 1, color: "black" } },
    },
  });

  // Spec 0051, ticket 10. Decks and Snapshots, as one made-up person: every opened action once, each on the visitor's own.
  it("makes, writes, versions and removes its own decks and Snapshots, and takes the Snapshot's turn and gives it back", async () => {
    // Another visit: one visit may change 30 things a minute, and the test above has used much of it.
    jar["ziffr-demo"] = { value: "1123456789abcdef0123456789abcdef" };
    const wrong: string[] = [];
    const ok = async (key: string, ...args: unknown[]) => {
      const r = await call(key, ...args);
      if (refused(r)) wrong.push(`${key}: ${JSON.stringify(r)}`);
      return r;
    };
    await ok("deck-actions:createDeck", null, form({ name: "Visitor deck" }));
    const deck = await demoLatestId("decks", {});
    await ok("deck-actions:renameDeck", deck, "Renamed deck");
    await ok("deck-actions:setDeckFooter", deck, "A footer");
    await ok("deck-actions:saveDeck", deck, slideWith("Revenue against cost"));
    await ok("theme-actions:setDeckTheme", deck, null);
    await ok("version-actions:saveNamedVersion", "deck", deck, "A deck version");
    await ok("version-actions:restoreVersion", await demoLatestId("versions", { object_type: "deck", object_id: deck }));
    await ok("convert-actions:addToDeck", ids.widget, deck, null);
    await ok("convert-actions:makeDeck", ids.dashboard);
    await ok("convert-actions:makeDeckFromSnapshot", ids.snapshot);
    await ok("deck-workflow-template-actions:saveAsDeckTemplate", { deckId: deck, name: "Visitor deck template", description: "", labels: [], choices: {} });
    const deckTemplate = await demoLatestId("team_templates", { kind: "deck" });
    await ok("deck-workflow-template-actions:createDeckFromTemplate", deckTemplate, "From a deck template", []);
    await ok("template-actions:saveSlideLayout", { deckId: deck, shapes: [{ type: "text", x: 0, y: 0, rotation: 0, opacity: 1, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Layout words" }] }] } } }], name: "Visitor layout", description: "", labels: [], choices: {} });
    await ok("template-actions:deleteTemplate", await demoLatestId("team_templates", { kind: "slide" }));
    await ok("template-actions:deleteTemplate", deckTemplate);
    await ok("deck-actions:deleteDeck", deck);
    // A Snapshot of a dashboard of its own, written up, shown and deleted.
    const dash = (await ok("canvas-actions:createDashboardNamed", "Snapshot dashboard")) as number;
    await ok("canvas-actions:placeWidget", dash, { type: "metric", id: ids.metric });
    await ok("snapshot-actions:takeSnapshot", dash, "month", ids.lastMonth);
    const snapshot = await demoLatestId("dashboard_snapshots", { dashboard_id: dash });
    await ok("snapshot-actions:editSnapshotWords", snapshot, { intro: "A plain note." });
    await ok("snapshot-actions:showSnapshot", snapshot);
    await ok("deck-actions:createDeck", null, form({ name: "From a Snapshot" }));
    await ok("convert-actions:makeDeckFromSnapshot", snapshot);
    await ok("snapshot-actions:deleteSnapshot", snapshot, dash);
    expect(wrong).toEqual([]);
    // The turn was given back: a second Snapshot of the same dashboard is not refused as busy.
    const again = (await call("snapshot-actions:takeSnapshot", dash, "month", ids.lastMonth)) as { error?: string };
    expect(again?.error ?? "").not.toMatch(/Another visitor/);
  }, 180_000);

  it("refuses, in the demo's words and before anything is written, what would change what the seed made or break the demo's rules", async () => {
    jar["ziffr-demo"] = { value: "2123456789abcdef0123456789abcdef" };
    const asked =async (key: string, ...args: unknown[]) => ((await call(key, ...args).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))) as { error?: string })?.error;
    const kept = "Everyone sees this one as it is. Make your own to change it.";
    // The seed's deck and Snapshots, and a Snapshot of a showcase dashboard.
    expect(await asked("deck-actions:saveDeck", ids.deck, slideWith("Changed"))).toBe(kept);
    expect(await asked("deck-actions:renameDeck", ids.deck, "Renamed")).toBe(kept);
    expect(await asked("deck-actions:deleteDeck", ids.deck)).toBe(kept);
    expect(await asked("snapshot-actions:deleteSnapshot", ids.snapshot, ids.snapshotDashboard)).toBe(kept);
    expect(await asked("snapshot-actions:takeSnapshot", ids.dashboard, "month", ids.lastMonth)).toBe(kept);
    // Words that fail the text rules, and what comes from outside the demo.
    expect(await asked("deck-actions:createDeck", null, form({ name: "see www.example.com" }))).toMatch(/web address/i);
    await call("deck-actions:createDeck", null, form({ name: "Words deck" })).catch(() => undefined);
    const own = await demoLatestId("decks", {});
    expect(await asked("deck-actions:saveDeck", own, slideWith("see www.example.com"))).toMatch(/web address/i);
    expect(await asked("deck-actions:saveDeck", own, { store: { "asset:a": { id: "asset:a", typeName: "asset", type: "image", props: { src: "data:image/png;base64,AAAA" } } } })).toMatch(/Pictures/);
    expect(await asked("deck-actions:setDeckFooter", own, "see www.example.com")).toMatch(/web address/i);
    expect(await asked("template-actions:saveSlideLayout", { deckId: own, shapes: [{ type: "image", props: {} }], name: "Layout", description: "", labels: [], choices: {} })).toMatch(/Pictures/);
    // Kept blocked: nothing that shares, links, sends or runs on its own.
    const sentence = demoReadOnlyWords();
    for (const [key, args] of [["snapshot-actions:setAutoSnapshots", [ids.dashboard, "month", 2]], ["series-actions:handOverMetricTo", [ids.ownMetric, "t-nobody"]], ["view-link-actions:createViewLink", ["deck", own, { label: "For the board", expires: day(7), frozen: false }]]] as [string, unknown[]][]) {
      expect(await asked(key, ...args), key).toBe(sentence);
    }
    await call("deck-actions:deleteDeck", own);
  }, 180_000);

  // Ticket 8: the work around a value. Not refused with the demo's own words, some row changes, and nothing leaves the Outbox.
  it("lets the work around a value through, and sends nothing outside", async () => {
    const mine = Object.keys(CASES).filter((k) => /^(actions:(submitWebForm|decideCorrection|recordSimulated)|connector-actions:(askForMissing|sendDue|recordSimulated)|fill-in-actions:|paste-actions:recordPaste|series-actions:(askMeNow|recordValue)|workflow-actions:)/.test(k) && "open" in CASES[k]);
    // The walk's rows are the seed's: a Lock changes a seeded period's note, and the first Prompt's Delivery is the showcase's, so those two kinds of
    // refusal ("everyone sees this one as it is") are the protection working. Everything else of the demo's words is a failure.
    const demoWords = [demoReadOnlyWords(), DEMO_STALE, DEMO_BUSY, DEMO_BUDGET_USED, DEMO_GOING_FAST, DEMO_VALUE_WORDS.run];
    const outboundAtStart = await demoWalkOutbound();
    const fingerprintAtStart = await demoFingerprint();
    const wrong: string[] = [];
    for (const key of mine) {
      await demoWalkClearCounts();
      const r = await call(key, ...(CASES[key] as { open: (i: Ids) => unknown[] }).open(ids)).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })) as { error?: string } | undefined;
      if (typeof r?.error === "string" && demoWords.includes(r.error)) wrong.push(`${key}: refused with the demo's words: ${r.error}`);
    }
    expect(wrong).toEqual([]);
    expect(await demoFingerprint(), "the open actions changed nothing").not.toEqual(fingerprintAtStart);
    expect(await demoWalkOutbound()).toEqual(outboundAtStart);
    expect(outboundAtStart).toEqual({ notInOutbox: 0, webhooks: 0, webhookSends: 0 });
  }, 300_000);

  // Ticket 11: Metrics, Targets and Projections, Tags, Questions and Tasks, Shares and Groups among the made-up people, the preferred
  // channel. A Metric of the visit's own is made first, so the changes below are to what a visitor made; the seed's Metric, Group and
  // dashboard are refused in the demo's own words; nothing leaves the Outbox.
  it("makes and changes a Metric of its own, asks and replies, shares and groups among the made-up people, and sends nothing outside", async () => {
    const wrong: string[] = [];
    const ok = async (key: string, ...args: unknown[]) => {
      // One visit changes at most 30 things a minute: the walk counts each from zero, as the other passes do.
      await demoWalkClearCounts();
      const r = await call(key, ...args);
      if (refused(r)) wrong.push(`${key}: ${JSON.stringify(r)}`);
      return r;
    };
    /** The words a refusal says, whether it is answered or thrown. */
    const words = async (key: string, ...args: unknown[]) => {
      await demoWalkClearCounts();
      const r = await call(key, ...args).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })) as { error?: string };
      return r?.error;
    };
    const viewAs = (who: string) => { jar["ziffr-viewer"] = { value: who }; };
    await demoWalkClearCounts();
    const outboundAtStart = await demoWalkOutbound();
    try {
      // A Metric, as the new-Metric form makes it (the form redirects when it works), asking Ben for its values; and one nobody sees yet.
      const base = { period: "month", format: "number", submission_rule: "overwrite", polarity: "higher", aggregation: "sum", decimals: "0", sources: "web_form" };
      await ok("actions:createMetric", form({ ...base, name: "Visitor metric", submitters: "ben" }));
      const mine = await demoLatestRow("metrics", "id, slug");
      const id = mine.id as number;
      await ok("actions:createMetric", form({ ...base, name: "Private metric" }));
      const priv = (await demoLatestRow("metrics", "id")).id as number;
      await ok("actions:createDerivedMetric", null, form({ name: "Visitor calculation", formula: `{${mine.slug}} * 2` }));
      await ok("series-actions:updateMetricDetails", id, { description: "A plain description.", targetMin: 1, targetMax: 100 });
      await ok("series-actions:setMetricSources", id, ["web_form", "slack"]);
      await ok("series-actions:saveSeriesRows", id, "target", [{ period: ids.period, value: 10 }, { period: ids.lastMonth, value: 9 }], "Visitor target");
      await ok("series-actions:saveSeriesRows", id, "projection", [{ period: ids.period, value: 12 }], "Visitor projection");
      await ok("series-actions:removeSeriesRows", id, "target", [ids.lastMonth]);
      // Tags: put on, renamed, merged, deleted, put on and taken off.
      await ok("tag-actions:addTags", id, ["visitor", "second"]);
      const visitorTag = (await demoLatestRow("tags", "id", { name: "visitor" })).id as string;
      const secondTag = (await demoLatestRow("tags", "id", { name: "second" })).id as string;
      await ok("tag-actions:renameTag", visitorTag, "visitors");
      await ok("tag-actions:mergeTags", secondTag, visitorTag);
      await ok("tag-actions:deleteTag", visitorTag);
      await ok("tag-actions:addTags", id, ["again"]);
      await ok("tag-actions:removeTag", id, "again");
      // A Group of its own, who is in it, a Share with it and with Ben, and taking them away again.
      await ok("team-actions:createGroup", "Visitor group");
      const group = (await demoLatestRow("groups", "id", { name: "Visitor group" })).id as number;
      await ok("team-actions:renameGroup", group, "Visitor group 2");
      await ok("team-actions:setMember", group, "anna", true);
      await ok("canvas-actions:setGroupShare", "metric", id, group, "viewer");
      await ok("canvas-actions:setShare", "metric", id, "ben", "editor");
      await ok("canvas-actions:setShare", "metric", id, "ben", null);
      await ok("canvas-actions:setGroupShare", "metric", id, group, null);
      await ok("team-actions:setMember", group, "anna", false);
      await ok("team-actions:deleteGroup", group);
      // A Question to Ben, his reply, closing it; a Task for him, done. The words are written as the person each one is.
      const question = (await ok("canvas-actions:assignInPlace", { metricId: id, period: ids.period, assigneeId: "ben", kind: "question", text: "Why this value?" })) as number;
      const task = (await ok("canvas-actions:assignInPlace", { metricId: id, period: ids.period, assigneeId: "ben", kind: "task", text: "Check this", due: day(3) })) as number;
      viewAs("ben");
      await ok("actions:replyToAction", question, form({ body: "Because of the move." }));
      await ok("canvas-actions:markTaskDone", task, undefined, form({ body: "Checked." }));
      viewAs("sara");
      await ok("actions:setActionStatus", question, "closed");
      // Ben asks for the Metric nobody has shared with him, and Sara, its owner, grants it.
      viewAs("ben");
      await ok("access-actions:requestAccess", "metric", priv);
      viewAs("sara");
      await ok("access-actions:decideAccess", (await demoLatestRow("access_requests", "id")).id, true);
      // A made-up person's preferred channel, and archiving a Metric of one's own and bringing it back.
      await ok("connector-actions:setPreference", "sara", "question", "slack");
      await ok("series-actions:archiveMetric", id);
      await ok("series-actions:restoreMetric", id);
      expect(wrong).toEqual([]);
      expect(await demoCountRows("shares", { object_id: id })).toBe(0);

      // What the seed made is everyone's: its Metric is not archived or shared, its Group is not changed, and its words stay.
      expect([await words("series-actions:archiveMetric", ids.ownMetric), await words("canvas-actions:setShare", "dashboard", ids.dashboard, "ben", "editor"), await words("team-actions:setMember", ids.group, "anna", true), await words("team-actions:deleteGroup", ids.group)]
        .every((w) => w === DEMO_SHOWCASE || w === DEMO_SEEDED_WORDS)).toBe(true);
      expect([DEMO_SHOWCASE, DEMO_SEEDED_WORDS]).toContain(await words("team-actions:renameGroup", ids.group, "Renamed group"));
      // Words, formulas, numbers and rows are held to the demo's rules, with its own words, and before anything is written.
      expect(await words("team-actions:createGroup", "see www.example.com")).toMatch(/link|address/i);
      expect(await words("actions:createDerivedMetric", null, form({ name: "Too many", formula: "{a}+{b}+{c}+{d}+{e}+{f}" }))).toBe(DEMO_METRIC_WORDS.formula);
      expect(await words("series-actions:saveSeriesRows", id, "target", [{ period: ids.period, value: 1e15 }], "")).toBe(DEMO_METRIC_WORDS.number);
      expect(await words("series-actions:saveSeriesRows", id, "target", Array.from({ length: 61 }, () => ({ period: ids.period, value: 1 })), "")).toBe(DEMO_METRIC_WORDS.rows);
      expect(await words("canvas-actions:assignInPlace", { metricId: id, period: ids.period, assigneeId: "ben", kind: "task", text: "Soon", due: day(900) })).toBe(DEMO_METRIC_WORDS.due);
      expect(await words("actions:createMetric", form({ ...base, name: "A Metric with a link: www.example.com" }))).toMatch(/link|address/i);
      // A Contact or a hand-over stays outside, with the sentence.
      expect(await words("team-actions:addContact", { name: "Ann Other", email: "ann@contact.test" })).toBe(demoReadOnlyWords());
      expect(await words("series-actions:handOverMetricTo", id, "ben")).toBe(demoReadOnlyWords());
    } finally {
      viewAs("sara");
    }
    expect(await demoWalkOutbound()).toEqual(outboundAtStart);
    expect(outboundAtStart).toEqual({ notInOutbox: 0, webhooks: 0, webhookSends: 0 });
  }, 300_000);

  it("is refused, with the sentence, what the demo keeps blocked, and with the words of the demo what it protects", async () => {
    const sentence = demoReadOnlyWords();
    for (const [key, args] of [
      ["theme-actions:setDefaultTheme", [ids.otherTheme]], ["theme-actions:importTheme", [JSON.stringify(themeToFile("Our look", STANDARD_THEMES[0].tokens, STANDARD_THEMES[0].slides))]],
      ["design-actions:addViewDesign", [JSON.stringify(BUILT_IN_DESIGNS.number)]], ["series-actions:handOverMetricTo", [ids.ownMetric, "t-nobody"]], ["team-actions:addContact", [{ name: "Ann Other", email: "ann@contact.test" }]],
      ["view-link-actions:createViewLink", ["dashboard", ids.dashboard, { label: "For the board", expires: day(7), frozen: false }]],
    ] as [string, unknown[]][]) {
      // A refusal is answered as words, or thrown by an action that does not catch it: the sentence either way.
      const r = await call(key, ...args).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })) as { error?: string };
      expect(r?.error, key).toBe(sentence);
    }
    // The showcase and the seed's words: a refusal in the demo's own words, never a change.
    await demoWalkClearCounts();
    const showcase = (await call("canvas-actions:placeWidget", ids.dashboard, { type: "metric", id: ids.metric })) as { error?: string };
    expect(showcase?.error).toBe("Everyone sees this one as it is. Make your own to change it.");
    const text = (await call("canvas-actions:createDashboardNamed", "see www.example.com")) as { error?: string };
    expect(text?.error).toMatch(/link|address/i);
  }, 180_000);
});
