// @ts-nocheck
// Asking Schedules against the real database at fixed instants (spec 0035, ticket #361; GLOSSARY: Asking Schedule,
// Workflow, Due Date): a Workflow with its own days and hour runs on them and not otherwise, once however often the
// job is called, while the others run with the Workspace's run; steps wait for the next run day; saving after the hour
// does not run today; run now claims the day.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { claimAskingDay, runAskingWorkflowsIfDue, runDueWorkspaces, runWorkspaceIfDue, skipPassedAskingDay } from "./scheduled-runs";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { runTodayNow, saveWorkflow, setMetricWorkflow, workflowAskingRun } from "./workflows";
import { Forbidden } from "./actor";
import type { AskingSchedule, WorkflowConfig } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); vi.restoreAllMocks(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const clock = (w: { id: string }, timeZone = "UTC", runHour = 8) => ({ id: w.id, time_zone: timeZone, run_hour: runHour });
const at = (day: string, time = "09:00") => new Date(`${day}T${time}:00Z`);
const asks = async (metricId: number) => (await db().from("prompts").select("id", { count: "exact", head: true }).eq("metric_id", metricId)).count;
const allRows = async (workflowId: number) => (await db().from("workflow_asking_runs").select("day, trigger, state, prompts, reminders, escalations").eq("workflow_id", workflowId).order("day")).data ?? [];
// Saving a schedule whose hour has passed today records the real today as skipped (before every day these tests use),
// so the runs the tests look at leave those rows out.
const rows = async (workflowId: number) => (await allRows(workflowId)).filter((r) => r.trigger !== "saved");

const STEPS: WorkflowConfig["steps"] = [{ type: "remind", daysBefore: 1 }, { type: "escalate", to: "owner", daysAfter: 1 }];
// Thursdays at 14:00, and Mondays at 14:00.
const THURSDAY: AskingSchedule = { hour: 14, days: { kind: "chosen_weekdays", days: [4] } };
const MONDAY: AskingSchedule = { hour: 14, days: { kind: "chosen_weekdays", days: [1] } };

/** A workspace with a monthly Metric on a Workflow that has the given schedule (or none): asking for November closes
 * on Monday 30 November, due Thursday 3 December, reminding the day before and telling the owner the day after. */
async function withWorkflow(asking?: AskingSchedule) {
  const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
  const m = await w.metric(sara, { name: "Revenue", period: "month" }); await w.token(m.id, ann);
  const id = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 3, steps: STEPS, ...(asking ? { asking } : {}) });
  await setMetricWorkflow(w.actor(sara), m.id, id);
  return { w, sara, ann, m, id };
}

describe("a Workflow on its own schedule", () => {
  it("runs on its day from its hour, not before and not on other days, and the Workspace's run leaves it alone", async () => {
    const { w, m, id } = await withWorkflow(THURSDAY);
    // Tuesday 1 December: the Workspace's run has nothing to ask for this Workflow.
    expect(await runWorkspaceIfDue(clock(w), at("2026-12-01"))).toBe("ran");
    expect(await runAskingWorkflowsIfDue(clock(w), at("2026-12-01", "15:00"))).toEqual({ ran: 0, failed: 0 });
    expect(await asks(m.id)).toBe(0);
    // Thursday 3 December: not before 14:00, then once.
    expect(await runAskingWorkflowsIfDue(clock(w), at("2026-12-03", "13:59"))).toEqual({ ran: 0, failed: 0 });
    expect(await runAskingWorkflowsIfDue(clock(w), at("2026-12-03", "14:00"))).toEqual({ ran: 1, failed: 0 });
    // It asked, and reminded in the same run: the reminder's day (the day before the Due Date) had come.
    expect(await rows(id)).toEqual([{ day: "2026-12-03", trigger: "schedule", state: "done", prompts: 1, reminders: 1, escalations: 0 }]);
    expect(await asks(m.id)).toBe(2);
  });
  it("runs a day once, however often and however many at once the job is called", async () => {
    const { w, id } = await withWorkflow(THURSDAY);
    const results = await Promise.all([1, 2, 3].map(() => runAskingWorkflowsIfDue(clock(w), at("2026-12-03", "15:00"))));
    expect(results.reduce((n, r) => n + r.ran, 0)).toBe(1);
    expect(await runAskingWorkflowsIfDue(clock(w), at("2026-12-03", "20:00"))).toEqual({ ran: 0, failed: 0 });
    expect(await rows(id)).toHaveLength(1);
  });
  it("runs through the job's call for the workspace, in the workspace's own time zone", async () => {
    const { w, id } = await withWorkflow({ hour: 7, days: { kind: "every_day" } });
    await db().from("workspaces").update({ time_zone: "America/Los_Angeles" }).eq("id", w.id);
    // 06:00 UTC on 3 December is 22:00 on 2 December in Los Angeles: the Workflow runs for the 2nd, not the 3rd; and
    // at 16:00 UTC it is 08:00 on the 3rd there.
    expect(await runDueWorkspaces(at("2026-12-03", "06:00"), [w.id])).toMatchObject({ askingRan: 1, askingFailed: 0 });
    expect(await runDueWorkspaces(at("2026-12-03", "16:00"), [w.id])).toMatchObject({ askingRan: 1, askingFailed: 0 });
    expect((await rows(id)).map((r) => r.day)).toEqual(["2026-12-02", "2026-12-03"]);
  });
  it("sends every step whose day was skipped on the next run day, once", async () => {
    const { w, m, id } = await withWorkflow(MONDAY);
    // Monday 7 December is the first run day after the Due Date: ask, remind and escalate come together.
    expect(await runAskingWorkflowsIfDue(clock(w), at("2026-12-07", "14:30"))).toEqual({ ran: 1, failed: 0 });
    expect(await runAskingWorkflowsIfDue(clock(w), at("2026-12-14", "14:30"))).toEqual({ ran: 1, failed: 0 });
    expect((await rows(id)).map((r) => [r.day, r.prompts, r.reminders, r.escalations])).toEqual([["2026-12-07", 1, 1, 1], ["2026-12-14", 0, 0, 0]]);
    expect(await asks(m.id)).toBe(2);
  });
  it("leaves a Workflow without a schedule to the Workspace's run, which asks about it at once", async () => {
    const { w, m, id } = await withWorkflow();
    expect(await runAskingWorkflowsIfDue(clock(w), at("2026-12-01", "15:00"))).toEqual({ ran: 0, failed: 0 });
    expect(await runWorkspaceIfDue(clock(w), at("2026-12-01"))).toBe("ran");
    expect(await asks(m.id)).toBe(1);
    expect(await rows(id)).toEqual([]);
  });
  it("takes the Workspace's run hour when its own is blank", async () => {
    const { w, id } = await withWorkflow({ hour: null, days: { kind: "every_day" } });
    expect(await runAskingWorkflowsIfDue(clock(w, "UTC", 10), at("2026-12-01", "09:00"))).toEqual({ ran: 0, failed: 0 });
    expect(await runAskingWorkflowsIfDue(clock(w, "UTC", 10), at("2026-12-01", "10:00"))).toEqual({ ran: 1, failed: 0 });
    expect(await rows(id)).toHaveLength(1);
  });
  it("cannot run a day twice or a past day when the time zone changes: its days only move forward", async () => {
    const { w, id } = await withWorkflow(THURSDAY);
    expect(await claimAskingDay(w.id, id, "2026-12-03", "schedule")).not.toBeNull();
    expect(await claimAskingDay(w.id, id, "2026-12-03", "schedule")).toBeNull();
    expect(await claimAskingDay(w.id, id, "2026-12-02", "schedule")).toBeNull();
    expect(await claimAskingDay(w.id, id, "2026-12-10", "schedule")).not.toBeNull();
  });
  it("is never claimed for a Workflow of another workspace", async () => {
    const { id } = await withWorkflow(THURSDAY);
    const other = await ws();
    expect(await claimAskingDay(other.id, id, "2026-12-03", "schedule")).toBeNull();
  });
  it("is never run in the demo", async () => {
    expect(await runAskingWorkflowsIfDue({ id: DEMO_WORKSPACE_ID, time_zone: "UTC", run_hour: 0 }, at("2026-12-03", "15:00"))).toEqual({ ran: 0, failed: 0 });
  });
});

describe("saving a schedule", () => {
  it("does not run for a day that has begun: today is recorded as skipped once its hour has passed", async () => {
    const asking = { hour: 14, days: { kind: "every_day" } } as const;
    const { w, id } = await withWorkflow(asking);
    await db().from("workflow_asking_runs").delete().eq("workflow_id", id);
    await skipPassedAskingDay(w.id, id, asking, at("2026-12-03", "13:00"));
    expect(await allRows(id)).toEqual([]);
    await skipPassedAskingDay(w.id, id, asking, at("2026-12-03", "15:00"));
    expect(await allRows(id)).toEqual([{ day: "2026-12-03", trigger: "saved", state: "skipped", prompts: 0, reminders: 0, escalations: 0 }]);
    expect(await runAskingWorkflowsIfDue(clock(w), at("2026-12-03", "16:00"))).toEqual({ ran: 0, failed: 0 });
    expect(await runAskingWorkflowsIfDue(clock(w), at("2026-12-04", "14:00"))).toEqual({ ran: 1, failed: 0 });
  });
  it("records it when the Workflow is saved with a schedule whose hour has come, and not when it is saved unchanged", async () => {
    const { w, sara, id } = await withWorkflow();
    const actor = w.actor(sara);
    const config = { dueWorkingDays: 3, steps: STEPS, asking: { hour: 0, days: { kind: "every_day" } } } as WorkflowConfig;
    await saveWorkflow(actor, id, "Close", config);
    expect(await allRows(id)).toHaveLength(1);
    expect((await allRows(id))[0]).toMatchObject({ trigger: "saved", state: "skipped" });
    // Saved again unchanged, nothing more is recorded.
    await saveWorkflow(actor, id, "Close again", config);
    expect(await allRows(id)).toHaveLength(1);
    expect(await workflowAskingRun(actor, id)).toBeNull();
  });
  it("keeps the schedule in the Workflow, cleaned, and refuses one that is not valid", async () => {
    const { w, sara, id } = await withWorkflow();
    const actor = w.actor(sara);
    await saveWorkflow(actor, id, "Close", { dueWorkingDays: 3, steps: STEPS, asking: { hour: 14, extra: 1, days: { kind: "chosen_weekdays", days: [4, 1, 4] } } } as unknown as WorkflowConfig);
    const { data } = await db().from("workflows").select("config").eq("id", id).single();
    expect((data!.config as WorkflowConfig).asking).toEqual({ hour: 14, days: { kind: "chosen_weekdays", days: [1, 4] } });
    for (const bad of [{ hour: 25, days: { kind: "every_day" } }, { hour: 1, days: { kind: "every_n_days", n: 1, from: "2026-12-01" } }, { hour: 1, days: { kind: "x" } }, "daily"]) {
      await expect(saveWorkflow(actor, id, "Close", { dueWorkingDays: 3, steps: STEPS, asking: bad } as unknown as WorkflowConfig)).rejects.toThrow(/asking schedule is not valid/);
    }
    const { data: after } = await db().from("workflows").select("config").eq("id", id).single();
    expect((after!.config as WorkflowConfig).asking).toEqual({ hour: 14, days: { kind: "chosen_weekdays", days: [1, 4] } });
    // Saving without it removes it: the Workflow runs with the Workspace's run again.
    await saveWorkflow(actor, id, "Close", { dueWorkingDays: 3, steps: STEPS });
    const { data: gone } = await db().from("workflows").select("config").eq("id", id).single();
    expect((gone!.config as WorkflowConfig).asking).toBeUndefined();
  });
  it("is the Workflow owner's to set: nobody else changes it", async () => {
    const { w, ann, id } = await withWorkflow();
    await expect(saveWorkflow(w.actor(ann, "member"), id, "Close", { dueWorkingDays: 3, steps: STEPS, asking: THURSDAY })).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("running a scheduled Workflow now", () => {
  it("claims today, so the clock then leaves it alone, and it runs once", async () => {
    const { w, sara, id } = await withWorkflow({ hour: 0, days: { kind: "every_day" } });
    const actor = w.actor(sara);
    // The save at hour 0 recorded today as skipped; take the claim away to try the run itself.
    await db().from("workflow_asking_runs").delete().eq("workflow_id", id);
    const counts = await runTodayNow(actor, id);
    expect(counts).not.toBeNull();
    expect(await runTodayNow(actor, id)).toBeNull();
    expect(await runAskingWorkflowsIfDue(clock(w), new Date())).toEqual({ ran: 0, failed: 0 });
    expect(await rows(id)).toHaveLength(1);
    expect((await rows(id))[0]).toMatchObject({ trigger: "manual", state: "done" });
    expect(await workflowAskingRun(actor, id)).toMatchObject({ trigger: "manual", state: "done" });
  });
  it("is for the Workflow's owner, Owners and Admins, of a Workflow in the workspace that has a schedule", async () => {
    const { w, ann, id } = await withWorkflow(THURSDAY);
    await expect(runTodayNow(w.actor(ann, "member"), id)).rejects.toBeInstanceOf(Forbidden);
    await expect(runTodayNow(w.actor(ann, "guest"), id)).rejects.toBeInstanceOf(Forbidden);
    const other = await ws(); const eve = await other.person("owner");
    await expect(runTodayNow(other.actor(eve), id)).rejects.toBeInstanceOf(Forbidden);
    const plain = await withWorkflow();
    await expect(runTodayNow(plain.w.actor(plain.sara), plain.id)).rejects.toThrow(/daily run/);
    expect(await rows(plain.id)).toEqual([]);
  });
});
