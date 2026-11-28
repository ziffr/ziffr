// A Workflow's first run against the real database (GLOSSARY: Workflow, Due Date, Prompt, Escalation, Alert): a period
// whose Due Date passed before the Metric was made, or began following the Workflow, gets nothing, on this and later
// runs. A period due that day or later, and one somebody was asked for anyway, go as always.
import { format } from "date-fns";
import { afterEach, describe, expect, it } from "vitest";
import { createAlert } from "./alerts";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { JANUARY, shiftPeriod } from "./periods";
import { workspace } from "./test/db-fixtures";
import type { WorkflowConfig } from "./types";
import { dueDate, workingPeriod } from "./workflow-rules";
import { getState, runWorkflows } from "./workflow-engine";
import { saveWorkflow, setMetricWorkflow } from "./workflows";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

// Everything that can go out for a missing value: the Prompt, a reminder and an Escalation to the owner.
const CONFIG: WorkflowConfig = { dueWorkingDays: 1, steps: [{ type: "remind", daysBefore: 0 }, { type: "escalate", daysAfter: 0, to: "owner" }] };

/** A weekly Metric with a Workflow and a Submitter, made at a given time. */
async function setup(createdAt: string, { timeZone, config = CONFIG, follows = true }: { timeZone?: string; config?: WorkflowConfig; follows?: boolean } = {}) {
  const w = await workspace(); cleanups.push(w.cleanup);
  if (timeZone) await db().from("workspaces").update({ time_zone: timeZone }).eq("id", w.id);
  const sara = await w.person("owner"); const ann = await w.person("member");
  const flow = await saveWorkflow(w.actor(sara), null, "Weekly numbers", config);
  const m = await w.metric(sara, { name: "Orders", period: "week", created_at: createdAt, ...(follows ? { workflow_id: flow } : {}) });
  await w.token(m.id, ann);
  await w.share(m.id, ann);
  return { w, sara, ann, m, flow };
}

/** What went out about a Metric: the periods asked for, and how many Actions and Alert messages there are. */
async function sent(workspaceId: string, metricId: number) {
  const [{ data: prompts }, { data: actions }, { data: alerts }] = await Promise.all([
    db().from("prompts").select("period_start").eq("metric_id", metricId).order("id"),
    db().from("actions").select("id").eq("metric_id", metricId),
    db().from("deliveries").select("id").eq("workspace_id", workspaceId).eq("kind", "alert"),
  ]);
  return { prompts: (prompts ?? []).map((p) => p.period_start as string), actions: actions?.length ?? 0, alerts: alerts?.length ?? 0 };
}
const NOTHING = { prompts: [], actions: 0, alerts: 0 };

// Saturday 28 November 2026: the week of 16 to 22 November was due on Monday the 23rd.
const SATURDAY = "2026-11-28T10:00:00Z";

describe("a Workflow's first run", () => {
  it("sends nothing for a week that was due before the Metric was made, and asks for the next one", async () => {
    const { w, sara, ann, m } = await setup(SATURDAY);
    await createAlert(w.actor(ann, "member"), { metricId: m.id, condition: { kind: "missing_after_due" } });
    expect(await runWorkflows(w.id, "2026-11-28", sara)).toEqual([]);
    expect(await runWorkflows(w.id, "2026-11-29", sara)).toEqual([]);
    expect(await sent(w.id, m.id)).toEqual(NOTHING);
    expect(await getState(m.id, "2026-11-16")).toBeNull();
    // Monday: the week that has just ended is due after the Metric was made.
    expect(await runWorkflows(w.id, "2026-11-30", sara)).toEqual([expect.stringMatching(/^Orders, .*: asked .*, due 2026-11-30$/), expect.stringMatching(/: reminded$/)]);
    expect([...new Set((await sent(w.id, m.id)).prompts)]).toEqual(["2026-11-23"]);
  });

  it("asks for a week that is due the day the Metric is made", async () => {
    const { w, sara, m } = await setup("2026-11-23T10:00:00Z");
    expect((await runWorkflows(w.id, "2026-11-23", sara))[0]).toMatch(/: asked .*, due 2026-11-23$/);
    expect((await sent(w.id, m.id)).prompts[0]).toBe("2026-11-16");
  });

  it("takes the day in the Workspace's time zone", async () => {
    // 11:00 UTC on the Due Date is the next day already at UTC+14.
    const { w, sara, m } = await setup("2026-11-23T11:00:00Z", { timeZone: "Pacific/Kiritimati" });
    expect(await runWorkflows(w.id, "2026-11-24", sara)).toEqual([]);
    expect(await sent(w.id, m.id)).toEqual(NOTHING);
  });

  it("goes on for a week somebody was asked for anyway", async () => {
    const { w, sara, ann, m } = await setup(SATURDAY);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, period: "2026-11-16" });
    expect(await runWorkflows(w.id, "2026-11-28", sara)).toEqual([expect.stringMatching(/: asked /), expect.stringMatching(/: reminded$/), expect.stringMatching(/: told the owner$/)]);
    expect((await sent(w.id, m.id)).actions).toBe(1);
  });

  it("counts from the day an older Metric began following the Workflow", async () => {
    // The Audit Log keeps that day, so this one is measured from the real today: due the day the week ends.
    const config = { ...CONFIG, dueWorkingDays: 0 };
    const { w, sara, m, flow } = await setup("2020-01-01T10:00:00Z", { config, follows: false });
    await setMetricWorkflow(w.actor(sara), m.id, flow);
    const today = format(new Date(), "yyyy-MM-dd");
    expect(await runWorkflows(w.id, today, sara)).toEqual([]);
    expect(await sent(w.id, m.id)).toEqual(NOTHING);
    const later = shiftPeriod(today, "day", 7);
    const period = workingPeriod(later, "week", JANUARY);
    expect((await runWorkflows(w.id, later, sara))[0]).toContain(`due ${dueDate(period, "week", config)}`);
    expect((await sent(w.id, m.id)).prompts[0]).toBe(period);
  });

  it("asks a Metric that followed its Workflow before the Due Date", async () => {
    const { w, sara, m } = await setup("2026-01-05T10:00:00Z");
    expect((await runWorkflows(w.id, "2026-11-28", sara))[0]).toMatch(/: asked .*, due 2026-11-23$/);
    expect((await sent(w.id, m.id)).prompts[0]).toBe("2026-11-16");
  });
});
