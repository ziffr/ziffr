// The track record (GLOSSARY: Analysis; spec 0041, Methods "Track record", `backtest`): how a forecasting Method would have
// done on the periods that are already known. Each of the last periods is forecast from the values before it only (a
// rolling origin, one period ahead), and set against what came: was it inside the 80 % range, and by how much did it miss.
// Pure.
//
// One pass, not a rerun for each origin. Both Methods look at a value only after they have predicted it, and start from
// the same first values whatever comes after, so the prediction made before the value at `t` is the prediction a forecast
// made from the values before `t` alone would have given, with the same level, trend, pattern and the same misses so far.
// The test holds this to the literal definition: it forecasts each prefix again, from scratch, in the reference.
//
// The typical miss is the mean of the sizes of the misses, worked out exactly on the values' text (a sum of sizes and one
// division); there is no square root in it. Whether a value is "inside" is decided in doubles against 1.2816 spreads, as
// the shown range is (normal-curve.ts). Only one-step misses where the period before has a value are counted.
import { readSeries } from "../basis";
import { fractionOf, lowestTerms, minus, nearest, over, plus, type Fraction } from "../exact";
import { holtFit } from "../forecast";
import { periodsBetween, type Span } from "../periods";
import type { Point } from "../types";
import { fitHoltWinters } from "./holt-winters";
import { Z80 } from "./normal-curve";

/** The Methods a track record and the choice between them know: Holt's linear trend, and the seasonal Holt-Winters. */
export type Candidate = "holt" | "holtWinters";

/** One period forecast from the values before it: the exact miss (what came less what was predicted), the spread, and whether the value was inside the 80 % range. */
export type Outcome = { period: string; miss: Fraction; sd: number; inBand: boolean };

/** How a Method did on the last periods: how many were tested, how many fell inside the 80 % range, and the typical miss. */
export type TrackRecord = { method: Candidate; outcomes: Outcome[]; tested: number; inBand: number; typicalMiss: number; missTotal: Fraction };

/** At least this many periods must be tested for two Methods to be compared; fewer say nothing. */
export const TRACK_MIN = 3;

type Prediction = { period: string; predicted: Fraction; squares: Fraction; errors: number };
const ZERO: Fraction = { num: BigInt(0), den: BigInt(1) };
// Stryker disable next-line EqualityOperator: the size of 0 is 0 whichever side of the sign it is read from.
const size = (a: Fraction): Fraction => (a.num < BigInt(0) ? { num: -a.num, den: a.den } : a);

type Predictor = (rows: Point[], span: Span, season: number) => Map<number, Prediction>;

// A value's prediction counts only where the period before it has a value. Every prediction is for the fifth value or later,
// so the row before it exists.
const consecutive = (rows: Point[], span: Span, out: Map<number, Prediction>, i: number, p: Prediction) => {
  if (periodsBetween(rows[i - 1].period, rows[i].period, span) === 1) out.set(i, p);
};

// Holt needs four values before one is predicted (FORECAST_MIN_POINTS).
const holtPredictions: Predictor = (rows, span) => {
  const out = new Map<number, Prediction>();
  // Stryker disable next-line EqualityOperator: four values predict nothing from the fifth on, so `<` and `<=` give the same.
  if (rows.length <= 4) return out;
  for (const s of holtFit(rows.map((r) => fractionOf(r.value))).steps) if (s.index >= 4) consecutive(rows, span, out, s.index, { period: rows[s.index].period, predicted: s.predicted, squares: s.squares, errors: s.errors });
  return out;
};

// The seasonal method predicts from the third season on only: its first two seasons are what it starts from.
const seasonalPredictions: Predictor = (rows, span, season) => {
  const out = new Map<number, Prediction>();
  const run = fitHoltWinters(rows, span, season);
  if (!run.ok) return out;
  const at = new Map(rows.map((r, i) => [r.period, i]));
  for (const s of run.fit.steps) {
    const i = at.get(s.period);
    if (i !== undefined && periodsBetween(run.fit.first, s.period, span) >= 2 * season) consecutive(rows, span, out, i, s);
  }
  return out;
};

const PREDICTORS: Record<Candidate, Predictor> = { holt: holtPredictions, holtWinters: seasonalPredictions };

// The outcomes of a method over a series, by row, for the rows from `from` on.
function outcomes(rows: Point[], span: Span, season: number, method: Candidate, from: number): (Outcome & { row: number })[] {
  const out: (Outcome & { row: number })[] = [];
  // The predictions were made in order, and a Map keeps the order it was given.
  for (const [row, p] of PREDICTORS[method](rows, span, season)) {
    if (row < from) continue;
    const miss = lowestTerms(minus(fractionOf(rows[row].value), p.predicted));
    const sd = Math.sqrt(nearest(over(p.squares, { num: BigInt(p.errors), den: BigInt(1) })));
    out.push({ row, period: p.period, miss, sd, inBand: Math.abs(nearest(miss)) <= Z80 * sd });
  }
  return out;
}

const recordOf = (method: Candidate, list: Outcome[]): TrackRecord => {
  const missTotal = list.reduce((s, o) => lowestTerms(plus(s, size(o.miss))), ZERO);
  return { method, outcomes: list, tested: list.length, inBand: list.filter((o) => o.inBand).length, typicalMiss: nearest(over(missTotal, { num: BigInt(list.length), den: BigInt(1) })), missTotal };
};

/** How `method` would have done on the last `last` values of the series (each predicted from the values before it only, one
 * period ahead), or null where none could be tested: too few values before them, or a gap before each. `season` is the length of a season in periods. */
export function backtest(points: Point[], span: Span, season: number, method: Candidate, last: number): TrackRecord | null {
  const rows = readSeries(points);
  const list = outcomes(rows, span, season, method, rows.length - last);
  return list.length === 0 ? null : recordOf(method, list);
}

/** Which of the two Methods a series is forecast with, and why: the seasonal one only where the series holds two seasons and,
 * on the last third of the series, its typical miss is smaller than Holt's (the same periods for both, one period ahead). */
export type Choice = {
  method: Candidate;
  /** "holt-only": the seasonal Method cannot run; "too-few": fewer than TRACK_MIN periods could be compared on both; "better" or "not-better": the typical miss on the last third. */
  why: "holt-only" | "too-few" | "better" | "not-better";
  /** Each Method's record on the periods compared; null where it could not be tested. */
  holt: TrackRecord | null;
  seasonal: TrackRecord | null;
};

/** The rule written down (spec 0041, Decision 2): the Method with the smaller typical miss on the last third of the series,
 * Holt on a tie. Not a search: two Methods, one comparison, the same periods for both. */
export function chooseMethod(points: Point[], span: Span, season: number): Choice {
  const rows = readSeries(points);
  const from = rows.length - Math.floor(rows.length / 3);
  if (!fitHoltWinters(rows, span, season).ok) return { method: "holt", why: "holt-only", holt: null, seasonal: null };
  const [holt, seasonal] = [outcomes(rows, span, season, "holt", from), outcomes(rows, span, season, "holtWinters", from)];
  // The periods both could be tested on.
  // Whatever the seasonal Method could test (its first two seasons are whole, so the row is at least the fifth) Holt could too.
  const heldBySeasonal = new Set(seasonal.map((o) => o.period));
  const h = holt.filter((o) => heldBySeasonal.has(o.period));
  if (h.length < TRACK_MIN) return { method: "holt", why: "too-few", holt: null, seasonal: null };
  const [holtRecord, seasonalRecord] = [recordOf("holt", h), recordOf("holtWinters", seasonal)];
  const better = seasonalRecord.missTotal.num * holtRecord.missTotal.den < holtRecord.missTotal.num * seasonalRecord.missTotal.den;
  return { method: better ? "holtWinters" : "holt", why: better ? "better" : "not-better", holt: holtRecord, seasonal: seasonalRecord };
}
