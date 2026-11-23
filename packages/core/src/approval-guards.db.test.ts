// Guards around Approval against the real database (GLOSSARY: Approval, Lock, Workflow): closing a period or a Lock
// never stands in for an Approval, and a task handed to the value's own submitter cannot approve it.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { JANUARY, periodStart } from "./periods";
import { workspace } from "./test/db-fixtures";
import { approve, closePeriod, getState, onValue, setLock, valueOutlook } from "./workflow-engine";
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

  // #444: an open Approval is closed only by deciding it; its submitter (the task's asker) cannot close it in the app.
  it("refuses closing an open Approval by hand, and deciding it closes it", async () => {
    const { w, ada, ann, m } = await waiting();
    const task = await openTask(m.id);
    await expect(setActionStatus(w.actor(ann), task!.id, "closed")).rejects.toThrow(/closed by deciding it/);
    expect((await db().from("actions").select("status").eq("id", task!.id).single()).data?.status).toBe("open");
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
    await approve(w.id, task!.id, ada);
    expect((await db().from("actions").select("status").eq("id", task!.id).single()).data?.status).toBe("closed");
  });

  // Spec 0046: nobody approves a value they entered, nor one entered for them.
  describe("a Filled-in Value", () => {
    /** Ben (Ada's colleague) entered Ann's value; Ada and Ben are both named Approvers. */
    async function filledIn(approvers: (ada: string, ben: string) => string[]) {
      const w = await workspace();
      cleanups.push(w.cleanup);
      const sara = await w.person("owner"); const ada = await w.person("admin"); const ben = await w.person("member"); const ann = await w.person("member");
      const workflowId = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: approvers(ada, ben), values: "every" }, { type: "publish", lock: false }] });
      const m = await w.metric(sara, { name: "Revenue" });
      await setMetricWorkflow(w.actor(sara), m.id, workflowId);
      await w.token(m.id, ann);
      await w.value(m.id, thisMonth(), 100, ann);
      await db().from("observations").update({ entered_by: ben }).eq("metric_id", m.id);
      await onValue(m.id, thisMonth(), ann);
      return { w, sara, ada, ben, ann, m };
    }

    it("is never approved by who entered it, nor by who it is for, also through the owner fallbacks", async () => {
      const { w, ada, ben, ann, m } = await filledIn((a, b) => [b, a]);
      expect((await openTask(m.id))?.assignee_id).toBe(ada);
      await db().from("actions").update({ assignee_id: ben }).eq("id", (await openTask(m.id))!.id);
      await expect(approve(w.id, (await openTask(m.id))!.id, ben)).rejects.toThrow(/Nobody approves a value they entered/);
      await db().from("actions").update({ assignee_id: ann }).eq("id", (await openTask(m.id))!.id);
      await expect(approve(w.id, (await openTask(m.id))!.id, ann)).rejects.toThrow(/Nobody approves their own value/);
    });

    it("falls back to the Workflow's owner when the Metric's owner entered it", async () => {
      const w = await workspace();
      cleanups.push(w.cleanup);
      const owner = await w.person("owner"); const wfOwner = await w.person("admin"); const ann = await w.person("member");
      const workflowId = await saveWorkflow(w.actor(wfOwner, "admin"), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ann], values: "every" }, { type: "publish", lock: false }] });
      const m = await w.metric(owner, { name: "Revenue" });
      await setMetricWorkflow(w.actor(owner), m.id, workflowId);
      await w.share(m.id, wfOwner);
      await w.token(m.id, ann);
      await w.value(m.id, thisMonth(), 100, ann);
      await db().from("observations").update({ entered_by: owner }).eq("metric_id", m.id);
      await onValue(m.id, thisMonth(), ann);
      expect((await openTask(m.id))?.assignee_id).toBe(wfOwner);
      expect((await valueOutlook(m.id, ann, owner))?.approver).toBe(wfOwner);
      expect((await valueOutlook(m.id, ann, wfOwner))?.approver).toBe(owner);
    });

    it("goes to a Self-check by the submitter when nobody else could approve", async () => {
      // Ben owns the Metric and the Workflow, entered Ann's value and is the only Approver: only Ann is left.
      const w = await workspace();
      cleanups.push(w.cleanup);
      const ben = await w.person("owner"); const ann = await w.person("member");
      const workflowId = await saveWorkflow(w.actor(ben), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ben], values: "every" }, { type: "publish", lock: false }] });
      const m = await w.metric(ben, { name: "Revenue" });
      await setMetricWorkflow(w.actor(ben), m.id, workflowId);
      await w.token(m.id, ann);
      await w.value(m.id, thisMonth(), 100, ann);
      await db().from("observations").update({ entered_by: ben }).eq("metric_id", m.id);
      await onValue(m.id, thisMonth(), ann);
      const state = await getState(m.id, thisMonth());
      expect(state?.state).toBe("approval");
      expect(state?.approval_for).toBe(ann);
      const task = (await db().from("actions").select("assignee_id, purpose").eq("metric_id", m.id).eq("status", "open").single()).data;
      expect(task).toEqual({ assignee_id: ann, purpose: "self_check" });
    });

    it("never counts a Filled-in Value without Approval: the submitter checks it, whatever the step says", async () => {
      // Ben owns the Metric and the Workflow, entered Ann's value and is the only Approver: only Ann is left.
      const w = await workspace();
      cleanups.push(w.cleanup);
      const ben = await w.person("owner"); const ann = await w.person("member");
      const workflowId = await saveWorkflow(w.actor(ben), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ben], values: "every", nobodyElse: "count" }, { type: "publish", lock: false }] });
      const m = await w.metric(ben, { name: "Revenue" });
      await setMetricWorkflow(w.actor(ben), m.id, workflowId);
      await w.token(m.id, ann);
      await w.value(m.id, thisMonth(), 100, ann);
      await db().from("observations").update({ entered_by: ben }).eq("metric_id", m.id);
      await onValue(m.id, thisMonth(), ann);
      const state = await getState(m.id, thisMonth());
      expect(state?.state).toBe("approval");
      expect(state?.approval_for).toBe(ann);
      const task = (await db().from("actions").select("assignee_id, purpose").eq("metric_id", m.id).eq("status", "open").single()).data;
      expect(task).toEqual({ assignee_id: ann, purpose: "self_check" });
      expect((await db().from("audit_events").select("kind").eq("workspace_id", w.id).eq("kind", "approval.skipped")).data).toEqual([]);
    });

    it("valueOutlook agrees: the submitter's own value and the one who entered it are left out", async () => {
      const { ada, ben, ann, m } = await filledIn((a, b) => [b, a]);
      expect((await valueOutlook(m.id, ann, ben))?.approver).toBe(ada);
      expect((await valueOutlook(m.id, ann))?.approver).toBe(ben);
    });
  });
});
