// Export as Pack against the real database (spec 0030, #280): a Pack made of a Workspace's things holds no value and
// no Metric the person does not see; installed in another Workspace and exported again, it is the same file.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { exportOptions, exportPack, type ExportChoice, type ExportManifest } from "./pack-export";
import { installPackFile } from "./packs";
import { checkPack } from "./pack";
import { createDashboard, placeWidget } from "./dashboards";
import { createDeck } from "./decks";
import { saveDashboardTemplate, saveDeckTemplate, saveWorkflowTemplate } from "./templates";
import { saveWorkflow } from "./workflows";
import { addViewDesign } from "./view-designs";
import { STARTER_THEME } from "./themes";
import { writeViewDesign } from "./view-design";
import { EXAMPLE } from "./view-design.test";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const MANIFEST: ExportManifest = { id: "northwind/board", name: "Board pack", version: "1.0.0", summary: "What our board sees each quarter.", author: "Northwind", license: "CC-BY-4.0" };
const all = async (table: string, workspaceId: string, extra: Record<string, string> = {}) => {
  let q = db().from(table).select("id").eq("workspace_id", workspaceId);
  for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
  return ((await q).data ?? []).map((r) => Number(r.id));
};

/** A Workspace with Metrics and values, a dashboard and a deck saved as templates, a Workflow Template, a View Design and a Theme. */
async function setUp() {
  const w = await ws("A"); const ann = await w.person("owner"); const actor = w.actor(ann);
  const revenue = await w.metric(ann, { name: "Revenue", unit: "€", format: "currency", aggregation: "sum", description: "Invoiced revenue.\nSee https://intranet.example/finance", target_min: 1000, target_max: 2000 });
  const orders = await w.metric(ann, { name: "Orders", aggregation: "sum" });
  const aov = await w.metric(ann, { name: "Average order value", aggregation: "average", sources: [], formula: `{${revenue.slug}} / {${orders.slug}}` });
  await w.value(revenue.id, "2026-09-01", 987654.32);
  const dash = await createDashboard(actor, "Monthly");
  await placeWidget(actor, dash, { type: "metric", id: revenue.id });
  await placeWidget(actor, dash, { type: "spec", template: "line", metricIds: [orders.id] });
  await saveDashboardTemplate(actor, { dashboardId: dash, name: "Monthly", description: "Two numbers", labels: ["Revenue", "Orders"] });
  const deck = await createDeck(actor, "Board");
  const store = {
    "page:page": { id: "page:page", typeName: "page", index: "a1" },
    "shape:f0": { id: "shape:f0", typeName: "shape", type: "frame", parentId: "page:page", index: "a1", x: 0, y: 0, rotation: 0, opacity: 1, props: { w: 1280, h: 720 } },
    "shape:t": { id: "shape:t", typeName: "shape", type: "text", parentId: "shape:f0", index: "a1", x: 64, y: 56, rotation: 0, opacity: 1, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Revenue this quarter" }] }] }, w: 900, size: "xl", scale: 1, textAlign: "start", color: "black", font: "sans", autoSize: false } },
    "shape:w": { id: "shape:w", typeName: "shape", type: "ziffr-widget", parentId: "shape:f0", index: "a2", x: 64, y: 150, rotation: 0, opacity: 1, props: { template: "line", metricIds: [revenue.id], settings: JSON.stringify({ window: 8 }), title: "", w: 700, h: 500 } },
    "shape:g": { id: "shape:g", typeName: "shape", type: "geo", parentId: "shape:f0", index: "a3", x: 800, y: 150, rotation: 0, opacity: 1, props: { geo: "rectangle", w: 400, h: 300, fill: "semi", color: "blue" } },
    "shape:d": { id: "shape:d", typeName: "shape", type: "draw", parentId: "shape:f0", index: "a4", x: 0, y: 0, rotation: 0, opacity: 1, props: { segments: [] } },
  };
  await db().from("decks").update({ document: { store, schema: {} } }).eq("id", deck);
  await saveDeckTemplate(actor, { deckId: deck, name: "Board meeting", description: "", labels: ["Revenue"], choices: {} });
  await saveWorkflowTemplate(actor, { workflowId: await saveWorkflow(actor, null, "Close", { dueWorkingDays: 3, steps: [{ type: "remind", daysBefore: 2 }, { type: "approve", approvers: [ann], values: "every" }, { type: "publish", lock: true }] }), name: "Monthly close", description: "" });
  await addViewDesign(actor, writeViewDesign(EXAMPLE));
  await db().from("themes").insert({ ...STARTER_THEME, name: "Board", owner_id: ann, workspace_id: w.id });
  return { w, ann, actor, revenue, orders, aov };
}

describe("Export as Pack", () => {
  it("makes a valid Pack with no value, no person and no web address, and says what it left out", async () => {
    const { w, actor, revenue, orders, aov } = await setUp();
    const choice: ExportChoice = { metrics: [revenue.id, orders.id, aov.id], dashboards: await all("team_templates", w.id, { kind: "dashboard" }), decks: await all("team_templates", w.id, { kind: "deck" }), workflows: await all("team_templates", w.id, { kind: "workflow" }), designs: await all("view_designs", w.id), themes: await all("themes", w.id) };
    const { text, fileName, leftOut } = await exportPack(actor, MANIFEST, choice);
    expect(fileName).toBe("board.pack.json");
    const res = checkPack(text);
    expect(res.ok ? [] : res.problems).toEqual([]);
    expect(text).not.toContain("987654");
    expect(text).not.toContain("intranet");
    expect(text).not.toContain(actor.personId);
    expect(text).toContain('"formula": "{revenue} / {orders}"');
    expect(text).toContain('"suggests": "revenue"');
    expect(leftOut).toEqual([]);
    const pack = JSON.parse(text);
    // The description lost its address: it is left out rather than sent.
    expect(pack.contents.metrics.find((m: { key: string }) => m.key === "revenue").metric.description).toBeUndefined();
    // The drawing on the slide stays behind; the words, the widget and the box go.
    expect(pack.contents.decks[0].template.slides[0].shapes.map((s: { shape: string }) => s.shape)).toEqual(["text", "widget", "box"]);
    expect(pack.contents.workflows[0].template.steps[1]).toMatchObject({ type: "approve", approvers: 1, values: "every" });
  });

  it("is the same file again after installing it in another Workspace and exporting what it added", async () => {
    const { w, actor, revenue, orders, aov } = await setUp();
    const choice: ExportChoice = { metrics: [revenue.id, orders.id, aov.id], dashboards: await all("team_templates", w.id, { kind: "dashboard" }), decks: await all("team_templates", w.id, { kind: "deck" }), workflows: await all("team_templates", w.id, { kind: "workflow" }), designs: await all("view_designs", w.id), themes: await all("themes", w.id) };
    const first = await exportPack(actor, MANIFEST, choice);
    const b = await ws("B"); const zoe = await b.person("owner");
    await installPackFile(b.actor(zoe), first.text, { unsigned: true, assistantTexts: true });
    const again = await exportPack(b.actor(zoe), MANIFEST, { catalog: await all("catalog_metrics", b.id), dashboards: await all("team_templates", b.id, { kind: "dashboard" }), decks: await all("team_templates", b.id, { kind: "deck" }), workflows: await all("team_templates", b.id, { kind: "workflow" }), designs: await all("view_designs", b.id), themes: await all("themes", b.id) });
    expect(again.text).toBe(first.text);
  });

  it("leaves out a Metric the person does not see, and one computed from Metrics not in the Pack", async () => {
    const { w, revenue, aov } = await setUp();
    const sara = await w.person("member");
    const hers = await w.metric(sara, { name: "Hers" });
    const res = await exportPack(w.actor(sara, "member"), MANIFEST, { metrics: [hers.id, revenue.id] });
    expect(res.text).not.toContain("Revenue");
    expect(res.leftOut).toEqual([{ name: `Metric ${revenue.id}`, why: "You do not see it." }]);
    const owner = await exportPack(w.actor((await db().from("memberships").select("user_id").eq("workspace_id", w.id).eq("role", "owner").single()).data!.user_id as string), MANIFEST, { metrics: [aov.id] }).catch((e: Error) => e.message);
    expect(owner).toContain("The Pack cannot be made");
  });

  it("is not for Guests, and offers only the Workspace's own things", async () => {
    const { w, revenue } = await setUp();
    const gus = await w.person("guest");
    await expect(exportOptions(w.actor(gus, "guest"))).rejects.toEqual(forbidden);
    const other = await ws("B"); const zoe = await other.person("owner");
    const opts = await exportOptions(other.actor(zoe));
    expect(opts.metrics.concat(opts.designs, opts.themes).length).toBe(0);
    const res = await exportPack(other.actor(zoe), MANIFEST, { metrics: [revenue.id], designs: await all("view_designs", w.id) }).catch((e: Error) => e.message);
    expect(res).toContain("The Pack cannot be made");
  });
});
