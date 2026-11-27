// Questions, tasks, Deliveries and Workflows through the core, against the real database (ticket #15).
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { ask, askForMissingValues, markTaskDone, reply, sendDueReminders, setActionStatus, setPreference } from "./questions";
import { simulateMessage, simulateReply } from "./demo-channels";
import { approveValue, lockPeriod, saveWorkflow, setAway, setMetricWorkflow, setStandIn, closeWorkflowPeriod } from "./workflows";
import { submitValue } from "./submissions";
import { workspace } from "./test/db-fixtures";
import { JANUARY, periodStart } from "./periods";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const month = periodStart(new Date(), "month", JANUARY);

describe("questions and tasks", () => {
  it("asks only members, about Metrics the asker sees, and tells the assignee", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const cleo = await w.contact({ email: "c@q.test" }); const m = await w.metric(sara); const secret = await w.metric(ben);
    await expect(ask(w.actor(sara), { metricId: m.id, period: month, assigneeId: cleo, text: "?" })).rejects.toEqual(forbidden);
    await expect(ask(w.actor(sara), { metricId: secret.id, period: month, assigneeId: ben, text: "?" })).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(ask(w.actor(sara), { metricId: m.id, period: month, assigneeId: zoe, text: "?" })).rejects.toEqual(forbidden);
    const id = await ask(w.actor(sara), { metricId: m.id, period: month, assigneeId: ben, text: "Why so high?" });
    const { data: sent } = await db().from("deliveries").select("recipient_id, workspace_id").eq("action_id", id);
    expect(sent).toEqual([{ recipient_id: ben, workspace_id: w.id }]);
  });
  it("lets only the people on a Thread reply, only the asker close, only the assignee finish", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(sara);
    const id = await ask(w.actor(sara), { metricId: m.id, period: month, assigneeId: ben, text: "Check this", kind: "task" });
    await expect(reply(w.actor(ann, "member"), id, "me too", null)).rejects.toThrow(/people on this thread/);
    await reply(w.actor(ben, "member"), id, "On it", null);
    await expect(setActionStatus(w.actor(ben, "member"), id, "closed")).rejects.toEqual(forbidden);
    await expect(markTaskDone(w.actor(sara), id)).rejects.toThrow(/not yours/);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(reply(other.actor(zoe), id, "x", null)).rejects.toThrow();
    await setActionStatus(w.actor(sara), id, "closed");
  });
  it("lets people set their own preference, and only owners and admins the team's", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    await setPreference(w.actor(ben, "member"), ben, "question", "slack");
    await expect(setPreference(w.actor(ben, "member"), sara, "question", "slack")).rejects.toEqual(forbidden);
    await expect(setPreference(w.actor(ben, "member"), null, "question", "slack")).rejects.toEqual(forbidden);
    await setPreference(w.actor(sara), null, "question", "email");
  });
});

describe("running the schedule by hand", () => {
  it("is for Owners and Admins only, outside the demo", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin"); const ben = await w.person("member");
    await expect(askForMissingValues(w.actor(ben, "member"))).rejects.toEqual(forbidden);
    await expect(sendDueReminders(w.actor(ben, "member"))).rejects.toEqual(forbidden);
    expect(await askForMissingValues(w.actor(sara))).toEqual({ asked: 0, stopped: 0 });
    expect(await sendDueReminders(w.actor(ada, "admin"))).toBe(0);
  });
});

describe("the demo's simulated channels", () => {
  it("refuse outside the demo", async () => {
    const w = await ws(); const sara = await w.person("owner", { slack_handle: "@sara-q" });
    await expect(simulateMessage(w.actor(sara), { source: "slack", sender: "@sara-q", text: "1" })).rejects.toEqual(forbidden);
    await expect(simulateReply(w.actor(sara), 1, "hi")).rejects.toEqual(forbidden);
  });
});

describe("Workflows", () => {
  it("are created by members, not Guests, and changed only by their owner in their workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(saveWorkflow(w.actor(gus, "guest"), null, "Mine", { dueWorkingDays: 2, steps: [] })).rejects.toEqual(forbidden);
    const id = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ben, "not-a-member"] }] });
    const { data } = await db().from("workflows").select("config").eq("id", id).single();
    expect((data!.config as { steps: { type: string; approvers?: string[] }[] }).steps[0].approvers).toEqual([ben]);
    await expect(saveWorkflow(w.actor(ben, "member"), id, "Taken", { dueWorkingDays: 1, steps: [] })).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner"); const mz = await other.metric(zoe);
    await expect(setMetricWorkflow(other.actor(zoe), mz.id, id)).rejects.toEqual(forbidden);
    await expect(closeWorkflowPeriod(other.actor(zoe), id, month)).rejects.toThrow();
  });
  it("ask for Approval of an unusual value, and only the approver approves it", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(sara, { target_max: 10 }); const code = await w.token(m.id, ann);
    const wf = await saveWorkflow(w.actor(sara), null, "Check", { dueWorkingDays: 2, steps: [{ type: "check", changePct: 50, outsideTarget: true }, { type: "approve", approvers: [ben] }, { type: "publish", lock: true }] });
    await setMetricWorkflow(w.actor(sara), m.id, wf);
    const r = await submitValue({ source: "web_form", sender: code, text: "500" });
    expect(r.detail).toMatch(/approval asked/);
    const { data: task } = await db().from("actions").select("id").eq("metric_id", m.id).eq("purpose", "approval").single();
    await expect(approveValue(w.actor(ann, "member"), task!.id)).rejects.toThrow(/not yours/);
    expect(await approveValue(w.actor(ben, "member"), task!.id)).toMatch(/published and locked/);
    const { data: state } = await db().from("period_states").select("state").eq("metric_id", m.id).eq("period_start", month).single();
    expect(state!.state).toBe("locked");
  });
  it("lock only by the Metric owner, stand-ins only from the workspace, away dates for others only by owners and admins", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ben);
    await expect(lockPeriod(w.actor(ben, "member"), m.id, month, true)).rejects.toThrow(/Only the metric owner/);
    await lockPeriod(w.actor(sara), m.id, month, true);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(setStandIn(w.actor(sara), m.id, ben, zoe)).rejects.toEqual(forbidden);
    await setStandIn(w.actor(sara), m.id, ben, ann);
    await expect(setAway(w.actor(ben, "member"), ann, "2026-12-01", "2026-12-05")).rejects.toEqual(forbidden);
    await setAway(w.actor(sara), ann, "2026-12-01", "2026-12-05");
    await expect(setAway(w.actor(sara), zoe, "2026-12-01", "2026-12-05")).rejects.toEqual(forbidden);
  });
});
