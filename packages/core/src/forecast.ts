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

// A few spans ahead: two weeks of days, three months, two quarters, one year.
const HORIZON: Record<Span, number> = { day: 14, week: 6, month: 3, quarter: 2, half: 2, year: 1 };

/** How many values a forecast needs: Holt's method fits a level and a trend, which takes four points. */
export const FORECAST_MIN_POINTS = 4;

const f = (num: number, den: number): Fraction => ({ num: BigInt(num), den: BigInt(den) });
// The smoothing factors: alpha for the level, beta for the trend.
const ALPHA = f(1, 2);
const BETA = f(3, 10);
const ONE = f(1, 1);

/** Holt's linear trend (double exponential smoothing) with a widening ~95% band, for the points in their order. */
export function forecast(points: Point[], period: Span, horizon = HORIZON[period]) {
  if (points.length < FORECAST_MIN_POINTS) return null;
  const ys = points.map((p) => fractionOf(p.value));
  let level = ys[0];
  let trend = minus(ys[1], ys[0]);
  let squares = f(0, 1);
  for (let t = 1; t < ys.length; t++) {
    // The one-step error: what came against what the level and trend predicted.
    const error = minus(ys[t], plus(level, trend));
    squares = lowestTerms(plus(squares, times(error, error)));
    const prevLevel = level;
    level = lowestTerms(plus(times(ALPHA, ys[t]), times(minus(ONE, ALPHA), plus(level, trend))));
    trend = lowestTerms(plus(times(BETA, minus(level, prevLevel)), times(minus(ONE, BETA), trend)));
  }
  const sd = Math.sqrt(nearest({ num: squares.num, den: squares.den * BigInt(ys.length - 1) }));
  const last = points[points.length - 1].period;
  const out: ForecastPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    const value = nearest(plus(level, times(f(h, 1), trend)));
    const spread = 1.96 * sd * Math.sqrt(h);
    out.push({ period: shiftPeriod(last, period, h), value, lo: value - spread, hi: value + spread });
  }
  return { points: out, trendPerPeriod: nearest(trend), sd };
}
