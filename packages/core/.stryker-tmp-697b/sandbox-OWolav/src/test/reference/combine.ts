// @ts-nocheck
// The reference for combining a Metric's periods into a longer one (spec 0022, Testing Decisions; GLOSSARY:
// Aggregation, Display Period, Target Series, Comparison, Snapshot). It applies the rules as the spec and the glossary
// write them, by walking every calendar day, with exact numbers, and shares nothing with display-periods.ts but types:
// - a Metric period belongs to the span its first day falls in (a week to the month its Monday is in);
// - a period given more than once counts once, with the value given last (the latest value of a period wins);
// - a span is shown once it holds at least one value and at least half of the Metric periods it counts;
// - the span `today` falls in is to date: it counts up to its latest value. With a Comparison's cut (`alignTo`), every
//   span counts up to the point the cut sits at in its own span instead;
// - a sum adds the values, an average divides that by how many there are, the last value is that of the latest period;
//   Aggregation none never combines, and a span never splits into shorter periods.
import type { Span, YearStart } from "../../periods";
import type { Aggregation, Point, Polarity } from "../../types";
import { dayOf, samePoint, spanEnd, spanStart, startsSpan, textOf, type Day } from "./calendar";
import { dividedBy, exactOf, sumOf, type Exact } from "./exact";

const RANK: Record<Span, number> = { day: 0, week: 1, month: 2, quarter: 3, half: 4, year: 5 };

/** One span as the reference works it out: its first day, its value held exactly, and how it was counted. */
export type ReferenceSpan = { period: string; value: Exact; held: number; length: number; toDate: boolean; through: string };

/** What the reference says a series by a Display Period is: its spans, or that it cannot be combined. */
export type ReferenceSeries = { ok: true; spans: ReferenceSpan[] } | { ok: false };

/** The options of a series by a Display Period: the Fiscal Year's first month, the day it is read on, the cut. */
export type ReferenceOptions = { yearStart: YearStart; today: string; alignTo?: string };

/** The latest value of each period, oldest first: a period given twice keeps the value given last. */
export function latestOfEach(points: readonly Point[]): { day: Day; value: Exact; number: number }[] {
  const byDay = new Map<Day, { value: Exact; number: number }>();
  for (const p of points) byDay.set(dayOf(p.period), { value: exactOf(p.value), number: p.value });
  return [...byDay].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day - b.day);
}

/** The values of a span combined by an Aggregation, oldest first; nothing for none. */
export function combine(aggregation: Aggregation, values: readonly Exact[]): Exact | null {
  if (!values.length || aggregation === "none") return null;
  if (aggregation === "sum") return sumOf(values);
  if (aggregation === "average") return dividedBy(sumOf(values), values.length);
  return values[values.length - 1];
}

/** A Metric's series by a Display Period, worked out day by day. */
export function referenceSeries(points: readonly Point[], own: Span, display: Span, aggregation: Aggregation, opts: ReferenceOptions): ReferenceSeries {
  const values = latestOfEach(points);
  for (const v of values) if (!startsSpan(v.day, own, opts.yearStart)) throw new Error(`${textOf(v.day)} does not start a ${own}`);
  if (display === own) return { ok: true, spans: values.map((v) => ({ period: textOf(v.day), value: v.value, held: 1, length: 1, toDate: false, through: textOf(v.day) })) };
  if (RANK[display] < RANK[own] || aggregation === "none") return { ok: false };
  if (!values.length) return { ok: true, spans: [] };

  const ys = opts.yearStart;
  const today = dayOf(opts.today);
  const latest = values[values.length - 1].day;
  const valueAt = new Map(values.map((v) => [v.day, v.value]));
  // Walk every day from the first value's span to the last one's: note where each span starts, and in which span
  // each Metric period starts.
  const spans: { start: Day; periods: Day[] }[] = [];
  const first = spanStart(values[0].day, display, ys);
  const last = spanEnd(spanStart(latest, display, ys), display, ys);
  for (let day = first; day <= last; day++) {
    if (startsSpan(day, display, ys)) spans.push({ start: day, periods: [] });
    if (startsSpan(day, own, ys)) spans[spans.length - 1].periods.push(day);
  }
  const out: ReferenceSpan[] = [];
  for (const { start, periods } of spans) {
    const end = spanEnd(start, display, ys);
    if (!periods.some((d) => valueAt.has(d))) continue;
    const toDate = start <= today && today <= end;
    const cut = opts.alignTo ? samePoint(dayOf(opts.alignTo), start, display, ys) : toDate ? Math.min(end, latest) : end;
    const counted = periods.filter((d) => d <= cut);
    const held = counted.filter((d) => valueAt.has(d)).map((d) => valueAt.get(d)!);
    if (!held.length || 2 * held.length < counted.length) continue;
    out.push({ period: textOf(start), value: combine(aggregation, held)!, held: held.length, length: periods.length, toDate, through: textOf(cut) });
  }
  return { ok: true, spans: out };
}

/** The value of a Metric over the Metric periods starting from `from` through `to`, counted when at least half of
 * the `expected` ones have a value: what a Comparison of one period reads. */
export function referenceValueOver(points: readonly Point[], aggregation: Aggregation, from: string, to: string, expected: number): Exact | null {
  const held = latestOfEach(points).filter((v) => v.day >= dayOf(from) && v.day <= dayOf(to));
  if (!held.length || 2 * held.length < expected) return null;
  if (held.length === 1) return held[0].value;
  return combine(aggregation, held.map((v) => v.value));
}

/** One span's target as the reference works it out. */
export type ReferenceTarget = { min: Exact | null; max: Exact | null };

/** The targets of a series by a Display Period: the Target Series combined by the Aggregation over every Metric
 * period a span counts, where each has one; else the target range unless the values are added up; else none. */
export function referenceTargets(
  targets: readonly Point[],
  spans: readonly Pick<ReferenceSpan, "period" | "through">[],
  metric: { period: Span; aggregation: Aggregation; polarity: Polarity; target_min: number | null; target_max: number | null },
  yearStart: YearStart,
): { at: Record<string, ReferenceTarget>; line: { period: string; value: Exact }[] } {
  const byDay = new Map(latestOfEach(targets).map((t) => [t.day, t.value]));
  const range = (metric.target_min !== null || metric.target_max !== null) && metric.aggregation !== "sum";
  const at: Record<string, ReferenceTarget> = {};
  const line: { period: string; value: Exact }[] = [];
  for (const s of spans) {
    const periods: Day[] = [];
    for (let day = dayOf(s.period); day <= dayOf(s.through); day++) if (startsSpan(day, metric.period, yearStart)) periods.push(day);
    const value = periods.every((d) => byDay.has(d)) ? combine(metric.aggregation, periods.map((d) => byDay.get(d)!)) : null;
    if (value) {
      at[s.period] = metric.polarity === "lower" ? { min: null, max: value } : { min: value, max: null };
      line.push({ period: s.period, value });
    } else if (range) {
      at[s.period] = { min: metric.target_min === null ? null : exactOf(metric.target_min), max: metric.target_max === null ? null : exactOf(metric.target_max) };
    }
  }
  return { at, line };
}

/** The Metric periods a Snapshot ending on `end` keeps: those over by its last day. */
export function referenceKept(points: readonly Point[], own: Span, end: string, yearStart: YearStart): Point[] {
  const last = dayOf(end);
  return points.filter((p) => spanEnd(dayOf(p.period), own, yearStart) <= last);
}

/** The day after a day: a Snapshot is read on the day after its period, by which the period is over. */
export function nextDay(day: string): string {
  return textOf(dayOf(day) + 1);
}
