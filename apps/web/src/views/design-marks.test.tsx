// The marks `range` and `bridge` (spec 0041, ticket 9; GLOSSARY: View Design, Snapshot, View Link): the number drawn is the number the core
// gave, and it is the same in a widget, a Snapshot, a View Link and a deck slide, which all draw a widget by the one renderer from the figures
// the core wrote once. A Metric the person may not see is never drawn. Words of the recipe are drawn as text, apart from the figures.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { drawRecipe } from "@ziffr/core/design-analysis";
import { nativeForm } from "@ziffr/core/design-export";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { dataAsOf } from "@ziffr/core/snapshot-periods";
import type { ViewDesign } from "@ziffr/core/view-design";
import type { CanvasData, Widget, WidgetSettings } from "@ziffr/core/types";
import { WidgetBody } from "./widget-body";

const live: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const metrics = live.metrics.slice(0, 4);
const DESIGN: ViewDesign = {
  format: "ziffr.view/1",
  name: "What changed",
  kind: "analysis",
  slots: [{ label: "Revenue", metrics: "one" }, { label: "Orders", metrics: "one" }, { label: "Cost", metrics: "one" }, { label: "Churn", metrics: "one" }],
  size: { w: 6, h: 6 },
  analysis: {
    format: "ziffr.analysis/2",
    name: "What changed",
    slots: [{ label: "Revenue" }, { label: "Orders" }, { label: "Cost" }, { label: "Churn" }],
    steps: [{ id: "br", fn: "bridge", of: "slot1", parts: ["slot2", "slot3"] }, { id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3", "slot4"] }, { id: "ef", fn: "effects", of: "m" }],
    outputs: [{ step: "br", label: "What changed <b>since</b>", shows: "table" }, { step: "ef", label: "Effects", shows: "table" }],
  },
  parts: [{ mark: "bridge", show: "recipe.br" }, { mark: "range", show: "recipe.ef" }],
};
const widget = (settings: WidgetSettings = {}, ids = metrics.map((m) => m.id)): Pick<Widget, "template" | "metric_ids" | "settings"> => ({ template: "design", metric_ids: ids, settings: { ...settings, design: { body: DESIGN } as never } });
const draw = (w = widget(), d: CanvasData = live) => renderToStaticMarkup(<WidgetBody widget={w} data={d} />);
// What a screen reader gets: the sentence of each picture, as the page wrote it.
const labels = (html: string) => [...html.matchAll(/role="img" aria-label="([^"]*)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'"));
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the bridge and range marks", () => {
  const core = drawRecipe(DESIGN, metrics, live, {}).figures;
  it("draw the figures the core wrote: every number, with its sign, in the Number Style", () => {
    const html = draw();
    const bridge = core.br;
    const range = core.ef;
    expect(bridge.ok && range.ok).toBe(true);
    if (!bridge.ok || bridge.mark !== "bridge" || !range.ok || range.mark !== "range") return;
    expect(labels(html)).toEqual([bridge.alt, range.alt]);
    const text = textOf(html);
    for (const s of bridge.steps) expect(text, s.label).toContain(s.text);
    for (const r of range.rows) expect(text, r.label).toContain(`${r.lowText} – ${r.highText}`);
    // A fall is written with its minus, never by colour alone.
    expect(bridge.steps.filter((s) => s.direction === "down").every((s) => s.text.startsWith("−"))).toBe(true);
    expect(html.includes('data-direction="down"')).toBe(bridge.steps.some((s) => s.direction === "down"));
  });
  it("draws a fall hanging down, hatched and written with its minus", () => {
    // Orders fall in the latest period.
    const orders = live.series[metrics[1].slug];
    const fell = { ...live, series: { ...live.series, [metrics[1].slug]: orders.map((p, i) => (i === orders.length - 1 ? { ...p, value: orders[i - 1].value - 5 } : p)) } };
    const html = draw(widget(), fell);
    const bridge = drawRecipe(DESIGN, metrics, fell, {}).figures.br;
    const down = bridge.ok && bridge.mark === "bridge" ? bridge.steps.filter((s) => s.direction === "down") : [];
    expect(down.map((s) => s.label)).toContain(metrics[1].name);
    expect(down.every((s) => s.text.startsWith("−"))).toBe(true);
    expect(html).toContain('data-direction="down"');
    expect(html).toContain("repeating-linear-gradient");
    expect(textOf(html)).toContain(down[0].text);
  });
  it("say the recipe's own words as plain text, small and apart from the figures", () => {
    const html = draw();
    expect(html).toContain("What changed &lt;b&gt;since&lt;/b&gt;");
    expect(html).not.toMatch(/<b>since/);
    expect(html).toMatch(/<p class="widget-text-xs text-muted-foreground">What changed/);
  });
  it("are the same number in a widget, a Snapshot, a View Link and a deck slide", () => {
    const widgetHtml = draw();
    // A View Link carries the widget's Metrics and nothing else of the Workspace.
    const link = { ...live, metrics, series: Object.fromEntries(metrics.map((m) => [m.slug, live.series[m.slug]])) };
    expect(draw(widget(), link)).toBe(widgetHtml);
    // PowerPoint gets a picture of the widget as the app draws it, not a chart of its own.
    expect(nativeForm(DESIGN, {})).toBe("picture");
    // A Snapshot draws the values of its day: what the core gives for that day is what is drawn, and a later day's data does not leak in.
    const day = "2026-03-31";
    const snapshot = draw(widget({ asOf: day }));
    const expected = drawRecipe(DESIGN, metrics, dataAsOf(live, day), { asOf: day }).figures.br;
    expect(expected.ok).toBe(true);
    expect(labels(snapshot)[0]).toBe(expected.ok ? expected.alt : "");
    expect(labels(snapshot)[0]).not.toBe(labels(widgetHtml)[0]);
    // The same Snapshot drawn on a deck slide (from the live data, cut by its day) is the same.
    expect(draw(widget({ asOf: day }), link)).toBe(snapshot);
  });
  it("never draw a Metric the person may not see: the widget says so and gives no figure", () => {
    const hidden = { ...live, metrics: live.metrics.filter((m) => m.id !== metrics[1].id) };
    const html = draw(widget(), hidden);
    expect(textOf(html)).toContain("No access to this metric");
    expect(labels(html)).toEqual([]);
  });
  it("say in words why a table is not drawn", () => {
    const short = { ...live, series: Object.fromEntries(Object.entries(live.series).map(([k, v]) => [k, v.slice(0, 1)])) };
    const html = draw(widget(), short);
    expect(textOf(html)).toContain(`${metrics[0].name} needs a value in two periods that follow one another to draw what changed.`);
    expect(labels(html)).toEqual([]);
  });
});

describe("the forecast's range as an interval", () => {
  const design: ViewDesign = { ...DESIGN, analysis: undefined, kind: "metric", slots: [{ label: "Metric", metrics: "one" }], options: { showForecast: { default: true } }, parts: [{ mark: "plot", axes: "regular", scale: "padded", marks: [{ mark: "line", show: "values" }, { mark: "range", show: "forecast.range", centre: true }] }] };
  it("says its numbers in words beside the drawing: the forecast and the range it is likely between", () => {
    const html = renderToStaticMarkup(<WidgetBody widget={{ template: "design", metric_ids: [metrics[0].id], settings: { window: 18, design: { body: design } as never } }} data={live} />);
    expect(labels(html)[0]).toMatch(/, forecast [^,]+, likely between [^,]+ and /);
  });
});
