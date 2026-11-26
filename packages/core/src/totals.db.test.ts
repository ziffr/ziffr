// Totals against the real database (spec 0058, ticket #1225; GLOSSARY: Total): what each person is given of one, closed
// and open, on a canvas, through the API and in a formula; nothing of it with an unjudged view; a part kept; and what
// the database itself refuses. The rows are written here, so each case holds however a Total came to be.
import { afterEach, describe, expect, it } from "vitest";
import { actorForKey, createAccessKey } from "./access-keys";
import { getCanvasData } from "./access";
import { getMetric, listObservations } from "./api";
import { db } from "./db";
import { deleteMetric } from "./metrics";
import { share } from "./sharing";
import { workspace } from "./test/db-fixtures";
import { shownData } from "./view-links";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Sara's Total over her two Commit Metrics, a formula over it, and Ben who sees the Total, the formula and Ana's part. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member");
  const ana = await w.metric(sara, { name: "Commit Ana", aggregation: "last" });
  const eva = await w.metric(sara, { name: "Commit Eva", aggregation: "last" });
  const total = await w.metric(sara, { name: "Commit", aggregation: "last", sources: [], formula: "{-}", total_targets: "own" });
  const rows = [ana, eva].map((m) => ({ total_id: total.id, part_id: m.id, workspace_id: w.id, first_period: "2026-01-01" }));
  expect((await db().from("total_parts").insert(rows)).error).toBeNull();
  const rest = await w.metric(sara, { name: "Without Ana", formula: `{${total.slug}} - {${ana.slug}}`, sources: [], inputs_checked: true });
  for (const [m, v] of [[ana, 10], [eva, 7]] as const) { await w.value(m.id, "2026-01-01", v); await w.value(m.id, "2026-02-01", v + 1); }
  // Eva's February waits for Approval.
  expect((await db().from("period_states").insert({ workspace_id: w.id, metric_id: eva.id, period_start: "2026-02-01", state: "approval" })).error).toBeNull();
  for (const m of [total, rest, ana]) await share(w.actor(sara), "metric", m.id, ben, "viewer");
  const open = async () => { expect((await db().from("metrics").update({ total_opened_at: new Date().toISOString(), total_opened_by: sara }).eq("id", total.id)).error).toBeNull(); };
  return { w, sara, ben, ana, eva, total, rest, open };
}

describe("a Total as each person is given it", () => {
  it("shows its sums to someone who sees every part, and to no one else until it is open", async () => {
    const { w, sara, ben, eva, total, rest, open } = await setup();
    const owners = await getCanvasData(w.id, sara);
    expect(owners.series[total.slug]).toEqual([{ period: "2026-01-01", value: 17 }, { period: "2026-02-01", value: 19 }]);
    expect(owners.series[rest.slug]).toEqual([{ period: "2026-01-01", value: 7 }, { period: "2026-02-01", value: 8 }]);
    expect(owners.pending[total.id]).toEqual(["2026-02-01"]);

    const closed = await getCanvasData(w.id, ben);
    expect(closed.series[total.slug]).toEqual([]);
    expect(closed.series[rest.slug]).toEqual([]);
    expect(closed.pending[total.id]).toBeUndefined();
    // Nothing names the part he does not see, and who opened it is no one's to read.
    expect(JSON.stringify(closed)).not.toContain(eva.slug);
    expect(JSON.stringify(owners)).not.toMatch(/total_opened|total_targets/);

    await open();
    const opened = await getCanvasData(w.id, ben);
    expect(opened.series[total.slug]).toEqual(owners.series[total.slug]);
    expect(opened.series[rest.slug]).toEqual(owners.series[rest.slug]);
    expect(JSON.stringify(opened)).not.toContain(eva.slug);
    expect(opened.metrics.find((m) => m.id === total.id)!.total).toMatchObject({ targets: "own", open: true });
  });

  it("gives a program only what its key's creator is given, and no formula", async () => {
    const { w, sara, ben, total, rest, open } = await setup();
    const keyOf = async (person: string) => (await actorForKey((await createAccessKey(w.actor(person), { name: "Script", scopes: ["metrics:read"], expiresOn: inDays(30) })).secret))!;
    const [owner, other] = [await keyOf(sara), await keyOf(ben)];
    expect((await listObservations(owner, total.slug, { limit: 10 })).items.map((i) => [i.value, i.state])).toEqual([[17, "recorded"], [19, "awaiting_approval"]]);
    expect((await listObservations(other, total.slug, { limit: 10 })).items).toEqual([]);
    expect((await listObservations(other, rest.slug, { limit: 10 })).items).toEqual([]);
    expect((await getMetric(owner, total.slug)).formula).toBeNull();
    await open();
    expect((await listObservations(other, total.slug, { limit: 10 })).items.map((i) => i.value)).toEqual([17, 19]);
  });

  it("goes out with no view that does not say who may have it", async () => {
    const { w, sara, total, rest, open } = await setup();
    await open();
    const sent = shownData(await getCanvasData(w.id, sara), new Set([total.id, rest.id]), null);
    expect([sent.series[total.slug], sent.series[rest.slug]]).toEqual([[], []]);
  });
});

describe("a Total's parts", () => {
  it("keep their Metric from being deleted", async () => {
    const { w, sara, ana, total, rest } = await setup();
    await deleteMetric(w.actor(sara), rest.id, "Without Ana");
    await expect(deleteMetric(w.actor(sara), ana.id, "Commit Ana")).rejects.toThrow(/computed from it|add it up/);
    // The Total itself goes, and with it its list.
    await deleteMetric(w.actor(sara), total.id, "Commit");
    expect((await db().from("total_parts").select("part_id").eq("workspace_id", w.id)).data).toEqual([]);
  });

  it("are Metrics that take values, of a Total only", async () => {
    const { w, ana, eva, total, rest } = await setup();
    const part = (total_id: number, part_id: number) => db().from("total_parts").insert({ total_id, part_id, workspace_id: w.id, first_period: "2026-01-01" });
    expect((await part(total.id, rest.id)).error?.code).toBe("ZF471");
    expect((await part(ana.id, eva.id)).error?.code).toBe("ZF470");
    expect((await db().from("metrics").update({ total_opened_at: new Date().toISOString() }).eq("id", ana.id)).error).not.toBeNull();
  });
});
