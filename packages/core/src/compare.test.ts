import { describe, expect, it } from "vitest";
import { attainment, attainmentText, compare, comparisonsFor, resolverFrom, summary, targetFor, targetGap } from "./compare";
import { health, targetStatus } from "./format";
import { JANUARY, type YearStart } from "./periods";
import { metric, months } from "./test/fixtures";
import { referenceAttainment } from "./test/reference/attainment";

const revenue = metric();
const series = { revenue: months("2025-01", [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230]) };
const resolve = resolverFrom([revenue], series);

describe("compare", () => {
  it("compares the latest period with the one before and the year before", () => {
    const [prev, yoy] = compare(revenue, resolve, { yearStart: JANUARY, keys: ["prev", "yoy"] });
    expect(prev).toMatchObject({ available: true, current: 230, previous: 220, abs: 10, good: true });
    expect(yoy).toMatchObject({ available: true, current: 230, previous: 110 });
  });
  it("adds months up for quarter to date when the metric sums", () => {
    const [qoq] = compare(revenue, resolve, { yearStart: JANUARY, keys: ["qoq"] });
    // Feb 2026 is the 2nd month of Q1: Jan+Feb 2026 against Oct+Nov 2025.
    expect(qoq).toMatchObject({ available: true, current: 220 + 230, previous: 190 + 200 });
  });
  it("says why a comparison is not available", () => {
    const [yoy] = compare(revenue, resolverFrom([revenue], { revenue: months("2026-01", [1, 2]) }), { yearStart: JANUARY, keys: ["yoy"] });
    expect(yoy.available).toBe(false);
    expect(yoy.reason).toBeTruthy();
    expect(compare(revenue, resolverFrom([revenue], { revenue: [] }), { yearStart: JANUARY, keys: ["prev"] })[0].reason).toBe("No values yet");
  });
  it("does not combine a metric whose aggregation is none", () => {
    const rate = metric({ slug: "rate", aggregation: "none" });
    const [qoq] = compare(rate, resolverFrom([rate], { rate: series.revenue }), { yearStart: JANUARY, keys: ["qoq"] });
    expect(qoq.available).toBe(false);
  });
  it("computes derived metrics through their inputs", () => {
    const cost = metric({ id: 2, slug: "cost", name: "Cost", polarity: "lower" });
    const margin = metric({ id: 3, slug: "margin", name: "Margin", formula: "({revenue} - {cost}) / {revenue} * 100", aggregation: "none" });
    // Quarter to date: Jan+Feb 2026 against Oct+Nov 2025, the margin of the sums, not the sum of the margins.
    const r = resolverFrom([revenue, cost, margin], { revenue: months("2025-10", [100, 100, 100, 100, 200]), cost: months("2025-10", [50, 50, 50, 50, 50]), margin: months("2025-10", [50, 50, 50, 50, 75]) });
    const [qoq] = compare(margin, r, { yearStart: JANUARY, keys: ["qoq"] });
    expect(qoq).toMatchObject({ available: true, previous: 50 });
    expect(qoq.current).toBeCloseTo(66.67, 1);
  });
  it("judges change by polarity", () => {
    const cost = metric({ slug: "cost", polarity: "lower" });
    expect(compare(cost, resolverFrom([cost], { cost: months("2026-01", [10, 12]) }), { yearStart: JANUARY, keys: ["prev"] })[0].good).toBe(false);
  });
  it("starts quarters and halves from the year start", () => {
    // Feb 2026 is the last month. An April year keeps calendar quarters; a February one starts a quarter in Feb.
    const qoq = (yearStart: YearStart) => compare(revenue, resolve, { yearStart, keys: ["qoq"] })[0];
    expect(qoq(4)).toMatchObject({ current: 220 + 230, previous: 190 + 200 });
    expect(qoq(2)).toMatchObject({ current: 230, previous: 200, currentSpan: "Feb 26", previousSpan: "Nov 25" });
    expect(qoq(12)).toMatchObject({ current: 210 + 220 + 230, previous: 180 + 190 + 200, currentSpan: "Dec 25 to Feb 26" });
    // An April year's second half runs October to March: Oct 2025 to Feb 2026 against Apr to Aug 2025.
    const [hoh] = compare(revenue, resolve, { yearStart: 4, keys: ["hoh"] });
    expect(hoh).toMatchObject({ current: 190 + 200 + 210 + 220 + 230, previous: 130 + 140 + 150 + 160 + 170 });
    // Complete spans: a December year's quarter Dec to Feb is whole, a January year's last whole one is Q4 2025.
    const [full] = compare(revenue, resolve, { yearStart: 12, keys: ["qoq"], full: true });
    expect(full).toMatchObject({ current: 210 + 220 + 230, previous: 180 + 190 + 200, currentSpan: "Dec 25 to Feb 26" });
    expect(compare(revenue, resolve, { yearStart: JANUARY, keys: ["qoq"], full: true })[0]).toMatchObject({ current: 190 + 200 + 210, previous: 160 + 170 + 180 });
  });
});

describe("targets and attainment", () => {
  it("prefers a Target Series over the metric's range", () => {
    expect(targetFor(revenue, "2026-02-01", [{ period: "2026-02-01", value: 250 }])).toMatchObject({ min: 250, fromSeries: true });
    expect(targetFor(revenue, "2026-02-01")).toMatchObject({ min: 100, fromSeries: false });
  });
  it("is higher-is-better for every polarity, by either method", () => {
    expect(attainment(revenue, 230, { min: 200, max: null }, "ratio")).toBeCloseTo(115);
    expect(attainment(revenue, 230, { min: 200, max: null }, "distance")).toBeCloseTo(115);
    // The two differ for "lower is better": 50 against at most 100.
    expect(attainment(metric({ polarity: "lower" }), 50, { min: null, max: 100 }, "ratio")).toBe(200);
    expect(attainment(metric({ polarity: "lower" }), 50, { min: null, max: 100 }, "distance")).toBe(150);
    expect(attainment(metric({ polarity: "target" }), 5, { min: 1, max: 10 }, "ratio")).toBe(100);
  });
  it("uses the Metric's own method over the Workspace's, and the Workspace's without one", () => {
    const lower = (attainment_method: "ratio" | "distance" | null) => metric({ polarity: "lower", attainment_method });
    const t = { min: null, max: 10 };
    expect(attainment(lower(null), 5, t, "ratio")).toBe(200);
    expect(attainment(lower(null), 5, t, "distance")).toBe(150);
    expect(attainment(lower("distance"), 5, t, "ratio")).toBe(150);
    expect(attainment(lower("ratio"), 5, t, "distance")).toBe(200);
    // A Metric kept in a Snapshot from before the choice existed has no key at all: it follows the Workspace.
    const old = lower(null) as Partial<ReturnType<typeof metric>>;
    delete old.attainment_method;
    expect(attainment(old as ReturnType<typeof metric>, 5, t, "distance")).toBe(150);
  });
});

// Around zero (spec 0022, #113 and #130): both methods for every polarity, with targets and values below, at and
// above zero. Distance is the distance to the target in steps of its size, so it works whichever side of zero the
// target is, except at 0 (no size). Ratio means something only against a positive target, and for "lower is
// better" only for a positive value. Where there is no percentage, the difference to the target is shown instead.
describe("around zero", () => {
  const higher = metric({ polarity: "higher" });
  const lower = metric({ polarity: "lower" });
  const target = metric({ polarity: "target" });
  type M = ReturnType<typeof metric>;
  type Row = [label: string, m: M, value: number, t: { min: number | null; max: number | null }, distance: number | null, ratio: number | null, gap: number | null];
  const rows: Row[] = [
    // Higher is better, target above, at and below zero.
    ["higher, target 10, short", higher, 5, { min: 10, max: null }, 50, 50, -5],
    ["higher, target 10, ahead", higher, 20, { min: 10, max: null }, 200, 200, 10],
    ["higher, target 10, at zero", higher, 0, { min: 10, max: null }, 0, 0, -10],
    ["higher, target 10, below zero", higher, -5, { min: 10, max: null }, -50, -50, -15],
    ["higher, target 0, ahead", higher, 5, { min: 0, max: null }, null, null, 5],
    ["higher, target 0, short", higher, -5, { min: 0, max: null }, null, null, -5],
    ["higher, target -10, ahead", higher, -5, { min: -10, max: null }, 150, null, 5],
    ["higher, target -10, short", higher, -20, { min: -10, max: null }, 0, null, -10],
    ["higher, target -10, on it", higher, -10, { min: -10, max: null }, 100, null, 0],
    // Lower is better.
    ["lower, target 10, ahead", lower, 5, { min: null, max: 10 }, 150, 200, -5],
    ["lower, target 10, on it", lower, 10, { min: null, max: 10 }, 100, 100, 0],
    ["lower, target 10, short", lower, 20, { min: null, max: 10 }, 0, 50, 10],
    ["lower, target 10, at zero", lower, 0, { min: null, max: 10 }, 200, null, -10],
    ["lower, target 10, below zero", lower, -5, { min: null, max: 10 }, 250, null, -15],
    ["lower, target 0, ahead", lower, -5, { min: null, max: 0 }, null, null, -5],
    ["lower, target 0, short", lower, 5, { min: null, max: 0 }, null, null, 5],
    ["lower, target -10, ahead", lower, -20, { min: null, max: -10 }, 200, null, -10],
    ["lower, target -10, short", lower, -5, { min: null, max: -10 }, 50, null, 5],
    // Closer to the target is better: 100 inside the range, less the further outside.
    ["target, 1 to 10, inside", target, 5, { min: 1, max: 10 }, 100, 100, 0],
    ["target, 10 to 20, below", target, 5, { min: 10, max: 20 }, 50, 50, -5],
    ["target, 10 to 20, above", target, 25, { min: 10, max: 20 }, 75, 80, 5],
    ["target, 10 to 20, below zero", target, -5, { min: 10, max: 20 }, -50, -50, -15],
    ["target, 0 to 10, below", target, -5, { min: 0, max: 10 }, null, null, -5],
    ["target, 0 to 10, above", target, 20, { min: 0, max: 10 }, 0, 50, 10],
    ["target, -10 to 0, above", target, 5, { min: -10, max: 0 }, null, null, 5],
    ["target, -10 to 0, inside", target, -5, { min: -10, max: 0 }, 100, 100, 0],
    ["target, -20 to -10, below", target, -25, { min: -20, max: -10 }, 75, null, -5],
    ["target, -20 to -10, above", target, -5, { min: -20, max: -10 }, 50, null, 5],
    ["target, at least -10, below", target, -15, { min: -10, max: null }, 50, null, -5],
    ["target, at most 10, above", target, 20, { min: null, max: 10 }, 0, 50, 10],
    // No target, or a value that is not a number: nothing.
    ["higher, no target", higher, 5, { min: null, max: null }, null, null, null],
    ["lower, no target", lower, 5, { min: null, max: null }, null, null, null],
    ["target, no target", target, 5, { min: null, max: null }, null, null, null],
    ["higher, NaN", higher, NaN, { min: 10, max: null }, null, null, null],
    ["lower, Infinity", lower, Infinity, { min: null, max: 10 }, null, null, null],
  ];
  it.each(rows)("%s", (_, m, v, t, distance, ratio, gap) => {
    for (const [method, want] of [["distance", distance], ["ratio", ratio]] as const) {
      const got = attainment(m, v, t, method);
      if (want === null) expect(got, method).toBeNull();
      else expect(got, method).toBeCloseTo(want, 9);
    }
    expect(targetGap(m, v, t)).toBe(gap);
  });

  // Every combination of method, polarity, target and value against the reference, which works on exact fractions.
  const values = [-1000, -20, -10, -5, -0.5, -0.1, 0, 0.1, 0.3, 0.5, 5, 9.99, 10, 10.01, 20, 1000];
  const bounds = [null, -10, -1, -0.5, 0, 0.1, 0.5, 1, 10];
  it("equals the reference for every method, polarity, target and value", () => {
    let checked = 0;
    for (const method of ["ratio", "distance"] as const) for (const polarity of ["higher", "lower", "target"] as const) {
      const m = metric({ polarity });
      for (const lo of bounds) for (const hi of bounds) {
        // One bound each for higher and lower; a range needs its lower bound at or under its upper one.
        if (polarity === "higher" && hi !== null) continue;
        if (polarity === "lower" && lo !== null) continue;
        if (lo !== null && hi !== null && lo > hi) continue;
        for (const v of values) {
          const want = referenceAttainment(method, polarity, v, lo, hi);
          const got = attainment(m, v, { min: lo, max: hi }, method);
          if (want === null) expect(got, `${method} ${polarity} ${v} [${lo}, ${hi}]`).toBeNull();
          else expect(got, `${method} ${polarity} ${v} [${lo}, ${hi}]`).toBeCloseTo(want, 9);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("always gives a finite number or null, more for a better value, and 100 on target", () => {
    const many = [-1e6, -20, -10, -5, -0.5, 0, 0.5, 5, 10, 20, 1e6];
    const targets = [-10, -1, 0, 1, 10];
    for (const method of ["ratio", "distance"] as const) for (const tv of targets) for (const [m, t] of [[higher, { min: tv, max: null }], [lower, { min: null, max: tv }]] as const) {
      const pairs = many.map((v) => [v, attainment(m, v, t, method)] as const);
      for (const [, g] of pairs) expect(g === null || Number.isFinite(g)).toBe(true);
      if (tv === 0 || (method === "ratio" && tv < 0)) { expect(pairs.every(([, g]) => g === null)).toBe(true); continue; }
      // By ratio, "lower is better" has a percentage only for a value above zero.
      const nums = pairs.filter(([, g]) => g !== null) as (readonly [number, number])[];
      if (method === "ratio" && m.polarity === "lower") expect(pairs.filter(([v]) => v <= 0).every(([, g]) => g === null)).toBe(true);
      // Higher is better: attainment rises with the value; lower is better: it falls.
      for (let i = 1; i < nums.length; i++) expect(m.polarity === "higher" ? nums[i][1] > nums[i - 1][1] : nums[i][1] < nums[i - 1][1]).toBe(true);
      expect(attainment(m, tv, t, method)).toBe(100);
    }
  });

  it("writes Attainment without -0", () => {
    expect(attainmentText(-0.4, "1,234.5")).toBe("0 %");
    expect(attainmentText(-0.04, "1,234.5", 1)).toBe("0.0 %");
    expect(attainmentText(92.4, "1,234.5")).toBe("92 %");
    expect(attainmentText(-12.6, "1.234,5", 1)).toBe("−12,6 %");
  });

  it("says a value is on target from the difference where there is no percentage", () => {
    const at = (m: ReturnType<typeof metric>, value: number, t: { min?: number | null; max?: number | null }) => {
      const mm = { ...m, target_min: t.min ?? null, target_max: t.max ?? null };
      return summary(mm, resolverFrom([mm], { [mm.slug]: [{ period: "2026-01-01", value }] }), [], { keys: [], yearStart: JANUARY, attainmentMethod: "distance" });
    };
    expect(at(higher, 3, { min: 0 })).toMatchObject({ attainment: null, gap: 3, onTarget: true });
    expect(at(higher, -3, { min: 0 })).toMatchObject({ attainment: null, gap: -3, onTarget: false });
    expect(at(lower, -3, { max: 0 })).toMatchObject({ attainment: null, gap: -3, onTarget: true });
    expect(at(target, 0, { min: 0, max: 0 })).toMatchObject({ attainment: 100, gap: 0, onTarget: true });
    expect(at(higher, -5, { min: -10 })).toMatchObject({ attainment: 150, onTarget: true });
    expect(at(higher, 3, {})).toMatchObject({ attainment: null, gap: null, onTarget: null });
    expect(at(higher, 3, {})).toMatchObject({ method: "distance" });
  });

  it("says on target by ratio from the difference where a ratio means nothing, and names the method", () => {
    const at = (m: ReturnType<typeof metric>, value: number, t: { min?: number | null; max?: number | null }) => {
      const mm = { ...m, target_min: t.min ?? null, target_max: t.max ?? null };
      return summary(mm, resolverFrom([mm], { [mm.slug]: [{ period: "2026-01-01", value }] }), [], { keys: [], yearStart: JANUARY, attainmentMethod: "ratio" });
    };
    expect(at(lower, 5, { max: 10 })).toMatchObject({ attainment: 200, onTarget: true, method: "ratio" });
    expect(at(lower, 0, { max: 10 })).toMatchObject({ attainment: null, gap: -10, onTarget: true });
    expect(at(higher, -5, { min: -10 })).toMatchObject({ attainment: null, gap: 5, onTarget: true });
    expect(at(higher, -20, { min: -10 })).toMatchObject({ attainment: null, gap: -10, onTarget: false });
    expect(at({ ...lower, attainment_method: "distance" }, 5, { max: 10 })).toMatchObject({ attainment: 150, method: "distance" });
  });

  it("puts a value that is not a number on no side of the target", () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      expect(health({ target_min: 10, target_max: null }, v)).toBe("neutral");
      expect(health({ target_min: null, target_max: 10 }, v)).toBe("neutral");
      expect(targetStatus({ target_min: 0, target_max: 10 }, v)).toBeNull();
    }
    // Below, at and above zero.
    const m = { target_min: -10, target_max: 0 };
    expect([-20, -10, -5, -0, 0, 5].map((v) => targetStatus(m, v))).toEqual(["below", "on", "on", "on", "on", "above"]);
    expect([-20, -5, 5].map((v) => health(m, v))).toEqual(["bad", "good", "bad"]);
  });

  it("compares changes from below, at and above zero by the size of the earlier value", () => {
    const cases: [previous: number, current: number, pct: number | null][] = [
      [10, 15, 50], [10, 5, -50], [-10, -5, 50], [-10, -15, -50], [-10, 5, 150], [0, 5, null], [0, 0, null], [5, 0, -100],
    ];
    for (const [previous, current, pct] of cases) {
      const r = compare(higher, resolverFrom([higher], { [higher.slug]: [{ period: "2026-01-01", value: previous }, { period: "2026-02-01", value: current }] }), { keys: ["prev"], yearStart: JANUARY })[0];
      expect(r).toMatchObject({ available: true, abs: current - previous });
      if (pct === null) expect(r.pct).toBeNull();
      else expect(r.pct).toBeCloseTo(pct, 9);
    }
  });
});

describe("quarterly and yearly Metrics", () => {
  // Quarter starts, one value per quarter, oldest first.
  const quarters = (start: string, values: number[]) => values.map((value, i) => {
    const [y, m] = start.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + 3 * i, 1));
    return { period: d.toISOString().slice(0, 10), value };
  });
  it("offers the previous quarter, QoQ, HoH and YoY to a quarterly Metric, and only YoY to a yearly one", () => {
    expect(comparisonsFor("quarter")).toEqual(["prev", "qoq", "hoh", "yoy"]);
    expect(comparisonsFor("year")).toEqual(["yoy"]);
    expect(comparisonsFor("month")).toEqual(["prev", "mom", "qoq", "hoh", "yoy"]);
  });
  it("compares a quarter with the one before, its half so far and the same quarter a year before", () => {
    const nps = metric({ slug: "nps", period: "quarter", aggregation: "sum" });
    // Q1 2025 to Q3 2026: 10, 20, 30, 40, 50, 60, 70.
    const r = resolverFrom([nps], { nps: quarters("2025-01", [10, 20, 30, 40, 50, 60, 70]) });
    const [prev, qoq, hoh, yoy] = compare(nps, r, { yearStart: JANUARY, keys: comparisonsFor("quarter") });
    expect(prev).toMatchObject({ current: 70, previous: 60, currentSpan: "Q3 26", previousSpan: "Q2 26" });
    expect(qoq).toMatchObject({ current: 70, previous: 60 });
    // H2 2026 so far is Q3 alone, against Q1 2026, the first quarter of H1.
    expect(hoh).toMatchObject({ current: 70, previous: 50, currentSpan: "Q3 26", previousSpan: "Q1 26" });
    expect(yoy).toMatchObject({ current: 70, previous: 30, previousSpan: "Q3 25" });
    // Full periods: H1 2026 (Q1 + Q2) against H2 2025 (Q3 + Q4).
    const [full] = compare(nps, r, { yearStart: JANUARY, keys: ["hoh"], full: true });
    expect(full).toMatchObject({ current: 50 + 60, previous: 30 + 40, currentSpan: "Q1 26 to Q2 26" });
  });
  it("follows the year start: with April, the half of a quarter from October is the one from October", () => {
    const nps = metric({ slug: "nps", period: "quarter", aggregation: "sum" });
    // Apr 2025 to Jan 2027: the last quarter, Q4 FY 2026/27, starts in January.
    const r = resolverFrom([nps], { nps: quarters("2025-04", [1, 2, 3, 4, 5, 6, 7, 8]) });
    const [hoh] = compare(nps, r, { yearStart: 4, keys: ["hoh"] });
    // H2 FY 2026/27 so far is October and January's quarters, against April and July's.
    expect(hoh).toMatchObject({ current: 7 + 8, previous: 5 + 6, currentSpan: "Q3 26/27 to Q4 26/27" });
  });
  it("compares a year with the year before", () => {
    const audit = metric({ slug: "audit", period: "year", aggregation: "last" });
    const r = resolverFrom([audit], { audit: [{ period: "2024-01-01", value: 80 }, { period: "2025-01-01", value: 90 }] });
    expect(compare(audit, r, { yearStart: JANUARY })).toEqual([expect.objectContaining({ key: "yoy", current: 90, previous: 80, currentSpan: "2025", previousSpan: "2024" })]);
    // A fiscal year is named by both its calendar years.
    const fy = resolverFrom([audit], { audit: [{ period: "2024-04-01", value: 80 }, { period: "2025-04-01", value: 88 }] });
    expect(compare(audit, fy, { yearStart: 4 })[0]).toMatchObject({ current: 88, previous: 80, currentSpan: "FY25/26", previousSpan: "FY24/25" });
  });
});


describe("every branch of a Comparison (spec 0022)", () => {
  it("compares as of a day, leaving later values out", () => {
    const m = metric();
    const [prev] = compare(m, resolverFrom([m], { revenue: months("2026-01", [1, 2, 3, 4]) }), { yearStart: JANUARY, keys: ["prev"], asOf: "2026-02-01" });
    expect(prev).toMatchObject({ current: 2, previous: 1 });
  });

  it("says the current span is incomplete when only the earlier one has values", () => {
    const m = metric({ period: "day" });
    // January to the 5th holds one of its five days, too few; December to the 5th holds all five.
    const days = Array.from({ length: 31 }, (_, i) => ({ period: `2025-12-${String(i + 1).padStart(2, "0")}`, value: 1 }));
    const [mom] = compare(m, resolverFrom([m], { revenue: [...days, { period: "2026-01-05", value: 1 }] }), { yearStart: JANUARY, keys: ["mom"] });
    expect(mom).toMatchObject({ available: false, reason: "Incomplete values for this span" });
  });

  it("says why a Derived Metric with an input set to none is not compared to date", () => {
    const revenue = metric({ id: 1, slug: "revenue" });
    const stock = metric({ id: 2, slug: "stock", aggregation: "none" });
    const per = metric({ id: 3, slug: "per", formula: "{revenue} / {stock}", aggregation: "none" });
    const r = resolverFrom([revenue, stock, per], { revenue: months("2026-01", [1, 2]), stock: months("2026-01", [1, 1]), per: months("2026-01", [1, 2]) });
    for (const full of [false, true]) expect(compare(per, r, { yearStart: JANUARY, keys: ["qoq"], full })[0]).toMatchObject({ available: false, reason: expect.stringMatching(/Aggregation none/) });
    // A Metric the data does not hold has no values.
    expect(compare(per, () => undefined, { yearStart: JANUARY, keys: ["prev"] })[0]).toMatchObject({ available: false, reason: "No values yet" });
    expect(summary(per, () => undefined, [], { yearStart: JANUARY, attainmentMethod: "distance" }).value).toBeUndefined();
  });

  it("reads a Target Series and a range for a Metric where lower is better", () => {
    const m = metric({ polarity: "lower", target_min: null, target_max: 10 });
    expect(targetFor(m, "2026-01-01", [{ period: "2026-01-01", value: 8 }])).toMatchObject({ min: null, max: 8, fromSeries: true, value: 8 });
    expect(attainment({ ...m, target_max: null }, 5, { min: null, max: null }, "ratio")).toBeNull();
    expect(targetGap({ ...m, target_max: null }, 5, { min: null, max: null })).toBeNull();
  });

  it("sums up a Metric without values, without targets, and on target by the difference", () => {
    const m = metric();
    expect(summary(m, resolverFrom([m], {}), undefined, { yearStart: JANUARY, attainmentMethod: "distance" })).toMatchObject({ value: undefined, target: null, attainment: null, gap: null, onTarget: null });
    const z = metric({ polarity: "higher", target_min: 0 });
    expect(summary(z, resolverFrom([z], { revenue: months("2026-01", [2]) }), undefined, { yearStart: JANUARY, attainmentMethod: "distance" })).toMatchObject({ attainment: null, gap: 2, onTarget: true });
    const low = metric({ polarity: "lower", target_min: null, target_max: 0 });
    expect(summary(low, resolverFrom([low], { revenue: months("2026-01", [2]) }), [], { yearStart: JANUARY, attainmentMethod: "distance" })).toMatchObject({ gap: 2, onTarget: false });
    // A target of exactly 0: on target only at 0.
    const band = metric({ polarity: "target", target_min: 0, target_max: null });
    expect(summary(band, resolverFrom([band], { revenue: months("2026-01", [-1]) }), [], { yearStart: JANUARY, attainmentMethod: "distance" })).toMatchObject({ attainment: null, gap: -1, onTarget: false });
    // A Metric with no range: neither on target nor off it.
    const none = metric({ target_min: null });
    expect(summary(none, resolverFrom([none], { revenue: months("2026-01", [2]) }), [], { yearStart: JANUARY, attainmentMethod: "distance" }).onTarget).toBeNull();
    // The latest period is the latest, whatever order the values came in.
    expect(summary(m, resolverFrom([m], { revenue: [...months("2026-03", [7]), ...months("2026-01", [5])] }), [], { yearStart: JANUARY, attainmentMethod: "distance" }).period).toBe("2026-03-01");
  });
});

describe("which Comparisons, and why one is not available (spec 0022)", () => {
  it("offers a daily Metric every Comparison and a weekly one all but DoD", () => {
    expect(comparisonsFor("day")).toEqual(["prev", "dod", "wow", "mom", "qoq", "hoh", "yoy"]);
    expect(comparisonsFor("week")).toEqual(["prev", "wow", "mom", "qoq", "hoh", "yoy"]);
  });

  it("names the Metric that does not combine, and the span that has too few values", () => {
    const rate = metric({ slug: "rate", name: "Rate", aggregation: "none" });
    expect(compare(rate, resolverFrom([rate], { rate: series.revenue }), { yearStart: JANUARY, keys: ["qoq"] })[0]).toEqual({ key: "qoq", label: "QoQ", available: false, reason: "Rate does not combine into longer periods" });
    // No February: March has no month before it to compare with.
    const gap = resolverFrom([revenue], { revenue: [...months("2026-01", [1]), ...months("2026-03", [3])] });
    expect(compare(revenue, gap, { yearStart: JANUARY, keys: ["prev"] })[0]).toMatchObject({ available: false, reason: "No values for the earlier span", currentSpan: "Mar 26", previousSpan: "Feb 26" });
    // Q1 2026 holds only March, one month of three; Q4 2025 is whole.
    const thin = resolverFrom([revenue], { revenue: [...months("2025-10", [1, 2, 3]), ...months("2026-03", [4])] });
    expect(compare(revenue, thin, { yearStart: JANUARY, keys: ["qoq"], full: true })[0]).toMatchObject({ available: false, reason: "Incomplete values for this span" });
  });

  it("calls a rise good where higher is better, a fall bad, and no change neither", () => {
    const good = (values: number[], polarity: "higher" | "lower" | "target") => {
      const m = metric({ polarity });
      return compare(m, resolverFrom([m], { revenue: months("2026-01", values) }), { yearStart: JANUARY, keys: ["prev"] })[0].good;
    };
    expect([good([1, 2], "higher"), good([2, 1], "higher"), good([1, 1], "higher")]).toEqual([true, false, null]);
    expect([good([1, 2], "lower"), good([2, 1], "lower"), good([1, 2], "target")]).toEqual([false, true, null]);
  });
});

describe("the target of a period, and whether a value is on it (spec 0022)", () => {
  it("takes the Target Series value of that period, as a minimum or, where lower is better, a maximum", () => {
    const t = [{ period: "2026-01-01", value: 1 }, { period: "2026-02-01", value: 250 }];
    expect(targetFor(revenue, "2026-02-01", t)).toEqual({ min: 250, max: null, fromSeries: true, value: 250 });
    expect(targetFor(metric({ polarity: "target" }), "2026-02-01", t)).toEqual({ min: 250, max: null, fromSeries: true, value: 250 });
    expect(targetFor(metric({ polarity: "lower" }), "2026-02-01", t)).toEqual({ min: null, max: 250, fromSeries: true, value: 250 });
  });

  it("falls back on the range, whose value is the bound that matters", () => {
    const range = { target_min: 10, target_max: 20 };
    expect(targetFor(metric({ polarity: "higher", ...range }), "2026-03-01", [])).toEqual({ min: 10, max: 20, fromSeries: false, value: 10 });
    expect(targetFor(metric({ polarity: "target", ...range }), "2026-03-01")).toEqual({ min: 10, max: 20, fromSeries: false, value: 10 });
    expect(targetFor(metric({ polarity: "lower", ...range }), "2026-03-01")).toEqual({ min: 10, max: 20, fromSeries: false, value: 20 });
  });

  it("is on target exactly on the bound, inside a range, and not outside it", () => {
    const on = (polarity: "higher" | "lower" | "target", value: number, range: { target_min: number | null; target_max: number | null }) => {
      const m = metric({ polarity, ...range });
      return summary(m, resolverFrom([m], { revenue: months("2026-01", [value]) }), [], { keys: [], yearStart: JANUARY, attainmentMethod: "distance" }).onTarget;
    };
    expect([on("higher", 10, { target_min: 10, target_max: null }), on("lower", 10, { target_min: null, target_max: 10 })]).toEqual([true, true]);
    expect([on("target", 15, { target_min: 10, target_max: 20 }), on("target", 21, { target_min: 10, target_max: 20 }), on("target", 9, { target_min: 10, target_max: 20 })]).toEqual([true, false, false]);
    // Below a target of 0 is on target where lower is better: there is no percentage, so the difference decides.
    expect(on("lower", -5, { target_min: null, target_max: 0 })).toBe(true);
  });

  it("is not on target just below it, though Attainment rounds to 100 % (bug: it was on target)", () => {
    // 0.00016999999999999999 is the double just below 0.00017: by ratio 99.99999999999999…%, whose nearest double is
    // 100. It is still below the target, by 1e-20, so it is not on target.
    const m = metric({ polarity: "higher", target_min: 0.00017 });
    const s = summary(m, resolverFrom([m], { revenue: months("2026-01", [0.00016999999999999999]) }), [], { keys: [], yearStart: JANUARY, attainmentMethod: "ratio" });
    expect(s).toMatchObject({ attainment: 100, gap: -1e-20, onTarget: false });
  });

  it("has no target, Attainment or difference for a Metric without values", () => {
    const m = metric();
    expect(summary(m, () => undefined, [], { keys: [], yearStart: JANUARY, attainmentMethod: "ratio" })).toMatchObject({ value: undefined, period: undefined, target: null, attainment: null, gap: null, onTarget: null });
  });
});
