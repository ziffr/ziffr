// The values a Trial Workspace starts with (spec 0021, ticket 2): every period and aggregation, history up to today
// and none after, and to-date figures worked out by hand from the same numbers the core rolls up.
import { describe, expect, it } from "vitest";
import { seriesBy, type Resolver } from "./display-periods";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { STARTING_METRICS, startingTargets, startingValues } from "./trial-starting-values";
import type { Metric } from "./types";

// A Wednesday in the middle of a month, a quarter and a year.
const TODAY = "2026-11-18";
const values = startingValues(TODAY, JANUARY, 1);
const of = (slug: string) => values.filter((v) => v.slug === slug);
const metricOf = (slug: string): Metric => {
  const m = STARTING_METRICS.find((x) => x.slug === slug)!;
  return { id: 1, slug, name: m.name, description: "", unit: m.unit, format: m.format, decimals: m.decimals, period: m.period, submission_rule: m.submissionRule, polarity: m.polarity, aggregation: m.aggregation, target_min: null, target_max: null, sources: [], owner_id: "o", formula: m.formula ?? null, from_catalog_id: null, created_at: "2024-01-01" } as Metric;
};
const resolver: Resolver = (slug) => ({ metric: metricOf(slug), points: of(slug).map((v) => ({ period: v.period, value: v.value })) });

describe("the starting Metrics", () => {
  it("cover every period and every aggregation, with a Breakdown, a Target Series, a gap and a Derived Metric", () => {
    expect(new Set(STARTING_METRICS.map((m) => m.period))).toEqual(new Set(["day", "week", "month", "quarter", "year"]));
    expect(new Set(STARTING_METRICS.map((m) => m.aggregation))).toEqual(new Set(["sum", "average", "last", "none"]));
    expect(STARTING_METRICS.some((m) => m.breakdown)).toBe(true);
    expect(STARTING_METRICS.some((m) => m.gaps?.length)).toBe(true);
    expect(STARTING_METRICS.some((m) => m.formula)).toBe(true);
    expect(startingTargets(TODAY, JANUARY)[0].rows.length).toBeGreaterThan(0);
    // Room for the Owner's own under the trial's cap of 25.
    expect(STARTING_METRICS.length).toBeLessThanOrEqual(15);
  });

  it("have values up to the last period that is over, and an average or last value for the current one too", () => {
    for (const m of STARTING_METRICS.filter((x) => !x.formula)) {
      const current = periodStart(TODAY, m.period, JANUARY);
      const vs = of(m.slug);
      expect(vs.every((v) => v.period <= current)).toBe(true);
      // Past periods are Imports; the latest one before the current period always has a value (no gap there).
      expect(vs.filter((v) => v.period < current).every((v) => v.imported)).toBe(true);
      expect(vs.some((v) => v.period === shiftPeriod(current, m.period, -1))).toBe(true);
      // A sum is not over yet in its current period; an average or a last value is there unless left open.
      expect(vs.some((v) => v.period === current)).toBe(m.aggregation !== "sum" && !m.openNow);
      expect(vs.find((v) => v.period === current)?.imported ?? false).toBe(false);
    }
  });

  it("leave a gap where one is meant", () => {
    const week = periodStart(TODAY, "week", JANUARY);
    expect(of("delivery-time").some((v) => v.period === shiftPeriod(week, "week", -5))).toBe(false);
    expect(of("delivery-time").some((v) => v.period === shiftPeriod(week, "week", -4))).toBe(true);
  });

  it("are the same for the same seed and day", () => {
    expect(startingValues(TODAY, JANUARY, 1)).toEqual(values);
    expect(startingValues(TODAY, JANUARY, 2)).not.toEqual(values);
  });

  it("never end in a sudden drop: the latest summed value is a whole period", () => {
    const revenue = of("revenue");
    expect(revenue[revenue.length - 1].period).toBe("2026-10-01");
    expect(revenue[revenue.length - 1].value / revenue[revenue.length - 2].value).toBeGreaterThan(0.8);
    const signUps = of("sign-ups");
    expect(signUps[signUps.length - 1].period).toBe("2026-11-17");
  });
});

describe("to-date figures, as the core rolls them up", () => {
  it("month to date of a daily sum is the days of this month that are over", () => {
    const days = of("sign-ups").filter((v) => v.period >= "2026-11-01");
    expect(days).toHaveLength(17);
    const byHand = days.reduce((a, v) => a + v.value, 0);
    const r = seriesBy(metricOf("sign-ups"), resolver, "month", { yearStart: JANUARY, today: TODAY });
    const nov = r.points.find((p) => p.period === "2026-11-01")!;
    expect(nov).toMatchObject({ toDate: true, value: byHand, through: "2026-11-17", held: 17, length: 30 });
    // Against the same span of October, as a Comparison to date cuts it.
    const octByHand = of("sign-ups").filter((v) => v.period >= "2026-10-01" && v.period <= "2026-10-17").reduce((a, v) => a + v.value, 0);
    const aligned = seriesBy(metricOf("sign-ups"), resolver, "month", { yearStart: JANUARY, today: TODAY, alignTo: "2026-11-17" });
    expect(aligned.points.find((p) => p.period === "2026-10-01")!.value).toBeCloseTo(octByHand);
    // A daily Metric goes back over a year, so quarter on quarter and year on year compare whole spans.
    const first = of("sign-ups")[0].period;
    expect(first <= "2025-10-01").toBe(true);
  });

  it("quarter and year to date of a monthly sum are the months that are over", () => {
    const revenue = of("revenue");
    const q4 = revenue.filter((v) => v.period >= "2026-10-01").reduce((a, v) => a + v.value, 0);
    const ytd = revenue.filter((v) => v.period >= "2026-01-01").reduce((a, v) => a + v.value, 0);
    expect(seriesBy(metricOf("revenue"), resolver, "quarter", { yearStart: JANUARY, today: TODAY }).points.find((p) => p.period === "2026-10-01")).toMatchObject({ value: q4, toDate: true, held: 1, length: 3 });
    expect(seriesBy(metricOf("revenue"), resolver, "year", { yearStart: JANUARY, today: TODAY }).points.find((p) => p.period === "2026-01-01")).toMatchObject({ value: ytd, toDate: true, held: 10, length: 12 });
  });

  it("an average and a last value roll up as such, and a percentage is not combined", () => {
    const weeks = of("nps").filter((v) => v.period >= "2026-10-01" || periodStart(v.period, "quarter", JANUARY) === "2026-10-01");
    const avg = weeks.reduce((a, v) => a + v.value, 0) / weeks.length;
    expect(seriesBy(metricOf("nps"), resolver, "quarter", { yearStart: JANUARY, today: TODAY }).points.find((p) => p.period === "2026-10-01")!.value).toBeCloseTo(avg);
    const cash = of("cash-balance");
    expect(seriesBy(metricOf("cash-balance"), resolver, "quarter", { yearStart: JANUARY, today: TODAY }).points.find((p) => p.period === "2026-10-01")!.value).toBe(cash[cash.length - 1].value);
    expect(seriesBy(metricOf("margin"), resolver, "quarter", { yearStart: JANUARY, today: TODAY }).ok).toBe(false);
  });

  it("a Derived Metric is computed from its inputs' combined values", () => {
    // As the app gives it: one point per month in which both inputs have a value.
    const ordersBy = new Map(of("orders").map((v) => [v.period, v.value]));
    const own = of("revenue").filter((v) => ordersBy.has(v.period)).map((v) => ({ period: v.period, value: v.value / ordersBy.get(v.period)! }));
    const resolve: Resolver = (slug) => slug === "average-order-value" ? { metric: metricOf(slug), points: own } : resolver(slug);
    const rev = of("revenue").filter((v) => v.period >= "2026-07-01" && v.period <= "2026-09-01").reduce((a, v) => a + v.value, 0);
    const ord = of("orders").filter((v) => v.period >= "2026-07-01" && v.period <= "2026-09-01").reduce((a, v) => a + v.value, 0);
    const r = seriesBy(metricOf("average-order-value"), resolve, "quarter", { yearStart: JANUARY, today: TODAY });
    // Revenue of the quarter divided by its orders: an average of the quarter, not a sum of monthly averages.
    expect(r.points.find((p) => p.period === "2026-07-01")!.value).toBeCloseTo(rev / ord);
    // This month has no orders yet (left open for Ask me now), so the quarter to date has none either.
    expect(r.points.find((p) => p.period === "2026-10-01")?.through ?? "2026-10-01").not.toBe(TODAY);
  });
});
