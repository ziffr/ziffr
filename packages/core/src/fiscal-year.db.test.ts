// The Fiscal Year against the real database (spec 0017, ticket #39): Owners and Admins set the year start, nobody
// else, never in the demo; it stays where quarterly Snapshots would split; quarters follow it.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget } from "./dashboards";
import { setYearStart, workspaceYearStart, yearStartChoices, yearStartFor } from "./fiscal-year";
import { getCanvasData } from "./access";
import { listSnapshots, openSnapshot, takeSnapshot } from "./snapshots";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

describe("the year start", () => {
  it("is January until an Owner or Admin sets another month, and is audited", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin");
    expect(await workspaceYearStart(w.actor(sara))).toBe(1);
    expect(await setYearStart(w.actor(sara), 4)).toBe(4);
    expect(await workspaceYearStart(w.actor(sara))).toBe(4);
    await setYearStart(w.actor(ann, "admin"), 10);
    expect(await workspaceYearStart(w.actor(sara))).toBe(10);
    // The same month again changes nothing and records nothing.
    await setYearStart(w.actor(sara), 10);
    const { data } = await db().from("audit_events").select("kind, details").eq("workspace_id", w.id).eq("kind", "workspace.year_start_changed").order("id");
    expect(data?.map((r) => r.details)).toEqual([{ from: 1, to: 4 }, { from: 4, to: 10 }]);
  });
  it("refuses Members, Guests, the demo and anything that is not a month", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(setYearStart(w.actor(ben, "member"), 4)).rejects.toEqual(expect.any(Forbidden));
    await expect(setYearStart(w.actor(gus, "guest"), 4)).rejects.toEqual(expect.any(Forbidden));
    await expect(setYearStart({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, 4)).rejects.toEqual(expect.any(Forbidden));
    for (const bad of [0, 13, 4.5, "4", null, Number.NaN]) await expect(setYearStart(w.actor(sara), bad)).rejects.toThrow(/month/);
    expect(await workspaceYearStart(w.actor(ben, "member"))).toBe(1);
  });
  it("moves only to months that keep quarterly Snapshots quarters, and renames them", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const rev = await w.metric(sara, { name: "Revenue" });
    for (const p of ["2026-04-01", "2026-05-01", "2026-06-01"]) await w.value(rev.id, p, 10);
    const dash = await createDashboard(owner, "Quarterly");
    await placeWidget(owner, dash, { type: "spec", template: "story", metricIds: [rev.id], settings: { headline: "Revenue", panels: [] } });
    expect((await yearStartChoices(owner)).allowed).toHaveLength(12);
    const q2 = await takeSnapshot(owner, dash, { kind: "quarter", start: "2026-04-01" }, { today: "2026-11-17" });
    const choices = await yearStartChoices(owner);
    expect(choices.allowed).toEqual([1, 4, 7, 10]);
    expect(choices.why).toMatch(/Snapshots of quarters/);
    await expect(setYearStart(owner, 2)).rejects.toThrow(/Some months are out/);
    expect(await workspaceYearStart(owner)).toBe(1);
    await setYearStart(owner, 4);
    expect((await listSnapshots(owner, dash)).map((s) => s.label)).toEqual(["Q1 FY 2026/27"]);
    // Taken under January, it draws its quarters from April now, as everything else does.
    expect((await openSnapshot(owner, q2)).data.yearStart).toBe(4);
    // A monthly Snapshot does not hold the year start.
    await takeSnapshot(owner, dash, { kind: "month", start: "2026-10-01" }, { today: "2026-11-17" });
    expect((await yearStartChoices(owner)).allowed).toEqual([1, 4, 7, 10]);
  });
  it("keeps half-year and annual Snapshots half-years and years (spec 0020)", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const rev = await w.metric(sara, { name: "Revenue" });
    await w.value(rev.id, "2026-04-01", 10);
    const dash = await createDashboard(owner, "Annual");
    await placeWidget(owner, dash, { type: "spec", template: "story", metricIds: [rev.id], settings: { headline: "Revenue", panels: [] } });
    const h2 = await takeSnapshot(owner, dash, { kind: "half", start: "2025-07-01" }, { today: "2026-11-17" });
    expect((await yearStartChoices(owner)).allowed).toEqual([1, 7]);
    await setYearStart(owner, 7);
    // Taken as the second half of 2025, it is the first half of the year that starts in July 2025 now.
    expect((await listSnapshots(owner, dash)).map((s) => s.label)).toEqual(["H1 FY 2025/26"]);
    const year = await takeSnapshot(owner, dash, { kind: "year", start: "2024-07-01" }, { today: "2026-11-17" });
    const choices = await yearStartChoices(owner);
    expect(choices.allowed).toEqual([7]);
    expect(choices.why).toMatch(/Snapshots of quarters, half-years or years/);
    await expect(setYearStart(owner, 1)).rejects.toThrow(/Some months are out/);
    // Deleted, they hold it no more.
    const { deleteSnapshot } = await import("./snapshots");
    await deleteSnapshot(owner, year);
    expect((await yearStartChoices(owner)).allowed).toEqual([1, 7]);
    await deleteSnapshot(owner, h2);
    expect((await yearStartChoices(owner)).allowed).toHaveLength(12);
  });
  it("starts a workspace's quarters for Snapshots and canvases", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    await setYearStart(owner, 4);
    const rev = await w.metric(sara, { name: "Revenue" });
    await w.value(rev.id, "2026-04-01", 10);
    const dash = await createDashboard(owner, "Quarterly");
    await placeWidget(owner, dash, { type: "spec", template: "story", metricIds: [rev.id], settings: { headline: "Revenue", panels: [] } });
    // A quarter that starts in February is not one of this workspace's.
    await expect(takeSnapshot(owner, dash, { kind: "quarter", start: "2026-02-01" }, { today: "2026-11-17" })).rejects.toThrow(/Pick/);
    await takeSnapshot(owner, dash, { kind: "quarter", start: "2026-07-01" }, { today: "2026-11-17" });
    expect((await listSnapshots(owner, dash))[0].label).toBe("Q2 FY 2026/27");
    expect((await getCanvasData(w.id, sara)).yearStart).toBe(4);
    expect(await yearStartFor(w.id, "quarter")).toBe(4);
    expect(await yearStartFor(w.id, "month")).toBe(1);
  });
});
