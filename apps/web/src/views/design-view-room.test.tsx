// A widget with room to spare (#778): its parts share a large card's space; a usual one is drawn as before.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { ViewDesign } from "@ziffr/core/view-design";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { DesignView } from "./design-view";
import { WidgetScaleProvider } from "./widget-scale";

const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const draw = (design: ViewDesign, scale: number, settings: WidgetSettings = { window: 12 }) =>
  renderToStaticMarkup(
    <WidgetScaleProvider value={scale}>
      <DesignView design={design} widget={{ metric_ids: [data.metrics[0].id], settings }} metrics={[data.metrics[0]]} data={data} />
    </WidgetScaleProvider>,
  );

describe("DesignView with room to spare", () => {
  it("keeps the headline's sparkline a fixed strip in a usual widget", () => {
    const html = draw(BUILT_IN_DESIGNS.number, 1);
    expect(html).toContain("mt-auto h-[calc(3rem*var(--widget-scale,1))]");
    expect(html).not.toContain("justify-center");
  });

  it("lets the sparkline take the free height, between two shapes, in a large widget", () => {
    const html = draw(BUILT_IN_DESIGNS.number, 2.5);
    expect(html).toContain("max-h-[45cqw] min-h-[max(calc(3rem*var(--widget-scale,1)),8cqw)] flex-1");
    expect(html).toContain("flex h-full flex-col justify-center");
  });

  it("spreads a history table's rows over the free height in a large widget only", () => {
    expect(draw(BUILT_IN_DESIGNS.table, 1, { rows: 4 })).not.toContain("height:min(100%");
    expect(draw(BUILT_IN_DESIGNS.table, 3, { rows: 4 })).toContain("height:min(100%, 12em)");
  });

  it("grows the value under a gauge with the card in a large widget only", () => {
    expect(draw(BUILT_IN_DESIGNS.gauge, 1)).not.toContain("6cqw");
    expect(draw(BUILT_IN_DESIGNS.gauge, 2)).toContain("6cqw");
  });

  it("names the sparkline's first and last period once it has room for its context (#782), not before", () => {
    const ends = "flex items-baseline justify-between";
    expect(draw(BUILT_IN_DESIGNS.number, 1.25)).not.toContain(ends);
    expect(draw(BUILT_IN_DESIGNS.number, 1.6)).toContain(ends);
  });

  it("centres a number without its sparkline both ways when it has room (#789), and keeps it left in a usual widget", () => {
    const one = { ...data, series: { ...data.series, [data.metrics[0].slug]: data.series[data.metrics[0].slug].slice(-1) } };
    const at = (scale: number) => renderToStaticMarkup(
      <WidgetScaleProvider value={scale}>
        <DesignView design={BUILT_IN_DESIGNS.number} widget={{ metric_ids: [data.metrics[0].id], settings: { window: 12 } }} metrics={[data.metrics[0]]} data={one} />
      </WidgetScaleProvider>,
    );
    expect(at(2)).toContain("items-center text-center");
    expect(at(1)).not.toContain("items-center text-center");
    expect(draw(BUILT_IN_DESIGNS.number, 2)).not.toContain("items-center text-center");
  });
});
