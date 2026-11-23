// Send Snapshot and the Finished Period against the real database (spec 0045, ticket #793; GLOSSARY: Send Snapshot,
// Finished Period, Snapshot, Workflow, Quiet Hours, Guest): once the last value is locked and the last Checklist Task
// ticked off, the step takes (or finds) the period's Snapshot as the Workflow's owner, shows it and sends each named
// person who may open the dashboard a link, once per period. The message holds no value and no Metric name, a person who
// may not open the dashboard gets nothing and only the owner is told who, and the Snapshot opened by a recipient holds
// only the Metrics that recipient sees.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, format, startOfMonth, subMonths } from "date-fns";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { periodFinished } from "./period-finished";
import { markTaskDone } from "./questions";
import { setMyQuietHours } from "./quiet-hours";
import { checkFinishedPeriod } from "./send-snapshot";
import { share } from "./sharing";
import { editSnapshotWords, listSnapshots, openSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { setTellStopped } from "./tell";
import { runWorkflows, setLock } from "./workflow-engine";
import { saveWorkflow } from "./workflows";
import { archivedMetricHolds } from "./internal/delivery-send";
import { updateWorkflowWithKey } from "./api-workflows";
import { removeMember } from "./handover";
import { openWorkflowRow } from "./workflow-rows";
import { auditRowsOf, opened, workspace } from "./test/db-fixtures";
import type { ChecklistItem, WorkflowStep } from "./types";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
// Email is set up, as in the Quiet Hours tests, so that a message is queued (and held) instead of waiting in the Outbox.
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
type W = Awaited<ReturnType<typeof ws>>;
const address = (who: string) => `${who}-${Math.random().toString(36).slice(2, 10)}@example.test`;
/** A quiet rule that covers the current hour, the one before and the one after, in UTC, whenever this runs. */
const aroundNow = () => { const h = new Date().getUTCHours(); return { fromHour: (h + 23) % 24, toHour: (h + 2) % 24, days: [], timeZone: null }; };

// The period is last month, whenever this runs: a Send Snapshot step only sends a period that ended less than 60 days ago.
const LAST = format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd");
/** A run on the 5th of this month: the Workflow's period is last month. */
const ASOF = format(addDays(startOfMonth(new Date()), 4), "yyyy-MM-dd");
const SEND = "send-snap-aaaa";
const CLAIM = "send-snapshot";
const publish: WorkflowStep = { type: "publish", lock: true };
const tick = (assignee: string): ChecklistItem => ({ type: "checklist", id: "tick-one-aaaa", kind: "tick", text: "Reconcile the bank account", assignee, dueWorkingDays: 3 });

/** Dates the Workflow's Checklist Items and Send Snapshot step long ago, as if they had been saved before the period ended. */
async function makeOld(flow: number) {
  const config = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
  await db().from("workflows").update({ config: { ...config, steps: config.steps.map((s: { addedOn?: string }) => (s.addedOn ? { ...s, addedOn: "2000-01-01" } : s)) } }).eq("id", flow);
}

/** The kind-`checklist` Deliveries a person was sent, opened. */
async function messages(w: W, person: string) {
  const { data } = await db().from("deliveries").select("id, kind, subject, body, sender_id, mail_state, not_before, tell_workflow_id").eq("workspace_id", w.id).eq("recipient_id", person).eq("kind", "checklist").order("id");
  return opened("deliveries", w.id, data);
}
async function notices(w: W, person: string) {
  const { data } = await db().from("deliveries").select("id, kind, subject, body").eq("workspace_id", w.id).eq("recipient_id", person).eq("kind", "notice").order("id");
  return opened("deliveries", w.id, data);
}
const runsOf = async (flow: number, kind: string) => (await db().from("workflow_step_runs").select("step_id, period_start, kind, sent, skipped, snapshot_id").eq("workflow_id", flow).eq("kind", kind).order("id")).data ?? [];
const snapshotsOf = async (dash: number) => (await db().from("dashboard_snapshots").select("id, automatic, shown_at, shown_by, taken_by, period_start").eq("dashboard_id", dash).is("deleted_at", null).order("id")).data ?? [];

/** Sara owns the Workflow and the dashboard "Board KPIs" of `metrics` Metrics (each of her own, "Secret metric n"). Ann may open the
 * dashboard and sees the first `annSees` of them; Bob is a member with no Share. The Workflow sends to Ann and Bob. */
async function setup(opts: { metrics?: number; annSees?: number; steps?: WorkflowStep[]; send?: boolean; people?: (p: { ann: string; bob: string }) => string[] } = {}) {
  const w = await ws();
  const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") }); const bob = await w.person("member", { email: address("bob") });
  const count = opts.metrics ?? 2;
  const dash = await createDashboard(w.actor(sara), "Board KPIs");
  const flow = await saveWorkflow(w.actor(sara), null, "Month-end close", { dueWorkingDays: 2, steps: [...(opts.steps ?? []), ...(opts.send === false ? [] : [{ type: "send_snapshot", id: SEND, dashboardId: dash, people: (opts.people ?? ((p) => [p.ann, p.bob]))({ ann, bob }), groups: [] } as WorkflowStep]), publish] });
  // Saved before the period ended (a step saved now sends nothing for a period that ended before it).
  await makeOld(flow);
  const metrics: { id: number; slug: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const m = await w.metric(sara, { name: `Secret metric ${i}`, workflow_id: flow });
    await w.value(m.id, LAST, 777_000 + i, sara);
    await placeWidget(w.actor(sara), dash, { type: "metric", id: m.id });
    if (i <= (opts.annSees ?? count)) await w.share(m.id, ann);
    metrics.push(m);
  }
  await share(w.actor(sara), "dashboard", dash, ann, "viewer");
  const lockAll = async () => { for (const m of metrics) await setLock(w.id, m.id, LAST, true, sara); };
  return { w, sara, ann, bob, dash, flow, metrics, lockAll };
}

describe("a finished period", () => {
  it("sends a link, once the last value locks, to who may open the dashboard, and tells only the owner who could not", async () => {
    const { w, sara, ann, bob, dash, flow, metrics } = await setup();
    await setLock(w.id, metrics[0].id, LAST, true, sara);
    expect(await messages(w, ann)).toHaveLength(0);
    expect(await snapshotsOf(dash)).toHaveLength(0);
    await setLock(w.id, metrics[1].id, LAST, true, sara);
    const [sent] = await messages(w, ann);
    const [snap] = await snapshotsOf(dash);
    expect(sent).toMatchObject({ kind: "checklist", sender_id: sara, tell_workflow_id: flow });
    expect(sent.subject).toContain("is finished");
    expect(sent.body).toContain(`/dashboards/${dash}/snapshots/${snap.id}`);
    expect(sent.body).toContain("Board KPIs");
    // A link only: no value, no Metric name, none of the Snapshot's words.
    expect(`${sent.subject} ${sent.body}`).not.toMatch(/Secret metric|777/);
    // Taken and shown as the Workflow's owner, by the step.
    expect(snap).toMatchObject({ automatic: true, taken_by: sara, shown_by: sara });
    expect(snap.shown_at).not.toBeNull();
    // Bob may not open the dashboard: nothing about it reaches him; Sara is told who, by name.
    expect(await messages(w, bob)).toHaveLength(0);
    expect((await db().from("deliveries").select("id").eq("workspace_id", w.id).eq("recipient_id", bob)).data).toHaveLength(0);
    const [note] = await notices(w, sara);
    expect(note.body).toMatch(/could not open Board KPIs/);
    expect(await runsOf(flow, "send_snapshot")).toEqual([{ step_id: CLAIM, period_start: LAST, kind: "send_snapshot", sent: 1, skipped: 1, snapshot_id: snap.id }]);
    // Never a Share (beyond Ann's own) and never a View Link.
    expect((await db().from("shares").select("user_id").eq("workspace_id", w.id).eq("object_type", "dashboard")).data).toEqual([{ user_id: ann }]);
    expect((await db().from("view_links").select("id").eq("workspace_id", w.id)).data).toHaveLength(0);
    // The Audit Log says the step did it.
    expect((await auditRowsOf(w.id, "snapshot.taken"))[0].details).toMatchObject({ via: "workflow", workflow_id: flow });
    expect((await auditRowsOf(w.id, "snapshot.shown"))[0].details).toMatchObject({ via: "workflow", workflow_id: flow });
    expect((await auditRowsOf(w.id, "workflow.snapshot_sent"))[0].details).toMatchObject({ snapshot_id: snap.id, sent: 1, skipped: 1 });
  });

  it("gives a recipient who sees 3 of 4 Metrics a Snapshot with 3", async () => {
    const { w, ann, dash, metrics, lockAll } = await setup({ metrics: 4, annSees: 3, people: (p) => [p.ann] });
    await lockAll();
    const [snap] = await snapshotsOf(dash);
    expect(await messages(w, ann)).toHaveLength(1);
    // Ann opens the dashboard, and by it sees all four Metrics, so the Snapshot holds four ...
    expect((await openSnapshot(w.actor(ann, "member"), snap.id as number)).data.metrics).toHaveLength(4);
    // ... until the fourth leaves the dashboard: its Share no longer shows it to her, and the Snapshot she opens holds three.
    const last = (await db().from("widgets").select("id, metric_ids").eq("dashboard_id", dash)).data!.find((x) => x.metric_ids[0] === metrics[3].id)!;
    await db().from("widgets").delete().eq("id", last.id);
    const seen = await openSnapshot(w.actor(ann, "member"), snap.id as number);
    expect(seen.data.metrics).toHaveLength(3);
    expect(seen.hiddenParts).toBe(1);
  });

  it("sends nothing when the period is unlocked and locked again, or when a run comes later", async () => {
    const { w, sara, ann, flow, metrics, lockAll } = await setup({ people: (p) => [p.ann] });
    await lockAll();
    await setLock(w.id, metrics[0].id, LAST, false, sara, "A value was wrong");
    await setLock(w.id, metrics[0].id, LAST, true, sara);
    await runWorkflows(w.id, ASOF, sara);
    await runWorkflows(w.id, format(addDays(new Date(ASOF), 3), "yyyy-MM-dd"), sara);
    expect(await messages(w, ann)).toHaveLength(1);
    expect(await runsOf(flow, "send_snapshot")).toHaveLength(1);
  });

  it("sends once when the checks start at the same moment", async () => {
    const { w, ann, flow, metrics, sara } = await setup({ people: (p) => [p.ann] });
    // Locked without the Lock's own check (as an import or a restore would), then three checks at once.
    for (const m of metrics) await w.lock(m.id, LAST);
    await Promise.all([1, 2, 3].map(() => checkFinishedPeriod(w.id, flow, LAST)));
    await runWorkflows(w.id, ASOF, sara);
    expect(await messages(w, ann)).toHaveLength(1);
    expect(await runsOf(flow, "send_snapshot")).toHaveLength(1);
    expect(await snapshotsOf((await db().from("workflows").select("config").eq("id", flow).single()).data!.config.steps.find((s: { type: string }) => s.type === "send_snapshot").dashboardId)).toHaveLength(1);
  });

  it("is caught up by a run when nothing changed since the last Lock", async () => {
    const { w, sara, ann, metrics } = await setup({ people: (p) => [p.ann] });
    for (const m of metrics) await w.lock(m.id, LAST);
    expect(await messages(w, ann)).toHaveLength(0);
    expect(await runWorkflows(w.id, ASOF, sara)).toContainEqual(expect.stringContaining("Snapshot sent"));
    expect(await messages(w, ann)).toHaveLength(1);
  });

  it("waits for the last Checklist Task: values locked with a Task open is not finished, and ticking it off finishes it", async () => {
    const { w, sara, ann, flow, lockAll, metrics } = await setup({ steps: [], people: (p) => [p.ann] });
    // The item is added to the Workflow after it was made, as an owner would.
    const stored = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { ...stored, steps: [tick(ann), ...stored.steps] });
    // It was there when the period ended (an item saved now would be added after it, and not count for it).
    await makeOld(flow);
    await runWorkflows(w.id, ASOF, sara);
    const task = (await db().from("actions").select("id, status").eq("workflow_id", flow).eq("purpose", "checklist").eq("period_start", LAST).single()).data!;
    await lockAll();
    expect(await periodFinished(w.id, flow, LAST)).toBe(false);
    expect(await messages(w, ann)).toHaveLength(0);
    await markTaskDone(w.actor(ann, "member"), task.id as number);
    expect(await periodFinished(w.id, flow, LAST)).toBe(true);
    expect(await messages(w, ann)).toHaveLength(1);
    // The Task reopened and done again sends nothing more.
    await db().rpc("change_action_status", { p_workspace: w.id, p_id: task.id, p_from: "closed", p_to: "open", p_asker: sara, p_assignee: ann });
    expect(await periodFinished(w.id, flow, LAST)).toBe(false);
    await markTaskDone(w.actor(ann, "member"), task.id as number);
    expect(await messages(w, ann)).toHaveLength(1);
    expect(metrics.length).toBe(2);
  });

  it("holds the period while a Task is still to come, and does not count an item added after the period ended", async () => {
    const { w, sara, ann, flow, lockAll } = await setup({ people: (p) => [p.ann] });
    const stored = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { ...stored, steps: [tick(ann), ...stored.steps] });
    // Saved now, after the period ended: it holds nothing back for that period.
    await lockAll();
    expect(await periodFinished(w.id, flow, LAST)).toBe(true);
    expect(await messages(w, ann)).toHaveLength(1);
    // Had it been there when the period ended, its Task not being given yet (the run comes after the Feed's value) holds the period back.
    await makeOld(flow);
    expect(await periodFinished(w.id, flow, LAST)).toBe(false);
  });

  it("never undoes the Lock when the step fails", async () => {
    const { w, sara, flow, metrics } = await setup({ people: (p) => [p.ann] });
    const failing = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // A step the editor would never store: people without Groups. Sending it throws, and the Lock still stands.
    const config = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
    await db().from("workflows").update({ config: { ...config, steps: config.steps.map((s: { type: string }) => (s.type === "send_snapshot" ? { type: "send_snapshot", id: SEND, dashboardId: (s as unknown as { dashboardId: number }).dashboardId, people: "oops" } : s)) } }).eq("id", flow);
    for (const m of metrics) await setLock(w.id, m.id, LAST, true, sara);
    expect((await db().from("period_states").select("state").in("metric_id", metrics.map((m) => m.id)).eq("period_start", LAST)).data).toEqual([{ state: "locked" }, { state: "locked" }]);
    failing.mockRestore();
  });
});

describe("which Snapshot is sent", () => {
  it("uses a shown Snapshot of the period as it is", async () => {
    const { w, sara, ann, dash, lockAll } = await setup({ people: (p) => [p.ann] });
    const id = await takeSnapshot(w.actor(sara), dash, { kind: "month", start: LAST });
    await editSnapshotWords(w.actor(sara), id, { intro: "Our own words." });
    await showSnapshot(w.actor(sara), id);
    await lockAll();
    expect((await snapshotsOf(dash)).map((s) => s.id)).toEqual([id]);
    expect((await messages(w, ann))[0].body).toContain(`/snapshots/${id}`);
  });

  it("shows an automatic draft nobody has written in, and sends it", async () => {
    const { w, sara, ann, dash, lockAll } = await setup({ people: (p) => [p.ann] });
    const id = await takeSnapshot(w.actor(sara), dash, { kind: "month", start: LAST }, { automatic: true });
    await lockAll();
    const [snap] = await snapshotsOf(dash);
    expect(snap).toMatchObject({ id, shown_by: sara });
    expect(snap.shown_at).not.toBeNull();
    expect(await messages(w, ann)).toHaveLength(1);
  });

  it("waits for a draft that was written in, tells the owner once, and sends it on the run after it is shown", async () => {
    const { w, sara, ann, dash, flow, lockAll } = await setup({ people: (p) => [p.ann] });
    const id = await takeSnapshot(w.actor(sara), dash, { kind: "month", start: LAST }, { automatic: true });
    await editSnapshotWords(w.actor(sara), id, { intro: "Written by hand." });
    await lockAll();
    await runWorkflows(w.id, ASOF, sara);
    expect(await messages(w, ann)).toHaveLength(0);
    expect(await runsOf(flow, "send_snapshot")).toHaveLength(0);
    expect((await listSnapshots(w.actor(sara), dash)).filter((s) => s.shownAt)).toHaveLength(0);
    expect((await notices(w, sara)).filter((n) => n.body.includes("draft"))).toHaveLength(1);
    await runWorkflows(w.id, ASOF, sara);
    expect((await notices(w, sara)).filter((n) => n.body.includes("draft"))).toHaveLength(1);
    await showSnapshot(w.actor(sara), id);
    await runWorkflows(w.id, ASOF, sara);
    expect((await messages(w, ann))[0].body).toContain(`/snapshots/${id}`);
    expect(await snapshotsOf(dash)).toHaveLength(1);
  });

  it("takes nothing and tells the owner when they no longer see every Metric on the dashboard", async () => {
    const { w, sara, ann, dash, flow, lockAll } = await setup({ people: (p) => [p.ann] });
    // The dashboard gains a Metric of Ben's that was shared with Sara, and is not any more: she no longer sees every Metric on it.
    const ben = await w.person("member");
    const hidden = await w.metric(ben, { name: "Ben's private Metric" });
    await w.share(hidden.id, sara);
    await placeWidget(w.actor(sara), dash, { type: "metric", id: hidden.id });
    await w.unshare(hidden.id, sara);
    await lockAll();
    expect(await messages(w, ann)).toHaveLength(0);
    expect(await snapshotsOf(dash)).toHaveLength(0);
    expect(await runsOf(flow, "send_snapshot")).toHaveLength(0);
    const [note] = await notices(w, sara);
    expect(note.body).toContain("no longer");
    // The notice names no dashboard and no Metric: the owner may no longer see them.
    expect(note.body).not.toMatch(/Board KPIs|private Metric/);
  });
});

describe("who gets it", () => {
  it("sends to the people of a Group, to a Guest who may open the dashboard, not to one who may not, and not to a member removed before", async () => {
    const { w, sara, ann, bob, dash, flow, lockAll } = await setup({ people: () => [] });
    const cora = await w.person("member", { email: address("cora") });
    const gus = await w.person("guest", { email: address("gus") });
    const gwen = await w.person("guest", { email: address("gwen") });
    const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Board" }).select("id").single();
    for (const p of [cora, bob, gus, gwen, ann]) await db().from("group_members").insert({ workspace_id: w.id, group_id: g!.id, user_id: p });
    await share(w.actor(sara), "dashboard", dash, cora, "viewer");
    await share(w.actor(sara), "dashboard", dash, gus, "viewer");
    const config = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { ...config, steps: config.steps.map((s: WorkflowStep) => (s.type === "send_snapshot" ? { ...s, groups: [g!.id] } : s)) });
    // Ann is removed from the Workspace before the period finishes.
    await w.dropMember(ann);
    await lockAll();
    expect(await messages(w, cora)).toHaveLength(1);
    expect(await messages(w, gus)).toHaveLength(1);
    for (const nobody of [bob, gwen, ann]) expect((await db().from("deliveries").select("id").eq("workspace_id", w.id).eq("recipient_id", nobody)).data).toHaveLength(0);
    // Only Sara hears who could not open it (Bob and Gwen); the removed member is no longer anyone to name.
    const [note] = await notices(w, sara);
    expect(note.body).toMatch(/2 people could not open Board KPIs/);
    expect((await runsOf(flow, "send_snapshot"))[0]).toMatchObject({ sent: 2, skipped: 2 });
    // A Guest's message names no one else.
    expect((await messages(w, gus))[0].body).not.toMatch(/owner t-|member t-/);
  });

  it("holds the message through Quiet Hours and honours \"stop telling me\"", async () => {
    const { w, ann, bob, flow, lockAll, sara } = await setup({ people: (p) => [p.ann, p.bob] });
    await share(w.actor(sara), "dashboard", (await db().from("dashboards").select("id").eq("workspace_id", w.id).single()).data!.id, bob, "viewer");
    await setMyQuietHours(w.actor(ann, "member"), aroundNow());
    await setTellStopped(w.actor(bob, "member"), flow, true);
    await lockAll();
    const [held] = await messages(w, ann);
    expect(held.mail_state).toBe("queued");
    expect(new Date(held.not_before as string).getTime()).toBeGreaterThan(Date.now());
    expect(await messages(w, bob)).toHaveLength(0);
  });
});

describe("the step as saved", () => {
  it("needs a locking Publish step, one dashboard the owner may snapshot, and people of the Workspace", async () => {
    const w = await ws();
    const sara = await w.person("owner"); const ben = await w.person("member"); const outsider = await (await ws()).person("owner");
    const dash = await createDashboard(w.actor(sara), "Board KPIs");
    const other = await createDashboard(w.actor(ben, "member"), "Ben's");
    const step = (over: Record<string, unknown> = {}) => ({ type: "send_snapshot", id: SEND, dashboardId: dash, people: [ben], groups: [], ...over }) as WorkflowStep;
    await expect(saveWorkflow(w.actor(sara), null, "No lock", { dueWorkingDays: 1, steps: [step(), { type: "publish", lock: false }] })).rejects.toThrow(/Publish step must lock/);
    await expect(saveWorkflow(w.actor(sara), null, "Not mine", { dueWorkingDays: 1, steps: [step({ dashboardId: other }), publish] })).rejects.toThrow(/dashboard you own or edit/);
    const id = await saveWorkflow(w.actor(sara), null, "Fine", { dueWorkingDays: 1, steps: [step({ people: [ben, "someone-else", outsider] }), step({ id: "send-snap-bbbb" }), publish] });
    const stored = (await db().from("workflows").select("config").eq("id", id).single()).data!.config.steps.filter((s: { type: string }) => s.type === "send_snapshot");
    // One step only, and a person of another Workspace is left out.
    expect(stored).toHaveLength(1);
    expect(stored[0].people).toEqual([ben]);
    expect(stored[0].addedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await auditRowsOf(w.id, "workflow.send_snapshot_set"))[0].details).toMatchObject({ dashboard_id: dash, people_added: [ben] });
    // A dashboard not picked yet (a template's) is stored as none.
    const open = await saveWorkflow(w.actor(sara), null, "Open", { dueWorkingDays: 1, steps: [step({ dashboardId: 0, people: [] }), publish] });
    expect((await db().from("workflows").select("config").eq("id", open).single()).data!.config.steps[0].dashboardId).toBe(0);
  });

  it("is kept as stored when a key changes the Workflow's other steps, and shown to others without its people", async () => {
    const { w, sara, flow, ann } = await setup({ people: (p) => [p.ann] });
    const key = { personId: sara, workspaceId: w.id, role: "owner" as const, key: { id: "1", scopes: ["workflows:write", "workflows:people", "metrics:read"] } };
    const before = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config.steps.find((s: { type: string }) => s.type === "send_snapshot");
    await updateWorkflowWithKey(key as never, flow, { steps: [{ type: "remind", days_before: 1 }, { type: "publish", lock: true }] }).catch((e) => e);
    const after = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config.steps.find((s: { type: string }) => s.type === "send_snapshot");
    expect(after).toEqual(before);
    const { withoutSnapshotAudience } = await import("./send-snapshot");
    const row = (await db().from("workflows").select("id, owner_id, config").eq("id", flow).single()).data!;
    const [asMember] = await withoutSnapshotAudience(w.actor(ann, "member"), [row]);
    expect((asMember.config as { steps: { type: string; people?: string[]; dashboardId?: number }[] }).steps.find((s) => s.type === "send_snapshot")).toMatchObject({ people: [], groups: [] });
    expect((await withoutSnapshotAudience(w.actor(sara), [row]))[0]).toBe(row);
  });
});

describe("the timeline and the lock summary", () => {
  it("shows the finished line and the sent line, the skipped count only to the owner", async () => {
    const { w, sara, ann, dash, lockAll } = await setup({ people: (p) => [p.ann, p.bob] });
    await lockAll();
    const { periodTimeline } = await import("./period-timeline");
    const owner = await periodTimeline(w.actor(sara), (await db().from("workflows").select("id").eq("workspace_id", w.id).single()).data!.id as number, LAST);
    expect(owner.finished).toBe(true);
    expect(owner.events.find((e) => e.kind === "snapshot_sent")?.text).toMatch(/Sent the Snapshot .* of Board KPIs to 1 person, 1 not sent/);
    expect(owner.events.some((e) => e.kind === "finished" && /is finished/.test(e.text))).toBe(true);
    const viewer = await periodTimeline(w.actor(ann, "member"), (await db().from("workflows").select("id").eq("workspace_id", w.id).single()).data!.id as number, LAST);
    expect(viewer.events.find((e) => e.kind === "snapshot_sent")?.text).toBe(`Sent the Snapshot ${owner.label} of Board KPIs to 1 person`);
    expect(viewer.events.find((e) => e.kind === "snapshot_sent")?.path).toContain(`/dashboards/${dash}/snapshots/`);
  });
});

describe("review fixes", () => {
  it("does not send when the person may no longer open the dashboard by the time the message leaves", async () => {
    const { w, sara, ann, dash, lockAll } = await setup({ people: (p) => [p.ann] });
    await lockAll();
    const { data } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, tell_workflow_id, snapshot_dashboard_id").eq("workspace_id", w.id).eq("recipient_id", ann).eq("kind", "checklist");
    expect(data).toHaveLength(1);
    expect(data![0].snapshot_dashboard_id).toBe(dash);
    expect(await archivedMetricHolds(data![0] as never)).toBeNull();
    await share(w.actor(sara), "dashboard", dash, ann, null);
    expect(await archivedMetricHolds(data![0] as never)).toBe("Not sent.");
  });

  it("does not send a message whose dashboard was deleted while it waited", async () => {
    const { w, ann, dash, lockAll } = await setup({ people: (p) => [p.ann] });
    await lockAll();
    const { data } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, tell_workflow_id, snapshot_dashboard_id").eq("workspace_id", w.id).eq("recipient_id", ann).eq("kind", "checklist");
    await db().from("dashboards").delete().eq("id", dash);
    expect(await archivedMetricHolds(data![0] as never)).toBe("Not sent.");
  });

  it("decides a show against a written edit in one step: whichever comes second, nobody gets a draft shown over someone's words", async () => {
    for (let round = 0; round < 4; round++) {
      const { w, sara, dash } = await setup({ people: (p) => [p.ann] });
      const id = await takeSnapshot(w.actor(sara), dash, { kind: "month", start: LAST }, { automatic: true });
      const [shown, edited] = await Promise.allSettled([showSnapshot(w.actor(sara), id, { workflowId: 1 }), editSnapshotWords(w.actor(sara), id, { intro: "By hand." })]);
      expect(edited.status).toBe("fulfilled");
      const row = (await db().from("dashboard_snapshots").select("shown_at, words_changed_at").eq("id", id).single()).data!;
      // Either the edit came first (the show was refused, the draft stays a draft) or the show did (and the words are marked as changed since).
      if (shown.status === "rejected") expect(row.shown_at).toBeNull();
      else expect(row.words_changed_at).not.toBeNull();
      await w.cleanup();
    }
  });

  it("does not show a draft that was written in meanwhile", async () => {
    const { w, sara, dash } = await setup({ people: (p) => [p.ann] });
    const id = await takeSnapshot(w.actor(sara), dash, { kind: "month", start: LAST }, { automatic: true });
    await editSnapshotWords(w.actor(sara), id, { intro: "By hand." });
    await expect(showSnapshot(w.actor(sara), id, { workflowId: 1 })).rejects.toThrow(/written in/);
    expect((await snapshotsOf(dash))[0].shown_at).toBeNull();
  });

  it("names those over today's limit or past the step's 20 people to the owner, with their reason", async () => {
    const { w, sara, dash, flow, lockAll } = await setup({ people: () => [] });
    const crowd: string[] = [];
    for (let i = 0; i < 22; i++) { const p = await w.person("member", { email: address(`c${i}`) }); await share(w.actor(sara), "dashboard", dash, p, "viewer"); crowd.push(p); }
    const config = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
    // Stored past the editor's limit (as a Group's members are): 22 people named.
    await db().from("workflows").update({ config: { ...config, steps: config.steps.map((s: WorkflowStep) => (s.type === "send_snapshot" ? { ...s, people: crowd } : s)) } }).eq("id", flow);
    await lockAll();
    expect((await runsOf(flow, "send_snapshot"))[0]).toMatchObject({ sent: 20, skipped: 2 });
    expect((await notices(w, sara)).some((n) => /at most/.test(n.body))).toBe(true);
  });

  it("sends nothing for a period that ended before the step was added, and nothing twice when the step is removed and added again", async () => {
    const { w, sara, ann, flow, lockAll } = await setup({ people: (p) => [p.ann] });
    const fresh = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
    // Added now: last month ended before it.
    await db().from("workflows").update({ config: { ...fresh, steps: fresh.steps.map((s: { addedOn?: string }) => (s.addedOn ? { ...s, addedOn: format(new Date(), "yyyy-MM-dd") } : s)) } }).eq("id", flow);
    await lockAll();
    expect(await messages(w, ann)).toHaveLength(0);
    await makeOld(flow);
    await checkFinishedPeriod(w.id, flow, LAST);
    expect(await messages(w, ann)).toHaveLength(1);
    // Removed and added again under another id: the period is not sent twice.
    const cur = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { ...cur, steps: cur.steps.map((s: WorkflowStep) => (s.type === "send_snapshot" ? { ...s, id: "send-snap-zzzz" } : s)) });
    await makeOld(flow);
    await checkFinishedPeriod(w.id, flow, LAST);
    expect(await messages(w, ann)).toHaveLength(1);
  });
});

// Found by the spec's final security review (#794): the paths no single ticket owned.
describe("across the features", () => {
  it("takes a removed person out of the steps, so their item holds no period back and the Snapshot still goes", async () => {
    const { w, sara, ann, bob, flow, lockAll } = await setup({ people: (p) => [p.ann, p.bob] });
    const stored = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
    const info: ChecklistItem = { type: "checklist", id: "info-one-aaaa", kind: "info", text: "Invoices by Friday", day: 1, people: [bob, ann], groups: [] };
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { ...stored, steps: [{ ...tick(bob), standIn: ann }, { ...tick(ann), id: "tick-two-aaaa", standIn: bob }, info, ...stored.steps] });
    await makeOld(flow);
    // Bob leaves before his Task for the period was given: it never will be, so it must not hold the period back.
    await removeMember(w.actor(sara), bob, sara);
    const raw = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config as { steps: Record<string, unknown>[] };
    expect(raw.steps.find((s) => s.id === "tick-one-aaaa")).toMatchObject({ assignee: null, standIn: ann });
    expect(raw.steps.find((s) => s.id === "tick-two-aaaa")).not.toHaveProperty("standIn");
    expect(raw.steps.find((s) => s.id === "info-one-aaaa")!.people).toEqual([ann]);
    expect(raw.steps.find((s) => s.type === "send_snapshot")!.people).toEqual([ann]);
    // Only those fields changed: the sealed words still open at their places.
    const open = (await openWorkflowRow(w.id, (await db().from("workflows").select("id, config").eq("id", flow).single()).data))!.config as { steps: ChecklistItem[] };
    expect(open.steps.filter((s) => s.type === "checklist").map((s) => s.text)).toEqual(["Reconcile the bank account", "Reconcile the bank account", "Invoices by Friday"]);
    // Ann's own item still waits for its Task; with it given and done, the period finishes.
    await runWorkflows(w.id, ASOF, sara);
    const tasks = (await db().from("actions").select("id, assignee_id, checklist_item_id").eq("workflow_id", flow).eq("purpose", "checklist").eq("period_start", LAST)).data ?? [];
    expect(tasks.map((t) => t.checklist_item_id)).toEqual(["tick-two-aaaa"]);
    await lockAll();
    expect(await periodFinished(w.id, flow, LAST)).toBe(false);
    await markTaskDone(w.actor(ann, "member"), tasks[0].id as number);
    expect(await periodFinished(w.id, flow, LAST)).toBe(true);
    expect((await messages(w, ann)).filter((m) => String(m.subject).includes("is finished"))).toHaveLength(1);
  });

  it("writes a leaver out of a Workflow only over the config it read: it moves updated_at, and leaves a Workflow that names nobody alone", async () => {
    const { w, sara, ann, bob, flow } = await setup({ people: (p) => [p.ann, p.bob] });
    const other = await saveWorkflow(w.actor(sara), null, "Other close", { dueWorkingDays: 1, steps: [{ ...tick(ann), id: "tick-other-aaaa" }, publish] });
    const before = async (id: number) => (await db().from("workflows").select("updated_at, config").eq("id", id).single()).data!;
    const [mine, theirs] = [await before(flow), await before(other)];
    await removeMember(w.actor(sara), bob, sara);
    const [mineAfter, theirsAfter] = [await before(flow), await before(other)];
    // A key that read the Workflow before the handover is refused ("changed meanwhile"), never writes the leaver back.
    expect(mineAfter.updated_at).not.toBe(mine.updated_at);
    expect(JSON.stringify(mineAfter.config)).not.toContain(bob);
    expect(theirsAfter).toEqual(theirs);
  });

  it("holds an item whose Assignee left without the handover, and finishes once the Assignee is no longer a member", async () => {
    const { w, sara, bob, flow, lockAll } = await setup({ people: (p) => [p.ann] });
    const stored = (await db().from("workflows").select("config").eq("id", flow).single()).data!.config;
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { ...stored, steps: [tick(bob), ...stored.steps] });
    await makeOld(flow);
    await lockAll();
    expect(await periodFinished(w.id, flow, LAST)).toBe(false);
    await w.dropMember(bob);
    expect(await periodFinished(w.id, flow, LAST)).toBe(true);
  });

  it("does not send a Workflow's message once the Workflow was deleted while it waited", async () => {
    const { w, ann, flow, lockAll } = await setup({ people: (p) => [p.ann] });
    await lockAll();
    const pick = async () => (await db().from("deliveries").select("id, workspace_id, recipient_id, kind, tell_workflow_id, snapshot_dashboard_id").eq("workspace_id", w.id).eq("recipient_id", ann).eq("kind", "checklist")).data!;
    expect(await archivedMetricHolds((await pick())[0] as never)).toBeNull();
    const { error } = await db().from("workflows").delete().eq("id", flow);
    expect(error).toBeNull();
    const [left] = await pick();
    expect(left.tell_workflow_id).toBeNull();
    expect(await archivedMetricHolds(left as never)).toBe("Not sent: the Workflow was deleted.");
  });
});
