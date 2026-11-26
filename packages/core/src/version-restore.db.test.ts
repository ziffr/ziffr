// A restore that fails (GLOSSARY: Version), against the database: all or nothing, and nothing recorded as restored.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { createDashboard, placeWidget, saveDashboardText } from "./dashboards";
import { listVersions, restoreVersion, saveNamedVersion } from "./version-history";
import { opened, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const c of cleanups.splice(0)) await c();
});

/** A dashboard with one widget in a named Version, changed since: two widgets and other words. */
async function changedDashboard() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const actor = w.actor(sara);
  const revenue = await w.metric(sara, { name: "Revenue" });
  const costs = await w.metric(sara, { name: "Costs" });
  const dash = await createDashboard(actor, "Month");
  await placeWidget(actor, dash, { type: "metric", id: revenue.id });
  await saveNamedVersion(actor, "dashboard", dash, "One widget");
  const { versions } = await listVersions(actor, "dashboard", dash);
  const version = versions.find((v) => v.name === "One widget")!.id;
  await placeWidget(actor, dash, { type: "metric", id: costs.id });
  await saveDashboardText(actor, dash, { intro: "Two widgets now." });
  return { w, actor, dash, version };
}

/** What a failed restore must leave as it was: the widgets, the introduction and the number of Versions. */
async function state(workspaceId: string, dash: number) {
  const widgets = (await db().from("widgets").select("id").eq("dashboard_id", dash).order("id")).data!.map((r) => r.id as number);
  const [row] = await opened("dashboards", workspaceId, [(await db().from("dashboards").select("id, intro").eq("id", dash).single()).data!]);
  const versions = (await db().from("versions").select("*", { count: "exact", head: true }).eq("object_type", "dashboard").eq("object_id", dash)).count;
  return { widgets, intro: row.intro, versions };
}

describe("restoring an earlier dashboard Version", () => {
  it("puts its widgets and words back", async () => {
    const { w, actor, dash, version } = await changedDashboard();
    await restoreVersion(actor, version);
    const after = await state(w.id, dash);
    expect(after.widgets).toHaveLength(1);
    expect(after.intro).toBe("");
  });

  it("changes nothing when the database refuses its widgets", async () => {
    const { w, actor, dash, version } = await changedDashboard();
    const { data } = await db().from("versions").select("snapshot").eq("id", version).single();
    const snapshot = data!.snapshot as { widgets: Record<string, unknown>[] };
    // A widget without a width, which the table does not take.
    await db().from("versions").update({ snapshot: { ...snapshot, widgets: snapshot.widgets.map((x) => ({ ...x, w: null })) } }).eq("id", version);
    const before = await state(w.id, dash);
    expect(before.widgets).toHaveLength(2);
    await expect(restoreVersion(actor, version)).rejects.toThrow();
    expect(await state(w.id, dash)).toEqual(before);
  });

  it("changes nothing when the old widgets cannot be removed", async () => {
    const { w, actor, dash, version } = await changedDashboard();
    const before = await state(w.id, dash);
    const from = db().from.bind(db());
    let refused = false;
    vi.spyOn(db(), "from").mockImplementation(((table: string) => {
      const q = from(table);
      // Only the first removal of widgets fails: the one of the old ones.
      if (table !== "widgets" || refused) return q;
      const no = { eq: () => no, in: async () => ({ data: null, error: { message: "refused" } }) };
      return new Proxy(q, { get: (target, prop) => (prop === "delete" ? () => { refused = true; return no; } : Reflect.get(target, prop, target)) });
    }) as never);
    await expect(restoreVersion(actor, version)).rejects.toThrow(/could not be restored/);
    vi.restoreAllMocks();
    expect(refused).toBe(true);
    expect(await state(w.id, dash)).toEqual(before);
  });
});
