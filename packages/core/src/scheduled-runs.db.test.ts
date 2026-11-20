// Workflows on a clock, against the real database at fixed instants (spec 0005, ticket #85): a workspace runs once
// its run hour has come in its own time zone, once a day however often or at once the job is called, never in the
// demo; a failing workspace stops no other; and one Workflow goes from asking to reminding to escalating on its days.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { claimDay, runDueWorkspaces, runWorkspaceIfDue } from "./scheduled-runs";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { dueDate } from "./workflow-rules";
import { shiftPeriod } from "./periods";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); vi.restoreAllMocks(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const clock = (w: { id: string }, timeZone: string, runHour: number) => ({ id: w.id, time_zone: timeZone, run_hour: runHour });
const runs = async (wsId: string) => (await db().from("workflow_runs").select("day, trigger, state, prompts, reminders, escalations").eq("workspace_id", wsId).order("day")).data ?? [];

/** A workspace with one monthly Metric whose Workflow asks, reminds the day before it is due, and tells the owner the
 * day after. */
async function withWorkflow() {
  const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
  const m = await w.metric(sara, { name: "Revenue", period: "month" }); await w.token(m.id, ann);
  const config = { dueWorkingDays: 3, steps: [{ type: "remind" as const, daysBefore: 1 }, { type: "escalate" as const, to: "owner" as const, daysAfter: 1 }] };
  await setMetricWorkflow(w.actor(sara), m.id, await saveWorkflow(w.actor(sara), null, "Close", config));
  return { w, sara, ann, m, due: dueDate("2026-11-01", "month", config) };
}

describe("the scheduled run", () => {
  it("waits for the run hour in the workspace's own time zone, also where its day is not UTC's", async () => {
    const w = await ws(); await w.person("owner");
    // 06:30 UTC on 1 December: 07:30 in Berlin, 22:30 the day before in Los Angeles.
    const now = new Date("2026-12-01T06:30:00Z");
    expect(await runWorkspaceIfDue(clock(w, "Europe/Berlin", 8), now)).toBe("not_yet");
    expect(await runWorkspaceIfDue(clock(w, "Europe/Berlin", 7), now)).toBe("ran");
    const other = await ws(); await other.person("owner");
    expect(await runWorkspaceIfDue(clock(other, "America/Los_Angeles", 8), now)).toBe("ran");
    expect((await runs(w.id)).map((r) => r.day)).toEqual(["2026-12-01"]);
    expect((await runs(other.id)).map((r) => r.day)).toEqual(["2026-11-30"]);
  });
  it("runs a day once, however often and however many at once the job is called", async () => {
    const { w, ann } = await withWorkflow();
    const now = new Date("2026-12-01T09:00:00Z");
    const outcomes = await Promise.all([1, 2, 3].map(() => runWorkspaceIfDue(clock(w, "UTC", 8), now)));
    expect(outcomes.sort()).toEqual(["already_ran", "already_ran", "ran"]);
    expect(await runWorkspaceIfDue(clock(w, "UTC", 8), new Date("2026-12-01T15:00:00Z"))).toBe("already_ran");
    const { count } = await db().from("prompts").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("submitter_id", ann);
    expect(count).toBe(1);
    expect(await runs(w.id)).toEqual([{ day: "2026-12-01", trigger: "schedule", state: "done", prompts: 1, reminders: 0, escalations: 0 }]);
  });
  it("asks, then reminds, then escalates, each on its day", async () => {
    const { w, sara, ann, m, due } = await withWorkflow();
    const at = (day: string) => new Date(`${day}T09:00:00Z`);
    expect(await runWorkspaceIfDue(clock(w, "UTC", 8), at("2026-12-01"))).toBe("ran");
    expect(await runWorkspaceIfDue(clock(w, "UTC", 8), at(shiftPeriod(due, "day", -1)))).toBe("ran");
    expect(await runWorkspaceIfDue(clock(w, "UTC", 8), at(shiftPeriod(due, "day", 2)))).toBe("ran");
    const r = await runs(w.id);
    expect(r.map(({ prompts, reminders, escalations }) => [prompts, reminders, escalations])).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    const { data: prompts } = await db().from("prompts").select("id").eq("metric_id", m.id).eq("submitter_id", ann);
    expect(prompts).toHaveLength(2);
    const { data: escalation } = await db().from("actions").select("assignee_id, purpose").eq("metric_id", m.id).eq("purpose", "escalation");
    expect(escalation).toEqual([{ assignee_id: sara, purpose: "escalation" }]);
  });
  it("never runs the demo, and a failing workspace stops no other", async () => {
    expect(await runWorkspaceIfDue({ id: DEMO_WORKSPACE_ID, time_zone: "UTC", run_hour: 0 }, new Date())).toBe("not_yet");
    // No Owner: the run cannot say who acts, so it fails and says so.
    const broken = await ws(); await broken.person("member");
    const fine = await ws(); await fine.person("owner");
    await db().from("workspaces").update({ run_hour: 0 }).in("id", [broken.id, fine.id]);
    const now = new Date("2026-12-02T10:00:00Z");
    // Only these two: a test never runs anyone else's workspaces.
    expect(await runDueWorkspaces(now, [broken.id, fine.id])).toMatchObject({ ran: 1, failed: 1 });
    expect(await runs(broken.id)).toEqual([expect.objectContaining({ day: "2026-12-02", state: "failed" })]);
    expect(await runs(fine.id)).toEqual([expect.objectContaining({ day: "2026-12-02", state: "done" })]);
    expect((await db().from("workflow_runs").select("id").eq("workspace_id", DEMO_WORKSPACE_ID)).data).toEqual([]);
    // A claimed day is not claimed twice by hand either.
    expect(await claimDay(fine.id, "2026-12-02", "manual")).toBeNull();
  });
});
