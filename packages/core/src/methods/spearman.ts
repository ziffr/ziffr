// Rank correlation (GLOSSARY: Analysis, Takeaway; spec 0041, Method `spearman`): whether two Metrics rise and fall together
// by the order of their values, not their size. Pearson's r on the ranks: a far-off value counts as one rank above the rest,
// and a curve that always rises is a perfect 1. It is the Method the suitability checks switch to for skewed values. Pure.
//
// One implementation: `rankAssociation` (suitability.ts) works out r² and the sign exactly from the ranks (a tie takes the
// mean of the ranks it covers); this only pairs the series up and takes the root of the double nearest to r².
import { readSeries, type Basis } from "../basis";
import { MIN_PAIRS, pairUp, type Pair } from "../correlation";
import { nearest } from "../exact";
import { formatNumber } from "../format";
import type { Span } from "../periods";
import { checkSuitability, rankAssociation } from "../suitability";
import { strengthOf, type StrengthWord } from "../takeaways/strength";
import { emptyTakeaway, footerText, refusalTakeaway, sayIn, strengthWordIn, verdictLines, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";
import type { Point } from "../types";

/** How much more a rank correlation scatters than Pearson's r under no link: a variance of 1.06 ÷ (n − 3) against 1 ÷ (n − 3). */
export const RANK_SPREAD = 1.06;

/** The word for a rank correlation over `n` pairs: a rank correlation scatters a little more than Pearson's r under no link (by
 * 1.06 in variance, Fieller, Hartley and Pearson), so the same chance rule is read on 3 + (n − 3) ÷ 1.06 pairs. */
export function rankStrength(rho: number, n: number, capped = false): StrengthWord {
  return strengthOf(rho, 3 + (n - 3) / RANK_SPREAD, capped);
}

/** Spearman's r over the pairs, with how many there are; `rho` is NaN where either series has all ranks equal. */
export type SpearmanResult = { rho: number; n: number; pairs: Pair[] };

/** Spearman's rank correlation of two series on the periods both have (a value that is not a number is no value, a period
 * given twice counts once, with the value given last); null with fewer than `MIN_PAIRS` pairs, `rho` NaN when one side's
 * values are all equal. Exact up to the final square root. */
export function spearman(a: Point[], b: Point[]): SpearmanResult | null {
  const pairs = pairUp(readSeries(a), readSeries(b));
  if (pairs.length < MIN_PAIRS) return null;
  const found = rankAssociation(pairs.map((p) => p.x), pairs.map((p) => p.y));
  return { rho: found ? (found.negative ? -1 : 1) * Math.sqrt(nearest(found.rho2)) : NaN, n: pairs.length, pairs };
}

/** The Takeaway of a rank correlation: the series are given on the basis the caller chose (values, or their changes with
 * growth removed); the suitability checks run on the pairs, a refusal says what is missing, a caution is said above the
 * answer and keeps the strength below "strong", and the footer is on once. */
export function spearmanTakeaway(aName: string, bName: string, a: Point[], b: Point[], span: Span, basis: Basis, ctx: TakeawayContext): Takeaway {
  const method = sayIn("numbers-method-spearman", {}, ctx);
  const found = spearman(a, b);
  const pairs = found?.pairs ?? pairUp(readSeries(a), readSeries(b));
  const [xs, ys] = [pairs.map((p) => ({ period: p.period, value: p.x })), pairs.map((p) => ({ period: p.period, value: p.y }))];
  const verdict = checkSuitability("spearman", {
    series: [{ name: aName, points: xs }, { name: bName, points: ys }],
    span,
    periods: pairs.length,
    scale: 1,
    // Leaving periods out is a question to the Method; the pairs themselves are not changed.
    rerun: (left) => {
      const r = spearman(xs, ys.filter((p) => !left.has(p.period)));
      return r && Number.isFinite(r.rho) ? { value: r.rho } : null;
    },
  });
  const lines = verdictLines(verdict, ctx, pairs.length);
  if (lines.refusals.length > 0) return refusalTakeaway(method, lines.refusals);
  // The checks refuse fewer than MIN_PAIRS pairs and a series with fewer than 4 different values, so past them there is a rho.
  const { rho, n } = found!;
  const strength = rankStrength(rho, n, lines.cautions.length > 0);
  const strengthText = strengthWordIn(strength, ctx);
  // Stryker disable next-line EqualityOperator: a rho of 0 is "can't tell from chance" before this, so `<` and `<=` never differ.
  const key = strength === "cant-tell" ? "corr-cant-tell" : rho < 0 ? "corr-opposite" : "corr-together";
  const basisPhrase = sayIn(basis === "changes" ? "basis-rank-changes" : "basis-rank-values", {}, ctx);
  return {
    ...emptyTakeaway(method),
    kind: "answer",
    sentence: sayIn(key, { a: aName, b: bName, n, span, strength: strengthText }, ctx),
    strength,
    strengthText,
    basis: sayIn("basis-over", { basis: basisPhrase, n, span }, ctx),
    cautions: lines.cautions,
    notes: lines.notes,
    footer: footerText(ctx),
    figures: [{ label: sayIn("numbers-pairs", {}, ctx), value: n, text: formatNumber(n, 0, ctx.style) }],
    numbers: [
      { label: sayIn("numbers-method", {}, ctx), text: method },
      { label: sayIn("numbers-rho", {}, ctx), text: formatNumber(rho, 2, ctx.style) },
      { label: sayIn("numbers-pairs", {}, ctx), text: formatNumber(n, 0, ctx.style) },
      { label: sayIn("numbers-periods", {}, ctx), text: `${pairs[0].period} – ${pairs[n - 1].period}` },
      { label: sayIn("numbers-basis", {}, ctx), text: basisPhrase },
      { label: sayIn("numbers-strength", {}, ctx), text: strengthText },
    ],
  };
}
