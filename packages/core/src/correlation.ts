// Correlation (GLOSSARY: Analysis): whether two Metrics move together, on their common period (spec 0019). Pure.
// Two Metrics of different periods are compared on the longer one: the shorter is combined to it by its Aggregation
// through `seriesBy` (spec 0018), so weekly tickets become monthly tickets and pair with monthly churn. Where both
// Metrics have a clear trend they are compared on how each changed from the period before, not on their values
// (basis.ts, spec 0041): two Metrics that only grow together are not related. Drivers, the
// correlation matrix, the scatter plot, the Analysis Canvas and a Metric's page all correlate through `correlate`.
import { basisFor, basisText, changes, type Basis } from "./basis";
import { isLonger, seriesBy, type Resolver } from "./display-periods";
import { STRENGTH } from "./takeaways/strength";
import { say } from "./takeaways/wording";
import { onPage, RANK_BUDGET, tryWork, wideColumns, withWork } from "./work-bound";
import type { Span, YearStart } from "./periods";
import { fractionOf, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "./exact";
import type { Metric, Point } from "./types";

/** How many common periods a correlation needs before it says anything. */
export const MIN_PAIRS = 6;

/** One common period: `x` is the first Metric's value, `y` the second's. */
export type Pair = { period: string; x: number; y: number };

/** Pearson's r over the pairs, with how many there are. */
export type PearsonResult = { r: number; n: number; pairs: Pair[] };

/** The result of correlating two Metrics on their common period, or why there is none. */
export type Correlation =
  | (PearsonResult & { ok: true; period: Span; combined: boolean; basis: Basis })
  | { ok: false; period: Span; why: NoCorrelation; reason: string; n: number };

/** Why two Metrics have no correlation: one cannot be combined (Aggregation none), too few common periods, one is a
 * Derived Metric built from the other, or a series does not change. */
export type NoCorrelation = "not-combined" | "too-few" | "built-from" | "flat" | "too-wide" | "too-much";

const NOUN: Record<Span, [string, string]> = {
  day: ["day", "days"], week: ["week", "weeks"], month: ["month", "months"],
  quarter: ["quarter", "quarters"], half: ["half-year", "half-years"], year: ["year", "years"],
};
const ADJECTIVE: Record<Span, string> = { day: "daily", week: "weekly", month: "monthly", quarter: "quarterly", half: "half-yearly", year: "yearly" };

/** A period's name in a sentence: "month", or "months" for more than one. */
export function periodWord(span: Span, plural = false): string {
  return NOUN[span][plural ? 1 : 0];
}

/** A count of periods in words: "1 month", "18 months". */
export function periodCountLabel(span: Span, n: number): string {
  return `${n} ${periodWord(span, n !== 1)}`;
}

/** The values of both series for the periods both have, in the first series' order. */
export function pairUp(a: Point[], b: Point[]): Pair[] {
  const mb = new Map(b.map((p) => [p.period, p.value]));
  return a.filter((p) => mb.has(p.period)).map((p) => ({ period: p.period, x: p.value, y: mb.get(p.period)! }));
}

/** Pearson's r of two series on the periods both have; null with fewer than `MIN_PAIRS` of them. */
export function pearson(a: Point[], b: Point[]): PearsonResult | null {
  const pairs = pairUp(a, b);
  return pairs.length < MIN_PAIRS ? null : pearsonOf(pairs);
}

// Pearson's r, worked out exactly on the values' text (exact.ts): r² = Sxy² ÷ (Sxx · Syy) with the sums of products
// about the means as exact fractions, then r = ±√r² from the double nearest to r², with the sign of Sxy. Only the
// square root is a double's. A series that does not change has Sxx or Syy exactly 0, and no r (NaN) (spec 0022, #126).
function pearsonOf(pairs: Pair[]): PearsonResult {
  const n = BigInt(pairs.length);
  const xs = pairs.map((p) => fractionOf(p.x));
  const ys = pairs.map((p) => fractionOf(p.y));
  const sum = (fs: Fraction[]) => fs.reduce((a, b) => lowestTerms(plus(a, b)), { num: BigInt(0), den: BigInt(1) });
  // n·Sxy = n·Σxy − Σx·Σy, and the same for Sxx and Syy: the factor n cancels in r².
  const [sx, sy] = [sum(xs), sum(ys)];
  const about = (as: Fraction[], bs: Fraction[], sa: Fraction, sb: Fraction) => minus(times({ num: n, den: BigInt(1) }, sum(as.map((a, i) => times(a, bs[i])))), times(sa, sb));
  const sxy = lowestTerms(about(xs, ys, sx, sy));
  const sxx = lowestTerms(about(xs, xs, sx, sx));
  const syy = lowestTerms(about(ys, ys, sy, sy));
  const zero = BigInt(0);
  if (sxx.num === zero || syy.num === zero) return { r: NaN, n: pairs.length, pairs };
  const r2 = nearest(over(times(sxy, sxy), times(sxx, syy)));
  return { r: (sxy.num < zero ? -1 : 1) * Math.sqrt(r2), n: pairs.length, pairs };
}

/** How strong a correlation is, in words ("strong positive", "no clear"). */
export function strength(r: number): string {
  const a = Math.abs(r);
  if (a <= STRENGTH.weak) return "no clear";
  // Stryker disable next-line EqualityOperator: an r of 0 is "no clear" above, so `>` and `>=` never differ here.
  return `${a > STRENGTH.strong ? "strong" : a > STRENGTH.moderate ? "moderate" : "weak"} ${r >= 0 ? "positive" : "negative"}`;
}

/** The period two Metrics are compared on: the longer of their periods. */
export function commonPeriod(a: Span, b: Span): Span {
  return isLonger(b, a) ? b : a;
}

/** Whether one Metric is a Derived Metric built from the other: such a pair is never correlated. */
export function builtFrom(a: Pick<Metric, "slug" | "formula">, b: Pick<Metric, "slug" | "formula">): boolean {
  return Boolean(a.formula?.includes(`{${b.slug}}`) || b.formula?.includes(`{${a.slug}}`));
}

/** What a result was compared on, in words, always: "Compared by change, growth removed" or "Compared by value". */
export function basisLabel(c: Extract<Correlation, { ok: true }>): string {
  const text = basisText(c.basis);
  return text[0].toUpperCase() + text.slice(1);
}

/** Where a result says what it was compared on: "Compared by month (18 months)"; nothing when both share a period. */
export function comparedBy(c: Correlation): string | null {
  return c.ok && c.combined ? `Compared by ${NOUN[c.period][0]} (${periodCountLabel(c.period, c.n)})` : null;
}

/** Correlates two Metrics on their common period. The shorter one is combined to the longer by its Aggregation and
 * only complete periods count: a period still to date would compare a part with wholes. `today` (yyyy-mm-dd) is for
 * tests; it defaults to the current day. Pairs carry `a` as `x` and `b` as `y`. */
export function correlate(a: Metric, b: Metric, resolve: Resolver, opts: { yearStart: YearStart; today?: string; basis?: BasisChoice }): Correlation {
  const period = commonPeriod(a.period, b.period);
  const combined = a.period !== b.period;
  if (builtFrom(a, b)) return { ok: false, period, n: 0, why: "built-from", reason: `${a.formula?.includes(`{${b.slug}}`) ? a.name : b.name} is calculated from the other.` };
  // By its own period too, so each period counts once with its latest value (spec 0022): seriesBy gives a Metric's
  // own points as latestOfEach does.
  const on = (m: Metric): Point[] | string => {
    const s = seriesBy(m, resolve, period, opts);
    // A Metric that is not derived is refused only for Aggregation none: the common period is never shorter than its own.
    if (!s.ok) return !m.formula ? `Aggregation none: ${m.name} is compared only with ${ADJECTIVE[m.period]} Metrics.` : s.reason;
    return s.points.filter((p) => !p.toDate);
  };
  const xs = on(a);
  if (typeof xs === "string") return { ok: false, period, n: 0, why: "not-combined", reason: xs };
  const ys = on(b);
  if (typeof ys === "string") return { ok: false, period, n: 0, why: "not-combined", reason: ys };
  const levels = pairUp(xs, ys);
  const tooFew = (n: number): Correlation => ({ ok: false, period, n, why: "too-few", reason: `Not enough ${NOUN[period][1]} in common (${n} of ${MIN_PAIRS}).` });
  if (levels.length < MIN_PAIRS) return tooFew(levels.length);
  // Values too wide to work out exactly in reasonable time (work-bound.ts) are left out, before the exact arithmetic: a ranking runs this for many pairs.
  // The levels are judged before the basis is chosen (that is exact arithmetic on them), and the pairs that are worked out on after it: the
  // changes of values inside the bounds can be outside them (a step of 1e15 beside one of 1e-6).
  const tooWide = (rows: Pair[]): Correlation | null => {
    const wide = wideColumns([a.name, b.name], [rows.map((p) => p.x), rows.map((p) => p.y)]);
    // Stryker disable next-line ObjectLiteral,StringLiteral: the style only writes the two bounds, whole numbers under 1000, the same in every style.
    return wide.length > 0 ? { ok: false, period, n: rows.length, why: "too-wide", reason: wide.map((f) => say(f.case, f.slots, { style: "1,234.5" })).join(" ") } : null;
  };
  const wideLevels = tooWide(levels);
  if (wideLevels) return wideLevels;
  // The basis is chosen on the periods both have; "values" is the choice under Show the numbers.
  const onX = levels.map((p) => ({ period: p.period, value: p.x }));
  const onY = levels.map((p) => ({ period: p.period, value: p.y }));
  const basis: Basis = opts.basis === "values" ? "values" : basisFor(onX, onY, period);
  const pairs = basis === "values" ? levels : pairUp(changes(onX, period), changes(onY, period));
  if (pairs.length < MIN_PAIRS) return tooFew(pairs.length);
  const widePairs = tooWide(pairs);
  if (widePairs) return widePairs;
  const res = pearsonOf(pairs);
  if (!Number.isFinite(res.r)) return { ok: false, period, n: pairs.length, why: "flat", reason: basis === "values" ? "One of them does not change, so there is nothing to compare." : "Once growth is removed, one of them does not change, so there is nothing to compare." };
  return { ok: true, period, combined, basis, ...res };
}

/** Which basis to compare on: "auto" lets `basisFor` choose; "values" keeps the older ranking by the values as they are. */
export type BasisChoice = "auto" | "values";

/** A Metric correlated with another, or left out with the reason. */
export type Ranked = { metric: Metric; result: Extract<Correlation, { ok: true }> };
/** A Metric left out of a ranking, with why. */
export type LeftOut = { metric: Metric; why: NoCorrelation; reason: string };

/** Every other Metric correlated with this one on their common period, ranked by |r|, and those left out with why.
 * The Metric itself and Derived Metrics built from it (or it from them) are left out silently, as there is nothing
 * to learn. */
export function rankCorrelations(metric: Metric, metrics: Metric[], resolve: Resolver, opts: { yearStart: YearStart; today?: string; basis?: BasisChoice; page?: { exact: number }; /** What this call may spend, instead of the usual (work-bound.ts), for tests. */ allowance?: number }): { ranked: Ranked[]; leftOut: LeftOut[] } {
  const ranked: Ranked[] = [];
  const leftOut: LeftOut[] = [];
  // One work allowance (work-bound.ts) for the whole ranking, so that a page with many Metrics cannot be kept busy: the pairs that are left when it is
  // spent are not compared, which is said (one note for them all), and the ranking of the ones that were is exact.
  // Stryker disable next-line ObjectLiteral,StringLiteral: the style only writes numbers, and this note has none.
  const spent = say("note-not-compared", {}, { style: "1,234.5" });
  // Where a page shares its exact work between its widgets (`page`), what is left of it is what this call may spend, at most `RANK_BUDGET`; where that is spent
  // the Metrics left say so in the words of a page that asked for too much, in the order they come.
  const loop = () => {
    for (const m of metrics) {
      if (m.id === metric.id || builtFrom(metric, m)) continue;
      const result = tryWork(() => correlate(metric, m, resolve, opts));
      if (result === null) leftOut.push({ metric: m, why: "too-much", reason: spent });
      else if (result.ok) ranked.push({ metric: m, result });
      else leftOut.push({ metric: m, why: result.why, reason: result.reason });
    }
    return true;
  };
  if (opts.page) {
    // Nothing left of the page's work: no Metric is compared.
    if (!onPage(opts.page, opts.allowance ?? RANK_BUDGET, loop)) for (const m of metrics) if (m.id !== metric.id && !builtFrom(metric, m)) leftOut.push({ metric: m, why: "too-much", reason: spent });
    // The page's work is spent (by this call or an earlier one): the Metrics left out say so as a page does.
    if (opts.page.exact <= 0) {
      // Stryker disable next-line ObjectLiteral: the style only writes numbers, and this note has none.
      const page = say("recipe-page-too-much", {}, { style: "1,234.5" });
      for (const l of leftOut) if (l.why === "too-much") l.reason = page;
    }
  } else withWork(loop, opts.allowance ?? RANK_BUDGET);
  ranked.sort((x, y) => Math.abs(y.result.r) - Math.abs(x.result.r));
  return { ranked, leftOut };
}
