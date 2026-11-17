import { describe, expect, it } from "vitest";
import { forecast } from "./forecast";

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
});
