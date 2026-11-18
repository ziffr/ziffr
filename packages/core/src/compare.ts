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

/** Which comparisons a metric of this period can have (a monthly metric has no DoD; a quarterly one has the previous
 * quarter, QoQ, HoH and YoY). A yearly Metric's previous period is the year before, so it has YoY only. */
export function comparisonsFor(period: Period): CompareKey[] {
  const all: CompareKey[] = ["prev", "dod", "wow", "mom", "qoq", "hoh", "yoy"];
  if (period === "year") return ["yoy"];
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

/** Attainment in %, higher always better (GLOSSARY: Attainment). It is measured by the distance to the target, in
 * steps of the target's own size: 100 % on target, 150 % half a target better, 50 % half a target short. That holds
 * for targets below zero too, where a ratio of value to target turns around. A target of 0 has no size to measure
 * by, so there is no percentage (null; `targetGap` gives the difference instead), and null for a value that is not
 * a number. */
export function attainment(metric: Metric, value: number, t: { min: number | null; max: number | null }): number | null {
  const min = t.min === null ? null : Number(t.min);
  const max = t.max === null ? null : Number(t.max);
  if (!Number.isFinite(value)) return null;
  // `ahead` is how far the value is on the good side of `target`, negative when it falls short.
  const pct = (target: number, ahead: number) => (target === 0 || !Number.isFinite(target) ? null : 100 + (ahead / Math.abs(target)) * 100);
  if (metric.polarity === "higher") return min === null ? null : pct(min, value - min);
  if (metric.polarity === "lower") return max === null ? null : pct(max, max - value);
  if (min === null && max === null) return null;
  if (min !== null && value < min) return pct(min, value - min);
  if (max !== null && value > max) return pct(max, max - value);
  return 100;
}

/** How far a value is from its target, in the Metric's unit: positive above it, negative below, 0 inside a range;
 * null without a target. What a widget shows where Attainment has no percentage (a target of 0). */
export function targetGap(metric: Metric, value: number, t: { min: number | null; max: number | null }): number | null {
  const min = t.min === null ? null : Number(t.min);
  const max = t.max === null ? null : Number(t.max);
  if (!Number.isFinite(value)) return null;
  if (metric.polarity === "higher") return min === null ? null : value - min;
  if (metric.polarity === "lower") return max === null ? null : value - max;
  if (min !== null && value < min) return value - min;
  if (max !== null && value > max) return value - max;
  return min === null && max === null ? null : 0;
}

/** Attainment rounded for display, e.g. "92%": a value that rounds to zero is "0%", never "-0%". */
export function attainmentText(a: number, digits = 0): string {
  const f = 10 ** digits;
  return `${(Math.round(a * f) / f || 0).toFixed(digits)}%`;
}

/** Everything a widget's comparison strip needs, for the latest period. */
export function summary(metric: Metric, resolve: Resolver, targets: Point[] | undefined, opts: { keys?: CompareKey[]; full?: boolean; yearStart: YearStart }) {
  const pts = resolve(metric.slug)?.points ?? [];
  const last = pts[pts.length - 1];
  const t = last ? targetFor(metric, last.period, targets ?? []) : null;
  const att = last && t ? attainment(metric, last.value, t) : null;
  const gap = last && t ? targetGap(metric, last.value, t) : null;
  return {
    value: last?.value,
    period: last?.period,
    target: t,
    attainment: att,
    /** The difference to the target, shown where Attainment has no percentage. */
    gap,
    /** Whether the latest value is on target, from Attainment or, without one, from the difference; null without a target. */
    onTarget: att !== null ? att >= 100 : gap === null ? null : metric.polarity === "higher" ? gap >= 0 : metric.polarity === "lower" ? gap <= 0 : gap === 0,
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
