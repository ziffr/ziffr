// Dashboard Templates against the real database (spec 0014): using one, built-in or the team's, and saving a
// dashboard as one. Who may, which Metrics may fill a Slot, and what the team gets to see.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget } from "./dashboards";
import { createDashboardFromTemplate, dashboardTemplateChoices, listDashboardTemplates } from "./dashboard-templates";
import { share } from "./sharing";
import { deleteTemplate, saveDashboardTemplate } from "./templates";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const widgetsOf = async (dashboardId: number) => (await db().from("widgets").select("template, metric_ids, x, y, w, h, owner_id").eq("dashboard_id", dashboardId).order("y").order("x")).data ?? [];

describe("making a dashboard from a template", () => {
  it("fills a built-in template's Slots, once for every widget that shows them, and records one Version", async () => {
    const w = await ws(); const sara = await w.person("member"); const m = await w.metric(sara);
    const id = await createDashboardFromTemplate(w.actor(sara, "member"), { template: "deep-dive", name: "Revenue in depth", fills: [[m.id]] });
    const widgets = await widgetsOf(id);
    expect(widgets.length).toBe(6);
    expect(widgets.every((x) => x.metric_ids.length === 1 && x.metric_ids[0] === m.id && x.owner_id === sara)).toBe(true);
    const { data: d } = await db().from("dashboards").select("name, owner_id, workspace_id").eq("id", id).single();
    expect(d).toEqual({ name: "Revenue in depth", owner_id: sara, workspace_id: w.id });
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "dashboard").eq("object_id", id);
    expect(versions).toEqual([{ message: "Made from the template “One metric in depth”" }]);
  });
  it("refuses a Slot left empty, a Metric the actor does not see, and Guests", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member"); const gus = await w.person("guest");
    const mine = await w.metric(sara); const theirs = await w.metric(ben);
    await expect(createDashboardFromTemplate(w.actor(sara, "member"), { template: "side-by-side", name: "x", fills: [[mine.id]] })).rejects.toEqual(forbidden);
    await expect(createDashboardFromTemplate(w.actor(sara, "member"), { template: "side-by-side", name: "x", fills: [[mine.id], [theirs.id]] })).rejects.toEqual(forbidden);
    await expect(createDashboardFromTemplate(w.actor(gus, "guest"), { template: "deep-dive", name: "x", fills: [[mine.id]] })).rejects.toEqual(forbidden);
    expect((await db().from("dashboards").select("id").eq("workspace_id", w.id)).data).toEqual([]);
  });
  it("uses only templates of the actor's workspace", async () => {
    const a = await ws("A"); const b = await ws("B"); const ann = await a.person("owner"); const zoe = await b.person("owner");
    const mb = await b.metric(zoe); const ma = await a.metric(ann);
    const d = await createDashboard(b.actor(zoe), "Theirs");
    await placeWidget(b.actor(zoe), d, { type: "metric", id: mb.id });
    const t = await saveDashboardTemplate(b.actor(zoe), { dashboardId: d, name: "Theirs", description: "", labels: ["X"] });
    await expect(createDashboardFromTemplate(a.actor(ann), { template: t, name: "x", fills: [[ma.id]] })).rejects.toEqual(forbidden);
    expect((await listDashboardTemplates(a.actor(ann))).some((x) => x.id === t)).toBe(false);
  });
});

describe("saving a dashboard as a template", () => {
  it("makes one Slot per Metric, leaves Free Layouts out, and a new dashboard from it is an independent copy", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const rev = await w.metric(sara, { name: "Revenue" }); const other = await w.metric(ben, { name: "Orders" });
    const d = await createDashboard(w.actor(sara, "member"), "Monthly");
    await placeWidget(w.actor(sara, "member"), d, { type: "metric", id: rev.id });
    await placeWidget(w.actor(sara, "member"), d, { type: "spec", template: "line", metricIds: [rev.id] });
    await placeWidget(w.actor(sara, "member"), d, { type: "spec", template: "canvas", metricIds: [] });
    const t = await saveDashboardTemplate(w.actor(sara, "member"), { dashboardId: d, name: "Monthly", description: "One number", labels: ["Main metric"] });
    const { data: row } = await db().from("team_templates").select("kind, slots, body").eq("id", t).single();
    expect(row!.kind).toBe("dashboard");
    expect(row!.slots).toEqual([{ label: "Main metric", multiple: false, exampleIds: [rev.id] }]);
    expect((row!.body as { widgets: unknown[] }).widgets).toHaveLength(2);
    // Ben uses it with his own Metric; Sara's dashboard does not change.
    const mine = await createDashboardFromTemplate(w.actor(ben, "member"), { template: t, name: "Orders monthly", fills: [[other.id]] });
    expect((await widgetsOf(mine)).map((x) => x.metric_ids)).toEqual([[other.id], [other.id]]);
    expect((await widgetsOf(d)).length).toBe(3);
  });
  it("needs edit rights and every Metric seen, and only the creator deletes it", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const secret = await w.metric(sara);
    const d = await createDashboard(w.actor(sara, "member"), "Board");
    await placeWidget(w.actor(sara, "member"), d, { type: "metric", id: secret.id });
    await share(w.actor(sara, "member"), "dashboard", d, ben, "viewer");
    await expect(saveDashboardTemplate(w.actor(ben, "member"), { dashboardId: d, name: "x", description: "", labels: [] })).rejects.toEqual(forbidden);
    const t = await saveDashboardTemplate(w.actor(sara, "member"), { dashboardId: d, name: "Board", description: "", labels: [] });
    await expect(deleteTemplate(w.actor(ben, "member"), t)).rejects.toEqual(forbidden);
    await deleteTemplate(w.actor(sara, "member"), t);
  });
  it("shows a Slot's suggested Metrics only to people who see them", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const secret = await w.metric(sara);
    const d = await createDashboard(w.actor(sara, "member"), "Board");
    await placeWidget(w.actor(sara, "member"), d, { type: "metric", id: secret.id });
    const t = await saveDashboardTemplate(w.actor(sara, "member"), { dashboardId: d, name: "Board", description: "", labels: ["Thing"] });
    const forBen = (await listDashboardTemplates(w.actor(ben, "member"))).find((x) => x.id === t)!;
    expect(forBen.slots).toEqual([{ label: "Thing", multiple: false, exampleIds: [] }]);
    const forSara = (await listDashboardTemplates(w.actor(sara, "member"))).find((x) => x.id === t)!;
    expect(forSara.slots[0].exampleIds).toEqual([secret.id]);
    expect((await dashboardTemplateChoices(w.actor(ben, "member"))).metrics).toEqual([]);
  });
});
