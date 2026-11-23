// @ts-nocheck
// The references for the Analyses (spec 0022, Testing Decisions; GLOSSARY: Analysis): Pearson's r and Holt's
// forecast, written from their textbook definitions on exact fractions, sharing nothing with correlation.ts or
// forecast.ts:
// - Pearson's r of n pairs is Σ(x − x̄)(y − ȳ) ÷ √(Σ(x − x̄)² · Σ(y − ȳ)²); here r² and the sign are exact, and the
//   series that does not change (a sum of squares of 0) has none;
// - Holt's linear trend starts with the first value as the level and the first step as the trend; for each later
//   value y it predicts level + trend, notes the error y − prediction, then level ← ½·y + ½·(level + trend) and
//   trend ← 3/10·(new level − old level) + 7/10·trend. The value h periods after the last is level + h·trend; the
//   band is 1.96 · sd · √h either side, with sd the root of the mean squared error.
import { fraction, minus, plus, type Exact } from "./exact";

const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const of = (n: bigint, d = 1n) => fraction(n, d);

/** Pearson's r as its exact square and its sign, or null for a series that does not change. */
export function referencePearson(xs: readonly Exact[], ys: readonly Exact[]): { r2: Exact; negative: boolean } | null {
  const n = BigInt(xs.length);
  const mean = (vs: readonly Exact[]) => fraction(vs.reduce((a, v) => plus(a, v), of(0n)).num, vs.reduce((a, v) => plus(a, v), of(0n)).den * n);
  const [mx, my] = [mean(xs), mean(ys)];
  let [sxy, sxx, syy] = [of(0n), of(0n), of(0n)];
  for (let i = 0; i < xs.length; i++) {
    const [dx, dy] = [minus(xs[i], mx), minus(ys[i], my)];
    sxy = plus(sxy, times(dx, dy));
    sxx = plus(sxx, times(dx, dx));
    syy = plus(syy, times(dy, dy));
  }
  if (sxx.num === 0n || syy.num === 0n) return null;
  const top = times(sxy, sxy);
  const bottom = times(sxx, syy);
  return { r2: fraction(top.num * bottom.den, top.den * bottom.num), negative: sxy.num < 0n };
}

/** Holt's forecast: the exact level, trend and mean squared one-step error after the last value, and the exact value
 * each step ahead. */
export function referenceHolt(ys: readonly Exact[], horizon: number): { level: Exact; trend: Exact; meanSquare: Exact; ahead: Exact[] } {
  const [alpha, beta] = [of(1n, 2n), of(3n, 10n)];
  const one = of(1n);
  let level = ys[0];
  let trend = minus(ys[1], ys[0]);
  let squares = of(0n);
  for (let t = 1; t < ys.length; t++) {
    const error = minus(ys[t], plus(level, trend));
    squares = plus(squares, times(error, error));
    const before = level;
    level = plus(times(alpha, ys[t]), times(minus(one, alpha), plus(level, trend)));
    trend = plus(times(beta, minus(level, before)), times(minus(one, beta), trend));
  }
  const meanSquare = fraction(squares.num, squares.den * BigInt(ys.length - 1));
  const ahead = Array.from({ length: horizon }, (_, i) => plus(level, times(of(BigInt(i + 1)), trend)));
  return { level, trend, meanSquare, ahead };
}
