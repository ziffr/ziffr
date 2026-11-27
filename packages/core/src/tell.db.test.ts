// The Workflow step Tell against the real database (spec 0032, ticket #377; GLOSSARY: Tell, Alert, Group, Import):
// told once per crossing, People and Groups with sight only (the rest skipped without a word), approved values only,
// silent Imports, two values at once tell once, "stop telling me", the limits of a step, and what the editor is shown.
import { afterEach, describe, expect, it, vi } from "vitest";
import { TELL_STEPS_PER_WORKFLOW } from "./alert-limits";
import { db } from "./db";
import { optOutByToken, unsubscribeIsTell } from "./email-opt-out";
import { archivedMetricHolds } from "./internal/delivery-send";
import { checkTells } from "./tell-firing";
import { listTellSubscriptions, setTellStopped, tellEditorFacts } from "./tell";
import { periodStart, JANUARY } from "./periods";
import { workspace, opened } from "./test/db-fixtures";
import { approve, onValue } from "./workflow-engine";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import type { TellCondition, WorkflowStep } from "./types";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
type W = Awaited<ReturnType<typeof ws>>;
const P = (n: number) => `2026-${String(n).padStart(2, "0")}-01`;
const above = (value: string): TellCondition => ({ kind: "at_or_above", value });
const tellStep = (over: Partial<Extract<WorkflowStep, { type: "tell" }>> = {}): WorkflowStep => ({ type: "tell", id: "step-one-aaaa", condition: above("100"), people: [], groups: [], ...over });
const share = async (w: W, metricId: number, userId: string) => { await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metricId, user_id: userId, role: "viewer" }); };
const put = async (w: W, metricId: number, period: string, v: number, by: string, opts: { imported?: boolean } = {}) => { await w.value(metricId, period, v, by); await onValue(metricId, period, by, opts); };
async function messages(w: W, person: string) {
  const { data } = await db().from("deliveries").select("id, kind, subject, body, sender_id, action_id, prompt_id, workspace_id, tell_workflow_id, alert_id").eq("workspace_id", w.id).eq("recipient_id", person).eq("kind", "alert").order("id");
  return opened("deliveries", w.id, data);
}
/** Sara owns the Workflow and "Sales"; Ann sees Sales; Bob is a member who does not; Cora sees it and is in a Group. */
async function setup(steps: (WorkflowStep | ((p: { ann: string; bob: string; cora: string; group: number }) => WorkflowStep))[], opts: { sees?: string[] } = {}) {
  const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member"); const bob = await w.person("member"); const cora = await w.person("member");
  const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Finance" }).select("id").single();
  await db().from("group_members").insert({ workspace_id: w.id, group_id: g!.id, user_id: cora });
  const who = { ann, bob, cora, group: g!.id as number };
  const flow = await saveWorkflow(w.actor(sara), null, "Sales close", { dueWorkingDays: 2, steps: [...steps.map((s) => (typeof s === "function" ? s(who) : s)), { type: "publish", lock: false }] });
  const m = await w.metric(sara, { name: "Sales" }); await setMetricWorkflow(w.actor(sara), m.id, flow);
  for (const p of opts.sees ?? [ann, cora]) await share(w, m.id, p);
  return { w, sara, ...who, flow, m };
}

describe("Tell once per crossing", () => {
  it("tells people and Groups who see the Metric, skips the rest silently, and tells again only after a fall", async () => {
    const { w, sara, ann, bob, cora, m } = await setup([(p) => tellStep({ people: [p.ann, p.bob], groups: [p.group] })]);
    const other = await w.metric(sara, { name: "Secret" }); await w.value(other.id, P(2), 777, sara);
    await put(w, m.id, P(1), 90, sara);
    expect(await messages(w, ann)).toHaveLength(0);
    await put(w, m.id, P(2), 120, sara);
    const [first] = await messages(w, ann);
    expect(first).toMatchObject({ sender_id: null, action_id: null, prompt_id: null, alert_id: null });
    expect(first.body).toContain("Sales reached 100");
    expect(first.body).toContain("120");
    expect(first.body).not.toMatch(/\b777\b/);
    expect(first.tell_workflow_id).not.toBeNull();
    expect(await messages(w, cora)).toHaveLength(1);
    // Bob cannot see Sales: nothing at all.
    expect(await messages(w, bob)).toHaveLength(0);
    await put(w, m.id, P(3), 130, sara);
    expect(await messages(w, ann)).toHaveLength(1);
    await put(w, m.id, P(4), 80, sara);
    await put(w, m.id, P(5), 150, sara);
    expect(await messages(w, ann)).toHaveLength(2);
    expect(await messages(w, cora)).toHaveLength(2);
    expect(await messages(w, bob)).toHaveLength(0);
  });

  it("tells once when two values arrive at once", async () => {
    const { w, sara, ann, m } = await setup([(p) => tellStep({ people: [p.ann] })]);
    await w.value(m.id, P(3), 200, sara);
    await Promise.all([checkTells(m.id), checkTells(m.id), checkTells(m.id)]);
    expect(await messages(w, ann)).toHaveLength(1);
  });

  it("is silent for an Import and behaves on the next real value", async () => {
    const { w, sara, ann, m } = await setup([(p) => tellStep({ people: [p.ann] })]);
    await put(w, m.id, P(1), 500, sara, { imported: true });
    expect(await messages(w, ann)).toHaveLength(0);
    await put(w, m.id, P(2), 600, sara);
    expect(await messages(w, ann)).toHaveLength(0);
    await put(w, m.id, P(3), 50, sara);
    await put(w, m.id, P(4), 120, sara);
    expect(await messages(w, ann)).toHaveLength(1);
  });

  it("tells for a change once per period, and a Tell step of another Workflow is its own", async () => {
    const { w, sara, ann, m } = await setup([(p) => tellStep({ condition: { kind: "changed_more", share: "20" }, people: [p.ann] })]);
    await put(w, m.id, P(1), 100, sara);
    await put(w, m.id, P(2), 130, sara);
    await put(w, m.id, P(2), 150, sara);
    expect(await messages(w, ann)).toHaveLength(1);
    expect((await messages(w, ann))[0].body).toMatch(/changed more than 20[.,0]* %: up 30[.,0]* %/);
    await put(w, m.id, P(3), 300, sara);
    expect(await messages(w, ann)).toHaveLength(2);
  });
});

describe("approved values only", () => {
  it("waits for Approval and tells once the value is approved", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin"); const ann = await w.person("member");
    const flow = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ada], values: "every" }, tellStep({ people: [ann] }), { type: "publish", lock: false }] });
    const m = await w.metric(sara, { name: "Revenue" }); await setMetricWorkflow(w.actor(sara), m.id, flow); await share(w, m.id, ann);
    await put(w, m.id, periodStart(new Date(), "month", JANUARY), 500, sara);
    expect(await messages(w, ann)).toHaveLength(0);
    const task = (await db().from("actions").select("id").eq("metric_id", m.id).eq("purpose", "approval").eq("status", "open").single()).data!;
    await approve(w.id, task.id as number, ada);
    const told = await messages(w, ann);
    expect(told).toHaveLength(1);
    expect(told[0].body).not.toContain("Not approved yet");
  });
});

describe("stop telling me", () => {
  it("skips a person who stopped, lists the Workflow for those it tells, and tells again when they say so", async () => {
    const { w, sara, ann, bob, flow, m } = await setup([(p) => tellStep({ people: [p.ann, p.bob] })]);
    const a = w.actor(ann, "member");
    expect(await listTellSubscriptions(a)).toEqual([{ workflowId: flow, name: "Sales close", stopped: false }]);
    // Bob is named but sees nothing of the Workflow: nothing listed, and his stop is refused like an unknown Workflow.
    expect(await listTellSubscriptions(w.actor(bob, "member"))).toEqual([]);
    await expect(setTellStopped(w.actor(bob, "member"), flow, true)).rejects.toThrow();
    // A message already queued when the person stops it does not leave either.
    await put(w, m.id, P(8), 300, sara);
    const [queued] = await messages(w, ann);
    const about = { id: Number(queued.id), workspace_id: w.id, kind: "alert", recipient_id: ann, alert_metric_id: m.id, tell_workflow_id: flow };
    expect(await archivedMetricHolds(about)).toBeNull();
    await setTellStopped(a, flow, true);
    expect(await archivedMetricHolds(about)).toMatch(/asked not to be told/);
    await setTellStopped(a, flow, false);
    await setTellStopped(a, flow, true);
    expect(await listTellSubscriptions(a)).toEqual([expect.objectContaining({ stopped: true })]);
    await put(w, m.id, P(9), 50, sara);
    await put(w, m.id, P(10), 200, sara);
    expect(await messages(w, ann)).toHaveLength(1);
    await setTellStopped(a, flow, false);
    await put(w, m.id, P(11), 50, sara);
    await put(w, m.id, P(12), 200, sara);
    expect(await messages(w, ann)).toHaveLength(2);
  });

  it("is the one-click link of the email: it stops that Workflow for that person only", async () => {
    const { w, sara, ann, cora, flow, m } = await setup([(p) => tellStep({ people: [p.ann, p.cora] })]);
    await put(w, m.id, P(1), 200, sara);
    const [msg] = await messages(w, ann);
    await db().from("deliveries").update({ unsubscribe_token: "T".repeat(32) }).eq("id", msg.id);
    expect(await unsubscribeIsTell("T".repeat(32))).toBe(true);
    expect(await optOutByToken("T".repeat(32))).toEqual({ undo: null });
    expect((await db().from("tell_stops").select("person_id").eq("workflow_id", flow)).data).toEqual([{ person_id: ann }]);
    await put(w, m.id, P(2), 50, sara);
    await put(w, m.id, P(3), 200, sara);
    expect(await messages(w, ann)).toHaveLength(1);
    expect(await messages(w, cora)).toHaveLength(2);
  });

  it("is refused in the demo", async () => {
    const { w, ann, flow } = await setup([(p) => tellStep({ people: [p.ann] })]);
    await expect(setTellStopped({ ...w.actor(ann, "member"), workspaceId: (await import("./team")).DEMO_WORKSPACE_ID }, flow, true)).rejects.toThrow();
  });
});

describe("saving Tell steps", () => {
  it("keeps what is valid, drops people and Groups of nowhere, caps the steps, and refuses a condition it cannot read", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const elsewhere = await ws();
    const stranger = await elsewhere.person("member");
    const foreign = (await db().from("groups").insert({ workspace_id: elsewhere.id, name: "Theirs" }).select("id").single()).data!.id as number;
    const own = (await db().from("groups").insert({ workspace_id: w.id, name: "Mine" }).select("id").single()).data!.id as number;
    const actor = w.actor(sara);
    const id = await saveWorkflow(actor, null, "Close", { dueWorkingDays: 1, steps: [tellStep({ people: [ann, stranger, "nobody"], groups: [own, foreign, 999999] }), tellStep({ id: "step-one-aaaa" }), tellStep({ id: "bad id!" }), tellStep({ id: "step-four-dddd" }), { type: "publish", lock: false }] });
    const { data } = await db().from("workflows").select("config").eq("id", id).single();
    const tells = (data!.config as { steps: WorkflowStep[] }).steps.filter((s): s is Extract<WorkflowStep, { type: "tell" }> => s.type === "tell");
    expect(tells).toHaveLength(TELL_STEPS_PER_WORKFLOW);
    expect(tells[0]).toMatchObject({ people: [ann], groups: [own] });
    // A repeated or unusable id is replaced, so two steps never share a memory.
    expect(new Set(tells.map((t) => t.id)).size).toBe(3);
    expect(tells.every((t) => /^[A-Za-z0-9-]{8,40}$/.test(t.id))).toBe(true);
    await expect(saveWorkflow(actor, id, "Close", { dueWorkingDays: 1, steps: [tellStep({ condition: { kind: "missing_after_due" } as unknown as TellCondition })] })).rejects.toThrow(/Tell step/);
    await expect(saveWorkflow(actor, id, "Close", { dueWorkingDays: 1, steps: [tellStep({ condition: { kind: "changed_more", share: "5000" } })] })).rejects.toThrow(/Tell step/);
  });

  it("shows the owner who will be skipped for lack of sight, only for Metrics the owner sees", async () => {
    const { w, sara, bob, flow } = await setup([(p) => tellStep({ people: [p.ann, p.bob] })]);
    const facts = await tellEditorFacts(w.actor(sara), flow);
    expect(facts.groups.map((g) => g.name)).toContain("Finance");
    expect(facts.steps).toEqual([{ id: "step-one-aaaa", skipped: [{ person: bob, metric: "Sales" }] }]);
    // Not the owner of the Workflow: nothing about who is skipped.
    expect((await tellEditorFacts(w.actor(bob, "member"), flow)).steps).toEqual([]);
  });
});
