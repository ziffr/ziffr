// Retention rules (spec 0033, ticket #379; GLOSSARY: Retention, Condensed Value, Aggregation, Display Period): the
// setting and its limits, which periods a Retention touches on a given day, and how the values of a span condense into
// one Condensed Value that keeps the exact sum and count, so every longer Display Period still comes out as before.
// Pure: it reads and writes nothing; storage, the preview and the job are later tickets. Reuses the Display Period
// code (`periodCount`, `latestOfEach`, the combining rule) so the numbers stay spec 0022's one truth.
import { format, subMonths } from "date-fns";
import { displayPeriodsFor, isLonger, latestOfEach, periodCount, type DisplayPeriod } from "./display-periods";
import { fractionOf } from "./exact";
import { decimalText, sumOf, targetPartOf, valueOfParts, type Part, type TargetPart } from "./condensed-parts";
import { isPeriodStart, periodEnd, periodStart, shiftPeriod, type YearStart } from "./periods";
import type { Aggregation, Period, Point } from "./types";

/** The shortest keep time, in months: a year-over-year Comparison and last year's span stay whole. */
export const MIN_KEEP_MONTHS = 13;
/** The longest keep time the setting takes, in months (100 years): a bound on what a browser may send. */
export const MAX_KEEP_MONTHS = 1200;
/** The days after the day a Retention is confirmed that it can still be cancelled in: it starts on the next one. */
export const CANCEL_DAYS = 7;

/** The periods a Retention condenses into (GLOSSARY: Condensed Value); half-years are not offered. */
export type CondenseInto = Exclude<DisplayPeriod, "half">;

/** A Metric's Retention (null on the Metric is none): keep N months, then condense into a longer period, or delete. */
export type Retention = { keep_months: number; then: "condense"; into: CondenseInto } | { keep_months: number; then: "delete" };

/** What a Retention needs to know about a Metric. */
export type RetentionMetric = { period: Period; aggregation: Aggregation; formula?: string | null };

/** Why a Retention cannot condense a rate, said where the form offers the choice. */
export const CANNOT_CONDENSE = "A Metric with Aggregation none cannot be condensed: a made-up average must never replace real values. It can be deleted or kept.";
/** Why a Derived Metric has none. */
export const DERIVED_HAS_NONE = "A Derived Metric has no stored values, so it has no Retention.";

/** The periods the form offers to condense a Metric of this period into, shortest first (a day: week, month, quarter, year). */
export function condensesInto(period: Period): CondenseInto[] {
  return displayPeriodsFor(period).filter((d): d is CondenseInto => d !== "half");
}

/** Whether a Metric's values can be condensed: stored values, and an Aggregation to combine them by. */
export function canCondense(metric: Pick<RetentionMetric, "aggregation" | "formula">): boolean {
  return !metric.formula && metric.aggregation !== "none";
}

/** Why a Retention does not fit a Metric, or null when it does. */
export function retentionProblem(retention: Retention, metric: RetentionMetric): string | null {
  if (metric.formula) return DERIVED_HAS_NONE;
  if (!Number.isInteger(retention.keep_months) || retention.keep_months < MIN_KEEP_MONTHS) return `Keep values for at least ${MIN_KEEP_MONTHS} months, a whole number.`;
  if (retention.keep_months > MAX_KEEP_MONTHS) return `Keep values for at most ${MAX_KEEP_MONTHS} months.`;
  if (retention.then === "delete") return null;
  if (!canCondense(metric)) return CANNOT_CONDENSE;
  return condensesInto(metric.period).includes(retention.into) ? null : `A ${metric.period} Metric cannot be condensed into ${retention.into}s.`;
}

/** A Retention read from untrusted input (a browser): the shape, the words and the numbers, or why not. `null` is none. */
export function parseRetention(input: unknown): { ok: true; retention: Retention | null } | { ok: false; reason: string } {
  if (input === null) return { ok: true, retention: null };
  const bad = { ok: false as const, reason: "That is not a Retention." };
  if (typeof input !== "object" || Array.isArray(input)) return bad;
  const o = input as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== "keep_months" && k !== "then" && k !== "into")) return bad;
  const keep = o.keep_months as number;
  if (!Number.isInteger(keep) || keep < MIN_KEEP_MONTHS || keep > MAX_KEEP_MONTHS) {
    return { ok: false, reason: `Keep values for a whole number of months, from ${MIN_KEEP_MONTHS} to ${MAX_KEEP_MONTHS}.` };
  }
  if (o.then === "delete") return "into" in o ? bad : { ok: true, retention: { keep_months: keep, then: "delete" } };
  if (o.then !== "condense" || !(CONDENSE_INTO as readonly unknown[]).includes(o.into)) return bad;
  return { ok: true, retention: { keep_months: keep, then: "condense", into: o.into as CondenseInto } };
}
const CONDENSE_INTO: readonly CondenseInto[] = ["week", "month", "quarter", "year"];

/** The first day whose values are kept on `today`: the same day `keep_months` earlier, or that month's last day when
 * it is shorter. A period is older than the Retention when its last day lies before it. */
export function keptFrom(today: string, keepMonths: number): string {
  return format(subMonths(new Date(`${today}T12:00:00`), keepMonths), "yyyy-MM-dd");
}

/** The day a Retention confirmed on `confirmedOn` runs for the first time: after the days to cancel it in (the 8th). */
export function firstRunDay(confirmedOn: string): string {
  return shiftPeriod(confirmedOn, "day", CANCEL_DAYS + 1);
}

/** The day the owners are told again: the day before it runs. */
export function reminderDay(confirmedOn: string): string {
  return shiftPeriod(confirmedOn, "day", CANCEL_DAYS);
}

/** Oldest first; periods are yyyy-mm-dd, which sorts as text. */
const byPeriod = (a: { period: string }, b: { period: string }) => a.period.localeCompare(b.period);

/** A period a Metric holds a value for, and what holds it back (open work) or marks it (a Lock). */
export type StoredPeriod = { period: string; locked?: boolean; heldBack?: boolean };

/** What a Retention does on a day, by period starts; the counts of the preview come from these. */
export type RetentionPlan = {
  /** The first day kept: periods ending before it are older than the Retention. */
  keptFrom: string;
  /** Delete mode: the periods deleted, with their history. */
  delete: string[];
  /** Delete mode: how many of those are locked (the confirmation says so). */
  deletedLocked: number;
  /** Condense mode: each span made into one Condensed Value, with the periods it takes the place of. */
  condense: { period: string; periods: string[]; locked: boolean }[];
  /** Older periods left alone because open work holds them (or a period in their span). */
  heldBack: string[];
  /** Older periods left as they are because condensing their span would show a longer Display Period differently. */
  uneven: string[];
};

/** The Metric periods starting in a span of a Display Period: its first and last (weeks belong to the month their Monday is in). */
function ownPeriodsOf(own: Period, span: string, into: DisplayPeriod, ys: YearStart): { first: string; last: string } {
  let first = periodStart(span, own, ys);
  if (first < span) first = shiftPeriod(first, own, 1);
  const count = periodCount(own, span, periodEnd(span, into), ys);
  return { first, last: shiftPeriod(first, own, count - 1) };
}

/** What the Retention does to the periods a Metric holds on `today`: which are deleted, or which spans are condensed,
 * and which older ones are left alone and why. A span is condensed only when every Metric period in it is older than
 * the Retention and none is held back, and only when every Display Period at or above it shows the same numbers (a
 * week across two months is left as days: the month would count it whole). Periods inside the keep time are never
 * touched. Throws for a Retention that does not fit the Metric: ask `retentionProblem` first. */
export function retentionPlan(retention: Retention, metric: RetentionMetric, stored: readonly StoredPeriod[], today: string, yearStart: YearStart): RetentionPlan {
  const problem = retentionProblem(retention, metric);
  if (problem) throw new Error(problem);
  const cutoff = keptFrom(today, retention.keep_months);
  const older = [...stored].filter((s) => periodEnd(s.period, metric.period) < cutoff).sort(byPeriod);
  const plan: RetentionPlan = { keptFrom: cutoff, delete: [], deletedLocked: 0, condense: [], heldBack: [], uneven: [] };
  if (retention.then === "delete") {
    for (const s of older) {
      if (s.heldBack) plan.heldBack.push(s.period);
      else {
        plan.delete.push(s.period);
        if (s.locked) plan.deletedLocked++;
      }
    }
    return plan;
  }
  const into = retention.into;
  const spans = new Map<string, StoredPeriod[]>();
  for (const s of older) {
    const start = periodStart(s.period, into, yearStart);
    spans.set(start, [...(spans.get(start) ?? []), s]);
  }
  for (const [span, members] of spans) {
    const { first, last } = ownPeriodsOf(metric.period, span, into, yearStart);
    // Every Metric period of the span is older than the Retention, or the span waits: its newest has not left the keep time.
    if (periodEnd(last, metric.period) >= cutoff) continue;
    const periods = members.map((m) => m.period);
    if (members.some((m) => m.heldBack)) plan.heldBack.push(...periods);
    else if (displayPeriodsFor(metric.period).some((d) => isLonger(d, into) && periodStart(first, d, yearStart) !== periodStart(last, d, yearStart))) plan.uneven.push(...periods);
    else plan.condense.push({ period: span, periods, locked: members.every((m) => m.locked) });
  }
  return plan;
}

/** The one value that stands for a longer period (GLOSSARY: Condensed Value). `sum` and `held` are exact, so an
 * average over any longer span is the sum of the sums over the count; `last` is the last value and the day it was for. */
export type Condensed = {
  /** The span's first day. */
  period: string;
  into: CondenseInto;
  /** How many Metric periods in the span had a value. */
  held: number;
  /** How many Metric periods the span has in all ("October 2023, only 20 of 31 days"). */
  of: number;
  /** The exact sum as a decimal text, for Aggregation sum and average; null for last value. */
  sum: string | null;
  /** The last value (as text) and the Metric period it was for, for Aggregation last value; null otherwise. */
  last: { value: string; day: string } | null;
  /** Locked when every period in the span was locked. */
  locked: boolean;
};

/** The values of a span (any order, a period given twice counts once with the value given last) condensed into one
 * Condensed Value by the Metric's Aggregation, or null when there is nothing to condense or the Metric cannot be.
 * `span` is the first day of the span, `locked` whether every period in it was. */
export function condense(metric: RetentionMetric, into: CondenseInto, span: string, values: readonly Point[], yearStart: YearStart, locked = false): Condensed | null {
  if (!canCondense(metric)) return null;
  const held = latestOfEach(values).filter((p) => periodStart(p.period, into, yearStart) === span);
  if (!held.length) return null;
  const of = periodCount(metric.period, span, periodEnd(span, into), yearStart);
  const newest = held[held.length - 1];
  const sum = metric.aggregation === "last" ? null : decimalText(sumOf(held.map((p) => fractionOf(p.value))));
  const last = metric.aggregation === "last" ? { value: String(newest.value), day: newest.period } : null;
  return { period: span, into, held: held.length, of, sum, last, locked };
}

/** One span of a series built from parts. */
export type PartsPoint = { period: string; value: number; held: number; length: number };

/** A series by a Display Period at or above every Condensed Value's, made of parts (values and Condensed Values),
 * for spans that are over: what `seriesBy` shows before condensing, and must show after. Oldest first. */
export function seriesFromParts(aggregation: Aggregation, own: Period, display: DisplayPeriod, parts: readonly Part[], yearStart: YearStart): PartsPoint[] {
  const bySpan = new Map<string, Part[]>();
  for (const p of [...parts].sort(byPeriod)) {
    const start = periodStart(p.period, display, yearStart);
    bySpan.set(start, [...(bySpan.get(start) ?? []), p]);
  }
  const out: PartsPoint[] = [];
  // The spans come in the order their first part did: oldest first.
  for (const [start, inSpan] of bySpan) {
    const length = periodCount(own, start, periodEnd(start, display), yearStart);
    const value = valueOfParts(aggregation, inSpan, length);
    if (value !== undefined) out.push({ period: start, value, held: inSpan.reduce((n, p) => n + p.held, 0), length });
  }
  return out;
}

/** The Target of a condensed span (spec 0033): the Targets of the Metric's periods that start in the span (each period's
 * latest, as the Target Series are read), kept as a count, an exact sum and the last one, so a longer Display Period
 * still has the Target it had before. Null for a Metric that cannot be condensed or a span without a Target. */
export function condensedTarget(metric: RetentionMetric, into: CondenseInto, span: string, targets: readonly Point[], yearStart: YearStart): TargetPart | null {
  if (!canCondense(metric)) return null;
  const end = periodEnd(span, into);
  return targetPartOf(latestOfEach(targets.filter((t) => t.period >= span && t.period <= end && isPeriodStart(t.period, metric.period, yearStart))));
}

