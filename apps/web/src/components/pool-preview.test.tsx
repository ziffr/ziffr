// The Metric Preview of the Pool (GLOSSARY: Preview, Target Series, Target Range): its trend line is coloured by the
// target in effect for the latest value's period, as Attainment judges it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { CanvasData, Metric } from "@ziffr/core/types";
import { Sparkline } from "@/views/sparkline";
// The Pool around the Preview reaches server actions, which are not drawn here.
vi.mock("@/app/canvas-actions", () => ({}));
vi.mock("./template-menu", () => ({ TemplateMenu: () => null }));
vi.mock("./template-browser", () => ({ BROWSE_TEMPLATES: {}, TemplateBrowser: () => null }));
vi.mock("./preview", () => ({ TemplatePreview: () => null, Preview: () => null }));
import { MetricPreview } from "./pool";

const sample = sampleCanvasData("v", "1.234,5");
// Higher is better, with a Target Range the latest value meets.
const metric: Metric = { ...sample.metrics[0], polarity: "higher", target_min: 1, target_max: null };
const points = sample.series[metric.slug];
const last = points[points.length - 1];
const line = (tone: "good" | "bad") => renderToStaticMarkup(<Sparkline points={points.slice(-24)} height={36} tone={tone} />);
const draw = (targets: CanvasData["targets"]) => renderToStaticMarkup(<MetricPreview metric={metric} data={{ ...sample, targets }} />);

describe("Metric Preview", () => {
  it("colours the trend by the Target Series where the latest value's period has a target", () => {
    expect(draw({ [metric.id]: [{ period: last.period, value: last.value * 2 }] })).toContain(line("bad"));
  });

  it("falls back to the Target Range where the Target Series covers other periods only", () => {
    expect(draw({ [metric.id]: [{ period: "2020-01-01", value: last.value * 2 }] })).toContain(line("good"));
  });
});
