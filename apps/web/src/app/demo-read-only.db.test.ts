// Demo Mode is read-only (spec 0029, #271; GLOSSARY: Demo Mode): every server action, run during a demo visit as one
// of the demo's made-up people, refuses with the one sentence and changes no row. The table below names every export
// of every "use server" file, so a new action fails here until someone says what it does in the demo. The database's
// own refusal and the seed are tested in the core (packages/core/src/demo-read-only.db.test.ts).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@ziffr/core/db";
import { demoReadOnlyWords } from "@ziffr/core/demo";
import { DEMO_WORKSPACE_ID } from "@ziffr/core/team";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { seedDemoSnapshots } from "@ziffr/core/demo-snapshots";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// A demo visit as Sara, the demo's Owner, who may try everything a role allows.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => ({ "ziffr-demo": { value: "1" }, "ziffr-viewer": { value: "sara" } } as Record<string, { value: string }>)[name], set: () => {}, delete: () => {}, getAll: () => [] }),
  headers: async () => new Headers({ host: "ziffr.test" }),
}));

const APP = join(__dirname);
const files = (function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) && /^\s*["']use server["']/.test(readFileSync(p, "utf8")) ? [p] : [];
  });
})(APP);

/** The demo's ids the actions are called with, read once. */
type Ids = Record<string, number | string>;
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
type Case = { args: (i: Ids) => unknown[] } | { reads: (i: Ids) => unknown[] } | { nothing: string; args: (i: Ids) => unknown[] } | { outside: string };
const CASES: Record<string, Case> = {
  "access-actions:whoCanSee": { reads: (i) => ["dashboard", i.dashboard] },
  "access-actions:requestAccess": { args: (i) => ["dashboard", i.otherDashboard] },
  "access-actions:decideAccess": { nothing: "the demo holds no access request to decide", args: () => [1, true] },
  "actions:setViewer": { outside: "chooses whose view is shown: a cookie, no row" },
  "actions:createMetric": { args: () => [form({ name: "Visitor metric", period: "month", format: "number", submission_rule: "overwrite", polarity: "higher", aggregation: "sum", decimals: "0", sources: "web_form" })] },
  "actions:simulateMessage": { reads: () => [{ source: "slack", sender: "@sara", text: "closed 2 deals" }] },
  "actions:submitWebForm": { args: (i) => [i.formCode, null, form({ value: "42" })] },
  "actions:createAction": { args: (i) => [{ metricId: i.metric, period: i.period, assigneeId: "ben", question: "Why?" }] },
  "actions:replyToAction": { args: (i) => [i.action, form({ body: "A reply" })] },
  "actions:decideCorrection": { nothing: "the demo holds no proposed Correction", args: (i) => [i.message, true] },
  "actions:setActionStatus": { args: (i) => [i.action, "closed"] },
  "assistant-actions:disconnectAssistant": { nothing: "the demo has no connected assistants", args: () => [1] },
  "auth-actions:sendSignInLink": { outside: "signing in, not the demo Workspace" },
  "auth-actions:signInWith": { outside: "signing in, not the demo Workspace" },
  "auth-actions:signOut": { outside: "signing out, not the demo Workspace" },
  "auth-actions:createWorkspace": { outside: "a Workspace of one's own, never the demo; refused during a demo visit" },
  "auth-actions:switchWorkspace": { outside: "chooses one's own Workspace: a cookie" },
  "auth-actions:acceptInvite": { outside: "joins a real Workspace by its invitation" },
  "auth-actions:askToJoin": { outside: "asks to join a real Workspace" },
  "auth-actions:endMyTrial": { outside: "a Trial Workspace, never the demo" },
  "canvas-actions:placeWidget": { args: (i) => [i.dashboard, { type: "metric", id: i.metric }] },
  "canvas-actions:saveDashboardText": { args: (i) => [i.dashboard, { name: "Renamed by a visitor" }] },
  "canvas-actions:saveLayout": { args: (i) => [i.dashboard, [{ i: String(i.widget), x: 0, y: 0, w: 4, h: 3 }]] },
  "canvas-actions:updateWidget": { args: (i) => [i.widget, { title: "Retitled" }] },
  "canvas-actions:applyTemplate": { args: (i) => [i.widget, i.template, [[i.metric]]] },
  "canvas-actions:removeWidget": { args: (i) => [i.widget] },
  "canvas-actions:saveToPool": { args: (i) => [{ type: "widget", id: i.widget }, "Pooled"] },
  "canvas-actions:deleteSavedWidget": { args: (i) => [i.savedWidget] },
  "canvas-actions:createDashboardNamed": { args: () => ["Visitor dashboard"] },
  "canvas-actions:setShare": { args: (i) => ["dashboard", i.dashboard, "ben", "editor"] },
  "canvas-actions:setGroupShare": { args: (i) => ["dashboard", i.dashboard, i.group, "viewer"] },
  "canvas-actions:canvasAdd": { args: (i) => [[i.metric]] },
  "canvas-actions:canvasRemove": { nothing: "nothing is on the demo's analysis canvas to remove", args: (i) => [i.metric] },
  "canvas-actions:canvasSet": { args: (i) => [[i.metric]] },
  "canvas-actions:getHistory": { reads: (i) => [i.metric] },
  "canvas-actions:assignInPlace": { args: (i) => [{ metricId: i.metric, period: i.period, assigneeId: "ben", kind: "task", text: "Check this" }] },
  "canvas-actions:markTaskDone": { nothing: "Sara has no open task in the demo", args: (i) => [i.task] },
  "connector-actions:setTelegram": { args: () => [true] },
  "connector-actions:telegramLinkStart": { args: () => [] },
  "connector-actions:telegramFormLinkStart": { nothing: "Telegram is off in the demo", args: (i) => [i.formCode] },
  "connector-actions:telegramRemindersAgain": { nothing: "nobody in the demo stopped Telegram reminders", args: () => [] },
  "connector-actions:telegramUnlink": { nothing: "nobody in the demo is linked to Telegram", args: () => [] },
  "connector-actions:emailRemindersAgain": { nothing: "nobody in the demo stopped email reminders", args: () => [] },
  "connector-actions:connectSlack": { args: () => [] },
  "connector-actions:disconnectSlack": { args: () => [] },
  "connector-actions:slackLinkCode": { nothing: "Slack is not connected in the demo", args: () => [] },
  "connector-actions:slackRemindersAgain": { nothing: "nobody in the demo stopped Slack reminders", args: () => [] },
  "connector-actions:unlinkSlack": { nothing: "nobody in the demo is linked to Slack", args: () => [] },
  "connector-actions:setPreference": { args: () => ["sara", "question", "slack"] },
  "connector-actions:simulateReply": { reads: (i) => [i.actionDelivery, "Done, see the sheet"] },
  "connector-actions:simulateTicketClose": { reads: (i) => [i.ticketDelivery] },
  "connector-actions:sendDueReminders": { nothing: "nothing is due right after the seed, which sent the reminders", args: () => [] },
  "connector-actions:askForMissingValues": { nothing: "the seed already asked for every missing value", args: () => [] },
  "connector-actions:simulatePromptAnswer": { reads: (i) => [i.promptDelivery, "42"] },
  "convert-actions:makeDeckFromSnapshot": { args: (i) => [i.snapshot] },
  "convert-actions:makeDeck": { args: (i) => [i.dashboard] },
  "dashboard-template-actions:createFromDashboardTemplate": { args: (i) => ["overview", "From a template", [[i.metric], [i.metric], [i.metric], [i.metric]]] },
  "dashboard-template-actions:draftDashboardTemplate": { reads: (i) => [i.dashboard] },
  "dashboard-template-actions:saveAsDashboardTemplate": { args: (i) => [{ dashboardId: i.dashboard, name: "Visitor template", description: "", labels: [] }] },
  "deck-actions:createDeck": { args: () => [form({ name: "Visitor deck" })] },
  "deck-actions:saveDeck": { args: (i) => [i.deck, { store: {}, schema: {} }] },
  "deck-actions:renameDeck": { args: (i) => [i.deck, "Renamed deck"] },
  "deck-actions:setDeckFooter": { args: (i) => [i.deck, "A footer"] },
  "deck-actions:noteDeckExport": { nothing: "it only records an Audit event, and the demo keeps no Audit Log", args: (i) => [i.deck, "pdf"] },
  "design-actions:addViewDesign": { args: () => [JSON.stringify(BUILT_IN_DESIGNS.number)] },
  "design-actions:removeViewDesign": { nothing: "the demo has no View Designs", args: () => [1] },
  "feed-actions:createFeed": { args: () => ["Visitor feed"] },
  "feed-actions:renameFeed": { args: () => ["feed-x", "Renamed"] },
  "feed-actions:deleteFeed": { args: () => ["feed-x"] },
  "feed-actions:createFeedKey": { args: () => ["feed-x", { name: "k", expiresOn: day(30) }] },
  "feed-actions:revokeFeedKey": { args: () => [1] },
  "feed-actions:addFeedToMetric": { nothing: "the demo has no Feeds", args: (i) => [i.metric, "feed-x"] },
  "feed-actions:removeFeedFromMetric": { nothing: "the demo has no Feeds", args: (i) => [i.metric, "feed-x"] },
  "home-actions:setHome": { args: (i) => [i.dashboard] },
  "home-actions:newDashboard": { args: () => [form({ name: "Visitor dashboard" })] },
  "installation-actions:claimInstallation": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:addInstallationAdmin": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:removeInstallationAdmin": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:saveInstallationSettings": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:checkTelegram": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:sendTestEmail": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:startTelegramTest": { outside: "the Installation, not the demo Workspace" },
  "installation-actions:telegramTestStatus": { outside: "the Installation, not the demo Workspace" },
  "key-actions:createKey": { args: () => [{ name: "Visitor key", scopes: ["metrics:read"], expiresOn: day(30) }] },
  "key-actions:revokeKey": { nothing: "the demo has no Access Keys", args: () => [1] },
  "oauth/authorize/actions:answerConsent": { outside: "connects an assistant to one's own Workspace; refused during a demo visit" },
  "series-actions:saveSeriesRows": { args: (i) => [i.metric, "target", [{ period: i.period, value: 10 }], "Visitor target"] },
  "series-actions:removeSeriesRows": { args: (i) => [i.targetMetric, "target", [i.targetPeriod]] },
  "series-actions:deleteMetric": { nothing: "every Metric of the demo is in use, which is refused before anything changes", args: (i) => [i.ownMetric, i.ownMetricName] },
  "series-actions:setMetricSources": { args: (i) => [i.ownMetric, ["web_form", "slack"]] },
  "series-actions:updateMetricDetails": { args: (i) => [i.ownMetric, { description: "Changed by a visitor" }] },
  "series-actions:askMeNow": { args: (i) => [i.ownMetric] },
  "settings-actions:updateMyProfile": { args: () => [{ name: "Not Sara" }] },
  "settings-actions:renameWorkspace": { args: () => ["Visitor's company"] },
  "settings-actions:setYearStart": { args: () => [4] },
  "settings-actions:setNumberStyle": { args: () => ["1.234,5"] },
  "settings-actions:setAnswerLanguages": { args: () => [["en", "de"]] },
  "settings-actions:setAttainmentMethod": { args: () => ["distance"] },
  "settings-actions:setWorkspaceProfile": { args: () => [{ industry: "retail", segment: null, country: "DE", currency: "EUR", employeeBand: null, revenueBand: null }] },
  "settings-actions:setEmailReminders": { args: () => [false] },
  "snapshot-actions:takeSnapshot": { args: (i) => [i.dashboard, "month", i.lastMonth] },
  "snapshot-actions:setAutoSnapshots": { args: (i) => [i.dashboard, "month", 2] },
  "snapshot-actions:editSnapshotWords": { nothing: "words for none of its widgets change nothing", args: (i) => [i.snapshot, { summary: "Changed" }] },
  "snapshot-actions:showSnapshot": { nothing: "the demo's Snapshots are shown already", args: (i) => [i.snapshot] },
  "snapshot-actions:deleteSnapshot": { args: (i) => [i.snapshot, i.snapshotDashboard] },
  "team-actions:createGroup": { args: () => ["Visitors"] },
  "team-actions:renameGroup": { args: (i) => [i.group, "Renamed group"] },
  "team-actions:deleteGroup": { args: (i) => [i.group] },
  "team-actions:setMember": { args: (i) => [i.group, "anna", true] },
  "team-actions:addContact": { args: () => [{ name: "Ann Other", email: "ann@contact.test" }] },
  "team-actions:removeContact": { nothing: "the demo has no Contacts", args: () => ["nobody"] },
  "team-actions:inviteMember": { args: () => [{ email: "someone@invite.test", role: "member" }] },
  "team-actions:setWorkspaceClock": { args: () => [{ timeZone: "Europe/Berlin", runHour: 7 }] },
  "team-actions:resendInvitation": { args: () => [1] },
  "team-actions:createInviteLink": { args: () => ["member"] },
  "team-actions:revokeInvitation": { nothing: "the demo has no Invitations", args: () => [1] },
  "team-actions:changeRole": { args: () => ["ben", "admin"] },
  "team-actions:setDomainJoining": { args: () => [true] },
  "team-actions:decideJoin": { nothing: "the demo has no requests to join", args: () => [1, true] },
  "team-actions:removeMemberWithHandover": { args: () => ["ben", "anna"] },
  "template-actions:saveSlideLayout": { args: (i) => [{ deckId: i.deck, shapes: [], name: "Layout", description: "", labels: [], choices: {} }] },
  "template-actions:saveTemplate": { args: (i) => [{ widgetId: i.widget, name: "Visitor template", description: "", labels: [], choices: {} }] },
  "template-actions:renameTemplate": { args: (i) => [i.template, "Renamed", ""] },
  "template-actions:deleteTemplate": { args: (i) => [i.template] },
  "theme-actions:saveTheme": { args: (i) => [i.theme, "Renamed theme", i.themeTokens, i.themeSlides] },
  "theme-actions:duplicateTheme": { args: (i) => [i.theme] },
  "theme-actions:deleteTheme": { args: (i) => [i.otherTheme] },
  "theme-actions:setDefaultTheme": { args: (i) => [i.theme] },
  "theme-actions:setDashboardTheme": { args: (i) => [i.dashboard, i.theme] },
  "theme-actions:setDeckTheme": { args: (i) => [i.deck, i.theme] },
  "try/start/actions:moveGuide": { outside: "a Trial Workspace's guide, never the demo" },
  "try/start/actions:skipGuide": { outside: "a Trial Workspace's guide, never the demo" },
  "try/start/actions:askGuide": { outside: "a Trial Workspace's guide, never the demo" },
  "try/start/actions:guideValue": { outside: "a Trial Workspace's guide, never the demo" },
  "try/start/actions:makeN8nKey": { outside: "a Trial Workspace's guide, never the demo" },
  "version-actions:listVersions": { reads: (i) => ["dashboard", i.dashboard] },
  "version-actions:nameVersion": { nothing: "the demo has no Versions", args: () => [1, "Named"] },
  "version-actions:restoreVersion": { nothing: "the demo has no Versions", args: () => [1] },
  "version-actions:saveNamedVersion": { args: (i) => ["dashboard", i.dashboard, "A visitor's version"] },
  "view-link-actions:listViewLinks": { reads: (i) => ["dashboard", i.dashboard] },
  "view-link-actions:createViewLink": { args: (i) => ["dashboard", i.dashboard, { label: "For the board", expires: day(7), frozen: false }] },
  "view-link-actions:shownSnapshots": { reads: (i) => [i.snapshotDashboard] },
  "view-link-actions:revokeViewLink": { nothing: "the demo has no View Links", args: () => [1] },
  "workflow-actions:saveWorkflow": { args: (i) => [i.workflow, "Renamed workflow", i.workflowConfig] },
  "workflow-actions:deleteWorkflow": { args: (i) => [i.workflow] },
  "workflow-actions:setMetricWorkflow": { args: (i) => [i.ownMetric, null] },
  "workflow-actions:runWorkflowsNow": { args: () => [day()] },
  "workflow-actions:runTodayNow": { args: () => [] },
  "workflow-actions:approveValue": { nothing: "no Approval in the demo waits for Sara", args: (i) => [i.approval] },
  "workflow-actions:sendValueBack": { nothing: "no Approval in the demo waits for Sara", args: (i) => [i.approval, "Please check"] },
  "workflow-actions:lockPeriod": { args: (i) => [i.ownMetric, i.lastMonth, true, "Closing"] },
  "workflow-actions:closeWorkflowPeriod": { args: (i) => [i.workflow, day()] },
  "workflow-actions:setStandIn": { nothing: "Ben submits none of Sara's first Metric", args: (i) => [i.ownMetric, "ben", "anna"] },
  "workflow-actions:setAway": { args: () => ["sara", day(1), day(5)] },
};

/** One row per demo row of every table with a workspace, and the demo's people: changed by anything at all. */
async function fingerprint(): Promise<Record<string, string>> {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
  const spec = (await res.json()) as { definitions: Record<string, { properties?: Record<string, unknown> }> };
  const tables = Object.entries(spec.definitions).filter(([, d]) => d.properties && "workspace_id" in d.properties).map(([t]) => t).sort();
  const out: Record<string, string> = {};
  for (const t of tables) {
    const { data, error } = await db().from(t).select("*").eq("workspace_id", DEMO_WORKSPACE_ID);
    if (error) continue; // A view that cannot be filtered so; its tables are counted on their own.
    out[t] = createHash("sha256").update(JSON.stringify([...(data ?? [])].map((r) => JSON.stringify(r)).sort())).digest("hex");
  }
  const { data: people } = await db().from("profiles").select("*").in("id", ["sara", "ben", "anna"]);
  out.profiles = createHash("sha256").update(JSON.stringify(people)).digest("hex");
  const { count } = await db().from("profiles").select("id", { count: "exact", head: true });
  out["profiles (count)"] = String(count);
  const { count: ws } = await db().from("workspaces").select("id", { count: "exact", head: true });
  out["workspaces (count)"] = String(ws);
  return out;
}

/** What the walk needs from the demo's seed, or a clear failure when the seed lacks it. */
function must<T>(data: T | null | undefined): T {
  if (data === null || data === undefined) throw new Error("The demo seed lacks what the walk needs.");
  return data;
}

let before: Record<string, string>;
beforeAll(async () => {
  const D = DEMO_WORKSPACE_ID;
  const metric = must((await db().from("metrics").select("id, name").eq("workspace_id", D).eq("owner_id", "sara").is("formula", null).order("id").limit(1).single()).data);
  const dashboard = must((await db().from("dashboards").select("id").eq("workspace_id", D).eq("owner_id", "sara").order("id").limit(1).single()).data);
  const otherDashboard = await db().from("dashboards").select("id").eq("workspace_id", D).neq("owner_id", "sara").order("id").limit(1).maybeSingle();
  const widget = must((await db().from("widgets").select("id").eq("workspace_id", D).eq("dashboard_id", dashboard.id).order("id").limit(1).single()).data);
  const deck = must((await db().from("decks").select("id").eq("workspace_id", D).order("id").limit(1).single()).data);
  const template = await db().from("team_templates").select("id").eq("workspace_id", D).order("id").limit(1).maybeSingle();
  const savedWidget = await db().from("widgets").select("id").eq("workspace_id", D).is("dashboard_id", null).order("id").limit(1).maybeSingle();
  const group = await db().from("groups").select("id").eq("workspace_id", D).eq("everyone", false).order("id").limit(1).maybeSingle();
  const themes = (await db().from("themes").select("id, tokens, slides, is_default").eq("workspace_id", D).order("id")).data ?? [];
  const workflow = must((await db().from("workflows").select("id, config").eq("workspace_id", D).order("id").limit(1).single()).data);
  // The SQL seed makes no Snapshots (the nightly job's core seed does): make them as it would, if there are none.
  const live = await db().from("dashboard_snapshots").select("id", { count: "exact", head: true }).eq("workspace_id", D).is("deleted_at", null);
  if (!live.count) await seedDemoSnapshots();
  const snapshot = await db().from("dashboard_snapshots").select("id, dashboard_id").eq("workspace_id", D).is("deleted_at", null).order("id").limit(1).maybeSingle();
  const action = await db().from("actions").select("id").eq("workspace_id", D).eq("kind", "question").order("id").limit(1).maybeSingle();
  const task = await db().from("actions").select("id").eq("workspace_id", D).eq("kind", "task").eq("assignee_id", "sara").eq("status", "open").order("id").limit(1).maybeSingle();
  const approval = await db().from("actions").select("id").eq("workspace_id", D).eq("purpose", "approval").order("id").limit(1).maybeSingle();
  const message = await db().from("thread_messages").select("id").eq("workspace_id", D).order("id").limit(1).maybeSingle();
  const token = await db().from("tokens").select("code").eq("workspace_id", D).order("id").limit(1).maybeSingle();
  const version = await db().from("versions").select("id").eq("workspace_id", D).order("id").limit(1).maybeSingle();
  const target = await db().from("series_values").select("metric_id, period_start").eq("workspace_id", D).eq("kind", "target").order("id").limit(1).maybeSingle();
  const canvas = await db().from("analysis_canvas").select("metric_id").eq("workspace_id", D).limit(1).maybeSingle();
  const deliveries = (await db().from("deliveries").select("id, connector, kind, action_id").eq("workspace_id", D).order("id")).data ?? [];
  const m = new Date();
  ids = {
    metric: metric.id, ownMetric: metric.id, ownMetricName: metric.name, dashboard: dashboard.id, otherDashboard: otherDashboard.data?.id ?? dashboard.id,
    widget: widget.id, deck: deck.id, template: template.data?.id ?? 1, savedWidget: savedWidget.data?.id ?? 1, group: group.data?.id ?? 1,
    theme: themes[0]?.id ?? 1, otherTheme: themes.find((t) => !t.is_default)?.id ?? 1, workflow: workflow.id, snapshot: snapshot.data?.id ?? 1, snapshotDashboard: snapshot.data?.dashboard_id ?? dashboard.id,
    action: action.data?.id ?? 1, task: task.data?.id ?? 1, approval: approval.data?.id ?? 1, message: message.data?.id ?? 1, formCode: token.data?.code ?? "tk-none",
    version: version.data?.id ?? 1, targetMetric: target.data?.metric_id ?? metric.id, targetPeriod: target.data?.period_start ?? day(),
    canvasMetric: canvas.data?.metric_id ?? metric.id,
    actionDelivery: deliveries.find((d) => d.action_id && d.connector !== "tickets")?.id ?? 0, ticketDelivery: deliveries.find((d) => d.connector === "tickets")?.id ?? 0,
    promptDelivery: deliveries.find((d) => d.kind === "prompt")?.id ?? 0,
    period: new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1)).toISOString().slice(0, 10),
    lastMonth: new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1)).toISOString().slice(0, 10),
  };
  Object.assign(ids, { workflowConfig: workflow.config, themeTokens: themes[0]?.tokens ?? {}, themeSlides: themes[0]?.slides ?? {} });
  before = await fingerprint();
});

afterAll(async () => {
  // Whatever any action did, the demo is as it was.
  expect(await fingerprint()).toEqual(before);
});

const exportsOf = async (file: string) => Object.entries(await import(file)).filter(([, v]) => typeof v === "function") as [string, (...a: unknown[]) => Promise<unknown>][];
const keyOf = (file: string, name: string) => `${relative(APP, file).replace(/\.tsx?$/, "")}:${name}`;

describe("every server action in the demo", () => {
  it("is in the table", async () => {
    const all = (await Promise.all(files.map(async (f) => (await exportsOf(f)).map(([n]) => keyOf(f, n))))).flat().sort();
    expect(all.filter((k) => !(k in CASES))).toEqual([]);
    expect(Object.keys(CASES).filter((k) => !all.includes(k))).toEqual([]);
  });

  it("refuses a change with the one sentence and saves nothing", async () => {
    const sentence = demoReadOnlyWords();
    const wrong: string[] = [];
    for (const file of files) {
      for (const [name, fn] of await exportsOf(file)) {
        const c = CASES[keyOf(file, name)];
        if (!c || "outside" in c) continue;
        let answer: unknown;
        let thrown: unknown;
        try {
          answer = await fn(...("args" in c ? c.args(ids) : c.reads(ids)));
        } catch (e) {
          thrown = e;
        }
        const words = thrown instanceof Error ? thrown.message : (answer as { error?: unknown } | undefined)?.error;
        if ("args" in c && !("nothing" in c) && words !== sentence) wrong.push(`${keyOf(file, name)}: ${thrown ? `threw ${String(words)}` : `answered ${JSON.stringify(answer)?.slice(0, 160)}`}`);
        // A read or a preview never meets the sentence: it changes nothing to be refused.
        if ("reads" in c && words === sentence) wrong.push(`${keyOf(file, name)}: a read refused as a change`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
