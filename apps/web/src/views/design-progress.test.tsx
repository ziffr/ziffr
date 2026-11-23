// The progress mark drawn (GLOSSARY: Target Range): every name, value and word on a bar is the core's for the same
// Metric, in the order of the Slot; colour only ever means on or off target and the words say it too; ten bars fit.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { progressModel } from "@ziffr/core/progress-bars";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { TEMPLATES } from "@ziffr/core/widget-templates";
import type { CanvasData } from "@ziffr/core/types";
import { DesignView } from "./design-view";
import { WidgetBody } from "./widget-body";

const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const ids = data.metrics.map((m) => m.id);
const draw = (pick: number[], d: CanvasData = data) =>
  renderToStaticMarkup(<DesignView design={BUILT_IN_DESIGNS.progress} widget={{ metric_ids: pick, settings: {} }} metrics={pick.map((id) => d.metrics.find((m) => m.id === id)!)} data={d} />);
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("progress", () => {
  it("is an Analysis offered as 'Progress against target', 6 wide and 7 high, on a Slot of several", () => {
    expect(TEMPLATES.progress).toMatchObject({ id: "progress", label: "Progress against target", kind: "analysis", size: { w: 6, h: 7 }, blurb: "Each Metric's latest value against its target, one compact bar each." });
    expect(TEMPLATES.progress.slots).toEqual([{ label: "Metrics", multiple: true }]);
  });

  it("writes each Metric's name, latest value and words from the core, in Slot order", () => {
    const pick = [ids[2], ids[0], ids[1]];
    const model = progressModel(pick.map((id) => data.metrics.find((m) => m.id === id)!), data);
    const text = words(draw(pick));
    if (!model.ok) throw new Error(model.reason);
    const at = model.rows.map((r) => text.indexOf(`${r.name} ${r.value} ${r.words}`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("says 'No target' for a Metric without one, and puts every Metric in the text alternative", () => {
    const html = draw([ids[1]]);
    expect(words(html)).toContain("No target");
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="[^"]*No target/);
  });

  it("colours a bar red only where the value is off target, and says so in words as well", () => {
    const off = draw([ids[0]]);
    expect(off).toContain("var(--color-error)");
    expect(words(off)).toMatch(/of target, too low/);
    // Without a target nothing is coloured as good or bad.
    const plain = draw([ids[1]]);
    expect(plain).not.toContain("var(--color-error)");
    expect(plain).not.toContain("var(--color-success)");
  });

  it("holds ten Metrics in one widget, a row each, and draws through WidgetBody as the other Views do", () => {
    const many: CanvasData = { ...data, metrics: [...data.metrics, ...data.metrics.map((m) => ({ ...m, id: m.id - 10, slug: `${m.slug}-b` })), ...data.metrics.slice(0, 0)], series: { ...data.series, ...Object.fromEntries(data.metrics.map((m) => [`${m.slug}-b`, data.series[m.slug]])) } };
    const pick = many.metrics.map((m) => m.id);
    expect(pick).toHaveLength(10);
    const html = renderToStaticMarkup(<WidgetBody widget={{ template: "progress", metric_ids: pick, settings: {} }} data={many} />);
    expect(html.match(/<span class="min-w-0 truncate">/g)).toHaveLength(10);
  });

  it("says why it draws nothing for more than twelve Metrics", () => {
    const many: CanvasData = { ...data, metrics: Array.from({ length: 13 }, (_, i) => ({ ...data.metrics[0], id: 100 + i, slug: `s${i}` })) };
    expect(words(draw(many.metrics.map((m) => m.id), many))).toContain("up to 12 Metrics and this has 13");
  });
});
