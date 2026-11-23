// The Takeaway of a forecast (GLOSSARY: Takeaway, Analysis; spec 0041, the Recipe "Will we reach the Target?"): where a Metric is
// expected to be, in its own unit, with the range it is likely between; with a Target, how likely it is to reach it, in tenths;
// which Method worked it out (a plain trend, or the trend with the yearly pattern, by the rule of methods/forecast-choice.ts) and
// how that Method did on the periods already known. After the suitability checks, in words, never a quiet number. Pure.
//
// What a forecast Takeaway does not say: a strength word (nothing here is a link between Metrics), and any promise: it says what it
// assumes. The chance is the share of a normal curve around the forecast that lies within the Target's ends, with the spread the
// Method showed on the past; the track record says how well such ranges held. The percentage shown is never 0 or 100: a forecast is not certain. "Likely between" is the 80 % range (1.2816 spreads).
import { readSeries } from "../basis";
import { formatNumber, formatValue, type ValueUnit } from "../format";
import { HORIZON } from "../forecast";
import { bestForecast, LATEST_PERIODS } from "../methods/forecast-choice";
import { SMOOTHING, type SeasonalPoint } from "../methods/holt-winters";
import { Z80 } from "../methods/normal-curve";
import { reachChance, type TargetEnds } from "../methods/reach-chance";
import { backtest, type Candidate } from "../methods/track-record";
import { periodsBetween, type Span } from "../periods";
import { checkSuitability, minimumPeriods, SEASON_LENGTH, type Finding, type Rerun, type SuitabilityInputs } from "../suitability";
import type { Metric, Point } from "../types";
import { withWork } from "../work-bound";
import { answerTakeaway, refusalTakeaway, type Takeaway, type TakeawayContext } from "./takeaway";
import { say, type CaseKey, type Slots } from "./wording";

/** How many of the latest periods the track record looks at. */
export const TRACK_PERIODS = 12;
/** A chance (in %) below `under` is said "under 1 in 20" and one from `over` "at least 19 in 20"; between, in tenths, rounded. */
export const CHANCE = { under: 5, over: 95 } as const;

/** What a Metric's Target asks for, from its Polarity and Target Range: higher is better, at least the lower end; lower is better, at most the upper
 * end; closer to target, within both. A end that is not set is null; with none set there is no Target. */
export function endsOf(metric: Pick<Metric, "polarity" | "target_min" | "target_max">): TargetEnds {
  if (metric.polarity === "higher") return { min: metric.target_min, max: null };
  if (metric.polarity === "lower") return { min: null, max: metric.target_max };
  return { min: metric.target_min, max: metric.target_max };
}

/** How a chance is said and shown: the percentage is the chance rounded, never below 1 or above 99 (a forecast is not certain); "under 1 in 20" is below
 * 5 %, "at least 19 in 20" from 95 %, else "about k in 10" with k that percentage in tenths, rounded. The words and the percentage never disagree. */
export function chanceCase(p: number): { key: "chance-under" | "chance-about" | "chance-over"; k: number; percent: number } {
  const percent = Math.min(99, Math.max(1, Math.round(p * 100)));
  const key = percent < CHANCE.under ? "chance-under" : percent >= CHANCE.over ? "chance-over" : "chance-about";
  return { key, k: Math.round(percent / 10), percent };
}

/** How far ahead a forecast is asked: a whole season, and at least the default of the span. */
export const maxAhead = (span: Span): number => Math.max(HORIZON[span], SEASON_LENGTH[span]);

/** What is asked of a forecast Takeaway: the Target's ends (the Recipe "Will we reach the Target?") and the period to look at (the end of the default horizon where not given). */
export type ForecastAsk = { ends?: TargetEnds; by?: string; /** The work allowance to run under instead of the usual (work-bound.ts), for tests of what happens when it is spent. */ allowance?: number };

/** What a forecast reads of a Metric: its name, its period and its unit. */
export type ForecastMetric = Pick<Metric, "name" | "period"> & ValueUnit;

// The wording of a Metric's forecast: each case in the Metric's period, numbers in its unit and the Workspace's Number Style.
const wordsFor = (metric: ForecastMetric, ctx: TakeawayContext) => (key: CaseKey, slots: Slots = {}) => say(key, { span: metric.period, ...slots }, { style: ctx.style, language: ctx.language, yearStart: ctx.yearStart, result: (v) => formatValue(metric, v, ctx.style) });

/** What a forecast works out before any words go round it: the latest periods, the Method chosen, the point for the period asked about
 * (`ahead` periods after the last value) and the plain lines that go with the answer. */
type Fit = { rows: Point[]; season: number; ahead: number; best: NonNullable<ReturnType<typeof bestForecast>>; method: Candidate; target: SeasonalPoint; cautions: string[]; notes: string[] };

// A forecast, or the lines that say why there is none. The one place the checks, the Method's choice and the period asked about are decided,
// for the Takeaway and for the Heads-up about a Target (reachOf) alike.
function fitForecast(metric: ForecastMetric, points: Point[], ctx: TakeawayContext, ask: ForecastAsk): { refuse: string[] } | Fit {
  // Under the work allowance of work-bound.ts: its series are cut to the latest 120 periods, so no ordinary values come near it.
  return withWork(() => fitForecastWithin(metric, points, ctx, ask), ask.allowance) ?? { refuse: [wordsFor(metric, ctx)("refuse-exact-work")] };
}

function fitForecastWithin(metric: ForecastMetric, points: Point[], ctx: TakeawayContext, ask: ForecastAsk): { refuse: string[] } | Fit {
  const span = metric.period;
  const season = SEASON_LENGTH[span];
  const text = wordsFor(metric, ctx);
  const refuse = (...lines: string[]) => ({ refuse: lines });
  const rows = readSeries(points).slice(-LATEST_PERIODS);
  const series = [{ name: metric.name, points: rows }];
  const check = (method: "forecast" | "seasonal", more: Partial<SuitabilityInputs> = {}) => checkSuitability(method, { series, span, seasonLength: season, ...more });
  const lines = (found: Finding[]) => found.map((f) => text(f.case, f.slots));

  if (ask.ends && ask.ends.min === null && ask.ends.max === null) return refuse(text("refuse-no-target", { name: metric.name }));
  const base = check("forecast");
  if (base.refusals.length > 0) return refuse(...lines(base.refusals));
  const last = rows[rows.length - 1].period;
  const ahead = ask.by ? periodsBetween(last, ask.by, span) : HORIZON[span];
  if (ahead < 1) return refuse(text("refuse-by-past", { from: last }));
  if (ahead > maxAhead(span)) return refuse(text("refuse-too-far", { name: metric.name, ahead, most: maxAhead(span) }));

  // The yearly (weekly) pattern is a candidate with two full seasons; a pattern that does not repeat rules it out.
  const candidate = season > 1 && rows.length >= minimumPeriods("seasonal", { seasonLength: season });
  const pattern = text(span === "day" ? "pattern-weekly" : "pattern-yearly");
  const ruledOut = candidate ? check("seasonal", { canSwitchTo: ["holt"] }).switches : [];
  const options = { horizon: ahead, seasonal: ruledOut.length === 0 };
  const best = bestForecast(rows, span, season, options)!;
  const method: Candidate = best.method;
  const target = best.points[ahead - 1];
  if (!Number.isFinite(target.value) || !Number.isFinite(target.sd)) return refuse(text("refuse-huge", { name: metric.name }));

  // The far-off check asks what the forecast reads without some periods: the same rule, on what is left.
  const rerun = (left: ReadonlySet<string>): Rerun => {
    const p = bestForecast(rows.filter((r) => !left.has(r.period)), span, season, options)?.points[ahead - 1];
    return p ? { value: p.value, range: p.hi - p.lo } : null;
  };
  const verdict = method === "holtWinters" ? check("seasonal", { rerun }) : check("forecast", { rerun });
  const cautions = lines(verdict.cautions);
  if (target.sd === 0) cautions.push(text("caution-no-misses"));
  const notes = lines(ruledOut);
  if (method === "holt" && candidate && ruledOut.length === 0) {
    // Holt is the choice with the seasonal Method a candidate for one reason of three: it could not run (a gap in the first two seasons),
    // there were too few periods to compare, or it did not miss less.
    const why = best.choice.why === "holt-only" ? "fc-note-start-gap" : best.choice.why === "too-few" ? "fc-note-too-few" : "fc-note-holt-better";
    notes.push(text(why, { pattern }));
  }
  return { rows, season, ahead, best, method, target, cautions, notes };
}

/** How likely a Metric is to reach its Target `by` a period, as the forecast says it and with none of its words: the chance (0 to 1), the
 * period it is for and how many periods after the last value that is. Null where the forecast is refused, comes with a caution (a Heads-up
 * is only made from a forecast that passes cleanly), or the Target cannot be read. */
export function reachOf(metric: ForecastMetric, points: Point[], ctx: TakeawayContext, ask: { ends: TargetEnds; by?: string; allowance?: number }): { chance: number; period: string; ahead: number } | null {
  const fit = fitForecast(metric, points, ctx, ask);
  if ("refuse" in fit || fit.cautions.length > 0) return null;
  const chance = reachChance({ value: fit.target.value, sd: fit.target.sd }, ask.ends);
  return chance === null ? null : { chance, period: fit.target.period, ahead: fit.ahead };
}

/** The Takeaway of a Metric's forecast: the expected value and range, or with `ask.ends` the chance of reaching the Target, the Method used and why, its track
 * record, and the numbers. A refusal says what is missing. The points are only read. */
export function forecastTakeaway(metric: Metric, points: Point[], ctx: TakeawayContext, ask: ForecastAsk = {}): Takeaway {
  const fit = fitForecast(metric, points, ctx, ask);
  const span = metric.period;
  const text = wordsFor(metric, ctx);
  const refuse = (...lines: string[]) => refusalTakeaway(text("numbers-method-holt"), lines);
  if ("refuse" in fit) return refuse(...fit.refuse);
  const { rows, season, best, method, target, cautions, notes } = fit;
  const value = (v: number) => ({ value: v, unit: metric });
  const [lo, hi] = [target.value - Z80 * target.sd, target.value + Z80 * target.sd];
  const written = (v: number) => formatValue(metric, v, ctx.style);
  const figure = (label: string, v: number) => ({ label, value: v, text: written(v) });
  const [expected, range] = [text("numbers-expected"), text("numbers-range")];
  let sentence: string;
  let figures: Takeaway["figures"];
  let chance: number | null = null;
  if (ask.ends) {
    const { min, max } = ask.ends;
    chance = reachChance({ value: target.value, sd: target.sd }, ask.ends);
    // The forecast and its spread were checked to be numbers, so no chance means a Target that cannot be read (its lower end above its upper).
    if (chance === null) return refuse(text("refuse-target-ends", { name: metric.name }));
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
  // The two records are there together, or neither.
  const third = best.choice.seasonal ? best.choice : null;
  const numbers = [
    { label: text("numbers-method"), text: text(method === "holt" ? "numbers-method-holt" : "numbers-method-holt-winters") },
    { label: text("numbers-smoothing"), text: [SMOOTHING.level, SMOOTHING.trend, SMOOTHING.season].slice(0, method === "holt" ? 2 : 3).map((f) => formatNumber(Number(f.num) / Number(f.den), 1, ctx.style)).join(", ") },
    { label: expected, text: written(target.value) },
    { label: range, text: `${written(lo)} – ${written(hi)}` },
    ...(chance === null ? [] : [{ label: text("numbers-chance"), text: `${formatNumber(chanceCase(chance).percent, 0, ctx.style)} %` }]),
    ...(record ? [{ label: text("numbers-tested"), text: formatNumber(record.tested, 0, ctx.style) }, { label: text("numbers-inside"), text: formatNumber(record.inBand, 0, ctx.style) }, { label: text("numbers-miss"), text: written(record.typicalMiss) }] : []),
    ...(third ? [{ label: text("numbers-third-holt"), text: written(third.holt!.typicalMiss) }, { label: text("numbers-third-holt-winters"), text: written(third.seasonal!.typicalMiss) }, { label: text("numbers-third-n"), text: formatNumber(third.holt!.tested, 0, ctx.style) }] : []),
  ];
  return {
    ...answerTakeaway(text(method === "holt" ? "numbers-method-holt" : "numbers-method-holt-winters")),
    sentence,
    range: { lo, hi, text: `${written(lo)} – ${written(hi)}` },
    basis: text("fc-basis", { method: text(method === "holt" ? "fc-method-holt" : span === "day" ? "fc-method-holt-winters-weekly" : "fc-method-holt-winters"), n: rows.length }),
    assumptions: [text("fc-assumes")],
    cautions,
    notes,
    track: record ? text("fc-track", { tested: record.tested, inside: record.inBand }) : text("fc-track-none"),
    footer: text("footer-forecast"),
    figures,
    numbers,
  };
}
