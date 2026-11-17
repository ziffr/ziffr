import type { Point } from "@ziffr/core/types";
import { shiftPeriod, type Span } from "@ziffr/core/periods";

export type ForecastPoint = { period: string; value: number; lo: number; hi: number };

// A few spans ahead: two weeks of days, three months, one year.
const HORIZON: Record<Span, number> = { day: 14, week: 6, month: 3, quarter: 2, half: 2, year: 1 };

/** Holt's linear trend (double exponential smoothing) with a widening ~95% band. */
export function forecast(points: Point[], period: Span, horizon = HORIZON[period]) {
  if (points.length < 4) return null;
  const alpha = 0.5;
  const beta = 0.3;
  const ys = points.map((p) => p.value);
  let level = ys[0];
  let trend = ys[1] - ys[0];
  const residuals: number[] = [];
  for (let t = 1; t < ys.length; t++) {
    const predicted = level + trend;
    residuals.push(ys[t] - predicted);
    const prevLevel = level;
    level = alpha * ys[t] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  const sd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  const last = points[points.length - 1].period;
  const out: ForecastPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    const value = level + h * trend;
    const spread = 1.96 * sd * Math.sqrt(h);
    out.push({ period: shiftPeriod(last, period, h), value, lo: value - spread, hi: value + spread });
  }
  return { points: out, trendPerPeriod: trend, sd };
}
