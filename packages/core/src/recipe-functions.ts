// The verified function library of Analysis Recipes (spec 0024, spec 0022; GLOSSARY: Analysis Recipe): the only
// calculations a recipe can use. Each takes a series in its order (the periods a widget shows) and gives a series or
// one value, worked out exactly on the values' text (exact.ts); only a result becomes a double, the one nearest to
// the exact result. Where a square root is involved (standard deviation, z-score), the root is taken of the double
// nearest to the exact square, as for Pearson's r. A recipe can never add a function: new ones come only with Ziffr,
// each with its row in the Calculation Catalogue, a reference and generated tests. Pure.
//
// The values are taken as whole numbers at one common scale (10^places), so sums and products are BigInt additions
// and multiplications that never need reducing, and a moving average keeps a running sum: each function takes time
// in proportion to its series (a security review measured a chain of steps over thousands of values otherwise).
// A value that is not finite is left out: it has no exact text, and a step can only ever give finite values.
import { pearson } from "./correlation";
import { changePct, fractionOf, minus, nearest, nearestDouble, over, times } from "./exact";
import type { Point } from "./types";

/** A function's result: a series of points, or one value (null when it has none, such as a deviation of one value). */
export type Result = { kind: "series"; points: Point[] } | { kind: "value"; value: number | null };

const [ZERO, TEN, HUNDRED] = [BigInt(0), BigInt(10), BigInt(100)];
const big = (n: number) => BigInt(n);
const series = (points: Point[]): Result => ({ kind: "series", points });
const value = (v: number | null): Result => ({ kind: "value", value: v });
const finite = (points: Point[]) => points.filter((p) => Number.isFinite(p.value));

// The values as whole numbers at one scale: value = ys[i] / scale, exactly.
function scaledAll(points: Point[]): { ys: bigint[]; scale: bigint } {
  const fs = points.map((p) => fractionOf(p.value));
  const places = Math.max(0, ...fs.map((f) => f.den.toString().length - 1));
  const scale = TEN ** big(places);
  return { ys: fs.map((f) => f.num * (scale / f.den)), scale };
}
const total = (ys: bigint[]) => ys.reduce((a, y) => a + y, ZERO);

/** The mean of the last `window` values at each period, from the first period that has that many. */
export function movingAverage(points: Point[], window: number): Result {
  const ps = finite(points);
  const { ys, scale } = scaledAll(ps);
  const out: Point[] = [];
  let sum = ZERO;
  ys.forEach((y, i) => {
    sum += y - (i >= window ? ys[i - window] : ZERO);
    if (i >= window - 1) out.push({ period: ps[i].period, value: nearestDouble(sum, scale * big(window)) });
  });
  return series(out);
}

/** Each value minus the one before it, from the second period on. */
export function difference(points: Point[]): Result {
  const ps = finite(points);
  return series(ps.slice(1).map((p, i) => ({ period: p.period, value: nearest(minus(fractionOf(p.value), fractionOf(ps[i].value))) })));
}

/** The change on the period before in %, as a Comparison writes it: none from 0. */
export function growth(points: Point[]): Result {
  const ps = finite(points);
  return series(ps.slice(1).flatMap((p, i) => {
    const pct = changePct(p.value, ps[i].value);
    return pct === null ? [] : [{ period: p.period, value: pct }];
  }));
}

/** One series as a share of another in %, for the periods both have: none where the whole is 0. */
export function share(part: Point[], whole: Point[]): Result {
  const of = new Map(finite(whole).map((p) => [p.period, p.value]));
  return series(finite(part).flatMap((p) => {
    const w = of.get(p.period);
    if (w === undefined || w === 0) return [];
    const v = nearest(times(over(fractionOf(p.value), fractionOf(w)), { num: HUNDRED, den: big(1) }));
    // A share of a tiny whole can be larger than any double: it has no value then.
    return Number.isFinite(v) ? [{ period: p.period, value: v }] : [];
  }));
}

// The least-squares line through (i, yᵢ): slope A / (D · scale) with A = n·Σiy − Σi·Σy and D = n·Σi² − (Σi)², so its
// value at i is (Σy·D + (n·i − Σi)·A) / (n·D·scale). Null for fewer than two values.
function line(points: Point[]) {
  const ps = finite(points);
  if (ps.length < 2) return null;
  const { ys, scale } = scaledAll(ps);
  const n = big(ys.length);
  const si = (n * (n - big(1))) / big(2);
  const sii = ((n - big(1)) * n * (big(2) * n - big(1))) / big(6);
  const siy = ys.reduce((a, y, i) => a + big(i) * y, ZERO);
  const sy = total(ys);
  const a = n * siy - si * sy;
  const d = n * sii - si * si;
  return { ps, n, a, d, sy, si, scale };
}

/** The straight line that fits the values best (least squares), at each of their periods. */
export function linearTrend(points: Point[]): Result {
  const l = line(points);
  return series(l ? l.ps.map((p, i) => ({ period: p.period, value: nearestDouble(l.sy * l.d + (l.n * big(i) - l.si) * l.a, l.n * l.d * l.scale) })) : []);
}

/** How much that line rises per period: its slope. None for fewer than two values. */
export function slope(points: Point[]): Result {
  const l = line(points);
  return value(l ? nearestDouble(l.a, l.d * l.scale) : null);
}

/** The mean of the values; none for no values. */
export function mean(points: Point[]): Result {
  const ps = finite(points);
  if (!ps.length) return value(null);
  const { ys, scale } = scaledAll(ps);
  return value(nearestDouble(total(ys), scale * big(ys.length)));
}

// n·Σy² − (Σy)², which over n·(n − 1)·scale² is the sample variance; null for fewer than two values.
function spread(ys: bigint[]): bigint | null {
  if (ys.length < 2) return null;
  const s = total(ys);
  return big(ys.length) * ys.reduce((a, y) => a + y * y, ZERO) - s * s;
}

/** The sample standard deviation: √ of the double nearest to the exact variance. None for fewer than two values. */
export function standardDeviation(points: Point[]): Result {
  const { ys, scale } = scaledAll(finite(points));
  const q = spread(ys);
  return value(q === null ? null : Math.sqrt(nearestDouble(q, big(ys.length) * big(ys.length - 1) * scale * scale)));
}

/** How many standard deviations each value lies from the mean: ±√ of the double nearest to the exact z², which is
 * (n·y − Σy)² · (n − 1) ÷ (n · (n·Σy² − (Σy)²)). None when the values do not vary. */
export function zScore(points: Point[]): Result {
  const ps = finite(points);
  const { ys } = scaledAll(ps);
  const q = spread(ys);
  if (!q) return series([]);
  const n = big(ys.length);
  const s = total(ys);
  return series(ps.map((p, i) => {
    const d = n * ys[i] - s;
    return { period: p.period, value: (d < ZERO ? -1 : 1) * Math.sqrt(nearestDouble(d * d * (n - big(1)), n * q)) };
  }));
}

/** Each value's season position against the average of all, in % (100 is an average season): the values in order,
 * every `season`-th one in the same position (12 for months in a year). Needs two full seasons and a mean not 0. */
export function seasonalIndex(points: Point[], season: number): Result {
  const ps = finite(points);
  if (ps.length < 2 * season) return series([]);
  const { ys } = scaledAll(ps);
  const all = total(ys);
  if (all === ZERO) return series([]);
  // A position's mean ÷ the mean of all × 100 = 100 · Σₖ · n ÷ (cₖ · Σ).
  const sums = Array.from({ length: season }, () => ZERO);
  const counts = Array.from({ length: season }, () => 0);
  ys.forEach((y, i) => {
    sums[i % season] += y;
    counts[i % season]++;
  });
  // nearestDouble takes a positive denominator: the sign of the mean goes to the numerator.
  const sign = all < ZERO ? big(-1) : big(1);
  return series(ps.map((p, i) => ({ period: p.period, value: nearestDouble(sign * HUNDRED * sums[i % season] * big(ys.length), sign * big(counts[i % season]) * all) })));
}

/** Pearson's r of two series on the periods both have, as the Correlation Analysis computes it (correlation.ts). */
export function correlation(a: Point[], b: Point[]): Result {
  const r = pearson(finite(a), finite(b));
  return value(r && Number.isFinite(r.r) ? r.r : null);
}

