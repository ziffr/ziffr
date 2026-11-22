// The forecast a widget and a Takeaway use (GLOSSARY: Analysis; spec 0041, "Choosing is a rule written down, not a search"):
// Holt's linear trend, or Holt-Winters where the series holds two seasons and, on the last third of it, the typical miss of
// Holt-Winters is smaller (track-record.ts). Pure.
//
// What is returned is what forecast.ts returns for Holt (points with a ~95 % band, the trend per period, the spread), now with
// each point's own spread too, so a range at another level (80 %) and the chance of reaching a Target can be worked out from it,
// and the choice with the track record that made it.
import { forecast, HORIZON } from "../forecast";
import type { Span } from "../periods";
import type { Point } from "../types";
import { holtWinters, type SeasonalPoint } from "./holt-winters";
import { chooseMethod, type Candidate, type Choice } from "./track-record";

/** The forecast of the Method chosen, with each point's spread, the trend per period, the one-step spread, and how the Method was chosen. */
export type Projection = { method: Candidate; choice: Choice; points: SeasonalPoint[]; trendPerPeriod: number; sd: number };

/** The forecast `horizon` periods ahead (the default of the span) by the Method the rule chooses, or null with fewer than four
 * values. `seasonal: false` rules the seasonal Method out (a check found that the pattern does not repeat). `season` is the length of a season in periods. */
export function bestForecast(points: Point[], span: Span, season: number, opts: { horizon?: number; seasonal?: boolean } = {}): Projection | null {
  const horizon = opts.horizon ?? HORIZON[span];
  const choice: Choice = opts.seasonal === false ? { method: "holt", why: "holt-only", holt: null, seasonal: null } : chooseMethod(points, span, season);
  // The seasonal Method was chosen only after a run that worked, on the same points.
  const run = choice.method === "holtWinters" ? holtWinters(points, span, season, horizon) : null;
  if (run?.ok) return { method: "holtWinters", choice, points: run.points, trendPerPeriod: run.trendPerPeriod, sd: run.sd };
  const fc = forecast(points, span, horizon);
  if (!fc) return null;
  return { method: "holt", choice, points: fc.points.map((p, i) => ({ ...p, sd: fc.sd * Math.sqrt(i + 1) })), trendPerPeriod: fc.trendPerPeriod, sd: fc.sd };
}
