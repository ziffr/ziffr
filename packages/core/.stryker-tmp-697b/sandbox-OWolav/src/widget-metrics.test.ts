// @ts-nocheck
import { describe, expect, it } from "vitest";
import { widgetMetricIds } from "./widget-metrics";

describe("widget metrics", () => {
  it("finds every metric a widget draws: its own, story panels, a layout's seed and widgets in a free layout", () => {
    const settings = {
      panels: [{ type: "period-bars" as const, metricIds: [2, 3] }],
      canvasSeed: { template: "line" as const, metric_ids: [4], settings: {} },
      canvas: { stamp: {}, document: { store: { "shape:a": { type: "ziffr-widget", props: { metricIds: [5] } }, "shape:b": { type: "text", props: {} } } } },
    };
    expect(widgetMetricIds([1, 2], settings).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("widget metrics, nested and malformed (security pass)", () => {
  it("finds Metrics in a story nested inside a free layout, whose settings are a JSON string", () => {
    const nested = { canvas: { document: { store: { "shape:1": { type: "ziffr-widget", props: { metricIds: [7], settings: JSON.stringify({ panels: [{ metricIds: [8] }] }) } } } } } };
    expect(widgetMetricIds([], nested as never).sort()).toEqual([7, 8]);
  });
  it("yields an id no check accepts for a Metric list that is not a list, or settings that do not parse", () => {
    const bad = { canvas: { document: { store: { "shape:1": { type: "ziffr-widget", props: { metricIds: "7", settings: "{" } } } } } };
    expect(widgetMetricIds([], bad as never).some(Number.isNaN)).toBe(true);
    expect(widgetMetricIds([], { panels: [{ metricIds: { 0: 9 } }] } as never).some(Number.isNaN)).toBe(true);
  });
});

describe("deck metrics (security pass)", () => {
  it("reads a deck like a free layout and keeps the malformed marker", async () => {
    const { deckMetricIds } = await import("./visibility");
    expect(deckMetricIds({ store: { "shape:1": { type: "ziffr-widget", props: { metricIds: [3], settings: JSON.stringify({ panels: [{ metricIds: [4] }] }) } } } }).sort()).toEqual([3, 4]);
    expect(deckMetricIds({ store: { "shape:1": { type: "ziffr-widget", props: { metricIds: "3" } } } }).some(Number.isNaN)).toBe(true);
    expect(deckMetricIds(null)).toEqual([]);
  });
});
