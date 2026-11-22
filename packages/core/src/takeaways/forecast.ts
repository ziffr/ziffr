// The Takeaway of a forecast (GLOSSARY: Takeaway, Analysis; spec 0041, the Recipe "Will we reach the Target?"): where a Metric is
// expected to be, in its own unit, with the range it is likely between; with a Target, how likely it is to reach it, in tenths;
// which Method worked it out (a plain trend, or the trend with the yearly pattern, by the rule of methods/forecast-choice.ts) and
// how that Method did on the periods already known. After the suitability checks, in words, never a quiet number. Pure.
//
// What a forecast Takeaway does not say: a strength word (nothing here is a link between Metrics), and any promise: it says what it
// assumes. The chance is the share of a normal curve around the forecast that lies within the Target's limits, with the spread the
// Method showed on the past; the track record says how well such ranges held. "Likely between" is the 80 % range (1.2816 spreads).
import { readSeries } from "../basis";
import { formatNumber, formatValue } from "../format";
import { HORIZON } from "../forecast";
import { bestForecast } from "../methods/forecast-choice";
import { SMOOTHING } from "../methods/holt-winters";
import { Z80 } from "../methods/normal-curve";
import { reachChance, type Limits } from "../methods/reach-chance";
import { backtest, type Candidate } from "../methods/track-record";
import { periodsBetween, type Span } from "../periods";
import { checkSuitability, minimumPeriods, SEASON_LENGTH, type Finding, type Rerun, type SuitabilityInputs } from "../suitability";
import type { Metric, Point } from "../types";
import { refusalTakeaway, type Takeaway, type TakeawayContext } from "./takeaway";
import { say, type CaseKey, type Slots } from "./wording";

/** How many of the latest periods the track record looks at. */
export const TRACK_PERIODS = 12;
/** A chance below `under` is said "under 1 in 20" and one from `over` "over 19 in 20"; between, in tenths, rounded. */
export const CHANCE = { under: 0.05, over: 0.95 } as const;

/** What a Metric's Target asks for, from its Polarity and Target Range: higher is better, at least the lower limit; lower is better, at most the upper
 * limit; closer to target, within both. A limit that is not set is null; with none set there is no Target. */
export function limitsOf(metric: Pick<Metric, "polarity" | "target_min" | "target_max">): Limits {
  if (metric.polarity === "higher") return { min: metric.target_min, max: null };
  if (metric.polarity === "lower") return { min: null, max: metric.target_max };
  return { min: metric.target_min, max: metric.target_max };
}

/** How a chance is said: "under 1 in 20" below 5 %, "over 19 in 20" from 95 %, else "about k in 10" with k the chance in tenths, rounded. */
export function chanceCase(p: number): { key: "chance-under" | "chance-about" | "chance-over"; k: number } {
  const k = Math.round(p * 10);
  return { key: p < CHANCE.under ? "chance-under" : p >= CHANCE.over ? "chance-over" : "chance-about", k };
}

/** How far ahead a forecast is asked: a whole season, and at least the default of the span. */
export const maxAhead = (span: Span): number => Math.max(HORIZON[span], SEASON_LENGTH[span]);

/** What is asked of a forecast Takeaway: the Target's limits (the Recipe "Will we reach the Target?") and the period to look at (the end of the default horizon where not given). */
export type ForecastAsk = { limits?: Limits; by?: string };

/** The Takeaway of a Metric's forecast: the expected value and range, or with `ask.limits` the chance of reaching the Target, the Method used and why, its track
 * record, and the numbers. A refusal says what is missing. The points are only read. */
export function forecastTakeaway(metric: Metric, points: Point[], ctx: TakeawayContext, ask: ForecastAsk = {}): Takeaway {
  const span = metric.period;
  const season = SEASON_LENGTH[span];
  const text = (key: CaseKey, slots: Slots = {}) => say(key, { span, ...slots }, { style: ctx.style, language: ctx.language, yearStart: ctx.yearStart, result: (v) => formatValue(metric, v, ctx.style) });
  const value = (v: number) => ({ value: v, unit: metric });
  const refuse = (...lines: string[]) => refusalTakeaway(text("numbers-method-holt"), lines);
  const rows = readSeries(points);
  const series = [{ name: metric.name, points: rows }];
  const check = (method: "forecast" | "seasonal", more: Partial<SuitabilityInputs> = {}) => checkSuitability(method, { series, span, seasonLength: season, ...more });
  const lines = (found: Finding[]) => found.map((f) => text(f.case, f.slots));

  if (ask.limits && ask.limits.min === null && ask.limits.max === null) return refuse(text("refuse-no-target", { name: metric.name }));
  const base = check("forecast");
  if (base.refusals.length > 0) return refuse(...lines(base.refusals));
  const last = rows[rows.length - 1].period;
  const ahead = ask.by ? periodsBetween(last, ask.by, span) : HORIZON[span];
  if (ahead < 1) return refuse(text("refuse-by-past", { from: last }));
  if (ahead > maxAhead(span)) return refuse(text("refuse-too-far", { name: metric.name, ahead, most: maxAhead(span) }));

  // The yearly (weekly) pattern is a candidate with two full seasons; a pattern that does not repeat rules it out.
  const candidate = season >= 2 && rows.length >= minimumPeriods("seasonal", { seasonLength: season });
  const pattern = text(span === "day" ? "pattern-weekly" : "pattern-yearly");
  const ruledOut = candidate ? check("seasonal", { canSwitchTo: ["holt"] }).switches : [];
  const best = bestForecast(rows, span, season, { horizon: ahead, seasonal: ruledOut.length === 0 })!;
  const method: Candidate = best.method;
  const target = best.points[ahead - 1];
  if (!Number.isFinite(target.value) || !Number.isFinite(target.sd)) return refuse(text("refuse-huge", { name: metric.name }));

  // The far-off check asks what the forecast reads without some periods: the same rule, on what is left.
  const rerun = (left: ReadonlySet<string>): Rerun => {
    const p = (left.size === 0 ? best : bestForecast(rows.filter((r) => !left.has(r.period)), span, season, { horizon: ahead, seasonal: ruledOut.length === 0 }))?.points[ahead - 1];
    return p ? { value: p.value, range: p.hi - p.lo } : null;
  };
  const verdict = method === "holtWinters" ? check("seasonal", { rerun, canSwitchTo: ["holt"] }) : check("forecast", { rerun });
  const cautions = lines(verdict.cautions);
  if (target.sd === 0) cautions.push(text("caution-no-misses"));
  const notes = lines(ruledOut);
  if (method === "holt" && candidate && ruledOut.length === 0) {
    // Holt is the choice with the seasonal Method a candidate for one reason of three: it could not run (a gap in the first two seasons),
    // there were too few periods to compare, or it did not miss less.
    const why = best.choice.why === "holt-only" ? "fc-note-start-gap" : best.choice.why === "too-few" ? "fc-note-too-few" : "fc-note-holt-better";
    notes.push(text(why, { pattern }));
  }

  const [lo, hi] = [target.value - Z80 * target.sd, target.value + Z80 * target.sd];
  const written = (v: number) => formatValue(metric, v, ctx.style);
  const figure = (label: string, v: number) => ({ label, value: v, text: written(v) });
  const [expected, range] = [text("numbers-expected"), text("numbers-range")];
  let sentence: string;
  let figures: Takeaway["figures"];
  let chance: number | null = null;
  if (ask.limits) {
    const { min, max } = ask.limits;
    // The limits are finite numbers and the forecast and its spread were checked to be, so there is a chance.
    chance = reachChance({ value: target.value, sd: target.sd }, ask.limits)!;
    const { key: wording, k: tenths } = chanceCase(chance);
    const inTenths = wording === "chance-about";
    const said = text(wording, { k: tenths });
    const slots = { name: metric.name, from: target.period, chance: said };
    if (min !== null && max !== null) sentence = text("fc-reach-between", { ...slots, min: value(min), max: value(max) });
    else if (min !== null) sentence = text("fc-reach-min", { ...slots, min: value(min) });
    else sentence = text("fc-reach-max", { ...slots, max: value(max!) });
    figures = [
      ...(min === null ? [] : [figure(text("numbers-target-min"), min)]),
      ...(max === null ? [] : [figure(text("numbers-target-max"), max)]),
      ...(inTenths ? [{ label: text("numbers-in-ten"), value: tenths, text: formatNumber(tenths, 0, ctx.style) }] : []),
    ];
  } else {
    sentence = text("fc-expected", { name: metric.name, value: value(target.value), lo: value(lo), hi: value(hi), from: target.period });
    figures = [figure(expected, target.value), figure(`${range} (low)`, lo), figure(`${range} (high)`, hi)];
  }

  const record = backtest(rows, span, season, method, TRACK_PERIODS);
  const third = best.choice.holt && best.choice.seasonal ? best.choice : null;
  const numbers = [
    { label: text("numbers-method"), text: text(method === "holt" ? "numbers-method-holt" : "numbers-method-holt-winters") },
    { label: text("numbers-smoothing"), text: [SMOOTHING.level, SMOOTHING.trend, SMOOTHING.season].slice(0, method === "holt" ? 2 : 3).map((f) => formatNumber(Number(f.num) / Number(f.den), 1, ctx.style)).join(", ") },
    { label: expected, text: written(target.value) },
    { label: range, text: `${written(lo)} – ${written(hi)}` },
    ...(chance === null ? [] : [{ label: text("numbers-chance"), text: `${formatNumber(chance * 100, 0, ctx.style)} %` }]),
    ...(record ? [{ label: text("numbers-tested"), text: formatNumber(record.tested, 0, ctx.style) }, { label: text("numbers-inside"), text: formatNumber(record.inBand, 0, ctx.style) }, { label: text("numbers-miss"), text: written(record.typicalMiss) }] : []),
    ...(third ? [{ label: text("numbers-third-holt"), text: written(third.holt!.typicalMiss) }, { label: text("numbers-third-holt-winters"), text: written(third.seasonal!.typicalMiss) }, { label: text("numbers-third-n"), text: formatNumber(third.holt!.tested, 0, ctx.style) }] : []),
  ];
  return {
    ...refusalTakeaway(text(method === "holt" ? "numbers-method-holt" : "numbers-method-holt-winters"), []),
    kind: "answer",
    refusal: null,
    sentence,
    range: { lo, hi, text: `${written(lo)} – ${written(hi)}` },
    basis: text("fc-basis", { method: text(method === "holt" ? "fc-method-holt" : span === "day" ? "fc-method-holt-winters-weekly" : "fc-method-holt-winters"), n: rows.length }),
    assumptions: [text("fc-assumes")],
    cautions,
    notes,
    track: record ? text("fc-track", { tested: record.tested, inside: record.inBand }) : text("fc-track-none"),
    footer: text("footer"),
    figures,
    numbers,
  };
}
