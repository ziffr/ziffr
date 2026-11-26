// The reference for Derived Metrics (spec 0022, "Derived Metrics, exhaustively"; GLOSSARY: Derived Metric,
// Aggregation, Display Period): a Derived Metric's value per period and over a longer span, worked out day by day
// with exact numbers, from the rules as written, sharing nothing with display-periods.ts or workspace-data.ts:
// - per period: the formula on the latest value of each input in that period; none where an input has none, or the
//   formula has no value (a division by zero). prev and change look at the input's value in the period right before
//   this one (a day before, seven days, a month, three or twelve), and give none when it has no value there;
// - over a span: each input is combined by its own Aggregation over the Metric periods the span counts, and counts
//   when it holds at least half of them (as any Metric's span); the formula is worked out on those combined values,
//   so a margin of sums and never a sum of margins; it is exact on each combined value as Ziffr holds it, the double
//   nearest to it (an average of 1/3 cannot be held exactly). A span is shown when every input counts and the formula has a
//   value; it is looked at wherever an input has a value;
// - the span today falls in is to date, counted up to the Derived Metric's latest period (the latest with a value of
//   every input), or in full when there is none; a Comparison's cut cuts every span at the same point instead;
// - what a span holds is what the input with the fewest values in it holds;
// - target({x}) (spec 0062): over the periods counted, none where a Condensed Value of x lies between the span's first
//   day and the cut; where any of them has a Target Series value, all must (each readable), combined by x's
//   Aggregation (one period: that value); where none has one, the Target Range's one number (its only bound, or the
//   number both are) for one period, an average or a last value.
import type { Span, YearStart } from "../../periods";
import type { Aggregation, Point } from "../../types";
import { dayOf, monthsLater, samePoint, spanEnd, spanStart, startsSpan, textOf, type Day } from "./calendar";
import { combine, latestOfEach, type ReferenceSpan } from "./combine";
import { exactOf, nearestDoubleOf, type Exact } from "./exact";
import { referenceEvaluate, referenceInputs, referenceTargetInputs } from "./formula";

/** What target() reads of an input: its Target Range, its Target Series (a value that cannot be read is NaN) and the
 * spans whose values were condensed. */
export type ReferenceAim = { min: number | null; max: number | null; series: readonly Point[]; condensed?: readonly { period: string; periodEnd: string }[] };

/** One input of a Derived Metric: its slug, its values, its Aggregation and, where a formula reads it, its targets. */
export type ReferenceInput = { slug: string; points: readonly Point[]; aggregation: Aggregation; aim?: ReferenceAim };

/** The one number of a range: what is left when the bounds that are there are one and the same. */
export function referenceRangeNumber(min: number | null, max: number | null): Exact | null {
  const bounds = new Set([min, max].filter((b): b is number => b !== null));
  return bounds.size === 1 ? exactOf([...bounds][0]) : null;
}

/** What target() gives for the periods `counted` of a span that runs from `from` to the cut. */
export function referenceTarget(aim: ReferenceAim, aggregation: Aggregation, counted: readonly Day[], from: Day, cut: Day): Exact | null {
  if (!counted.length || aim.condensed?.some((c) => dayOf(c.period) <= cut && dayOf(c.periodEnd) >= from)) return null;
  // A value given later for a period replaces an earlier one.
  const given = new Map(aim.series.map((p) => [dayOf(p.period), p.value]));
  const own = counted.flatMap((d) => (given.has(d) ? [given.get(d)!] : []));
  if (!own.length) return counted.length === 1 || aggregation === "average" || aggregation === "last" ? referenceRangeNumber(aim.min, aim.max) : null;
  if (own.length < counted.length || !own.every((v) => Number.isFinite(v))) return null;
  return own.length === 1 ? exactOf(own[0]) : combine(aggregation, own.map((v) => exactOf(v)));
}

/** The targets a formula reads, as the evaluator names them, for a span; each as Ziffr holds it. */
function aimed(formula: string, inputs: readonly ReferenceInput[], counted: readonly Day[], from: Day, cut: Day, condensed: boolean): [string, Exact][] {
  return referenceTargetInputs(formula).flatMap((slug): [string, Exact][] => {
    const i = inputs.find((x) => x.slug === slug);
    const goal = i?.aim ? referenceTarget(condensed ? i.aim : { ...i.aim, condensed: [] }, i.aggregation, counted, from, cut) : null;
    return goal ? [[`target:${slug}`, exactOf(nearestDoubleOf(goal))]] : [];
  });
}

/** The inputs a formula names: only those count, whatever else is at hand. */
const named = (formula: string, given: readonly ReferenceInput[]) => given.filter((i) => referenceInputs(formula).includes(i.slug));

/** The first day of the period before the one starting on `day`, for a Metric counted by `own`. */
function before(day: Day, own: Span): Day {
  if (own === "day") return day - 1;
  if (own === "week") return day - 7;
  return monthsLater(day, -{ month: 1, quarter: 3, half: 6, year: 12 }[own]);
}

/** The Derived Metric's value per period, oldest first; `own` is its period, which prev and change step back by. */
export function referenceDerivedPeriods(formula: string, given: readonly ReferenceInput[], own: Span = "month"): { day: Day; value: Exact }[] {
  const inputs = named(formula, given);
  const each = inputs.map((i) => new Map(latestOfEach(i.points).map((v) => [v.day, v.value])));
  const days = [...new Set(each.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const out: { day: Day; value: Exact }[] = [];
  for (const day of days) {
    if (!each.every((m) => m.has(day))) continue;
    const earlier = before(day, own);
    const now = inputs.map((i, k) => [i.slug, each[k].get(day)!] as const);
    const was = inputs.flatMap((i, k) => (each[k].has(earlier) ? [[`prev:${i.slug}`, each[k].get(earlier)!] as const] : []));
    // By its own period a value is worked out from the values that are there; a condensed period has none.
    const value = referenceEvaluate(formula, Object.fromEntries([...now, ...was, ...aimed(formula, inputs, [day], day, day, false)]));
    if (value) out.push({ day, value });
  }
  return out;
}

/** The Derived Metric's spans by a longer Display Period. */
export function referenceDerivedSeries(formula: string, given: readonly ReferenceInput[], own: Span, display: Span, opts: { yearStart: YearStart; today: string; alignTo?: string }): ReferenceSpan[] {
  const inputs = named(formula, given);
  const ys = opts.yearStart;
  const each = inputs.map((i) => new Map(latestOfEach(i.points).map((v) => [v.day, v.value])));
  const all = each.flatMap((m) => [...m.keys()]);
  if (!all.length) return [];
  const own_ = referenceDerivedPeriods(formula, inputs);
  const latest = own_.length ? own_[own_.length - 1].day : null;
  const today = dayOf(opts.today);
  const out: ReferenceSpan[] = [];
  // Walk every day from the span of the first input value to the end of the span of the last one.
  const first = spanStart(Math.min(...all), display, ys);
  const last = spanEnd(spanStart(Math.max(...all), display, ys), display, ys);
  let start = first;
  while (start <= last) {
    const end = spanEnd(start, display, ys);
    const periods: Day[] = [];
    for (let d = start; d <= end; d++) if (startsSpan(d, own, ys)) periods.push(d);
    const looked = each.some((m) => periods.some((d) => m.has(d)));
    const toDate = start <= today && today <= end;
    const cut = opts.alignTo ? samePoint(dayOf(opts.alignTo), start, display, ys) : toDate && latest !== null ? Math.min(end, latest) : end;
    const counted = periods.filter((d) => d <= cut);
    const values = each.map((m) => counted.filter((d) => m.has(d)).map((d) => m.get(d)!));
    const counts = looked && values.every((v) => v.length > 0 && 2 * v.length >= counted.length);
    // Each input as Ziffr holds its combined value: the double nearest to it (an average of 1/3 is 0.333…3).
    const held = (x: Exact) => exactOf(nearestDoubleOf(x));
    const combined = counts ? Object.fromEntries([...inputs.map((i, k) => [i.slug, held(values[k].length === 1 ? values[k][0] : combine(i.aggregation, values[k])!)] as const), ...aimed(formula, inputs, counted, start, cut, true)]) : null;
    const value = combined ? referenceEvaluate(formula, combined) : null;
    if (value) out.push({ period: textOf(start), value, held: Math.min(...values.map((v) => v.length)), length: periods.length, toDate, through: textOf(cut) });
    start = end + 1;
  }
  return out;
}
