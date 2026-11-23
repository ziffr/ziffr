// A built-in view made with real Metrics (ticket #861; GLOSSARY: Widget Template, Sample Data, Preview): the Gallery draws each view
// the way its Preview does, with the person's own Metric where the sample one stood. Pure, so it is tested without a browser.
import { sampleWidget } from "@ziffr/core/sample-data";
import type { Period, TemplateId, WidgetSettings } from "@ziffr/core/types";
import type { FrameWidget } from "@/components/read-only-frame";

/** The Metric ids a sample widget was made with, in order of first use: what a real Metric stands in for. */
function sampleIds(w: FrameWidget): number[] {
  const found: number[] = [];
  const note = (n: unknown) => { if (typeof n === "number" && n < 0 && !found.includes(n)) found.push(n); };
  w.metric_ids.forEach(note);
  (function walk(x: unknown) {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { if (k === "metricIds" && Array.isArray(v)) v.forEach(note); else walk(v); }
  })(w.settings);
  return found;
}

/** A built-in view made with real Metrics in place of the sample ones: the first Metric where the sample used its first, the
 * second where it used its second, and so on, the Metrics wrapping round when a view takes more than were picked. */
export function widgetWith(template: TemplateId, real: number[], period: Period): FrameWidget {
  const sample = sampleWidget(template, period);
  if (!real.length) return sample;
  const order = sampleIds(sample);
  const map = (n: number) => real[Math.max(0, order.indexOf(n)) % real.length];
  const swap = (x: unknown): unknown => Array.isArray(x) ? x.map(swap) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "metricIds" && Array.isArray(v) ? v.map((n) => map(Number(n))) : swap(v)])) : x;
  return { ...sample, metric_ids: sample.metric_ids.map(map), settings: swap(sample.settings) as WidgetSettings };
}


/** The slope chart made with real Metrics: the rows of the first one's Breakdown, or, with `metrics`, all of them (the caller passes only Metrics of one unit). One Metric is one line, never repeated to fill the sample's three. */
export function slopeWith(real: number[], period: Period, by: "rows" | "metrics"): FrameWidget {
  const sample = sampleWidget("slope", period);
  return by === "rows"
    ? { ...sample, metric_ids: [real[0]], settings: { ...sample.settings, slope: "previous" } }
    : { ...sample, metric_ids: real, settings: { ...sample.settings, slope: "metrics" } };
}
