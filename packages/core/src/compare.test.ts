import { describe, expect, it } from "vitest";
import { attainment, attainmentText, compare, comparisonsFor, resolverFrom, summary, targetFor, targetGap } from "./compare";
import { health, targetStatus } from "./format";
import { JANUARY, type YearStart } from "./periods";
import { metric, months } from "./test/fixtures";

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
  it("is higher-is-better for every polarity", () => {
    expect(attainment(revenue, 230, { min: 200, max: null })).toBeCloseTo(115);
    expect(attainment(metric({ polarity: "lower" }), 50, { min: null, max: 100 })).toBe(150);
    expect(attainment(metric({ polarity: "target" }), 5, { min: 1, max: 10 })).toBe(100);
  });
});

// Around zero (spec 0022): Attainment is the distance to the target in steps of the target's size, so 100 % is on
// target and more is better, whichever side of zero the target is. A target of 0 has no size: no percentage, the
// difference instead.
describe("around zero", () => {
  const higher = metric({ polarity: "higher" });
  const lower = metric({ polarity: "lower" });
  const target = metric({ polarity: "target" });
  type Row = [label: string, m: ReturnType<typeof metric>, value: number, t: { min: number | null; max: number | null }, attainment: number | null, gap: number | null];
  const rows: Row[] = [
    // Higher is better, target above, at and below zero.
    ["higher, target 10, short", higher, 5, { min: 10, max: null }, 50, -5],
    ["higher, target 10, ahead", higher, 20, { min: 10, max: null }, 200, 10],
    ["higher, target 10, below zero", higher, -5, { min: 10, max: null }, -50, -15],
    ["higher, target 0, ahead", higher, 5, { min: 0, max: null }, null, 5],
    ["higher, target 0, short", higher, -5, { min: 0, max: null }, null, -5],
    ["higher, target -10, ahead", higher, -5, { min: -10, max: null }, 150, 5],
    ["higher, target -10, short", higher, -20, { min: -10, max: null }, 0, -10],
    ["higher, target -10, on it", higher, -10, { min: -10, max: null }, 100, 0],
    // Lower is better.
    ["lower, target 10, ahead", lower, 5, { min: null, max: 10 }, 150, -5],
    ["lower, target 10, short", lower, 20, { min: null, max: 10 }, 0, 10],
    ["lower, target 10, at zero", lower, 0, { min: null, max: 10 }, 200, -10],
    ["lower, target 10, below zero", lower, -5, { min: null, max: 10 }, 250, -15],
    ["lower, target 0, ahead", lower, -5, { min: null, max: 0 }, null, -5],
    ["lower, target 0, short", lower, 5, { min: null, max: 0 }, null, 5],
    ["lower, target -10, ahead", lower, -20, { min: null, max: -10 }, 200, -10],
    ["lower, target -10, short", lower, -5, { min: null, max: -10 }, 50, 5],
    // Closer to the target is better: 100 inside the range, less the further outside.
    ["target, 1 to 10, inside", target, 5, { min: 1, max: 10 }, 100, 0],
    ["target, 10 to 20, below", target, 5, { min: 10, max: 20 }, 50, -5],
    ["target, 10 to 20, above", target, 25, { min: 10, max: 20 }, 75, 5],
    ["target, 0 to 10, below", target, -5, { min: 0, max: 10 }, null, -5],
    ["target, -10 to 0, above", target, 5, { min: -10, max: 0 }, null, 5],
    ["target, -10 to 0, inside", target, -5, { min: -10, max: 0 }, 100, 0],
    ["target, -20 to -10, below", target, -25, { min: -20, max: -10 }, 75, -5],
    ["target, -20 to -10, above", target, -5, { min: -20, max: -10 }, 50, 5],
    ["target, at least -10, below", target, -15, { min: -10, max: null }, 50, -5],
    // No target, or a value that is not a number: nothing.
    ["higher, no target", higher, 5, { min: null, max: null }, null, null],
    ["target, no target", target, 5, { min: null, max: null }, null, null],
    ["higher, NaN", higher, NaN, { min: 10, max: null }, null, null],
    ["lower, Infinity", lower, Infinity, { min: null, max: 10 }, null, null],
  ];
  it.each(rows)("%s", (_, m, v, t, a, gap) => {
    const got = attainment(m, v, t);
    if (a === null) expect(got).toBeNull();
    else expect(got).toBeCloseTo(a, 9);
    expect(targetGap(m, v, t)).toBe(gap);
  });

  it("always gives a finite number or null, and more for a better value", () => {
    const values = [-1e6, -20, -10, -5, -0.5, 0, 0.5, 5, 10, 20, 1e6];
    const targets = [-10, -1, 0, 1, 10];
    for (const tv of targets) for (const [m, t] of [[higher, { min: tv, max: null }], [lower, { min: null, max: tv }]] as const) {
      const got = values.map((v) => attainment(m, v, t));
      for (const g of got) expect(g === null || Number.isFinite(g)).toBe(true);
      if (tv === 0) { expect(got.every((g) => g === null)).toBe(true); continue; }
      // Higher is better: attainment rises with the value; lower is better: it falls.
      const nums = got as number[];
      for (let i = 1; i < nums.length; i++) expect(m.polarity === "higher" ? nums[i] > nums[i - 1] : nums[i] < nums[i - 1]).toBe(true);
      expect(attainment(m, tv, t)).toBe(100);
    }
  });

  it("writes Attainment without -0", () => {
    expect(attainmentText(-0.4, "1,234.5")).toBe("0 %");
    expect(attainmentText(-0.04, "1,234.5", 1)).toBe("0.0 %");
    expect(attainmentText(92.4, "1,234.5")).toBe("92 %");
    expect(attainmentText(-12.6, "1.234,5", 1)).toBe("-12,6 %");
  });

  it("says a value is on target from the difference where there is no percentage", () => {
    const at = (m: ReturnType<typeof metric>, value: number, t: { min?: number | null; max?: number | null }) => {
      const mm = { ...m, target_min: t.min ?? null, target_max: t.max ?? null };
      return summary(mm, resolverFrom([mm], { [mm.slug]: [{ period: "2026-01-01", value }] }), [], { keys: [], yearStart: JANUARY });
    };
    expect(at(higher, 3, { min: 0 })).toMatchObject({ attainment: null, gap: 3, onTarget: true });
    expect(at(higher, -3, { min: 0 })).toMatchObject({ attainment: null, gap: -3, onTarget: false });
    expect(at(lower, -3, { max: 0 })).toMatchObject({ attainment: null, gap: -3, onTarget: true });
    expect(at(target, 0, { min: 0, max: 0 })).toMatchObject({ attainment: 100, gap: 0, onTarget: true });
    expect(at(higher, -5, { min: -10 })).toMatchObject({ attainment: 150, onTarget: true });
    expect(at(higher, 3, {})).toMatchObject({ attainment: null, gap: null, onTarget: null });
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
    expect(summary(per, () => undefined, [], { yearStart: JANUARY }).value).toBeUndefined();
  });

  it("reads a Target Series and a range for a Metric where lower is better", () => {
    const m = metric({ polarity: "lower", target_min: null, target_max: 10 });
    expect(targetFor(m, "2026-01-01", [{ period: "2026-01-01", value: 8 }])).toMatchObject({ min: null, max: 8, fromSeries: true, value: 8 });
    expect(attainment({ ...m, target_max: null }, 5, { min: null, max: null })).toBeNull();
    expect(targetGap({ ...m, target_max: null }, 5, { min: null, max: null })).toBeNull();
  });

  it("sums up a Metric without values, without targets, and on target by the difference", () => {
    const m = metric();
    expect(summary(m, resolverFrom([m], {}), undefined, { yearStart: JANUARY })).toMatchObject({ value: undefined, target: null, attainment: null, gap: null, onTarget: null });
    const z = metric({ polarity: "higher", target_min: 0 });
    expect(summary(z, resolverFrom([z], { revenue: months("2026-01", [2]) }), undefined, { yearStart: JANUARY })).toMatchObject({ attainment: null, gap: 2, onTarget: true });
    const low = metric({ polarity: "lower", target_min: null, target_max: 0 });
    expect(summary(low, resolverFrom([low], { revenue: months("2026-01", [2]) }), [], { yearStart: JANUARY })).toMatchObject({ gap: 2, onTarget: false });
    // A target of exactly 0: on target only at 0.
    const band = metric({ polarity: "target", target_min: 0, target_max: null });
    expect(summary(band, resolverFrom([band], { revenue: months("2026-01", [-1]) }), [], { yearStart: JANUARY })).toMatchObject({ attainment: null, gap: -1, onTarget: false });
    // A Metric with no range: neither on target nor off it.
    const none = metric({ target_min: null });
    expect(summary(none, resolverFrom([none], { revenue: months("2026-01", [2]) }), [], { yearStart: JANUARY }).onTarget).toBeNull();
    // The latest period is the latest, whatever order the values came in.
    expect(summary(m, resolverFrom([m], { revenue: [...months("2026-03", [7]), ...months("2026-01", [5])] }), [], { yearStart: JANUARY }).period).toBe("2026-03-01");
  });
});
