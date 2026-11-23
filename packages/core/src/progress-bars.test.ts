// The progress mark's numbers (GLOSSARY: Target Range, Attainment): where each fill ends and the target sits on a
// scale that includes both, and the words, which are the core's Attainment and target words and nothing else.
import { describe, expect, it } from "vitest";
import { attainment } from "./compare";
import { formatValue } from "./format";
import { progressModel, type ProgressData } from "./progress-bars";
import { sampleData } from "./sample-data";
import type { Metric, Point } from "./types";

const base: Metric = { id: 1, slug: "m", name: "Sales", owner_id: "o", description: "", unit: "", unit_position: "after", format: "number", decimals: 0, polarity: "higher", target_min: null, target_max: null, attainment_method: null, formula: null, from_catalog_id: null, created_at: "2026-01-01T00:00:00Z", aggregation: "sum", period: "month", submission_rule: "overwrite", sources: [] };
const metric = (change: Partial<Metric> = {}): Metric => ({ ...base, ...change });
const pts = (...values: number[]): Point[] => values.map((value, i) => ({ period: `2026-0${i + 1}-01`, value }));
const data = (series: Record<string, Point[]>, targets: ProgressData["targets"] = {}): ProgressData => ({ series, targets, numberStyle: "1,234.5", attainmentMethod: "ratio" });
const rows = (metrics: Metric[], d: ProgressData) => {
  const m = progressModel(metrics, d);
  if (!m.ok) throw new Error(m.reason);
  return m.rows;
};

describe("progressModel", () => {
  it("fills to the latest value on a scale from 0 to a tenth past the highest of the value and the target", () => {
    const [r] = rows([metric({ target_min: 100 })], data({ m: pts(60, 92) }));
    // The scale is 0 to 110: the fill reaches 92, the target's tick 100.
    expect(r.fill).toBeCloseTo(92 / 110, 12);
    expect(r.tick).toBeCloseTo(100 / 110, 12);
    expect(r.band).toBeNull();
    expect(r.value).toBe("92");
  });

  it("says how far along in the core's Attainment, off target in words as well as colour", () => {
    const m = metric({ target_min: 100 });
    const [r] = rows([m], data({ m: pts(92) }));
    expect(r.words).toBe(`${attainment(m, 92, { min: 100, max: null }, "ratio")} % of target, too low`);
    expect(r.status).toBe("below");
  });

  it("on target says only the percentage", () => {
    const [r] = rows([metric({ target_min: 100 })], data({ m: pts(120) }));
    expect(r.words).toBe("120 % of target");
    expect(r.status).toBe("on");
    // The scale reaches past the value, so the fill is not on the edge.
    expect(r.fill).toBeCloseTo(120 / 132, 12);
  });

  it("draws a range as a band and none of a tick", () => {
    const [r] = rows([metric({ polarity: "target", target_min: 80, target_max: 100 })], data({ m: pts(90) }));
    expect(r.band).toEqual({ from: 80 / 110, to: 100 / 110 });
    expect(r.tick).toBeNull();
    expect(r.status).toBe("on");
  });

  it("follows polarity: lower is better is off target above its limit", () => {
    const m = metric({ polarity: "lower", target_max: 2.5, format: "percent", unit: "%", decimals: 1 });
    const [r] = rows([m], data({ m: pts(3.1) }));
    expect(r.status).toBe("above");
    expect(r.words).toContain("too high");
    expect(r.tick).toBeCloseTo(2.5 / 3.41, 12);
    const [ok] = rows([m], data({ m: pts(2.1) }));
    expect(ok.status).toBe("on");
  });

  it("uses the Target Series of the latest period before the Metric's own range", () => {
    const m = metric({ target_min: 50 });
    const [r] = rows([m], data({ m: pts(60, 80) }, { 1: [{ period: "2026-02-01", value: 100 }] }));
    expect(r.tick).toBeCloseTo(100 / 110, 12);
    expect(r.words).toBe("80 % of target, too low");
  });

  it("shows a Metric without a target plain, in words", () => {
    const [r] = rows([metric()], data({ m: pts(40) }));
    expect(r).toMatchObject({ status: null, band: null, tick: null, words: "No target", target: null });
    expect(r.fill).toBeCloseTo(40 / 44, 12);
  });

  it("says a Metric without a value has none, never a 0", () => {
    const [r] = rows([metric({ target_min: 5 })], data({ m: [] }));
    expect(r).toMatchObject({ value: null, fill: null, words: "No value yet" });
  });

  it("gives the distance where there is no percentage", () => {
    const [r] = rows([metric({ target_min: 0 })], data({ m: pts(-3) }));
    expect(r.words).toBe("3 below target, too low");
    // A scale that includes a value below 0 starts at it.
    expect(r.fill).toBe(0);
  });

  it("keeps the order given and the Number Style of each Metric", () => {
    const m2 = metric({ id: 2, slug: "n", name: "Cost", format: "currency", unit: "€", target_max: 10, polarity: "lower" });
    const out = rows([m2, metric()], data({ m: pts(1234.5), n: pts(8) }));
    expect(out.map((r) => r.name)).toEqual(["Cost", "Sales"]);
    expect(out[0].value).toBe(formatValue(m2, 8, "1,234.5"));
  });

  it("refuses none and more than twelve, in words", () => {
    expect(progressModel([], data({}))).toEqual({ ok: false, reason: "Drop at least one metric." });
    const many = Array.from({ length: 13 }, (_, i) => metric({ id: i + 1, slug: `s${i}` }));
    const res = progressModel(many, data({}));
    expect(res.ok ? "" : res.reason).toContain("up to 12 Metrics and this has 13");
  });

  it("writes every Metric in its text alternative", () => {
    const res = progressModel([metric({ target_min: 100 })], data({ m: pts(92) }));
    expect(res.ok && res.alt).toContain("Sales: 92, target ≥ 100, 92 % of target, too low");
  });

  it("works on Sample Data, with and without a target", () => {
    const s = sampleData("month");
    const d: ProgressData = { series: s.series, targets: s.targets, numberStyle: "1,234.5", attainmentMethod: "ratio" };
    const out = rows(s.metrics.slice(0, 3), d);
    expect(out.map((r) => r.status === null)).toEqual([false, true, false]);
  });
});
