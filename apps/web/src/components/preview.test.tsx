// Every built-in Widget Template draws a Preview from Sample Data alone (spec 0011, ticket #166).
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@ziffr/core/widget-templates";
import type { TemplateId } from "@ziffr/core/types";

import { sampleCanvasData } from "@ziffr/core/sample-data";
import { templatesFor } from "@ziffr/core/widget-templates";
import { Preview, TemplatePreview } from "./preview";

describe("Preview", () => {
  // A Slide Element is no Widget: it is offered in the deck editor only and has no Preview.
  it.each((Object.keys(TEMPLATES) as TemplateId[]).filter((id) => id !== "design" && id !== "slide"))("draws %s with Sample Data", (id) => {
    const html = renderToString(<TemplatePreview numberStyle={"1,234.5"} template={id} viewer="v" />);
    expect(html).toContain(`data-preview="${id}"`);
    expect(html).toContain("Sample data");
    expect(html).not.toContain("No access to this metric");
    expect(html).not.toContain("aria-busy");
  });

  // A phone's Gallery card: the widget is laid out at the card's width, so its words keep their size.
  it("lays a widget out at the width given instead of scaling it down", () => {
    const html = renderToString(<TemplatePreview numberStyle={"1,234.5"} template="line" viewer="v" width={300} reflow />);
    expect(html).toContain("scale(1)");
    expect(html).toContain("Sample data");
  });

  it("keeps a table view wide enough for its columns, scaled to the card", () => {
    const html = renderToString(<TemplatePreview numberStyle={"1,234.5"} template="scoreboard" viewer="v" width={210} reflow />);
    expect(html).toContain("scale(0.5)");
  });

  it("draws a team template without the metrics it was made with", () => {
    const t = { view: "number" as const, w: 3, h: 4, slots: [{ label: "Revenue", multiple: false, exampleIds: [41] }], body: { metricSlots: [0], settings: { window: 12 } } };
    const html = renderToString(<TemplatePreview numberStyle={"1,234.5"} template={t} viewer="v" />);
    expect(html).toContain("Revenue");
    expect(html).not.toContain("No access to this metric");
  });
});

describe("Preview in Change view", () => {
  // Stands in for a page's own data: the restyle Preview draws the widget's metrics, only the template changes.
  const data = sampleCanvasData("v", "1,234.5");
  const widget = { template: "line" as const, metric_ids: [data.metrics[0].id], settings: { window: 12, showTarget: true, compare: [] }, title: null };

  it.each(templatesFor(true).map((t) => t.id))("redraws a line widget as %s with its own metrics and settings", (id) => {
    const html = renderToString(<Preview widget={{ ...widget, template: id }} data={data} size={TEMPLATES[id].size} />);
    expect(html).toContain(`data-preview="${id}"`);
    expect(html).not.toContain("No access to this metric");
    expect(html).not.toContain("Sample data");
  });
});
