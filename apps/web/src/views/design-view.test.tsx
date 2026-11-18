// The View Design renderer (spec 0024, #147): words in a design or in the data are drawn as text, never as markup,
// and the numbers a design shows are the core's for the same Metric and span.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { shownSeries } from "@ziffr/core/display-periods";
import { formatValue } from "@ziffr/core/format";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { ViewDesign } from "@ziffr/core/view-design";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { DesignView } from "./design-view";

const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const draw = (design: ViewDesign, settings: WidgetSettings, d: CanvasData = data, ids = [d.metrics[0].id]) =>
  renderToStaticMarkup(<DesignView design={design} widget={{ metric_ids: ids, settings }} metrics={ids.map((id) => d.metrics.find((m) => m.id === id)!)} data={d} />);

describe("DesignView", () => {
  it("draws markup in a design's words and a Metric's name as text", () => {
    // Not a design that passes the checks (they refuse < and >): the renderer must be safe on its own as well.
    const hostile = { ...BUILT_IN_DESIGNS.number, parts: [{ mark: "text", content: ["<b>bold</b><script>alert(1)</script>", { show: "metric.name" }] }] } as ViewDesign;
    const d = { ...data, metrics: data.metrics.map((m, i) => (i === 0 ? { ...m, name: '<img src=x onerror="alert(1)">' } : m)) };
    const html = draw(hostile, {}, d);
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;&lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toMatch(/<(b|script|img)[\s>]/);
  });

  it.each([[undefined], ["quarter" as const], ["year" as const]])("shows the core's latest value, shown by %s", (display) => {
    const m = data.metrics[0];
    const last = shownSeries(m, data, display, {}).points.at(-1)!;
    expect(draw(BUILT_IN_DESIGNS.number, { window: 12, display })).toContain(formatValue(m, last.value, data.numberStyle));
  });

  it("lists the core's values in a history table, newest first", () => {
    const m = data.metrics[0];
    const values = shownSeries(m, data, "quarter", {}).points.slice(-4).reverse().map((p) => formatValue(m, p.value, data.numberStyle));
    const html = draw(BUILT_IN_DESIGNS.table, { rows: 4, display: "quarter" });
    const found = values.map((v) => html.indexOf(v));
    expect(found.every((i) => i >= 0)).toBe(true);
    expect([...found].sort((a, b) => a - b)).toEqual(found);
  });

  it("ignores Show by in a design that does not offer it", () => {
    const m = data.metrics[0];
    const own = shownSeries(m, data, undefined, {}).points.at(-1)!;
    expect(draw(BUILT_IN_DESIGNS.gauge, { display: "quarter" })).toContain(formatValue(m, own.value, data.numberStyle));
  });

  it("says what a design needs when a Slot is empty", () => {
    expect(draw(BUILT_IN_DESIGNS.correlation, {})).toContain("Needs two metrics with at least 6 periods in common.");
    expect(draw(BUILT_IN_DESIGNS.matrix, {})).toContain("Drop at least two metrics.");
  });
});
