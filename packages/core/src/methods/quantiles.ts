// Quantiles and the usual range (GLOSSARY: Analysis, Takeaway; spec 0041, Methods `quantile` and `usualRange`): what is
// normal for a Metric by its own history. Pure.
//
// `quantile` is the linear-interpolation quantile (Hyndman and Fan's type 7, NumPy's default): of n sorted values the p-quantile
// sits at position h = (n − 1)·p, and is the value there, or between its two neighbours in proportion. Worked out exactly on
// the values' text: only the final step is a double, the one nearest to the exact result. The arithmetic is the Extension
// ziffr/quantile (extensions/ziffr/quantile), read through the registry; this module reads the series, takes the case the
// Extension refuses (values that are all the same), and says what the quantiles mean for a Metric.
//
// `usualRange` is the middle 80 % of the Metric's own history: the 10th to the 90th percentile, with the median and the
// quartiles beside it (the same choice as the 80 % range of every other Method: "likely between"). With a season it takes
// only the values at the same place in the season as the period asked about.
import { readSeries } from "../basis";
import { builtInMethod } from "../extensions";
import { formatNumber, formatValue, type ValueUnit } from "../format";
import { periodsBetween, type Span } from "../periods";
import { usualChart } from "../result-charts";
import { checkSuitability, levelShift } from "../suitability";
import { emptyTakeaway, refusalTakeaway, sayIn, verdictLines, onLatest, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";
import type { Point } from "../types";

// The p-quantile (0 to 1) of values already read: at least one, all of them numbers. The Extension has no answer for values
// that are all the same (one value included: a flat series has no spread to place a share in), and every quantile of those is
// that value, so it is given here; + 0 makes a minus zero the 0 that its text, "0", says.
function quantileOf(values: number[], p: number): number {
  if (values.every((v) => v === values[0])) return values[0] + 0;
  // With two different numbers and a p from 0 to 1 the Extension does not refuse; the type has to allow for it.
  return builtInMethod("ziffr/quantile")(values, p) as number;
}

/** The p-quantile (0 to 1) of a series' values, type 7: the value at position (n − 1)·p, interpolating between neighbours.
 * Null for no values, or a p that is not a number from 0 to 1. A value that is not a number is no value; a period twice
 * counts once. */
export function quantile(points: Point[], p: number): number | null {
  if (!(p >= 0 && p <= 1)) return null;
  const values = readSeries(points).map((x) => x.value);
  return values.length === 0 ? null : quantileOf(values, p);
}

/** What is normal for a Metric: the median, the quartiles and the usual range (10th to 90th percentile) of the values it
 * is worked out from, with how many there are. */
export type UsualRange = { n: number; median: number; q1: number; q3: number; low: number; high: number };

/** Where a value stands against a usual range: below it, within it (the ends included) or above it. */
export type Standing = "below" | "within" | "above";

/** The usual range of a series' history: null for fewer than `least` values. With `season` (a whole length in periods, 12 for
 * months) and `at` (a period), only the values at the same place in the season as `at` are used; give the history without
 * the value you ask about, so that it does not judge itself. */
export function usualRange(points: Point[], span: Span, opts: { least?: number; season?: number; at?: string } = {}): UsualRange | null {
  const rows = readSeries(points);
  const [season, at] = [opts.season, opts.at];
  // A season is a whole number of periods of 1 or more; anything else has no place in a season to speak of.
  if (season !== undefined && !(Number.isInteger(season) && season >= 1)) return null;
  const used = season !== undefined && at !== undefined ? rows.filter((p) => periodsBetween(at, p.period, span) % season === 0) : rows;
  if (used.length === 0 || used.length < (opts.least ?? 1)) return null;
  const values = used.map((p) => p.value);
  const at_ = (p: number) => quantileOf(values, p);
  return { n: used.length, median: at_(0.5), q1: at_(0.25), q3: at_(0.75), low: at_(0.1), high: at_(0.9) };
}

/** Where a value stands against a usual range. */
export function standing(range: Pick<UsualRange, "low" | "high">, value: number): Standing {
  return value < range.low ? "below" : value > range.high ? "above" : "within";
}

// Used by the Takeaway: the values from a period on.
const from = (points: Point[], period: string) => readSeries(points).filter((p) => p.period >= period);

/** The Takeaway of a usual range: the suitability checks first (enough periods, variation, gaps; a level shift in the history
 * leaves only the values since it when at least the minimum remain, and says so), then "usually between …" in the Metric's
 * unit, the median and the quartiles under Show the numbers, and, where a `value` is asked about, whether it is above, below
 * or within. */
export function usualRangeTakeaway(name: string, points: Point[], span: Span, unit: ValueUnit, ctx: TakeawayContext, opts: { value?: number; season?: number; at?: string } = {}): Takeaway {
  // Stryker disable next-line StringLiteral: the Method's name in the refusal that only a spent work allowance writes; the wording of that refusal is held by the test of withinBudget.
  return onLatest("numbers-method-usual", ctx, span, [points], ([latest]) => usualRangeWithin(name, latest, span, unit, ctx, opts));
}

// The Takeaway itself, on the latest periods the series has.
function usualRangeWithin(name: string, points: Point[], span: Span, unit: ValueUnit, ctx: TakeawayContext, opts: { value?: number; season?: number; at?: string }): Takeaway {
  const method = sayIn("numbers-method-usual", {}, ctx);
  const verdict = checkSuitability("usualRange", { series: [{ name, points }], span, canSwitchTo: ["data-after"] });
  const lines = verdictLines(verdict, ctx, 0);
  if (lines.refusals.length > 0) return refusalTakeaway(method, lines.refusals);
  const shifted = verdict.switches.length > 0 ? levelShift(points, span) : null;
  const history = shifted ? from(points, shifted.period) : points;
  const found = usualRange(history, span, { season: opts.season, at: opts.at });
  // Without a place in the season, or with none of its values, there is no range to give.
  if (!found) return refusalTakeaway(method, [sayIn("refuse-season", { name }, ctx)]);
  const write = (v: number) => formatValue(unit, v, ctx.style);
  const base = { name, low: { value: found.low, unit }, high: { value: found.high, unit }, n: found.n, span };
  const seasonal = opts.season !== undefined && opts.at !== undefined;
  const where = opts.value === undefined ? null : standing(found, opts.value);
  const sentence = [sayIn(seasonal ? "usual-range-season" : "usual-range", base, ctx), where && sayIn(`usual-${where}`, { value: { value: opts.value!, unit } }, ctx)].filter(Boolean).join(" ");
  return {
    ...emptyTakeaway(method),
    kind: "answer",
    sentence,
    basis: sayIn(seasonal ? "basis-season" : "basis-history", { n: found.n, span }, ctx),
    cautions: lines.cautions,
    notes: lines.notes,
    figures: [
      { label: sayIn("numbers-low", {}, ctx), value: found.low, text: write(found.low) },
      { label: sayIn("numbers-high", {}, ctx), value: found.high, text: write(found.high) },
      ...(opts.value === undefined ? [] : [{ label: sayIn("numbers-asked", {}, ctx), value: opts.value, text: write(opts.value) }]),
    ],
    numbers: [
      { label: sayIn("numbers-method", {}, ctx), text: method },
      { label: sayIn("numbers-median", {}, ctx), text: write(found.median) },
      { label: sayIn("numbers-quartiles", {}, ctx), text: `${write(found.q1)} – ${write(found.q3)}` },
      { label: sayIn("numbers-usual", {}, ctx), text: `${write(found.low)} – ${write(found.high)}` },
      { label: sayIn("numbers-values", {}, ctx), text: formatNumber(found.n, 0, ctx.style) },
    ],
    // The values with the range and the median the sentence gives, across the periods they were taken from. A range from the same place in the season is not a flat band, so it has no picture.
    ...(ctx.charts && !seasonal ? { chart: [usualChart(name, unit, span, readSeries(points), readSeries(history)[0].period, found, opts.value)] } : {}),
  };
}
