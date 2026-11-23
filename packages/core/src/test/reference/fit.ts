// The reference for the multiple fit (spec 0041, ticket 4; GLOSSARY: Takeaway), written from the textbook definitions on exact
// fractions and sharing no code with methods/fit.ts. Where the Method centres the data and eliminates, this does not:
// - the design has a column of ones for the intercept, the normal equations are (XᵀX)·b = Xᵀy with no centring, and the
//   solution is by Cramer's rule, every determinant by Laplace expansion along the first row;
// - the sum of squared misses is the sum of the squared residuals, SST that of the squared distances from the mean;
// - the share explained of a set of drivers is 1 − SSE ÷ SST of the fit on just those drivers;
// - each driver's LMG share is the mean, over every order the drivers can join in, of the rise in that share when it joins
//   (all k! orders, not the weighted sum over subsets);
// - the variance inflation of a driver is 1 ÷ (1 − R²) of fitting it on the others, and its partial correlation squared is
//   (R² − R²₋ⱼ) ÷ (1 − R²₋ⱼ), the rise in the explained share that it brings, over what was left to explain;
// - a value's range uses h = xᵀ(XᵀX)⁻¹x with the intercept in x, the inverse by cofactors;
// - `needs` is found by bisection on the band's edge: the driver values whose predicted range holds the goal.
import { compareExact, exactOf, fraction, minus, plus, ZERO, type Exact } from "./exact";

const ONE = fraction(1n, 1n);
const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const divide = (a: Exact, b: Exact) => fraction(a.num * b.den, a.den * b.num);
const total = (vs: readonly Exact[]) => vs.reduce(plus, ZERO);
const whole = (n: number) => fraction(BigInt(n), 1n);

/** The determinant by Laplace expansion along the first row. */
export function referenceDet(m: readonly (readonly Exact[])[]): Exact {
  if (m.length === 1) return m[0][0];
  return total(m[0].map((v, c) => {
    const minor = m.slice(1).map((row) => row.filter((_, j) => j !== c));
    const term = times(v, referenceDet(minor));
    return c % 2 === 0 ? term : minus(ZERO, term);
  }));
}

/** The solution of A·b = r by Cramer's rule: b_j = det(A with column j replaced by r) ÷ det(A); null for a singular A. */
export function referenceCramer(a: readonly (readonly Exact[])[], r: readonly Exact[]): Exact[] | null {
  const d = referenceDet(a);
  if (d.num === 0n) return null;
  return a.map((_, j) => divide(referenceDet(a.map((row, i) => row.map((v, c) => (c === j ? r[i] : v)))), d));
}

/** The inverse by cofactors: (A⁻¹)_ij = (−1)^(i+j) · det(A without row j and column i) ÷ det(A); null for a singular A. */
export function referenceInverse(a: readonly (readonly Exact[])[]): Exact[][] | null {
  const d = referenceDet(a);
  if (d.num === 0n) return null;
  if (a.length === 1) return [[divide(ONE, d)]];
  return a.map((_, i) => a.map((_c, j) => {
    const minor = a.filter((_r, r) => r !== j).map((row) => row.filter((_v, c) => c !== i));
    const cofactor = referenceDet(minor);
    return divide((i + j) % 2 === 0 ? cofactor : minus(ZERO, cofactor), d);
  }));
}

/** One fit on a column of ones and the chosen drivers: the intercept, the effects, the sum of squared residuals and what it explains. */
export type ReferenceFit = { intercept: Exact; effects: Exact[]; sse: Exact; sst: Exact; r2: Exact; inverse: Exact[][] };

/** Rows of exact numbers: the target and each driver. */
export type ReferenceRow = { y: Exact; x: Exact[] };

/** The fit of y on the drivers `cols` with an intercept, by the uncentred normal equations; null where they have no solution. */
export function referenceFit(rows: readonly ReferenceRow[], cols: readonly number[], target: (r: ReferenceRow) => Exact = (r) => r.y, column: (r: ReferenceRow, c: number) => Exact = (r, c) => r.x[c]): ReferenceFit | null {
  const design = rows.map((r) => [ONE, ...cols.map((c) => column(r, c))]);
  const y = rows.map(target);
  const width = design[0].length;
  const xtx = Array.from({ length: width }, (_, a) => Array.from({ length: width }, (_c, b) => total(design.map((row) => times(row[a], row[b])))));
  const xty = Array.from({ length: width }, (_, a) => total(design.map((row, i) => times(row[a], y[i]))));
  const b = referenceCramer(xtx, xty);
  const inverse = referenceInverse(xtx);
  if (!b || !inverse) return null;
  const sse = total(design.map((row, i) => {
    const miss = minus(y[i], total(row.map((v, c) => times(v, b[c]))));
    return times(miss, miss);
  }));
  const mean = divide(total(y), whole(y.length));
  const sst = total(y.map((v) => times(minus(v, mean), minus(v, mean))));
  return { intercept: b[0], effects: b.slice(1), sse, sst, r2: sst.num === 0n ? ZERO : minus(ONE, divide(sse, sst)), inverse };
}

/** The explained share of the drivers `cols` (0 for none). */
export function referenceExplained(rows: readonly ReferenceRow[], cols: readonly number[]): Exact {
  if (cols.length === 0) return ZERO;
  return referenceFit(rows, cols)!.r2;
}

/** Every driver's LMG: the mean over all orders of the rise in the explained share when the driver joins. */
export function referenceLmg(rows: readonly ReferenceRow[], k: number): Exact[] {
  const cache = new Map<string, Exact>();
  const share = (cols: number[]) => {
    const key = [...cols].sort((a, b) => a - b).join(",");
    if (!cache.has(key)) cache.set(key, referenceExplained(rows, [...cols].sort((a, b) => a - b)));
    return cache.get(key)!;
  };
  const orders: number[][] = [];
  const permute = (rest: number[], done: number[]) => {
    if (rest.length === 0) orders.push(done);
    rest.forEach((r, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...done, r]));
  };
  permute(Array.from({ length: k }, (_, i) => i), []);
  const sums = Array.from({ length: k }, () => ZERO);
  for (const order of orders) {
    order.forEach((j, i) => {
      const before = order.slice(0, i);
      sums[j] = plus(sums[j], minus(share([...before, j]), share(before)));
    });
  }
  return sums.map((s) => divide(s, whole(orders.length)));
}

/** The variance inflation of driver j: 1 ÷ (1 − R²) of fitting it on the other drivers; null where it is exactly explained by them. */
export function referenceInflation(rows: readonly ReferenceRow[], k: number, j: number): Exact | null {
  const others = Array.from({ length: k }, (_, i) => i).filter((i) => i !== j);
  if (others.length === 0) return ONE;
  const f = referenceFit(rows, others, (r) => r.x[j]);
  if (!f) return null;
  const left = minus(ONE, f.r2);
  return left.num === 0n ? null : divide(ONE, left);
}

/** The partial correlation of driver j with the target, squared: (R² − R²₋ⱼ) ÷ (1 − R²₋ⱼ). */
export function referencePartialSquared(rows: readonly ReferenceRow[], k: number, j: number): Exact {
  const all = Array.from({ length: k }, (_, i) => i);
  const without = referenceExplained(rows, all.filter((i) => i !== j));
  return divide(minus(referenceExplained(rows, all), without), minus(ONE, without));
}

/** The leverage h = xᵀ(XᵀX)⁻¹x of driver values, with the intercept in x. */
export function referenceLeverage(f: ReferenceFit, x: readonly Exact[]): Exact {
  const v = [ONE, ...x];
  return total(f.inverse.flatMap((row, a) => row.map((c, b) => times(v[a], times(c, v[b])))));
}

/** The fitted value at driver values. */
export function referenceValue(f: ReferenceFit, x: readonly Exact[]): Exact {
  return plus(f.intercept, total(f.effects.map((b, j) => times(b, x[j]))));
}

/** The squared half width of a value's range at driver values, in t² units: σ²·(1 + h), σ² = SSE ÷ df. */
export function referenceBandSquared(f: ReferenceFit, n: number, k: number, x: readonly Exact[]): Exact {
  return times(divide(f.sse, whole(n - k - 1)), plus(ONE, referenceLeverage(f, x)));
}

/** The driver values (driver j moving, the others held at `held`) whose predicted range, t = the quantile, holds the goal, found
 * by bisection from the answer outwards: [lo, hi], or null where there is no end on a side (the effect is not clear). */
export function referenceNeedsRange(f: ReferenceFit, n: number, k: number, t: number, goal: Exact, j: number, held: readonly Exact[], star: Exact, scale: number): [Exact, Exact] | null {
  const t2 = exactOf(t * t);
  const inside = (xj: Exact) => {
    const x = held.map((h, i) => (i === j ? xj : h));
    const miss = minus(goal, referenceValue(f, x));
    return compareExact(times(miss, miss), times(t2, referenceBandSquared(f, n, k, x))) <= 0;
  };
  const edge = (direction: 1 | -1): Exact | null => {
    // Out to a point that is outside, doubling the step; a side with none within a million spreads has no end.
    let far = star;
    const step = exactOf(scale);
    for (let i = 0; i < 40 && inside(far); i++) {
      far = plus(star, times(whole(direction), times(step, whole(2 ** i))));
    }
    if (inside(far)) return null;
    let [good, bad] = [star, far];
    for (let i = 0; i < 120; i++) {
      const mid = divide(plus(good, bad), whole(2));
      if (inside(mid)) good = mid;
      else bad = mid;
    }
    return divide(plus(good, bad), whole(2));
  };
  const [lo, hi] = [edge(-1), edge(1)];
  return lo && hi ? [lo, hi] : null;
}
