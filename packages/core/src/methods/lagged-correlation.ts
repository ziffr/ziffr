// Lagged correlation (GLOSSARY: Analysis, Takeaway; spec 0041, Method `laggedCorrelation`): whether one Metric tends to move
// some periods before another, for lags of 0 to 6 periods. For each lag the first series' value in a period is paired with
// the second's `lag` periods later, and Pearson's r is worked out exactly on those pairs (correlation.ts). The best lag is
// the one with the largest |r| (the shorter lag on a tie). Pure.
//
// Seven lags are tried, so the best of them is likelier to look strong by chance than one look: the Takeaway reads the chance
// rule at the higher bar for the number of lags tried (takeaways/strength.ts) and never takes a lag with too few pairs.
import { readSeries, type Basis } from "../basis";
import { pearson } from "../correlation";
import { formatNumber } from "../format";
import { shiftPeriod, type Span } from "../periods";
import { checkSuitability } from "../suitability";
import { strengthOf } from "../takeaways/strength";
import { pairsAnswer, refusalTakeaway, sayIn, strengthWordIn, verdictLines, wideRefusal, onLatest, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";
import type { Point } from "../types";

/** The longest lag tried, in periods. */
export const MAX_LAG = 6;

/** One lag's correlation: `r` is NaN where a series does not change over the pairs. */
export type LagResult = { lag: number; r: number; n: number };

/** Every lag from 0 to `maxLag` that has at least `MIN_PAIRS` pairs, and the best of them (the largest |r|, the shorter lag
 * on a tie; none where no lag has a number). */
export type Lagged = { lags: LagResult[]; best: LagResult | null };

/** The correlation of `a` with `b` shifted back by each lag: the pair of a period is `a` there and `b` `lag` periods later.
 * The series are read as every Method reads them (a value that is not a number is no value, a period twice counts once);
 * a lag with fewer than `MIN_PAIRS` pairs is left out, and `maxLag` is held to 0 to `MAX_LAG` whole periods. */
export function laggedCorrelation(a: Point[], b: Point[], span: Span, maxLag: number = MAX_LAG): Lagged {
  const last = Math.min(MAX_LAG, Math.max(0, Math.floor(maxLag)));
  const [xs, ys] = [readSeries(a), readSeries(b)];
  const lags: LagResult[] = [];
  for (let lag = 0; lag <= last; lag++) {
    const back = ys.map((p) => ({ period: shiftPeriod(p.period, span, -lag), value: p.value }));
    const found = pearson(xs, back);
    if (found) lags.push({ lag, r: found.r, n: found.n });
  }
  const best = lags.reduce<LagResult | null>((top, l) => (Number.isFinite(l.r) && (!top || Math.abs(l.r) > Math.abs(top.r)) ? l : top), null);
  return { lags, best };
}

/** The pairs of a delay: the first series' value in each period, and the second's `lag` periods later, both labelled by the first's period. */
export function lagPairs(a: Point[], b: Point[], span: Span, lag: number): { x: Point[]; y: Point[] } {
  const later = new Map(readSeries(b).map((p) => [p.period, p.value]));
  const x = readSeries(a).filter((p) => later.has(shiftPeriod(p.period, span, lag)));
  return { x, y: x.map((p) => ({ period: p.period, value: later.get(shiftPeriod(p.period, span, lag))! })) };
}

/** The Takeaway of a lagged correlation: `a` moves before `b` by the best delay (only that direction is tried, 0 to 6 periods).
 * The series are given on the basis the caller chose (values, or their changes with growth removed). The suitability checks
 * run on the periods both series have (the lag minimum of 12) and, for variation, gaps, far-off values, skew and a link that
 * changed, on the pairs of the best delay; the chance rule is read at the bar for the delays tried. */
export function laggedTakeaway(aName: string, bName: string, a: Point[], b: Point[], span: Span, basis: Basis, ctx: TakeawayContext): Takeaway {
  // Stryker disable next-line StringLiteral: the Method's name in the refusal that only a spent work allowance writes; the wording of that refusal is held by the test of withinBudget.
  return onLatest("numbers-method-lag", ctx, span, [a, b], ([ca, cb]) => laggedWithin(aName, bName, ca, cb, span, basis, ctx));
}

// The Takeaway itself, on the latest periods the series have in common.
function laggedWithin(aName: string, bName: string, a: Point[], b: Point[], span: Span, basis: Basis, ctx: TakeawayContext): Takeaway {
  const method = sayIn("numbers-method-lag", {}, ctx);
  // Values too wide to work out exactly are refused before the exact arithmetic is started (work-bound.ts).
  // Stryker disable next-line ArrayDeclaration,ArrowFunction: without these values the check below refuses with the same words; this only saves the exact work before it.
  const wide = wideRefusal(method, [{ name: aName, values: readSeries(a).map((p) => p.value) }, { name: bName, values: readSeries(b).map((p) => p.value) }], ctx);
  // Stryker disable next-line ConditionalExpression: without this return the check below refuses with the same words; this only saves the exact work before it.
  if (wide) return wide;
  const found = laggedCorrelation(a, b, span);
  const tries = found.lags.filter((l) => Number.isFinite(l.r)).length;
  const paired = found.best ? lagPairs(a, b, span, found.best.lag) : { x: readSeries(a), y: readSeries(b) };
  // The best delay's r with some pairs left out: the pairs need both series, so leaving a period out of the first is enough (with fewer than 6 pairs left there is no result without them).
  const verdict = checkSuitability("lag", {
    series: [{ name: aName, points: paired.x }, { name: bName, points: paired.y }],
    span,
    // The periods the two series share, the most any delay pairs: the rule is about how much history there is.
    periods: Math.max(0, ...found.lags.map((l) => l.n)),
    scale: 1,
    rerun: (left) => {
      const r = pearson(paired.x.filter((p) => !left.has(p.period)), paired.y);
      return r ? { value: r.r } : null;
    },
  });
  const lines = verdictLines(verdict, ctx, found.best?.n ?? 0, (r, n) => strengthOf(r, n, false, tries));
  if (lines.refusals.length > 0) return refusalTakeaway(method, lines.refusals);
  // Past the checks there are 12 shared periods and a series that varies, so some delay has a number.
  const { lag, r, n } = found.best!;
  const strength = strengthOf(r, n, lines.cautions.length > 0, tries);
  const strengthText = strengthWordIn(strength, ctx);
  // Stryker disable next-line EqualityOperator: an r of 0 is "can't tell from chance" before the sign is looked at, so `<` and `<=` never differ.
  const opposite = r < 0;
  const key = strength === "cant-tell" ? "lag-cant-tell" : lag === 0 ? (opposite ? "lag-same-opposite" : "lag-same") : opposite ? "lag-leads-opposite" : "lag-leads";
  const basisPhrase = sayIn(basis === "changes" ? "basis-changes" : "basis-values", {}, ctx);
  const answer = pairsAnswer(method, ctx, { sentence: sayIn(key, { a: aName, b: bName, lag, longest: MAX_LAG, n, span, strength: strengthText }, ctx), strength, basis: sayIn("basis-over", { basis: basisPhrase, n, span }, ctx), lines, n });
  return {
    ...answer,
    figures: [{ label: sayIn("numbers-lag", {}, ctx), value: lag, text: formatNumber(lag, 0, ctx.style) }, ...answer.figures],
    numbers: [
      { label: sayIn("numbers-method", {}, ctx), text: method },
      { label: sayIn("numbers-lag", {}, ctx), text: formatNumber(lag, 0, ctx.style) },
      { label: sayIn("numbers-r", {}, ctx), text: formatNumber(r, 2, ctx.style) },
      { label: sayIn("numbers-pairs", {}, ctx), text: formatNumber(n, 0, ctx.style) },
      { label: sayIn("numbers-tries", {}, ctx), text: formatNumber(tries, 0, ctx.style) },
      { label: sayIn("numbers-basis", {}, ctx), text: basisPhrase },
      { label: sayIn("numbers-strength", {}, ctx), text: strengthText },
    ],
  };
}
