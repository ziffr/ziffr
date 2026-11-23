// The pareto mark drawn (GLOSSARY: Breakdown): every bar, share and word is the core's for the same Breakdown; a
// Breakdown it cannot honestly draw says so in words; the picture has a text equivalent.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { compactValue } from "@ziffr/core/format";
import { paretoModel } from "@ziffr/core/pareto";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { TEMPLATES, templatesFor } from "@ziffr/core/widget-templates";
import type { CanvasData } from "@ziffr/core/types";
import { DesignView } from "./design-view";
import { WidgetBody } from "./widget-body";

const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const withRows = data.metrics.find((m) => data.breakdowns[m.id])!;
const draw = (d: CanvasData = data) =>
  renderToStaticMarkup(<DesignView design={BUILT_IN_DESIGNS.pareto} widget={{ metric_ids: [withRows.id], settings: {} }} metrics={[withRows]} data={d} />);
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const latestRows = (d: CanvasData) => { const by = d.breakdowns[withRows.id]; return by[Object.keys(by).sort().at(-1)!]; };
const withBreakdown = (rows: { label: string; value: number }[]): CanvasData => ({ ...data, breakdowns: { ...data.breakdowns, [withRows.id]: { "2026-06-01": rows } } });

describe("pareto", () => {
  it("is a Metric View that needs a Breakdown, 6 wide and 7 high, offered only for a Metric that has one", () => {
    expect(TEMPLATES.pareto).toMatchObject({ id: "pareto", label: "Pareto", kind: "metric", needsBreakdown: true, size: { w: 6, h: 7 } });
    expect(templatesFor(true).map((t) => t.id)).toContain("pareto");
    expect(templatesFor(false).map((t) => t.id)).not.toContain("pareto");
  });

  it("has Sample Data with enough rows to show a curve", () => {
    expect(latestRows(data).length).toBeGreaterThanOrEqual(6);
  });

  it("writes the bars largest first with their values and the caption, from the core's model", () => {
    const model = paretoModel({ name: withRows.name, rows: latestRows(data), write: (x) => compactValue(withRows, x, data.numberStyle) });
    if (!model.ok) throw new Error(model.reason);
    const text = words(draw());
    for (const b of model.bars) expect(text).toContain(b.text);
    expect(text).toContain(model.caption);
    const order = model.bars.map((b) => text.indexOf(b.label));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("is one picture with a text alternative that lists every bar and its running share", () => {
    const html = draw();
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="Pareto of [^"]*make up 80 %[^"]*so far/);
  });

  it("groups past ten rows into a muted Other bar", () => {
    const html = draw(withBreakdown(Array.from({ length: 13 }, (_, i) => ({ label: `Cause ${i + 1}`, value: 100 - i * 5 }))));
    expect(words(html)).toContain("Other");
    expect(words(html)).not.toContain("Cause 11");
    expect(html).toContain("var(--color-rule-2)");
  });

  it("refuses a Breakdown with a negative row in plain words", () => {
    const html = draw(withBreakdown([{ label: "A", value: 5 }, { label: "B", value: -2 }]));
    expect(words(html)).toContain("Pareto needs positive rows");
    expect(html).not.toContain("<svg");
  });

  it("says so for a Metric without a Breakdown, and draws through WidgetBody as the other Views do", () => {
    const without = data.metrics.find((m) => !data.breakdowns[m.id])!;
    const html = renderToStaticMarkup(<WidgetBody widget={{ template: "pareto", metric_ids: [without.id], settings: {} }} data={data} />);
    expect(words(html)).toContain("has no breakdown yet");
    const drawn = renderToStaticMarkup(<WidgetBody widget={{ template: "pareto", metric_ids: [withRows.id], settings: {} }} data={data} />);
    expect(drawn).toContain("<svg");
  });
});
