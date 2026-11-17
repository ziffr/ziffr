// Display Periods (spec 0018; GLOSSARY: Display Period, Aggregation): a Metric's values combined into a longer period
// by its Aggregation. Pure. Widgets, Comparisons and the export all combine through `seriesBy`, so a quarter's value
// is the same in a chart, a table and a Comparison strip.
import { format } from "date-fns";
import { evaluate, formulaInputs } from "./formula";
import { periodEnd, periodLabel, periodsBetween, periodStart, shiftPeriod, type Span, type YearStart } from "./periods";
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
  if (display === own) return { ok: true, points: points.map((p) => ({ ...p, held: 1, length: 1, toDate: false, through: p.period })) };
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
    out.push({ period: start, value, held: anchor ? points.filter((p) => p.period >= start && p.period <= end).length : n, length, toDate, through: end });
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
  const byPeriod = new Map(series.map((t) => [t.period, t.value]));
  const hasRange = metric.target_min !== null || metric.target_max !== null;
  const range = hasRange && metric.aggregation !== "sum";
  const agg = metric.aggregation;
  const at: Record<string, SpanTarget> = {};
  const line: Point[] = [];
  for (const p of points) {
    const starts: string[] = [];
    for (let s = periodStart(p.period, metric.period, yearStart); s <= p.through; s = shiftPeriod(s, metric.period, 1)) if (s >= p.period) starts.push(s);
    const vals = starts.map((s) => byPeriod.get(s));
    if (starts.length && agg !== "none" && vals.every((v) => v !== undefined)) {
      const v = vals as number[];
      const value = agg === "sum" ? v.reduce((a, b) => a + b, 0) : agg === "average" ? v.reduce((a, b) => a + b, 0) / v.length : v[v.length - 1];
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
  const own = (data.series[metric.slug] ?? []).map((p) => ({ ...p, held: 1, length: 1, toDate: false, through: p.period }));
  if (!display || !isLonger(display, metric.period)) return { by: metric.period, combined: false, points: own, targets: null };
  const bySlug = new Map(data.metrics.map((m) => [m.slug, m]));
  const resolve: Resolver = (slug) => {
    const m = bySlug.get(slug);
    return m ? { metric: m, points: data.series[slug] ?? [] } : undefined;
  };
  // A View Link or Snapshot leaves a Derived Metric's inputs out (only what is shown goes out): without them its
  // quarters cannot be computed, and adding up its own months would give a sum of margins.
  if (metric.formula && formulaInputs(metric.formula).some((s) => !bySlug.has(s))) {
    return { by: metric.period, combined: false, points: own, reason: INPUTS_MISSING, targets: null };
  }
  const r = seriesBy(metric, resolve, display, { yearStart: data.yearStart, today: opts.today ?? data.today });
  if (!r.ok) return { by: metric.period, combined: false, points: own, reason: r.reason, targets: null };
  return { by: display, combined: true, points: r.points, targets: targetsBy(metric, data.targets?.[metric.id] ?? [], r.points, display, data.yearStart) };
}
