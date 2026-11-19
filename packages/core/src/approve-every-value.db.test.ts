// "Every value" on a Workflow's Approve step against the real database (ticket #218; GLOSSARY: Approval, Workflow,
// Unusual Value, Import, Feed): with Unusual values only (the default, and every step stored before the choice)
// only an Unusual Value waits; with Every value each value waits for the Approvers in order, also from the API and a
// Feed, while a Feed's Import of an empty past period is neither checked nor held back.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedActor, KeyActor } from "./actor";
import { actorForKey, actorForSecret, createAccessKey } from "./access-keys";
import { db } from "./db";
import { addFeedToMetric, createFeed, createFeedKey, submitFeedObservations } from "./feeds";
import { submitObservation } from "./api-submissions";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { submissionEffects, type SubmissionEffects } from "./submissions";
import { workspace } from "./test/db-fixtures";
import { approve, getState, onValue } from "./workflow-engine";
import { stepLabel } from "./workflow-rules";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import type { WorkflowConfig, WorkflowStep } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); vi.restoreAllMocks(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const monthsAgo = (n: number) => shiftPeriod(thisMonth(), "month", -n);
/** Effects that send nothing but still run the Workflow, so checks and Approvals happen for real. */
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: submissionEffects.afterValue });
const stepOf = async (workflowId: number) => ((await db().from("workflows").select("config").eq("id", workflowId).single()).data!.config as WorkflowConfig).steps.find((s) => s.type === "approve")!;
const approvalTasks = async (metricId: number) => (await db().from("actions").select("id, assignee_id, status, question").eq("metric_id", metricId).eq("purpose", "approval").order("id")).data ?? [];

/** A workspace with an Owner (Sara), two Approvers (Ada, then Bo), a Submitter (Ann) and a Metric under a Workflow
 * whose Approve step holds back `values` (left out: a step as stored before the choice existed). */
async function setup(values: "unusual" | "every" | undefined, opts: { check?: boolean } = {}) {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ada = await w.person("admin"); const bo = await w.person("member"); const ann = await w.person("member");
  const steps: WorkflowStep[] = [
    ...(opts.check === false ? [] : [{ type: "check", changePct: 50, outsideTarget: false } as WorkflowStep]),
    { type: "approve", approvers: [ada, bo], ...(values ? { values } : {}) }, { type: "publish", lock: false },
  ];
  const workflowId = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps });
  const m = await w.metric(sara, { name: "Revenue", sources: ["web_form", "api"] });
  await setMetricWorkflow(w.actor(sara), m.id, workflowId);
  await w.token(m.id, ann);
  return { w, sara, ada, bo, ann, m, workflowId };
}

describe("the Approve step's choice", () => {
  it("stores Every value or Unusual values only, and names it in the step's words", async () => {
    const every = await setup("every");
    const step = await stepOf(every.workflowId);
    expect(step).toMatchObject({ values: "every" });
    const people = [{ id: every.ada, name: "Ada Lovelace" }, { id: every.bo, name: "Bo Diddley" }] as never;
    expect(stepLabel(step, people)).toBe("Every value approved by Ada, then Bo");
    expect(stepLabel({ type: "approve", approvers: [every.ada] }, people)).toBe("Unusual values approved by Ada");
    // Anything else a browser sends is taken as the default.
    await saveWorkflow(every.w.actor(every.sara), every.workflowId, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [every.ada], values: "all" as never }] });
    expect(await stepOf(every.workflowId)).toMatchObject({ values: "unusual" });
  });

  it("with Unusual values only, and for a step stored without the choice, lets a usual value count at once", async () => {
    for (const values of ["unusual", undefined] as const) {
      const { w, ann, m } = await setup(values);
      if (values === undefined) {
        // As a Workflow saved before the choice existed: no `values` in the stored step.
        const { data } = await db().from("workflows").select("id, config").eq("workspace_id", w.id).single();
        const old = { ...data!.config, steps: (data!.config as WorkflowConfig).steps.map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== "values"))) };
        await db().from("workflows").update({ config: old }).eq("id", data!.id);
        expect(JSON.stringify(old)).not.toContain("values");
      }
      await w.value(m.id, monthsAgo(1), 100, ann);
      expect(await onValue(m.id, monthsAgo(1), ann)).toEqual(["published"]);
      await w.value(m.id, thisMonth(), 110, ann);
      expect(await onValue(m.id, thisMonth(), ann)).toEqual(["published"]);
      // An unusual one still waits.
      await w.value(m.id, thisMonth(), 400, ann);
      expect((await onValue(m.id, thisMonth(), ann))[0]).toMatch(/^unusual \(up 300/);
    }
  });

  it("with Every value, holds back a usual value too, for the Approvers in order, also without a Check step", async () => {
    const { w, ada, bo, ann, m } = await setup("every", { check: false });
    await w.value(m.id, thisMonth(), 100, ann);
    expect(await onValue(m.id, thisMonth(), ann)).toEqual([`every value is approved, approval asked from ${ada}`]);
    expect((await getState(m.id, thisMonth()))?.state).toBe("approval");
    const [first] = await approvalTasks(m.id);
    expect(first).toMatchObject({ assignee_id: ada, status: "open" });
    // No made-up reason: it waits because every value does.
    expect(first.question).toMatch(/^Approve Revenue for .+: 100\. Reply/);
    // Bo cannot go first.
    await expect(approve(w.id, first.id, bo)).rejects.toThrow(/not yours/);
    expect(await approve(w.id, first.id, ada)).toBe(`Approved; ${bo} approves next.`);
    const second = (await approvalTasks(m.id)).at(-1)!;
    expect(second).toMatchObject({ assignee_id: bo, status: "open" });
    expect(await approve(w.id, second.id, bo)).toBe("Approved; published.");
    expect((await getState(m.id, thisMonth()))?.state).toBe("published");
  });

  it("with Every value, skips the Submitter among the Approvers, and still names the unusual reasons", async () => {
    const { w, ada, bo, m } = await setup("every");
    // Ada submits her own value: Bo approves it.
    await w.token(m.id, ada);
    await w.value(m.id, monthsAgo(1), 100, ada);
    expect(await onValue(m.id, monthsAgo(1), ada)).toEqual([`every value is approved, approval asked from ${bo}`]);
    await w.value(m.id, thisMonth(), 300, ada);
    expect((await onValue(m.id, thisMonth(), ada))[0]).toMatch(new RegExp(`^unusual \\(up 200.*approval asked from ${bo}$`));
  });

  it("holds back a value from the API with Every value", async () => {
    const { w, ada, ann, m } = await setup("every");
    const { secret } = await createAccessKey(w.actor(ann, "member"), { name: "Export", scopes: ["values:submit"], expiresOn: inDays(30) });
    const key = (await actorForKey(secret)) as KeyActor;
    expect(await submitObservation(key, m.slug, { value: 100 }, quiet())).toMatchObject({ ok: true, status: "awaiting_approval" });
    expect(await approvalTasks(m.id)).toMatchObject([{ assignee_id: ada, status: "open" }]);
  });

  it("holds back a Feed's value with Every value, and its Import of the period being closed, but not of history", async () => {
    const { w, sara, ada, m } = await setup("every");
    const { id: feedId } = await createFeed(w.actor(sara), "CRM");
    await addFeedToMetric(w.actor(sara), m.id, feedId);
    const { secret } = await createFeedKey(w.actor(sara), feedId, { name: "Nightly", expiresOn: inDays(30) });
    const feed = (await actorForSecret(secret)) as FeedActor;
    const r = await submitFeedObservations(feed, [
      { metric: m.slug, value: 90, period: monthsAgo(2) }, // history: an Import, counted at once
      { metric: m.slug, value: 95, period: monthsAgo(1) }, // the month the Workflow closes: an Import, but it waits
      { metric: m.slug, value: 100 }, // the current period: waits for the Approvers
    ], quiet());
    expect(r).toMatchObject([{ status: "recorded", imported: true }, { status: "awaiting_approval", imported: true }, { status: "awaiting_approval", imported: false }]);
    expect((await getState(m.id, monthsAgo(2)))?.state).toBe("published");
    expect((await getState(m.id, monthsAgo(1)))?.state).toBe("approval");
    expect(await approvalTasks(m.id)).toMatchObject([{ assignee_id: ada, status: "open" }, { assignee_id: ada, status: "open" }]);
  });

  it("with Every value, asks the Workflow's owner when the submitter is the only Approver; Unusual values only does not", async () => {
    const every = await setup("every");
    await saveWorkflow(every.w.actor(every.sara), every.workflowId, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [every.ada], values: "every" }, { type: "publish", lock: false }] });
    await every.w.token(every.m.id, every.ada);
    await every.w.value(every.m.id, thisMonth(), 100, every.ada);
    expect(await onValue(every.m.id, thisMonth(), every.ada)).toEqual([`every value is approved, approval asked from ${every.sara}`]);
    // Unusual values only keeps today's rule: nobody else named, a usual value counts.
    const unusual = await setup("unusual");
    await saveWorkflow(unusual.w.actor(unusual.sara), unusual.workflowId, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [unusual.ada], values: "unusual" }, { type: "publish", lock: false }] });
    await unusual.w.token(unusual.m.id, unusual.ada);
    await unusual.w.value(unusual.m.id, thisMonth(), 100, unusual.ada);
    expect(await onValue(unusual.m.id, thisMonth(), unusual.ada)).toEqual(["published"]);
  });

  it("keeps skipping the same person at every step of a round, also when it began with someone else's Correction", async () => {
    const { w, ada, bo, ann, m } = await setup("every");
    // Ada's value, then a round on behalf of Ann (as when the owner accepts Ann's Correction): Ada and Bo approve.
    await w.token(m.id, ada);
    await w.value(m.id, thisMonth(), 100, ada);
    expect(await onValue(m.id, thisMonth(), ann)).toEqual([`every value is approved, approval asked from ${ada}`]);
    expect((await getState(m.id, thisMonth()))?.approval_for).toBe(ann);
    const [first] = (await approvalTasks(m.id)).filter((t) => t.status === "open");
    expect(await approve(w.id, first.id, ada)).toBe(`Approved; ${bo} approves next.`);
    expect((await approvalTasks(m.id)).filter((t) => t.status === "open")).toMatchObject([{ assignee_id: bo }]);
  });
});
