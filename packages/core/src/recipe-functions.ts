// The verified function library of Analysis Recipes (spec 0024, spec 0022; GLOSSARY: Analysis Recipe): the only
// calculations a recipe can use. Each takes a series in its order (the periods a widget shows) and gives a series or
// one value, worked out exactly on the values' text (exact.ts); only a result becomes a double, the one nearest to
// the exact result. Where a square root is involved (standard deviation, z-score), the root is taken of the double
// nearest to the exact square, as for Pearson's r. A recipe can never add a function: new ones come only with Ziffr,
// each with its row in the Calculation Catalogue, a reference and generated tests. Pure.
import { pearson } from "./correlation";
import { changePct, fractionOf, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "./exact";
import type { Point } from "./types";

/** A function's result: a series of points, or one value (null when it has none, such as a deviation of one value). */
export type Result = { kind: "series"; points: Point[] } | { kind: "value"; value: number | null };

const ZERO: Fraction = { num: BigInt(0), den: BigInt(1) };
const whole = (n: number): Fraction => ({ num: BigInt(n), den: BigInt(1) });
const sumOf = (fs: Fraction[]) => fs.reduce((a, b) => lowestTerms(plus(a, b)), ZERO);
const meanOf = (fs: Fraction[]) => lowestTerms(over(sumOf(fs), whole(fs.length)));
const series = (points: Point[]): Result => ({ kind: "series", points });
const value = (v: number | null): Result => ({ kind: "value", value: v });

/** The mean of the last `window` values at each period, from the first period that has that many. */
export function movingAverage(points: Point[], window: number): Result {
  const fs = points.map((p) => fractionOf(p.value));
  const out: Point[] = [];
  for (let i = window - 1; i < points.length; i++) out.push({ period: points[i].period, value: nearest(meanOf(fs.slice(i - window + 1, i + 1))) });
  return series(out);
}

/** Each value minus the one before it, from the second period on. */
export function difference(points: Point[]): Result {
  return series(points.slice(1).map((p, i) => ({ period: p.period, value: nearest(minus(fractionOf(p.value), fractionOf(points[i].value))) })));
}

/** The change on the period before in %, as a Comparison writes it: none from 0. */
export function growth(points: Point[]): Result {
  return series(points.slice(1).flatMap((p, i) => {
    const pct = changePct(p.value, points[i].value);
    return pct === null ? [] : [{ period: p.period, value: pct }];
  }));
}

/** One series as a share of another in %, for the periods both have: none where the whole is 0. */
export function share(part: Point[], whole_: Point[]): Result {
  const of = new Map(whole_.map((p) => [p.period, p.value]));
  return series(part.flatMap((p) => {
    const w = of.get(p.period);
    if (w === undefined || w === 0) return [];
    return [{ period: p.period, value: nearest(times(over(fractionOf(p.value), fractionOf(w)), whole(100))) }];
  }));
}

// The least-squares line through the values against their place (0, 1, 2, …): slope = Σ(x − x̄)(y − ȳ) ÷ Σ(x − x̄)².
function line(points: Point[]): { slope: Fraction; intercept: Fraction } | null {
  if (points.length < 2) return null;
  const ys = points.map((p) => fractionOf(p.value));
  const xs = points.map((_, i) => whole(i));
  const [mx, my] = [meanOf(xs), meanOf(ys)];
  const sxy = sumOf(xs.map((x, i) => times(minus(x, mx), minus(ys[i], my))));
  const sxx = sumOf(xs.map((x) => times(minus(x, mx), minus(x, mx))));
  const slope = lowestTerms(over(sxy, sxx));
  return { slope, intercept: lowestTerms(minus(my, times(slope, mx))) };
}

/** The straight line that fits the values best (least squares), at each of their periods. */
export function linearTrend(points: Point[]): Result {
  const l = line(points);
  return series(l ? points.map((p, i) => ({ period: p.period, value: nearest(plus(l.intercept, times(l.slope, whole(i)))) })) : []);
}

/** How much that line rises per period: its slope. None for fewer than two values. */
export function slope(points: Point[]): Result {
  const l = line(points);
  return value(l ? nearest(l.slope) : null);
}

/** The mean of the values; none for no values. */
export function mean(points: Point[]): Result {
  return value(points.length ? nearest(meanOf(points.map((p) => fractionOf(p.value)))) : null);
}

// The sample variance, Σ(y − ȳ)² ÷ (n − 1), exactly; none for fewer than two values.
function variance(points: Point[]): Fraction | null {
  if (points.length < 2) return null;
  const ys = points.map((p) => fractionOf(p.value));
  const m = meanOf(ys);
  return lowestTerms(over(sumOf(ys.map((y) => times(minus(y, m), minus(y, m)))), whole(ys.length - 1)));
}

/** The sample standard deviation: √ of the double nearest to the exact variance. None for fewer than two values. */
export function standardDeviation(points: Point[]): Result {
  const v = variance(points);
  return value(v ? Math.sqrt(nearest(v)) : null);
}

/** How many standard deviations each value lies from the mean: ±√ of the double nearest to the exact z². None when
 * the values do not vary. */
export function zScore(points: Point[]): Result {
  const v = variance(points);
  if (!v || v.num === ZERO.num) return series([]);
  const m = meanOf(points.map((p) => fractionOf(p.value)));
  return series(points.map((p) => {
    const d = minus(fractionOf(p.value), m);
    const z2 = nearest(over(times(d, d), v));
    return { period: p.period, value: (d.num < ZERO.num ? -1 : 1) * Math.sqrt(z2) };
  }));
}

/** Each value's season position against the average of all, in % (100 is an average season): the values in order,
 * every `season`-th one in the same position (12 for months in a year). Needs two full seasons and a mean not 0. */
export function seasonalIndex(points: Point[], season: number): Result {
  if (points.length < 2 * season) return series([]);
  const fs = points.map((p) => fractionOf(p.value));
  const all = meanOf(fs);
  if (all.num === ZERO.num) return series([]);
  const at = Array.from({ length: season }, (_, k) => meanOf(fs.filter((_, i) => i % season === k)));
  return series(points.map((p, i) => ({ period: p.period, value: nearest(times(over(at[i % season], all), whole(100))) })));
}

/** Pearson's r of two series on the periods both have, as the Correlation Analysis computes it (correlation.ts). */
export function correlation(a: Point[], b: Point[]): Result {
  const r = pearson(a, b);
  return value(r && Number.isFinite(r.r) ? r.r : null);
}
