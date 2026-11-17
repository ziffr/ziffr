// The comparison engine (GLOSSARY: Comparison, Attainment, Aggregation). Pure: no server or React code,
// so dashboards, decks, the Metric page, History and the PowerPoint export all compute the same numbers.
import { combines, seriesBy, valueOver, type DisplayPoint, type Resolver } from "./display-periods";
import { periodEnd, periodLabel, periodStart, shiftPeriod, type Span, type YearStart } from "./periods";
import type { Metric, Period, Point } from "./types";

/** Which Comparison: the previous period, a calendar span to date (day, week, month, quarter, half) or the year before. */
export type CompareKey = "prev" | "dod" | "wow" | "mom" | "qoq" | "hoh" | "yoy";
type Grain = Span;

/** How each Comparison is named in the interface. */
export const COMPARE_LABEL: Record<CompareKey, string> = {
  prev: "vs previous period", dod: "DoD", wow: "WoW", mom: "MoM", qoq: "QoQ", hoh: "HoH", yoy: "YoY",
};
const GRAIN: Record<Exclude<CompareKey, "prev" | "yoy">, Grain> = { dod: "day", wow: "week", mom: "month", qoq: "quarter", hoh: "half" };
const RANK: Record<Grain, number> = { day: 0, week: 1, month: 2, quarter: 3, half: 4, year: 5 };

/** Which comparisons a metric of this period can have (a monthly metric has no DoD). */
export function comparisonsFor(period: Period): CompareKey[] {
  const all: CompareKey[] = ["prev", "dod", "wow", "mom", "qoq", "hoh", "yoy"];
  return all.filter((k) => k === "prev" || k === "yoy" || RANK[GRAIN[k as keyof typeof GRAIN]] >= RANK[period]);
}

/** One Comparison of a metric: the two values, their difference, and whether that is good (GLOSSARY: Comparison). */
export type Comparison = {
  key: CompareKey;
  label: string;
  available: boolean;
  reason?: string;
  current?: number;
  previous?: number;
  abs?: number;
  pct?: number | null;
  currentSpan?: string;
  previousSpan?: string;
  /** true when the change is good for this metric's polarity, null when neither. */
  good?: boolean | null;
};

/** Series and aggregation per metric slug (kept here, where callers have always found it). */
export type { Resolver } from "./display-periods";

function spanLabel(start: string, end: string, p: Period, ys: YearStart) {
  return start === end ? periodLabel(start, p, ys, true) : `${periodLabel(start, p, ys, true)} to ${periodLabel(end, p, ys, true)}`;
}

/** Comparisons for a metric's latest period, combining periods by the metric's Aggregation; `full` compares complete spans instead of spans to date.
 * Quarters, halves and years start from `yearStart`, the workspace's. */
export function compare(metric: Metric, resolve: Resolver, opts: { keys?: CompareKey[]; full?: boolean; asOf?: string; yearStart: YearStart }): Comparison[] {
  const r = resolve(metric.slug);
  const pts = (r?.points ?? []).filter((p) => !opts.asOf || p.period <= opts.asOf);
  const keys = opts.keys ?? comparisonsFor(metric.period);
  const last = pts[pts.length - 1];
  if (!last) return keys.map((key) => ({ key, label: COMPARE_LABEL[key], available: false, reason: "No values yet" }));
  const P = metric.period;
  const ys = opts.yearStart;
  // Derived metrics combine through their inputs, so their aggregation is effectively "by formula".
  const combinable = combines(metric);

  return keys.map((key): Comparison => {
    const base = { key, label: COMPARE_LABEL[key] };
    let cur: [string, string];
    let prev: [string, string];
    const grain: Grain | null = key === "prev" || key === "yoy" ? null : GRAIN[key];

    if (key === "prev" || (grain && RANK[grain] === RANK[P])) {
      const p = shiftPeriod(last.period, P, -1);
      cur = [last.period, last.period];
      prev = [p, p];
    } else if (key === "yoy") {
      const p = shiftPeriod(last.period, "year", -1);
      cur = [last.period, last.period];
      prev = [p, p];
    } else {
      if (!combinable) return { ...base, available: false, reason: `${metric.name} does not combine into longer periods` };
      const g = grain!;
      const gStart = periodStart(last.period, g, ys);
      let s: string;
      let points: DisplayPoint[];
      if (opts.full) {
        // Last complete span vs the one before: the span the latest period ends is complete, one ending later is not.
        const complete = periodEnd(gStart, g) <= periodEnd(last.period, P);
        s = complete ? gStart : shiftPeriod(gStart, g, -1);
        cur = [s, shiftPeriod(shiftPeriod(s, g, 1), P, -1)];
        points = seriesBy(metric, resolve, g, { yearStart: ys, today: shiftPeriod(last.period, P, 1) }).points;
      } else {
        // To date: the current span so far vs the span before up to the same point.
        // Calendar-aligned: 1 Jul to 12 Nov compares with 1 Jan to 12 May, not a day count.
        s = gStart;
        cur = [gStart, last.period];
        points = seriesBy(metric, resolve, g, { yearStart: ys, alignTo: last.period }).points;
      }
      const ps = shiftPeriod(s, g, -1);
      prev = [ps, opts.full ? shiftPeriod(s, P, -1) : shiftPeriod(last.period, g, -1)];
      const at = (start: string) => points.find((p) => p.period === start)?.value;
      return result(base, at(s), at(ps), cur, prev);
    }

    return result(base, valueOver(metric.slug, cur[0], cur[1], resolve, 1), valueOver(metric.slug, prev[0], prev[1], resolve, 1), cur, prev);
  });

  function result(base: { key: CompareKey; label: string }, current: number | undefined, previous: number | undefined, cur: [string, string], prev: [string, string]): Comparison {
    if (current === undefined || previous === undefined) {
      return { ...base, available: false, reason: previous === undefined ? "No values for the earlier span" : "Incomplete values for this span", currentSpan: spanLabel(cur[0], cur[1], P, ys), previousSpan: spanLabel(prev[0], prev[1], P, ys) };
    }
    const abs = current - previous;
    const pct = previous !== 0 ? (abs / Math.abs(previous)) * 100 : null;
    const good = metric.polarity === "target" || abs === 0 ? null : (abs > 0) === (metric.polarity === "higher");
    return { ...base, available: true, current, previous, abs, pct, good, currentSpan: spanLabel(cur[0], cur[1], P, ys), previousSpan: spanLabel(prev[0], prev[1], P, ys) };
  }
}

/** The target for one period: the Target Series value if there is one, otherwise the metric's range. */
export function targetFor(metric: Metric, period: string, targets: Point[] = []) {
  const t = targets.find((p) => p.period === period);
  if (t) return { min: metric.polarity === "lower" ? null : t.value, max: metric.polarity === "lower" ? t.value : null, fromSeries: true, value: t.value };
  return { min: metric.target_min, max: metric.target_max, fromSeries: false, value: metric.polarity === "lower" ? metric.target_max : metric.target_min };
}

/** Attainment in %, higher always better (GLOSSARY: Attainment). */
export function attainment(metric: Metric, value: number, t: { min: number | null; max: number | null }): number | null {
  if (metric.polarity === "higher" && t.min) return (value / t.min) * 100;
  if (metric.polarity === "lower" && t.max && value) return (t.max / value) * 100;
  if (metric.polarity === "target" && (t.min !== null || t.max !== null)) {
    if (t.min !== null && value < t.min) return (value / t.min) * 100;
    if (t.max !== null && value > t.max) return (t.max / value) * 100;
    return 100;
  }
  return null;
}

/** Everything a widget's comparison strip needs, for the latest period. */
export function summary(metric: Metric, resolve: Resolver, targets: Point[] | undefined, opts: { keys?: CompareKey[]; full?: boolean; yearStart: YearStart }) {
  const pts = resolve(metric.slug)?.points ?? [];
  const last = pts[pts.length - 1];
  const t = last ? targetFor(metric, last.period, targets ?? []) : null;
  return {
    value: last?.value,
    period: last?.period,
    target: t,
    attainment: last && t ? attainment(metric, last.value, t) : null,
    comparisons: compare(metric, resolve, opts),
  };
}

/** A resolver over a canvas's data. */
export function resolverFrom(metrics: Metric[], series: Record<string, Point[]>): Resolver {
  const bySlug = new Map(metrics.map((m) => [m.slug, m]));
  return (slug) => {
    const metric = bySlug.get(slug);
    return metric ? { metric, points: series[slug] ?? [] } : undefined;
  };
}
