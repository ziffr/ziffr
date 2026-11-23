// The heatmap mark drawn (GLOSSARY: Period): every square, step and word comes from the core's model for the same
// Metric, colour is only the data tone's lightness, an empty period is an outline and a Metric by quarter says so in words.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { heatmapModel } from "@ziffr/core/heatmap-grid";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { TEMPLATES } from "@ziffr/core/widget-templates";
import type { CanvasData, Metric, WidgetSettings } from "@ziffr/core/types";
import { DesignView } from "./design-view";

const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const revenue = data.metrics.find((m) => m.name === "Revenue")!;
const churn = data.metrics.find((m) => m.name === "Churn rate")!;
const draw = (m: Metric, settings: WidgetSettings = {}, d: CanvasData = data) =>
  renderToStaticMarkup(<DesignView design={BUILT_IN_DESIGNS.heatmap} widget={{ metric_ids: [m.id], settings }} metrics={[m]} data={d} />);
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("heatmap", () => {
  it("is a Widget Template for one Metric, 8 wide and 5 high, offered as 'Heatmap'", () => {
    expect(TEMPLATES.heatmap).toMatchObject({ id: "heatmap", label: "Heatmap", kind: "metric", size: { w: 8, h: 5 }, blurb: "A grid of periods shaded by value: see the weekdays, seasons and quiet spells at a glance." });
    expect(TEMPLATES.heatmap.slots).toEqual([{ label: "Metric by day, week or month", multiple: false }]);
    expect("needsBreakdown" in TEMPLATES.heatmap).toBe(false);
  });

  it("draws one square for each place of the sample's months, with a tooltip of period and value, and the core's words", () => {
    const html = draw(revenue);
    const model = heatmapModel({ name: revenue.name, by: "month", points: data.series[revenue.slug], yearStart: 1, window: 26, lowerIsBetter: false, write: (x) => String(x) });
    if (!model.ok) throw new Error(model.reason);
    const places = model.rows.flatMap((r) => r.cells).filter(Boolean);
    expect(html.match(/<rect /g)?.length).toBe(places.length);
    expect(places.filter((c) => c!.value !== null)).toHaveLength(24);
    expect(html).toMatch(/<title>June 2026: [\d.,]+ €<\/title>/);
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="Heatmap of Revenue by month/);
    expect(words(html)).toContain("Darker is a higher value.");
    expect(words(html)).toMatch(/lowest [\d.,]+ € to highest [\d.,]+ €/);
  });

  it("shades with the data tone only, never the colours of on or off target", () => {
    const html = draw(revenue);
    expect(html).toContain("var(--color-data)");
    expect(html).not.toContain("var(--color-success)");
    expect(html).not.toContain("var(--color-error)");
  });

  it("draws a period with no value as an empty outline, never as a shade", () => {
    const series = data.series[revenue.slug].filter((p) => p.period !== "2025-11-01");
    const html = draw(revenue, {}, { ...data, series: { ...data.series, [revenue.slug]: series } });
    expect(html).toMatch(/<title>November 2025: no value<\/title>/);
    // The sample begins in July 2024, so January to June of that year are empty outlines too.
    expect(html.match(/fill="none"/g)?.length).toBe(7);
    expect(words(html)).toContain("An empty square has no value (7 periods)");
  });

  it("still says darker is a higher value, not a better one, for a Metric where lower is better", () => {
    expect(words(draw(churn))).toContain("Darker is a higher value, not a better one.");
  });

  it("says in words that it needs a Metric by day, week or month for a Metric by quarter", () => {
    const quarterly = { ...revenue, period: "quarter" as const };
    expect(words(draw(quarterly))).toContain("A heatmap needs a Metric by day, week or month.");
  });
});
