import { describe, expect, it } from "vitest";
import { attainment, compare, resolverFrom, targetFor } from "./compare";
import { metric, months } from "./test/fixtures";

const revenue = metric();
const series = { revenue: months("2025-01", [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230]) };
const resolve = resolverFrom([revenue], series);

describe("compare", () => {
  it("compares the latest period with the one before and the year before", () => {
    const [prev, yoy] = compare(revenue, resolve, { keys: ["prev", "yoy"] });
    expect(prev).toMatchObject({ available: true, current: 230, previous: 220, abs: 10, good: true });
    expect(yoy).toMatchObject({ available: true, current: 230, previous: 110 });
  });
  it("adds months up for quarter to date when the metric sums", () => {
    const [qoq] = compare(revenue, resolve, { keys: ["qoq"] });
    // Feb 2026 is the 2nd month of Q1: Jan+Feb 2026 against Oct+Nov 2025.
    expect(qoq).toMatchObject({ available: true, current: 220 + 230, previous: 190 + 200 });
  });
  it("says why a comparison is not available", () => {
    const [yoy] = compare(revenue, resolverFrom([revenue], { revenue: months("2026-01", [1, 2]) }), { keys: ["yoy"] });
    expect(yoy.available).toBe(false);
    expect(yoy.reason).toBeTruthy();
    expect(compare(revenue, resolverFrom([revenue], { revenue: [] }), { keys: ["prev"] })[0].reason).toBe("No values yet");
  });
  it("does not combine a metric whose aggregation is none", () => {
    const rate = metric({ slug: "rate", aggregation: "none" });
    const [qoq] = compare(rate, resolverFrom([rate], { rate: series.revenue }), { keys: ["qoq"] });
    expect(qoq.available).toBe(false);
  });
  it("computes derived metrics through their inputs", () => {
    const cost = metric({ id: 2, slug: "cost", name: "Cost", polarity: "lower" });
    const margin = metric({ id: 3, slug: "margin", name: "Margin", formula: "({revenue} - {cost}) / {revenue} * 100", aggregation: "none" });
    // Quarter to date: Jan+Feb 2026 against Oct+Nov 2025, the margin of the sums, not the sum of the margins.
    const r = resolverFrom([revenue, cost, margin], { revenue: months("2025-10", [100, 100, 100, 100, 200]), cost: months("2025-10", [50, 50, 50, 50, 50]), margin: months("2025-10", [50, 50, 50, 50, 75]) });
    const [qoq] = compare(margin, r, { keys: ["qoq"] });
    expect(qoq).toMatchObject({ available: true, previous: 50 });
    expect(qoq.current).toBeCloseTo(66.67, 1);
  });
  it("judges change by polarity", () => {
    const cost = metric({ slug: "cost", polarity: "lower" });
    expect(compare(cost, resolverFrom([cost], { cost: months("2026-01", [10, 12]) }), { keys: ["prev"] })[0].good).toBe(false);
  });
});

describe("targets and attainment", () => {
  it("prefers a Target Series over the metric's range", () => {
    expect(targetFor(revenue, "2026-02-01", [{ period: "2026-02-01", value: 250 }])).toMatchObject({ min: 250, fromSeries: true });
    expect(targetFor(revenue, "2026-02-01")).toMatchObject({ min: 100, fromSeries: false });
  });
  it("is higher-is-better for every polarity", () => {
    expect(attainment(revenue, 230, { min: 200, max: null })).toBeCloseTo(115);
    expect(attainment(metric({ polarity: "lower" }), 50, { min: null, max: 100 })).toBe(200);
    expect(attainment(metric({ polarity: "target" }), 5, { min: 1, max: 10 })).toBe(100);
  });
});
