// Every built-in View against the real database (GLOSSARY: View, Widget Template, Dashboard Template; #1154): each
// template of TEMPLATES is saved on a dashboard through the core, so a View added without the migration that lets the
// database keep it fails here. And a dashboard whose widgets cannot be saved is not left behind.
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "./built-in-designs";
import { createDashboardFromBody } from "./dashboard-templates";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { workspace } from "./test/db-fixtures";
import type { TemplateId } from "./types";
import { writeViewDesign } from "./view-design";
import { addViewDesign } from "./view-designs";
import { TEMPLATES } from "./widget-templates";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

describe("every built-in View", () => {
  it("can be placed on a dashboard", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara);
    // The stand-in for a Workspace's View Design needs one to draw.
    const added = await addViewDesign(w.actor(sara), writeViewDesign(BUILT_IN_DESIGNS.line));
    if (!added.ok) throw new Error("The View Design was not added.");
    const dash = await createDashboard(w.actor(sara), "Every View");
    // A Slide Element is for slides only, and a dashboard refuses it (spec 0057).
    const all = (Object.keys(TEMPLATES) as TemplateId[]).filter((t) => t !== "slide");
    await expect(placeWidget(w.actor(sara), dash, { type: "spec", template: "slide", metricIds: [m.id] })).rejects.toThrow();
    for (const template of all) {
      const settings = template === "design" ? { design: { id: added.id, body: BUILT_IN_DESIGNS.line } } : undefined;
      const metricIds = TEMPLATES[template].slots.length ? [m.id] : [];
      // The template's name in the message says which View the database refused.
      await expect(placeWidget(w.actor(sara), dash, { type: "spec", template, metricIds, settings }), template).resolves.toEqual(expect.any(Number));
    }
    const { data } = await db().from("widgets").select("template").eq("dashboard_id", dash);
    expect((data ?? []).map((x) => x.template).sort()).toEqual([...all].sort());
  });
});

describe("a dashboard from a template", () => {
  it("is not left behind when its widgets cannot be saved", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara);
    const widget = { view: "no-such-view" as TemplateId, metricSlots: [0], settings: {}, title: null, x: 0, y: 0, w: 4, h: 4 };
    const template = { name: "Broken", slots: [{ label: "Metric", multiple: false }], body: { widgets: [widget] } };
    await expect(createDashboardFromBody(w.actor(sara), template, "Broken", [[m.id]], "Made for a test")).rejects.toThrow("It could not be saved.");
    expect((await db().from("dashboards").select("id").eq("workspace_id", w.id)).data).toEqual([]);
  });
});
