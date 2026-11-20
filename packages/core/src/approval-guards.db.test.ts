// Guards around Approval against the real database (GLOSSARY: Approval, Lock, Workflow): closing a period or a Lock
// never stands in for an Approval, and a task handed to the value's own submitter cannot approve it.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { JANUARY, periodStart } from "./periods";
import { workspace } from "./test/db-fixtures";
import { approve, closePeriod, getState, onValue, setLock } from "./workflow-engine";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { setActionStatus } from "./questions";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const openTask = async (metricId: number) => (await db().from("actions").select("id, assignee_id").eq("metric_id", metricId).eq("purpose", "approval").eq("status", "open").maybeSingle()).data;

/** Sara owns the Metric and the Workflow; Ada approves every value; Ann submits. Ann's value waits for Ada. */
async function waiting() {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ada = await w.person("admin"); const ann = await w.person("member");
  const workflowId = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ada], values: "every" }, { type: "publish", lock: false }] });
  const m = await w.metric(sara, { name: "Revenue" });
  await setMetricWorkflow(w.actor(sara), m.id, workflowId);
  await w.token(m.id, ann);
  await w.value(m.id, thisMonth(), 100, ann);
  await onValue(m.id, thisMonth(), ann);
  expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
  return { w, sara, ada, ann, m, workflowId };
}

describe("Approval guards", () => {
  it("leaves a value waiting for Approval open when the period is closed", async () => {
    const { w, sara, m, workflowId } = await waiting();
    expect(await closePeriod(w.id, workflowId, new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10), sara)).toBe(0);
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
  });

  it("neither locks a value waiting for Approval nor publishes it by unlocking", async () => {
    const { w, sara, m } = await waiting();
    await expect(setLock(w.id, m.id, thisMonth(), true, sara)).rejects.toThrow(/waits for Approval/);
    await expect(setLock(w.id, m.id, thisMonth(), false, sara, "Publish it")).rejects.toThrow(/Only a locked period/);
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
  });

  it("refuses a task that reached the value's own submitter, as when an Approver's tasks are handed over", async () => {
    const { w, ann, m } = await waiting();
    const task = await openTask(m.id);
    await db().from("actions").update({ assignee_id: ann }).eq("id", task!.id);
    await expect(approve(w.id, task!.id, ann)).rejects.toThrow(/Nobody approves their own value/);
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
  });

  // Pins what #444 found: the submitter (the task's asker) can close an open Approval in the app. Nothing is published
  // by it, but the Approver can no longer decide it until the submitter reopens it. Whether that stays is an owner decision.
  it("leaves the value unapproved when its submitter closes the Approval, and the Approver cannot decide it", async () => {
    const { w, ada, ann, m } = await waiting();
    const task = await openTask(m.id);
    await setActionStatus(w.actor(ann), task!.id, "closed");
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
    await expect(approve(w.id, task!.id, ada)).rejects.toThrow(/not yours, or it is done/);
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
    await setActionStatus(w.actor(ann), task!.id, "open");
    await approve(w.id, task!.id, ada);
    expect((await getState(m.id, thisMonth()))?.state).not.toBe("approval");
  });
});
