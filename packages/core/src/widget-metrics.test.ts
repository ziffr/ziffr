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
