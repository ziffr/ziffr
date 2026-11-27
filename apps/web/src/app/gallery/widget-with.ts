// A built-in view made with real Metrics (ticket #861; GLOSSARY: Widget Template, Sample Data, Preview, Slot): the Gallery and a
// dashboard's Add widget panel draw each view the way its Preview does, with the person's own Metric where the sample one stood,
// and say whether placing it needs anything more than that Metric. Pure, so it is tested without a browser.
import { BUILT_IN_DESIGNS, isDesignedView } from "@ziffr/core/built-in-designs";
import { sampleWidget } from "@ziffr/core/sample-data";
import type { CanvasData, Metric, Period, TemplateId, WidgetSettings } from "@ziffr/core/types";
import type { FrameWidget } from "@/components/read-only-frame";
import { TEMPLATES } from "@/views/templates";

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
  const ids = sample.metric_ids.map(map);
  // One bar per Metric: a Metric picked once is not drawn three times to fill the sample's three.
  return { ...sample, metric_ids: template === "progress" ? [...new Set(ids)] : ids, settings: swap(sample.settings) as WidgetSettings };
}


/** The slope chart made with real Metrics: the rows of the first one's Breakdown, or, with `metrics`, all of them (the caller passes only Metrics of one unit). One Metric is one line, never repeated to fill the sample's three. */
export function slopeWith(real: number[], period: Period, by: "rows" | "metrics"): FrameWidget {
  const sample = sampleWidget("slope", period);
  return by === "rows"
    ? { ...sample, metric_ids: [real[0]], settings: { ...sample.settings, slope: "previous" } }
    : { ...sample, metric_ids: real, settings: { ...sample.settings, slope: "metrics" } };
}

/** How many periods two series share: what a comparison (a correlation, a matrix, Drivers) has to work with. */
const common = (a: { period: string }[] = [], b: { period: string }[] = []) => { const p = new Set(a.map((x) => x.period)); return b.filter((x) => p.has(x.period)).length; };
/** The fewest shared periods a comparison is drawn with; below it the view says there are not enough. */
const ENOUGH = 6;

/** The Metrics a comparison with `metric` is drawn with: of the candidates, the two that share most periods with it. */
export function partnersOf(metric: Metric, candidates: number[], data: CanvasData): number[] {
  const mine = data.series[metric.slug] ?? [];
  return candidates
    .map((id) => ({ id, n: common(mine, data.series[data.metrics.find((x) => x.id === id)?.slug ?? ""]) }))
    .filter((x) => x.n >= ENOUGH).sort((x, y) => y.n - x.n).slice(0, 2).map((x) => x.id);
}

/** The fewest Metrics a view can be made of: one per Slot, and as many as its design asks of a Slot of several (a scoreboard: three). */
function fewest(id: TemplateId): number {
  const design = isDesignedView(id) ? BUILT_IN_DESIGNS[id].slots.reduce((n, s) => n + (s.metrics === "several" ? (s.min ?? 1) : 1), 0) : 0;
  return Math.max(TEMPLATES[id].slots.length, design);
}

/** A view as a card draws it: the widget made of the person's Metrics, or why it is drawn with Sample Data instead. */
export type ViewWith = { widget: FrameWidget | null; why: string | null };

/** A built-in view with `metric` (and, where it compares, its `partners`), from the series `data` holds. */
export function viewWith(id: TemplateId, metric: Metric, partners: number[], data: CanvasData): ViewWith {
  const hasBreakdown = Object.keys(data.breakdowns[metric.id] ?? {}).length > 0;
  const lacking = `Needs other Metrics with ${ENOUGH}+ months in common with ${metric.name}, so this shows sample data.`;
  if (TEMPLATES[id].needsBreakdown && !hasBreakdown) return { widget: null, why: `${metric.name} has no breakdown, so this shows sample data.` };
  // A Slot of several needs as many Metrics as its design says, not just one more than the Slots.
  if (fewest(id) > 1 && partners.length + 1 < fewest(id)) return { widget: null, why: lacking };
  if (id === "slope") {
    // Rows of the picked Metric's Breakdown, else it with the partners that are counted in its unit.
    if (hasBreakdown) return { widget: slopeWith([metric.id], metric.period, "rows"), why: null };
    const alike = partners.filter((p) => data.metrics.find((x) => x.id === p)?.unit.trim() === metric.unit.trim());
    if (!alike.length) return { widget: null, why: `${metric.name} has no breakdown and no other Metric in its unit, so this shows sample data.` };
    return { widget: slopeWith([metric.id, ...alike], metric.period, "metrics"), why: null };
  }
  if (id === "heatmap" && (metric.period === "quarter" || metric.period === "year")) return { widget: null, why: `${metric.name} is by ${metric.period}, and a heatmap needs a Metric by day, week or month, so this shows sample data.` };
  return { widget: widgetWith(id, [metric.id, ...partners], metric.period), why: null };
}

/** The Metrics a view is placed with at once when `metric` is the picked one: it alone, where that is all the view needs
 * and its card draws it. None when the view has to ask for its Slots first (or has none to ask for). */
export function placedAtOnce(id: TemplateId, metric: Metric | null, view: ViewWith): number[] {
  if (!metric || !view.widget || TEMPLATES[id].slots.length !== 1 || fewest(id) > 1) return [];
  // A slope chart of several Metrics is drawn with others than the picked one, so which ones is a question.
  return view.widget.settings.slope === "metrics" ? [] : [metric.id];
}
