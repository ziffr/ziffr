// The seasonal forecast (GLOSSARY: Analysis; spec 0041, Methods "Seasonal forecast", `holtWinters`): a Metric's trend and
// its yearly (or weekly) pattern projected a few periods ahead, by the Holt-Winters additive method as Hyndman and
// Athanasopoulos write it (Forecasting: Principles and Practice, 3rd ed., section 8.3). Pure.
//
// The recurrences, for a season of m periods, with the level l, the trend b and the pattern s:
//   prediction  ŷ(t) = l(t−1) + b(t−1) + s(t−m)
//   l(t) = α · (y(t) − s(t−m)) + (1 − α) · (l(t−1) + b(t−1))
//   b(t) = β · (l(t) − l(t−1)) + (1 − β) · b(t−1)
//   s(t) = γ · (y(t) − l(t−1) − b(t−1)) + (1 − γ) · s(t−m)
//   h periods after the last value: l + h · b + s(the same position in the latest season).
// The smoothing factors are fixed, as Holt's in forecast.ts are: α = 1/2, β = 1/10, γ = 3/10. They are not fitted to the
// series: with two seasons to learn from, a fit would only learn the noise, and the same series gives the same numbers on
// every machine. Everything is worked out on exact fractions of the values' text (exact.ts); only the square root of the
// spread and the last step to a double are not exact.
//
// Where it starts. The first season's mean, the second's, and a straight line through their difference give the
// starting level, trend and pattern: with b0 = (mean₂ − mean₁) ÷ m, the line through the first season is
// mean₁ + b0 · (j − (m−1)/2) at position j, the level after the first season is that line's value at its last position,
// and the pattern is each value's distance from the line (so the pattern sums to 0). A series that is exactly a straight
// line plus a repeating pattern is therefore recovered exactly, with no miss at all. The recurrences then run from the
// second season on, so the first one-step miss is the first value of the second season.
//
// Missing periods. A period without a value is not filled in: the level moves on by the trend, the pattern stays, and no
// miss is counted. The first two seasons must be complete (they are what it starts from).
//
// The spread. The one-step spread is the root of the mean squared one-step miss, as in forecast.ts. h periods ahead the
// variance is that mean square times 1 + Σ c(i)², for i from 1 to h−1, with c(i) = α · (1 + i · β) + γ if i is a whole
// number of seasons and α · (1 + i · β) otherwise (Hyndman and Athanasopoulos, the table of prediction intervals for
// additive Holt-Winters). The shown band is 1.96 spreads either side, like Holt's; a Takeaway's "likely between" is 1.2816.
import { readSeries } from "../basis";
import { fractionOf, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "../exact";
import { HORIZON, type ForecastPoint } from "../forecast";
import { periodsBetween, shiftPeriod, type Span } from "../periods";
import type { Point } from "../types";

const f = (num: number, den: number): Fraction => ({ num: BigInt(num), den: BigInt(den) });
/** The fixed smoothing factors: the level's, the trend's and the pattern's. */
export const SMOOTHING = { level: f(1, 2), trend: f(1, 10), season: f(3, 10) } as const;
const ZERO = f(0, 1);
const ONE = f(1, 1);
const add = (a: Fraction, b: Fraction) => lowestTerms(plus(a, b));
const sub = (a: Fraction, b: Fraction) => lowestTerms(minus(a, b));
const mul = (a: Fraction, b: Fraction) => lowestTerms(times(a, b));
const sum = (fs: Fraction[]) => fs.reduce(add, ZERO);

/** What the method predicted for the value at `period` before it came, and the exact sum and count of the one-step misses up
 * to then: what a forecast made at that moment would have had (the track record reads these). */
export type SeasonalStep = { period: string; predicted: Fraction; squares: Fraction; errors: number };

/** The method run over a series: its state after the last value, exact, and the prediction made before each value of the second season on. */
export type SeasonalFit = {
  /** The first and the last period. */
  first: string;
  last: string;
  /** How many periods from the first to the last, counting those with no value. */
  length: number;
  season: number;
  level: Fraction;
  trend: Fraction;
  /** The latest season's pattern, the oldest position first: position j is the one the value for `last` − (season − 1 − j) belongs to. */
  pattern: Fraction[];
  /** The sum of the squared one-step misses, and how many there were. */
  squares: Fraction;
  errors: number;
  steps: SeasonalStep[];
};

/** Why the method cannot run: the season is shorter than 2 periods (a yearly Metric has none), the series is shorter than two seasons, or a period in the first two seasons has no value. */
export type SeasonalRefusal = "season" | "short" | "start-gap";

/** The method's fit, or why it cannot run. The input is only read; periods are read as every Method reads them (readSeries). */
export function fitHoltWinters(points: Point[], span: Span, season: number): { ok: true; fit: SeasonalFit } | { ok: false; why: SeasonalRefusal } {
  if (season < 2) return { ok: false, why: "season" };
  const rows = readSeries(points);
  if (rows.length < 2 * season) return { ok: false, why: "short" };
  const first = rows[0].period;
  const last = rows[rows.length - 1].period;
  const n = periodsBetween(first, last, span) + 1;
  const cell = new Map(rows.map((r) => [periodsBetween(first, r.period, span), fractionOf(r.value)]));
  const start = Array.from({ length: 2 * season }, (_, t) => cell.get(t));
  if (start.some((v) => v === undefined)) return { ok: false, why: "start-gap" };
  const [m, mf] = [season, f(season, 1)];
  const [one, two] = [sum(start.slice(0, m) as Fraction[]), sum(start.slice(m) as Fraction[])];
  const [mean1, mean2] = [over(one, mf), over(two, mf)];
  const slope = over(sub(mean2, mean1), mf);
  // The line through the first season, at position j: mean₁ + slope · (j − (m − 1)/2).
  const line = (j: number) => add(mean1, mul(slope, sub(f(j, 1), f(m - 1, 2))));
  let [level, trend] = [line(m - 1), slope];
  const s: Fraction[] = start.slice(0, m).map((y, j) => sub(y as Fraction, line(j)));
  const { level: a, trend: b, season: g } = SMOOTHING;
  let squares = ZERO;
  let errors = 0;
  const steps: SeasonalStep[] = [];
  for (let t = m; t < n; t++) {
    const predicted = add(add(level, trend), s[t - m]);
    steps.push({ period: shiftPeriod(first, span, t), predicted, squares, errors });
    const y = cell.get(t);
    if (y === undefined) {
      // No value: the level moves on by the trend, the pattern stays, and nothing is counted.
      level = add(level, trend);
      s[t] = s[t - m];
      continue;
    }
    const miss = sub(y, predicted);
    squares = add(squares, mul(miss, miss));
    errors++;
    const before = add(level, trend);
    const next = add(mul(a, sub(y, s[t - m])), mul(sub(ONE, a), before));
    trend = add(mul(b, sub(next, level)), mul(sub(ONE, b), trend));
    s[t] = add(mul(g, sub(y, before)), mul(sub(ONE, g), s[t - m]));
    level = next;
  }
  return { ok: true, fit: { first, last, length: n, season, level, trend, pattern: s.slice(n - m), squares, errors, steps } };
}

/** The value `h` periods after the last, exactly: level + h · trend + the pattern at the same position of the latest season. */
export function seasonalAhead(fit: SeasonalFit, h: number): Fraction {
  return add(add(fit.level, mul(f(h, 1), fit.trend)), fit.pattern[(h - 1) % fit.season]);
}

/** The variance of the value `h` periods after the last, exactly: the mean squared one-step miss times 1 + Σ c(i)². */
export function seasonalVariance(fit: SeasonalFit, h: number): Fraction {
  const { level: a, trend: b, season: g } = SMOOTHING;
  let factor = ONE;
  for (let i = 1; i < h; i++) {
    const c = add(mul(a, add(ONE, mul(f(i, 1), b))), i % fit.season === 0 ? g : ZERO);
    factor = add(factor, mul(c, c));
  }
  return mul(over(fit.squares, f(fit.errors, 1)), factor);
}

/** One period ahead: the value, its band (1.96 spreads each side, as Holt's) and the spread itself. */
export type SeasonalPoint = ForecastPoint & { sd: number };

/** The seasonal forecast `horizon` periods ahead (the default of the Metric's period), with the one-step spread `sd`, the
 * trend per period and how many misses the spread rests on; or why it cannot run. `season` is the length of a season in periods. */
export function holtWinters(points: Point[], span: Span, season: number, horizon = HORIZON[span]) {
  const run = fitHoltWinters(points, span, season);
  if (!run.ok) return run;
  const { fit } = run;
  const out: SeasonalPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    const value = nearest(seasonalAhead(fit, h));
    const sd = Math.sqrt(nearest(seasonalVariance(fit, h)));
    const spread = 1.96 * sd;
    out.push({ period: shiftPeriod(fit.last, span, h), value, lo: value - spread, hi: value + spread, sd });
  }
  return { ok: true as const, points: out, trendPerPeriod: nearest(fit.trend), sd: Math.sqrt(nearest(over(fit.squares, f(fit.errors, 1)))), errors: fit.errors, season, first: fit.first };
}
