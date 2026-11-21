// A Guest never sees who else is in the Workspace (owner decision on #549, ticket #560; GLOSSARY: Guest): no other
// person's name, email, handle or id in any read the Guest can make. One Workspace with people everywhere on what the
// Guest sees (owner, Submitter, Editor, Approver, thread author, Snapshot author), walked read by read.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor, type KeyActor } from "./actor";
import { db } from "./db";
import { getCanvasData, peopleFor } from "./access";
import { getMetric, getThreads, listGroups, listMetrics, listObservations, listPeople } from "./api";
import { getDashboardWithKey, listDashboardsWithKey } from "./api-dashboards";
import { listActionsWithKey } from "./api-actions";
import { listSubmittersWithKey } from "./api-metrics";
import { whoCanSeeWithKey } from "./api-sharing";
import { createDashboard, placeWidget, updateWidget } from "./dashboards";
import { createDeck, saveDeck } from "./decks";
import { activityView, actionThread, closedDashboardOwner, connectorsView, dashboardWidgets, deckView, metricExtras, savedWidgets, sourcesView, workflowsView } from "./page-data";
import { ask, reply } from "./questions";
import { periodRecord } from "./period-record";
import { schedule } from "./schedule";
import { deliverNotice } from "./deliveries";
import { showSnapshot } from "./snapshots";
import { search } from "./search";
import { share, whoCanSee } from "./sharing";
import { listSnapshots, openSnapshot, takeSnapshot } from "./snapshots";
import { periodTimeline } from "./period-timeline";
import { tellEditorFacts } from "./tell";
import { listVersions, saveNamedVersion } from "./version-history";
import { createGroup, setGroupMember } from "./team";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { periodStart, JANUARY } from "./periods";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const month = periodStart(new Date(), "month", JANUARY);
/** Fields that only point at a person (resolved to a name through peopleFor, so "Someone" for a Guest). An id is
 * opaque; the name, email and handle behind it are what a Guest is never shown. Anywhere else, an id is a leak. */
const REFERENCES = new Set(["owner_id", "author_id", "author", "asker_id", "assignee_id", "submitter_id", "sender_id", "recipient_id", "asked_by", "assignee", "submitter", "owner", "by", "person_id", "user_id", "requester_id", "taken_by", "takenBy", "approvers", "people"]);

/** Every string in a value that is not a reference field's, with the id-only strings in references left out. */
function strings(value: unknown, field = ""): { text: string; reference: boolean }[] {
  if (typeof value === "string") return [{ text: value, reference: REFERENCES.has(field) }];
  if (Array.isArray(value)) return value.flatMap((v) => strings(v, field));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [{ text: k, reference: false }, ...strings(v, k)]);
  return [];
}
/** The reads a Guest is refused (they show nobody): a Theme's history, and the key's sharing scope. */
const REFUSED = new Set(["versionsTheme", "apiWhoCanSee"]);
const key = (a: Actor): KeyActor => ({ personId: a.personId, workspaceId: a.workspaceId, role: a.role, key: { id: "1", scopes: ["metrics:read", "dashboards:read", "actions:read", "shares:write"] } });

async function setUp() {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const tag = randomUUID().slice(0, 8);
  const sara = await w.person("owner", { email: `sara-${tag}@example.test`, slack_handle: `@sara-${tag}` });
  const ben = await w.person("member", { email: `ben-${tag}@example.test`, slack_handle: `@ben-${tag}` });
  const cleo = await w.person("member", { email: `cleo-${tag}@example.test` });
  const gus = await w.person("guest");
  for (const [id, name] of [[sara, `Sara Ownerly ${tag}`], [ben, `Ben Builder ${tag}`], [cleo, `Cleo Hidden ${tag}`]] as const) await db().from("profiles").update({ name }).eq("id", id);
  const owner = w.actor(sara); const editor = w.actor(ben, "member"); const guest = w.actor(gus, "guest");
  const shared = await w.metric(sara, { name: "Field visits" });
  await w.value(shared.id, month, 10, ben);
  await w.token(shared.id, ben, { stand_in_id: gus });
  await w.share(shared.id, gus);
  const flow = await saveWorkflow(owner, null, "Close", { dueWorkingDays: 1, steps: [{ type: "approve", approvers: [ben], values: "every" }, { type: "publish", lock: false }] });
  await setMetricWorkflow(owner, shared.id, flow);
  const dash = await createDashboard(owner, "Overview");
  await share(owner, "dashboard", dash, gus, "viewer");
  await share(owner, "dashboard", dash, ben, "editor");
  const widget = await placeWidget(owner, dash, { type: "spec", template: "number", metricIds: [shared.id], settings: {} });
  await updateWidget(editor, widget, { title: "Edited" });
  await saveNamedVersion(editor, "dashboard", dash, "Release one");
  const snap = await takeSnapshot(editor, dash, { kind: "month", start: "2026-09-01" });
  const deck = await createDeck(owner, "Board");
  await saveDeck(owner, deck, { store: { "shape:1": { type: "ziffr-widget", props: { metricIds: [shared.id], settings: "{}" } } } });
  await share(owner, "deck", deck, gus, "viewer");
  // Text Ziffr wrote itself: a late value proposed to the owner, naming its sender.
  await db().from("actions").insert({ workspace_id: w.id, metric_id: shared.id, period_start: month, asker_id: ben, assignee_id: sara, kind: "question", purpose: "approval", question: "Field visits is locked. Ben sent 12 late: accept it?", read_group_id: null });
  await showSnapshot(editor, snap);
  const ownerName = `Sara Ownerly ${tag}`;
  await deliverNotice(w.id, { recipientId: gus, senderId: sara, subject: `${ownerName} shared Overview`, text: `Sara wrote to sara-${tag}@example.test about Overview.`, link: "/dashboards" });
  const closedDash = await createDashboard(owner, "Closed");
  const closedDeck = await createDeck(owner, "Closed deck");
  const field = await createGroup(owner, "Field");
  await setGroupMember(owner, field, gus, true);
  await setGroupMember(owner, field, ben, true);
  const action = await ask(owner, { metricId: shared.id, period: month, assigneeId: gus, text: "Why the dip?" });
  await reply(guest, action, "Rain.", null);
  await db().from("thread_messages").insert({ workspace_id: w.id, action_id: action, author_id: ben, body: "Checked on site." });
  const others = [
    { id: sara, name: `Sara Ownerly ${tag}`, email: `sara-${tag}@example.test`, handle: `@sara-${tag}` },
    { id: ben, name: `Ben Builder ${tag}`, email: `ben-${tag}@example.test`, handle: `@ben-${tag}` },
    { id: cleo, name: `Cleo Hidden ${tag}`, email: `cleo-${tag}@example.test`, handle: "" },
  ];
  return { w, closedDash, closedDeck, guest, owner, shared, dash, deck, widget, snap, action, flow, tag, others, gus };
}

describe("a Guest, whatever they read", () => {
  it("is shown no other person's name, email, handle or id", async () => {
    const s = await setUp();
    const { guest, closedDash, closedDeck, shared, dash, deck, widget, snap, action, flow } = s;
    const reads: Record<string, () => Promise<unknown>> = {
      peopleFor: () => peopleFor(guest),
      canvas: () => getCanvasData(guest.workspaceId, guest.personId),
      whoCanSeeMetric: () => whoCanSee(guest, "metric", shared.id),
      whoCanSeeDashboard: () => whoCanSee(guest, "dashboard", dash),
      whoCanSeeDeck: () => whoCanSee(guest, "deck", deck),
      versionsDashboard: () => listVersions(guest, "dashboard", dash),
      versionsWidget: () => listVersions(guest, "widget", widget),
      versionsMetric: () => listVersions(guest, "metric", shared.id),
      versionsSnapshot: () => listVersions(guest, "snapshot", snap),
      activity: () => activityView(guest),
      thread: () => actionThread(guest, action),
      metricExtras: () => metricExtras(guest, shared.id, "month"),
      connectors: () => connectorsView(guest),
      sources: () => sourcesView(guest),
      workflows: () => workflowsView(guest),
      timeline: () => periodTimeline(guest, flow, month),
      tell: () => tellEditorFacts(guest, flow),
      savedWidgets: () => savedWidgets(guest),
      dashboardWidgets: () => dashboardWidgets(guest, dash),
      deck: () => deckView(guest, deck),
      snapshots: () => listSnapshots(guest, dash),
      snapshot: () => openSnapshot(guest, snap),
      closedDashboard: () => closedDashboardOwner(guest, closedDash),
      closedDeck: () => deckView(guest, closedDeck),
      periodRecord: () => periodRecord(guest, shared.slug, month),
      schedule: () => schedule(guest, { from: month, to: month }),
      versionsWorkflow: () => listVersions(guest, "workflow", flow),
      versionsTheme: () => listVersions(guest, "theme", 1),
      searchSara: () => search(guest, "Sara"),
      searchBen: () => search(guest, "Ben"),
      searchCleo: () => search(guest, "Cleo"),
      searchBuilder: () => search(guest, "Builder"),
      searchFree: () => search(guest, "Field"),
      apiPeople: () => listPeople(key(guest), { limit: 50 }),
      apiGroups: () => listGroups(key(guest), { limit: 50 }),
      apiMetrics: () => listMetrics(key(guest), { limit: 50 }),
      apiMetric: () => getMetric(key(guest), shared.slug),
      apiObservations: () => listObservations(key(guest), shared.slug, { limit: 50 }),
      apiThreads: () => getThreads(key(guest), shared.slug, month),
      apiSubmitters: () => listSubmittersWithKey(key(guest), shared.slug),
      apiDashboards: () => listDashboardsWithKey(key(guest)),
      apiDashboard: () => getDashboardWithKey(key(guest), dash),
      apiActions: () => listActionsWithKey(key(guest), { limit: 50 }),
      apiWhoCanSee: () => whoCanSeeWithKey(key(guest), "metric", shared.slug),
    };
    const leaks: string[] = [];
    for (const [name, read] of Object.entries(reads)) {
      let found: ReturnType<typeof strings>;
      try { found = strings(await read()); } catch (e) {
        // A refusal shows nobody, but only the reads listed here may refuse: a crash must not read as clean.
        if (!(e instanceof Forbidden) || !REFUSED.has(name)) throw e;
        continue;
      }
      for (const o of s.others) {
        for (const needle of [o.name, o.name.split(" ")[0], o.email, o.handle]) if (needle && found.some((f) => f.text.includes(needle))) leaks.push(`${name}: ${needle}`);
        if (found.some((f) => !f.reference && f.text.includes(o.id))) leaks.push(`${name}: ${o.id}`);
      }
    }
    expect(leaks).toEqual([]);
  });
});
