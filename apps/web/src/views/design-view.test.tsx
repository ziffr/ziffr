// The View Design renderer (spec 0024, #147): words in a design or in the data are drawn as text, never as markup,
// and the numbers a design shows are the core's for the same Metric and span.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { shownSeries } from "@ziffr/core/display-periods";
import { formatPercent, formatValue } from "@ziffr/core/format";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { ViewDesign } from "@ziffr/core/view-design";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { DesignView } from "./design-view";
import { HIDDEN_TAKEAWAYS, TakeawayHostProvider } from "./takeaway-host";
import { designWithRecipe } from "@ziffr/core/design-files";
import { BUILT_IN_RECIPES } from "@ziffr/core/built-in-recipes";
import { growth, mean } from "@ziffr/core/recipe-functions";

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

  it("names a Condensed Value in the table by what it was made from", () => {
    const m = data.metrics[0];
    const condensed = [{ period: "2019-01-01", periodEnd: "2019-03-31", into: "quarter" as const, held: 3, of: 3, sum: "60", last: null, target: null, locked: false, condensedOn: "2026-06-01" }];
    const d = { ...data, condensed: { [m.id]: condensed } };
    const text = draw(BUILT_IN_DESIGNS.table, { rows: 50 }, d).replace(/<[^>]+>/g, " ");
    expect(text).toContain("condensed from 3 months");
    // Without any, nothing of the kind.
    expect(draw(BUILT_IN_DESIGNS.table, { rows: 50 })).not.toContain("condensed");
  });

  it("ignores Show by in a design that does not offer it", () => {
    const m = data.metrics[0];
    const own = shownSeries(m, data, undefined, {}).points.at(-1)!;
    expect(draw(BUILT_IN_DESIGNS.gauge, { display: "quarter" })).toContain(formatValue(m, own.value, data.numberStyle));
  });

  it("writes a recipe's outputs as the core computes them, from the widget's own Metric only", () => {
    const design = designWithRecipe(BUILT_IN_RECIPES.growth);
    const m = data.metrics[0];
    const own = shownSeries(m, data, undefined, {}).points.map((p) => ({ period: p.period, value: p.value }));
    const avg = mean((growth(own) as { points: typeof own }).points);
    const html = draw(design, { window: 12 });
    expect(html.replace(/<[^>]+>/g, "")).toContain(`Average growth: ${formatPercent((avg as { value: number }).value, data.numberStyle)}`);
    // Another Metric's values on the same page change nothing: the recipe never sees them.
    const other = { ...data, series: { ...data.series, [data.metrics[1].slug]: [] } };
    expect(draw(design, { window: 12 }, other)).toBe(html);
  });

  it("says what a design needs when a Slot is empty", () => {
    expect(draw(BUILT_IN_DESIGNS.correlation, {})).toContain("Needs two metrics with at least 6 periods in common.");
    expect(draw(BUILT_IN_DESIGNS.matrix, {})).toContain("Drop at least two metrics.");
  });
});

describe("DesignView Takeaway words", () => {
  const settings: WidgetSettings = { window: 18 };
  const drawIn = (host: Parameters<typeof TakeawayHostProvider>[0]["value"]) =>
    renderToStaticMarkup(
      <TakeawayHostProvider value={host}>
        <DesignView design={BUILT_IN_DESIGNS.forecast} widget={{ metric_ids: [data.metrics[0].id], settings }} metrics={[data.metrics[0]]} data={data} />
      </TakeawayHostProvider>,
    );
  const panelHost = { mode: "panel" as const, open: false, setOpen: () => {}, setHas: () => {} };

  it("draws them under the chart where no card hosts them (a deck's slide)", () => {
    expect(draw(BUILT_IN_DESIGNS.forecast, settings)).toContain("it is not a promise");
  });

  it("leaves them out of a card that hides them, and of a card that opens them from its menu", () => {
    expect(drawIn(HIDDEN_TAKEAWAYS)).not.toContain("not a promise");
    expect(drawIn(panelHost)).not.toContain("not a promise");
    expect(drawIn(HIDDEN_TAKEAWAYS)).not.toContain("Show the numbers");
  });
});
