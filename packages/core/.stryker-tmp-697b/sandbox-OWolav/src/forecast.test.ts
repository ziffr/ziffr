// @ts-nocheck
import { describe, expect, it } from "vitest";
import { forecast, holtFit } from "./forecast";

const monthly = (values: number[]) => values.map((value, i) => ({ period: `2025-${String(i + 1).padStart(2, "0")}-01`, value }));

describe("forecast", () => {
  it("needs at least four values", () => {
    expect(forecast(monthly([1, 2, 3]), "month")).toBeNull();
    expect(forecast(monthly([1, 2, 3, 4]), "month")).not.toBeNull();
  });

  it("keeps a flat series flat, with no band", () => {
    const fc = forecast(monthly([5, 5, 5, 5, 5, 5]), "month")!;
    expect(fc.trendPerPeriod).toBe(0);
    expect(fc.points.map((p) => [p.value, p.lo, p.hi])).toEqual([[5, 5, 5], [5, 5, 5], [5, 5, 5]]);
  });

  it("continues a straight line as a line", () => {
    const fc = forecast(monthly([10, 20, 30, 40, 50, 60]), "month")!;
    expect(fc.trendPerPeriod).toBeCloseTo(10);
    expect(fc.points.map((p) => p.value)).toEqual([70, 80, 90].map((v) => expect.closeTo(v)));
  });

  it("widens the band with each step ahead", () => {
    const fc = forecast(monthly([10, 14, 9, 17, 12, 20, 15]), "month")!;
    const widths = fc.points.map((p) => p.hi - p.lo);
    expect(widths[0]).toBeGreaterThan(0);
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1]);
  });

  it("looks ahead by the period: 3 months, 6 weeks, 14 days", () => {
    expect(forecast(monthly([1, 2, 3, 4]), "month")!.points.map((p) => p.period)).toEqual(["2025-05-01", "2025-06-01", "2025-07-01"]);
    const weeks = [0, 1, 2, 3].map((i) => ({ period: `2025-01-${String(6 + 7 * i).padStart(2, "0")}`, value: i }));
    const w = forecast(weeks, "week")!.points;
    expect(w).toHaveLength(6);
    expect(w[0].period).toBe("2025-02-03");
    const days = [1, 2, 3, 4].map((d) => ({ period: `2025-01-0${d}`, value: d }));
    const d = forecast(days, "day")!.points;
    expect(d).toHaveLength(14);
    expect([d[0].period, d[13].period]).toEqual(["2025-01-05", "2025-01-18"]);
  });

  it("looks two quarters ahead for a quarterly Metric and one year for a yearly one, after four values", () => {
    const pts = (starts: string[]) => starts.map((period, i) => ({ period, value: 100 + 10 * i }));
    const q = forecast(pts(["2025-10-01", "2026-01-01", "2026-04-01", "2026-07-01"]), "quarter");
    expect(q?.points.map((p) => p.period)).toEqual(["2026-10-01", "2027-01-01"]);
    const y = forecast(pts(["2022-04-01", "2023-04-01", "2024-04-01", "2025-04-01"]), "year");
    expect(y?.points.map((p) => p.period)).toEqual(["2026-04-01"]);
    expect(y?.points[0].value).toBeCloseTo(140, 0);
    // A yearly Metric has a forecast after four years.
    expect(forecast(pts(["2023-01-01", "2024-01-01", "2025-01-01"]), "year")).toBeNull();
  });
});

describe("holtFit", () => {
  it("gives one prediction for each value from the second on, the first before any miss, with the exact misses so far", () => {
    const ys = [10, 12, 15, 15].map((v) => ({ num: BigInt(v), den: 1n }));
    const fit = holtFit(ys);
    expect(fit.steps.map((s) => [s.index, s.errors])).toEqual([[1, 0], [2, 1], [3, 2]]);
    // Level 10 and trend 2: 12 is predicted, comes as 12 (no miss), then level 12, trend 2: 14 is predicted for 15 (a miss of 1).
    // The third value, 15, is a miss of 1 against 14: level ½·15 + ½·14 = 14.5, trend 0.3·2.5 + 0.7·2 = 2.15, so 16.65 is predicted next.
    expect(fit.steps.map((s) => Number(s.predicted.num) / Number(s.predicted.den))).toEqual([12, 14, 16.65]);
    expect(fit.steps[0].squares.num).toBe(0n);
    expect(fit.steps[2].squares).toEqual({ num: 1n, den: 1n });
  });
});
