// A workspace's values, series and Breakdowns against the real database (GLOSSARY: Observation, Breakdown): the
// latest value of a period wins, nothing is dropped past a row limit, and nothing of another workspace is read.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { workspace } from "./test/db-fixtures";
import { buildSeries, getAllSeries, getBreakdowns, getLastValues, getLatestObservations, getMetrics, getObservations, getRecentObservations, getSeriesOf, PAGE_ROWS, withInputs } from "./workspace-data";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }

/** Day number `i` after 2020-01-01, as a period start. */
const day = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
/** Values written in one go, one per day from 2020-01-01; `at` sets when each was recorded. */
async function values(wsId: string, metricId: number, n: number, value = (i: number) => i) {
  for (let i = 0; i < n; i += 500) {
    const rows = Array.from({ length: Math.min(500, n - i) }, (_, k) => ({ metric_id: metricId, period_start: day(i + k), value: value(i + k), source: "api", workspace_id: wsId }));
    const { error } = await db().from("observations").insert(rows);
    if (error) throw new Error(error.message);
  }
}
async function valueAt(wsId: string, metricId: number, period: string, v: number, at: string) {
  const { data, error } = await db().from("observations").insert({ metric_id: metricId, period_start: period, value: v, source: "api", workspace_id: wsId, created_at: at }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

describe("the latest value of each period", () => {
  it("is the one recorded last, as buildSeries keeps it from every value", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { submission_rule: "keep_both" });
    await valueAt(w.id, m.id, "2026-01-01", 1, "2026-01-02T10:00:00Z");
    await valueAt(w.id, m.id, "2026-01-01", 2, "2026-01-03T10:00:00Z");
    await valueAt(w.id, m.id, "2026-02-01", 5, "2026-02-02T10:00:00Z");
    await valueAt(w.id, m.id, "2026-01-01", 3, "2026-01-01T10:00:00Z"); // written later, recorded earlier
    const metrics = await getMetrics(w.id);
    const latest = await getLatestObservations(w.id);
    expect(latest.map((o) => [o.period_start, o.value])).toEqual([["2026-01-01", 2], ["2026-02-01", 5]]);
    expect(buildSeries(metrics, latest)).toEqual(buildSeries(metrics, await getObservations(w.id)));
    // The last three of every value, oldest first: January's earliest-recorded one is left out.
    expect((await getLastValues(w.id, m.id, 3)).map((o) => o.value)).toEqual([1, 2, 5]);
  });

  it("computes no Derived Metric from inputs of different periods, rather than a wrong one (spec 0022)", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const deals = await w.metric(sara, { period: "day" }); const revenue = await w.metric(sara, { period: "month" });
    const per = await w.metric(sara, { period: "month", formula: `{${revenue.slug}} / {${deals.slug}}`, sources: [] });
    const same = await w.metric(sara, { period: "month", formula: `{${revenue.slug}} * 2`, sources: [] });
    // 1 January is a day and starts a month: the two meet by chance.
    await valueAt(w.id, deals.id, "2026-01-01", 4, "2026-01-02T10:00:00Z");
    await valueAt(w.id, revenue.id, "2026-01-01", 100, "2026-02-02T10:00:00Z");
    const series = buildSeries(await getMetrics(w.id), await getLatestObservations(w.id));
    expect(series[per.slug]).toEqual([]);
    expect(series[same.slug]).toEqual([{ period: "2026-01-01", value: 200 }]);
  });

  it("keeps every value and the newest ones past the database's row limit", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { period: "day" });
    const n = PAGE_ROWS + 150;
    await values(w.id, m.id, n);
    expect((await getObservations(w.id, [m.id])).length).toBe(n);
    const { series } = await getAllSeries(w.id);
    expect(series[m.slug].length).toBe(n);
    expect(series[m.slug].at(-1)).toEqual({ period: day(n - 1), value: n - 1 });
  });

  it("can be read for some periods, or for the last few of each Metric", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const a = await w.metric(sara, { period: "day" }); const b = await w.metric(sara, { period: "day" });
    await values(w.id, a.id, 40); await values(w.id, b.id, 5, (i) => 100 + i);
    const window = await getLatestObservations(w.id, { metricIds: [a.id], from: day(10), to: day(12) });
    expect(window.map((o) => o.period_start)).toEqual([day(10), day(11), day(12)]);
    const recent = await getRecentObservations(w.id, 3);
    expect(recent.filter((o) => o.metric_id === a.id).map((o) => o.period_start)).toEqual([day(37), day(38), day(39)]);
    expect(recent.filter((o) => o.metric_id === b.id).map((o) => o.value)).toEqual([102, 103, 104]);
  });

  it("never comes from another workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara);
    const other = await ws("Other"); const zoe = await other.person("owner"); const theirs = await other.metric(zoe);
    await w.value(m.id, "2026-01-01", 1); await other.value(theirs.id, "2026-01-01", 99);
    expect((await getLatestObservations(w.id, { metricIds: [m.id, theirs.id] })).map((o) => o.value)).toEqual([1]);
    expect(await getRecentObservations(w.id, 5, [theirs.id])).toEqual([]);
  });
});

describe("series of a list and of some Metrics", () => {
  it("end as the full series do, Derived Metrics included", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const a = await w.metric(sara, { period: "day" }); const b = await w.metric(sara, { period: "day" }); const c = await w.metric(sara, { period: "day" });
    // b stops earlier than a, so the derived a+b ends where b does: its last points need a's older values.
    await values(w.id, a.id, 60); await values(w.id, b.id, 20, (i) => 10 * i); await values(w.id, c.id, 50);
    const d = await w.metric(sara, { period: "day", formula: `{${a.slug}} + {${b.slug}}` });
    const full = (await getAllSeries(w.id)).series;
    const short = (await getAllSeries(w.id, { points: 5 })).series;
    for (const slug of [a.slug, b.slug, c.slug, d.slug]) expect(short[slug]).toEqual(full[slug].slice(-5));
    const metrics = await getMetrics(w.id);
    expect(withInputs(metrics, [d.id]).sort()).toEqual([a.id, b.id, d.id].sort());
    const some = await getSeriesOf(w.id, metrics, [d.id]);
    expect(some[d.slug]).toEqual(full[d.slug]);
    expect(some[c.slug]).toEqual([]);
  });
});

describe("getBreakdowns", () => {
  it("takes the latest value of a period that has rows, by Metric, however many values there are", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { submission_rule: "keep_both", period: "day" });
    await values(w.id, m.id, PAGE_ROWS + 10); // far more values than ids fit into one request
    const first = await valueAt(w.id, m.id, "2026-01-01", 10, "2026-01-02T10:00:00Z");
    const second = await valueAt(w.id, m.id, "2026-01-01", 12, "2026-01-03T10:00:00Z");
    await valueAt(w.id, m.id, "2026-01-01", 13, "2026-01-04T10:00:00Z"); // the latest, without rows
    const older = await valueAt(w.id, m.id, day(3), 3, "2020-01-05T10:00:00Z");
    await db().from("breakdown_rows").insert([
      { observation_id: first, label: "Old", value: 10, position: 0, workspace_id: w.id },
      { observation_id: second, label: "Online", value: 5, position: 1, workspace_id: w.id },
      { observation_id: second, label: "Shop", value: 7, position: 0, workspace_id: w.id },
      { observation_id: older, label: "All", value: 3, position: 0, workspace_id: w.id },
    ]);
    const all = await getBreakdowns(w.id, [m.id]);
    expect(all[m.id]["2026-01-01"]).toEqual([{ label: "Shop", value: 7 }, { label: "Online", value: 5 }]);
    expect(all[m.id][day(3)]).toEqual([{ label: "All", value: 3 }]);
    expect(Object.keys((await getBreakdowns(w.id, [m.id], { from: "2025-12-01" }))[m.id])).toEqual(["2026-01-01"]);
    const other = await ws("Other");
    expect(await getBreakdowns(other.id, [m.id])).toEqual({});
  });
});
