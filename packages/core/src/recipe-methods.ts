// The newer Methods as functions of an Analysis Recipe in format /2 (GLOSSARY: Analysis Recipe, Method; spec 0041): what
// a step gives besides a series or one value, a table (rows with a label and a number) or a model (what a fit holds), and
// the tables the Methods give as rows. Each is the Method's own function, with its own references and tests; this module
// only reads what the Method gives as rows with words from the Takeaway layer's wording, and refuses nothing silently:
// a Method that gives no result gives no rows, a null or a model that says why. Pure.
import type { Importance } from "./methods/fit";
import type { FitInput, Fit, Refused } from "./methods/fit";
import type { Lagged } from "./methods/lagged-correlation";
import type { UsualRange } from "./methods/quantiles";
import { quantile } from "./methods/quantiles";
import type { Span } from "./periods";
import type { Result } from "./recipe-functions";
import { sayIn, type TakeawayContext } from "./takeaways/takeaway";
import type { ValueUnit } from "./format";
import type { Point } from "./types";

/** At most this many of the latest values of each Slot go into a recipe: a bound on the work any recipe can ask for. */
export const RECIPE_POINTS = 120;

/** One row of a table: its label and a number (none where the Method has none, as a lag at which a series does not change). */
export type TableRow = { label: string; value: number | null };

/** What a step of a /2 recipe gives: a series, one value, a table, or a model (the fit and what it was made from). */
export type Result2 = Result | { kind: "table"; rows: TableRow[] } | { kind: "model"; input: FitInput; fit: Fit | Refused };

/** A Slot's Metric as a recipe gets it: its name and unit for the words of a Takeaway, its period, and its series. */
export type RecipeInput = { name: string; unit: ValueUnit; period: Span; points: Point[] };

/** The p-th percentile (1 to 99) of a series as one value, by `quantile` (type 7); none for no values. */
export function percentile(points: Point[], percent: number): Result {
  return { kind: "value", value: quantile(points, percent / 100) };
}

/** The correlation at each delay from none to the longest tried, as rows "Same month", "1 month later", …, each with its r;
 * a delay at which a series does not change has no number. */
export function lagRows(found: Lagged, span: Span, ctx: TakeawayContext): TableRow[] {
  return found.lags.map((l) => ({ label: l.lag === 0 ? sayIn("table-lag-0", { span }, ctx) : sayIn("table-lag", { lag: l.lag, span }, ctx), value: Number.isFinite(l.r) ? l.r : null }));
}

/** The usual range as rows: the usual low (10th percentile), the quartiles around the median and the usual high (90th); none where there is no range. */
export function usualRows(u: UsualRange | null, ctx: TakeawayContext): TableRow[] {
  if (!u) return [];
  return [
    { label: sayIn("table-usual-low", {}, ctx), value: u.low },
    { label: sayIn("table-usual-q1", {}, ctx), value: u.q1 },
    { label: sayIn("table-usual-median", {}, ctx), value: u.median },
    { label: sayIn("table-usual-q3", {}, ctx), value: u.q3 },
    { label: sayIn("table-usual-high", {}, ctx), value: u.high },
  ];
}

/** A fit's importance as rows: each driver's share of what the fit explains (0 to 1, adding to 1); none where the fit was refused. */
export function importanceRows(i: Importance): TableRow[] {
  return i.ok ? i.drivers.map((d) => ({ label: d.name, value: d.share })) : [];
}
