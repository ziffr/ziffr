// The Gallery's views made with real Metrics (ticket #861): the real Metrics stand where the sample ones stood, in order, and a
// sample Metric (a negative id) is never left in a widget the person could place.
import { describe, expect, it } from "vitest";
import { OFFERED_TEMPLATES } from "@/views/templates";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { partnersOf, placedAtOnce, slopeWith, viewWith, widgetWith } from "./widget-with";

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

describe("a view with the picked Metric (the Gallery and the Add widget panel)", () => {
  const data = sampleCanvasData("sara", "1,234.5");
  // A monthly Metric of the sample data without a Breakdown.
  const metric = data.metrics.find((m) => m.period === "month" && !Object.keys(data.breakdowns[m.id] ?? {}).length)!;
  const partners = partnersOf(metric, data.metrics.filter((m) => m.id !== metric.id).map((m) => m.id), data);
  const view = (id: string, others = partners) => viewWith(id as never, metric, others, data);
  const atOnce = (id: string, others = partners) => placedAtOnce(id as never, metric, view(id, others));

  it("places a view for one Metric at once, with that Metric only", () => {
    for (const id of ["number", "line", "bars", "gauge", "table", "forecast", "progress", "heatmap", "story", "story-line"]) expect(atOnce(id), id).toEqual([metric.id]);
  });
  it("asks for a view of several Metrics, also when the card draws it with others", () => {
    expect(partners.length).toBe(2);
    for (const id of ["correlation", "matrix", "drivers", "scoreboard"]) {
      expect(view(id).widget, id).not.toBeNull();
      expect(atOnce(id), id).toEqual([]);
    }
    expect(atOnce("slope")).toEqual([]);
  });
  it("asks, and says why it shows sample data, when the Metric cannot fill the view", () => {
    expect(view("pareto").why).toContain("has no breakdown");
    expect(atOnce("pareto")).toEqual([]);
    expect(view("correlation", []).why).toContain("Needs other Metrics");
    expect(viewWith("heatmap", { ...metric, period: "year" }, [], data).widget).toBeNull();
  });
  it("places nothing at once before the card is drawn, without a Metric, or where there is no Slot", () => {
    expect(placedAtOnce("number", metric, { widget: null, why: null })).toEqual([]);
    expect(placedAtOnce("number", null, view("number"))).toEqual([]);
    expect(atOnce("canvas")).toEqual([]);
  });
});
