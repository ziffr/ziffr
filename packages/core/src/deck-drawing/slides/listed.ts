// What the slide types read their numbers through (spec 0069; GLOSSARY: Slide, Slide Type, Metric).
// Visibility: a slide reads only the Metrics it lists. The data is cut to them here before anything is worked out, so a
// Total or a formula that reads another Metric finds nothing, also where another slide of the deck lists it. Where a
// Metric the slide needs is not there, the words are the same whether it is not listed or not shown to the viewer. Pure.
import { plain } from "../../formula-tree";
import { periodLabel } from "../../periods";
import type { CanvasData, Metric, Point } from "../../types";
import type { SlideFill, SlideSource } from "../slide-type";

/** A slide's Metrics in the order it lists them, with the data cut to them. */
export type Listed = { metrics: Metric[]; data: CanvasData };

const only = <T>(record: Record<string, T> | undefined, keys: ReadonlySet<string>): Record<string, T> =>
  Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => keys.has(key)));

/** The slide's data, or null where it lists no Metric or one that is not there. */
export function listedData(slide: SlideSource, data: CanvasData): Listed | null {
  const found = slide.metrics.map((id) => data.metrics.find((m) => m.id === id));
  const metrics = found.filter((m): m is Metric => !!m);
  if (!metrics.length || metrics.length < found.length) return null;
  const ids = new Set(metrics.map((m) => String(m.id)));
  return {
    metrics,
    data: {
      ...data,
      metrics: [...new Set(metrics)],
      series: only(data.series, new Set(metrics.map((m) => m.slug))),
      targets: only(data.targets, ids),
      projections: only(data.projections, ids),
      breakdowns: only(data.breakdowns, ids),
      condensed: data.condensed && only(data.condensed, ids),
      totalLists: data.totalLists && only(data.totalLists, ids),
    },
  };
}

/** What a slide says where a Metric it lists is not there: nothing of any of them. */
export const NOT_THERE: SlideFill<never> = { headline: "This slide cannot be shown", source: "", cannot: "A Metric of this slide is not shown to you here." };

/** What a slide says where a Total or a formula reads a Metric the slide may not read. */
export const readsMore = (name: string) =>
  `Not drawn: ${name} reads a Metric that this slide does not list or that is not shown to you. Make the slide again to draw it with what it reads now.`;

/** A Metric's name as a slide writes it. */
export const nameOf = (metric: Metric) => plain(metric.name);

/** The source line of a slide that reads these Metrics, for these periods. */
export const sourceOf = (metrics: readonly Metric[], period?: string) =>
  ["Ziffr", [...new Set(metrics.map(nameOf))].join(", "), period].filter(Boolean).join("; ");

/** A Metric's value in a period; null where it has none. */
export function valueIn(metric: Metric, data: CanvasData, period: string): number | null {
  const value = data.series[metric.slug]?.find((p) => p.period === period)?.value;
  return value === undefined || !Number.isFinite(value) ? null : value;
}

/** The newest point of a Metric that has a value. */
export const latestPoint = (metric: Metric, data: CanvasData): Point | undefined =>
  data.series[metric.slug]?.filter((p) => Number.isFinite(p.value)).at(-1);

/** A period of a Metric in words. */
export const periodWords = (metric: Metric, data: CanvasData, period: string) => periodLabel(period, metric.period, data.yearStart);

/** The newest period of a Metric's Breakdowns that has rows. */
export const breakdownPeriod = (metric: Metric, data: CanvasData): string | undefined =>
  Object.entries(data.breakdowns[metric.id] ?? {})
    .flatMap(([period, rows]) => (rows.length ? [period] : []))
    .sort()
    .at(-1);
