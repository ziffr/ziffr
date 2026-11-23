// The worked examples of docs/guides/methods.md, run on the real functions (GLOSSARY: Method; spec 0041, ticket 17): the guide quotes
// numbers a person can redo by hand, and this test fails when a quoted number is no longer what the code gives, so the guide cannot drift.
import { describe, expect, it } from "vitest";
import { correlate } from "./correlation";
import { resolverFrom } from "./compare";
import { afterDate } from "./methods/before-after";
import { bridge } from "./methods/bridge";
import { changePoint } from "./methods/change-point";
import { pareto, topShare } from "./methods/concentration";
import { holtWinters } from "./methods/holt-winters";
import { laggedCorrelation } from "./methods/lagged-correlation";
import { partialCorrelation } from "./methods/partial-correlation";
import { pValueOfR } from "./methods/p-value";
import { quantile, usualRange } from "./methods/quantiles";
import { reachChance } from "./methods/reach-chance";
import { spearman } from "./methods/spearman";
import { backtest } from "./methods/track-record";
import { metric, months } from "./test/fixtures";
import type { Point } from "./types";

const pts = (vs: number[], start = "2025-01"): Point[] => months(start, vs);
const close = (a: number, b: number, digits = 2) => expect(a).toBeCloseTo(b, digits);

const TRACK = [100, 104, 103, 109, 112, 111, 118, 121, 120, 127, 131, 130, 136, 140, 139, 146, 149, 150, 156, 160];

describe("the worked examples of docs/guides/methods.md", () => {
  it("Correlation: Revenue and Visits, compared by change, r 0.78 over 7 pairs", () => {
    const rev = metric({ id: 1, slug: "revenue", name: "Revenue" });
    const vis = metric({ id: 2, slug: "visits", name: "Visits" });
    const series = { revenue: pts([100, 104, 103, 110, 108, 115, 119, 121]), visits: pts([50, 53, 50, 56, 57, 60, 63, 62]) };
    const c = correlate(rev, vis, resolverFrom([rev, vis], series), { yearStart: 1, today: "2026-01-15" });
    if (!c.ok) throw new Error(c.reason);
    expect([c.n, c.basis]).toEqual([7, "changes"]);
    close(c.r, Math.sqrt(4375 / 7106));
  });
  it("Rank correlation: 0.83 over 6 pairs", () => {
    const r = spearman(pts([1, 2, 3, 4, 5, 6]), pts([2, 1, 4, 3, 6, 5]));
    close(r!.rho, 29 / 35);
  });
  it("Partial correlation: a and b with z held the same, r = -0.95", () => {
    const r = partialCorrelation(pts([2, 1, 4, 3, 6, 5, 8, 7]), pts([1, 3, 2, 5, 4, 7, 6, 8]), [pts([1, 2, 3, 4, 5, 6, 7, 8])]);
    if (!r.ok) throw new Error("refused");
    close(r.r, -Math.sqrt(121 / 135));
  });
  it("Lagged correlation: 0.67 at delay 0 and exactly 1 at delay 1", () => {
    const r = laggedCorrelation(pts([1, 3, 2, 5, 4, 8, 6, 9]), pts([0, 1, 3, 2, 5, 4, 8, 6]), "month");
    const at = (lag: number) => r.lags.find((l) => l.lag === lag)!.r;
    close(at(0), Math.sqrt(282 ** 2 / (444 * 399)));
    close(at(1), 1);
  });
  it("Quantiles: eleven months of 1 to 11", () => {
    const p = pts([7, 2, 10, 4, 11, 1, 9, 3, 8, 5, 6]);
    const u = usualRange(p, "month")!;
    expect([u.low, u.q1, u.median, u.q3, u.high]).toEqual([2, 3.5, 6, 8.5, 10]);
    expect(quantile(p, 0.5)).toBe(6);
  });
  it("Share of the largest rows and Pareto: 77 % and four rows at 85 %", () => {
    const rows = [40, 25, 12, 8, 6, 5, 3, 1].map((value, i) => ({ label: `C${i}`, value }));
    const t = topShare(rows, 3);
    const p = pareto(rows);
    expect(JSON.stringify([t, p])).toContain("0.77");
    expect(JSON.stringify(p)).toContain("0.85");
  });
  it("Bridge: -35, -9, +2 make -42", () => {
    const b = bridge([{ label: "Germany", before: 120, after: 85 }, { label: "Austria", before: 40, after: 31 }, { label: "France", before: 22, after: 24 }]);
    if (!b.ok) throw new Error("refused");
    expect(b.parts.map((x) => x.change).sort((x, y) => x - y)).toEqual([-35, -9, 2]);
    expect(b.total).toBe(-42);
  });
  it("Seasonal forecast: 10, 20, 12, 24, 14, 28 with a season of 2 gives 18.53113125 one ahead", () => {
    const r = holtWinters(pts([10, 20, 12, 24, 14, 28]), "month", 2, 2);
    if (!r.ok) throw new Error("refused");
    close(r.points[0].value, 18.53113125, 8);
    close(r.points[0].sd, Math.sqrt(12.638415015625 / 4), 4);
    close(r.points[1].sd, Math.sqrt(4.1153838894628906), 4);
  });
  it("Before and after: 1, 3, 2, 5 then 8, 9 gives a gap of 2.45, between -1.05 and 5.95", () => {
    const r = afterDate(pts([1, 3, 2, 5, 8, 9]), "month", "2025-05-01");
    if (!("gap" in r)) throw new Error(JSON.stringify(r));
    close(r.gap, 2.45);
    close(r.lo, -1.05, 1);
    close(r.hi, 5.95, 1);
  });
  it("Change point: 2, 2, 2, 2, 10, 11, 12, 13 changes at the fifth period", () => {
    const r = changePoint(pts([2, 2, 2, 2, 10, 11, 12, 13]), "month");
    expect(JSON.stringify(r)).toContain("2025-05-01");
  });
  it("The chance of a correlation by luck: 0.1 for r 0.9 over 4 pairs, 2/3 for 0.5 over 3", () => {
    close(pValueOfR(0.9, 4), 0.1);
    close(pValueOfR(0.5, 3), 2 / 3);
  });
  it("Reach chance: a forecast of 100 with a spread of 10 against at least 110 is 0.16 (about 2 in 10)", () => {
    close(reachChance({ value: 100, sd: 10 }, { min: 110, max: null })!, 0.1587, 3);
  });
  it("Track record: twenty months of a climb with small ups and downs: the last 12 are tested and 10 held", () => {
    const r = backtest(pts(TRACK), "month", 12, "holt", 12);
    expect([r!.tested, r!.inBand]).toEqual([12, 10]);
    close(r!.typicalMiss, 2.28);
  });
});
