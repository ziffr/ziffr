// The comparison engine (GLOSSARY: Comparison, Attainment, Aggregation). Pure: no server or React code,
// so dashboards, decks, the Metric page, History and the PowerPoint export all compute the same numbers.
import {
  addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, differenceInCalendarISOWeeks, differenceInCalendarMonths,
  format, parseISO, startOfISOWeek, startOfMonth, startOfQuarter, startOfYear,
} from "date-fns";
import { evaluate, formulaInputs } from "./formula";
import { periodLabel } from "./format";
import type { Metric, Period, Point } from "./types";

/** Which Comparison: the previous period, a calendar span to date (day, week, month, quarter, half) or the year before. */
export type CompareKey = "prev" | "dod" | "wow" | "mom" | "qoq" | "hoh" | "yoy";
type Grain = "day" | "week" | "month" | "quarter" | "half" | "year";

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

/** Series and aggregation per metric slug: how the engine reads metrics, including a derived metric's inputs. */
export type Resolver = (slug: string) => { metric: Metric; points: Point[] } | undefined;

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function grainStart(d: Date, g: Grain) {
  if (g === "day") return d;
  if (g === "week") return startOfISOWeek(d);
  if (g === "month") return startOfMonth(d);
  if (g === "quarter") return startOfQuarter(d);
  if (g === "half") return new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1);
  return startOfYear(d);
}

function shift(d: Date, g: Grain, n: number) {
  if (g === "day") return addDays(d, n);
  if (g === "week") return addWeeks(d, n);
  if (g === "month") return addMonths(d, n);
  if (g === "quarter") return addMonths(d, 3 * n);
  if (g === "half") return addMonths(d, 6 * n);
  return addYears(d, n);
}

function steps(from: Date, to: Date, p: Period) {
  if (p === "day") return differenceInCalendarDays(to, from);
  if (p === "week") return differenceInCalendarISOWeeks(to, from);
  return differenceInCalendarMonths(to, from);
}

/** The value of a metric over [start, end] (inclusive period starts), or undefined when it cannot be combined. */
function valueOver(slug: string, start: string, end: string, resolve: Resolver, expected: number): number | undefined {
  const r = resolve(slug);
  if (!r) return undefined;
  const { metric, points } = r;
  if (metric.formula) {
    const vars: Record<string, number> = {};
    for (const input of formulaInputs(metric.formula)) {
      const v = valueOver(input, start, end, resolve, expected);
      if (v === undefined) return undefined;
      vars[input] = v;
    }
    return evaluate(metric.formula, vars) ?? undefined;
  }
  const inSpan = points.filter((p) => p.period >= start && p.period <= end);
  // Some metrics skip periods (no deals on weekends); a span counts when at least half of it has values.
  if (!inSpan.length || inSpan.length < Math.ceil(expected / 2)) return undefined;
  if (inSpan.length === 1) return inSpan[0].value;
  switch (metric.aggregation) {
    case "sum": return inSpan.reduce((a, p) => a + p.value, 0);
    case "average": return inSpan.reduce((a, p) => a + p.value, 0) / inSpan.length;
    case "last": return inSpan[inSpan.length - 1].value;
    default: return undefined;
  }
}

function spanLabel(start: string, end: string, p: Period) {
  return start === end ? periodLabel(start, p, true) : `${periodLabel(start, p, true)} to ${periodLabel(end, p, true)}`;
}

/** Comparisons for a metric's latest period, combining periods by the metric's Aggregation; `full` compares complete spans instead of spans to date. */
export function compare(metric: Metric, resolve: Resolver, opts: { keys?: CompareKey[]; full?: boolean; asOf?: string } = {}): Comparison[] {
  const r = resolve(metric.slug);
  const pts = (r?.points ?? []).filter((p) => !opts.asOf || p.period <= opts.asOf);
  const keys = opts.keys ?? comparisonsFor(metric.period);
  const last = pts[pts.length - 1];
  if (!last) return keys.map((key) => ({ key, label: COMPARE_LABEL[key], available: false, reason: "No values yet" }));
  const P = metric.period;
  const lastD = parseISO(last.period);
  // Derived metrics combine through their inputs, so their aggregation is effectively "by formula".
  const combinable = Boolean(metric.formula) || metric.aggregation !== "none";

  return keys.map((key): Comparison => {
    const base = { key, label: COMPARE_LABEL[key] };
    let cur: [string, string, number];
    let prev: [string, string, number];
    const grain: Grain | null = key === "prev" || key === "yoy" ? null : GRAIN[key];

    if (key === "prev" || (grain && RANK[grain] === RANK[P])) {
      const p = iso(shift(lastD, P, -1));
      cur = [last.period, last.period, 1];
      prev = [p, p, 1];
    } else if (key === "yoy") {
      const p = iso(addYears(lastD, -1));
      cur = [last.period, last.period, 1];
      prev = [p, p, 1];
    } else {
      if (!combinable) return { ...base, available: false, reason: `${metric.name} does not combine into longer periods` };
      const g = grain!;
      const gStart = grainStart(lastD, g);
      if (opts.full) {
        // Last complete span vs the one before.
        const nextStart = shift(gStart, g, 1);
        const lastOfSpan = shift(nextStart, P === "day" ? "day" : P === "week" ? "week" : "month", -1);
        const complete = iso(lastOfSpan) <= last.period;
        const s = complete ? gStart : shift(gStart, g, -1);
        const n = steps(s, shift(s, g, 1), P);
        const e = shift(shift(s, g, 1), P === "day" ? "day" : P === "week" ? "week" : "month", -1);
        const ps = shift(s, g, -1);
        const pe = shift(s, P === "day" ? "day" : P === "week" ? "week" : "month", -1);
        cur = [iso(s), iso(e), n];
        prev = [iso(ps), iso(pe), n];
      } else {
        // To date: the current span so far vs the same number of periods at the start of the span before.
        // Calendar-aligned: 1 Jul to 12 Nov compares with 1 Jan to 12 May, not a day count.
        const ps = shift(gStart, g, -1);
        const pe = shift(lastD, g, -1);
        cur = [iso(gStart), last.period, steps(gStart, lastD, P) + 1];
        prev = [iso(ps), iso(pe), steps(ps, pe, P) + 1];
      }
    }

    const current = valueOver(metric.slug, cur[0], cur[1], resolve, cur[2]);
    const previous = valueOver(metric.slug, prev[0], prev[1], resolve, prev[2]);
    if (current === undefined || previous === undefined) {
      return { ...base, available: false, reason: previous === undefined ? "No values for the earlier span" : "Incomplete values for this span", currentSpan: spanLabel(cur[0], cur[1], P), previousSpan: spanLabel(prev[0], prev[1], P) };
    }
    const abs = current - previous;
    const pct = previous !== 0 ? (abs / Math.abs(previous)) * 100 : null;
    const good = metric.polarity === "target" || abs === 0 ? null : (abs > 0) === (metric.polarity === "higher");
    return { ...base, available: true, current, previous, abs, pct, good, currentSpan: spanLabel(cur[0], cur[1], P), previousSpan: spanLabel(prev[0], prev[1], P) };
  });
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
export function summary(metric: Metric, resolve: Resolver, targets: Point[] = [], opts: { keys?: CompareKey[]; full?: boolean } = {}) {
  const pts = resolve(metric.slug)?.points ?? [];
  const last = pts[pts.length - 1];
  const t = last ? targetFor(metric, last.period, targets) : null;
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
