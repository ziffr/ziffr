// The forecast (GLOSSARY: Analysis): a Metric's trend projected a few periods ahead by Holt's linear trend method,
// with a band that widens with each step. Pure, so the Metric page and the forecast widget draw the same numbers.
//
// The level and the trend are worked out exactly on the values' text (exact.ts), with the smoothing factors as the
// fractions they are (1/2 and 3/10), so a long daily series does not drift; each value ahead is the double nearest to
// the exact one. The band's spread, 1.96 × sd × √h, has square roots and is computed in doubles from the exact
// mean square of the one-step errors (spec 0022, #126).
import { fractionOf, lowestTerms, minus, nearest, plus, times, type Fraction } from "./exact";
import { shiftPeriod, type Span } from "./periods";
import type { Point } from "./types";

/** One period ahead: the value forecast for it and the band around it. */
export type ForecastPoint = { period: string; value: number; lo: number; hi: number };

/** How many periods ahead a forecast looks by default: two weeks of days, six weeks, three months, two quarters, one year. */
export const HORIZON: Record<Span, number> = { day: 14, week: 6, month: 3, quarter: 2, half: 2, year: 1 };

/** How many values a forecast needs: Holt's method fits a level and a trend, which takes four points. */
export const FORECAST_MIN_POINTS = 4;

const f = (num: number, den: number): Fraction => ({ num: BigInt(num), den: BigInt(den) });
// The smoothing factors: alpha for the level, beta for the trend.
const ALPHA = f(1, 2);
const BETA = f(3, 10);
const ONE = f(1, 1);

/** What Holt's method predicted for the value at `index` before it came, and the exact sum and count of the one-step errors
 * up to then: what a forecast made at that moment would have had (the track record reads these). */
export type HoltStep = { index: number; predicted: Fraction; squares: Fraction; errors: number };

/** Holt's method run over the values: the exact level and trend after the last, the sum of the squared one-step errors,
 * and, for every value from the second on, the prediction made before it came. Nothing here is rounded. */
export function holtFit(ys: Fraction[]): { level: Fraction; trend: Fraction; squares: Fraction; steps: HoltStep[] } {
  let level = ys[0];
  let trend = minus(ys[1], ys[0]);
  let squares = f(0, 1);
  const steps: HoltStep[] = [];
  for (let t = 1; t < ys.length; t++) {
    // The one-step error: what came against what the level and trend predicted.
    const predicted = plus(level, trend);
    steps.push({ index: t, predicted, squares, errors: t - 1 });
    const error = minus(ys[t], predicted);
    squares = lowestTerms(plus(squares, times(error, error)));
    const prevLevel = level;
    level = lowestTerms(plus(times(ALPHA, ys[t]), times(minus(ONE, ALPHA), plus(level, trend))));
    trend = lowestTerms(plus(times(BETA, minus(level, prevLevel)), times(minus(ONE, BETA), trend)));
  }
  return { level, trend, squares, steps };
}

/** The factor the one-step variance is multiplied by `h` periods ahead under Holt's own model, exactly: 1 + Σ c(j)² for j from 1 to h − 1, with c(j) = α · (1 + j · β)
 * (a miss moves the level by α and the trend by α · β, and the trend works for each later period). The band drawn below keeps √h, as it always did. */
export function holtSpreadFactor(h: number): Fraction {
  let factor = ONE;
  for (let j = 1; j < h; j++) {
    const c = times(ALPHA, plus(ONE, times(BETA, f(j, 1))));
    factor = lowestTerms(plus(factor, times(c, c)));
  }
  return factor;
}

/** Holt's linear trend (double exponential smoothing) with a widening ~95% band, for the points in their order. */
export function forecast(points: Point[], period: Span, horizon = HORIZON[period]) {
  if (points.length < FORECAST_MIN_POINTS) return null;
  const { level, trend, squares } = holtFit(points.map((p) => fractionOf(p.value)));
  const sd = Math.sqrt(nearest({ num: squares.num, den: squares.den * BigInt(points.length - 1) }));
  const last = points[points.length - 1].period;
  const out: ForecastPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    const value = nearest(plus(level, times(f(h, 1), trend)));
    const spread = 1.96 * sd * Math.sqrt(h);
    out.push({ period: shiftPeriod(last, period, h), value, lo: value - spread, hi: value + spread });
  }
  return { points: out, trendPerPeriod: nearest(trend), sd, meanSquare: { num: squares.num, den: squares.den * BigInt(points.length - 1) } };
}
