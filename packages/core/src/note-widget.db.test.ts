// The Note Widget against the database (GLOSSARY: Note Widget; #1359): who writes it and who reads it through Shares,
// a Guest's role, Snapshots, View Links, programs and the demo; that it never draws a Metric; and that its words are
// sealed. And a Free Layout where the slide editor has no key: neither added nor changed, and kept.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden, Refused, type KeyActor, type Scope } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { addWidgetWithKey, getDashboardWithKey, listTemplatesWithKey, removeWidgetWithKey, Unusable, updateWidgetWithKey } from "./api-dashboards";
import { getSnapshotWithKey } from "./api-snapshots";
import { applyTemplate, createDashboard, placeWidget, removeWidget, saveLayout, saveToPool, updateWidget } from "./dashboards";
import { db } from "./db";
import { DemoTextRefused } from "./demo-visitor-words";
import { visitingDemo } from "./demo-visiting";
import { resetDemoWorkspace } from "./demo-reset";
import { NOTE_TEXT_MAX } from "./note-widget";
import { dashboardWidgets, savedWidgets } from "./page-data";
import { forgetStoredSettings } from "./settings-in-effect";
import { share } from "./sharing";
import { editSnapshotWords, openSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { DEMO_WORKSPACE_ID } from "./team";
import { saveDashboardTemplate, saveTemplate } from "./templates";
import { assertDemoIsOnlyWorkspace, demoBackToSeed } from "./test/demo-walk";
import { workspace } from "./test/db-fixtures";
import { listVersions, restoreVersion } from "./version-history";
import { createViewLink, openViewLink } from "./view-links";
import { forgetWorkspaceKey } from "./workspace-keys";

const savedEnv = { ...process.env };
const NAMES = ["ZIFFR_SECRETS_KEY", "ZIFFR_TLDRAW_LICENSE_KEY", "ZIFFR_DEMO_CHANGES", "ZIFFR_DEMO_ONLY"] as const;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 59).toString("base64"); forgetStoredSettings(); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  for (const name of NAMES) { if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name]; }
  forgetStoredSettings();
}, 120_000);

const withoutSlideKey = () => { delete process.env.ZIFFR_TLDRAW_LICENSE_KEY; forgetStoredSettings(); };
const inAMonth = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const october = { kind: "month", start: "2026-10-01" };

/** A Workspace with Sara's dashboard, shared with Ed as Editor, Vera as Viewer and the Guest Gus as Viewer; Olga sees nothing of it. */
async function setup() {
  const w = await workspace("Notes");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const [sara, ed, vera, gus, olga] = [await w.person("owner"), await w.person("member"), await w.person("member"), await w.person("guest"), await w.person("member")];
  const as = { sara: w.actor(sara), ed: w.actor(ed, "member"), vera: w.actor(vera, "member"), gus: w.actor(gus, "guest"), olga: w.actor(olga, "member") };
  const metric = await w.metric(sara, { name: "Revenue" });
  await w.value(metric.id, "2026-10-01", 100);
  const dash = await createDashboard(as.sara, "Month");
  await share(as.sara, "dashboard", dash, ed, "editor");
  await share(as.sara, "dashboard", dash, vera, "viewer");
  await share(as.sara, "dashboard", dash, gus, "viewer");
  const marker = `mk${Date.now().toString(36)}`;
  const note = await placeWidget(as.sara, dash, { type: "spec", template: "note", metricIds: [], title: `Why ${marker}`, settings: { note: `Because ${marker}`, noteHighlight: true } });
  return { w, as, metric, dash, note, marker };
}
const stored = async (id: number) => (await db().from("widgets").select("template, metric_ids, settings, title").eq("id", id).single()).data!;
const read = async (actor: Parameters<typeof dashboardWidgets>[0], dash: number, id: number) => (await dashboardWidgets(actor, dash)).find((x) => x.id === id)!;

describe("a Note Widget on a dashboard", () => {
  it("is written by the owner and Editors and read by everyone the dashboard is shared with, no one else", async () => {
    const { as, dash, note, marker } = await setup();
    for (const actor of [as.sara, as.ed, as.vera, as.gus]) {
      expect(await read(actor, dash, note)).toMatchObject({ title: `Why ${marker}`, settings: { note: `Because ${marker}`, noteHighlight: true }, metric_ids: [] });
    }
    await expect(dashboardWidgets(as.olga, dash)).rejects.toBeInstanceOf(Forbidden);
    await updateWidget(as.ed, note, { title: "Why", settings: { note: "Ed's words\n- one" } });
    expect(await read(as.vera, dash, note)).toMatchObject({ title: "Why", settings: { note: "Ed's words\n- one" } });
    for (const actor of [as.vera, as.gus, as.olga]) {
      await expect(updateWidget(actor, note, { settings: { note: "mine" } })).rejects.toBeInstanceOf(Forbidden);
      await expect(placeWidget(actor, dash, { type: "spec", template: "note", metricIds: [] })).rejects.toBeInstanceOf(Forbidden);
      await expect(removeWidget(actor, note)).rejects.toBeInstanceOf(Forbidden);
    }
    // A Guest creates nothing, so keeps no copy.
    await expect(saveToPool(as.gus, { type: "widget", id: note }, "Mine")).rejects.toBeInstanceOf(Forbidden);
    await expect(saveToPool(as.olga, { type: "widget", id: note }, "Mine")).rejects.toBeInstanceOf(Forbidden);
  });

  it("is sealed in the database, never draws a Metric and keeps nothing else a browser sends", async () => {
    const { w, as, metric, dash, note, marker } = await setup();
    expect(JSON.stringify(await stored(note))).not.toContain(marker);
    const sent = await placeWidget(as.sara, dash, { type: "spec", template: "note", metricIds: [metric.id], settings: { note: "x", panels: [{ metricIds: [metric.id] }], canvas: { document: {}, stamp: {} }, tagSource: { id: "t" }, headline: "no" } as never });
    expect(await stored(sent)).toMatchObject({ metric_ids: [], title: null });
    expect(Object.keys((await stored(sent)).settings as object)).toEqual(["note"]);
    await expect(updateWidget(as.sara, note, { metricIds: [metric.id] })).rejects.toBeInstanceOf(Refused);
    await expect(updateWidget(as.sara, note, { template: "number" })).rejects.toBeInstanceOf(Refused);
    const number = await placeWidget(as.sara, dash, { type: "metric", id: metric.id });
    await expect(updateWidget(as.sara, number, { template: "note" })).rejects.toBeInstanceOf(Refused);
    // The database refuses it too.
    expect((await db().from("widgets").update({ metric_ids: [metric.id] }).eq("id", note).eq("workspace_id", w.id)).error).not.toBeNull();
  });

  it("keeps within its limits and takes only words", async () => {
    const { as, dash, note } = await setup();
    for (const patch of [{ settings: { note: "x".repeat(NOTE_TEXT_MAX + 1) } }, { settings: { note: 7 as never } }, { title: "x".repeat(121) }]) {
      await expect(updateWidget(as.sara, note, patch)).rejects.toBeInstanceOf(Refused);
    }
    await expect(placeWidget(as.sara, dash, { type: "spec", template: "note", metricIds: [], settings: { note: "x\n".repeat(200) } })).rejects.toBeInstanceOf(Refused);
  });

  it("is moved, copied, versioned and restored like any widget, and saved as no template", async () => {
    const { as, dash, note, marker } = await setup();
    await saveLayout(as.sara, dash, [{ i: String(note), x: 2, y: 3, w: 6, h: 4 }]);
    await saveToPool(as.ed, { type: "widget", id: note }, "Kept words");
    expect((await savedWidgets(as.ed)).find((x) => x.template === "note")).toMatchObject({ title: "Kept words", settings: { note: `Because ${marker}` } });
    const copy = await placeWidget(as.sara, dash, { type: "widget", id: note });
    expect(await read(as.sara, dash, copy)).toMatchObject({ template: "note", settings: { note: `Because ${marker}` } });
    await expect(saveTemplate(as.sara, { widgetId: note, name: "T", description: "", labels: [], choices: {} })).rejects.toBeInstanceOf(Refused);
    await expect(saveDashboardTemplate(as.sara, { dashboardId: dash, name: "T", description: "", labels: [] })).rejects.toThrow("nothing a template can keep");
    await expect(applyTemplate(as.sara, note, 1, [])).rejects.toBeInstanceOf(Refused);
    await removeWidget(as.sara, copy);
    const { versions } = await listVersions(as.sara, "dashboard", dash);
    await restoreVersion(as.sara, versions.at(-1)!.id);
    const { data } = await db().from("versions").select("snapshot").eq("object_type", "dashboard").eq("object_id", dash);
    expect(JSON.stringify(data)).not.toContain(marker);
  });

  it("is kept by a Snapshot as it was, where only the dashboard's writers change its words", async () => {
    const { as, dash, note, marker } = await setup();
    const id = await takeSnapshot(as.sara, dash, october);
    await showSnapshot(as.sara, id);
    await updateWidget(as.sara, note, { settings: { note: "Changed since" } });
    const kept = async (actor: typeof as.vera) => (await openSnapshot(actor, id)).widgets.find((x) => x.id === note)!;
    expect(await kept(as.vera)).toMatchObject({ title: `Why ${marker}`, settings: { note: `Because ${marker}`, noteHighlight: true } });
    const { data: row } = await db().from("dashboard_snapshots").select("words, frozen").eq("id", id).single();
    expect(JSON.stringify(row)).not.toContain(marker);
    await expect(openSnapshot(as.olga, id)).rejects.toBeInstanceOf(Forbidden);
    await expect(editSnapshotWords(as.vera, id, { widgets: { [String(note)]: { note: "mine" } } })).rejects.toBeInstanceOf(Forbidden);
    await expect(editSnapshotWords(as.ed, id, { widgets: { [String(note)]: { note: "x".repeat(NOTE_TEXT_MAX + 1) } } })).rejects.toBeInstanceOf(Refused);
    // A long note is kept whole, not cut to the length of a Finding's words.
    const long = "word ".repeat(300).trim();
    await editSnapshotWords(as.ed, id, { widgets: { [String(note)]: { title: "Why", note: long } } });
    expect((await kept(as.vera)).settings.note).toBe(long);
  });

  it("goes out with a View Link, live, frozen and of a Snapshot", async () => {
    const { as, dash, note, marker } = await setup();
    const link = (label: string, frozen: boolean, snapshotId?: number) => createViewLink(as.sara, "dashboard", dash, { label, expires: inAMonth(), frozen, snapshotId });
    const made = [await link("Live", false), await link("Frozen", true)];
    const snapshot = await takeSnapshot(as.sara, dash, october);
    await showSnapshot(as.sara, snapshot);
    made.push(await link("Snapshot", false, snapshot));
    for (const token of made) {
      const view = await openViewLink(token);
      expect(view?.widgets?.find((x) => x.id === note)).toMatchObject({ title: `Why ${marker}`, settings: { note: `Because ${marker}`, noteHighlight: true }, metric_ids: [] });
    }
    const { data } = await db().from("view_links").select("frozen, snapshot_words").eq("object_id", dash);
    expect(JSON.stringify(data)).not.toContain(marker);
  });

  it("is read by a program, which neither adds nor changes one", async () => {
    const { w, as, dash, note, marker } = await setup();
    const { secret } = await createAccessKey(as.sara, { name: "Assistant", scopes: ["dashboards:read", "dashboards:write"] as Scope[], expiresOn: inAMonth() });
    const key = (await actorForKey(secret)) as KeyActor;
    expect((await getDashboardWithKey(key, dash)).widgets.find((x) => x.id === note)).toMatchObject({ view: "note", title: `Why ${marker}`, metrics: [], note: { text: `Because ${marker}`, highlighted: true } });
    const metric = (await db().from("metrics").select("slug").eq("workspace_id", w.id).limit(1).single()).data!.slug as string;
    await expect(addWidgetWithKey(key, dash, { view: "note" as never, metrics: [metric] })).rejects.toBeInstanceOf(Unusable);
    await expect(updateWidgetWithKey(key, dash, note, { title: "x" })).rejects.toBeInstanceOf(Unusable);
    await expect(removeWidgetWithKey(key, dash, note)).rejects.toBeInstanceOf(Unusable);
    expect((await listTemplatesWithKey(key, "view")).map((t) => t.id)).not.toContain("note");
    const snapshot = await takeSnapshot(as.sara, dash, october);
    expect((await getSnapshotWithKey(key, snapshot)).widgets.find((x) => x.id === note)).toMatchObject({ note: { text: `Because ${marker}`, highlighted: true } });
  });
});

describe("a Free Layout where the slide editor has no key", () => {
  it("is neither added, copied nor changed, and the one there is kept, moved and removed", async () => {
    const { as, dash, metric } = await setup();
    const layout = await placeWidget(as.sara, dash, { type: "spec", template: "canvas", metricIds: [] });
    const number = await placeWidget(as.sara, dash, { type: "metric", id: metric.id });
    const before = await stored(layout);
    withoutSlideKey();
    for (const attempt of [
      () => placeWidget(as.sara, dash, { type: "spec", template: "canvas", metricIds: [] }),
      () => placeWidget(as.sara, dash, { type: "widget", id: layout }),
      () => saveToPool(as.sara, { type: "widget", id: layout }, "Copy"),
      () => updateWidget(as.sara, number, { template: "canvas" }),
      () => updateWidget(as.sara, layout, { template: "number" }),
      () => updateWidget(as.sara, layout, { settings: { canvas: { document: { store: {} }, stamp: {} } } }),
      () => updateWidget(as.sara, layout, { title: "x" }),
      () => applyTemplate(as.sara, layout, 1, []),
    ]) await expect(attempt()).rejects.toThrow("no license key");
    expect(await stored(layout)).toEqual(before);
    expect((await dashboardWidgets(as.vera, dash)).map((x) => x.id)).toContain(layout);
    await saveLayout(as.sara, dash, [{ i: String(layout), x: 1, y: 9, w: 6, h: 6 }]);
    await updateWidget(as.sara, number, { title: "Still changed" });
    await removeWidget(as.sara, layout);
  });

  it("is added again once there is a key", async () => {
    const { as, dash } = await setup();
    withoutSlideKey();
    await expect(placeWidget(as.sara, dash, { type: "spec", template: "canvas", metricIds: [] })).rejects.toThrow("no license key");
    process.env.ZIFFR_TLDRAW_LICENSE_KEY = ["tldraw-tests/", "bWFkZQ", ".", "dXA"].join("");
    forgetStoredSettings();
    await expect(placeWidget(as.sara, dash, { type: "spec", template: "canvas", metricIds: [] })).resolves.toEqual(expect.any(Number));
  });
});

describe("a Note Widget in the demo", () => {
  // Only a demo this file reset goes back to its seed: where the demo is not the only Workspace, nothing is touched.
  let reset = false;
  afterAll(async () => { if (reset) await demoBackToSeed(); }, 180_000);
  it("takes a visitor's words only through the demo's text rules, and keeps a seeded widget's", async () => {
    await assertDemoIsOnlyWorkspace();
    reset = true;
    await resetDemoWorkspace({ openToVisitors: true });
    process.env.ZIFFR_DEMO_CHANGES = "1"; process.env.ZIFFR_DEMO_ONLY = "1"; forgetStoredSettings();
    const sara = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
    const generation = Number((await db().from("demo_state").select("generation").single()).data?.generation);
    const showcase = new Set(((await db().from("demo_showcase").select("row_key").eq("table_name", "dashboards")).data ?? []).map((r) => String(r.row_key)));
    const seeded = ((await db().from("dashboards").select("id, owner_id, widgets!inner(id)").eq("workspace_id", DEMO_WORKSPACE_ID)).data ?? []).find((d) => !showcase.has(String(d.id)))!;
    await visitingDemo({ generation, visit: "0123456789abcdef0123456789abcdef" }, async () => {
      const dash = await createDashboard(sara, "My notes");
      const note = await placeWidget(sara, dash, { type: "spec", template: "note", metricIds: [], title: "Why", settings: { note: "Two lines\n- one" } });
      expect((await stored(note)).template).toBe("note");
      for (const bad of ["see https://example.org", "<b>bold</b>", "write me@example.org"]) {
        await expect(updateWidget(sara, note, { settings: { note: bad } })).rejects.toBeInstanceOf(DemoTextRefused);
      }
      // A widget the seed made takes no words of a visitor's.
      const owner = { ...sara, personId: seeded.owner_id as string };
      const widget = (seeded.widgets as { id: number }[])[0].id;
      await expect(updateWidget(owner, widget, { settings: { note: "mine" } })).rejects.toThrow();
    });
  }, 180_000);
});
