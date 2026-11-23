// @ts-nocheck
// Quarterly and yearly Metrics against the real database (spec 0017; GLOSSARY: Period, Fiscal Year): created and
// edited like any other, their Target Series kept per quarter or year, and their values holding the year start.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { setYearStart, yearStartChoices } from "./fiscal-year";
import { createMetric, metricEffects, saveSeriesRows, updateMetricDetails, type MetricEffects } from "./metrics";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const fx = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });
const periodOf = async (id: number) => (await db().from("metrics").select("period").eq("id", id).single()).data?.period;

describe("quarterly and yearly Metrics", () => {
  it("are created and edited with a quarter or a year as their period", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const nps = await createMetric(owner, { name: "NPS", period: "quarter" }, fx());
    const audit = await createMetric(owner, { name: "Audit score", period: "year" }, fx());
    expect(await periodOf(nps.id)).toBe("quarter");
    expect(await periodOf(audit.id)).toBe("year");
    // Without values, a monthly Metric may still become a quarterly one, and back.
    const hc = await createMetric(owner, { name: "Headcount", period: "month" }, fx());
    await updateMetricDetails(owner, hc.id, { period: "quarter" });
    expect(await periodOf(hc.id)).toBe("quarter");
    // Anything else stays what it was.
    await updateMetricDetails(owner, hc.id, { period: "fortnight" });
    expect(await periodOf(hc.id)).toBe("quarter");
  });
  it("keep the period once there are values or targets by period", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const a = await createMetric(owner, { name: "Revenue", period: "month" }, fx());
    await w.value(a.id, "2026-07-01", 10);
    await expect(updateMetricDetails(owner, a.id, { period: "quarter" })).rejects.toThrow(/values/);
    const b = await createMetric(owner, { name: "Budget", period: "month" }, fx());
    await saveSeriesRows(owner, b.id, "target", [{ period: "2026-08-01", value: 100 }], "");
    await expect(updateMetricDetails(owner, b.id, { period: "quarter" })).rejects.toThrow(/targets/);
    expect(await periodOf(b.id)).toBe("month");
  });
  it("keep their Target Series per quarter or year of the workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    await setYearStart(owner, 4);
    const q = await createMetric(owner, { name: "NPS", period: "quarter" }, fx());
    const y = await createMetric(owner, { name: "Revenue target", period: "year" }, fx());
    // A day inside the quarter counts as the quarter: August is in the quarter from July.
    await saveSeriesRows(owner, q.id, "target", [{ period: "2026-08-15", value: 40 }], "");
    await saveSeriesRows(owner, y.id, "target", [{ period: "2027-02-01", value: 1200000 }], "");
    const { data } = await db().from("series_values").select("metric_id, period_start").in("metric_id", [q.id, y.id]).order("metric_id");
    expect(data?.map((r) => r.period_start)).toEqual(["2026-07-01", "2026-04-01"]);
  });
  it("hold the year start to months that still start their quarters and years", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const q = await createMetric(owner, { name: "NPS", period: "quarter" }, fx());
    // Without values a quarterly Metric holds nothing.
    expect((await yearStartChoices(owner)).allowed).toHaveLength(12);
    await w.value(q.id, "2026-04-01", 41);
    const choices = await yearStartChoices(owner);
    expect(choices.allowed).toEqual([1, 4, 7, 10]);
    expect(choices.why).toMatch(/quarterly or yearly Metrics' values/);
    await expect(setYearStart(owner, 2)).rejects.toThrow(/Some months are out/);
    const y = await createMetric(owner, { name: "Audit score", period: "year" }, fx());
    await w.value(y.id, "2026-01-01", 92);
    expect((await yearStartChoices(owner)).allowed).toEqual([1]);
  });
});
