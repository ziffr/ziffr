// A deck's kept numbers (spec 0061, #1204, #1207, #1208; GLOSSARY: Snapshot Part, Snapshot, Deck, Share), against
// the database: what a Snapshot keeps when everything around it changes, who gets a part, that a deck's Share and its
// View Links open nothing through one, who may put a Snapshot on a deck, and what its owner is told before sharing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccessKey, actorForKey } from "./access-keys";
import { getCanvasData, visibleMetricIds } from "./access";
import { Forbidden, type Actor, type KeyActor } from "./actor";
import { setAttainmentMethod } from "./workspace-settings";
import { submitObservation } from "./api-submissions";
import { createDashboard, placeWidget, removeWidget } from "./dashboards";
import { db } from "./db";
import { deckShareGaps, KEPT_READS_PER_MINUTE, newDeckFromSnapshot, readKeptNumbers, snapshotAddition, snapshotSlides, type KeptSnapshot } from "./deck-snapshots";
import { saveDeck } from "./decks";
import { setYearStart } from "./fiscal-year";
import { deleteMetric, saveSeriesRows } from "./metrics";
import { dashboardWidgets, deckView } from "./page-data";
import { share, shareWithGroup } from "./sharing";
import { keptRequests, SNAPSHOT_PART_SHAPE } from "./snapshot-parts";
import { deleteSnapshot, editSnapshotWords, openSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { createGroup, setGroupMember } from "./team";
import { workspace } from "./test/db-fixtures";
import { listVersions, restoreVersion, saveNamedVersion } from "./version-history";
import { createViewLink, openViewLink } from "./view-links";
import { getMetrics } from "./workspace-data";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const october = { kind: "month", start: "2026-10-01" };

/** Sara's dashboard "Sales" with Revenue and Cost, shared with Ann (Viewer) and Ben (Editor); Dana has no share of
 * it. A shown Snapshot of October 2026. */
async function setup() {
  const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member"); const dana = await w.person("member");
  const rev = await w.metric(sara, { name: "Revenue", target_min: 90 });
  const cost = await w.metric(sara, { name: "Cost", polarity: "lower" });
  for (const [p, v] of [["2026-09-01", 90], ["2026-10-01", 100]] as const) { await w.value(rev.id, p, v); await w.value(cost.id, p, v / 2); }
  const owner = w.actor(sara);
  const dash = await createDashboard(owner, "Sales");
  await placeWidget(owner, dash, { type: "spec", template: "story", metricIds: [rev.id], settings: { headline: "Revenue held up", panels: [] } });
  await placeWidget(owner, dash, { type: "metric", id: cost.id });
  await share(owner, "dashboard", dash, ben, "editor");
  await share(owner, "dashboard", dash, ann, "viewer");
  const snap = await takeSnapshot(owner, dash, october);
  await editSnapshotWords(owner, snap, { intro: "October in short." });
  await showSnapshot(owner, snap);
  const widgets = (await openSnapshot(owner, snap)).widgets;
  const partOf = (metricId: number) => widgets.find((x) => x.metric_ids.includes(metricId) || x.settings.panels?.some((p) => p.metricIds.includes(metricId)))!.id;
  return { w, owner, ben: w.actor(ben, "member"), ann: w.actor(ann, "member"), dana: w.actor(dana, "member"), rev, cost, dash, snap, revPart: partOf(rev.id), costPart: partOf(cost.id) };
}

const shape = (id: string, type: string, parentId: string, props: Record<string, unknown>) => ({ id, typeName: "shape", type, parentId, x: 0, y: 0, meta: {}, props });
const frame = (id: string) => shape(id, "frame", "page:page", { w: 1280, h: 720, name: id });
const part = (id: string, parentId: string, snapshotId: number, n: number) => shape(id, SNAPSHOT_PART_SHAPE, parentId, { w: 600, h: 300, snapshotId, part: n });
const widget = (id: string, parentId: string, metricId: number) => shape(id, "ziffr-widget", parentId, { w: 600, h: 300, template: "line", metricIds: [metricId], settings: "{}", title: "" });
const deckOf = (...shapes: { id: string }[]) => ({ store: Object.fromEntries(shapes.map((s) => [s.id, s])) });

const read = async (actor: Actor, snapshotId: number, parts: number[], metricIds: number[] = []) => (await readKeptNumbers(actor, [{ snapshotId, parts, metricIds }]))[0];
function shown(s: KeptSnapshot) {
  expect(s.state).toBe("shown");
  return s as Extract<KeptSnapshot, { state: "shown" }>;
}

describe("a Snapshot keeps everything it shows (spec 0061)", () => {
  it("values, targets, Projections, Breakdowns, derived figures and how they are judged, whatever changes after", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const owner = w.actor(sara);
    const orders = await w.metric(sara, { name: "Orders", target_min: 8, target_max: 20, unit: "pcs" });
    await w.token(orders.id, sara);
    const { secret } = await createAccessKey(owner, { name: "Feed", scopes: ["values:submit"], expiresOn: inDays(30) });
    const key = (await actorForKey(secret)) as KeyActor;
    const quiet = { notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) };
    await w.value(orders.id, "2026-09-01", 9);
    expect(await submitObservation(key, orders.slug, { period: "2026-10-01", value: 10, breakdown: [{ label: "Shop", value: 6 }, { label: "Phone", value: 4 }] }, quiet)).toMatchObject({ ok: true });
    const input = await w.metric(sara, { name: "Revenue" });
    await w.value(input.id, "2026-10-01", 200);
    const derived = await w.metric(sara, { name: "Order value", formula: `{${input.slug}} / {${orders.slug}}` });
    await saveSeriesRows(owner, orders.id, "target", [{ period: "2026-10-01", value: 12 }], "plan");
    await saveSeriesRows(owner, orders.id, "projection", [{ period: "2026-10-01", value: 11 }], "forecast");
    const dash = await createDashboard(owner, "Operations");
    for (const m of [orders, derived]) await placeWidget(owner, dash, { type: "metric", id: m.id });
    const id = await takeSnapshot(owner, dash, october);
    await showSnapshot(owner, id);
    const before = (await openSnapshot(owner, id)).data;
    const kept = shown(await read(owner, id, [], [orders.id, derived.id])).data;
    expect(before.series[orders.slug].map((p) => p.value)).toEqual([9, 10]);
    expect(before.series[derived.slug].map((p) => p.value)).toEqual([20]);
    expect(before.targets[orders.id]).toHaveLength(1);
    expect(before.projections[orders.id]).toHaveLength(1);
    expect(before.breakdowns[orders.id]["2026-10-01"].map((r) => [r.label, r.value])).toEqual([["Shop", 6], ["Phone", 4]]);

    // Everything around it changes.
    expect(await submitObservation(key, orders.slug, { period: "2026-10-01", value: 30, breakdown: [{ label: "Shop", value: 30 }] }, quiet)).toMatchObject({ ok: true });
    await w.value(orders.id, "2026-08-01", 7);
    await db().from("observations").update({ value: 5 }).eq("metric_id", orders.id).eq("period_start", "2026-09-01");
    await db().from("observations").update({ value: 900 }).eq("metric_id", input.id).eq("period_start", "2026-10-01");
    await saveSeriesRows(owner, orders.id, "target", [{ period: "2026-10-01", value: 99 }], "new plan");
    await saveSeriesRows(owner, orders.id, "projection", [{ period: "2026-10-01", value: 98 }], "new forecast");
    await db().from("metrics").update({ name: "Renamed", unit: "items", decimals: 2, polarity: "lower", target_min: 50, target_max: 60, attainment_method: "distance" }).eq("id", orders.id);
    await db().from("metrics").update({ formula: `{${input.slug}}` }).eq("id", derived.id);
    await setAttainmentMethod(owner, "distance");
    await setYearStart(owner, 4);

    const after = (await openSnapshot(owner, id)).data;
    const keeps = ["metrics", "series", "targets", "projections", "breakdowns", "condensed", "pending", "locked", "attainmentMethod", "today"] as const;
    for (const k of keeps) expect(after[k], k).toEqual(before[k]);
    // A part draws the same.
    const keptAfter = shown(await read(owner, id, [], [orders.id, derived.id]));
    for (const k of keeps) expect(keptAfter.data[k], k).toEqual(kept[k]);
    expect(keptAfter.corrected.sort()).toEqual([orders.id, derived.id].sort());
    // The one thing the Snapshot's own screen takes from the Workspace as it is now: the start of the Fiscal Year
    // (spec 0017). A slide keeps the Snapshot's (spec 0061). The Number Style, which is only how a number is written,
    // is the Workspace's in both.
    expect(after.yearStart).not.toEqual(before.yearStart);
    expect(keptAfter.data.yearStart).toEqual(before.yearStart);
  });
});

describe("who sees a Snapshot Part", () => {
  it("whoever may open the dashboard, once shown, gets the parts asked for and only their Metrics", async () => {
    const { ann, rev, cost, snap, revPart, costPart } = await setup();
    const s = shown(await read(ann, snap, [0, revPart]));
    expect(s).toMatchObject({ name: "Sales", label: "October 2026", intro: "October in short.", corrected: [] });
    expect(s.parts.map((p) => p.part)).toEqual([0, revPart]);
    expect(s.data.metrics.map((m) => m.id)).toEqual([rev.id]);
    expect(Object.keys(s.data.series)).toEqual([rev.slug]);
    expect(s.data.themes).toEqual([]);
    expect(JSON.stringify(s)).not.toContain(cost.slug);
    // Without the opening part, no introduction; an unknown part number is simply not there.
    const other = shown(await read(ann, snap, [costPart, 999999]));
    expect(other.intro).toBe("");
    expect(other.parts.map((p) => p.part)).toEqual([costPart]);
  });

  it("not a part whose Metric the viewer no longer sees, though they may open the dashboard", async () => {
    const { owner, ann, cost, dash, snap, revPart, costPart } = await setup();
    const live = (await dashboardWidgets(owner, dash)).find((x) => x.metric_ids.includes(cost.id))!;
    await removeWidget(owner, live.id);
    const s = shown(await read(ann, snap, [0, revPart, costPart], [cost.id]));
    expect(s.parts.map((p) => p.part)).toEqual([0, revPart]);
    expect(s.data.metrics.map((m) => m.id)).not.toContain(cost.id);
    expect(JSON.stringify(s)).not.toContain(cost.slug);
  });

  it("nothing at all to who may not open the dashboard; a forged, a foreign and a missing id answer alike", async () => {
    const { owner, dana, rev, snap, revPart } = await setup();
    const nothing = { snapshotId: snap, state: "unavailable" };
    // Dana sees the Metric on her own: the part stays closed, the dashboard is not hers.
    await share(owner, "metric", rev.id, dana.personId, "viewer");
    expect(await read(dana, snap, [0, revPart], [rev.id])).toEqual(nothing);
    const other = await ws("Other"); const zoe = await other.person("owner");
    expect(await read(other.actor(zoe), snap, [0, revPart])).toEqual(nothing);
    expect(await read(owner, 2_000_000_000, [0])).toEqual({ snapshotId: 2_000_000_000, state: "unavailable" });
  });

  it("not a draft, not even to the dashboard's owner; a deleted one only says so to who may open the dashboard", async () => {
    const { owner, ann, dana, dash, snap, revPart } = await setup();
    const draft = await takeSnapshot(owner, dash, { kind: "month", start: "2026-09-01" });
    expect((await read(owner, draft, [0])).state).toBe("unavailable");
    await deleteSnapshot(owner, draft);
    // Never shown, so not even "deleted" is said of it.
    expect((await read(ann, draft, [0])).state).toBe("unavailable");
    await deleteSnapshot(owner, snap);
    expect(await read(ann, snap, [0, revPart])).toEqual({ snapshotId: snap, state: "deleted" });
    expect(await read(dana, snap, [0, revPart])).toEqual({ snapshotId: snap, state: "unavailable" });
    await db().from("dashboards").delete().eq("id", dash);
    expect((await read(owner, snap, [0])).state).toBe("unavailable");
  });

  it("refuses a request that is not one", async () => {
    const { owner, snap } = await setup();
    for (const bad of [null, {}, [{ snapshotId: "1", parts: [], metricIds: [] }], [{ snapshotId: snap, parts: [-1], metricIds: [] }], [{ snapshotId: snap, parts: [], metricIds: ["x"] }], [{ snapshotId: snap, parts: Array.from({ length: 101 }, (_, i) => i), metricIds: [] }], Array.from({ length: 21 }, () => ({ snapshotId: snap, parts: [], metricIds: [] }))]) {
      await expect(readKeptNumbers(owner, bad)).rejects.toEqual(forbidden);
    }
  });

  it("keeps its numbers when a value is corrected, and says that it was", async () => {
    const { ann, rev, snap, revPart } = await setup();
    await db().from("observations").update({ value: 999 }).eq("metric_id", rev.id).eq("period_start", "2026-10-01");
    const s = shown(await read(ann, snap, [revPart]));
    expect(s.data.series[rev.slug].at(-1)?.value).toBe(100);
    expect(s.corrected).toEqual([rev.id]);
  });
});

describe("a deck with kept numbers", () => {
  it("opens no Metric through its Share, by a part or by a widget beside one", async () => {
    const { w, ann, dana, rev, cost, snap, revPart } = await setup();
    const deck = await newDeckFromSnapshot(ann, snap);
    const document = deckOf(frame("shape:kept"), part("shape:p", "shape:kept", snap, revPart), widget("shape:beside", "shape:kept", cost.id));
    await saveDeck(ann, deck, document);
    await share(ann, "deck", deck, dana.personId, "viewer");
    const seen = await visibleMetricIds(w.id, dana.personId, await getMetrics(w.id));
    expect([...seen]).toEqual([]);
    expect((await deckView(dana, deck))?.role).toBe("viewer");
    expect((await getCanvasData(w.id, dana.personId, { seriesOf: [rev.id, cost.id] })).series).toEqual({});
    expect(await readKeptNumbers(dana, keptRequests(document))).toEqual([{ snapshotId: snap, state: "unavailable" }]);
    // A live widget elsewhere opens its Metric as before, never the dashboard, so not the part.
    await saveDeck(ann, deck, deckOf(...Object.values(document.store), frame("shape:live"), widget("shape:w", "shape:live", rev.id)));
    expect([...(await visibleMetricIds(w.id, dana.personId, await getMetrics(w.id)))]).toEqual([rev.id]);
    expect((await read(dana, snap, [revPart])).state).toBe("unavailable");
  });

  it("takes no widget for a Metric the saver does not see, on a slide that keeps numbers either, so none holds up a delete", async () => {
    const { w, ann, snap, revPart } = await setup();
    const sam = await w.person("member");
    const secret = await w.metric(sam, { name: "Payroll" });
    const deck = await newDeckFromSnapshot(ann, snap);
    const kept = [frame("shape:kept"), part("shape:p", "shape:kept", snap, revPart)];
    await expect(saveDeck(ann, deck, deckOf(...kept, widget("shape:w", "shape:kept", secret.id)))).rejects.toEqual(forbidden);
    // Nothing of it was stored: its owner deletes it.
    await expect(deleteMetric(w.actor(sam, "member"), secret.id, "Payroll")).resolves.toEqual({ values: 0 });
  });

  it("asks that whoever moves a widget to a live slide sees its Metric, and whoever restores a Version too", async () => {
    const { w, ann, snap, revPart } = await setup();
    const mine = await w.metric(ann.personId, { name: "Pipeline" });
    const deck = await newDeckFromSnapshot(ann, snap);
    const dana = await w.person("member");
    const editor = w.actor(dana, "member");
    const kept = [frame("shape:kept"), part("shape:p", "shape:kept", snap, revPart)];
    await saveDeck(ann, deck, deckOf(...kept, widget("shape:w", "shape:kept", mine.id)));
    await saveNamedVersion(ann, "deck", deck, "With the pipeline");
    await share(ann, "deck", deck, dana, "editor");
    // It stands there already, so the Editor's save keeps it; moving it to a live slide is refused.
    await saveDeck(editor, deck, deckOf(...kept, widget("shape:w", "shape:kept", mine.id)));
    await expect(saveDeck(editor, deck, deckOf(...kept, frame("shape:live"), widget("shape:w", "shape:live", mine.id)))).rejects.toEqual(forbidden);
    await saveDeck(editor, deck, deckOf(...kept));
    const version = (await listVersions(editor, "deck", deck)).versions.find((v) => v.name === "With the pipeline")!;
    await expect(restoreVersion(editor, version.id)).rejects.toThrow(/not shared with you/);
    await expect(restoreVersion(ann, version.id)).resolves.not.toThrow();
  });

  it("restores no Version with a Snapshot Part Ziffr cannot read", async () => {
    const { w, ann, snap } = await setup();
    const deck = await newDeckFromSnapshot(ann, snap);
    const named = shape("shape:p", SNAPSHOT_PART_SHAPE, "shape:s", { w: 1, h: 1, snapshotId: snap, part: 0, title: "Revenue" });
    const { data } = await db().from("versions").insert({ object_type: "deck", object_id: deck, version: 99, snapshot: { name: "Old", document: deckOf(frame("shape:s"), named) }, author_id: ann.personId, workspace_id: w.id }).select("id").single();
    await expect(restoreVersion(ann, data!.id as number)).rejects.toThrow(/cannot read/);
  });

  it("is read only so often by one person", async () => {
    const { ann, dana } = await setup();
    const asks = [{ snapshotId: 2_000_000_000, parts: [], metricIds: [] }];
    for (let i = 0; i < KEPT_READS_PER_MINUTE; i++) await readKeptNumbers(dana, asks);
    await expect(readKeptNumbers(dana, asks)).rejects.toThrow(/too often/);
    // Another person's reads are their own, and a deck that asks nothing is not counted.
    await expect(readKeptNumbers(ann, asks)).resolves.toHaveLength(1);
    await expect(readKeptNumbers(dana, [])).resolves.toEqual([]);
  }, 120_000);

  it("is saved only with well-formed parts, and no free layout or dashboard holds one", async () => {
    const { owner, ann, rev, dash, snap } = await setup();
    const deck = await newDeckFromSnapshot(ann, snap);
    const named = shape("shape:p", SNAPSHOT_PART_SHAPE, "shape:s", { w: 1, h: 1, snapshotId: snap, part: 0, title: "Revenue" });
    await expect(saveDeck(ann, deck, deckOf(frame("shape:s"), named))).rejects.toThrow(/cannot read/);
    const layout = deckOf(part("shape:p", "page:page", snap, 0));
    await expect(placeWidget(owner, dash, { type: "spec", template: "canvas", metricIds: [rev.id], settings: { canvas: { document: layout, stamp: {} } } })).rejects.toThrow(/deck's slides only/);
  });

  it("goes out through a View Link without any part or kept number, live or frozen", async () => {
    const { owner, rev, cost, snap, revPart } = await setup();
    const deck = await newDeckFromSnapshot(owner, snap);
    await saveDeck(owner, deck, deckOf(
      frame("shape:kept"), part("shape:p", "shape:kept", snap, revPart), widget("shape:beside", "shape:kept", cost.id),
      frame("shape:live"), widget("shape:w", "shape:live", rev.id),
    ));
    for (const frozen of [false, true]) {
      const view = (await openViewLink(await createViewLink(owner, "deck", deck, { label: "Board", expires: inDays(30), frozen })))!;
      const out = JSON.stringify(view.document);
      expect(out).not.toContain(SNAPSHOT_PART_SHAPE);
      expect(out).not.toContain("shape:beside");
      expect(out).toContain("shape:w");
      expect(view.data.metrics.map((m) => m.id)).toEqual([rev.id]);
      expect(JSON.stringify(view.data)).not.toContain(cost.slug);
    }
  });
});

describe("putting a Snapshot on a deck (#1207)", () => {
  it("is for the deck's owner and Editors with any role on the dashboard, not for deck Viewers or Guests", async () => {
    const { w, owner, ann, dana, snap, revPart, costPart } = await setup();
    // Ann is only a Viewer of the dashboard.
    const deck = await newDeckFromSnapshot(ann, snap);
    expect(await snapshotAddition(ann, deck, snap)).toEqual({ snapshotId: snap, name: "Sales, October 2026", parts: expect.arrayContaining([0, revPart, costPart]), leftOut: 0 });
    expect((await deckView(ann, deck))?.deck?.name).toBe("Sales, October 2026");
    await share(ann, "deck", deck, owner.personId, "viewer");
    await expect(snapshotAddition(owner, deck, snap)).rejects.toThrow(/owner and its Editors/);
    await share(ann, "deck", deck, owner.personId, "editor");
    expect((await snapshotAddition(owner, deck, snap)).parts).toHaveLength(3);
    const gus = await w.person("guest");
    await share(owner, "dashboard", (await openSnapshot(owner, snap)).dashboardId, gus, "viewer");
    await share(ann, "deck", deck, gus, "viewer");
    await expect(snapshotAddition(w.actor(gus, "guest"), deck, snap)).rejects.toEqual(forbidden);
    // Dana may not open the dashboard.
    await expect(newDeckFromSnapshot(dana, snap)).rejects.toEqual(forbidden);
  });

  it("refuses a draft and a Snapshot the person may not see anything of, and leaves no empty deck behind", async () => {
    const { w, owner, ann, dana, dash, snap } = await setup();
    const draft = await takeSnapshot(owner, dash, { kind: "month", start: "2026-09-01" });
    await expect(snapshotSlides(owner, draft)).rejects.toThrow(/Show the Snapshot/);
    await expect(snapshotSlides(ann, draft)).rejects.toEqual(forbidden);
    await expect(snapshotSlides(dana, draft)).rejects.toEqual(forbidden);
    // Every Metric taken off the live dashboard: its Viewer sees none of the Snapshot's widgets now.
    for (const x of await dashboardWidgets(owner, dash)) await removeWidget(owner, x.id);
    await expect(newDeckFromSnapshot(ann, snap)).rejects.toThrow(/may not see any part/);
    expect((await db().from("decks").select("id").eq("workspace_id", w.id)).data).toEqual([]);
  });
});

describe("what a deck's owner is told before sharing (#1208)", () => {
  it("counts what each person and Group will not see, by Snapshot, and names nothing the owner cannot see", async () => {
    const { owner, ann, dana, cost, snap, revPart, costPart } = await setup();
    const deck = await newDeckFromSnapshot(ann, snap);
    await saveDeck(ann, deck, deckOf(frame("shape:s"), part("shape:a", "shape:s", snap, 0), part("shape:b", "shape:s", snap, revPart), part("shape:c", "shape:s", snap, costPart)));
    await expect(deckShareGaps(owner, deck)).rejects.toEqual(forbidden);
    const group = await createGroup(owner, "Review");
    for (const p of [owner.personId, dana.personId]) await setGroupMember(owner, group, p, true);
    const gaps = await deckShareGaps(ann, deck);
    expect(gaps.unnamed).toBe(0);
    expect(gaps.who[dana.personId]).toEqual([{ from: "Sales, October 2026", count: 3 }]);
    expect(gaps.who[`g${group}`]).toEqual([{ from: "Sales, October 2026", count: 3 }]);
    // Sara owns the dashboard: she misses nothing.
    expect(gaps.who[owner.personId]).toBeUndefined();
    // With the dashboard shared with the Group, nobody in it misses anything.
    const dash = (await openSnapshot(owner, snap)).dashboardId;
    await shareWithGroup(owner, "dashboard", dash, group, "viewer");
    expect((await deckShareGaps(ann, deck)).who[`g${group}`]).toBeUndefined();
    // Cost leaves the live dashboard: whoever saw it only through it loses its part; Sara owns it.
    const live = (await dashboardWidgets(owner, dash)).find((x) => x.metric_ids.includes(cost.id))!;
    await removeWidget(owner, live.id);
    // Ann, the deck's owner, may no longer see that part herself: it is counted without a name, for nobody in particular.
    const later = await deckShareGaps(ann, deck);
    expect(later.unnamed).toBe(1);
    expect(later.who[dana.personId]).toBeUndefined();
    // Taken back: the owner loses the dashboard and learns only how many parts show them nothing.
    await share(owner, "dashboard", dash, ann.personId, null);
    expect(await deckShareGaps(ann, deck)).toEqual({ who: {}, unnamed: 3 });
    expect(JSON.stringify(await deckShareGaps(ann, deck))).not.toContain("Sales");
  });

  it("says who lacks a Metric of a part", async () => {
    const { owner, ben, ann, dana, cost, snap, costPart } = await setup();
    const dash = (await openSnapshot(owner, snap)).dashboardId;
    const deck = await newDeckFromSnapshot(owner, snap);
    await saveDeck(owner, deck, deckOf(frame("shape:s"), part("shape:c", "shape:s", snap, costPart)));
    // Dana may open the dashboard later, once Cost is no longer on it.
    const live = (await dashboardWidgets(owner, dash)).find((x) => x.metric_ids.includes(cost.id))!;
    await removeWidget(owner, live.id);
    await share(owner, "dashboard", dash, dana.personId, "viewer");
    const gaps = await deckShareGaps(owner, deck);
    expect(gaps.who[dana.personId]).toEqual([{ from: "Sales, October 2026", count: 1 }]);
    for (const p of [ann, ben]) expect(gaps.who[p.personId]).toEqual([{ from: "Sales, October 2026", count: 1 }]);
  });
});
