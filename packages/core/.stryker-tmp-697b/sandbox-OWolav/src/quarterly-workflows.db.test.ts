// @ts-nocheck
// Workflows of quarterly and yearly Metrics against the real database (spec 0017, ticket #41; GLOSSARY: Workflow,
// Prompt, Due Date, Lock, Approval): the Prompt asks for the quarter that ended, of the workspace's fiscal year; the
// Due Date counts working days after its last day; Unusual Values, Approvals and Locks go per quarter or year.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { deliverPrompt } from "./deliveries";
import { setYearStart } from "./fiscal-year";
import { approve, closePeriod, getState, onValue, runWorkflows, setLock } from "./workflow-engine";
import { saveWorkflow } from "./workflows";
import { opened, workspace } from "./test/db-fixtures";
import type { WorkflowConfig } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
// A Prompt's text names the Metric and is sealed with the Workspace Key (spec 0028): read as the core reads it.
const prompts = async (metricId: number) => {
  const { data } = await db().from("prompts").select("id, workspace_id, period_start, text").eq("metric_id", metricId).order("id");
  return (await opened("prompts", String(data?.[0]?.workspace_id ?? ""), data, { dropId: true })).map((p) => ({ period_start: p.period_start, text: p.text }));
};

/** A workspace whose year starts in April, with a quarterly Metric that has a Workflow and a Submitter. */
async function setup(period: "quarter" | "year", config: WorkflowConfig) {
  const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
  await setYearStart(w.actor(sara), 4);
  // "owner" in an approval step stands for the workspace's owner, made above.
  const steps = config.steps.map((s) => (s.type === "approve" ? { ...s, approvers: [sara] } : s));
  const workflowId = await saveWorkflow(w.actor(sara), null, "Board pack", { ...config, steps });
  const m = await w.metric(sara, { name: "NPS", period, workflow_id: workflowId });
  await w.token(m.id, ann);
  return { w, sara, ann, m, workflowId };
}

describe("Workflows per quarter and year", () => {
  it("ask for the quarter that ended, due working days after its last day", async () => {
    const { w, sara, m } = await setup("quarter", { dueWorkingDays: 5, steps: [{ type: "remind", daysBefore: 2 }] });
    // 1 October: the quarter July to September ended; with an April year start it is Q2 FY 2026/27.
    const log = await runWorkflows(w.id, "2026-10-01", sara);
    expect(log).toEqual([expect.stringMatching(/^NPS, Q2 FY 2026\/27: asked .*, due 2026-10-07$/)]);
    expect(await prompts(m.id)).toEqual([{ period_start: "2026-07-01", text: "What’s the number for NPS for Q2 FY 2026/27?" }]);
    // The reminder comes two days before the Due Date, not a month later.
    expect(await runWorkflows(w.id, "2026-10-04", sara)).toEqual([]);
    expect(await runWorkflows(w.id, "2026-10-05", sara)).toEqual(["NPS, Q2 FY 2026/27: reminded"]);
    expect((await prompts(m.id)).map((p) => p.period_start)).toEqual(["2026-07-01", "2026-07-01"]);
  });
  it("ask for a year after the fiscal year ends, and say \"this year\" for the year running now", async () => {
    const { w, sara, ann, m } = await setup("year", { dueWorkingDays: 10, steps: [] });
    expect(await runWorkflows(w.id, "2026-04-02", sara)).toEqual([expect.stringMatching(/^NPS, FY 2025\/26: asked .*, due 2026-04-14$/)]);
    expect((await prompts(m.id))[0].period_start).toBe("2025-04-01");
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect((await prompts(m.id))[1].text).toBe("What’s the number for NPS this year?");
  });
  it("check a quarter against the quarter before, and approve and lock it per quarter", async () => {
    const { w, sara, ann, m, workflowId } = await setup("quarter", { dueWorkingDays: 5, steps: [
      { type: "check", changePct: 20, outsideTarget: false }, { type: "approve", approvers: ["owner"] }, { type: "publish", lock: true },
    ] });
    await w.value(m.id, "2026-04-01", 40, ann);
    expect(await onValue(m.id, "2026-04-01", ann)).toEqual(["published and locked"]);
    expect((await getState(m.id, "2026-04-01"))?.state).toBe("locked");
    await w.value(m.id, "2026-07-01", 60, ann);
    expect(await onValue(m.id, "2026-07-01", ann)).toEqual([expect.stringMatching(/up 50\.0 % on Q1 FY 2026\/27/)]);
    const state = await getState(m.id, "2026-07-01");
    expect(state).toMatchObject({ state: "approval", note: "up 50.0 % on Q1 FY 2026/27" });
    const [task] = await openRows("actions", w.id, [(await db().from("actions").select("id, question, period_start").eq("id", state!.approval_action_id!).single()).data!]);
    expect(task).toMatchObject({ period_start: "2026-07-01", question: expect.stringContaining("NPS for Q2 FY 2026/27") });
    await approve(w.id, task!.id, sara);
    expect((await getState(m.id, "2026-07-01"))?.state).toBe("locked");
    // The owner unlocks one quarter; the one before stays locked.
    await setLock(w.id, m.id, "2026-07-01", false, sara, "A late survey answer");
    expect((await getState(m.id, "2026-07-01"))?.state).toBe("published");
    expect((await getState(m.id, "2026-04-01"))?.state).toBe("locked");
    // Closing the period locks the quarter that ended.
    expect(await closePeriod(w.id, workflowId, "2026-10-02", sara)).toBe(1);
    expect((await getState(m.id, "2026-07-01"))?.state).toBe("locked");
  });
});
