// The references for Student's t curve, before and after and the change point (spec 0041, ticket 7; GLOSSARY: Analysis), written
// from the textbooks on exact fractions and sharing nothing with src/methods/ but types:
// - a straight line is the solution of the normal equations by Cramer's rule, [n Σx; Σx Σx²]·[a b] = [Σy Σxy], and its misses are
//   summed from the residuals y − a − b·x (the code works from sums about the means, Sxx, Sxy and Syy − Sxy²/Sxx);
// - the gap of the values after a date is their mean less the mean of the line's values there, and the variance of that gap is
//   the squared miss · (1/m + c'(X'X)⁻¹c) with c = (1, x̄ₐ) and (X'X)⁻¹ = [Σx² −Σx; −Σx n] ÷ det written out (the code uses the
//   closed form 1/m + 1/n + (x̄ₐ − x̄)² ÷ Sxx);
// - the change point tries every date by fitting both parts from scratch, and its chance rule is the F ratio of (SSE₀ − SSE₁) ÷ 2
//   to SSE₁ ÷ (n − 4), whose chance of being exceeded is (1 + 2F ÷ (n − 4))^(−(n − 4)/2), compared with 1 in 20 divided by the
//   number of dates tried;
// - Student's t curve is the regularized incomplete beta function, I_x(½, ν ÷ 2) = the chance within ±t, by Lentz's continued fraction, with
//   x = t² ÷ (ν + t²) and the logarithm of Γ at whole and half-whole numbers summed from its recurrence (the code uses the finite
//   trigonometric sums of Abramowitz and Stegun 26.7.3 and 26.7.4); the quantile is found by bisection.
import { compareExact, fraction, minus, nearestDoubleOf, plus, sumOf, ZERO, type Exact } from "./exact";

const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const divide = (a: Exact, b: Exact) => fraction(a.num * b.den, a.den * b.num);
const whole = (n: number) => fraction(BigInt(n), 1n);

/** The straight line through the points by the normal equations (Cramer's rule): intercept, slope, and the squared misses. */
export function referenceLine(x: readonly number[], y: readonly Exact[]): { intercept: Exact; slope: Exact; sse: Exact } {
  const xs = x.map(whole);
  const n = whole(x.length);
  const [sx, sy] = [sumOf(xs), sumOf(y)];
  const sxx = sumOf(xs.map((v) => times(v, v)));
  const sxy = sumOf(xs.map((v, i) => times(v, y[i])));
  const det = minus(times(n, sxx), times(sx, sx));
  const slope = divide(minus(times(n, sxy), times(sx, sy)), det);
  const intercept = divide(minus(times(sy, sxx), times(sx, sxy)), det);
  const miss = xs.map((v, i) => minus(y[i], plus(intercept, times(slope, v))));
  return { intercept, slope, sse: sumOf(miss.map((r) => times(r, r))) };
}

/** The gap to the line before a date, with what the 80 % range is made of: the exact gap, the exact squared spread of the gap (the squared miss times its factor), and the counts. */
export function referenceAfter(before: { x: number; y: Exact }[], after: { x: number; y: Exact }[]) {
  const [n, m] = [before.length, after.length];
  const { intercept, slope, sse } = referenceLine(before.map((p) => p.x), before.map((p) => p.y));
  const predicted = after.map((p) => plus(intercept, times(slope, whole(p.x))));
  const expected = divide(sumOf(predicted), whole(m));
  const actual = divide(sumOf(after.map((p) => p.y)), whole(m));
  const gap = minus(actual, expected);
  // The squared miss of the line, s² = SSE ÷ (n − 2), and the variance of the line's mean value over the periods after,
  // c'(X'X)⁻¹c · s², with c = (1, mean position after).
  const s2 = divide(sse, whole(n - 2));
  const xs = before.map((p) => whole(p.x));
  const [sx, sxx] = [sumOf(xs), sumOf(xs.map((v) => times(v, v)))];
  const det = minus(times(whole(n), sxx), times(sx, sx));
  const cx = divide(sumOf(after.map((p) => whole(p.x))), whole(m));
  const quadratic = divide(minus(plus(sxx, times(whole(n), times(cx, cx))), times(whole(2), times(cx, sx))), det);
  const variance = times(s2, plus(divide(whole(1), whole(m)), quadratic));
  return { n, m, slope, intercept, sse, s2, expected, actual, gap, variance };
}

/** What the change point tries: for every date with at least 4 values each side, both parts fitted from scratch; the best date (the earliest of equal misses), and whether it clears the chance rule. */
export function referenceChange(x: readonly number[], y: readonly Exact[]) {
  const n = x.length;
  const tries = n - 7;
  let best: { k: number; sse: Exact; left: ReturnType<typeof referenceLine>; right: ReturnType<typeof referenceLine> } | null = null;
  for (let k = 4; k <= n - 4; k++) {
    const left = referenceLine(x.slice(0, k), y.slice(0, k));
    const right = referenceLine(x.slice(k), y.slice(k));
    const sse = plus(left.sse, right.sse);
    if (best === null || compareExact(sse, best.sse) < 0) best = { k, sse, left, right };
  }
  const { k, sse, left, right } = best!;
  const one = referenceLine(x, y);
  const d = n - 4;
  let found = false;
  if (compareExact(one.sse, ZERO) > 0) {
    if (compareExact(sse, ZERO) === 0) found = true;
    else {
      // The chance of an F at least this large, (1 + 2F ÷ d)^(−d/2), against 1 in 20 per date tried: (1 + 2F ÷ d)^d > (20 · tries)².
      const f = divide(divide(minus(one.sse, sse), whole(2)), divide(sse, whole(d)));
      const base = plus(whole(1), divide(times(whole(2), f), whole(d)));
      found = compareExact({ num: base.num ** BigInt(d), den: base.den ** BigInt(d) }, whole((20 * tries) ** 2)) > 0;
    }
  }
  const at = whole(x[k]);
  const step = minus(plus(right.intercept, times(right.slope, at)), plus(left.intercept, times(left.slope, at)));
  return { n, tries, index: k, sse0: one.sse, sse1: sse, left, right, step, found, slopeChange: minus(right.slope, left.slope) };
}

// ---- Student's t curve ----

/** ln Γ(k ÷ 2) for a whole k ≥ 1: Stirling's series from 12 on, and below that Γ(z + 1) = z·Γ(z) up to it. */
function lnGammaHalf(k: number): number {
  let [z, shift] = [k / 2, 0];
  for (; z < 12; z += 1) shift -= Math.log(z);
  const stirling = (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * z) - 1 / (360 * z ** 3) + 1 / (1260 * z ** 5) - 1 / (1680 * z ** 7);
  return stirling + shift;
}

// Lentz's continued fraction for the incomplete beta function (Numerical Recipes, betacf).
function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const [qab, qap, qam] = [a + b, a + 1, a - 1];
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 100_000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b) for a and b whole or half-whole (given as twice themselves, `a2` and `b2`), x from 0 to 1. */
function beta(x: number, a2: number, b2: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [a, b] = [a2 / 2, b2 / 2];
  const front = Math.exp(lnGammaHalf(a2 + b2) - lnGammaHalf(a2) - lnGammaHalf(b2) + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2) ? (front * betaFraction(a, b, x)) / a : 1 - (front * betaFraction(b, a, 1 - x)) / b;
}

/** Student's t curve: the chance of a value at or below `t` with `nu` degrees of freedom. The chance of a value within ±|t| is
 * I_x(½, ν ÷ 2) with x = t² ÷ (ν + t²), which keeps its digits near 0; the curve is symmetric. */
export function referenceTCdf(t: number, nu: number): number {
  const within = beta((t * t) / (nu + t * t), 1, nu);
  return t >= 0 ? 0.5 + within / 2 : 0.5 - within / 2;
}

/** The point below which a t value lies with chance `p` (0.5 to 0.999), by bisection on the curve. */
export function referenceTQuantile(p: number, nu: number): number {
  let [lo, hi] = [0, 1e4];
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (referenceTCdf(mid, nu) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The 80 % range's half-width of an exact squared spread: the t point times its square root, the root taken of the double nearest the exact variance. */
export function referenceHalf(variance: Exact, nu: number): number {
  return referenceTQuantile(0.9, nu) * Math.sqrt(nearestDoubleOf(variance));
}
