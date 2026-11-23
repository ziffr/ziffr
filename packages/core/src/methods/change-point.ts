// Change point (GLOSSARY: Change point, Analysis, Takeaway; spec 0041, Method `changePoint`): the one date at which a Metric's level
// or its trend most likely changed, with the size of the change, or none where nothing stands out from the usual ups and downs.
// Pure.
//
// Every date that leaves at least 4 values each side is tried: a straight line is fitted to the values before it and another to
// the values from it on (by their position in the calendar; a period without a value leaves a gap and is never filled in), and
// the date whose two lines leave the smallest sum of squared misses wins (the earliest on a tie). All the sums are worked out
// exactly on the values' text; only the last step to a double is not exact.
//
// Whether that date is a change or only the luckiest of the dates tried is the chance rule. Two free lines against one line are
// four against two numbers to fit, so the improvement is judged by the F ratio with (2, n − 4) degrees of freedom, whose
// chance of being exceeded has a closed form for two degrees of freedom: (SSE₀ ÷ SSE₁)^(−(n − 4)/2) with SSE₀ the misses of
// one line through everything and SSE₁ those of the two lines. Many dates were looked at, so the chance rule is shared among
// them (Bonferroni): the change is real when that chance is below 1 in 20 divided by the number of dates tried, which is
// (SSE₀ ÷ SSE₁)^(n − 4) > (20 · tries)², decided exactly on whole numbers. A date that clears one look but not that bar is "none".
import { readSeries } from "../basis";
import { fractionOf, nearest, type Fraction } from "../exact";
import { formatNumber, type ValueUnit } from "../format";
import { periodsBetween, type Span } from "../periods";
import { checkSuitability, SUITABILITY, type Finding, type Rerun } from "../suitability";
import { decimalsApart, plainValue, SHARE_UNIT, sizeText, signedText } from "../takeaways/sizes";
import { answerTakeaway, refusalTakeaway, sayIn, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";
import { say, type CaseKey, type Slots } from "../takeaways/wording";
import type { Point } from "../types";
import { MAX_PERIODS } from "./before-after";
import { carriesOver } from "./carry-over";
import { add, div, mul, sub, whole } from "./fractions";
import { LIKELY, tQuantile } from "./t-curve";

/** The chance rule's level: a change is real when the chance of so large an improvement by luck is below one in this many, shared among the dates tried. */
export const ONE_IN = 20;
/** The most values the Method works on at once (BigInt powers grow with the count); the Takeaway looks at the latest `MAX_PERIODS`, far fewer. */
export const MOST_VALUES = 1000;

/** The change point: the date (`period`, the first period of the later part) at which the two lines fit best, the slope of each
 * (per period) and the step in level between them at that date, and whether it clears the chance rule (`found`).
 * `kept` is the share of one line's misses that two lines still leave; `spread` the typical miss of the two lines; `slopeHalf` the
 * 80 % range's half-width of the change in slope; `tries` how many dates were looked at. */
export type ChangePoint = {
  ok: true;
  n: number;
  tries: number;
  index: number;
  period: string;
  before: number;
  after: number;
  slopeChange: number;
  step: number;
  found: boolean;
  kept: number | null;
  spread: number;
  slopeHalf: number;
  /** The misses of one line through all the values carry over from one period to the next (carry-over.ts): the chance rule takes them as independent. */
  carries: boolean;
};

/** Why there is no change point: fewer than 8 values, more than `MOST_VALUES`, or a number too large to work out. */
export type NoChangePoint = { ok: false; why: "few" | "long" | "huge" };

const ZERO = BigInt(0);
const smaller = (a: Fraction, b: Fraction) => a.num * b.den < b.num * a.den;

// The straight line through values i up to (not including) j, from running sums: its mean position and value, Sxx, the slope and
// the squared misses, all exact.
type Sums = { x: Fraction[]; y: Fraction[]; xx: Fraction[]; xy: Fraction[]; yy: Fraction[] };
type Line = { mx: Fraction; my: Fraction; sxx: Fraction; slope: Fraction; sse: Fraction };

function lineThrough(s: Sums, i: number, j: number): Line {
  const part = (a: Fraction[]) => sub(a[j], a[i]);
  const n = whole(j - i);
  const [sx, sy] = [part(s.x), part(s.y)];
  // Sxx = Σx² − (Σx)² ÷ n, Sxy = Σxy − Σx·Σy ÷ n, Syy = Σy² − (Σy)² ÷ n.
  const sxx = sub(part(s.xx), div(mul(sx, sx), n));
  const sxy = sub(part(s.xy), div(mul(sx, sy), n));
  const syy = sub(part(s.yy), div(mul(sy, sy), n));
  return { mx: div(sx, n), my: div(sy, n), sxx, slope: div(sxy, sxx), sse: sub(syy, div(mul(sxy, sxy), sxx)) };
}

/** The most likely change in level or trend of a series, as described above; the series is read as every Method reads it. */
export function changePoint(points: Point[], span: Span): ChangePoint | NoChangePoint {
  const rows = readSeries(points);
  const n = rows.length;
  const segment = SUITABILITY.shift.segment;
  if (n < 2 * segment) return { ok: false, why: "few" };
  if (n > MOST_VALUES) return { ok: false, why: "long" };
  const xs = rows.map((r) => whole(periodsBetween(rows[0].period, r.period, span)));
  const ys = rows.map((r) => fractionOf(r.value));
  const running = (f: (i: number) => Fraction): Fraction[] => rows.reduce<Fraction[]>((acc, _r, i) => [...acc, add(acc[i], f(i))], [whole(0)]);
  const sums: Sums = { x: running((i) => xs[i]), y: running((i) => ys[i]), xx: running((i) => mul(xs[i], xs[i])), xy: running((i) => mul(xs[i], ys[i])), yy: running((i) => mul(ys[i], ys[i])) };
  const tries = n - 2 * segment + 1;
  let best: { k: number; sse: Fraction; left: Line; right: Line } | null = null;
  for (let k = segment; k <= n - segment; k++) {
    const [left, right] = [lineThrough(sums, 0, k), lineThrough(sums, k, n)];
    const sse = add(left.sse, right.sse);
    if (!best || smaller(sse, best.sse)) best = { k, sse, left, right };
  }
  const { k, sse, left, right } = best!;
  const one = lineThrough(sums, 0, n);
  const d = n - 2 * 2;
  // Found: (SSE₀ ÷ SSE₁)^d is above (20 · tries)², compared by multiplying out so that two lines with no misses at all (SSE₁ = 0) are above
  // every bar, and one line with none (SSE₀ = 0, so SSE₁ = 0 too) is above none. A ratio exactly at the bar cannot occur (the ratio of two sums of squares is a fraction, and a fraction
  // raised to d is a whole number only if it is one: no whole number to the d is (20 · (d − 3))² for d from 4 to 996, see the tests).
  // Stryker disable next-line EqualityOperator: a ratio exactly at the bar never occurs, so `>` and `>=` give the same.
  const found = (one.sse.num * sse.den) ** BigInt(d) > BigInt(ONE_IN * tries) ** BigInt(2) * (sse.num * one.sse.den) ** BigInt(d);
  const x = xs[k];
  const atStart = (l: Line) => add(l.my, mul(l.slope, sub(x, l.mx)));
  const variance = div(sse, whole(d));
  const slopeHalf = tQuantile(LIKELY, d) * Math.sqrt(nearest(mul(variance, add(div(whole(1), left.sxx), div(whole(1), right.sxx)))));
  // The misses of the one line through everything: two lines would take a slow wave up into themselves and read it as white. A real change
  // carries over too, which is why the caution says only that the date should be read with care.
  const misses = rows.map((_r, i) => ({ x: Number(xs[i].num), miss: sub(ys[i], add(one.my, mul(one.slope, sub(xs[i], one.mx)))) }));
  const result = {
    carries: carriesOver(misses),
    before: nearest(left.slope),
    after: nearest(right.slope),
    slopeChange: nearest(sub(right.slope, left.slope)),
    step: nearest(sub(atStart(right), atStart(left))),
    spread: Math.sqrt(nearest(variance)),
    slopeHalf,
    kept: one.sse.num === ZERO ? null : nearest(div(sse, one.sse)),
  };
  if (![result.before, result.after, result.slopeChange, result.step, result.spread, result.slopeHalf].every(Number.isFinite)) return { ok: false, why: "huge" };
  return { ok: true, n, tries, index: k, period: rows[k].period, found, ...result };
}

/** How a slope reads: "up 120 a month", "down 40 a month" or neither, by the size in the Metric's unit per period (the Takeaway of a change point and the Heads-up of a change of direction say it the same way). */
export function moving(v: number, unit: ValueUnit, decimals: number, ctx: TakeawayContext, span: Span): string {
  return sayIn(v > 0 ? "cp-up" : v < 0 ? "cp-down" : "cp-flat", { size: sizeText(v, unit, decimals, ctx.style), span }, ctx);
}

/** The change point of a series' latest `MAX_PERIODS` periods with the verdict of the suitability checks (8 periods, variation, gaps,
 * far-off values, the far-off values asked by the change point itself: whether leaving out the 1 to 3 most extreme moves the change in slope by
 * more than a fifth of its range, or makes the change go away). `found()` is the latest run the far-off check asked for, the one that gave
 * the finding, or undefined where it asked for none. The Takeaway and the Heads-up of a change of direction read this one. */
export function checkedChangePoint(name: string, points: Point[], span: Span) {
  const all = readSeries(points);
  const rows = all.slice(-MAX_PERIODS);
  const result = changePoint(rows, span);
  let last: { found: boolean; period: string } | undefined;
  const rerun = (left: ReadonlySet<string>): Rerun => {
    const r = changePoint(rows.filter((p) => !left.has(p.period)), span);
    if (!r.ok) return null;
    last = { found: r.found, period: r.period };
    return { value: r.found ? r.slopeChange : 0, range: 2 * r.slopeHalf };
  };
  const verdict = checkSuitability("changePoint", { series: [{ name, points: rows }], span, rerun });
  return { all, rows, result, verdict, found: () => last };
}

/** The Takeaway of a change point: "Around March 2026, Signups changed: before, it went up 120 a month; since, down 40 a month;
 * and at that point its level was 300 lower than the earlier trend would have given." or that nothing stands out. After the suitability checks (8 periods, variation, gaps,
 * far-off values, with the far-off values asked by the change point itself: whether leaving out the 1 to 3 most extreme moves the
 * change in slope by more than a fifth of its range, or makes the change go away), the note on the latest 120 periods, the basis
 * (which says the bar for chance was raised for the dates tried) and one line of what it assumes. No strength word. */
export function changePointTakeaway(name: string, points: Point[], span: Span, unit: ValueUnit, ctx: TakeawayContext): Takeaway {
  const method = sayIn("numbers-method-change-point", {}, ctx);
  const text = (key: CaseKey, slots: Slots = {}) => sayIn(key, { span, ...slots }, ctx);
  const { all, rows, result, verdict, found } = checkedChangePoint(name, points, span);
  const lines = (fs: Finding[]) =>
    fs.map((f) => {
      // The reading without the far-off periods is the last run that was asked for: it says whether the change is still there.
      const without = found()?.found ? text("cp-without-found", { from: found()!.period }) : text("cp-without-none");
      return say(f.case, { span, ...f.slots }, { style: ctx.style, language: ctx.language, yearStart: ctx.yearStart, result: () => without });
    });
  if (verdict.refusals.length > 0) return refusalTakeaway(method, lines(verdict.refusals));
  if (!result.ok) return refusalTakeaway(method, [text("refuse-huge-values", { name })]);
  const cautions = lines(verdict.cautions);
  if (result.found && result.carries) cautions.push(text("caution-carry-over", { name }));
  const notes = all.length > rows.length ? [text("cp-note-latest", { n: rows.length })] : [];
  const style = ctx.style;
  const [n, tries] = [formatNumber(result.n, 0, style), formatNumber(result.tries, 0, style)];
  const kept = result.kept === null ? "–" : plainValue(result.kept * 100, SHARE_UNIT, SHARE_UNIT.decimals, style);
  const base = [
    { label: text("numbers-method"), text: method },
    { label: text("numbers-periods-used"), text: n },
    { label: text("numbers-dates-tried"), text: tries },
    { label: text("numbers-change-date"), text: rows[result.index].period },
    { label: text("numbers-kept"), text: kept },
  ];
  const answer = answerTakeaway(method);
  const basis = text("cp-basis", { n: result.n, tries: result.tries });
  if (!result.found) {
    return { ...answer, sentence: text("cp-none", { name, n: result.n }), basis, assumptions: [text("cp-assumes")], cautions, notes, footer: text("footer-change-point"), numbers: base, figures: [{ label: text("numbers-periods-used"), value: result.n, text: n }] };
  }
  // Different slopes are written with digits that tell them apart, so "up 1 a month; since, up 1 a month" never hides 1.011 and 0.886.
  const decimals = decimalsApart([result.before, result.after, result.step], unit.decimals, style);
  if (decimals === null) return refusalTakeaway(method, [text("refuse-tiny", { name })]);
  const step = text(result.step > 0 ? "cp-step-up" : result.step < 0 ? "cp-step-down" : "cp-step-none", { size: sizeText(result.step, unit, decimals, style) });
  const [before, after] = [moving(result.before, unit, decimals, ctx, span), moving(result.after, unit, decimals, ctx, span)];
  const written = (v: number) => plainValue(v, unit, unit.decimals, style);
  // The slopes and the step in Show the numbers carry the digits of the sentence, so two that differ never read the same there either.
  const signed = (v: number) => signedText(v, unit, decimals, style);
  return {
    ...answer,
    sentence: text("cp-found", { name, from: result.period, before, after, step }),
    basis,
    assumptions: [text("cp-assumes")],
    cautions,
    notes,
    footer: text("footer-change-point"),
    // The numbers in the sentence, as they are written there: the size of each slope and of the step (the words say which way).
    figures: [
      { label: text("numbers-slope-before"), value: Math.abs(result.before), text: sizeText(result.before, unit, decimals, style) },
      { label: text("numbers-slope-after"), value: Math.abs(result.after), text: sizeText(result.after, unit, decimals, style) },
      { label: text("numbers-step"), value: Math.abs(result.step), text: sizeText(result.step, unit, decimals, style) },
    ],
    numbers: [
      ...base,
      { label: text("numbers-slope-before"), text: signed(result.before) },
      { label: text("numbers-slope-after"), text: signed(result.after) },
      { label: text("numbers-step"), text: signed(result.step) },
      { label: text("numbers-miss"), text: written(result.spread) },
    ],
  };
}
