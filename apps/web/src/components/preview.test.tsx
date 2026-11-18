// Every built-in Widget Template draws a Preview from Sample Data alone (spec 0011, ticket #166).
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@ziffr/core/widget-templates";
import type { TemplateId } from "@ziffr/core/types";

import { sampleCanvasData } from "@ziffr/core/sample-data";
import { templatesFor } from "@ziffr/core/widget-templates";
import { Preview, TemplatePreview } from "./preview";

describe("Preview", () => {
  it.each(Object.keys(TEMPLATES) as TemplateId[])("draws %s with Sample Data", (id) => {
    const html = renderToString(<TemplatePreview numberStyle={"1,234.5"} template={id} viewer="v" />);
    expect(html).toContain(`data-preview="${id}"`);
    expect(html).toContain("Sample data");
    expect(html).not.toContain("No access to this metric");
    expect(html).not.toContain("aria-busy");
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
