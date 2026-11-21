// The words of dashboards, Findings and Snapshots, and Metric descriptions, sealed with the Workspace Key (spec 0028,
// ticket #334), against the database: written sealed, read opened by every reader, plain rows from before still read,
// copies in Versions and View Links sealed, a place's words never opening in another, and no clear text in a dump.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createDashboard, placeWidget, saveDashboardText, updateWidget } from "./dashboards";
import { createMetric, updateMetricDetails } from "./metrics";
import { dashboardWidgets, savedWidgets } from "./page-data";
import { visibleDashboards } from "./access";
import { editSnapshotWords, openSnapshot, showSnapshot, snapshotDeckSeed, takeSnapshot } from "./snapshots";
import { listVersions, restoreVersion } from "./version-history";
import { createViewLink, openViewLink } from "./view-links";
import { getMetrics } from "./workspace-data";
import { openRows } from "./sealed-columns";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { forgetWorkspaceKey, isSealed } from "./workspace-keys";

const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 71).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
}, 120_000);

const october = { kind: "month", start: "2026-10-01" };
const inAMonth = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

/** A Workspace with an owner, a Metric with values, and a dashboard holding a Finding in every kind of word. */
async function setup() {
  const w = await workspace("Words");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const sara = await w.person("owner");
  const actor = w.actor(sara);
  const marker = `mk${Date.now().toString(36)}`;
  const rev = await w.metric(sara, { name: "Revenue" });
  for (const [p, v] of [["2026-09-01", 90], ["2026-10-01", 100]] as const) await w.value(rev.id, p, v);
  const dash = await createDashboard(actor, "Words");
  await saveDashboardText(actor, dash, { intro: `Intro ${marker}` });
  const finding = await placeWidget(actor, dash, {
    type: "spec", template: "story", metricIds: [rev.id], title: `Title ${marker}`,
    settings: { kicker: `Kicker ${marker}`, headline: `Headline ${marker}`, subline: `Subline ${marker}`, footnote: `Footnote ${marker}`, source: `Source ${marker}`, panels: [] },
  });
  return { w, sara, actor, rev, dash, finding, marker };
}

/** Every row the Workspace has in the tables that keep these words, as text. */
async function dump(workspaceId: string): Promise<string> {
  const parts: unknown[] = [];
  for (const table of ["dashboards", "widgets", "dashboard_snapshots", "view_links", "versions", "metrics"]) {
    const { data } = await db().from(table).select("*").eq("workspace_id", workspaceId);
    parts.push(data);
  }
  return JSON.stringify(parts);
}

describe("a dashboard's introduction, a widget's title and a Finding's words", () => {
  it("are stored sealed, bound to their row, and read as written", async () => {
    const { w, actor, dash, finding, marker } = await setup();
    const { data: d } = await db().from("dashboards").select("intro").eq("id", dash).single();
    expect(isSealed(d!.intro)).toBe(true);
    const { data: row } = await db().from("widgets").select("title, settings").eq("id", finding).single();
    expect(isSealed(row!.title)).toBe(true);
    const settings = row!.settings as Record<string, unknown>;
    for (const key of ["kicker", "headline", "subline", "footnote", "source"]) expect(isSealed(settings[key] as string), key).toBe(true);
    // What is not a word stays as it is, so the database can still be asked about it.
    expect(settings.panels).toEqual([]);
    forgetWorkspaceKey(w.id);
    expect((await visibleDashboards(w.id, actor.personId)).find((x) => x.id === dash)?.intro).toBe(`Intro ${marker}`);
    const [widget] = await dashboardWidgets(actor, dash);
    expect(widget.title).toBe(`Title ${marker}`);
    expect(widget.settings).toMatchObject({ kicker: `Kicker ${marker}`, headline: `Headline ${marker}`, subline: `Subline ${marker}`, footnote: `Footnote ${marker}`, source: `Source ${marker}` });
  });

  it("change as one thing: an edit seals again, a saved copy in the Pool keeps its own words", async () => {
    const { w, actor, finding, marker } = await setup();
    await updateWidget(actor, finding, { title: `Changed ${marker}`, settings: { headline: `New headline ${marker}`, panels: [] } });
    const { data: row } = await db().from("widgets").select("title, settings").eq("id", finding).single();
    expect(isSealed(row!.title)).toBe(true);
    expect(isSealed((row!.settings as { headline: string }).headline)).toBe(true);
    const { saveToPool } = await import("./dashboards");
    await saveToPool(actor, { type: "widget", id: finding }, `Pooled ${marker}`);
    forgetWorkspaceKey(w.id);
    const [pooled] = await savedWidgets(actor);
    expect(pooled.title).toBe(`Pooled ${marker}`);
    expect(pooled.settings.headline).toBe(`New headline ${marker}`);
  });

  it("keep a free layout's seed words sealed, and a free layout made free again does not nest its seed", async () => {
    const { w, actor, dash, finding, marker } = await setup();
    await updateWidget(actor, finding, { template: "canvas" });
    const { data: first } = await db().from("widgets").select("settings").eq("id", finding).single();
    const seed = (first!.settings as { canvasSeed: { settings: { headline: string } } }).canvasSeed;
    expect(isSealed(seed.settings.headline)).toBe(true);
    await updateWidget(actor, finding, { template: "canvas" });
    const { data: again } = await db().from("widgets").select("settings").eq("id", finding).single();
    expect(JSON.stringify(again!.settings)).not.toContain("canvasSeed\":{\"template\":\"canvas");
    forgetWorkspaceKey(w.id);
    const [widget] = await dashboardWidgets(actor, dash);
    expect((widget.settings.canvasSeed?.settings as { headline?: string }).headline).toBe(`Headline ${marker}`);
  });

  it("written before the upgrade, in clear, still read as they are, and are sealed when changed", async () => {
    const w = await workspace("Plain");
    cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const { data: made } = await db().from("dashboards").insert({ name: "Old", owner_id: sara, workspace_id: w.id, intro: "Old intro" }).select("id").single();
    const { data: wid } = await db().from("widgets").insert({ owner_id: sara, dashboard_id: made!.id, template: "story", metric_ids: [], title: "Old title", settings: { headline: "Old headline" }, workspace_id: w.id }).select("id").single();
    expect((await visibleDashboards(w.id, sara)).find((x) => x.id === made!.id)?.intro).toBe("Old intro");
    const [widget] = await dashboardWidgets(w.actor(sara), made!.id);
    expect([widget.title, widget.settings.headline]).toEqual(["Old title", "Old headline"]);
    await saveDashboardText(w.actor(sara), made!.id, { intro: "New intro" });
    expect(isSealed((await db().from("dashboards").select("intro").eq("id", made!.id).single()).data!.intro)).toBe(true);
    expect(wid!.id).toBeGreaterThan(0);
  });

  it("do not open when copied to another widget, another dashboard or another Workspace", async () => {
    const { w, actor, dash, finding } = await setup();
    const other = await setup();
    const second = await placeWidget(actor, dash, { type: "spec", template: "story", metricIds: [], title: "Second", settings: { headline: "Second headline", panels: [] } }).catch(() => null);
    const { data: first } = await db().from("widgets").select("title, settings").eq("id", finding).single();
    const { data: intro } = await db().from("dashboards").select("intro").eq("id", dash).single();
    if (second) await db().from("widgets").update({ title: first!.title, settings: first!.settings }).eq("id", second);
    forgetWorkspaceKey(w.id);
    if (second) {
      const copy = (await dashboardWidgets(actor, dash)).find((x) => x.id === second)!;
      expect(copy.title).toBeNull();
      expect(copy.settings.headline).toBeUndefined();
    }
    // The same sealed words on a dashboard of another Workspace, under that Workspace's own key.
    await db().from("dashboards").update({ intro: intro!.intro }).eq("id", other.dash);
    forgetWorkspaceKey(other.w.id);
    expect((await visibleDashboards(other.w.id, other.actor.personId)).find((x) => x.id === other.dash)?.intro).toBe("");
    // And the same Workspace's other dashboard.
    const twin = await createDashboard(actor, "Twin");
    await db().from("dashboards").update({ intro: intro!.intro }).eq("id", twin);
    forgetWorkspaceKey(w.id);
    expect((await visibleDashboards(w.id, actor.personId)).find((x) => x.id === twin)?.intro).toBe("");
  });

  it("stay in clear in the demo and without ZIFFR_SECRETS_KEY, which work as before", async () => {
    const { data: demo } = await db().from("dashboards").select("id, intro").eq("workspace_id", DEMO_WORKSPACE_ID);
    for (const d of demo ?? []) expect(isSealed(d.intro as string)).toBe(false);
    delete process.env.ZIFFR_SECRETS_KEY;
    const w = await workspace("Clear");
    cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const dash = await createDashboard(w.actor(sara), "Clear");
    await saveDashboardText(w.actor(sara), dash, { intro: "In clear" });
    expect((await db().from("dashboards").select("intro").eq("id", dash).single()).data!.intro).toBe("In clear");
    expect((await visibleDashboards(w.id, sara)).find((x) => x.id === dash)?.intro).toBe("In clear");
  });
});

describe("a Snapshot's words", () => {
  it("are sealed as a whole, with no copy of them in its frozen part, and read, edited and copied into a deck as written", async () => {
    const { w, actor, dash, finding, marker } = await setup();
    const id = await takeSnapshot(actor, dash, october);
    const { data: row } = await db().from("dashboard_snapshots").select("words, frozen").eq("id", id).single();
    const words = row!.words as { sealed?: string };
    expect(Object.keys(words)).toEqual(["sealed"]);
    expect(isSealed(words.sealed)).toBe(true);
    expect(JSON.stringify(row)).not.toContain(marker);
    forgetWorkspaceKey(w.id);
    const open = await openSnapshot(actor, id);
    expect(open.intro).toBe(`Intro ${marker}`);
    const widget = open.widgets.find((x) => x.id === finding)!;
    expect([widget.title, widget.settings.headline, widget.settings.kicker]).toEqual([`Title ${marker}`, `Headline ${marker}`, `Kicker ${marker}`]);
    await editSnapshotWords(actor, id, { intro: `Edited ${marker}`, widgets: { [String(finding)]: { headline: `Edited headline ${marker}` } } });
    const { data: after } = await db().from("dashboard_snapshots").select("words").eq("id", id).single();
    expect(JSON.stringify(after)).not.toContain(marker);
    expect((await openSnapshot(actor, id)).intro).toBe(`Edited ${marker}`);
    await showSnapshot(actor, id);
    expect((await snapshotDeckSeed(actor, id)).intro).toBe(`Edited ${marker}`);
    // Its Versions hold the words sealed for them, and come back.
    const { versions } = await listVersions(actor, "snapshot", id);
    expect(versions.length).toBeGreaterThan(0);
    const { data: kept } = await db().from("versions").select("snapshot").eq("object_type", "snapshot").eq("object_id", id);
    expect(JSON.stringify(kept)).not.toContain(marker);
    await restoreVersion(actor, (await db().from("versions").select("id").eq("object_type", "snapshot").eq("object_id", id).order("version").limit(1).single()).data!.id);
    expect((await openSnapshot(actor, id)).intro).toBe(`Intro ${marker}`);
  });

  it("taken without a key and read after one is set, still read, and are sealed when edited", async () => {
    delete process.env.ZIFFR_SECRETS_KEY;
    const { w, actor, dash, marker } = await setup();
    const id = await takeSnapshot(actor, dash, october);
    expect(JSON.stringify((await db().from("dashboard_snapshots").select("words").eq("id", id).single()).data)).toContain(marker);
    process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 71).toString("base64");
    forgetWorkspaceKey(w.id);
    expect((await openSnapshot(actor, id)).intro).toBe(`Intro ${marker}`);
    await editSnapshotWords(actor, id, { intro: `Now sealed ${marker}` });
    expect(JSON.stringify((await db().from("dashboard_snapshots").select("words").eq("id", id).single().then((r) => r.data)))).not.toContain(marker);
  });

  it("do not open when copied to another Snapshot", async () => {
    const { w, actor, dash } = await setup();
    const a = await takeSnapshot(actor, dash, october);
    const b = await takeSnapshot(actor, dash, { kind: "month", start: "2026-09-01" });
    const { data: first } = await db().from("dashboard_snapshots").select("words").eq("id", a).single();
    await db().from("dashboard_snapshots").update({ words: first!.words }).eq("id", b);
    forgetWorkspaceKey(w.id);
    expect((await openSnapshot(actor, b)).intro).toBe("");
  });
});

describe("a View Link's copies of the words", () => {
  it("are sealed, in a frozen link and in a link to a Snapshot, and are shown as written", async () => {
    const { w, actor, dash, finding, marker } = await setup();
    const frozen = await createViewLink(actor, "dashboard", dash, { label: "Frozen", expires: inAMonth(), frozen: true });
    const id = await takeSnapshot(actor, dash, october);
    await showSnapshot(actor, id);
    const toSnapshot = await createViewLink(actor, "dashboard", dash, { label: "Snapshot", expires: inAMonth(), frozen: false, snapshotId: id });
    const { data: links } = await db().from("view_links").select("frozen, snapshot_words").eq("workspace_id", w.id);
    expect(JSON.stringify(links)).not.toContain(marker);
    expect(JSON.stringify(links)).toContain("w1.");
    forgetWorkspaceKey(w.id);
    const a = await openViewLink(frozen);
    expect(a?.intro).toBe(`Intro ${marker}`);
    expect(a?.widgets?.find((x) => x.id === finding)?.settings.headline).toBe(`Headline ${marker}`);
    // A description goes out with no view.
    expect(a?.data.metrics.every((m) => m.description === "")).toBe(true);
    // Words changed since stay in Ziffr: the link keeps what its owner made it with.
    await editSnapshotWords(actor, id, { intro: "Changed later" });
    const b = await openViewLink(toSnapshot);
    expect(b?.intro).toBe(`Intro ${marker}`);
    // A live link reads the dashboard each time.
    const live = await createViewLink(actor, "dashboard", dash, { label: "Live", expires: inAMonth(), frozen: false });
    expect((await openViewLink(live))?.widgets?.[0].title).toBe(`Title ${marker}`);
  });

  it("do not open on another link", async () => {
    const { w, actor, dash, marker } = await setup();
    const one = await createViewLink(actor, "dashboard", dash, { label: "One", expires: inAMonth(), frozen: true });
    const two = await createViewLink(actor, "dashboard", dash, { label: "Two", expires: inAMonth(), frozen: true });
    const { data: first } = await db().from("view_links").select("frozen").eq("token", one).single();
    await db().from("view_links").update({ frozen: first!.frozen }).eq("token", two);
    forgetWorkspaceKey(w.id);
    const copy = await openViewLink(two);
    expect(copy?.intro).not.toContain(marker);
    expect(copy?.widgets?.[0].settings.headline).toBeUndefined();
  });
});

describe("a Metric's description", () => {
  it("is stored sealed, bound to its Metric, and read as written everywhere", async () => {
    const w = await workspace("Described");
    cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
    const sara = await w.person("owner");
    const actor = w.actor(sara);
    const marker = `mk${Date.now().toString(36)}`;
    const { id, slug } = await createMetric(actor, { name: "Visits", description: `Counts ${marker}`, period: "month" });
    const { data: row } = await db().from("metrics").select("description").eq("id", id).single();
    expect(isSealed(row!.description)).toBe(true);
    expect(row!.description).not.toContain(marker);
    forgetWorkspaceKey(w.id);
    expect((await getMetrics(w.id)).find((m) => m.id === id)?.description).toBe(`Counts ${marker}`);
    await updateMetricDetails(actor, id, { description: `Changed ${marker}` });
    expect((await getMetrics(w.id)).find((m) => m.id === id)?.description).toBe(`Changed ${marker}`);
    // Its Versions hold it sealed, and a restore brings it back sealed again.
    const { data: kept } = await db().from("versions").select("snapshot").eq("object_type", "metric").eq("object_id", id);
    expect(JSON.stringify(kept)).not.toContain(marker);
    const { versions } = await listVersions(actor, "metric", id);
    const first = versions[versions.length - 1];
    await restoreVersion(actor, first.id);
    expect((await getMetrics(w.id)).find((m) => m.id === id)?.description).toBe(`Counts ${marker}`);
    expect(JSON.stringify((await db().from("metrics").select("description").eq("id", id).single()).data)).not.toContain(marker);
    expect(slug).toBeTruthy();
    // Copied to another Metric, it does not open.
    const other = await createMetric(actor, { name: "Orders", description: "Other", period: "month" });
    await db().from("metrics").update({ description: row!.description }).eq("id", other.id);
    forgetWorkspaceKey(w.id);
    expect((await getMetrics(w.id)).find((m) => m.id === other.id)?.description).toBe("");
  });

  it("written before the upgrade, in clear, still reads as it is", async () => {
    const w = await workspace("Old");
    cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const m = await w.metric(sara, { description: "From before" });
    expect((await getMetrics(w.id)).find((x) => x.id === m.id)?.description).toBe("From before");
    expect((await openRows("metrics", w.id, [{ id: m.id, description: "From before" }]))[0].description).toBe("From before");
  });
});

describe("Versions of dashboards and widgets", () => {
  it("hold their words sealed, show what changed, and restore them sealed again", async () => {
    const { w, actor, dash, finding, marker } = await setup();
    await saveDashboardText(actor, dash, { intro: `Second ${marker}` });
    const { data: kept } = await db().from("versions").select("snapshot").eq("workspace_id", w.id);
    expect(JSON.stringify(kept)).not.toContain(marker);
    forgetWorkspaceKey(w.id);
    const { versions } = await listVersions(actor, "dashboard", dash);
    expect(versions.length).toBeGreaterThan(1);
    expect(versions[0].changes.join(" ")).toMatch(/intro/);
    const oldest = versions[versions.length - 1];
    await restoreVersion(actor, oldest.id);
    const restored = (await visibleDashboards(w.id, actor.personId)).find((x) => x.id === dash);
    expect(restored).toBeDefined();
    const after = await dashboardWidgets(actor, dash);
    for (const widget of after) expect(JSON.stringify(widget)).not.toContain("w1.");
    expect(JSON.stringify(await dump(w.id))).not.toContain(marker);
    expect(finding).toBeGreaterThan(0);
  });
});

describe("a dump of the Workspace's rows", () => {
  it("holds none of the words, whatever was done with them", async () => {
    const { w, actor, dash, marker } = await setup();
    const id = await takeSnapshot(actor, dash, october);
    await showSnapshot(actor, id);
    await createViewLink(actor, "dashboard", dash, { label: "Frozen", expires: inAMonth(), frozen: true });
    await createViewLink(actor, "dashboard", dash, { label: "Snapshot", expires: inAMonth(), frozen: false, snapshotId: id });
    const m = await createMetric(actor, { name: "Visits", description: `Counts ${marker}`, period: "month" });
    await updateMetricDetails(actor, m.id, { description: `Counts more ${marker}` });
    await saveDashboardText(actor, dash, { intro: `Again ${marker}` });
    expect(await dump(w.id)).not.toContain(marker);
  });

  it("holds the words as they were written on an Installation without a key", async () => {
    delete process.env.ZIFFR_SECRETS_KEY;
    const { w, marker } = await setup();
    expect(await dump(w.id)).toContain(marker);
  });
});
