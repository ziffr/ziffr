// A workspace's clock against the real database (spec 0005, ticket #84): Owners and Admins set the time zone and run
// hour, nobody else, never in the demo; and which day it is there, also where it is not the day in UTC.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { knownTimeZone, localTime, setWorkspaceClock, workspaceClock } from "./workspace-clock";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

describe("workspace clock", () => {
  it("starts at UTC and 8 o'clock, and Owners and Admins change it", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin");
    expect(await workspaceClock(w.actor(sara))).toEqual({ timeZone: "UTC", runHour: 8 });
    await setWorkspaceClock(w.actor(sara), { timeZone: "Europe/Berlin", runHour: 7 });
    expect(await workspaceClock(w.actor(sara))).toEqual({ timeZone: "Europe/Berlin", runHour: 7 });
    await setWorkspaceClock(w.actor(ann, "admin"), { timeZone: "America/New_York", runHour: 9 });
    expect(await workspaceClock(w.actor(sara))).toEqual({ timeZone: "America/New_York", runHour: 9 });
  });
  it("refuses Members, Guests, the demo, unknown zones and hours out of range", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(setWorkspaceClock(w.actor(ben, "member"), { timeZone: "UTC", runHour: 8 })).rejects.toEqual(expect.any(Forbidden));
    await expect(setWorkspaceClock(w.actor(gus, "guest"), { timeZone: "UTC", runHour: 8 })).rejects.toEqual(expect.any(Forbidden));
    await expect(setWorkspaceClock({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, { timeZone: "UTC", runHour: 8 })).rejects.toEqual(expect.any(Forbidden));
    for (const timeZone of ["Mars/Olympus", "Europe/Berlin; drop table", "", "../etc"]) await expect(setWorkspaceClock(w.actor(sara), { timeZone, runHour: 8 })).rejects.toThrow(/time zone/);
    for (const runHour of [24, -1, 7.5, Number.NaN]) await expect(setWorkspaceClock(w.actor(sara), { timeZone: "UTC", runHour })).rejects.toThrow(/hour/);
    expect(await workspaceClock(w.actor(sara))).toEqual({ timeZone: "UTC", runHour: 8 });
  });
  it("says which day and hour it is in a time zone, also where that is not the day in UTC", () => {
    const instant = new Date("2026-11-30T23:30:00Z");
    expect(localTime(instant, "UTC")).toEqual({ day: "2026-11-30", hour: 23 });
    expect(localTime(instant, "Europe/Berlin")).toEqual({ day: "2026-12-01", hour: 0 });
    expect(localTime(instant, "America/Los_Angeles")).toEqual({ day: "2026-11-30", hour: 15 });
    expect(localTime(new Date("2026-03-29T01:30:00Z"), "Europe/Berlin")).toEqual({ day: "2026-03-29", hour: 3 }); // summer time began
    expect(knownTimeZone("Asia/Kolkata")).toBe(true);
    expect(knownTimeZone("Nowhere/Land")).toBe(false);
  });
});
