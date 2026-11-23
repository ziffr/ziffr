// The references for the Heads-ups about one Metric (spec 0041, ticket 15; GLOSSARY: Heads-up), written from the definitions and sharing
// nothing with src/methods/ (heads-up-single.ts, t-curve.ts, change-point.ts):
// - a straight line through the latest values is found by the normal equations on exact fractions (n·Σx² − (Σx)² as the denominator, no
//   centring), its value at a later place and the variance of that value, s²·(1/n + (x₀ − x̄)² ÷ Sxx), written out as one fraction;
// - the chance that value is as far off a bound as it is, from Student's t with n − 2 degrees of freedom, is half the area in both tails
//   (heads-up.ts's referenceChance: Gauss-Legendre over the density, no incomplete beta), so a negative distance is that half and a
//   positive one is 1 less it;
// - a new value against k earlier ones is the two-tailed chance of |latest − mean| ÷ (s·√(1 + 1/k)) with k − 1 degrees of freedom;
// - the chance of a change point by luck is worked out from the definition: every date that leaves 4 values each side tried, each side's
//   line by the normal equations, the best date the smallest sum of squared misses (the earliest on a tie), and (SSE₁ ÷ SSE₀)^((n − 4) ÷ 2)
//   times the dates tried, at most 1, with the exponent taken on the doubles of the two sums.
import { exactOf, fraction, minus, plus, ZERO, type Exact } from "./exact";
import { referenceChance } from "./heads-up";

const times = (a: Exact, b: Exact): Exact => fraction(a.num * b.num, a.den * b.den);
const over = (a: Exact, b: Exact): Exact => (b.num < 0n ? fraction(-a.num * b.den, a.den * -b.num) : fraction(a.num * b.den, a.den * b.num));
const whole = (n: number): Exact => fraction(BigInt(n), 1n);
const sum = (xs: readonly Exact[]) => xs.reduce(plus, ZERO);
const toNumber = (x: Exact): number => {
  // The double nearest to an exact fraction, by scaling to 60 digits and back (more than a double holds, so only the last rounding is lost).
  const scale = 10n ** 60n;
  return Number((x.num * scale) / x.den) / 1e60;
};

/** The straight line through `values` at the places 0, 1, 2, ...: its value at place `at` and the variance of that value, exactly (null variance: no miss). */
export function referenceLine(values: readonly number[], at: number): { yhat: Exact; variance: Exact } {
  const n = values.length;
  const ys = values.map((v) => exactOf(v));
  const xs = values.map((_, i) => whole(i));
  const [sx, sy] = [sum(xs), sum(ys)];
  const sxx = sum(xs.map((x) => times(x, x)));
  const sxy = sum(xs.map((x, i) => times(x, ys[i])));
  const syy = sum(ys.map((y) => times(y, y)));
  const det = minus(times(whole(n), sxx), times(sx, sx));
  const slope = over(minus(times(whole(n), sxy), times(sx, sy)), det);
  const intercept = over(minus(times(sy, sxx), times(sx, sxy)), det);
  const yhat = plus(intercept, times(slope, whole(at)));
  // SSE = Σy² − a·Σy − b·Σxy (the normal equations make the cross terms vanish).
  const sse = minus(minus(syy, times(intercept, sy)), times(slope, sxy));
  const s2 = over(sse, whole(n - 2));
  const meanX = over(sx, whole(n));
  const sxxCentred = minus(sxx, over(times(sx, sx), whole(n)));
  const d = minus(whole(at), meanX);
  const variance = times(s2, plus(over(whole(1), whole(n)), over(times(d, d), sxxCentred)));
  return { yhat, variance };
}

/** The chance that a t value with `df` degrees of freedom is at or below `t` (below 0: half the area in both tails; at or above 0: the rest). */
export function referenceLowerTail(t: number, df: number): number {
  const half = referenceChance(Math.abs(t) / Math.sqrt(df + t * t), df + 2) / 2;
  return t <= 0 ? half : 1 - half;
}

/** The chance that a line's value is as far below `bound` as it is or lower, with the line's value and variance exact and `df` the degrees of freedom (n − 2). */
export function referenceBelow(line: { yhat: Exact; variance: Exact }, bound: number, df: number): number {
  const short = minus(line.yhat, exactOf(bound));
  if (line.variance.num === 0n) return short.num < 0n ? 0 : 1;
  return referenceLowerTail(toNumber(short) / Math.sqrt(toNumber(line.variance)), df);
}

/** The two-tailed chance of a new value against earlier ones, from the definition. 1 where the earlier ones are all the same. */
export function referenceNewValue(earlier: readonly number[], latest: number): number {
  const k = earlier.length;
  const es = earlier.map((v) => exactOf(v));
  const mean = over(sum(es), whole(k));
  const ss = sum(es.map((e) => times(minus(e, mean), minus(e, mean))));
  if (ss.num === 0n) return 1;
  const d = minus(exactOf(latest), mean);
  const t2 = over(times(d, d), times(over(ss, whole(k - 1)), plus(whole(1), over(whole(1), whole(k)))));
  const t = Math.sqrt(toNumber(t2));
  return Math.min(1, 2 * referenceLowerTail(-t, k - 1));
}

// The sum of squared misses of a straight line through values at 0, 1, 2, ... exactly.
function referenceSse(values: readonly number[]): Exact {
  const n = values.length;
  const ys = values.map((v) => exactOf(v));
  const xs = values.map((_, i) => whole(i));
  const [sx, sy] = [sum(xs), sum(ys)];
  const sxx = sum(xs.map((x) => times(x, x)));
  const sxy = sum(xs.map((x, i) => times(x, ys[i])));
  const syy = sum(ys.map((y) => times(y, y)));
  const det = minus(times(whole(n), sxx), times(sx, sx));
  const slope = over(minus(times(whole(n), sxy), times(sx, sy)), det);
  const intercept = over(minus(times(sy, sxx), times(sx, sxy)), det);
  return minus(minus(syy, times(intercept, sy)), times(slope, sxy));
}

/** The best date to split `values` (the index where the later part starts), the two sums of squared misses, the dates tried and the chance by luck, from the definition. */
export function referenceChangeChance(values: readonly number[]): { index: number; sse0: Exact; sse1: Exact; tries: number; p: number } {
  const n = values.length;
  const all = referenceSse(values);
  const tries = n - 7;
  let best: { index: number; sse: Exact } | null = null;
  for (let k = 4; k <= n - 4; k++) {
    const sse = plus(referenceSse(values.slice(0, k)), referenceSse(values.slice(k)));
    if (best === null || sse.num * best.sse.den < best.sse.num * sse.den) best = { index: k, sse };
  }
  const sse1 = best!.sse;
  const ratio = sse1.num === 0n ? 0 : toNumber(over(sse1, all));
  return { index: best!.index, sse0: all, sse1, tries, p: all.num === 0n ? 1 : Math.min(1, tries * ratio ** ((n - 4) / 2)) };
}

/** The change `a - b` of two values written as decimals, exactly (a number of doubles would lose the last digit of 0.3 - 0.1). */
export function referenceMinus(a: number, b: number): Exact {
  return minus(exactOf(a), exactOf(b));
}

/** The two-sided chance of a difference of means as large as that of `before` and `after` (changes, exact), by the pooled two-sample t-test from the definition: the
 * pooled variance (SS₁ + SS₂) ÷ (n₁ + n₂ - 2), the standard error √(pooled · (1/n₁ + 1/n₂)), Student's t with n₁ + n₂ - 2 degrees of freedom from its density. */
export function referenceTwoSample(before: readonly Exact[], after: readonly Exact[]): number {
  if (before.length < 2 || after.length < 2) return 1;
  const stats = [before, after].map((d) => {
    const mean = over(sum(d), whole(d.length));
    return { mean, ss: sum(d.map((x) => times(minus(x, mean), minus(x, mean)))), n: d.length };
  });
  const df = before.length + after.length - 2;
  const gap = minus(stats[1].mean, stats[0].mean);
  if (stats[0].ss.num === 0n && stats[1].ss.num === 0n) return gap.num === 0n ? 1 : 0;
  const se2 = times(over(plus(stats[0].ss, stats[1].ss), whole(df)), plus(over(whole(1), whole(stats[0].n)), over(whole(1), whole(stats[1].n))));
  const t = toNumber(gap) / Math.sqrt(toNumber(se2));
  return Math.min(1, 2 * referenceLowerTail(-Math.abs(t), df));
}

export { toNumber };
