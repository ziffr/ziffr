// Display Periods (spec 0018; GLOSSARY: Display Period, Aggregation): a Metric's values combined into a longer period
// by its Aggregation. Pure. Widgets, Comparisons and the export all combine through `seriesBy`, so a quarter's value
// is the same in a chart, a table and a Comparison strip.
import { exactTotal } from "./exact";
import { format } from "date-fns";
import { evaluate, formulaInputs, inputsNotCombined } from "./formula";
import { isPeriodStart, periodEnd, periodLabel, periodsBetween, periodStart, shiftPeriod, type Span, type YearStart } from "./periods";
import type { CanvasData, Metric, Point, TemplateId } from "./types";

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
  /** The last day counted: the Metric periods starting from `period` through this day make up `value`. */
  through: string;
};

/** A Metric's series by a Display Period, or why it cannot be combined into one. */
export type SeriesBy = { ok: true; points: DisplayPoint[] } | { ok: false; reason: string; points: [] };

const RANK: Record<Span, number> = { day: 0, week: 1, month: 2, quarter: 3, half: 4, year: 5 };
const ORDER: DisplayPeriod[] = ["week", "month", "quarter", "half", "year"];

/** Why a Metric with Aggregation "none" is not shown by a longer period (shown where the setting is offered). */
export const NOT_COMBINED = "Combined only for Metrics whose Aggregation is sum, average or last value; this one is set to none.";

/** Why a Derived Metric is shown by its own period where its inputs are not shared (a View Link, a Snapshot). */
export const INPUTS_MISSING = "Shown by its own period here: a Derived Metric is combined from its inputs, which are not shared.";

/** The day after a span's last day: the "today" of a Snapshot of that span, by which the span is over. */
export function dayAfter(day: string): string {
  return shiftPeriod(day, "day", 1);
}

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
  let first = periodStart(from, p, yearStart);
  if (first < from) first = shiftPeriod(first, p, 1);
  // From the first period starting in the range to the one the range's last day falls in, counted, not walked: a
  // daily Metric's year would otherwise step through 365 days.
  return first > to ? 0 : periodsBetween(first, periodStart(to, p, yearStart), p) + 1;
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
  return combined(metric.aggregation, latestOfEach(points).filter((p) => p.period >= start && p.period <= end), expected);
}

/** A resolver over a canvas's data: each Metric with its series, nothing for a slug it does not hold. */
export function resolverFrom(metrics: readonly Metric[], series: Record<string, Point[]>): Resolver {
  const bySlug = new Map(metrics.map((m) => [m.slug, m]));
  return (slug) => {
    const metric = bySlug.get(slug);
    return metric ? { metric, points: series[slug] ?? [] } : undefined;
  };
}

/** The latest value of each period, oldest first: a period given twice keeps the value given last, as a chart
 * plots the latest value of a period. Combining must not depend on the order a series comes in (spec 0022). */
export function latestOfEach(points: readonly Point[]): Point[] {
  const byPeriod = new Map<string, number>();
  for (const p of points) byPeriod.set(p.period, p.value);
  return [...byPeriod].map(([period, value]) => ({ period, value })).sort((a, b) => (a.period < b.period ? -1 : 1));
}

/** The values of a span (oldest first) combined by an Aggregation, once at least half of the `expected` periods
 * have one; undefined otherwise and for none. */
function combined(aggregation: Metric["aggregation"], inSpan: readonly Point[], expected: number): number | undefined {
  // Some metrics skip periods (no deals on weekends); a span counts when at least half of it has values.
  if (!inSpan.length || inSpan.length < Math.ceil(expected / 2)) return undefined;
  if (inSpan.length === 1) return inSpan[0].value;
  switch (aggregation) {
    case "sum": return total(inSpan, 1);
    case "average": return total(inSpan, inSpan.length);
    case "last": return inSpan[inSpan.length - 1].value;
    default: return undefined;
  }
}

// Sums and averages are exact (spec 0022, "Exact results"): exact.ts adds the values' text as BigInts and turns
// the total into the double nearest to it, so 0.1 + 0.2 is 0.3 and a thousand values of 0.01 give 10.
const total = (values: readonly Point[], count: number) => exactTotal(values.map((p) => p.value), count);

/** A Metric's series by a Display Period: one point per span with values, oldest first, combined by its Aggregation.
 * A span counts once at least half of it has values; the one `today` (yyyy-mm-dd, default the current day) falls in
 * is to date, counted only up to the latest value. Quarters, halves and years start from `yearStart`.
 * `alignTo` (a Metric period start) cuts every span at the point `alignTo` sits in its own, for Comparisons to date.
 * Each period counts once, with its latest value, whatever order the points come in (spec 0022). By the Metric's
 * own period the points come back as they are, oldest first; a shorter one, or Aggregation "none", is refused. */
export function seriesBy(metric: Metric, resolve: Resolver, display: Span, opts: { yearStart: YearStart; today?: string; alignTo?: string }): SeriesBy {
  const own = metric.period;
  const points = latestOfEach(resolve(metric.slug)?.points ?? []);
  if (display === own) return { ok: true, points: points.map((p) => ({ ...p, held: 1, length: 1, toDate: false, through: p.period })) };
  if (!isLonger(display, own)) return { ok: false, reason: `A ${own}'s value cannot be split into shorter periods.`, points: [] };
  if (!combines(metric)) return { ok: false, reason: NOT_COMBINED, points: [] };
  // A Derived Metric combines through its inputs: one set to Aggregation none leaves every span empty, so it says why
  // instead of drawing an empty chart (spec 0022).
  if (metric.formula) {
    const why = inputsNotCombined(metric, formulaInputs(metric.formula).flatMap((s) => resolve(s)?.metric ?? []));
    if (why) return { ok: false, reason: why, points: [] };
  }
  const ys = opts.yearStart;
  const today = opts.today ?? format(new Date(), "yyyy-MM-dd");
  const latest = points[points.length - 1]?.period;
  const anchor = opts.alignTo ? periodStart(opts.alignTo, display, ys) : null;

  // The spans that hold a value with their values, oldest first (the points are).
  const spans = new Map<string, Point[]>();
  for (const p of points) {
    const s = periodStart(p.period, display, ys);
    const held = spans.get(s);
    if (held) held.push(p);
    else spans.set(s, [p]);
  }
  const out: DisplayPoint[] = [];
  for (const [start, values] of spans) {
    const last = periodEnd(start, display);
    const length = periodCount(own, start, last, ys);
    const toDate = today >= start && today <= last;
    // Where the span is cut (a day, inclusive): at the same point as `alignTo`, or at the latest value while the span
    // is not over, so a quarter two months in is two months, not two thirds of a quarter.
    let end = last;
    if (anchor) end = shiftPeriod(opts.alignTo!, display, periodsBetween(anchor, start, display));
    else if (toDate && latest <= last) end = latest;
    const inSpan = values.filter((p) => p.period <= end);
    const expected = periodCount(own, start, end, ys);
    const value = metric.formula ? valueOver(metric.slug, start, end, resolve, expected) : combined(metric.aggregation, inSpan, expected);
    if (value === undefined) continue;
    // Every value in the span lies on or before its cut (a span to date is cut at the latest value), so `inSpan`
    // is what it holds.
    out.push({ period: start, value, held: inSpan.length, length, toDate, through: end });
  }
  return { ok: true, points: out };
}

/** The views that draw a series and so can show it by a Display Period. */
export const SHOWN_BY: readonly TemplateId[] = ["number", "line", "bars", "table", "forecast"];

/** What each span is called in the setting **Show by**. */
export const DISPLAY_LABEL: Record<Span, string> = { day: "Day", week: "Week", month: "Month", quarter: "Quarter", half: "Half-year", year: "Year" };

const PLURAL: Record<Span, string> = { day: "days", week: "weeks", month: "months", quarter: "quarters", half: "half-years", year: "years" };

/** A count of spans in words: "1 month", "3 months". */
export function spanCount(n: number, span: Span): string {
  return `${n} ${n === 1 ? PLURAL[span].slice(0, -1) : PLURAL[span]}`;
}

/** Whether a value is a Display Period, for checking what a browser or a program sends. */
export function isDisplayPeriod(v: unknown): v is DisplayPeriod {
  return typeof v === "string" && (ORDER as string[]).includes(v);
}

/** How much of a span has values: "2 of 3 months". */
export function heldText(p: Pick<DisplayPoint, "held" | "length">, own: Span): string {
  return `${p.held} of ${spanCount(p.length, own)}`;
}

/** Whether a span that is over holds values for fewer of the Metric's periods than it has: a past quarter with two
 * of its three months. Shown (a span counts once half of it has values), but its sum reads low, so it is marked. */
export function isPartial(p: Pick<DisplayPoint, "held" | "length" | "toDate">): boolean {
  return !p.toDate && p.held < p.length;
}

/** A point's name, the same in every view and the export: "Q4 2026 to date, 2 of 3 months" for a span not over yet,
 * "Q2 2026, only 2 of 3 months" for one over with gaps, else the period's name. Short: "Q4 26 to date",
 * "Q2 26, 2 of 3 months". */
export function pointName(p: Pick<DisplayPoint, "period" | "held" | "length" | "toDate">, by: Span, own: Span, yearStart: YearStart, short = false): string {
  const label = periodLabel(p.period, by, yearStart, short);
  if (p.toDate) return short ? `${label} to date` : `${label} to date, ${heldText(p, own)}`;
  if (isPartial(p)) return `${label}, ${short ? "" : "only "}${heldText(p, own)}`;
  return label;
}

/** A target for one span: a minimum, a maximum, or both. */
export type SpanTarget = { min: number | null; max: number | null };

/** The targets of a series shown by a Display Period, and which kind applies, in words for the chart. */
export type ShownTargets = {
  /** Per span start; absent where no target applies. */
  at: Record<string, SpanTarget>;
  /** The Target Series combined, for drawing as a line; empty when none applies. */
  line: Point[];
  /** Whether the Metric's target range applies to the spans, drawn as a band. */
  range: boolean;
  /** Which target applies, for the chart to say; null when the Metric has none. */
  note: string | null;
};

/** What a widget of one Metric draws: its series by its Display Period (`by`), or its own periods. */
export type Shown = {
  by: Span;
  /** Shown by a longer period than the Metric's own. */
  combined: boolean;
  points: DisplayPoint[];
  /** Why the setting could not be followed (Aggregation "none"); the Metric's own periods are shown instead. */
  reason?: string;
  /** Only when combined: by its own periods a Metric keeps its target range, as always. */
  targets: ShownTargets | null;
};

const VERB = { sum: "added up", average: "averaged", last: "at its last value" } as const;

/** Each span's target: the Target Series combined by the Aggregation where every Metric period it counts has one;
 * else the target range for an average, a last value or a Derived Metric's rate; none for a sum, since a monthly
 * range of 100 to 120 says nothing exact about a quarter of uneven months. */
export function targetsBy(metric: Metric, series: Point[], points: DisplayPoint[], by: Span, yearStart: YearStart): ShownTargets {
  // Each Metric period's target once (the latest given), oldest first; a day that starts no Metric period is none.
  const targets = latestOfEach(series).filter((t) => isPeriodStart(t.period, metric.period, yearStart));
  const hasRange = metric.target_min !== null || metric.target_max !== null;
  const range = hasRange && metric.aggregation !== "sum";
  const agg = metric.aggregation;
  const at: Record<string, SpanTarget> = {};
  const line: Point[] = [];
  for (const p of points) {
    // The span's Metric periods through its cut all have a target when there are as many targets as periods.
    const v = targets.filter((t) => t.period >= p.period && t.period <= p.through);
    if (v.length && agg !== "none" && v.length === periodCount(metric.period, p.period, p.through, yearStart)) {
      // Exact, as the values are: a quarter's target of 0.1, 0.1 and 0.1 is 0.3.
      const value = agg === "last" ? v[v.length - 1].value : total(v, agg === "sum" ? 1 : v.length);
      // As for one period (targetFor): a Metric where lower is better must stay under its target, others reach it.
      at[p.period] = metric.polarity === "lower" ? { min: null, max: value } : { min: value, max: null };
      line.push({ period: p.period, value });
    } else if (range) at[p.period] = { min: metric.target_min, max: metric.target_max };
  }
  const per = DISPLAY_LABEL[by].toLowerCase();
  const one = PLURAL[metric.period].slice(0, -1);
  let note: string | null = null;
  if (line.length && line.length === points.length) note = `Target per ${per}: the Target Series ${VERB[agg as keyof typeof VERB]}.`;
  else if (line.length) note = `Target per ${per}: the Target Series where every ${one} has one${range ? ", else the target range" : ""}.`;
  else if (range) note = `Target per ${per}: the target range.`;
  else if (hasRange) note = `No target per ${per}: the target range is for one ${one}.`;
  return { at, line, range, note };
}

/** What a widget of one Metric draws: by `display` when that is longer than the Metric's own period and the Metric
 * combines, else its own periods. `today` (yyyy-mm-dd) marks the span not over yet: a Snapshot's day when drawing one. */
export function shownSeries(metric: Metric, data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today">, display: DisplayPeriod | null | undefined, opts: { today?: string } = {}): Shown {
  const own = latestOfEach(data.series[metric.slug] ?? []).map((p) => ({ ...p, held: 1, length: 1, toDate: false, through: p.period }));
  if (!display || !isLonger(display, metric.period)) return { by: metric.period, combined: false, points: own, targets: null };
  const bySlug = new Map(data.metrics.map((m) => [m.slug, m]));
  const resolve = resolverFrom(data.metrics, data.series);
  // A View Link or Snapshot leaves a Derived Metric's inputs out (only what is shown goes out): without them its
  // quarters cannot be computed, and adding up its own months would give a sum of margins.
  if (metric.formula && formulaInputs(metric.formula).some((s) => !bySlug.has(s))) {
    return { by: metric.period, combined: false, points: own, reason: INPUTS_MISSING, targets: null };
  }
  const r = seriesBy(metric, resolve, display, { yearStart: data.yearStart, today: opts.today ?? data.today });
  if (!r.ok) return { by: metric.period, combined: false, points: own, reason: r.reason, targets: null };
  return { by: display, combined: true, points: r.points, targets: targetsBy(metric, data.targets?.[metric.id] ?? [], r.points, display, data.yearStart) };
}
