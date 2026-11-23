// @ts-nocheck
import { describe, expect, it } from "vitest";
import { compare, resolverFrom } from "./compare";
import { dayAfter, displayPeriodsFor, INPUTS_MISSING, isDisplayPeriod, isLonger, isPartial, latestOfEach, NOT_COMBINED, periodCount, pointName, seriesBy, shownSeries, spanCount, valueOver } from "./display-periods";
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

  it("shows a Derived Metric with an input set to Aggregation none by its own period, saying why (spec 0022)", () => {
    const revenue = metric({ id: 1, slug: "revenue", name: "Revenue" });
    const stock = metric({ id: 2, slug: "stock", name: "Stock", aggregation: "none" });
    const per = metric({ id: 3, slug: "per", name: "Revenue per stock", formula: "{revenue} / {stock}", aggregation: "none" });
    const all = { revenue: months("2025-01", [10, 20, 30]), stock: months("2025-01", [1, 2, 3]), per: months("2025-01", [10, 10, 10]) };
    const s = shownSeries(per, canvas([revenue, stock, per], all), "quarter", { today: "2026-01-01" });
    expect(s).toMatchObject({ by: "month", combined: false, reason: expect.stringMatching(/Stock is set to Aggregation none/) });
    expect(s.points).toHaveLength(3);
    // A Comparison by a longer period says the same instead of "no values".
    const [qoq] = compare(per, resolverFrom([revenue, stock, per], all), { keys: ["qoq"], yearStart: ys });
    expect(qoq).toMatchObject({ available: false, reason: expect.stringMatching(/Aggregation none/) });
  });

  it("offers only the Display Periods longer than a Metric's own", () => {
    expect(displayPeriodsFor("month")).toEqual(["quarter", "half", "year"]);
    expect(displayPeriodsFor("day")).toEqual(["week", "month", "quarter", "half", "year"]);
  });
});

describe("pointName", () => {
  const q = (held: number, toDate: boolean) => ({ period: "2026-01-01", held, length: 3, toDate });

  it("names a span not over yet, one over with gaps, and a full one", () => {
    expect(pointName(q(2, true), "quarter", "month", ys)).toBe("Q1 2026 to date, 2 of 3 months");
    expect(pointName(q(2, false), "quarter", "month", ys)).toBe("Q1 2026, only 2 of 3 months");
    expect(pointName(q(3, false), "quarter", "month", ys)).toBe("Q1 2026");
    expect(pointName(q(2, false), "quarter", "month", ys, true)).toBe("Q1 26, 2 of 3 months");
  });

  it("marks a past span with gaps as partial, never one to date or full", () => {
    expect(isPartial(q(2, false))).toBe(true);
    expect(isPartial(q(2, true))).toBe(false);
    expect(isPartial(q(3, false))).toBe(false);
    // A past quarter with two of three months, from seriesBy itself.
    expect(isPartial(by("sum", "quarter", "2026-05-01").points.at(-1)!)).toBe(true);
  });
});

describe("every rule of combining, one by one (spec 0022)", () => {
  const m = metric();
  const r = resolverFrom([m], { revenue: months("2026-01", [1, 2, 3]) });

  it("reads nothing for a Metric it does not know, or one it has no series for", () => {
    expect(valueOver("unknown", "2026-01-01", "2026-03-01", r, 3)).toBeUndefined();
    expect(seriesBy(m, () => undefined, "quarter", { yearStart: ys, today: "2026-12-01" })).toEqual({ ok: true, points: [] });
    expect(shownSeries(m, canvas([m], {}), "quarter", { today: "2026-12-01" }).points).toEqual([]);
  });

  it("does not combine a span of values whose Aggregation is none", () => {
    const rate = metric({ aggregation: "none" });
    const rr = resolverFrom([rate], { revenue: months("2026-01", [1, 2, 3]) });
    expect(valueOver("revenue", "2026-01-01", "2026-03-01", rr, 3)).toBeUndefined();
    // One period alone is its own value, whatever the Aggregation (a Comparison with the period before).
    expect(valueOver("revenue", "2026-02-01", "2026-02-01", rr, 1)).toBe(2);
  });

  it("gives a Derived Metric no value where an input has none, or where its formula has none", () => {
    const a = metric({ id: 1, slug: "a" });
    const b = metric({ id: 2, slug: "b" });
    const ratio = metric({ id: 3, slug: "ratio", formula: "{a} / {b}", aggregation: "none" });
    const rr = resolverFrom([a, b, ratio], { a: months("2026-01", [1, 2, 3]), b: months("2026-01", [0, 0, 0]), ratio: months("2026-01", [1, 1, 1]) });
    // Dividing by a quarter of 0 has no value.
    expect(valueOver("ratio", "2026-01-01", "2026-03-01", rr, 3)).toBeUndefined();
    const short = resolverFrom([a, b, ratio], { a: months("2026-01", [1]), b: months("2026-01", [1, 1, 1]), ratio: months("2026-01", [1, 1, 1]) });
    expect(valueOver("ratio", "2026-01-01", "2026-03-01", short, 3)).toBeUndefined();
    // An input the data does not hold: seriesBy reads it as having no values, so no span has one.
    const missing = resolverFrom([ratio], { ratio: months("2026-01", [1, 1, 1]) });
    expect(seriesBy(ratio, missing, "quarter", { yearStart: ys, today: "2026-12-01" })).toEqual({ ok: true, points: [] });
    // The input is a Metric of the data without a series yet.
    expect(shownSeries(ratio, canvas([a, b, ratio], { ratio: months("2026-01", [1, 1, 1]) }), "quarter", { today: "2026-12-01" })).toMatchObject({ combined: true, points: [] });
  });

  it("adds values written with an exponent, and large sums to the nearest double, ties to even", () => {
    const big = (values: number[]) => seriesBy(m, resolverFrom([m], { revenue: months("2026-01", values) }), "quarter", { yearStart: ys, today: "2026-12-01" }).points[0].value;
    // 1e21 is written "1e+21"; 1e21 + 1 has no double of its own, the nearest is 1e21.
    expect(big([1e21, 1, 0])).toBe(1e21);
    expect(big([1e-7, 2e-7, 0])).toBe(3e-7);
    // 2^52 + (2^52 + 3) is 2^53 + 3, halfway between 2^53 + 2 and 2^53 + 4: the even one, 2^53 + 4.
    expect(big([2 ** 52, 2 ** 52 + 3, 0])).toBe(2 ** 53 + 4);
    // 2^52 + (2^52 + 1) is 2^53 + 1, halfway between 2^53 and 2^53 + 2: the even one, 2^53.
    expect(big([2 ** 52, 2 ** 52 + 1, 0])).toBe(2 ** 53);
    expect(big([-0.1, -0.2, 0])).toBe(-0.3);
  });

  it("keeps the latest value of a period given twice, oldest period first", () => {
    expect(latestOfEach([{ period: "2026-02-01", value: 1 }, { period: "2026-01-01", value: 2 }, { period: "2026-02-01", value: 3 }])).toEqual([{ period: "2026-01-01", value: 2 }, { period: "2026-02-01", value: 3 }]);
    expect(shownSeries(m, canvas([m], { revenue: [{ period: "2026-02-01", value: 1 }, { period: "2026-01-01", value: 2 }] }), null).points.map((p) => p.period)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("names counts and checks what a browser sends as a Display Period", () => {
    expect(spanCount(1, "month")).toBe("1 month");
    expect(spanCount(3, "week")).toBe("3 weeks");
    expect(isDisplayPeriod("half")).toBe(true);
    expect(isDisplayPeriod("day")).toBe(false);
    expect(isDisplayPeriod(4)).toBe(false);
    expect(pointName({ period: "2026-01-01", held: 2, length: 3, toDate: true }, "quarter", "month", ys, true)).toBe("Q1 26 to date");
  });
});

describe("what each rule of combining refuses or leaves out (spec 0022)", () => {
  const m = metric();
  const data = canvas([m], { revenue: months("2026-01", [1, 2, 3]) });
  const own = [1, 2, 3].map((value, i) => ({ period: `2026-0${i + 1}-01`, value, held: 1, length: 1, toDate: false, through: `2026-0${i + 1}-01` }));

  it("shows a Metric by its own period when asked for no longer one, without a reason or targets", () => {
    expect(isLonger("month", "month")).toBe(false);
    expect(isLonger("quarter", "month")).toBe(true);
    expect(shownSeries(m, data, "month")).toEqual({ by: "month", combined: false, points: own, targets: null });
    expect(shownSeries(m, data, null)).toEqual({ by: "month", combined: false, points: own, targets: null });
    expect(shownSeries(m, canvas([m], {}), null).points).toEqual([]);
    // Data without targets at all (an old Snapshot) still combines.
    expect(shownSeries(m, { ...data, targets: undefined as never }, "quarter", { today: "2026-12-01" }).targets?.line).toEqual([]);
  });

  it("refuses a shorter period, saying why", () => {
    expect(seriesBy(m, resolverFrom([m], { revenue: months("2026-01", [1]) }), "week", { yearStart: ys })).toEqual({ ok: false, reason: "A month's value cannot be split into shorter periods.", points: [] });
  });

  it("counts no periods in a range that ends before it starts, or that no period starts in", () => {
    expect(periodCount("month", "2026-10-05", "2026-08-10", ys)).toBe(0);
    expect(periodCount("month", "2026-10-02", "2026-10-20", ys)).toBe(0);
    expect(periodCount("month", "2026-10-01", "2026-12-31", ys)).toBe(3);
  });

  it("puts a Derived Metric's spans in time order, those only its inputs have values in included", () => {
    const a = metric({ id: 1, slug: "a" });
    const b = metric({ id: 2, slug: "b" });
    const both = metric({ id: 3, slug: "both", formula: "{a} + {b}", aggregation: "none" });
    // Its own values start in April, its inputs' in January: Q1 is computed from the inputs too, and comes first.
    const rr = resolverFrom([a, b, both], { a: months("2025-01", [1, 2, 3, 4, 5, 6]), b: months("2025-01", [10, 20, 30, 40, 50, 60]), both: months("2025-04", [44, 55, 66]) });
    expect(seriesBy(both, rr, "quarter", { yearStart: ys, today: "2026-01-01" }).points.map((p) => [p.period, p.value, p.held])).toEqual([["2025-01-01", 66, 3], ["2025-04-01", 165, 3]]);
  });

  it("shows a Derived Metric by its own period when one of its inputs is not shared", () => {
    const revenue = metric({ id: 1, slug: "revenue" });
    const margin = metric({ id: 3, slug: "margin", formula: "{revenue} - {cost}", aggregation: "none" });
    const s = shownSeries(margin, canvas([revenue, margin], { revenue: months("2025-01", [1, 2, 3]), margin: months("2025-01", [1, 2, 3]) }), "quarter");
    expect(s).toMatchObject({ by: "month", combined: false, reason: INPUTS_MISSING });
  });

  it("counts only targets on a Metric period's first day, and says which target applies", () => {
    const sum = metric({ target_min: null, target_max: null });
    const at = (m: typeof sum, targets: Point[]) => shownSeries(m, canvas([m], { revenue: months("2025-01", [1, 2, 3, 4, 5, 6]) }, { targets: { 1: targets } }), "quarter", { today: "2026-01-01" }).targets;
    // Three targets in Q1, but one is on the 15th: only two of its months have one, so Q1 has none.
    expect(at(sum, [...months("2025-01", [10, 10]), { period: "2025-02-15", value: 10 }])).toEqual({ at: {}, line: [], range: false, note: null });
    expect(at(sum, months("2025-01", [10, 10, 10, 20, 20, 20]))).toEqual({
      at: { "2025-01-01": { min: 30, max: null }, "2025-04-01": { min: 60, max: null } },
      line: [{ period: "2025-01-01", value: 30 }, { period: "2025-04-01", value: 60 }],
      range: false,
      note: "Target per quarter: the Target Series added up.",
    });
    const avg = metric({ aggregation: "average", target_min: 1, target_max: 9 });
    expect(at(avg, months("2025-01", [10, 10, 10]))?.note).toBe("Target per quarter: the Target Series where every month has one, else the target range.");
    expect(at(metric({ aggregation: "last" }), months("2025-01", [1, 2, 3, 4, 5, 6]))?.note).toBe("Target per quarter: the Target Series at its last value.");
  });
});
