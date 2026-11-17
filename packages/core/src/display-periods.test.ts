import { describe, expect, it } from "vitest";
import { compare, resolverFrom } from "./compare";
import { dayAfter, displayPeriodsFor, INPUTS_MISSING, NOT_COMBINED, periodCount, seriesBy, shownSeries } from "./display-periods";
import { JANUARY } from "./periods";
import { canvas, metric, months } from "./test/fixtures";
import type { Point } from "./types";

const ys = JANUARY;
// Jan 2025 to Feb 2026: 14 months, 100 to 230.
const values = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230];
const by = (aggregation: "sum" | "average" | "last" | "none", display: "quarter" | "half" | "year", today = "2026-02-15") => {
  const m = metric({ aggregation });
  return seriesBy(m, resolverFrom([m], { revenue: months("2025-01", values) }), display, { yearStart: ys, today });
};

describe("seriesBy", () => {
  it("adds up, averages or takes the last value by quarter", () => {
    expect(by("sum", "quarter").points.map((p) => [p.period, p.value])).toEqual([
      ["2025-01-01", 330], ["2025-04-01", 420], ["2025-07-01", 510], ["2025-10-01", 600], ["2026-01-01", 450],
    ]);
    expect(by("average", "quarter").points[0].value).toBe(110);
    expect(by("last", "quarter").points[0].value).toBe(120);
  });

  it("combines by year, and by the workspace's year", () => {
    expect(by("sum", "year").points.map((p) => p.value)).toEqual([1860, 450]);
    const m = metric();
    const april = seriesBy(m, resolverFrom([m], { revenue: months("2025-01", values) }), "year", { yearStart: 4, today: "2026-02-15" });
    // FY 2024/25 holds Jan to Mar 2025 (3 of 12 months: skipped); FY 2025/26 runs Apr 2025 to Mar 2026, to date.
    expect(april.points.map((p) => [p.period, p.value, p.toDate])).toEqual([["2025-04-01", values.slice(3).reduce((a, b) => a + b, 0), true]]);
  });

  it("marks the span today is in as to date, with how many of its periods it holds", () => {
    const last = by("sum", "quarter").points.at(-1)!;
    expect(last).toMatchObject({ period: "2026-01-01", value: 450, held: 2, length: 3, toDate: true });
    expect(by("sum", "quarter").points[3]).toMatchObject({ held: 3, length: 3, toDate: false });
    // Once the quarter is over, its two months of three still count (at least half), no longer to date.
    expect(by("sum", "quarter", "2026-05-01").points.at(-1)).toMatchObject({ value: 450, toDate: false });
  });

  it("skips a span less than half of which has values", () => {
    const m = metric();
    // Only October 2025 in Q4: 1 of 3 months.
    const r = resolverFrom([m], { revenue: [...months("2025-07", [1, 2, 3]), ...months("2025-10", [4])] });
    expect(seriesBy(m, r, "quarter", { yearStart: ys, today: "2026-06-01" }).points.map((p) => p.period)).toEqual(["2025-07-01"]);
    // Still running, the quarter counts up to its latest value.
    expect(seriesBy(m, r, "quarter", { yearStart: ys, today: "2025-11-10" }).points.at(-1)).toMatchObject({ value: 4, held: 1, toDate: true });
  });

  it("computes a Derived Metric from its inputs' quarters", () => {
    const revenue = metric();
    const cost = metric({ id: 2, slug: "cost", name: "Cost", polarity: "lower" });
    const margin = metric({ id: 3, slug: "margin", name: "Margin", formula: "({revenue} - {cost}) / {revenue} * 100", aggregation: "none" });
    const r = resolverFrom([revenue, cost, margin], { revenue: months("2025-01", [100, 100, 200]), cost: months("2025-01", [50, 50, 50]), margin: months("2025-01", [50, 50, 75]) });
    // (400 - 150) / 400, not the sum or average of the monthly margins.
    expect(seriesBy(margin, r, "quarter", { yearStart: ys, today: "2025-06-01" }).points[0].value).toBeCloseTo(62.5);
  });

  it("refuses Aggregation none and a shorter period", () => {
    expect(by("none", "quarter")).toEqual({ ok: false, reason: NOT_COMBINED, points: [] });
    const m = metric();
    expect(seriesBy(m, resolverFrom([m], { revenue: months("2025-01", values) }), "week", { yearStart: ys }).ok).toBe(false);
  });

  it("returns the Metric's own period unchanged", () => {
    const m = metric();
    const r = seriesBy(m, resolverFrom([m], { revenue: months("2025-01", [1, 2]) }), "month", { yearStart: ys });
    expect(r.points).toEqual([{ period: "2025-01-01", value: 1, held: 1, length: 1, toDate: false, through: "2025-01-01" }, { period: "2025-02-01", value: 2, held: 1, length: 1, toDate: false, through: "2025-02-01" }]);
  });

  it("puts weeks into the month they start in", () => {
    const w = metric({ slug: "orders", period: "week" });
    // Mondays 16 Feb to 30 Mar 2026: the week of 30 March runs into April and still belongs to March.
    const weeks: Point[] = ["2026-02-16", "2026-02-23", "2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"].map((period) => ({ period, value: 10 }));
    const r = seriesBy(w, resolverFrom([w], { orders: weeks }), "month", { yearStart: ys, today: "2026-06-01" });
    expect(r.points.map((p) => [p.period, p.value, p.held, p.length])).toEqual([["2026-02-01", 20, 2, 4], ["2026-03-01", 50, 5, 5]]);
    // A month starting on a Monday counts that week: June 2026 holds five.
    expect(periodCount("week", "2026-06-01", "2026-06-30", ys)).toBe(5);
    // One week of February's four is less than half.
    expect(seriesBy(w, resolverFrom([w], { orders: weeks.slice(1) }), "month", { yearStart: ys, today: "2026-06-01" }).points.map((p) => p.period)).toEqual(["2026-03-01"]);
  });

  it("gives a quarter the same value as the QoQ Comparison", () => {
    const m = metric();
    const r = resolverFrom([m], { revenue: months("2025-01", values) });
    const [toDate] = compare(m, r, { yearStart: ys, keys: ["qoq"] });
    const [full] = compare(m, r, { yearStart: ys, keys: ["qoq"], full: true });
    const q = seriesBy(m, r, "quarter", { yearStart: ys, today: "2026-02-15" }).points;
    expect(toDate.current).toBe(q.at(-1)!.value);
    expect(full.current).toBe(q.at(-2)!.value);
    expect(full.previous).toBe(q.at(-3)!.value);
  });

  it("combines the Target Series where every month has one, else the range for an average, none for a sum", () => {
    const sum = metric({ target_min: 100 });
    const data = (m: typeof sum, targets: Point[]) => canvas([m], { revenue: months("2025-01", values.slice(0, 6)) }, { targets: { 1: targets } });
    // Q1 has three monthly targets; Q2 only two.
    const t = [...months("2025-01", [100, 100, 120]), ...months("2025-04", [100, 100])];
    const s = shownSeries(sum, data(sum, t), "quarter", { today: "2026-01-01" });
    expect(s.targets?.at).toEqual({ "2025-01-01": { min: 320, max: null } });
    expect(s.targets?.line).toEqual([{ period: "2025-01-01", value: 320 }]);
    expect(s.targets?.note).toBe("Target per quarter: the Target Series where every month has one.");
    const avg = metric({ aggregation: "average", target_min: 100, target_max: 120 });
    const a = shownSeries(avg, data(avg, []), "quarter", { today: "2026-01-01" });
    expect(a.targets).toMatchObject({ range: true, note: "Target per quarter: the target range.", at: { "2025-04-01": { min: 100, max: 120 } } });
    expect(shownSeries(sum, data(sum, []), "quarter", { today: "2026-01-01" }).targets?.note).toBe("No target per quarter: the target range is for one month.");
    // A quarter to date is judged against the targets of the months it holds.
    const toDate = shownSeries(sum, data(sum, t), "quarter", { today: "2025-06-10" });
    expect(toDate.points.at(-1)).toMatchObject({ toDate: true, held: 3 });
  });

  it("shows a Metric whose Aggregation is none by its own period, saying why", () => {
    const rate = metric({ aggregation: "none" });
    const s = shownSeries(rate, canvas([rate], { revenue: months("2025-01", [1, 2, 3]) }), "quarter");
    expect(s).toMatchObject({ by: "month", combined: false, reason: NOT_COMBINED });
    expect(s.points).toHaveLength(3);
  });

  it("keeps what a Snapshot showed: to date as of its day, not today", () => {
    const m = metric();
    // October kept by a Snapshot of October: Q4 was running then, one month of three.
    const kept = canvas([m], { revenue: months("2025-07", [1, 2, 3, 4]) }, { today: dayAfter("2025-10-31") });
    expect(shownSeries(m, kept, "quarter").points.at(-1)).toMatchObject({ period: "2025-10-01", value: 4, toDate: true, held: 1 });
    // Read without its day, the quarter would be over and too empty to show.
    expect(shownSeries(m, { ...kept, today: undefined }, "quarter").points.map((p) => p.period)).toEqual(["2025-07-01"]);
  });

  it("shows a Derived Metric by its own period where its inputs are not shared", () => {
    const margin = metric({ id: 3, slug: "margin", formula: "{revenue} - {cost}", aggregation: "none" });
    const s = shownSeries(margin, canvas([margin], { margin: months("2025-01", [1, 2, 3]) }), "quarter");
    expect(s).toMatchObject({ combined: false, reason: INPUTS_MISSING });
  });

  it("offers only the Display Periods longer than a Metric's own", () => {
    expect(displayPeriodsFor("month")).toEqual(["quarter", "half", "year"]);
    expect(displayPeriodsFor("day")).toEqual(["week", "month", "quarter", "half", "year"]);
  });
});
