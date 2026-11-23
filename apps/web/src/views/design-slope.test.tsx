// The slope mark drawn (GLOSSARY: Breakdown): every name, value and word comes from the core for the same Metrics,
// the direction is in words at both ends and never in colour, and a chart it cannot draw says why in plain text.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { slopeModel } from "@ziffr/core/slope-chart";
import { TEMPLATES } from "@ziffr/core/widget-templates";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { DesignView } from "./design-view";
import { WidgetBody } from "./widget-body";

const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const byName = (name: string) => data.metrics.find((m) => m.name === name)!;
const revenue = byName("Revenue");
const cost = byName("Operating cost");
const orders = byName("Orders");
const draw = (ids: number[], settings: WidgetSettings = {}, d: CanvasData = data) =>
  renderToStaticMarkup(<DesignView design={BUILT_IN_DESIGNS.slope} widget={{ metric_ids: ids, settings }} metrics={ids.map((id) => d.metrics.find((m) => m.id === id)!)} data={d} />);
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("slope", () => {
  it("is an Analysis offered as 'Slope chart', 6 wide and 8 high, on a Slot of several, and needs no Breakdown", () => {
    expect(TEMPLATES.slope).toMatchObject({ id: "slope", label: "Slope chart", kind: "analysis", size: { w: 6, h: 8 }, blurb: "Two moments side by side: who rose and who fell between them." });
    expect(TEMPLATES.slope.slots).toEqual([{ label: "Metrics", multiple: true }]);
    expect("needsBreakdown" in TEMPLATES.slope).toBe(false);
    expect(TEMPLATES.slope.settings).toEqual({ slope: "auto" });
  });

  it("draws the rows of a Breakdown with both ends labelled in words, from the core's model", () => {
    const html = draw([revenue.id], { slope: "previous" });
    const model = slopeModel([revenue], data, "previous");
    if (!model.ok) throw new Error(model.reason);
    const text = words(html);
    for (const r of model.rows) {
      expect(text).toContain(r.name);
      expect(text).toContain(r.beforeText!);
      expect(text).toContain(r.afterText!);
      expect(text).toContain(r.change);
    }
    expect(text).toContain(model.beforeLabel);
    expect(text).toContain(model.afterLabel);
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="Slope chart of 5 rows/);
  });

  it("highlights only the largest rise and the largest fall, in the accent and in words, every other line in the data tone", () => {
    const model = slopeModel([revenue], data, "previous");
    if (!model.ok) throw new Error(model.reason);
    const marked = model.rows.filter((r) => r.mark).length;
    const html = draw([revenue.id], { slope: "previous" });
    expect(html.match(/Largest (rise|fall)/g)?.length ?? 0).toBe(marked);
    expect(marked).toBeLessThanOrEqual(2);
    expect(html.match(/<line[^>]*stroke="var\(--color-accent\)"/g)?.length ?? 0).toBe(marked);
    expect(html.match(/<line[^>]*stroke="var\(--color-data\)"/g)?.length ?? 0).toBe(model.rows.length - marked);
  });

  it("never uses the colours that mean on or off target", () => {
    const html = draw([revenue.id], { slope: "previous" });
    expect(html).not.toContain("var(--color-success)");
    expect(html).not.toContain("var(--color-error)");
  });

  it("compares several Metrics of one unit as they were placed, and a year earlier for rows on request", () => {
    const html = draw([revenue.id, cost.id]);
    // A long name may be cut where it is drawn, but the text alternative has it whole.
    expect(html).toMatch(/aria-label="[^"]*Operating cost: 77\.058 € to 78\.840 €/);
    expect(words(draw([revenue.id], { slope: "year" }))).toContain("Jun 25 Jun 26");
  });

  it("refuses Metrics in different units in plain text", () => {
    expect(words(draw([revenue.id, orders.id]))).toContain("Slope charts compare Metrics in one unit");
  });

  it("asks for a Metric with a Breakdown, or several, when one Metric has none", () => {
    expect(words(draw([cost.id]))).toContain("Choose a Metric with a Breakdown, or several Metrics in one unit");
  });

  it("draws through WidgetBody as the other Views do", () => {
    const html = renderToStaticMarkup(<WidgetBody widget={{ template: "slope", metric_ids: [revenue.id], settings: { slope: "previous" } }} data={data} />);
    expect(words(html)).toContain("North");
  });
});
