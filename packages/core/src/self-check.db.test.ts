// The Self-check against the real database (ticket 263, closes 255; GLOSSARY: Self-check, Approval, Workflow): when an
// Approval is needed but nobody but the submitter could give it, the submitter confirms or corrects their own value,
// recorded as confirmed by the submitter and never as an Approval, or the step counts it without approval. As soon as
// someone else can approve, the four-eyes rule applies as before, and a Lock or closing the period never stands in.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createWorkspace } from "./page-data";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { finishTask, postReply } from "./threads";
import { workspace } from "./test/db-fixtures";
import { approve, closePeriod, confirmSelfCheck, correctSelfCheck, getState, onValue, setLock } from "./workflow-engine";
import { confirmOwnValue, saveWorkflow, setMetricWorkflow } from "./workflows";
import type { NobodyElse, WorkflowConfig } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); delete process.env.ZIFFR_TRIAL_DAYS; });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const lastMonth = () => shiftPeriod(thisMonth(), "month", -1);
const tasks = async (metricId: number, purpose: string) => (await db().from("actions").select("id, assignee_id, asker_id, status, question, observation_id").eq("metric_id", metricId).eq("purpose", purpose).order("id")).data ?? [];
const openCheck = async (metricId: number) => (await tasks(metricId, "self_check")).find((t) => t.status === "open")!;
const auditKinds = async (ws: string) => ((await db().from("audit_events").select("kind").eq("workspace_id", ws).order("id")).data ?? []).map((e) => e.kind as string);
const thread = async (actionId: number) => (await db().from("thread_messages").select("author_id, body, correction_value, correction_status").eq("action_id", actionId).order("id")).data ?? [];

/** Sara alone: she owns the Metric and the Workflow, is its only Approver and submits. `nobodyElse` left out is a
 * step as stored before the choice existed. */
async function alone(nobodyElse?: NobodyElse, opts: { values?: "every" | "unusual"; check?: boolean } = {}) {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const workflowId = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [
    ...(opts.check ? [{ type: "check" as const, changePct: 50, outsideTarget: false }] : []),
    { type: "approve", approvers: [sara], values: opts.values ?? "every", ...(nobodyElse ? { nobodyElse } : {}) }, { type: "publish", lock: false },
  ] });
  if (!nobodyElse) {
    // As stored before the choice existed: no `nobodyElse` in the step.
    const { data } = await db().from("workflows").select("config").eq("id", workflowId).single();
    const old = { ...data!.config, steps: (data!.config as WorkflowConfig).steps.map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== "nobodyElse"))) };
    await db().from("workflows").update({ config: old }).eq("id", workflowId);
    expect(JSON.stringify(old)).not.toContain("nobodyElse");
  }
  const m = await w.metric(sara, { name: "Revenue", sources: ["web_form", "api"] });
  await setMetricWorkflow(w.actor(sara), m.id, workflowId);
  await w.token(m.id, sara);
  return { w, sara, m, workflowId };
}

describe("the Self-check", () => {
  it("is what a step stored without the choice does: a task for the submitter, never an Approval", async () => {
    const { w, sara, m } = await alone();
    await w.value(m.id, thisMonth(), 100, sara);
    expect(await onValue(m.id, thisMonth(), sara)).toEqual(["nobody else can approve it: its submitter checks it"]);
    const check = await openCheck(m.id);
    expect(check).toMatchObject({ assignee_id: sara, asker_id: sara });
    expect(check.question).toMatch(/^Check your value: 100 for .+\. Is that right\?/);
    expect(await tasks(m.id, "approval")).toEqual([]);
    expect(await getState(m.id, thisMonth())).toMatchObject({ state: "approval", approval_action_id: check.id, approval_for: sara });
    // approve() takes Approval tasks only: the guard against approving one's own value stays whole.
    await expect(approve(w.id, check.id, sara)).rejects.toThrow(/not yours, or it is done/);
  });

  it("names why an unusual value is checked", async () => {
    const { w, sara, m } = await alone("self-check", { values: "unusual", check: true });
    await w.value(m.id, lastMonth(), 10, sara);
    expect(await onValue(m.id, lastMonth(), sara)).toEqual(["published"]);
    await w.value(m.id, thisMonth(), 100, sara);
    await onValue(m.id, thisMonth(), sara);
    expect((await openCheck(m.id)).question).toMatch(/^Check your value: 100 for .+, up 900(\.0)?\s?% on .+\. Is that right\?/);
  });

  it("publishes a confirmed value, recorded as confirmed by the submitter in the Thread, the period and the Audit Log", async () => {
    const { w, sara, m } = await alone("self-check");
    await w.value(m.id, thisMonth(), 100, sara);
    await onValue(m.id, thisMonth(), sara);
    const check = await openCheck(m.id);
    expect(await confirmOwnValue(w.actor(sara), check.id)).toBe("Confirmed by you; published.");
    expect(await getState(m.id, thisMonth())).toMatchObject({ state: "published", note: expect.stringMatching(/^Confirmed by the submitter/) });
    expect(await thread(check.id)).toEqual([expect.objectContaining({ author_id: sara, body: "Confirmed by the submitter." })]);
    const kinds = await auditKinds(w.id);
    expect(kinds).toContain("self_check.confirmed");
    expect(kinds).not.toContain("approval.given");
    // Decided once: a second press is refused.
    await expect(confirmSelfCheck(w.id, check.id, sara)).rejects.toThrow(/not yours, or it is done/);
  });

  it("takes a reply of “confirm” from the submitter, through a Connector as in Ziffr", async () => {
    const { w, sara, m } = await alone("self-check");
    await w.value(m.id, thisMonth(), 100, sara);
    await onValue(m.id, thisMonth(), sara);
    await postReply(w.id, (await openCheck(m.id)).id, sara, "Confirm, that is right", null);
    expect((await getState(m.id, thisMonth()))?.state).toBe("published");
  });

  it("corrects like a Correction: the value is replaced, the first kept as the original, and it counts as confirmed", async () => {
    const { w, sara, m } = await alone("self-check");
    const obs = await w.value(m.id, thisMonth(), 1000, sara);
    await onValue(m.id, thisMonth(), sara);
    const check = await openCheck(m.id);
    expect(check.observation_id).toBe(obs);
    await expect(correctSelfCheck(w.id, check.id, sara, Number.NaN)).rejects.toThrow(/as a number/);
    expect(await correctSelfCheck(w.id, check.id, sara, 100)).toBe("corrected and confirmed by the submitter; published");
    const { data: row } = await db().from("observations").select("value, original_value").eq("id", obs).single();
    expect({ value: Number(row!.value), original: Number(row!.original_value) }).toEqual({ value: 100, original: 1000 });
    expect(await getState(m.id, thisMonth())).toMatchObject({ state: "published", note: expect.stringMatching(/^Confirmed by the submitter/) });
    expect(await thread(check.id)).toEqual([expect.objectContaining({ correction_status: "accepted" })]);
    expect(Number((await thread(check.id))[0].correction_value)).toBe(100);
    expect(await auditKinds(w.id)).toContain("self_check.corrected");
    expect((await tasks(m.id, "self_check")).filter((t) => t.status === "open")).toEqual([]);
  });

  it("takes a “Correction:” reply from the submitter as Correct", async () => {
    const { w, sara, m } = await alone("self-check");
    await w.value(m.id, thisMonth(), 1000, sara);
    await onValue(m.id, thisMonth(), sara);
    await postReply(w.id, (await openCheck(m.id)).id, sara, "Correction: 100", 100);
    expect((await getState(m.id, thisMonth()))?.state).toBe("published");
  });

  it("is only the submitter's: nobody else confirms or corrects it", async () => {
    const { w, sara, m } = await alone("self-check");
    const ann = await w.person("member");
    await w.value(m.id, thisMonth(), 100, sara);
    await onValue(m.id, thisMonth(), sara);
    const check = await openCheck(m.id);
    await expect(confirmSelfCheck(w.id, check.id, ann)).rejects.toThrow(/not yours/);
    await expect(correctSelfCheck(w.id, check.id, ann, 5)).rejects.toThrow(/not yours/);
    // From another workspace, the task is not found at all.
    const other = await workspace();
    cleanups.push(other.cleanup);
    await expect(confirmSelfCheck(other.id, check.id, sara)).rejects.toThrow(/not yours/);
    // A task handed to someone else (as when people leave) does not decide a value that is not theirs.
    await db().from("actions").update({ assignee_id: ann }).eq("id", check.id);
    await expect(confirmSelfCheck(w.id, check.id, ann)).rejects.toThrow(/not waiting for this check/);
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
  });

  it("stays open for Confirm and Correct after another reply, and is never just marked done", async () => {
    const { w, sara, m } = await alone("self-check");
    await w.value(m.id, thisMonth(), 100, sara);
    await onValue(m.id, thisMonth(), sara);
    const check = await openCheck(m.id);
    await postReply(w.id, check.id, sara, "Looks about right, let me look again", null);
    expect(await finishTask(w.id, check.id, sara)).toBe(false);
    expect((await tasks(m.id, "self_check")).find((t) => t.id === check.id)?.status).toBe("open");
    expect(await confirmSelfCheck(w.id, check.id, sara)).toBe("Confirmed by you; published.");
  });

  it("is neither locked nor closed with the period while it waits", async () => {
    const { w, sara, m, workflowId } = await alone("self-check");
    await w.value(m.id, thisMonth(), 100, sara);
    await onValue(m.id, thisMonth(), sara);
    await expect(setLock(w.id, m.id, thisMonth(), true, sara)).rejects.toThrow(/waits for Approval/);
    expect(await closePeriod(w.id, workflowId, new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10), sara)).toBe(0);
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
  });
});

describe("counting it without approval", () => {
  it("publishes at once, with a note and an Audit Log entry, and asks nobody", async () => {
    const { w, sara, m } = await alone("count");
    await w.value(m.id, thisMonth(), 100, sara);
    expect(await onValue(m.id, thisMonth(), sara)).toEqual(["counted without approval: nobody else could approve it; published"]);
    expect(await getState(m.id, thisMonth())).toMatchObject({ state: "published", note: "Counted without approval: nobody else could approve it." });
    expect(await tasks(m.id, "self_check")).toEqual([]);
    expect(await tasks(m.id, "approval")).toEqual([]);
    expect(await auditKinds(w.id)).toContain("approval.skipped");
  });
});

describe("when someone else can approve", () => {
  it("asks them and still refuses approving one's own value, whatever the step's choice", async () => {
    for (const choice of ["self-check", "count"] as const) {
      const { w, sara, m, workflowId } = await alone(choice);
      const ada = await w.person("admin");
      await saveWorkflow(w.actor(sara), workflowId, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ada], values: "every", nobodyElse: choice }, { type: "publish", lock: false }] });
      await w.value(m.id, thisMonth(), 100, sara);
      expect(await onValue(m.id, thisMonth(), sara)).toEqual([`every value is approved, approval asked from ${ada}`]);
      expect(await tasks(m.id, "self_check")).toEqual([]);
      const [task] = await tasks(m.id, "approval");
      // Neither as an Approval nor as a Self-check can Sara decide her own value.
      await expect(approve(w.id, task.id, sara)).rejects.toThrow(/not yours/);
      await expect(confirmSelfCheck(w.id, task.id, sara)).rejects.toThrow(/not yours/);
      await db().from("actions").update({ assignee_id: sara }).eq("id", task.id);
      await expect(approve(w.id, task.id, sara)).rejects.toThrow(/Nobody approves their own value/);
      expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
    }
  });

  it("takes over a Self-check that waits once an Approver is added: confirming then asks them", async () => {
    const { w, sara, m, workflowId } = await alone("self-check");
    await w.value(m.id, thisMonth(), 100, sara);
    await onValue(m.id, thisMonth(), sara);
    const check = await openCheck(m.id);
    const ada = await w.person("admin");
    await saveWorkflow(w.actor(sara), workflowId, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [sara, ada], values: "every" }, { type: "publish", lock: false }] });
    expect(await confirmSelfCheck(w.id, check.id, sara)).toMatch(new RegExp(`^Someone else can approve it now: .*approval asked from ${ada}`));
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
    expect((await tasks(m.id, "self_check"))[0].status).toBe("closed");
    expect(await tasks(m.id, "approval")).toMatchObject([{ assignee_id: ada, status: "open" }]);
  });
});

describe("Every value in a Trial Workspace", () => {
  it("works for its one person: their coffee waits for their own check, then counts", async () => {
    process.env.ZIFFR_TRIAL_DAYS = "7";
    const owner = `t-${randomUUID()}`;
    await db().from("profiles").insert({ id: owner, name: "Trial owner", role: "", color: "#000", email: `o-${owner.slice(2, 10)}@example.test` });
    const ws = await createWorkspace(owner, "My trial");
    cleanups.push(async () => {
      await db().from("observations").delete().eq("workspace_id", ws);
      await db().from("workspaces").delete().eq("id", ws);
      await db().from("profiles").delete().eq("id", owner);
    });
    const actor = { personId: owner, workspaceId: ws, role: "owner" as const };
    const { data: wf } = await db().from("workflows").select("id, name, config").eq("workspace_id", ws).single();
    const config = wf!.config as WorkflowConfig;
    // The only Approver the editor can offer here is the Owner: Every value, approved by them.
    await saveWorkflow(actor, wf!.id, wf!.name, { ...config, steps: [...config.steps.filter((s) => s.type !== "publish"), { type: "approve", approvers: [owner], values: "every" }, { type: "publish", lock: false }] });
    const { data: coffee } = await db().from("metrics").select("id").eq("workspace_id", ws).single();
    const today = new Date().toISOString().slice(0, 10);
    await db().from("observations").insert({ metric_id: coffee!.id, period_start: today, value: 3, submitter_id: owner, source: "web_form", workspace_id: ws });
    expect(await onValue(coffee!.id, today, owner)).toEqual(["nobody else can approve it: its submitter checks it"]);
    expect(await confirmOwnValue(actor, (await openCheck(coffee!.id)).id)).toBe("Confirmed by you; published.");
    expect((await getState(coffee!.id, today))?.state).toBe("published");
  });
});
