// A view with nothing to draw (GLOSSARY: Widget, Submitter): words instead of bare axes, the way to record only where a
// page offers it, and nothing that tells values kept from the viewer apart from values that do not exist.
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS, DESIGNED_VIEWS } from "@ziffr/core/built-in-designs";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { CanvasData, Metric, WidgetSettings } from "@ziffr/core/types";
import { DesignView } from "./design-view";
import { MetricChart } from "./metric-chart";
import { RecordActionContext } from "./no-values-note";
import { firstValueWords, NOTHING_TO_SHOW, recordLabel } from "./no-values-words";

const full: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const [a, b] = full.metrics;
const empty: CanvasData = { ...full, series: {}, condensed: {}, targets: {}, projections: {}, breakdowns: {} };
const draw = (template: (typeof DESIGNED_VIEWS)[number], data: CanvasData, metrics: Metric[] = [a, b], settings: WidgetSettings = {}, offered = false) => {
  const view: ReactNode = <DesignView design={BUILT_IN_DESIGNS[template]} widget={{ metric_ids: metrics.map((m) => m.id), settings, template }} metrics={metrics} data={data} />;
  return renderToStaticMarkup(offered ? <RecordActionContext value={() => <button>record</button>}>{view}</RecordActionContext> : view);
};

describe("a view with no values", () => {
  it.each(DESIGNED_VIEWS.filter((t) => t !== "scoreboard" && t !== "progress"))("%s says so in words, with no axis and no button", (template) => {
    const html = draw(template, empty);
    expect(html).toContain(NOTHING_TO_SHOW);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("recharts");
    expect(html).not.toContain("<svg");
  });

  it("names the view and gives the action to someone a page offers it to", () => {
    const html = draw("line", empty, [a], {}, true);
    expect(html).toContain(firstValueWords("line"));
    expect(html).toContain("<button>record</button>");
  });

  it("offers nothing on a view frozen at an earlier date", () => {
    const html = draw("line", empty, [a], { asOf: "2026-01-01" }, true);
    expect(html).toContain(NOTHING_TO_SHOW);
    expect(html).not.toContain("<button");
  });

  it("reads the same whatever else the data holds about the Metric", () => {
    // Values that were never sent to this viewer and values that do not exist are the same empty series.
    expect(draw("number", { ...empty, targets: full.targets, projections: full.projections }, [a])).toBe(draw("number", empty, [a]));
  });

  it("draws as before once one of its Metrics has a value", () => {
    expect(draw("line", { ...empty, series: { [a.slug]: full.series[a.slug] } })).not.toContain(NOTHING_TO_SHOW);
  });

  it("keeps a Total's own reason", () => {
    const total = { ...a, total: { note: "Not all in: 1 of 2" } } as Metric;
    const html = draw("number", empty, [total], {}, true);
    expect(html).toContain("Not all in: 1 of 2");
  });

  it("draws no bare chart", () => {
    const html = renderToStaticMarkup(<MetricChart metric={a} points={[]} yearStart={full.yearStart} numberStyle={full.numberStyle} />);
    expect(html).toContain(NOTHING_TO_SHOW);
    expect(html).not.toContain("recharts");
  });

  it("asks about today only for a daily Metric", () => {
    expect(recordLabel("day")).toBe("Record today's value");
    expect(recordLabel("month")).toBe("Record a value");
  });
});
