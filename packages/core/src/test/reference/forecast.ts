// The references for the seasonal forecast, the track record, the choice between the two Methods and the normal curve (spec 0041,
// ticket 6; GLOSSARY: Analysis), written from the textbooks, sharing nothing with methods/ or forecast.ts but types:
// - Holt-Winters (additive) in the error-correction form of Hyndman and Athanasopoulos, section 8.3 and the state space
//   form of 8.5: with the one-step miss e = y − (l + b + s(t−m)), l ← l + b + α·e, b ← b + α·β·e, s(t) = s(t−m) + γ·e,
//   where the code applies the component form (l = α·(y − s) + (1 − α)·(l + b), and so on). Exact fractions.
// - the spread h periods ahead from the impulse response: one unit shock is run through the same recurrences, and the
//   effect on the prediction i periods later is c(i); the closed form α·(1 + i·β) + γ·[m | i] is the check of that.
// - the track record by the literal definition: each period is forecast again from scratch from the values before it.
// - Holt's linear trend the same way, and the rule that chooses between the two.
// - Φ(z) by the Maclaurin series of erf in 150-digit fixed point (whole numbers only), so no cancellation reaches the
//   result for any z the tests ask for; Φ(z) = ½ (1 + erf(z/√2)).
// Starting values: the first season's mean, the second's, and a straight line through them (see methods/holt-winters.ts).
import { exactOfDouble, fraction, minus, nearestDoubleOf, plus, type Exact } from "./exact";

const [α, β, γ] = [fraction(1n, 2n), fraction(1n, 10n), fraction(3n, 10n)];
const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const over = (a: Exact, b: Exact) => fraction(a.num * b.den, a.den * b.num);
const whole = (n: number) => fraction(BigInt(n), 1n);
const ZERO = whole(0);
const total = (xs: readonly Exact[]) => xs.reduce(plus, ZERO);
/** The 80 % range's multiplier, 1.2816: the point below which 90 % of the normal curve lies. */
export const Z80 = 1.2815515655446004;

/** A series for the references: exact values, null where a period has no value. */
export type Y = Exact | null;
/** The state of Holt-Winters after the last value. */
export type Run = { level: Exact; trend: Exact; pattern: Exact[]; squares: Exact; errors: number; steps: { t: number; predicted: Exact; squares: Exact; errors: number }[]; m: number };

/** Holt-Winters (additive) over `y` for a season of `m`, from the first two seasons, which must hold a value each. */
export function referenceSeasonal(y: Y[], m: number): Run {
  const exact = (i: number) => y[i] as Exact;
  const mean1 = over(total(Array.from({ length: m }, (_, i) => exact(i))), whole(m));
  const mean2 = over(total(Array.from({ length: m }, (_, i) => exact(m + i))), whole(m));
  let trend = over(minus(mean2, mean1), whole(m));
  const slope = trend;
  // The straight line through the first season: its value at position j is mean₁ + slope · (j − (m − 1)/2).
  const line = (j: number) => plus(mean1, times(slope, minus(whole(j), over(whole(m - 1), whole(2)))));
  let level = line(m - 1);
  const s: Exact[] = Array.from({ length: m }, (_, j) => minus(exact(j), line(j)));
  let [squares, errors] = [ZERO, 0];
  const steps: Run["steps"] = [];
  for (let t = m; t < y.length; t++) {
    const predicted = plus(plus(level, trend), s[t - m]);
    steps.push({ t, predicted, squares, errors });
    if (y[t] === null) {
      [level, s[t]] = [plus(level, trend), s[t - m]];
      continue;
    }
    const miss = minus(exact(t), predicted);
    squares = plus(squares, times(miss, miss));
    errors++;
    // Every right-hand side reads the old level and trend.
    [level, trend, s[t]] = [plus(plus(level, trend), times(α, miss)), plus(trend, times(times(α, β), miss)), plus(s[t - m], times(γ, miss))];
  }
  return { level, trend, pattern: s.slice(y.length - m), squares, errors, steps, m };
}

/** The value `h` periods after the last, exactly. */
export function referenceAhead(r: Run, h: number): Exact {
  return plus(plus(r.level, times(whole(h), r.trend)), r.pattern[(h - 1) % r.m]);
}

/** The closed form of the spread's factor: 1 + Σ c(i)², c(i) = α·(1 + i·β) + γ·[m | i], for i from 1 to h − 1. */
export function referenceFactorClosed(h: number, m: number): Exact {
  let factor = whole(1);
  for (let i = 1; i < h; i++) {
    const c = plus(times(α, plus(whole(1), times(whole(i), β))), i % m === 0 ? γ : ZERO);
    factor = plus(factor, times(c, c));
  }
  return factor;
}

/** The same factor from the recurrences themselves: a unit shock at time 1, run forward with no further misses; the prediction
 * for time i + 1 then holds the shock's effect c(i). */
export function referenceFactor(h: number, m: number): Exact {
  let factor = whole(1);
  for (let i = 1; i < h; i++) {
    let level = α;
    const trend = times(α, β);
    const pattern = new Map<number, Exact>([[1, γ]]);
    for (let t = 2; t <= i; t++) {
      level = plus(level, trend);
      pattern.set(t, pattern.get(t - m) ?? ZERO);
    }
    const c = plus(plus(level, trend), pattern.get(i + 1 - m) ?? ZERO);
    factor = plus(factor, times(c, c));
  }
  return factor;
}

/** The variance `h` periods after the last: the mean squared miss times the factor. */
export function referenceVariance(r: Run, h: number): Exact {
  return times(over(r.squares, whole(r.errors)), referenceFactor(h, r.m));
}

/** What one period forecast from the values before it alone came to. */
export type Outcome = { t: number; miss: Exact; sd: number; inBand: boolean };
const outcome = (t: number, miss: Exact, variance: Exact): Outcome => {
  const sd = Math.sqrt(nearestDoubleOf(variance));
  return { t, miss, sd, inBand: Math.abs(nearestDoubleOf(miss)) <= Z80 * sd };
};

/** The seasonal Method's track record by the literal definition: for each period from the third season on that has a value and
 * a value before it, run the method again on the values before it and forecast one period ahead. */
export function referenceSeasonalOutcomes(y: Y[], m: number): Outcome[] {
  const out: Outcome[] = [];
  for (let t = 2 * m; t < y.length; t++) {
    if (y[t] === null || y[t - 1] === null) continue;
    const r = referenceSeasonal(y.slice(0, t), m);
    out.push(outcome(t, minus(y[t] as Exact, referenceAhead(r, 1)), referenceVariance(r, 1)));
  }
  return out;
}

/** Holt's linear trend over whole values: the exact level, trend and sum of squared misses (α = 1/2, β = 3/10 as forecast.ts states). */
export function referenceHoltRun(y: Exact[]) {
  let [level, trend, squares] = [y[0], minus(y[1], y[0]), ZERO];
  for (let t = 1; t < y.length; t++) {
    const miss = minus(y[t], plus(level, trend));
    squares = plus(squares, times(miss, miss));
    [level, trend] = [plus(plus(level, trend), times(α, miss)), plus(trend, times(times(α, fraction(3n, 10n)), miss))];
  }
  return { level, trend, squares };
}

/** Holt's track record by the literal definition: from the fifth value on, run it again on the values before and forecast one ahead. */
export function referenceHoltOutcomes(y: Exact[]): Outcome[] {
  const out: Outcome[] = [];
  for (let t = 4; t < y.length; t++) {
    const r = referenceHoltRun(y.slice(0, t));
    out.push(outcome(t, minus(y[t], plus(r.level, r.trend)), over(r.squares, whole(t - 1))));
  }
  return out;
}

/** The rule: the smaller typical miss on the last third of the series on the periods both can be tested on, Holt on a tie or
 * with fewer than three such periods. */
export function referenceChoice(y: Exact[], m: number): { method: "holt" | "holtWinters"; why: "too-few" | "better" | "not-better"; tested: number } {
  const from = y.length - Math.floor(y.length / 3);
  const holt = referenceHoltOutcomes(y).filter((o) => o.t >= from);
  const seasonal = referenceSeasonalOutcomes(y, m).filter((o) => o.t >= from);
  const common = seasonal.filter((o) => holt.some((h) => h.t === o.t));
  if (common.length < 3) return { method: "holt", why: "too-few", tested: common.length };
  const size = (e: Exact) => (e.num < 0n ? fraction(-e.num, e.den) : e);
  const sum = (os: Outcome[]) => total(os.filter((o) => common.some((c) => c.t === o.t)).map((o) => size(o.miss)));
  const [h, w] = [sum(holt), sum(seasonal)];
  const better = w.num * h.den < h.num * w.den;
  return { method: better ? "holtWinters" : "holt", why: better ? "better" : "not-better", tested: common.length };
}

// ---- the normal curve in fixed point ----
const DIGITS = 150n;
const SCALE = 10n ** DIGITS;
const isqrt = (n: bigint): bigint => {
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
};
// arctan(1/k) at the scale, by its series.
const arctanInverse = (k: bigint): bigint => {
  let [power, sum, n] = [SCALE / k, SCALE / k, 0n];
  while (power !== 0n) {
    n++;
    power /= k * k;
    sum += (n % 2n === 1n ? -1n : 1n) * (power / (2n * n + 1n));
  }
  return sum;
};
// π by Machin's formula, then √π at the scale.
const PI = 16n * arctanInverse(5n) - 4n * arctanInverse(239n);
const SQRT_PI = isqrt(PI * SCALE);
const SQRT_2 = isqrt(2n * SCALE * SCALE);

/** Φ(z) for a finite z the Maclaurin series reaches without losing digits (|z| up to 12), by whole-number arithmetic at 150 digits. */
export function referenceNormalCdf(z: number): number {
  const e = exactOfDouble(Math.abs(z));
  const x = (((e.num * SCALE) / e.den) * SCALE) / SQRT_2;
  // erf(x) = 2/√π · Σ (−1)ⁿ x^(2n+1) ÷ (n! · (2n+1)).
  let [power, sum, n] = [x, x, 0n];
  while (power !== 0n) {
    n++;
    power = -(((power * x) / SCALE) * x) / SCALE / n;
    sum += power / (2n * n + 1n);
  }
  const erf = (2n * sum * SCALE) / SQRT_PI;
  const num = z >= 0 ? SCALE + erf : SCALE - erf;
  return nearestDoubleOf(fraction(num, 2n * SCALE));
}

/** Holt's spread factor from the recurrences themselves: a unit shock at time 1 (level α, trend α · β with β = 3/10), then no more misses; the
 * prediction for time i + 1 is level + trend, which is the shock's effect c(i). The factor is 1 + Σ c(i)² for i from 1 to h − 1. */
export function referenceHoltFactor(h: number): Exact {
  const beta = fraction(3n, 10n);
  let factor = whole(1);
  for (let i = 1; i < h; i++) {
    let level = α;
    const trend = times(α, beta);
    for (let t = 2; t <= i; t++) level = plus(level, trend);
    const c = plus(level, trend);
    factor = plus(factor, times(c, c));
  }
  return factor;
}

/** The same factor in its closed form, 1 + Σ (α · (1 + i · β))². */
export function referenceHoltFactorClosed(h: number): Exact {
  const beta = fraction(3n, 10n);
  let factor = whole(1);
  for (let i = 1; i < h; i++) {
    const c = times(α, plus(whole(1), times(whole(i), beta)));
    factor = plus(factor, times(c, c));
  }
  return factor;
}
