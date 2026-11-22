// Before and after (GLOSSARY: Analysis, Takeaway, Recipe; spec 0041, Method `afterDate`): did a Metric run above or below where
// its own trend pointed after a date, and by how much, with the range that gap is likely between. The Recipe "Did it work?"
// asks it, optionally with a Metric that should not have been touched, set beside it. Pure.
//
// The trend is the least-squares straight line through the periods before the date, by their position in the calendar (a
// period without a value leaves a gap in the positions and is never filled in). The periods that start on or after the date are
// "after"; a period that began before the date and runs past it holds both and is left out of both, and said. The gap is
// the mean of the values after, less the mean of the line's values there (the line's value at the mean position, for a line),
// worked out exactly on the values' text; only the last step to a double is not exact.
//
// The range is the textbook prediction interval for the mean of m new values about a line fitted to n: the gap ± t · s ·
// √(1/m + 1/n + (x̄ₐ − x̄ᵦ)² ÷ Sxx), with s² = SSE ÷ (n − 2) the squared misses of the line before the date and t the point of
// Student's t curve with n − 2 degrees of freedom that holds 80 % (0.9 below it, t-curve.ts). It assumes the ups and downs
// after the date are as large as those before it, that each is independent of the one before, and that the trend would have
// carried on: the Takeaway says so. It is a range, never a verdict: no strength word is given.
import { readSeries } from "../basis";
import { fractionOf, nearest, type Fraction } from "../exact";
import { formatDate, formatNumber, type ValueUnit } from "../format";
import { periodEnd, periodsBetween, type Span } from "../periods";
import { checkSuitability, type Finding } from "../suitability";
import { decimalsFor, plainValue, SHARE_UNIT, signedText, sizeText } from "../takeaways/sizes";
import { answerTakeaway, refusalTakeaway, sayIn, type Figure, type NumberRow, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";
import type { CaseKey, Slots } from "../takeaways/wording";
import type { Point } from "../types";
import { add, div, mul, sub, total, whole } from "./fractions";
import { LIKELY, tQuantile } from "./t-curve";

/** How many periods before the date a Takeaway looks at, at most: the latest 120 (spec 0041, Limits). */
export const MAX_PERIODS = 120;

/** The values of a series split at a date: those that start before it and end before it (`before`), those that start on or
 * after it (`after`), and the one that began before the date and runs past it, which belongs to neither (`straddle`). */
export type Split = { before: Point[]; after: Point[]; straddle: Point | null };

/** The gap to the trend and its range. `gap` is what the values after the date averaged, less what the trend gave there; `lo` and
 * `hi` are the 80 % range around it; `share` is the same as a percentage of where the trend pointed, where that is above 0. `fits`
 * says the line before the date had no miss at all, so the range has no width to go by. */
export type AfterDate = {
  ok: true;
  before: number;
  after: number;
  /** The slope of the trend, in the Metric's unit per period. */
  slope: number;
  /** Where the trend pointed, averaged over the periods after the date. */
  expected: number;
  /** What the values after the date averaged. */
  actual: number;
  gap: number;
  half: number;
  lo: number;
  hi: number;
  /** The typical miss of the line before the date: √(SSE ÷ (n − 2)). */
  spread: number;
  share: { gap: number; lo: number; hi: number } | null;
  fits: boolean;
};

/** Why there is no gap: the date is not a day, fewer than 3 values before it or none after it, or a number too large to work out. */
export type NoAfterDate = { ok: false; why: "date" | "before" | "after" | "huge" };

const ZERO = BigInt(0);

/** Whether a text is a real calendar day written yyyy-mm-dd. */
export function isDay(text: unknown): text is string {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, day] = text.split("-").map(Number);
  // setUTCFullYear, since Date.UTC reads the years 0 to 99 as 1900 to 1999. A month or a day that is too large or too small rolls
  // over into another month, so the month still being the one written says the whole date is real.
  const d = new Date(0);
  d.setUTCFullYear(y, m - 1, day);
  return d.getUTCMonth() === m - 1;
}

/** The series split at a date; null where `date` is not a day. A value that is not a number is no value, a period twice counts
 * once with the value given last, and the periods run oldest first. */
export function splitAt(points: Point[], span: Span, date: string): Split | null {
  if (!isDay(date)) return null;
  const out: Split = { before: [], after: [], straddle: null };
  for (const p of readSeries(points)) {
    if (p.period >= date) out.after.push(p);
    else if (periodEnd(p.period, span) >= date) out.straddle = p;
    else out.before.push(p);
  }
  return out;
}

/** The gap of the values on or after `date` to the straight-line trend of the values before it, and the 80 % range it is likely
 * between, as described above. */
export function afterDate(points: Point[], span: Span, date: string): AfterDate | NoAfterDate {
  const split = splitAt(points, span, date);
  if (!split) return { ok: false, why: "date" };
  const { before, after } = split;
  const n = before.length;
  // A line needs 3 values to have a miss to judge by (n − 2 degrees of freedom).
  if (n < 3) return { ok: false, why: "before" };
  if (after.length === 0) return { ok: false, why: "after" };
  const first = before[0].period;
  const [xs, ys] = [before.map((p) => whole(periodsBetween(first, p.period, span))), before.map((p) => fractionOf(p.value))];
  const [xa, ya] = [after.map((p) => whole(periodsBetween(first, p.period, span))), after.map((p) => fractionOf(p.value))];
  const mean = (fs: Fraction[]) => div(total(fs), whole(fs.length));
  const [mx, my, mxa, mya] = [mean(xs), mean(ys), mean(xa), mean(ya)];
  const dx = xs.map((x) => sub(x, mx));
  const dy = ys.map((y) => sub(y, my));
  const sxx = total(dx.map((d) => mul(d, d)));
  const sxy = total(dx.map((d, i) => mul(d, dy[i])));
  const syy = total(dy.map((d) => mul(d, d)));
  const slope = div(sxy, sxx);
  // The squared misses of the line: Syy less what the line accounts for (Sxy ÷ Sxx · Sxy), exactly.
  const sse = sub(syy, mul(slope, sxy));
  const variance = div(sse, whole(n - 2));
  const reach = sub(mxa, mx);
  const expected = add(my, mul(slope, reach));
  const gap = sub(mya, expected);
  // The spread of a mean of m new values about a line that was fitted to n: 1/m + 1/n + (x̄ₐ − x̄ᵦ)² ÷ Sxx, times the squared miss.
  const factor = add(add(div(whole(1), whole(after.length)), div(whole(1), whole(n))), div(mul(reach, reach), sxx));
  // Past the most degrees of freedom the curve is worked out for, the point is NaN, which the check below turns into "huge".
  const half = tQuantile(LIKELY, n - 2) * Math.sqrt(nearest(mul(variance, factor)));
  const [gapNumber, expectedNumber] = [nearest(gap), nearest(expected)];
  const [lo, hi] = [gapNumber - half, gapNumber + half];
  const spread = Math.sqrt(nearest(variance));
  if (![gapNumber, expectedNumber, half, lo, hi, spread].every(Number.isFinite)) return { ok: false, why: "huge" };
  // A share of where the trend pointed is only said where that is above 0: a share of 0 or of a negative level means nothing.
  const level = expected.num > ZERO ? expectedNumber : null;
  const hundred = level === null ? null : nearest(div(mul(gap, whole(100)), expected));
  const wide = level === null ? null : (half / level) * 100;
  if (hundred !== null && ![hundred, wide!].every(Number.isFinite)) return { ok: false, why: "huge" };
  const share = hundred === null ? null : { gap: hundred, lo: hundred - wide!, hi: hundred + wide! };
  return { ok: true, before: n, after: after.length, slope: nearest(slope), expected: expectedNumber, actual: nearest(mya), gap: gapNumber, half, lo, hi, spread, share, fits: sse.num === ZERO };
}

/** One series said in words for `afterDateTakeaway`: the lines that refuse, or the sentence and the lines that go with it. */
type Refused = { refusals: string[] };
type Piece = { sentence: string; clear: boolean; counts: { before: number; after: number }; cautions: string[]; notes: string[]; numbers: NumberRow[]; figures: Figure[]; range: NonNullable<Takeaway["range"]> };
const refused = (x: Refused | Piece): x is Refused => "refusals" in x;

// One series' Takeaway pieces: the date, the checks, the gap and its range written in the unit (or as a share of the trend).
function lookAt(name: string, points: Point[], span: Span, date: string, unit: ValueUnit, ctx: TakeawayContext, main: boolean): Refused | Piece {
  const text = (key: CaseKey, slots: Slots = {}) => sayIn(key, { span, ...slots }, ctx);
  const refuse = (...refusals: string[]): Refused => ({ refusals });
  if (!isDay(date)) return refuse(text("refuse-date"));
  const since = formatDate(date);
  // Only the latest periods before the date are used; the rest are said to be left out.
  const split = splitAt(points, span, date)!;
  const used = split.before.slice(-MAX_PERIODS);
  const notes: string[] = [];
  if (used.length < split.before.length) notes.push(text("ba-note-latest", { n: used.length, since }));
  if (split.straddle) notes.push(text("ba-note-straddle", { from: split.straddle.period, since }));
  // The checks look at the whole series (the values before, the one that holds the date, and those after); the minimum of 6 is
  // held to the periods before the date that the line is fitted to, which are the ones counted in `periods`.
  const whole = [...used, split.straddle, ...split.after].filter((p): p is Point => p !== null);
  const verdict = checkSuitability("afterDate", { series: [{ name, points: whole }], span, periods: used.length });
  const found = (f: Finding) => text(f.case, f.slots);
  if (verdict.refusals.length > 0) return refuse(...verdict.refusals.map(found));
  const cautions = verdict.cautions.map(found);
  if (split.after.length === 0) return refuse(text("refuse-no-after", { name, since }));
  const result = afterDate([...used, ...split.after], span, date);
  // Past the checks, only a number too large to work out is left to refuse.
  if (!result.ok) return refuse(text("refuse-huge-values", { name }));
  const style = ctx.style;
  // Where the trend pointed is above 0, the gap is said as a share of it; otherwise in the Metric's unit.
  const [unitUsed, values, base] = result.share ? [SHARE_UNIT, result.share, SHARE_UNIT.decimals] : [unit, { gap: result.gap, lo: result.lo, hi: result.hi }, unit.decimals];
  const decimals = decimalsFor([values.gap, values.lo, values.hi], base, style);
  if (decimals === null) return refuse(text("refuse-tiny", { name }));
  const [lo, hi] = [signedText(values.lo, unitUsed, decimals, style), signedText(values.hi, unitUsed, decimals, style)];
  const clear = values.lo > 0 || values.hi < 0;
  const size = sizeText(values.gap, unitUsed, decimals, style);
  // Stryker disable next-line EqualityOperator: a gap of exactly 0 is said by "ba-level", which has no place for the gap's words.
  const gapText = text(values.gap > 0 ? "ba-gap-above" : "ba-gap-below", { size });
  const key = values.gap === 0 ? "ba-level" : clear ? "ba-clear" : "ba-unclear";
  const sentence = text(key, { lead: text(main ? "ba-lead-main" : "ba-lead-beside", { since }), name, gap: gapText, lo, hi });
  if (result.fits) cautions.push(text("caution-ba-fits", { since }));
  // Show the numbers: every figure in the Metric's unit, with as many decimals as keep it from reading as 0.
  const written = (v: number) => plainValue(v, unit, unit.decimals, style);
  const between = (a: string, b: string) => `${a} \u2013 ${b}`;
  const row = (label: CaseKey, value: string): NumberRow => ({ label: main ? text(label) : `${name}: ${text(label)}`, text: value });
  return {
    sentence,
    clear,
    counts: { before: result.before, after: result.after },
    cautions,
    notes,
    // The numbers in the sentence, as they are written there: the size of the gap (its word says above or below) and the two ends.
    figures: [
      { label: text("numbers-gap"), value: Math.abs(values.gap), text: size },
      { label: `${text("numbers-range")} (low)`, value: values.lo, text: lo },
      { label: `${text("numbers-range")} (high)`, value: values.hi, text: hi },
    ],
    range: { lo: values.lo, hi: values.hi, text: between(lo, hi) },
    numbers: [
      row("numbers-before", formatNumber(result.before, 0, style)),
      row("numbers-after", formatNumber(result.after, 0, style)),
      row("numbers-trend", written(result.slope)),
      row("numbers-trend-level", written(result.expected)),
      row("numbers-actual", written(result.actual)),
      row("numbers-gap", written(result.gap)),
      row("numbers-range", between(written(result.lo), written(result.hi))),
      ...(result.share ? [row("numbers-gap-share", between(lo, hi))] : []),
      row("numbers-miss", written(result.spread)),
    ],
  };
}

/** The Takeaway of a before-and-after look: "After 1 Mar 2026, Signups ran about 12.0 % above where its trend pointed (likely
 * between +4.0 % and +20.0 %)." with, where a Metric that should not have been touched is given, the same for it beside. After the
 * suitability checks (6 periods before the date; a refusal says what is missing), the notes on what was left out, the range and
 * its basis, and the one line of what it assumes. No strength word: it is a range, not a verdict. A Metric set `beside` must be kept in
 * the same period as the first, since both are cut at the same date, period by period. */
export function afterDateTakeaway(name: string, points: Point[], span: Span, date: string, unit: ValueUnit, ctx: TakeawayContext, beside?: { name: string; points: Point[]; unit: ValueUnit }): Takeaway {
  const method = sayIn("numbers-method-before-after", {}, ctx);
  const main = lookAt(name, points, span, date, unit, ctx, true);
  if (refused(main)) return refusalTakeaway(method, main.refusals);
  const since = formatDate(date);
  const cautions = [...main.cautions];
  const notes = [...main.notes];
  const sentences = [main.sentence];
  const numbers = [{ label: sayIn("numbers-method", {}, ctx), text: method }, { label: sayIn("numbers-date", {}, ctx), text: since }, ...main.numbers];
  if (beside) {
    const other = lookAt(beside.name, beside.points, span, date, beside.unit, ctx, false);
    if (refused(other)) notes.push(sayIn("ba-beside-refused", { name: beside.name }, ctx), ...other.refusals);
    else {
      sentences.push(other.sentence);
      // A Metric that should not have been touched but moved as well says that something else may be at work.
      if (other.clear) cautions.push(sayIn("caution-ba-beside-moved", { name: beside.name }, ctx));
      cautions.push(...other.cautions);
      notes.push(...other.notes);
      numbers.push(...other.numbers);
    }
  }
  return {
    ...answerTakeaway(method),
    sentence: sentences.join(" "),
    range: main.range,
    basis: sayIn("ba-basis", { n: main.counts.before, m: main.counts.after, since, span }, ctx),
    assumptions: [sayIn("ba-assumes", { since }, ctx)],
    cautions,
    notes,
    footer: sayIn("footer-before-after", {}, ctx),
    figures: main.figures,
    numbers,
  };
}
