// The `tree` mark drawn (spec 0041, ticket 11): every number in it is the one the core has for the same Metric and period; the same widget draws the same on a
// dashboard and on a deck's slide (both draw with WidgetBody from the viewer's own data); a View Link or a Snapshot carries only the widget's own Metrics, so it
// says in words that the parts are not shared and draws none of them; what cannot be drawn honestly is said in words, and the words are plain text.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { treeFromData } from "@ziffr/core/formula-tree";
import { shownSeries } from "@ziffr/core/display-periods";
import { evaluate } from "@ziffr/core/formula";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { ViewDesign } from "@ziffr/core/view-design";
import type { CanvasData, Metric, WidgetSettings } from "@ziffr/core/types";
import { WidgetBody } from "./widget-body";

const base: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const revenue = base.metrics.find((m) => m.slug === "sample-revenue")!;
const cost = base.metrics.find((m) => m.slug === "sample-cost")!;
const profit: Metric = { ...revenue, id: -90, slug: "profit", name: "Profit", formula: "{sample-revenue} - {sample-cost}", aggregation: "none" };
// A Derived Metric's series is the formula on its inputs' values in each period where both have one.
const series = (m: Metric): CanvasData["series"] => ({ ...base.series, [m.slug]: base.series["sample-revenue"].flatMap((p) => { const c = base.series["sample-cost"].find((q) => q.period === p.period); const v = c ? evaluate(m.formula!, { "sample-revenue": p.value, "sample-cost": c.value }) : null; return v === null ? [] : [{ period: p.period, value: v }]; }) });
const live: CanvasData = { ...base, metrics: [...base.metrics, profit], series: series(profit) };

const DESIGN: ViewDesign = { format: "ziffr.view/1", name: "Where it comes from", kind: "metric", slots: [{ label: "Derived Metric", metrics: "one" }], size: { w: 6, h: 6 }, options: { display: {} }, parts: [{ mark: "tree", show: "formula" }] };
const widget = (settings: WidgetSettings = {}, ids = [profit.id]) => ({ template: "design" as const, metric_ids: ids, settings: { ...settings, design: { body: DESIGN } as never } });
const draw = (w = widget(), d: CanvasData = live) => renderToStaticMarkup(<WidgetBody widget={w} data={d} />);
const alt = (html: string) => /role="img" aria-label="([^"]*)"/.exec(html)?.[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'") ?? "";
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the tree mark", () => {
  const model = treeFromData(profit, live);
  it("draws the boxes the core worked out: each number, name and the text alternative as it wrote them", () => {
    const html = draw();
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(alt(html)).toBe(model.alt);
    for (const b of model.boxes) expect(html, b.label).toContain(`<title>${b.alt.replace(/&/g, "&amp;")}</title>`);
    // The Metric's number is the one the Metric shows for the period.
    const own = shownSeries(profit, live, undefined).points.at(-1)!;
    expect(model.boxes[0].value).toBe(own.value);
    expect(textOf(html)).toContain(model.boxes[0].text);
    // Each part's number is the one its own Metric shows.
    expect(model.boxes[1].value).toBe(shownSeries(revenue, live, undefined).points.at(-1)!.value);
    expect(model.boxes[2].value).toBe(shownSeries(cost, live, undefined).points.at(-1)!.value);
    // A part taken away is hatched and carries its sign; the rule is said under the drawing, in plain text.
    expect(html).toContain('data-taken="true"');
    expect(html).toContain("fill=\"url(#");
    expect(textOf(html)).toContain("A part that is taken away is hatched");
  });

  it("is the same in a widget and on a deck's slide, which draw from the viewer's own data", () => {
    expect(draw(widget(), { ...live })).toBe(draw());
  });

  it("is drawn for the day a Snapshot is of, and not from later values", () => {
    const day = "2026-03-31";
    const html = draw(widget({ asOf: day }));
    const expected = treeFromData(profit, live, { asOf: day });
    expect(expected.ok && expected.period).toBe("March 2026");
    expect(alt(html)).toBe(expected.ok ? expected.alt : "");
    expect(alt(html)).not.toBe(alt(draw()));
  });

  it("is refused in words where the parts are not shared: a View Link or a Snapshot carries only the widget's own Metrics", () => {
    const link: CanvasData = { ...live, metrics: [profit], series: { profit: live.series.profit } };
    const html = draw(widget(), link);
    const words = "Not drawn: Profit is calculated from Metrics that are not all shared here, so its parts are not shown.";
    expect(textOf(html)).toContain(words);
    expect(html).not.toContain("<svg");
    // Nothing of the inputs goes out with it: no name, no value of Revenue or Operating cost, in any form.
    const inputs = [revenue, cost].flatMap((m) => [m.name, ...live.series[m.slug].map((p) => String(p.value))]);
    for (const leak of inputs) expect(html, leak).not.toContain(leak);
  });

  it("is refused in the same words for a person who may see the Metric but not one of its inputs, and says nothing of what it is", () => {
    const withoutCost: CanvasData = { ...live, metrics: live.metrics.filter((m) => m.id !== cost.id), series: Object.fromEntries(Object.entries(live.series).filter(([k]) => k !== "cost")) };
    const html = draw(widget(), withoutCost);
    expect(textOf(html)).toContain("Not drawn: Profit is calculated from Metrics that are not all shared here, so its parts are not shown.");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain(cost.name);
  });

  it("says in words that a Metric that is not calculated has no tree, and writes a Metric's name as text, never as markup", () => {
    expect(textOf(draw(widget({}, [revenue.id])))).toContain("Not drawn: Revenue is not calculated from other Metrics, so it has no formula to draw.");
    const odd = { ...revenue, name: "Revenue <img src=x onerror=alert(1)>" };
    const html = draw(widget(), { ...live, metrics: live.metrics.map((m) => (m.id === revenue.id ? odd : m)) });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("writes a long name whole in the text alternative and the tooltip, and cuts it with an ellipsis only in the box", () => {
    const long = "Revenue from deliveries and services in the home market and abroad, all sales channels together, before returns and discounts";
    const html = draw(widget(), { ...live, metrics: live.metrics.map((m) => (m.id === revenue.id ? { ...m, name: long } : m)) });
    expect(alt(html)).toContain(long);
    expect(html).toContain(`<title>${long} `);
    // A name that had to be cut is listed whole beneath the drawing.
    expect(textOf(html)).toContain(`Too narrow to write in the drawing: ${long}`);
  });
});

describe("the top box of a tree", () => {
  it("is always named on the drawing: too narrow for its words, they stand to its right, and the text alternative has it first", () => {
    const html = draw();
    const m = treeFromData(profit, live);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(html).toContain(`>${m.boxes[0].text}</text>`);
    expect(m.alt.indexOf(m.boxes[0].label)).toBeLessThan(m.alt.indexOf(m.boxes[1].label));
  });
});
