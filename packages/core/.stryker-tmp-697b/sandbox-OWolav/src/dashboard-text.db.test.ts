// @ts-nocheck
// A dashboard's name and introduction, and stories folded back into dashboards (spec 0013, ticket #174), against the
// database.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget, saveDashboardText } from "./dashboards";
import { setHomeDashboard, switchableDashboards } from "./home";
import { share } from "./sharing";
import { buildView } from "./view-links";
import { listVersions, restoreVersion } from "./version-history";
import { opened, openedVersions, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const DEMO = "d3e00000-0000-4000-8000-000000000001";

describe("a dashboard's introduction", () => {
  it("is written by the owner and Editors only, kept within a size, and goes out with a View Link", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const dash = await createDashboard(w.actor(sara), "Overview");
    await share(w.actor(sara), "dashboard", dash, ben, "editor");
    await share(w.actor(sara), "dashboard", dash, ann, "viewer");
    await saveDashboardText(w.actor(ben, "member"), dash, { name: "October", intro: "Revenue grew." });
    await expect(saveDashboardText(w.actor(ann, "member"), dash, { intro: "mine" })).rejects.toEqual(forbidden);
    await expect(saveDashboardText(w.actor(ben, "member"), dash, { name: "  " })).rejects.toThrow(/name/);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(saveDashboardText(other.actor(zoe), dash, { intro: "x" })).rejects.toEqual(forbidden);
    await saveDashboardText(w.actor(sara), dash, { intro: "x".repeat(5000) });
    expect((await opened("dashboards", w.id, [(await db().from("dashboards").select("id, intro").eq("id", dash).single()).data!]))[0].intro).toHaveLength(4000);
    await saveDashboardText(w.actor(sara), dash, { intro: "What happened." });
    expect((await buildView("dashboard", dash))?.intro).toBe("What happened.");
  });

  it("is kept in the dashboard's Versions and comes back with one", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const a = await w.metric(sara, { name: "Revenue" });
    const dash = await createDashboard(w.actor(sara), "Month");
    await placeWidget(w.actor(sara), dash, { type: "metric", id: a.id });
    await saveDashboardText(w.actor(sara), dash, { intro: "First words." });
    const { data: stored } = await db().from("versions").select("id, version, snapshot").eq("object_type", "dashboard").eq("object_id", dash).order("version");
    const rows = await openedVersions(w.id, "dashboard", dash, stored);
    expect(rows.map((r) => (r.snapshot as { intro?: string }).intro)).toContain("First words.");
    // The oldest Version is the dashboard before any words: restoring it takes them away again.
    const { versions } = await listVersions(w.actor(sara), "dashboard", dash);
    await restoreVersion(w.actor(sara), versions.at(-1)!.id);
    expect((await opened("dashboards", w.id, [(await db().from("dashboards").select("id, intro").eq("id", dash).single()).data!]))[0].intro).toBe("");
  });
});

describe("stories folded into dashboards", () => {
  it("leaves no story behind, and refuses new ones", async () => {
    expect((await db().from("dashboards").select("id").eq("kind", "story")).data).toEqual([]);
    const w = await ws(); const sara = await w.person("owner");
    const { error } = await db().from("dashboards").insert({ name: "S", owner_id: sara, workspace_id: w.id, kind: "story" });
    expect(error).not.toBeNull();
  });

  it("lists every dashboard in the switcher, and any may be a Home", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const a = await createDashboard(w.actor(sara), "A"); const b = await createDashboard(w.actor(sara), "B");
    await saveDashboardText(w.actor(sara), b, { intro: "Reads like a story." });
    expect((await switchableDashboards(w.actor(sara))).map((d) => d.id)).toEqual([a, b]);
    await setHomeDashboard(w.actor(sara), b);
  });

  it("keeps the demo's October in short as a dashboard with its introduction and Findings", async () => {
    const { data } = await db().from("dashboards").select("id, intro").eq("workspace_id", DEMO).eq("name", "October in short");
    expect(data).toHaveLength(1);
    expect(data![0].intro).toMatch(/Revenue grew/);
    const { data: findings } = await db().from("widgets").select("template").eq("dashboard_id", data![0].id);
    expect(findings!.map((f) => f.template)).toEqual(["story", "story"]);
  });
});
