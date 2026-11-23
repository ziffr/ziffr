// The Gallery's views made with real Metrics (ticket #861): the real Metrics stand where the sample ones stood, in order, and a
// sample Metric (a negative id) is never left in a widget the person could place.
import { describe, expect, it } from "vitest";
import { OFFERED_TEMPLATES } from "@/views/templates";
import { slopeWith, widgetWith } from "./widget-with";

const REAL = [101, 102, 103];
const numbers = (x: unknown): number[] => Array.isArray(x) ? x.flatMap(numbers) : x && typeof x === "object" ? Object.entries(x).flatMap(([k, v]) => (k === "metricIds" ? numbers(v) : numbers(v))) : typeof x === "number" ? [x] : [];

describe("widgetWith", () => {
  it("puts the first real Metric where a view's first sample Metric stood, and the others in order", () => {
    const one = widgetWith("line" as never, REAL, "month");
    expect(one.metric_ids).toEqual([101]);
    const two = widgetWith("correlation" as never, REAL, "month");
    expect(two.metric_ids).toEqual([101, 102]);
  });
  it("gives a scoreboard the picked Metric and its two partners, one row each, in order", () => {
    expect(widgetWith("scoreboard", REAL, "month").metric_ids).toEqual(REAL);
  });
  it("leaves no sample Metric in any built-in view, in its Metrics or in the Metrics its settings name", () => {
    for (const t of OFFERED_TEMPLATES) {
      const w = widgetWith(t.id, REAL, "month");
      expect(w.metric_ids.every((id) => REAL.includes(id)), t.id).toBe(true);
      const named: number[] = [];
      (function walk(x: unknown) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { if (k === "metricIds") named.push(...numbers(v)); else walk(v); } })(w.settings);
      expect(named.every((id) => REAL.includes(id)), t.id).toBe(true);
    }
  });
  it("wraps round when a view takes more Metrics than were given, and returns the sample view when none are", () => {
    const matrix = widgetWith("matrix" as never, [101], "month");
    expect(new Set(matrix.metric_ids)).toEqual(new Set([101]));
    expect(widgetWith("line" as never, [], "month").metric_ids.every((id) => id < 0)).toBe(true);
  });
  it("draws the slope chart with the picked Metric's Breakdown, or with Metrics of one unit, each Metric once", () => {
    const rows = slopeWith([101, 102], "month", "rows");
    expect(rows.metric_ids).toEqual([101]);
    expect(rows.settings.slope).toBe("previous");
    const metrics = slopeWith([101, 102, 103], "month", "metrics");
    expect(metrics.metric_ids).toEqual([101, 102, 103]);
    expect(metrics.settings.slope).toBe("metrics");
  });
  it("draws one bar per Metric in Progress against target, never the same Metric three times", () => {
    expect(widgetWith("progress", [101], "month").metric_ids).toEqual([101]);
    expect(widgetWith("progress", [101, 102, 103], "month").metric_ids).toEqual([101, 102, 103]);
  });
});
