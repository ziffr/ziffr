// The polar and radar marks drawn (spec 0041, ticket 10): every number on the chart is the one the core has for the
// same Metric and period, in the order given; the same widget draws the same on a dashboard, in a Snapshot, on a
// View Link and in a deck (they all draw it with WidgetBody); what the chart cannot say honestly it says in words.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { shownSeries } from "@ziffr/core/display-periods";
import { formatValue } from "@ziffr/core/format";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { ViewDesign } from "@ziffr/core/view-design";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { DesignView } from "./design-view";
import { WidgetBody } from "./widget-body";

const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const names = data.metrics.map((m) => m.id);
const radarDesign = (against?: "previous", min = 3): ViewDesign => ({
  format: "ziffr.view/1", name: "Profile", kind: "analysis", slots: [{ label: "Metrics", metrics: "several", min }], size: { w: 6, h: 8 },
  options: { window: { default: 12 } },
  parts: [{ mark: "radar", show: "latest", ...(against ? { against } : {}) }],
});
const polarDesign: ViewDesign = { format: "ziffr.view/1", name: "Pattern", kind: "metric", slots: [{ label: "Metric", metrics: "one" }], size: { w: 6, h: 8 }, options: { window: { default: 12 } }, parts: [{ mark: "polar", show: "values" }] };

const drawIn = (design: ViewDesign, ids: number[], settings: WidgetSettings, d: CanvasData = data) =>
  renderToStaticMarkup(<DesignView design={design} widget={{ metric_ids: ids, settings }} metrics={ids.map((id) => d.metrics.find((m) => m.id === id)!)} data={d} />);
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// The text alternative of the chart, the one place all of its numbers are written in order.
const alt = (html: string) => /aria-label="([^"]*)"/.exec(html)?.[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'") ?? "";
const latest = (id: number, d = data) => { const m = d.metrics.find((x) => x.id === id)!; const p = shownSeries(m, d, undefined, {}).points.at(-1)!; return { m, p, text: formatValue(m, p.value, d.numberStyle) }; };

describe("radar", () => {
  const ids = [names[3], names[0], names[1], names[4]];

  it("writes each Metric's latest value, from the data, in the order of the Slots and in its own Number Style", () => {
    const html = drawIn(radarDesign(), ids, {});
    const text = alt(html);
    const at = ids.map((id) => text.indexOf(`${latest(id).m.name}: ${latest(id).text} (`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // And as the label under each spoke name.
    for (const id of ids) expect(words(html)).toContain(`${latest(id).m.name}`);
    expect(words(html)).toContain(latest(ids[1]).text);
  });

  it("says the scale on the chart and in its text alternative, and never claims one common scale", () => {
    const html = drawIn(radarDesign(), ids, {});
    expect(words(html)).toContain("Each spoke has its own scale");
    expect(alt(html)).toContain("Each spoke has its own scale");
    expect(alt(html)).toContain("not which Metric is larger");
  });

  it("does not follow a different order of Metrics: the spokes are the order given", () => {
    const a = alt(drawIn(radarDesign(), ids, {}));
    const b = alt(drawIn(radarDesign(), [...ids].reverse(), {}));
    expect(a).not.toBe(b);
    expect(b).toContain(`spokes in this order: ${[...ids].reverse().map((id) => latest(id).m.name).join(", ")}`);
  });

  it("draws the period before as a second, dashed shape with square dots, so it is not told apart by colour alone", () => {
    const html = drawIn(radarDesign("previous"), ids, {});
    expect(html).toContain('stroke-dasharray="4 3"');
    expect(html).toContain("<rect");
    expect(words(html)).toContain("Dashed line with square dots: the period before.");
    expect(alt(html)).toContain("Period before:");
    expect(drawIn(radarDesign(), ids, {})).not.toContain("stroke-dasharray");
  });

  it("leaves a Metric without values as a gap with no shape through the centre", () => {
    const empty = { ...data, series: { ...data.series, [data.metrics[0].slug]: [] } };
    const html = drawIn(radarDesign(), ids, {}, empty);
    expect(alt(html)).toContain(`${data.metrics[0].name}: no value`);
    expect(html).not.toContain("<polygon");
    expect(words(html)).toContain("no value");
  });

  it("shows a Metric with nothing in the window as a gap, not its old value", () => {
    const m = data.metrics[0];
    const old = data.series[m.slug].slice(0, 5);
    const text = alt(drawIn(radarDesign(), ids, {}, { ...data, series: { ...data.series, [m.slug]: old } }));
    expect(text).toContain(`${latest(ids[1]).m.name}: no value in the last 12 periods`);
  });

  it("refuses fewer than 3 and more than 12 Metrics in words", () => {
    expect(words(drawIn(radarDesign(), ids.slice(0, 2), {}))).toContain("A radar needs 3 to 12 Metrics and this has 2");
    const many = Array.from({ length: 13 }, (_, i) => ({ ...data.metrics[0], id: 100 + i, slug: `m${i}`, name: `M${i}` }));
    const big = { ...data, metrics: many, series: Object.fromEntries(many.map((m) => [m.slug, data.series[data.metrics[0].slug]])) };
    expect(words(drawIn(radarDesign(), many.map((m) => m.id), {}, big))).toContain("A radar shows 3 to 12 Metrics and this has 13");
  });

  it("is the same on a dashboard, in a Snapshot, on a View Link and in a deck", () => {
    const design = radarDesign("previous");
    const widget = { template: "design" as const, metric_ids: ids, settings: { design: { id: null, body: design } } as WidgetSettings };
    const direct = drawIn(design, ids, widget.settings);
    // A View Link, a deck's slide and a Snapshot all draw a widget with WidgetBody and the data they hold.
    const link = renderToStaticMarkup(<WidgetBody widget={widget} data={data} />);
    expect(words(link)).toBe(words(direct));
    expect(alt(link)).toBe(alt(direct));
    // A Snapshot keeps its numbers: later values change nothing in it.
    const frozen = { ...data, series: Object.fromEntries(Object.entries(data.series).map(([k, v]) => [k, [...v]])) };
    const later = { ...data, series: { ...data.series, [data.metrics[0].slug]: [...data.series[data.metrics[0].slug], { period: "2026-07-01", value: 1 }] } };
    expect(alt(drawIn(design, ids, widget.settings, frozen))).toBe(alt(direct));
    expect(alt(drawIn(design, ids, widget.settings, later))).not.toBe(alt(direct));
  });
});

describe("polar", () => {
  it("draws the values around the circle in period order, each written as the core writes it, and the rim's number", () => {
    const m = data.metrics[1];
    const pts = shownSeries(m, data, undefined, {}).points.slice(-12);
    const html = drawIn(polarDesign, [m.id], {});
    const text = alt(html);
    const circle = text.slice(text.indexOf("clockwise.") + 10);
    const found = pts.map((p) => circle.indexOf(`: ${formatValue(m, p.value, data.numberStyle)}`));
    expect(found.every((i) => i >= 0)).toBe(true);
    expect(found).toEqual([...found].sort((a, b) => a - b));
    const top = formatValue(m, Math.max(...pts.map((p) => p.value)), data.numberStyle);
    expect(text).toContain(`${top} at the rim`);
    expect(words(html)).toContain("0 at the centre");
    expect(html).toContain("<polygon");
  });

  it("keeps a missing period as a gap, in its place", () => {
    const m = data.metrics[1];
    const series = data.series[m.slug].filter((p) => p.period !== "2026-03-01");
    const html = drawIn(polarDesign, [m.id], {}, { ...data, series: { ...data.series, [m.slug]: series } });
    expect(alt(html)).toMatch(/Mar[^:]*: no value/);
    expect(html).not.toContain("<polygon");
  });

  it("draws a recipe's series with the number the recipe worked out, written in its unit", () => {
    const design: ViewDesign = {
      ...polarDesign,
      analysis: { format: "ziffr.analysis/1", name: "Average", slots: [{ label: "Metric" }], steps: [{ id: "avg", fn: "movingAverage", of: "slot1", window: 3 }], outputs: [{ step: "avg", label: "Three-period average", unit: "metric" }] },
      parts: [{ mark: "polar", show: "recipe.avg" }],
    };
    const m = data.metrics[1];
    const own = shownSeries(m, data, undefined, {}).points;
    const avg = (i: number) => (own[i - 2].value + own[i - 1].value + own[i].value) / 3;
    const html = drawIn(design, [m.id], {});
    expect(alt(html)).toContain(`Three-period average, as a polar plot of 12 periods`);
    expect(alt(html)).toContain(`: ${formatValue(m, avg(own.length - 1), data.numberStyle)}`);
  });

  it("keeps a gap at the start of the window in its place", () => {
    const m = data.metrics[1];
    const series = data.series[m.slug].filter((p) => p.period !== "2025-07-01");
    const text = alt(drawIn(polarDesign, [m.id], {}, { ...data, series: { ...data.series, [m.slug]: series } }));
    expect(text).toContain("Jul 25: no value");
    expect(text).toContain("polar plot of 12 periods");
  });

  it("refuses a value below 0 and more periods than it can show, in words", () => {
    const m = data.metrics[1];
    const negative = { ...data, series: { ...data.series, [m.slug]: data.series[m.slug].map((p, i) => (i === data.series[m.slug].length - 1 ? { ...p, value: -5 } : p)) } };
    expect(words(drawIn(polarDesign, [m.id], {}, negative))).toContain("cannot show a value below 0");
    expect(words(drawIn(polarDesign, [m.id], { window: 24 }))).toContain("A polar plot shows 3 to 12 periods");
  });
});
