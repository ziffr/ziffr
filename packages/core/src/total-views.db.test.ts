// A Total outside its own page, against the real database (spec 0058, "The same rule everywhere"; GLOSSARY: Total,
// Snapshot, View Link, Alert): Snapshots and View Links as each reader gets them, with the Total closed, open and closed
// again, what never goes out, an Alert, and the Workspace Export.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey, actorForKey } from "./access-keys";
import { getMetric } from "./api";
import { canvasSeries } from "./access";
import { createDashboard, placeWidget } from "./dashboards";
import { createDeck, saveDeck } from "./decks";
import { createDerivedMetric } from "./derived-metrics";
import { db } from "./db";
import { share } from "./sharing";
import { openSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { workspace } from "./test/db-fixtures";
import { archivedMetricHolds } from "./internal/delivery-send";
import { createTotal, setTotalPartPeriods } from "./total-changes";
import { restsOfMessage } from "./total-parts";
import { closeTotal, openTotal, totalOpening } from "./total-opening";
import { createViewLink, emptyInLink, openViewLink } from "./view-links";
import { getMetrics } from "./workspace-data";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const noEffects = { recordCreated: async () => undefined, promptSubmitter: async () => false as const };
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Sara's Total over Ana's and Eva's Commit on a dashboard; Ben views the dashboard's Total through a Share of it only. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member");
  const ana = await w.metric(sara, { name: "Commit Ana", aggregation: "last" });
  const eva = await w.metric(sara, { name: "Commit Eva", aggregation: "last" });
  for (const [m, v] of [[ana, 10], [eva, 7]] as const) await w.value(m.id, "2026-01-01", v);
  const owner = w.actor(sara);
  const total = await createTotal(owner, { name: "Commit", parts: [ana.id, eva.id] }, noEffects);
  const board = async (name: string, metrics: number[]) => {
    const id = await createDashboard(owner, name);
    for (const m of metrics) await placeWidget(owner, id, { type: "metric", id: m });
    return id;
  };
  const open = async () => openTotal(owner, total.id, (await totalOpening(owner, total.id)).fingerprint);
  return { w, owner, sara, ben, ana, eva, total, board, open };
}
const sums = (data: { series: Record<string, { value: number }[]> }, slug: string) => (data.series[slug] ?? []).map((p) => p.value);

describe("a gap table of a Total", () => {
  it("gets the rows' Metrics each reader sees, and on a View Link only those the deck shows anyway", async () => {
    const { w, owner, sara, ben, ana, eva, total } = await setup();
    await share(owner, "metric", total.id, ben, "viewer");
    await share(owner, "metric", ana.id, ben, "viewer");
    const listed = async (actor: Parameters<typeof canvasSeries>[0]) => (await canvasSeries(actor, [total.id])).totalLists?.[total.id];
    expect(await listed(owner)).toMatchObject({ parts: [{ part: ana.id }, { part: eva.id }], others: [], hidden: false });
    const bens = await canvasSeries(w.actor(ben, "member"), [total.id]);
    expect(bens.totalLists![total.id]).toEqual({ parts: [{ part: ana.id, first: "1900-01-01", last: null }], others: ["2026-01-01"], hidden: true });
    expect(JSON.stringify(bens)).not.toContain(eva.slug);
    // A person who does not see the Total gets no list of it.
    const cleo = await w.person("member");
    expect((await canvasSeries(w.actor(cleo, "member"), [total.id, ana.id])).totalLists).toBeUndefined();

    const shape = (metricId: number, element: object) => ({ type: "ziffr-widget", props: { template: "slide", metricIds: [metricId], settings: JSON.stringify({ element }) } });
    const deck = await createDeck(w.actor(sara), "Forecast");
    const table = { "shape:1": shape(total.id, { kind: "gap-table", total: true }) };
    await saveDeck(w.actor(sara), deck, { store: table });
    const view = async (frozen: boolean) => (await openViewLink(await createViewLink(owner, "deck", deck, { label: "x", expires: inDays(7), frozen }), { count: false }))!;
    for (const frozen of [false, true]) {
      const alone = await view(frozen);
      expect(alone.data.totalLists![total.id]).toMatchObject({ parts: [], hidden: true });
      expect(JSON.stringify(alone)).not.toMatch(new RegExp(`Commit (Ana|Eva)|${ana.slug}|${eva.slug}`));
    }
    await saveDeck(w.actor(sara), deck, { store: { ...table, "shape:2": shape(ana.id, { kind: "figure" }) } });
    for (const frozen of [false, true]) {
      const both = await view(frozen);
      expect(both.data.totalLists![total.id]).toEqual({ parts: [{ part: ana.id, first: "1900-01-01", last: null }], others: ["2026-01-01"], hidden: true });
      expect(JSON.stringify(both)).not.toMatch(new RegExp(`Commit Eva|${eva.slug}`));
    }
  });
});

describe("a Total in a Snapshot", () => {
  it("is given to who sees every Metric it counted, to others only while it is open", async () => {
    const { w, owner, ben, eva, total, board, open } = await setup();
    const dash = await board("Team", [total.id]);
    const snapshot = await takeSnapshot(owner, dash, { kind: "month", start: "2026-01-01" }, { today: "2026-03-01" });
    await showSnapshot(owner, snapshot);
    await share(owner, "dashboard", dash, ben, "viewer");
    const reader = w.actor(ben);
    expect(sums((await openSnapshot(owner, snapshot)).data, total.slug)).toEqual([17]);
    const closed = await openSnapshot(reader, snapshot);
    expect(sums(closed.data, total.slug)).toEqual([]);
    expect(JSON.stringify(closed)).not.toMatch(new RegExp(`rests|${eva.slug}`));
    await open();
    expect(sums((await openSnapshot(reader, snapshot)).data, total.slug)).toEqual([17]);
    await closeTotal(owner, total.id);
    expect(sums((await openSnapshot(reader, snapshot)).data, total.slug)).toEqual([]);
  });
});

describe("a Total in a View Link", () => {
  it("goes out only while it is open or where the link shows every Metric counted, frozen copies too", async () => {
    const { owner, ana, eva, total, board, open } = await setup();
    const alone = await board("Alone", [total.id]);
    const whole = await board("Whole", [total.id, ana.id, eva.id]);
    const link = async (dash: number, frozen: boolean) => createViewLink(owner, "dashboard", dash, { label: "x", expires: inDays(7), frozen });
    const [live, frozenClosed, withParts] = [await link(alone, false), await link(alone, true), await link(whole, true)];
    expect(await emptyInLink(owner, "dashboard", alone, null)).toEqual(["Commit"]);
    expect(await emptyInLink(owner, "dashboard", whole, null)).toEqual([]);
    const read = async (token: string) => (await openViewLink(token, { count: false }))!;
    for (const token of [live, frozenClosed]) {
      const view = await read(token);
      expect(sums(view.data, total.slug)).toEqual([]);
      expect(JSON.stringify(view)).not.toMatch(new RegExp(`rests|Commit Eva|${eva.slug}`));
    }
    expect(sums((await read(withParts)).data, total.slug)).toEqual([17]);
    expect(JSON.stringify(await read(withParts))).not.toContain("rests");
    await open();
    const frozenOpen = await link(alone, true);
    expect(sums((await read(live)).data, total.slug)).toEqual([17]);
    expect(sums((await read(frozenOpen)).data, total.slug)).toEqual([17]);
    // Made while it was closed, it keeps what it showed then.
    expect(sums((await read(frozenClosed)).data, total.slug)).toEqual([]);
    await closeTotal(owner, total.id);
    for (const token of [live, frozenOpen]) {
      const view = await read(token);
      expect(sums(view.data, total.slug)).toEqual([]);
      expect(JSON.stringify(view)).not.toMatch(new RegExp(`rests|${eva.slug}`));
    }
  });
});

describe("a Total through the API", () => {
  it("says whether it is open and whether periods are left out for the key's creator", async () => {
    const { w, owner, sara, ben, ana, total, open } = await setup();
    for (const m of [total, ana]) await share(owner, "metric", m.id, ben, "viewer");
    const keyOf = async (person: string) => (await actorForKey((await createAccessKey(w.actor(person), { name: "Script", scopes: ["metrics:read"], expiresOn: inDays(30) })).secret))!;
    const [mine, his] = [await keyOf(sara), await keyOf(ben)];
    expect((await getMetric(mine, total.slug)).total).toEqual({ targets: "own", open: false, periods_withheld: false });
    expect(await getMetric(his, total.slug)).toMatchObject({ formula: null, total: { open: false, periods_withheld: true } });
    await open();
    expect((await getMetric(his, total.slug)).total).toEqual({ targets: "own", open: true, periods_withheld: false });
    expect((await db().from("metrics").select("total_opened_by").eq("id", total.id).single()).data!.total_opened_by).toBe(sara);
  });
});

describe("a message about a Total that waited", () => {
  it("is judged by what its period counted, also where a Metric has left since", async () => {
    const { w, owner, ben, ana, eva, total, open } = await setup();
    for (const m of [total, ana]) await share(owner, "metric", m.id, ben, "viewer");
    // Eva counted in January only.
    await setTotalPartPeriods(owner, total.id, eva.id, { last: "2026-01-01" });
    const metrics = await getMetrics(w.id);
    const m = metrics.find((x) => x.id === total.id)!;
    const about = async (period: string) => ({
      id: 0, workspace_id: w.id, kind: "alert", recipient_id: ben, alert_metric_id: total.id,
      total_rests: await restsOfMessage(w.id, metrics, m, [period]),
    });
    const [january, february] = [await about("2026-01-01"), await about("2026-02-01")];
    expect(await archivedMetricHolds(january)).toBe("Not sent.");
    expect(await archivedMetricHolds(february)).toBeNull();
    expect(await archivedMetricHolds({ ...february, total_rests: null })).toBe("Not sent.");
    await open();
    // Judged by the Total as it stands when the message leaves.
    expect(await archivedMetricHolds(january)).toBeNull();
    await closeTotal(owner, total.id);
    expect(await archivedMetricHolds(january)).toBe("Not sent.");
    // The column takes what is kept.
    expect((await db().from("deliveries").insert({ workspace_id: w.id, connector: "email", recipient_id: ben, kind: "alert", subject: "s", body: "b", mail_state: "outbox", alert_metric_id: total.id, total_rests: january.total_rests })).error).toBeNull();
  });
});

describe("a Heads-up message", () => {
  it("is never sent about a Metric that rests on a Total by now, nor listed as one that may leave", async () => {
    const { w, owner, sara, ana, total } = await setup();
    // A formula that read nothing of a Total when its message was queued, and reads one when it leaves.
    const share = await createDerivedMetric(owner, { name: "Share", formula: `{${total.slug}} - {${ana.slug}}` }, noEffects);
    await db().from("heads_up_settings").insert({ workspace_id: w.id, person_id: sara, by_message: true });
    const about = async (metricId: number) => {
      const told = await db().from("heads_up_told").insert({ workspace_id: w.id, person_id: sara, key: `sudden-change:${metricId}` }).select("id").single();
      expect(told.error).toBeNull();
      return { id: 0, workspace_id: w.id, kind: "heads_up", recipient_id: sara, heads_up_metric_a: metricId, heads_up_key: `sudden-change:${metricId}`, heads_up_told_id: told.data!.id as number };
    };
    // Sara sees everything: a plain Metric's message goes, the Total's and the formula's do not.
    expect(await archivedMetricHolds(await about(ana.id))).toBeNull();
    for (const id of [total.id, share.id]) expect(await archivedMetricHolds(await about(id))).toBe("Not sent.");
  });
});
