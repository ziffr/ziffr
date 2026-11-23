// The slope mark's numbers (GLOSSARY: Breakdown, Comparison): which rows meet across two periods, what is new or gone,
// the two highlighted rows, the units that are compared, and labels that are moved apart without leaving the plot.
import { describe, expect, it } from "vitest";
import { nudgeLabels, slopeModel, SLOPE_NEEDS, SLOPE_PLOT, SLOPE_UNITS, type SlopeData } from "./slope-chart";
import type { BreakdownRow, Metric, Point } from "./types";

const base: Metric = { id: 1, slug: "m", name: "Revenue", owner_id: "o", description: "", unit: "€", unit_position: "after", format: "currency", decimals: 0, polarity: "higher", target_min: null, target_max: null, attainment_method: null, formula: null, from_catalog_id: null, created_at: "2026-01-01T00:00:00Z", aggregation: "sum", period: "month", submission_rule: "overwrite", sources: [] };
const metric = (change: Partial<Metric> = {}): Metric => ({ ...base, ...change });
const rows = (...pairs: [string, number][]): BreakdownRow[] => pairs.map(([label, value]) => ({ label, value }));
const data = (breakdowns: SlopeData["breakdowns"] = {}, series: SlopeData["series"] = {}): SlopeData => ({ breakdowns, series, numberStyle: "1,234.5", yearStart: 1 });
const pts = (...values: number[]): Point[] => values.map((value, i) => ({ period: `2026-0${i + 1}-01`, value }));
const ok = (m: ReturnType<typeof slopeModel>) => {
  if (!m.ok) throw new Error(m.reason);
  return m;
};

describe("nudgeLabels", () => {
  it("leaves labels that already have room where they are", () => {
    expect(nudgeLabels([{ at: 20, size: 9 }, { at: 60, size: 9 }, { at: 120, size: 9 }], 0, 200)).toEqual([20, 60, 120]);
  });
  it("moves labels that touch apart, centred on where they wanted to be", () => {
    const out = nudgeLabels([{ at: 100, size: 10 }, { at: 100, size: 10 }], 0, 200);
    expect(out).toEqual([95, 105]);
  });
  it("keeps the order of the values and a gap of half of each size between neighbours", () => {
    const at = [50, 52, 51, 53, 120, 121, 10];
    const size = [9, 9, 18, 9, 9, 9, 9];
    const out = nudgeLabels(at.map((a, i) => ({ at: a, size: size[i] })), 0, 200);
    const sorted = at.map((_, i) => i).sort((a, b) => at[a] - at[b] || a - b);
    for (let k = 1; k < sorted.length; k++) {
      const [p, q] = [sorted[k - 1], sorted[k]];
      expect(out[q] - out[p]).toBeGreaterThanOrEqual((size[p] + size[q]) / 2 - 1e-9);
    }
  });
  it("never leaves the plot, pushing labels back from the edges", () => {
    const out = nudgeLabels([{ at: 199, size: 10 }, { at: 200, size: 10 }, { at: 0, size: 10 }, { at: 1, size: 10 }], 0, 200);
    for (const y of out) {
      expect(y).toBeGreaterThanOrEqual(5 - 1e-9);
      expect(y).toBeLessThanOrEqual(195 + 1e-9);
    }
  });
  it("handles none and one", () => {
    expect(nudgeLabels([], 0, 200)).toEqual([]);
    expect(nudgeLabels([{ at: 3, size: 10 }], 0, 200)).toEqual([5]);
  });
});

describe("slopeModel, rows of a Breakdown", () => {
  const m = metric();
  const d = data({ 1: { "2026-05-01": rows(["North", 100], ["South", 60], ["West", 40]), "2026-06-01": rows(["North", 130], ["South", 45], ["West", 40]) } });

  it("pairs the rows of the latest period with the period before, largest now first", () => {
    const model = ok(slopeModel([m], d, "previous"));
    expect(model.rows.map((r) => [r.name, r.before, r.after])).toEqual([["North", 100, 130], ["South", 60, 45], ["West", 40, 40]]);
    expect([model.beforeLabel, model.afterLabel]).toEqual(["May 26", "Jun 26"]);
  });

  it("writes both ends and the signed change in the Metric's Number Style, and says no change", () => {
    const [n, s, w] = ok(slopeModel([m], d, "previous")).rows;
    expect([n.beforeText, n.afterText, n.change]).toEqual(["100 €", "130 €", "+30 € (+30.0 %)"]);
    const minus = String.fromCharCode(8722);
    expect(s.change).toBe(`${minus}15 € (${minus}25.0 %)`);
    expect([w.kind, w.change]).toEqual(["same", "no change"]);
  });

  it("highlights only the largest rise and the largest fall, in words", () => {
    const model = ok(slopeModel([m], d, "previous"));
    expect(model.rows.map((r) => r.mark)).toEqual(["largest rise", "largest fall", null]);
    expect(model.alt).toContain("North: 100 € to 130 €, +30 € (+30.0 %), largest rise");
    expect(model.alt).toContain("largest fall");
  });

  it("shows a row in only one period as new or gone, never as a 0", () => {
    const e = data({ 1: { "2026-05-01": rows(["North", 100], ["Old", 20]), "2026-06-01": rows(["North", 110], ["Fresh", 30]) } });
    const out = ok(slopeModel([m], e, "previous")).rows;
    const fresh = out.find((r) => r.name === "Fresh")!;
    const old = out.find((r) => r.name === "Old")!;
    expect([fresh.kind, fresh.change, fresh.before, fresh.yBefore, fresh.labelBefore]).toEqual(["new", "new", null, null, null]);
    expect([old.kind, old.change, old.after, old.yAfter, old.labelAfter]).toEqual(["gone", "gone", null, null, null]);
    expect(out.find((r) => r.mark)?.name).toBe("North");
  });

  it("matches rows by their label whatever the case", () => {
    const e = data({ 1: { "2026-05-01": rows(["north", 100]), "2026-06-01": rows(["North", 120]) } });
    const out = ok(slopeModel([m], e, "previous")).rows;
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("North");
  });

  it("compares with the same month a year earlier on request, and says when that Breakdown is missing", () => {
    const e = data({ 1: { "2025-06-01": rows(["North", 90]), "2026-05-01": rows(["North", 100]), "2026-06-01": rows(["North", 130]) } });
    const year = ok(slopeModel([m], e, "year"));
    expect(year.rows[0].before).toBe(90);
    expect(year.beforeLabel).toBe("Jun 25");
    const none = slopeModel([m], d, "year");
    expect(none).toEqual({ ok: false, reason: "Revenue has no Breakdown for Jun 25 to compare Jun 26 with." });
  });

  it("uses one scale for both ends, the highest value at the top", () => {
    // The values run from 40 to 130: the highest is at the top (0), the lowest at the bottom.
    const [n, s, w] = ok(slopeModel([m], d, "previous")).rows;
    expect(n.yAfter).toBe(0);
    expect(n.yBefore).toBeCloseTo(SLOPE_PLOT.height * (30 / 90), 9);
    expect(s.yAfter).toBeCloseTo(SLOPE_PLOT.height * (85 / 90), 9);
    expect([w.yBefore, w.yAfter]).toEqual([SLOPE_PLOT.height, SLOPE_PLOT.height]);
  });

  it("keeps the 12 rows with the most at stake, and says so", () => {
    const names = Array.from({ length: 15 }, (_, i) => `R${i}`);
    const e = data({ 1: { "2026-05-01": names.map((label, i) => ({ label, value: 10 + i })), "2026-06-01": names.map((label, i) => ({ label, value: 11 + i })) } });
    const model = ok(slopeModel([m], e, "previous"));
    expect(model.rows).toHaveLength(12);
    expect(model.rows.map((r) => r.name)).not.toContain("R0");
    expect(model.rule).toContain("The 12 largest of 15 rows are shown.");
  });

  it("keeps labels on each side from touching when values are close", () => {
    const names = Array.from({ length: 12 }, (_, i) => `R${i}`);
    const e = data({ 1: { "2026-05-01": names.map((label) => ({ label, value: 100 })), "2026-06-01": names.map((label, i) => ({ label, value: 100 + i / 100 })) } });
    const out = ok(slopeModel([m], e, "previous")).rows;
    for (const side of ["labelBefore", "labelAfter"] as const) {
      const ys = out.map((r) => r[side]!).sort((a, b) => a - b);
      ys.slice(1).forEach((y, k) => expect(y - ys[k]).toBeGreaterThanOrEqual(SLOPE_PLOT.line - 1e-9));
      expect(ys[0]).toBeGreaterThanOrEqual(0);
      expect(ys.at(-1)!).toBeLessThanOrEqual(SLOPE_PLOT.height);
    }
  });

  it("asks for a Metric with a Breakdown, or several, when there is none", () => {
    expect(slopeModel([m], data(), "auto")).toEqual({ ok: false, reason: SLOPE_NEEDS });
    expect(SLOPE_NEEDS).toBe("Choose a Metric with a Breakdown, or several Metrics in one unit");
    expect(slopeModel([], d)).toEqual({ ok: false, reason: SLOPE_NEEDS });
  });

  it("does not look past the day of a Snapshot", () => {
    const res = slopeModel([m], d, "previous", { asOf: "2026-05-31" });
    expect(res).toEqual({ ok: false, reason: "Revenue has no Breakdown for Apr 26 to compare May 26 with." });
  });
});

describe("slopeModel, several Metrics", () => {
  const a = metric({ id: 1, slug: "a", name: "Alpha" });
  const b = metric({ id: 2, slug: "b", name: "Beta" });
  const c = metric({ id: 3, slug: "c", name: "Gamma" });
  const d = data({}, { a: pts(100, 130), b: pts(80, 50), c: pts(40, 40) });

  it("compares each Metric's latest value with the period before, in one list", () => {
    const model = ok(slopeModel([a, b, c], d));
    expect(model.rows.map((r) => [r.name, r.before, r.after, r.mark])).toEqual([["Alpha", 100, 130, "largest rise"], ["Beta", 80, 50, "largest fall"], ["Gamma", 40, 40, null]]);
    expect([model.beforeLabel, model.afterLabel]).toEqual(["Jan 26", "Feb 26"]);
  });

  it("follows what was placed: several Metrics are compared as Metrics, one as the rows of its Breakdown", () => {
    expect(ok(slopeModel([a, b], d, "auto")).rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
    expect(slopeModel([a], d, "auto")).toEqual({ ok: false, reason: SLOPE_NEEDS });
    expect(slopeModel([a], d, "metrics")).toEqual({ ok: false, reason: SLOPE_NEEDS });
  });

  it("refuses Metrics in different units, in plain text", () => {
    const pct = metric({ id: 4, slug: "p", name: "Rate", unit: "%", format: "percent" });
    expect(slopeModel([a, pct], data({}, { a: pts(1, 2), p: pts(1, 2) }))).toEqual({ ok: false, reason: "Slope charts compare Metrics in one unit" });
    expect(SLOPE_UNITS).toBe("Slope charts compare Metrics in one unit");
  });

  it("shows a Metric with no earlier value as new, and leaves out one with no value at all", () => {
    const e = data({}, { a: pts(100, 130), b: [{ period: "2026-02-01", value: 70 }], c: [] });
    const model = ok(slopeModel([a, b, c], e));
    expect(model.rows.map((r) => [r.name, r.kind])).toEqual([["Alpha", "up"], ["Beta", "new"]]);
    expect(model.rule).toContain("1 Metric has no value yet and is left out.");
  });

  it("holds twelve Metrics and says why it draws no more", () => {
    const many = Array.from({ length: 13 }, (_, i) => metric({ id: i + 1, slug: `s${i}`, name: `M${i}` }));
    const series = Object.fromEntries(many.map((x) => [x.slug, pts(1, 2)]));
    const res = slopeModel(many, data({}, series));
    expect(res.ok ? "" : res.reason).toContain("up to 12 Metrics and this has 13");
    expect(slopeModel(many.slice(0, 12), data({}, series)).ok).toBe(true);
  });

  it("shows a Metric with a value only a year ago as new: the period before is what it is compared with", () => {
    const series = { a: [{ period: "2025-02-01", value: 90 }, { period: "2026-02-01", value: 110 }], b: [{ period: "2025-02-01", value: 20 }, { period: "2026-02-01", value: 25 }] };
    const out = ok(slopeModel([a, b], data({}, series), "metrics")).rows;
    expect(out.map((r) => r.kind)).toEqual(["new", "new"]);
  });
});
