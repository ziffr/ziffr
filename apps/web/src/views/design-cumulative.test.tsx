// The cumulative mark drawn (GLOSSARY: Target Series): every number on the chart is the one the core has for the same
// Metric, written in its Number Style; a Metric that does not add up is told so in words; the plan can be switched off.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { runningTotal } from "@ziffr/core/running-total";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { DesignView } from "./design-view";

const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const [revenue, , , churn] = data.metrics;
const draw = (m: typeof revenue, settings: WidgetSettings = { showTarget: true }) =>
  renderToStaticMarkup(<DesignView design={BUILT_IN_DESIGNS["running-total"]} widget={{ metric_ids: [m.id], settings }} metrics={[m]} data={data} />);
const alt = (html: string) => /aria-label="([^"]*)"/.exec(html)?.[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'") ?? "";

describe("the running total drawn", () => {
  it("writes what the core worked out, in order, in its text alternative", () => {
    const model = runningTotal({ metric: revenue, points: data.series[revenue.slug], targets: data.targets[revenue.id], yearStart: data.yearStart, today: "2026-06-20", style: data.numberStyle });
    if (!model.ok) throw new Error(model.reason);
    const html = draw(revenue);
    expect(alt(html)).toBe(model.alt);
    for (const l of model.lines) expect(html).toContain(`${l.name} ${l.end}`);
    expect(html).toContain(model.lines[0].words!.split(", ")[0]);
    expect(html).toContain("still running");
  });

  it("draws the plan only while the option is on", () => {
    expect(draw(revenue)).toContain('data-line="plan"');
    expect(draw(revenue, { showTarget: false })).not.toContain('data-line="plan"');
    expect(draw(revenue, { showTarget: false })).not.toContain("of plan");
  });

  it("tells a Metric that does not add up, in words, and draws no chart", () => {
    const html = draw(churn);
    expect(html).toContain("A running total needs a Metric that adds up over the year (its Aggregation is sum).");
    expect(html).not.toContain("<svg");
  });
});
