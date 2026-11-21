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
// - what a span holds is what the input with the fewest values in it holds.
import type { Span, YearStart } from "../../periods";
import type { Aggregation, Point } from "../../types";
import { dayOf, monthsLater, samePoint, spanEnd, spanStart, startsSpan, textOf, type Day } from "./calendar";
import { combine, latestOfEach, type ReferenceSpan } from "./combine";
import { exactOf, nearestDoubleOf, type Exact } from "./exact";
import { referenceEvaluate, referenceInputs } from "./formula";

/** One input of a Derived Metric: its slug, its values and its Aggregation. */
export type ReferenceInput = { slug: string; points: readonly Point[]; aggregation: Aggregation };

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
    const value = referenceEvaluate(formula, Object.fromEntries([...now, ...was]));
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
    const combined = counts ? Object.fromEntries(inputs.map((i, k) => [i.slug, held(values[k].length === 1 ? values[k][0] : combine(i.aggregation, values[k])!)])) : null;
    const value = combined ? referenceEvaluate(formula, combined) : null;
    if (value) out.push({ period: textOf(start), value, held: Math.min(...values.map((v) => v.length)), length: periods.length, toDate, through: textOf(cut) });
    start = end + 1;
  }
  return out;
}
