// Lagged correlation (GLOSSARY: Analysis, Takeaway; spec 0041, Method `laggedCorrelation`): whether one Metric tends to move
// some periods before another, for lags of 0 to 6 periods. For each lag the first series' value in a period is paired with
// the second's `lag` periods later, and Pearson's r is worked out exactly on those pairs (correlation.ts). The best lag is
// the one with the largest |r| (the shorter lag on a tie). Pure.
//
// Seven lags are tried, so the best of them is likelier to look strong by chance than one look: the Takeaway reads the chance
// rule at the higher bar for the number of lags tried (takeaways/strength.ts) and never takes a lag with too few pairs.
import { readSeries, type Basis } from "../basis";
import { MIN_PAIRS, pairUp, pearson } from "../correlation";
import { formatNumber } from "../format";
import { shiftPeriod, type Span } from "../periods";
import { checkSuitability } from "../suitability";
import { strengthOf } from "../takeaways/strength";
import { emptyTakeaway, footerText, refusalTakeaway, sayIn, strengthWordIn, verdictLines, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";
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

/** The Takeaway of a lagged correlation: `a` leads `b` by the best lag. The series are given on the basis the caller chose
 * (values, or their changes with growth removed). The suitability checks run on the series (the lag minimum of 12 periods,
 * variation, gaps, far-off values, skew, a link that changed); the chance rule is read at the bar for the lags tried. */
export function laggedTakeaway(aName: string, bName: string, a: Point[], b: Point[], span: Span, basis: Basis, ctx: TakeawayContext): Takeaway {
  const method = sayIn("numbers-method-lag", {}, ctx);
  const [xs, ys] = [readSeries(a), readSeries(b)];
  const found = laggedCorrelation(xs, ys, span);
  const verdict = checkSuitability("lag", {
    series: [{ name: aName, points: xs }, { name: bName, points: ys }],
    span,
    periods: Math.min(xs.length, ys.length),
    scale: 1,
    // The best lag's r with some periods left out of either series.
    rerun: (left) => {
      // With no best delay (no lag has a number) there is nothing to leave periods out of: no lag is found, and no result.
      const lag = found.best?.lag;
      const r = laggedCorrelation(xs.filter((p) => !left.has(p.period)), ys.filter((p) => !left.has(p.period)), span, lag).lags.find((l) => l.lag === lag);
      return r && Number.isFinite(r.r) ? { value: r.r } : null;
    },
  });
  const lines = verdictLines(verdict, ctx, found.best?.n ?? 0);
  if (lines.refusals.length > 0) return refusalTakeaway(method, lines.refusals);
  // Series that share fewer than 6 periods (or none) have no lag with a number: said as too few periods in common.
  if (!found.best) return refusalTakeaway(method, [sayIn("refuse-periods", { have: pairUp(xs, ys).length, need: MIN_PAIRS, span }, ctx)]);
  const { lag, r, n } = found.best;
  const tries = found.lags.filter((l) => Number.isFinite(l.r)).length;
  const strength = strengthOf(r, n, lines.cautions.length > 0, tries);
  const strengthText = strengthWordIn(strength, ctx);
  // Stryker disable next-line EqualityOperator: an r of 0 is "can't tell from chance" before the sign is looked at, so `<` and `<=` never differ.
  const opposite = r < 0;
  const key = strength === "cant-tell" ? "lag-cant-tell" : lag === 0 ? (opposite ? "lag-same-opposite" : "lag-same") : opposite ? "lag-leads-opposite" : "lag-leads";
  const basisPhrase = sayIn(basis === "changes" ? "basis-changes" : "basis-values", {}, ctx);
  return {
    ...emptyTakeaway(method),
    kind: "answer",
    // Where no delay stands out, the periods held are those of lag 0; otherwise the pairs of the delay that does.
    sentence: sayIn(key, { a: aName, b: bName, lag, max: MAX_LAG, n: key === "lag-cant-tell" ? pairUp(xs, ys).length : n, span, strength: strengthText }, ctx),
    strength,
    strengthText,
    basis: sayIn("basis-over", { basis: basisPhrase, n, span }, ctx),
    cautions: lines.cautions,
    notes: lines.notes,
    footer: footerText(ctx),
    figures: [{ label: sayIn("numbers-lag", {}, ctx), value: lag, text: formatNumber(lag, 0, ctx.style) }, { label: sayIn("numbers-pairs", {}, ctx), value: n, text: formatNumber(n, 0, ctx.style) }],
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
