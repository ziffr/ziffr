// The forecast a widget and a Takeaway use (GLOSSARY: Analysis; spec 0041, "Choosing is a rule written down, not a search"):
// Holt's linear trend, or Holt-Winters where the series holds two seasons and, on the last third of it, the typical miss of
// Holt-Winters is smaller (track-record.ts). Pure.
//
// What is returned is what forecast.ts returns for Holt (points with a ~95 % band, the trend per period, the spread), now with
// each point's own spread too (Holt's own model: 1 + Σ c(j)² times the one-step variance, not √h), so a range at another level (80 %) and the chance of reaching a Target can be worked out from it,
// and the choice with the track record that made it.
import { nearest, times } from "../exact";
import { forecast, HORIZON, holtSpreadFactor } from "../forecast";
import type { Span } from "../periods";
import type { Point } from "../types";
import { wideReason } from "../work-bound";
import { holtWinters, type SeasonalPoint } from "./holt-winters";
import { chooseMethod, type Candidate, type Choice } from "./track-record";

/** How many of the latest periods a forecast looks at (spec 0041: the series length used is the latest 120 periods). */
export const LATEST_PERIODS = 120;

/** What a widget and a Metric page say where there is no forecast because the values are too fine or too wide to work out exactly (work-bound.ts). */
export const NO_FORECAST_WIDE = "No forecast: the values are too fine or too wide to work out exactly.";

/** Whether `bestForecast` has none for these values for that reason (the latest 120 periods are the ones it looks at). */
export const forecastTooWide = (all: Point[]): boolean => wideReason(all.slice(-LATEST_PERIODS).map((p) => p.value)) !== null;

/** The forecast of the Method chosen, with each point's spread, the trend per period, the one-step spread, and how the Method was chosen. */
export type Projection = { method: Candidate; choice: Choice; points: SeasonalPoint[]; trendPerPeriod: number; sd: number };

/** The forecast `horizon` periods ahead (the default of the span) by the Method the rule chooses, or null with fewer than four
 * values, or values that need more than 40 decimal places or span more than 30 orders of magnitude. (One call takes under a fifth of a second for any values inside those limits; `forecastTakeaway`, which calls it for each far-off check, runs under the work budget.) `seasonal: false` rules the seasonal Method out (a check found that the pattern does not repeat). `season` is the length of a season in periods. */
export function bestForecast(all: Point[], span: Span, season: number, opts: { horizon?: number; seasonal?: boolean } = {}): Projection | null {
  const points = all.slice(-LATEST_PERIODS);
  // Values too wide to work out exactly (work-bound.ts) have no forecast; forecastTakeaway says so in words before it gets here.
  if (forecastTooWide(all)) return null;
  const horizon = opts.horizon ?? HORIZON[span];
  const choice: Choice = opts.seasonal === false ? { method: "holt", why: "holt-only", holt: null, seasonal: null } : chooseMethod(points, span, season);
  // The seasonal Method was chosen only after a run that worked, on the same points.
  const run = choice.method === "holtWinters" ? holtWinters(points, span, season, horizon) : null;
  if (run?.ok) return { method: "holtWinters", choice, points: run.points, trendPerPeriod: run.trendPerPeriod, sd: run.sd };
  const fc = forecast(points, span, horizon);
  if (!fc) return null;
  return { method: "holt", choice, points: fc.points.map((p, i) => ({ ...p, sd: Math.sqrt(nearest(times(fc.meanSquare, holtSpreadFactor(i + 1)))) })), trendPerPeriod: fc.trendPerPeriod, sd: fc.sd };
}
