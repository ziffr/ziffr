// The Workspace's View Designs against the real database (spec 0024, #148): only Owners and Admins add and remove
// them, both audited; every file is checked on the server; a widget draws only a design of its Workspace, keeps its
// copy when the design is removed, and nothing reaches another Workspace. Export, import and export again give the
// same file.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { auditLog } from "./audit-log";
import { BUILT_IN_DESIGNS } from "./built-in-designs";
import { getCanvasData } from "./access";
import { createDashboard, placeWidget, updateWidget } from "./dashboards";
import { createDeck, saveDeck } from "./decks";
import { db } from "./db";
import { designFile, designOf } from "./design-files";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { addViewDesign, listViewDesigns, removeViewDesign } from "./view-designs";
import { writeViewDesign, type ViewDesign } from "./view-design";
import type { Widget } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

const mine: ViewDesign = { ...BUILT_IN_DESIGNS.line, name: "Revenue line, our way", description: "The line chart with the forecast always on." };
const file = writeViewDesign(mine);
const widgetsOf = async (dashboardId: number) => ((await db().from("widgets").select("*").eq("dashboard_id", dashboardId)).data ?? []) as Widget[];

describe("adding View Designs to the Workspace", () => {
  it("is for Owners and Admins only, audited, and never for Members, Guests, Access Keys or the demo", async () => {
    const w = await ws(); const sara = await w.person("owner"); const adam = await w.person("admin");
    const ben = await w.person("member"); const gus = await w.person("guest");
    const res = await addViewDesign(w.actor(adam, "admin"), file);
    expect(res.ok).toBe(true);
    await expect(addViewDesign(w.actor(ben, "member"), file)).rejects.toThrow(Forbidden);
    await expect(addViewDesign(w.actor(gus, "guest"), file)).rejects.toThrow(Forbidden);
    await expect(addViewDesign({ ...w.actor(sara), key: { id: "1", scopes: ["dashboards:write"] } } as never, file)).rejects.toThrow(Forbidden);
    await expect(addViewDesign({ personId: sara, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, file)).rejects.toThrow(Forbidden);
    // Members choose from them; Guests place nothing, so they get none.
    expect((await listViewDesigns(w.actor(ben, "member"))).map((d) => d.name)).toEqual(["Revenue line, our way"]);
    expect(await listViewDesigns(w.actor(gus, "guest"))).toEqual([]);
    const id = res.ok ? res.id : 0;
    await expect(removeViewDesign(w.actor(ben, "member"), id)).rejects.toThrow(Forbidden);
    await removeViewDesign(w.actor(sara), id);
    expect(await listViewDesigns(w.actor(sara))).toEqual([]);
    const { events } = await auditLog(w.actor(sara));
    expect(events.filter((e) => e.kind.startsWith("view_design.")).map((e) => [e.kind, e.objectName])).toEqual([["view_design.removed", "Revenue line, our way"], ["view_design.added", "Revenue line, our way"]]);
  });

  it("checks every file on the server, whatever the browser checked, and stores nothing that fails", async () => {
    const w = await ws(); const sara = await w.person("owner");
    for (const bad of ["{", JSON.stringify({ ...mine, name: "<script>alert(1)</script>" }), JSON.stringify({ ...mine, onLoad: "x" }), JSON.stringify({ ...mine, format: "ziffr.view/9" }), "x".repeat(70_000), 42 as unknown as string]) {
      const res = await addViewDesign(w.actor(sara), bad);
      expect(res.ok).toBe(false);
    }
    expect(await listViewDesigns(w.actor(sara))).toEqual([]);
    const res = await addViewDesign(w.actor(sara), JSON.stringify({ ...mine, parts: [{ mark: "text", content: ["<b>"] }] }));
    expect(res.ok ? [] : res.problems.map((p) => [p.path, p.line])).toEqual([["parts[0].content[0]", 1]]);
  });

  it("round-trips: exported, added and exported again gives the same file", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const res = await addViewDesign(w.actor(sara), designFile(mine));
    expect(res.ok).toBe(true);
    const [back] = await listViewDesigns(w.actor(sara));
    expect(designFile(back.body)).toBe(designFile(mine));
  });

  it("keeps each Workspace's designs to itself", async () => {
    const a = await ws(); const b = await ws();
    const sara = await a.person("owner"); const tom = await b.person("owner");
    const res = await addViewDesign(a.actor(sara), file);
    const id = res.ok ? res.id : 0;
    expect(await listViewDesigns(b.actor(tom))).toEqual([]);
    expect((await getCanvasData(b.id, tom)).designs).toEqual([]);
    await expect(removeViewDesign(b.actor(tom), id)).rejects.toThrow(Forbidden);
    const dash = await createDashboard(b.actor(tom), "Theirs");
    const m = await b.metric(tom);
    await expect(placeWidget(b.actor(tom), dash, { type: "spec", template: "design", metricIds: [m.id], settings: { design: { id, body: mine } } })).rejects.toThrow(Forbidden);
  });
});

describe("a widget drawn by a Workspace's View Design", () => {
  it("draws the design as the Workspace keeps it, never one the browser made up, and keeps its copy when removed", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const res = await addViewDesign(w.actor(sara), file);
    const id = res.ok ? res.id : 0;
    expect((await getCanvasData(w.id, ben)).designs?.map((d) => d.id)).toEqual([id]);
    const dash = await createDashboard(w.actor(ben, "member"), "Mine");
    const m = await w.metric(ben);
    // The browser sends a changed copy: the core puts the Workspace's own in its place.
    const forged = { ...mine, name: "Something else" };
    await placeWidget(w.actor(ben, "member"), dash, { type: "spec", template: "design", metricIds: [m.id], settings: { window: 6, design: { id, body: forged } } });
    const [widget] = await widgetsOf(dash);
    expect(widget.template).toBe("design");
    expect(designOf(widget)?.name).toBe("Revenue line, our way");
    expect(widget.settings.window).toBe(6);
    // A design that is not the Workspace's is refused, as is one without an id.
    await expect(placeWidget(w.actor(ben, "member"), dash, { type: "spec", template: "design", metricIds: [m.id], settings: { design: { id: null, body: mine } } })).rejects.toThrow(Forbidden);
    await expect(updateWidget(w.actor(ben, "member"), widget.id, { settings: { ...widget.settings, design: { id: null, body: forged } } })).rejects.toThrow(Forbidden);
    // Removing it from the Workspace changes no widget: its copy stays and can still be changed.
    await removeViewDesign(w.actor(sara), id);
    await updateWidget(w.actor(ben, "member"), widget.id, { settings: { ...widget.settings, window: 9 } });
    const [after] = await widgetsOf(dash);
    expect(after.settings.window).toBe(9);
    expect(designOf(after)?.name).toBe("Revenue line, our way");
    // Another view drops the design.
    await updateWidget(w.actor(ben, "member"), widget.id, { template: "bars" });
    expect((await widgetsOf(dash))[0].settings.design).toBeUndefined();
  });

  it("refuses a design on a slide that does not pass the checks", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const deck = await createDeck(w.actor(sara), "Board");
    const shape = (body: unknown) => ({ store: { "shape:1": { type: "ziffr-widget", props: { template: "design", metricIds: [], settings: JSON.stringify({ design: { id: null, body } }) } } } });
    await saveDeck(w.actor(sara), deck, shape(mine));
    await expect(saveDeck(w.actor(sara), deck, shape({ ...mine, parts: [{ mark: "iframe" }] }))).rejects.toThrow("View Design");
  });
});
