// Display Periods (spec 0018; GLOSSARY: Display Period, Aggregation): a Metric's values combined into a longer period
// by its Aggregation. Pure. Widgets, Comparisons and the export all combine through `seriesBy`, so a quarter's value
// is the same in a chart, a table and a Comparison strip.
import { exactTotal } from "./exact";
import { inCondensed, partOfCondensed, partOfPoint, targetOfParts, valueOfParts, type CondensedPoint, type CondensedSpan, type Part } from "./condensed-parts";
import { format } from "date-fns";
import { evaluate, formulaInputs, inputsNotCombined, inputsProblem } from "./formula";
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
  /** Set for a Condensed Value drawn as a point of its own (GLOSSARY: Condensed Value): `period` is its span's first day
   * and `held` and `length` are the Metric periods it was made from. */
  condensed?: { into: CondensedSpan };
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
      // Stryker disable next-line ConditionalExpression: `evaluate` gives none for a formula missing an input too; this only stops early.
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
  // Sorted as text, which is time order for days written yyyy-mm-dd.
  return [...byPeriod.keys()].sort().map((period) => ({ period, value: byPeriod.get(period)! }));
}

/** The values of a span (oldest first) combined by an Aggregation, once at least half of the `expected` periods
 * have one; undefined otherwise and for none. */
function combined(aggregation: Metric["aggregation"], inSpan: readonly Point[], expected: number): number | undefined {
  // Some metrics skip periods (no deals on weekends); a span counts when at least half of it has values.
  if (!inSpan.length || inSpan.length < Math.ceil(expected / 2)) return undefined;
  if (inSpan.length === 1) return inSpan[0].value;
  // Aggregation none has no value for a span of more than one period.
  if (aggregation === "none") return undefined;
  if (aggregation === "last") return inSpan[inSpan.length - 1].value;
  return total(inSpan, aggregation === "sum" ? 1 : inSpan.length);
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
export function seriesBy(metric: Metric, resolve: Resolver, display: Span, opts: { yearStart: YearStart; today?: string; alignTo?: string; condensed?: readonly CondensedPoint[] }): SeriesBy {
  const own = metric.period;
  const points = latestOfEach(resolve(metric.slug)?.points ?? []);
  if (display === own) return { ok: true, points: points.map((p) => ({ ...p, held: 1, length: 1, toDate: false, through: p.period })) };
  if (!isLonger(display, own)) return { ok: false, reason: `A ${own}'s value cannot be split into shorter periods.`, points: [] };
  if (!combines(metric)) return { ok: false, reason: NOT_COMBINED, points: [] };
  // A Derived Metric combines through its inputs: one set to Aggregation none leaves every span empty, so it says why
  // instead of drawing an empty chart (spec 0022).
  // So do inputs of another period, or Derived Metrics themselves: no span could be computed rightly from them.
  // Both checks find nothing for a Metric that is not derived.
  const inputs = metric.formula ? formulaInputs(metric.formula).flatMap((s) => resolve(s) ?? []) : [];
  const why = inputsProblem(metric, inputs.map((r) => r.metric)) ?? inputsNotCombined(metric, inputs.map((r) => r.metric));
  if (why) return { ok: false, reason: why, points: [] };
  const inputPoints = inputs.map((r) => latestOfEach(r.points));
  const ys = opts.yearStart;
  const today = opts.today ?? format(new Date(), "yyyy-MM-dd");
  const latest = points[points.length - 1]?.period;
  const anchor = opts.alignTo ? periodStart(opts.alignTo, display, ys) : null;

  // The spans that hold a value, oldest first (sorted as text, which is time order for days written yyyy-mm-dd). A
  // Derived Metric's spans are also those its inputs have values in: each input counts once it holds half of a span,
  // so two inputs may both count in a half-year without a month of both (spec 0022, #126).
  // Condensed Values of a span no longer than the Display Period count in its spans (spec 0033); longer ones are drawn
  // as points of their own by shownSeries. A Derived Metric has none.
  const condensed = metric.formula ? [] : (opts.condensed ?? []).filter((c) => !isLonger(c.into, display));
  const starts = new Set([...points, ...inputPoints.flat(), ...condensed].map((p) => periodStart(p.period, display, ys)));
  const out: DisplayPoint[] = [];
  for (const start of [...starts].sort()) {
    const last = periodEnd(start, display);
    const length = periodCount(own, start, last, ys);
    const toDate = today >= start && today <= last;
    // Where the span is cut (a day, inclusive): at the same point as `alignTo`, or at the latest value while the span
    // is not over, so a quarter two months in is two months, not two thirds of a quarter.
    // Stryker disable next-line EqualityOperator: a latest value on the span's last day cuts it there either way.
    const atLatest = toDate && latest <= last;
    let end = last;
    if (anchor) end = shiftPeriod(opts.alignTo!, display, periodsBetween(anchor, start, display));
    else if (atLatest) end = latest;
    const inSpan = points.filter((p) => p.period >= start && p.period <= end);
    const expected = periodCount(own, start, end, ys);
    // A span with a Condensed Value in it combines parts, values and Condensed Values alike, so the number is the one
    // shown before they were condensed (spec 0033); a Condensed Value the cut falls inside has no part to give.
    const inside = condensed.filter((c) => periodStart(c.period, display, ys) === start);
    if (inside.some((c) => c.period > end)) continue;
    const parts: Part[] = inside.length ? [...inSpan.map(partOfPoint), ...inside.map(partOfCondensed)].sort((a, b) => a.period.localeCompare(b.period)) : [];
    const value = inside.length ? valueOfParts(metric.aggregation, parts, expected) : metric.formula ? valueOver(metric.slug, start, end, resolve, expected) : combined(metric.aggregation, inSpan, expected);
    if (value === undefined) continue;
    // Every value in the span lies on or before its cut (a span to date is cut at the latest value), so `inSpan`
    // is what it holds; a Derived Metric holds what the input with the fewest values holds.
    const held = metric.formula ? Math.min(...inputPoints.map((ps) => ps.filter((p) => p.period >= start && p.period <= end).length)) : inSpan.length + inside.reduce((n, c) => n + c.held, 0);
    out.push({ period: start, value, held, length, toDate, through: end });
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
  return (ORDER as unknown[]).includes(v);
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
export function pointName(p: Pick<DisplayPoint, "period" | "held" | "length" | "toDate" | "condensed">, by: Span, own: Span, yearStart: YearStart, short = false): string {
  // A Condensed Value is named by its own span, and says what it was made from: "October 2023, condensed from 31 days".
  if (p.condensed) {
    const label = periodLabel(p.period, p.condensed.into, yearStart, short);
    return `${label}, condensed from ${p.held === p.length ? spanCount(p.length, own) : heldText(p, own)}`;
  }
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
  /** Set when points are Condensed Values drawn beside the rest: "Before November 2023 shown by month, condensed from
   * daily values." (GLOSSARY: Condensed Value). */
  note?: string;
  /** Only when combined: by its own periods a Metric keeps its target range, as always. */
  targets: ShownTargets | null;
};

const VERB = { sum: "added up", average: "averaged", last: "at its last value" } as const;

/** Each span's target: the Target Series combined by the Aggregation where every Metric period it counts has one;
 * else the target range for an average, a last value or a Derived Metric's rate; none for a sum, since a monthly
 * range of 100 to 120 says nothing exact about a quarter of uneven months. */
export function targetsBy(metric: Metric, series: Point[], points: DisplayPoint[], by: Span, yearStart: YearStart, condensed: readonly CondensedPoint[] = []): ShownTargets {
  // Each Metric period's target once (the latest given), oldest first; a day that starts no Metric period is none.
  const targets = latestOfEach(series).filter((t) => isPeriodStart(t.period, metric.period, yearStart));
  const hasRange = metric.target_min !== null || metric.target_max !== null;
  const range = hasRange && metric.aggregation !== "sum";
  const agg = metric.aggregation;
  const at: Record<string, SpanTarget> = {};
  const line: Point[] = [];
  for (const p of points) {
    // The span's Metric periods through its cut all have a target when there are as many targets as periods. Condensed
    // Values inside it bring the targets of the periods they stand for, kept with them (spec 0033).
    const v = targets.filter((t) => t.period >= p.period && t.period <= p.through);
    const inside = condensed.filter((c) => c.target && (p.condensed ? c.period === p.period : c.period >= p.period && c.period <= p.through && !isLonger(c.into, by)));
    const expected = p.condensed ? p.length : periodCount(metric.period, p.period, p.through, yearStart);
    const combinedTarget = inside.length ? targetOfParts(agg, p.condensed ? [] : v, inside.map((c) => c.target!), expected) : v.length && agg !== "none" && v.length === expected ? (agg === "last" ? v[v.length - 1].value : total(v, agg === "sum" ? 1 : v.length)) : undefined;
    if (combinedTarget !== undefined) {
      // Exact, as the values are: a quarter's target of 0.1, 0.1 and 0.1 is 0.3.
      const value = combinedTarget;
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

const ADJECTIVE: Record<Span, string> = { day: "daily", week: "weekly", month: "monthly", quarter: "quarterly", half: "half-yearly", year: "yearly" };

/** A Condensed Value drawn as a point of its own, or nothing when it has too few values to count (as a span with
 * fewer than half of its periods has no value by a Display Period either). */
function condensedPoint(metric: Metric, c: CondensedPoint): DisplayPoint | null {
  const value = valueOfParts(metric.aggregation, [partOfCondensed(c)], c.of);
  return value === undefined ? null : { period: c.period, value, held: c.held, length: c.of, toDate: false, through: c.periodEnd, condensed: { into: c.into } };
}

/** The note under a widget that draws Condensed Values: "Before November 2023 shown by month, condensed from daily
 * values." It names the span after the newest one condensed, so it says where the detail starts again. */
function condensedNote(metric: Metric, drawn: readonly CondensedPoint[], yearStart: YearStart): string | undefined {
  if (!drawn.length) return undefined;
  const newest = drawn.reduce((a, b) => (b.periodEnd > a.periodEnd ? b : a));
  return `Before ${periodLabel(dayAfter(newest.periodEnd), newest.into, yearStart)} shown by ${newest.into}, condensed from ${ADJECTIVE[metric.period]} values.`;
}

/** What a widget of one Metric draws: by `display` when that is longer than the Metric's own period and the Metric
 * combines, else its own periods. `today` (yyyy-mm-dd) marks the span not over yet: a Snapshot's day when drawing one.
 * Condensed Values (spec 0033, `data.condensed`) count in the spans of a Display Period at or above theirs, so those
 * numbers are the ones shown before condensing; shown by anything shorter they are drawn as points of their own, named
 * for what they were made from, with a note, never as invented days. */
export function shownSeries(metric: Metric, data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today" | "condensed">, display: DisplayPeriod | null | undefined, opts: { today?: string } = {}): Shown {
  const condensed = metric.formula ? [] : (data.condensed?.[metric.id] ?? []);
  // A period a Condensed Value stands for shows once, as it: originals not deleted yet are not counted beside it.
  const kept = condensed.length ? (data.series[metric.slug] ?? []).filter((p) => !inCondensed(condensed, p.period)) : (data.series[metric.slug] ?? []);
  const own = latestOfEach(kept).map((p) => ({ ...p, held: 1, length: 1, toDate: false, through: p.period }));
  // The Condensed Values a view draws as points of their own, among the Metric's own points (oldest first).
  const alongside = (by: Span, points: DisplayPoint[]) => {
    const drawn = condensed.filter((c) => isLonger(c.into, by));
    const extra = drawn.flatMap((c) => condensedPoint(metric, c) ?? []);
    return { points: extra.length ? [...extra, ...points].sort((a, b) => a.period.localeCompare(b.period)) : points, drawn };
  };
  if (!display || !isLonger(display, metric.period)) {
    const { points, drawn } = alongside(metric.period, own);
    return { by: metric.period, combined: false, points, ...(drawn.length ? { note: condensedNote(metric, drawn, data.yearStart) } : {}), targets: drawn.length ? targetsBy(metric, data.targets?.[metric.id] ?? [], points.filter((p) => p.condensed), metric.period, data.yearStart, drawn) : null };
  }
  const bySlug = new Map(data.metrics.map((m) => [m.slug, m]));
  const resolve = resolverFrom(data.metrics, condensed.length ? { ...data.series, [metric.slug]: kept } : data.series);
  // A View Link or Snapshot leaves a Derived Metric's inputs out (only what is shown goes out): without them its
  // quarters cannot be computed, and adding up its own months would give a sum of margins.
  if (metric.formula && formulaInputs(metric.formula).some((s) => !bySlug.has(s))) {
    return { by: metric.period, combined: false, points: own, reason: INPUTS_MISSING, targets: null };
  }
  const r = seriesBy(metric, resolve, display, { yearStart: data.yearStart, today: opts.today ?? data.today, condensed });
  if (!r.ok) return { by: metric.period, combined: false, points: own, reason: r.reason, targets: null };
  const { points, drawn } = alongside(display, r.points);
  // Stryker disable next-line ArrayDeclaration: targetsBy keeps only targets on a Metric period's first day, so a list with anything else in it is the empty one.
  return { by: display, combined: true, points, ...(drawn.length ? { note: condensedNote(metric, drawn, data.yearStart) } : {}), targets: targetsBy(metric, data.targets?.[metric.id] ?? [], points, display, data.yearStart, condensed) };
}
