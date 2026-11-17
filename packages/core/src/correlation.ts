// Correlation (GLOSSARY: Analysis): whether two Metrics move together, on their common period (spec 0019). Pure.
// Two Metrics of different periods are compared on the longer one: the shorter is combined to it by its Aggregation
// through `seriesBy` (spec 0018), so weekly tickets become monthly tickets and pair with monthly churn. Drivers, the
// correlation matrix, the scatter plot, the Analysis Canvas and a Metric's page all correlate through `correlate`.
import { isLonger, seriesBy, type Resolver } from "./display-periods";
import type { Span, YearStart } from "./periods";
import type { Metric, Point } from "./types";

/** How many common periods a correlation needs before it says anything. */
export const MIN_PAIRS = 6;

/** One common period: `x` is the first Metric's value, `y` the second's. */
export type Pair = { period: string; x: number; y: number };

/** Pearson's r over the pairs, with how many there are. */
export type PearsonResult = { r: number; n: number; pairs: Pair[] };

/** The result of correlating two Metrics on their common period, or why there is none. */
export type Correlation =
  | (PearsonResult & { ok: true; period: Span; combined: boolean })
  | { ok: false; period: Span; why: NoCorrelation; reason: string; n: number };

/** Why two Metrics have no correlation: one cannot be combined (Aggregation none), too few common periods, one is a
 * Derived Metric built from the other, or a series does not change. */
export type NoCorrelation = "not-combined" | "too-few" | "built-from" | "flat";

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

function pearsonOf(pairs: Pair[]): PearsonResult {
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p.x, 0) / n;
  const my = pairs.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pairs) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  return { r: sxy / Math.sqrt(sxx * syy), n, pairs };
}

/** How strong a correlation is, in words ("strong positive", "no clear"). */
export function strength(r: number): string {
  const a = Math.abs(r);
  if (a <= 0.2) return "no clear";
  return `${a > 0.7 ? "strong" : a > 0.4 ? "moderate" : "weak"} ${r >= 0 ? "positive" : "negative"}`;
}

/** The period two Metrics are compared on: the longer of their periods. */
export function commonPeriod(a: Span, b: Span): Span {
  return isLonger(b, a) ? b : a;
}

/** Whether one Metric is a Derived Metric built from the other: such a pair is never correlated. */
export function builtFrom(a: Pick<Metric, "slug" | "formula">, b: Pick<Metric, "slug" | "formula">): boolean {
  return Boolean(a.formula?.includes(`{${b.slug}}`) || b.formula?.includes(`{${a.slug}}`));
}

/** Where a result says what it was compared on: "Compared by month (18 months)"; nothing when both share a period. */
export function comparedBy(c: Correlation): string | null {
  return c.ok && c.combined ? `Compared by ${NOUN[c.period][0]} (${periodCountLabel(c.period, c.n)})` : null;
}

/** Correlates two Metrics on their common period. The shorter one is combined to the longer by its Aggregation and
 * only complete periods count: a period still to date would compare a part with wholes. `today` (yyyy-mm-dd) is for
 * tests; it defaults to the current day. Pairs carry `a` as `x` and `b` as `y`. */
export function correlate(a: Metric, b: Metric, resolve: Resolver, opts: { yearStart: YearStart; today?: string }): Correlation {
  const period = commonPeriod(a.period, b.period);
  const combined = a.period !== b.period;
  if (builtFrom(a, b)) return { ok: false, period, n: 0, why: "built-from", reason: `${a.formula?.includes(`{${b.slug}}`) ? a.name : b.name} is calculated from the other.` };
  const on = (m: Metric): Point[] | string => {
    if (m.period === period) return resolve(m.slug)?.points ?? [];
    const s = seriesBy(m, resolve, period, opts);
    if (!s.ok) return m.aggregation === "none" && !m.formula ? `Aggregation none: ${m.name} is compared only with ${ADJECTIVE[m.period]} Metrics.` : s.reason;
    return s.points.filter((p) => !p.toDate);
  };
  const xs = on(a);
  if (typeof xs === "string") return { ok: false, period, n: 0, why: "not-combined", reason: xs };
  const ys = on(b);
  if (typeof ys === "string") return { ok: false, period, n: 0, why: "not-combined", reason: ys };
  const pairs = pairUp(xs, ys);
  if (pairs.length < MIN_PAIRS) return { ok: false, period, n: pairs.length, why: "too-few", reason: `Not enough ${NOUN[period][1]} in common (${pairs.length} of ${MIN_PAIRS}).` };
  const res = pearsonOf(pairs);
  if (!Number.isFinite(res.r)) return { ok: false, period, n: pairs.length, why: "flat", reason: "One of them does not change, so there is nothing to compare." };
  return { ok: true, period, combined, ...res };
}

/** A Metric correlated with another, or left out with the reason. */
export type Ranked = { metric: Metric; result: Extract<Correlation, { ok: true }> };
/** A Metric left out of a ranking, with why. */
export type LeftOut = { metric: Metric; why: NoCorrelation; reason: string };

/** Every other Metric correlated with this one on their common period, ranked by |r|, and those left out with why.
 * The Metric itself and Derived Metrics built from it (or it from them) are left out silently, as there is nothing
 * to learn. */
export function rankCorrelations(metric: Metric, metrics: Metric[], resolve: Resolver, opts: { yearStart: YearStart; today?: string }): { ranked: Ranked[]; leftOut: LeftOut[] } {
  const ranked: Ranked[] = [];
  const leftOut: LeftOut[] = [];
  for (const m of metrics) {
    if (m.id === metric.id || builtFrom(metric, m)) continue;
    const result = correlate(metric, m, resolve, opts);
    if (result.ok) ranked.push({ metric: m, result });
    else leftOut.push({ metric: m, why: result.why, reason: result.reason });
  }
  ranked.sort((x, y) => Math.abs(y.result.r) - Math.abs(x.result.r));
  return { ranked, leftOut };
}
