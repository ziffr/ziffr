// Running now and showing the last run, against the real database (spec 0005, ticket #86): Owners and Admins run
// today's steps once, by the same claim as the clock; only the demo pretends another day; the page learns the last
// run and whether today ran.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { runWorkspaceIfDue } from "./scheduled-runs";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { localTime } from "./workspace-clock";
import { runTodayNow, runWorkflowsAsOf, workflowSchedule } from "./workflows";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

describe("running today's steps now", () => {
  it("runs today once for Owners and Admins, and the clock then leaves today alone", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin");
    const before = await workflowSchedule(w.actor(sara));
    expect(before).toMatchObject({ timeZone: "UTC", runHour: 8, today: localTime(new Date(), "UTC").day, todayRan: false, lastRun: null, scheduled: false });
    expect(await runTodayNow(w.actor(ann, "admin"))).toEqual({ prompts: 0, reminders: 0, escalations: 0 });
    expect(await runTodayNow(w.actor(sara))).toBeNull();
    expect(await runWorkspaceIfDue({ id: w.id, time_zone: "UTC", run_hour: 0 }, new Date())).toBe("already_ran");
    const after = await workflowSchedule(w.actor(sara));
    expect(after).toMatchObject({ todayRan: true, scheduled: false, lastRun: { day: before.today, trigger: "manual", state: "done" } });
  });
  it("is refused to Members and Guests, and in the demo", async () => {
    const w = await ws(); await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(runTodayNow(w.actor(ben, "member"))).rejects.toEqual(expect.any(Forbidden));
    await expect(runTodayNow(w.actor(gus, "guest"))).rejects.toEqual(expect.any(Forbidden));
    await expect(runTodayNow({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" })).rejects.toEqual(expect.any(Forbidden));
  });
  it("lets no real workspace pretend it is another day", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await expect(runWorkflowsAsOf(w.actor(sara), "2027-01-15")).rejects.toThrow(/Only the demo/);
  });
  it("only ever runs a later day, so changing the time zone runs no day early, late or twice", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const { setWorkspaceClock } = await import("./workspace-clock");
    // Far ahead: "today" there is tomorrow in most places.
    await setWorkspaceClock(w.actor(sara), { timeZone: "Pacific/Kiritimati", runHour: 0 });
    const ahead = await workflowSchedule(w.actor(sara));
    expect(await runTodayNow(w.actor(sara))).not.toBeNull();
    // Far behind: "today" is now an earlier day, which may not run.
    await setWorkspaceClock(w.actor(sara), { timeZone: "Etc/GMT+12", runHour: 0 });
    const behind = await workflowSchedule(w.actor(sara));
    expect(behind.today < ahead.today).toBe(true);
    expect(behind.todayRan).toBe(true);
    expect(await runTodayNow(w.actor(sara))).toBeNull();
    expect(await runWorkspaceIfDue({ id: w.id, time_zone: "Etc/GMT+12", run_hour: 0 }, new Date())).toBe("already_ran");
  });
});
