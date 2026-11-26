// Deleting several Metrics, or one, against the real database (spec 0065; GLOSSARY: Metric, Metric Record, Metric
// Owner, Snapshot): what the preview names to whom, that nothing is deleted without the record of exactly that set as it
// is now, what the ticks change and for whom, the order of Metrics that read each other, and who still sees a deleted
// Metric in a past Snapshot.
import { inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, Refused, type Actor } from "./actor";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { deckShareGaps, newDeckFromSnapshot, readKeptNumbers } from "./deck-snapshots";
import { createDeck, saveDeck } from "./decks";
import { archiveChosenMetrics, deleteChosenMetrics, planMetricDelete, type DeleteChoices } from "./metric-delete";
import { exportMetricRecord } from "./metric-record";
import { deleteMetric } from "./metrics";
import { ask, reply } from "./questions";
import { share } from "./sharing";
import { SNAPSHOT_PART_SHAPE } from "./snapshot-parts";
import { listSnapshots, openSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { auditRowsOf, workspace } from "./test/db-fixtures";
import { createViewLink, openViewLink } from "./view-links";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const october = { kind: "month", start: "2026-10-01" };
const all = { dashboards: true, decks: true, viewLinks: true };
const none = { dashboards: false, decks: false, viewLinks: false };

/** Sara owns Revenue, Cost and Margin (calculated from both); Ben is an Editor of her dashboard "Sales", Ann a Viewer,
 * Dana sees nothing. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member"); const dana = await w.person("member");
  const rev = await w.metric(sara, { name: "=Revenue" });
  const cost = await w.metric(sara, { name: "Cost" });
  const margin = await w.metric(sara, { name: "Margin", formula: `{${rev.slug}} - {${cost.slug}}`, sources: [], inputs_checked: true });
  for (const [p, v] of [["2026-09-01", 90], ["2026-10-01", 100]] as const) { await w.value(rev.id, p, v); await w.value(cost.id, p, v / 2); }
  const owner = w.actor(sara);
  const dash = await createDashboard(owner, "Sales");
  await placeWidget(owner, dash, { type: "metric", id: rev.id });
  await placeWidget(owner, dash, { type: "spec", template: "progress", metricIds: [rev.id, cost.id] });
  await share(owner, "dashboard", dash, ben, "editor");
  await share(owner, "dashboard", dash, ann, "viewer");
  return { w, sara, ben, ann, dana, rev, cost, margin, dash, owner };
}

/** The files of a ZIP by name, read from its local headers. */
function unzip(zip: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  for (let at = 0; zip.readUInt32LE(at) === 0x04034b50; ) {
    const packed = zip.readUInt32LE(at + 18); const nameLength = zip.readUInt16LE(at + 26);
    const name = zip.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const from = at + 30 + nameLength;
    out[name] = inflateRawSync(zip.subarray(from, from + packed)).toString("utf8");
    at = from + packed;
  }
  return out;
}

const widgetsOf = async (dash: number) => (await db().from("widgets").select("metric_ids").eq("dashboard_id", dash).order("id")).data!.map((x) => x.metric_ids);
/** Deletes as the app does: with the fingerprint of the preview the person is looking at. */
const remove = async (actor: Actor, ids: number[], choices: DeleteChoices, confirm: string) =>
  deleteChosenMetrics(actor, ids, choices, confirm, (await planMetricDelete(actor, ids, choices)).seen);
const exists = async (id: number) => ((await db().from("metrics").select("id", { count: "exact", head: true }).eq("id", id)).count ?? 0) > 0;

describe("the preview of a deletion", () => {
  it("says what can go, what stands in the way and what a tick would change", async () => {
    const { owner, rev, cost, margin } = await setup();
    const alone = await planMetricDelete(owner, [rev.id], all);
    expect(alone.ids).toEqual([]);
    expect(alone.metrics[0].reasons.join(" ")).toContain("Calculated from it: Margin.");
    const unticked = await planMetricDelete(owner, [rev.id, cost.id, margin.id], none);
    expect(unticked.ids).toEqual([margin.id]);
    expect(unticked.dashboards).toEqual(["Sales: removes 2 widgets"]);
    const ticked = await planMetricDelete(owner, [rev.id, cost.id, margin.id], all);
    // The Metric calculated from the others goes first.
    expect(ticked.ids[0]).toBe(margin.id);
    expect(ticked.ids).toHaveLength(3);
    expect(ticked.confirm).toBe("delete 3 Metrics");
  });

  it("gives nobody a right: not the owner's Metrics, and nothing unseen is named", async () => {
    const { w, ben, dana, rev, margin, owner, sara } = await setup();
    const bens = await planMetricDelete(w.actor(ben, "member"), [rev.id], all);
    expect(bens.ids).toEqual([]);
    expect(bens.metrics[0].reasons).toEqual(["Only its Metric Owner deletes it."]);
    expect([bens.dashboards, bens.decks, bens.viewLinks]).toEqual([[], [], []]);
    await expect(planMetricDelete(w.actor(dana, "member"), [rev.id], all)).rejects.toBeInstanceOf(Refused);
    // Dana's deck, which Sara cannot open, is counted and not named.
    await share(owner, "metric", rev.id, dana, "viewer");
    const hidden = await createDeck(w.actor(dana, "member"), "Secret plans");
    await saveDeck(w.actor(dana, "member"), hidden, { store: { "shape:w": { id: "shape:w", typeName: "shape", type: "ziffr-widget", parentId: "page:page", props: { template: "line", metricIds: [rev.id], settings: "{}" }, meta: {} } } });
    const plan = await planMetricDelete(w.actor(sara), [rev.id, margin.id], all);
    expect(plan.ids).toEqual([margin.id]);
    expect(JSON.stringify(plan)).not.toContain("Secret plans");
    expect(JSON.stringify(plan)).toContain("1 you cannot open");
  });

  it("refuses a list that is not one", async () => {
    const { owner } = await setup();
    for (const bad of [null, [], ["1"], [1.5], Array.from({ length: 51 }, (_, i) => i + 1)]) await expect(planMetricDelete(owner, bad)).rejects.toBeInstanceOf(Refused);
  });
});

describe("the record", () => {
  it("holds values, their history, targets, questions and replies, safe for a spreadsheet, for the owner only", async () => {
    const { w, sara, ben, rev, owner } = await setup();
    await db().from("observations").update({ value: 111 }).eq("metric_id", rev.id).eq("period_start", "2026-10-01");
    await ask(owner, { metricId: rev.id, period: "2026-10-01", assigneeId: ben, text: "=HYPERLINK(1)" });
    const action = (await db().from("actions").select("id").eq("metric_id", rev.id).single()).data!;
    await reply(w.actor(ben, "member"), action.id as number, "A big order.", null);
    await expect(exportMetricRecord(w.actor(ben, "member"), [rev.id])).rejects.toBeInstanceOf(Forbidden);
    const record = await exportMetricRecord(w.actor(sara), [rev.id]);
    const files = unzip(record.zip);
    const file = (name: string) => files[`${rev.slug}/${name}`];
    expect(file("values.csv").charCodeAt(0)).toBe(0xfeff);
    expect(file("values.csv")).toContain('"111"');
    expect(file("value-history.csv")).toContain('"100"');
    expect(file("definition.csv")).toContain(`"'=Revenue"`);
    expect(file("questions-and-tasks.csv")).toContain(`"'=HYPERLINK(1)"`);
    expect(file("questions-and-tasks.csv")).toContain("A big order.");
    expect(files["README.txt"]).toContain(rev.slug);
    expect(await auditRowsOf(w.id, "export.metric_record")).toHaveLength(1);
  });
});

describe("deleting", () => {
  it("needs the record of exactly this set, as it is now, and the typed words; until then nothing changes", async () => {
    const { w, sara, owner, rev, cost, margin, dash } = await setup();
    const ids = [rev.id, cost.id, margin.id];
    const go = (confirm = "delete 3 Metrics") => remove(owner, ids, all, confirm);
    // What was previewed is what is changed: another fingerprint changes nothing.
    await exportMetricRecord(owner, ids);
    await expect(deleteChosenMetrics(owner, ids, all, "delete 3 Metrics", "stale")).rejects.toThrow("changed since the preview");
    await w.value(cost.id, "2026-07-01", 1);
    await expect(go()).rejects.toThrow("changed since you downloaded");
    // Another set's record does not do.
    await exportMetricRecord(owner, [margin.id]);
    await expect(go()).rejects.toThrow("changed since you downloaded");
    await exportMetricRecord(owner, ids);
    await expect(go("delete 2 Metrics")).rejects.toThrow("to confirm");
    await w.value(cost.id, "2026-11-01", 3);
    await expect(go()).rejects.toThrow("changed since you downloaded");
    expect(await widgetsOf(dash)).toHaveLength(2);
    for (const id of ids) expect(await exists(id)).toBe(true);
    await exportMetricRecord(owner, ids);
    // Another person's download unlocks nothing for the owner, and theirs nothing for anyone else.
    const done = await remove(w.actor(sara), ids, all, "Delete 3 metrics");
    expect(done.stopped).toBeNull();
    expect(done.deleted.map((m) => m.id)[0]).toBe(margin.id);
    for (const id of ids) expect(await exists(id)).toBe(false);
    expect(await widgetsOf(dash)).toEqual([]);
  });

  it("makes only the ticked changes: shortens a list, empties a text, revokes a link", async () => {
    const { owner, rev, cost, margin, dash } = await setup();
    await deleteMetric(owner, margin.id, "Margin");
    const deck = await createDeck(owner, "Board");
    const text = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cost: {latest}" }] }] };
    await saveDeck(owner, deck, { store: {
      "shape:t": { id: "shape:t", typeName: "shape", type: "text", parentId: "page:page", props: { richText: text }, meta: { metrics: [cost.id] } },
      "shape:w": { id: "shape:w", typeName: "shape", type: "ziffr-widget", parentId: "page:page", props: { template: "progress", metricIds: [rev.id, cost.id], settings: "{}" }, meta: {} },
    } });
    const token = await createViewLink(owner, "dashboard", dash, { label: "Board", expires: inDays(10), frozen: false });
    const blocked = await planMetricDelete(owner, [cost.id], { dashboards: true, decks: true, viewLinks: false });
    expect(blocked.ids).toEqual([]);
    await expect(remove(owner, [cost.id], { dashboards: true, decks: true, viewLinks: false }, "Cost")).rejects.toBeInstanceOf(Refused);
    // Without a download nothing happens.
    await expect(remove(owner, [cost.id], all, "Cost")).rejects.toThrow("Download the record first.");
    await exportMetricRecord(owner, [cost.id]);
    expect((await remove(owner, [cost.id], all, "Cost")).stopped).toBeNull();
    expect(await widgetsOf(dash)).toEqual([[rev.id], [rev.id]]);
    const document = (await db().from("decks").select("document").eq("id", deck).single()).data!.document as { store: Record<string, { meta: { metrics?: number[] }; props: { metricIds?: number[] } }> };
    expect(document.store["shape:t"].meta.metrics).toEqual([0]);
    expect(document.store["shape:w"].props.metricIds).toEqual([rev.id]);
    expect(await openViewLink(token)).toBeNull();
  });

  it("archives instead, keeping everything", async () => {
    const { w, ben, owner, cost } = await setup();
    await expect(archiveChosenMetrics(w.actor(ben, "member"), [cost.id])).rejects.toBeInstanceOf(Refused);
    expect(await archiveChosenMetrics(owner, [cost.id])).toBe(1);
    expect(await exists(cost.id)).toBe(true);
  });
});

describe("a past Snapshot of a deleted Metric", () => {
  it("keeps its copy, marked, for who saw it, and for nobody else", async () => {
    const { w, ben, ann, dana, owner, rev, cost, margin, dash } = await setup();
    const shown = await takeSnapshot(owner, dash, october);
    await showSnapshot(owner, shown);
    const draft = await takeSnapshot(owner, dash, { kind: "month", start: "2026-09-01" });
    const deck = await newDeckFromSnapshot(owner, shown);
    const ids = [rev.id, cost.id, margin.id];
    await exportMetricRecord(owner, ids);
    expect((await remove(owner, ids, all, "delete 3 Metrics")).stopped).toBeNull();

    // Ann saw both through the dashboard they are now off; she still opens the Snapshot with them.
    const hers = await openSnapshot(w.actor(ann, "member"), shown);
    expect(hers.data.metrics.map((m) => m.name).sort()).toEqual(["=Revenue (deleted)", "Cost (deleted)"]);
    expect(hers.data.series[rev.slug].at(-1)?.value).toBe(100);
    expect(hers.hiddenParts).toBe(0);
    expect(hers.deletedMetrics).toHaveLength(2);
    // The draft stays its writers'.
    expect((await listSnapshots(w.actor(ben, "member"), dash)).map((s) => s.id)).toContain(draft);
    expect((await openSnapshot(w.actor(ben, "member"), draft)).hiddenParts).toBe(0);

    // Someone given the dashboard afterwards never saw the Metrics: they get none of them.
    await share(owner, "dashboard", dash, dana, "viewer");
    const later = await openSnapshot(w.actor(dana, "member"), shown);
    expect(later.data.metrics).toEqual([]);
    expect(later.hiddenParts).toBe(2);
    expect(JSON.stringify(later.data)).not.toContain(rev.slug);

    // The owner may still make a View Link to it, and put its numbers on a deck.
    const link = await createViewLink(owner, "dashboard", dash, { label: "Q", expires: inDays(5), frozen: true, snapshotId: shown });
    expect((await openViewLink(link))?.data.metrics.map((m) => m.name)).toContain("Cost (deleted)");
    const parts = [0, ...hers.widgets.map((x) => x.id)];
    const [kept] = await readKeptNumbers(owner, [{ snapshotId: shown, parts, metricIds: [] }]);
    expect(kept.state === "shown" && kept.data.metrics).toHaveLength(2);
    await saveDeck(owner, deck, { store: { "shape:f": { id: "shape:f", typeName: "shape", type: "frame", parentId: "page:page", props: { w: 1280, h: 720, name: "Kept" }, meta: {} }, "shape:p": { id: "shape:p", typeName: "shape", type: SNAPSHOT_PART_SHAPE, parentId: "shape:f", props: { w: 600, h: 300, snapshotId: shown, part: parts[1] }, meta: {} } } });
    const gaps = await deckShareGaps(owner, deck);
    expect(gaps.who[ann]).toBeUndefined();

    // Leaving the Workspace ends it, also after joining again.
    await w.dropMember(ann);
    await db().from("memberships").insert({ workspace_id: w.id, user_id: ann, role: "member" });
    await share(owner, "dashboard", dash, ann, "viewer");
    expect((await openSnapshot(w.actor(ann, "member"), shown)).data.metrics).toEqual([]);
  });

  it("is kept too when a Metric is deleted on its own, as a program does", async () => {
    const { w, ann, owner } = await setup();
    const metric = await w.metric(owner.personId, { name: "Visits" });
    await w.value(metric.id, "2026-10-01", 7);
    await share(owner, "metric", metric.id, ann, "viewer");
    const board = await createDashboard(owner, "Web");
    await placeWidget(owner, board, { type: "metric", id: metric.id });
    await share(owner, "dashboard", board, ann, "viewer");
    const snap = await takeSnapshot(owner, board, october);
    await showSnapshot(owner, snap);
    await db().from("widgets").delete().eq("dashboard_id", board);
    await deleteMetric(owner, metric.id, "Visits");
    expect((await openSnapshot(w.actor(ann, "member"), snap)).data.metrics.map((m) => m.name)).toEqual(["Visits (deleted)"]);
  });
});
