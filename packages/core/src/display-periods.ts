// Display Periods (spec 0018; GLOSSARY: Display Period, Aggregation): a Metric's values combined into a longer period
// by its Aggregation. Pure. Widgets, Comparisons and the export all combine through `seriesBy`, so a quarter's value
// is the same in a chart, a table and a Comparison strip.
import { format } from "date-fns";
import { evaluate, formulaInputs } from "./formula";
import { periodEnd, periodsBetween, periodStart, shiftPeriod, type Span, type YearStart } from "./periods";
import type { Metric, Point } from "./types";

/** A period a widget shows a Metric by: its own, or a longer one (GLOSSARY: Display Period). */
export type DisplayPeriod = Exclude<Span, "day">;

/** Series and aggregation per metric slug: how the engine reads metrics, including a derived metric's inputs. */
export type Resolver = (slug: string) => { metric: Metric; points: Point[] } | undefined;

/** One value per Display Period: `period` is the span's first day, `value` its Metric periods combined. */
export type DisplayPoint = Point & {
  /** How many of the Metric's periods in the span have a value. */
  held: number;
  /** How many Metric periods the span has in all ("2 of 3 months"). */
  length: number;
  /** The span is not over yet on `today`: its value is to date. */
  toDate: boolean;
};

/** A Metric's series by a Display Period, or why it cannot be combined into one. */
export type SeriesBy = { ok: true; points: DisplayPoint[] } | { ok: false; reason: string; points: [] };

const RANK: Record<Span, number> = { day: 0, week: 1, month: 2, quarter: 3, half: 4, year: 5 };
const ORDER: DisplayPeriod[] = ["week", "month", "quarter", "half", "year"];

/** Why a Metric with Aggregation "none" is not shown by a longer period (shown where the setting is offered). */
export const NOT_COMBINED = "Combined only for Metrics whose Aggregation is sum, average or last value; this one is set to none.";

/** Whether a Metric's values combine into longer periods: by its Aggregation, or a Derived Metric through its inputs. */
export function combines(metric: Pick<Metric, "formula" | "aggregation">): boolean {
  return Boolean(metric.formula) || metric.aggregation !== "none";
}

/** The Display Periods longer than a Metric's own, shortest first (a monthly Metric: quarter, half-year, year). */
export function displayPeriodsFor(period: Span): DisplayPeriod[] {
  return ORDER.filter((d) => RANK[d] > RANK[period]);
}

/** Whether a span is longer than another. */
export function isLonger(a: Span, b: Span): boolean {
  return RANK[a] > RANK[b];
}

/** How many periods of length `p` start between two days (inclusive): weeks belong to the month they start in. */
export function periodCount(p: Span, from: string, to: string, yearStart: YearStart): number {
  let start = periodStart(from, p, yearStart);
  if (start < from) start = shiftPeriod(start, p, 1);
  let n = 0;
  for (; start <= to; start = shiftPeriod(start, p, 1)) n++;
  return n;
}

/** The value of a metric over [start, end] (inclusive period starts), or undefined when it cannot be combined.
 * `expected` is how many periods the span should have: it counts once at least half of them have values. */
export function valueOver(slug: string, start: string, end: string, resolve: Resolver, expected: number): number | undefined {
  const r = resolve(slug);
  if (!r) return undefined;
  const { metric, points } = r;
  if (metric.formula) {
    // A Derived Metric is computed from its inputs' combined values (revenue minus cost per quarter), not by adding
    // up its own periods: a margin of sums, not a sum of margins.
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

/** A Metric's series by a Display Period: one point per span with values, oldest first, combined by its Aggregation.
 * A span counts once at least half of it has values; the one `today` (yyyy-mm-dd, default the current day) falls in
 * is to date, counted only up to the latest value. Quarters, halves and years start from `yearStart`.
 * `alignTo` (a Metric period start) cuts every span at the point `alignTo` sits in its own, for Comparisons to date.
 * By the Metric's own period the points come back as they are; a shorter one, or Aggregation "none", is refused. */
export function seriesBy(metric: Metric, resolve: Resolver, display: Span, opts: { yearStart: YearStart; today?: string; alignTo?: string }): SeriesBy {
  const own = metric.period;
  const points = resolve(metric.slug)?.points ?? [];
  if (display === own) return { ok: true, points: points.map((p) => ({ ...p, held: 1, length: 1, toDate: false })) };
  if (!isLonger(display, own)) return { ok: false, reason: `A ${own}'s value cannot be split into shorter periods.`, points: [] };
  if (!combines(metric)) return { ok: false, reason: NOT_COMBINED, points: [] };
  const ys = opts.yearStart;
  const today = opts.today ?? format(new Date(), "yyyy-MM-dd");
  const latest = points[points.length - 1]?.period;
  const anchor = opts.alignTo ? periodStart(opts.alignTo, display, ys) : null;

  const held = new Map<string, number>();
  for (const p of points) {
    const s = periodStart(p.period, display, ys);
    held.set(s, (held.get(s) ?? 0) + 1);
  }
  const out: DisplayPoint[] = [];
  for (const [start, n] of [...held].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const last = periodEnd(start, display);
    const length = periodCount(own, start, last, ys);
    const toDate = today >= start && today <= last;
    // Where the span is cut (a day, inclusive): at the same point as `alignTo`, or at the latest value while the span
    // is not over, so a quarter two months in is two months, not two thirds of a quarter.
    let end = last;
    if (anchor) end = shiftPeriod(opts.alignTo!, display, periodsBetween(anchor, start, display));
    else if (toDate && latest && latest <= last) end = latest;
    const value = valueOver(metric.slug, start, end, resolve, periodCount(own, start, end, ys));
    if (value === undefined) continue;
    out.push({ period: start, value, held: anchor ? points.filter((p) => p.period >= start && p.period <= end).length : n, length, toDate });
  }
  return { ok: true, points: out };
}
