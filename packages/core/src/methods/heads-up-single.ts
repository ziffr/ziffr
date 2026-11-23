// Heads-ups about one Metric (GLOSSARY: Heads-up, Change point, Target Range, Takeaway; spec 0041, "Heads-ups", ticket 15): a change of
// direction, a Target out of reach, and a value that is unusual for its season. Pure: it is given the final values of the Metrics a
// person may see and their names and Targets, and nothing else, so nothing in what it returns can depend on a Metric they may not see.
//
// Each kind is a test of one Metric's own values, with a chance by luck:
//  - change of direction: the change point (change-point.ts) is a change of trend at one of the last 3 dates it can try, the trend
//    turned (up to down or down to up), the two lines are 2 typical misses apart at the latest period, the checks of the Method pass
//    with nothing to say and the misses do not carry over from one period to the next. Its chance is the change point's own (the F
//    ratio of two lines against one, times the dates tried), or the chance that the mean change per period differs before and after the date
//    (times the dates tried), whichever is larger: the first holds for a series around a line, the second for one that wanders;
//    (the misses of the two lines, not of the one line through everything, must not carry over: the one line's misses carry over wherever a change is real);
//  - Target out of reach: the forecast (the one of the Takeaway, takeaways/forecast.ts) gives a chance under 20 % of landing where the
//    Target wants the Metric with 2 or more periods left, or under 20 % where one period ago the straight line below was on pace (reached the Target); and the
//    straight line through the latest 24 periods, read at the same period, is below the Target's end by more than the line's own
//    uncertainty allows. Its chance is that of the line's value at the period against the end (Student's t, n - 2 degrees of
//    freedom, exact on the values' text, with the periods worth fewer where the misses follow their own past) or, if larger, the chance that
//    the mean change per period falls as short of what it takes to meet the end from the last value (Student's t on the changes: the one
//    for a series that wanders); the misses of the line must not carry over;
//  - unusual for the season: the latest value is outside the usual range of the values at the same place in the season
//    (quantiles.ts usualRange, 10th to 90th percentile), at least two earlier ones, on the side the mean says, and the checks of the
//    usual range pass with nothing to say. Its chance is that of a new value against the earlier ones at that place (Student's t,
//    k - 1 degrees of freedom, spread of sqrt(1 + 1/k) sample deviations).
// Every one of these conditions that is about the Metric alone is applied BEFORE the correction: a Metric that does not meet them has
// a chance of 1, and still counts among those looked at. The correction (Benjamini-Hochberg, false-discovery.ts) runs over everything
// looked at, all three kinds together, at 1 %, not at the 10 % the pairs use: these kinds look at every Metric one by one and Ziffr
// must stay quiet on noise (a pooled 1 % lets a report through in at most 1 run in 100 when nothing happens). The count is the number
// of tests worked out for the Metrics given, never the Workspace's, so the same Heads-up is reported or not whatever the person cannot
// see.
import { fractionOf, nearest, type Fraction } from "../exact";
import { formatNumber, type ValueUnit } from "../format";
import { periodStart, periodsBetween, shiftPeriod, type Span } from "../periods";
import { readSeries } from "../basis";
import { checkSuitability, SEASON_LENGTH, SUITABILITY, verdictOutcome } from "../suitability";
import { decimalsApart, decimalsFor, plainValue, signedText, sizeText, valueText } from "../takeaways/sizes";
import { HORIZON } from "../forecast";
import { chanceCase, endsOf, reachOf } from "../takeaways/forecast";
import { answerTakeaway, sayIn, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";
import type { TargetEnds } from "./reach-chance";
import type { Metric, Point } from "../types";
import { checkedChangePoint, moving, type ChangePoint } from "./change-point";
import { carriesOver, carryOf } from "./carry-over";
import { adjustedChances, benjaminiHochberg } from "./false-discovery";
import { add, div, mul, sub, total, whole } from "./fractions";
import { chanceText, type HeadsUp, type MetricHeadsUp } from "./heads-up";
import { HEADS_UP, isCurrent } from "./pair-scan";
import { standing, usualRange } from "./quantiles";
import { tCdf } from "./t-curve";

/** Every threshold of these Heads-ups, once. */
export const SINGLE = {
  /** The share of the reports that may be luck, for all three kinds together. */
  rate: 0.01,
  /** A change of direction is one at the last this many dates the change point can try; its two lines must be this many typical misses apart now. */
  recentDates: 3,
  misses: 2,
  /** A Target is out of reach under this chance, with at least `periodsLeft` periods left or having been on pace a period ago. */
  under: 0.2,
  periodsLeft: 2,
  /** The straight line behind a Target's chance: the latest `latest` periods, at least `least`. */
  line: { latest: 24, least: 8 },
  /** A value is unusual for the season when at least this many earlier values stand at its place in the season. */
  earlier: 2,
  /** The most a line's misses may follow their own past (first autocorrelation) for a Target to be read from it. */
  follow: 0.2,
} as const;

/** What these Heads-ups read of a Metric: its id, name, Period, Polarity and Target Range, and how to write its values. */
export type SingleMetric = Pick<Metric, "id" | "name" | "period" | "polarity" | "target_min" | "target_max"> & ValueUnit;

/** One Metric to look at: its final values (nothing waiting for Approval, nothing sent back) per period in its own Period, only the periods that are over. */
export type SingleLook = { metric: SingleMetric; points: Point[] };

/** What the Takeaways are written in, and the day it is today (a Metric whose latest period is not recent is not looked at). */
export type SingleContext = TakeawayContext & { today: string };

const ORDER = { "direction-change": 0, "target-out-of-reach": 1, "unusual-for-season": 2 } as const;

/** The chance of a change point by luck: the two lines against one (the F ratio with 2 and n - 4 degrees of freedom: (SSE₁ ÷ SSE₀)^((n - 4) ÷ 2)), times the dates tried, at most 1.
 * Where the misses follow their own past (`follow`, their first autocorrelation, only a positive one counts) the n periods are worth fewer: n · (1 - ρ) ÷ (1 + ρ), the effective
 * count of a series that follows its own past one step (never more than n), takes the place of n in the exponent. */
export function changeChance(cp: Pick<ChangePoint, "n" | "tries" | "kept">, follow = 0): number {
  const rho = Math.min(1, Math.max(0, follow));
  const effective = (cp.n * (1 - rho)) / (1 + rho);
  // No misses of one line (kept null) means two lines fit no better; no misses of the two lines but some of one is a chance of 0.
  return cp.kept === null ? 1 : Math.min(1, cp.tries * cp.kept ** (Math.max(0, effective - 4) / 2));
}

/** Whether a change is at one of the last `SINGLE.recentDates` dates the change point can try: the later part has at most `segment + recentDates - 1` values. */
export function recentDate(index: number, n: number): boolean {
  return n - index <= SUITABILITY.shift.segment + SINGLE.recentDates - 1;
}

/** Whether a forecast's `chance` of landing where the Target wants the Metric makes the Target out of reach: under `SINGLE.under`, with `SINGLE.periodsLeft` or more periods
 * left (`ahead`), or with fewer where one period ago it was on pace (`wasOnPace`, asked only then). */
export function unlikelyToReach(chance: number, ahead: number, wasOnPace: boolean): boolean {
  return chance < SINGLE.under && (ahead >= SINGLE.periodsLeft || wasOnPace);
}

/** Whether one period ago, without the latest value, the straight line through the values read at the period `by` met the Target. */
export function wasOnPace(rows: Point[], span: Span, by: string, ends: TargetEnds): boolean {
  return reaches(lineAt(rows.slice(0, -1), span, by), ends);
}

/** Whether a line's value `at` a period is where the Target wants the Metric: at or above the lower end, at or below the upper (the ends included), decided exactly. */
export function reaches(line: Pick<Line, "at">, ends: { min: number | null; max: number | null }): boolean {
  const side = (bound: number) => sub(line.at, fractionOf(bound)).num;
  return (ends.min === null || side(ends.min) >= BigInt(0)) && (ends.max === null || side(ends.max) <= BigInt(0));
}

/** Whether the latest value is on the side of the mean that "high" or "low" says: above the usual range but below the mean (a few very high values among the earlier ones) is not high. */
export function onTheSide(where: "below" | "above", latest: number, mean: number): boolean {
  return where === "above" ? latest > mean : latest < mean;
}

/** Whether the trend turned: one slope up and the other down (a slope of 0 is neither). */
export function turned(before: number, after: number): boolean {
  // Stryker disable next-line ArithmeticOperator: the signs are -1, 0 or 1, and a quotient of two of them is -1 exactly where their product is.
  return Math.sign(before) * Math.sign(after) === -1;
}

/** Whether two lines `gap` apart (in either direction) are at least `SINGLE.misses` typical misses (`spread`) apart. */
export function farApart(gap: number, spread: number): boolean {
  return Math.abs(gap) >= SINGLE.misses * spread;
}

// ---- exact: a straight line and a value against earlier ones ----

/** A straight line through values, read at one place: how many values, its value there and the variance of that value (exact), whether its misses carry over from one period to the
 * next (`carries`) and how strongly (`follow`: their first autocorrelation, from 0 to 0.99, a negative one counting as 0). */
export type Line = { n: number; at: Fraction; spread2: Fraction; carries: boolean; follow: number };

// The exact least-squares line through `rows` by their place in the calendar counted from `first`: the mean place, the slope, the squared misses and each miss with its place.
function fitLine(rows: Point[], span: Span, first: string) {
  const n = rows.length;
  const xs = rows.map((r) => whole(periodsBetween(first, r.period, span)));
  const ys = rows.map((r) => fractionOf(r.value));
  const mean = (fs: Fraction[]) => div(total(fs), whole(n));
  const [mx, my] = [mean(xs), mean(ys)];
  const dx = xs.map((x) => sub(x, mx));
  const dy = ys.map((y) => sub(y, my));
  const sxx = total(dx.map((d) => mul(d, d)));
  const sxy = total(dx.map((d, i) => mul(d, dy[i])));
  const slope = div(sxy, sxx);
  return { n, mx, my, sxx, slope, sse: sub(total(dy.map((d) => mul(d, d))), mul(slope, sxy)), misses: rows.map((_, i) => ({ x: Number(xs[i].num), miss: sub(dy[i], mul(slope, dx[i])) })) };
}

/** The least-squares line through `rows` (by their place in the calendar) read at the period `at`: its value there, and the variance of that value (the line's own
 * uncertainty: s² · (1/n + (x₀ - x̄)² ÷ Sxx), s² = SSE ÷ (n - 2)), exactly. At least 3 rows. */
export function lineAt(rows: Point[], span: Span, at: string): Line {
  const first = rows[0].period;
  const fit = fitLine(rows, span, first);
  const reach = sub(whole(periodsBetween(first, at, span)), fit.mx);
  const factor = add(div(whole(1), whole(fit.n)), div(mul(reach, reach), fit.sxx));
  return { n: fit.n, at: add(fit.my, mul(fit.slope, reach)), spread2: mul(div(fit.sse, whole(fit.n - 2)), factor), carries: carriesOver(fit.misses), follow: Math.min(0.99, Math.max(0, carryOf(fit.misses))) };
}

/** The misses of the two straight lines of a change point (one through the values before `index`, one from it on), each with its place in the calendar. The misses of ONE
 * line through everything carry over wherever there is a real change, so it is the two lines that are asked whether theirs do (carry-over.ts). */
export function twoLinesMisses(rows: Point[], span: Span, index: number) {
  const first = rows[0].period;
  return [...fitLine(rows.slice(0, index), span, first).misses, ...fitLine(rows.slice(index), span, first).misses];
}

// The exact mean of some fractions (at least 1) and the sum of squares about it.
function spread(values: Fraction[]) {
  const mean = div(total(values), whole(values.length));
  return { mean, ss: total(values.map((x) => mul(sub(x, mean), sub(x, mean)))) };
}

// The change into each value from the period before it, exactly, with the value's index in `rows`; a change between periods that do not follow one another is no change.
function consecutiveChanges(rows: Point[], span: Span): { at: number; change: Fraction }[] {
  return rows.flatMap((r, i) => (i > 0 && periodsBetween(rows[i - 1].period, r.period, span) === 1 ? [{ at: i, change: sub(fractionOf(r.value), fractionOf(rows[i - 1].value)) }] : []));
}

/** The chance that the mean change from one period to the next differs between the periods before a date and those after it, as far as it does or farther, if it did not (Student's t
 * with pooled variance over the changes into the periods before the date and the changes into the periods after it; the change into the date's own period spans it and is left out;
 * a change between periods that do not follow one another is no change). 1 where either side has fewer than 2 changes; 0 or 1 where both sides' changes are each all the same (no
 * spread to judge by: 0 where the two sides differ). A series that wanders, a running total, has changes that are independent, which a line's misses are not: this is the chance the
 * change of direction must also pass. Exact on the values' text. */
export function shiftChance(rows: Point[], span: Span, index: number): number {
  // (The change into the date's own period spans it: it belongs to neither side.)
  const all = consecutiveChanges(rows, span);
  const [before, after] = [all.filter((c) => c.at < index).map((c) => c.change), all.filter((c) => c.at > index).map((c) => c.change)];
  if (before.length < 2 || after.length < 2) return 1;
  const [a, b] = [spread(before), spread(after)];
  const df = before.length + after.length - 2;
  const gap = sub(b.mean, a.mean);
  if (a.ss.num === BigInt(0) && b.ss.num === BigInt(0)) return gap.num === BigInt(0) ? 1 : 0;
  const se2 = mul(div(add(a.ss, b.ss), whole(df)), add(div(whole(1), whole(before.length)), div(whole(1), whole(after.length))));
  return Math.min(1, 2 * tCdf(-Math.abs(nearest(gap)) / Math.sqrt(nearest(se2)), df));
}

// The chance that a line's value is `short` (exact, negative: it falls short) or farther off, if its true value were the end it is read against: Student's t at short ÷ √spread2.
// 0 or 1 where the line has no miss at all (its value is exact), NaN where a number is too large to work out. Where the misses follow their own past (`follow`, ρ) the n periods
// are worth n · (1 - ρ) ÷ (1 + ρ), the effective count: the variance of the line's value is that much larger and the degrees of freedom are that many less 2 (rounded down), as
// for any series that follows its own past one step; with fewer than 3 periods worth counting there is no chance to speak of (1).
function lineMiss(line: Line, short: Fraction): number {
  if (line.spread2.num === BigInt(0)) return short.num < BigInt(0) ? 0 : 1;
  const df = Math.floor((line.n * (1 - line.follow)) / (1 + line.follow)) - 2;
  if (df < 1) return 1;
  return tCdf(nearest(short) / Math.sqrt((nearest(line.spread2) * (1 + line.follow)) / (1 - line.follow)), df);
}

// The chance that the mean change per period over `rows` falls short, by as much as it does or more, of the change per period it takes to meet `end` at `by` from the last value:
// (end - last) ÷ periods ahead, `up` for a lower end (the mean must be at least it) and not for an upper end (at most it). Student's t with changes - 1 degrees of freedom on the
// standard error of the mean change, s ÷ √changes, exact on the values' text; a change between periods that do not follow one another is no change. 1 with fewer than 2 changes; 0 or 1
// where the changes are all the same (0 where they fall short). A series that wanders, a running total, has independent changes, which a line's misses are not.
function driftMiss(rows: Point[], span: Span, by: string, end: number, up: boolean): number {
  const changes = consecutiveChanges(rows, span).map((c) => c.change);
  const m = changes.length;
  if (m < 2) return 1;
  const last = rows[rows.length - 1];
  const needed = div(sub(fractionOf(end), fractionOf(last.value)), whole(periodsBetween(last.period, by, span)));
  const { mean, ss } = spread(changes);
  const short = up ? sub(mean, needed) : sub(needed, mean);
  if (ss.num === BigInt(0)) return short.num < BigInt(0) ? 0 : 1;
  return tCdf(nearest(short) / Math.sqrt(nearest(div(ss, whole(m * (m - 1))))), m - 1);
}

/** The chance that the mean change per period over the latest values is as far below the change it takes to reach the lower `end` at the period `by` as it is, or lower. */
export function driftBelow(rows: Point[], span: Span, by: string, end: number): number {
  return driftMiss(rows, span, by, end, true);
}

/** The chance that the mean change per period over the latest values is as far above the change it takes to stay at the upper `end` at the period `by` as it is, or higher. */
export function driftAbove(rows: Point[], span: Span, by: string, end: number): number {
  return driftMiss(rows, span, by, end, false);
}

/** The chance that a line's value is as far below `bound` as it is, or lower, if the line's true value were `bound`. */
export function lineBelow(line: Line, bound: number): number {
  return lineMiss(line, sub(line.at, fractionOf(bound)));
}

/** The chance that a line's value is as far above `bound` as it is, or higher, if the line's true value were `bound`. */
export function lineAbove(line: Line, bound: number): number {
  return lineMiss(line, sub(fractionOf(bound), line.at));
}

/** The chance of a value as far from the mean of `earlier` values as `latest` is, or farther, in either direction, if it came from the same place: Student's t with
 * k - 1 degrees of freedom at |latest - mean| ÷ (s · √(1 + 1/k)), s the sample deviation. 1 where the earlier values do not differ (no spread to judge by), NaN where a number is too large. */
export function newValueChance(earlier: number[], latest: number): number {
  const k = earlier.length;
  const { mean, ss } = spread(earlier.map(fractionOf));
  if (ss.num === BigInt(0)) return 1;
  const d = sub(fractionOf(latest), mean);
  const t2 = div(mul(d, d), mul(div(ss, whole(k - 1)), add(whole(1), div(whole(1), whole(k)))));
  return Math.min(1, 2 * tCdf(-Math.sqrt(nearest(t2)), k - 1));
}

// ---- the tests ----

/** A test of one Metric: which kind, its chance after every condition about the Metric alone (1 where one fails), and how to write the Heads-up it would be. */
/** A test of one Metric: its kind, the conditions about the Metric alone (`gates`, each true or false), the chance before the conditions (`chance`; 1 where a test has nothing to say), the chance
 * after them (`p`: the chance where every gate holds, else 1), and how to write the Heads-up it would be. */
export type Test = { kind: keyof typeof ORDER; id: number; gates: Record<string, boolean>; chance: number; p: number; build: (looked: number, adjusted: number) => MetricHeadsUp };

/** Whether every condition holds. */
export function holds(gates: Record<string, boolean>): boolean {
  return Object.values(gates).every(Boolean);
}

const text = (ctx: TakeawayContext) => (n: number, d = 0) => formatNumber(n, d, ctx.style);

// The last two lines of Show the numbers: how many checks were looked at and the chance after the correction for them.
function lookedRows(looked: number, adjusted: number, ctx: SingleContext) {
  return [
    { label: sayIn("numbers-hu-checks", {}, ctx), text: text(ctx)(looked) },
    { label: sayIn("numbers-hu-luck-checks", {}, ctx), text: chanceText(adjusted, ctx) },
  ];
}

// The shared tail of a Heads-up about one Metric.
function made(look: SingleLook, kind: Test["kind"], through: string, takeaway: Takeaway, key: string, adjusted: number): MetricHeadsUp {
  // The stronger (the smaller its chance after the correction), the higher; kept to 12 digits like the pairs' rank.
  return { key, kind, metrics: [look.metric.id], span: look.metric.period, through, rank: Number(Math.min(300, -Math.log10(Math.max(adjusted, 1e-300))).toPrecision(12)), takeaway };
}

function directionTest(look: SingleLook, ctx: SingleContext): Test | null {
  const { metric } = look;
  const { result, verdict, rows } = checkedChangePoint(metric.name, look.points, metric.period);
  // A test of this kind is a Metric with at least 8 values that the change point can work on; what the checks say is a condition, not a part of what is tried.
  if (!result.ok) return null;
  const last = rows[rows.length - 1].period;
  const unit = metric;
  const decimals = decimalsApart([result.before, result.after], unit.decimals, ctx.style);
  const gap = result.step + result.slopeChange * periodsBetween(result.period, last, metric.period);
  // Every condition about this Metric alone, so that a Metric that does not meet them counts among those looked at, with a chance of 1.
  const misses = twoLinesMisses(rows, metric.period, result.index);
  const gates = {
    found: result.found,
    steady: !carriesOver(misses),
    clean: verdictOutcome(verdict) === "ok",
    current: isCurrent(last, ctx.today, metric.period, ctx.yearStart ?? 1),
    recent: recentDate(result.index, result.n),
    turned: turned(result.before, result.after),
    apart: farApart(gap, result.spread),
    written: decimals !== null,
  };
  const chance = Math.max(changeChance(result, carryOf(misses)), Math.min(1, result.tries * shiftChance(rows, metric.period, result.index)));
  return {
    kind: "direction-change", id: metric.id, gates, chance, p: holds(gates) ? chance : 1,
    build: (looked, adjusted) => {
      const t = text(ctx);
      const method = sayIn("numbers-method-hu-direction", {}, ctx);
      const sentence = sayIn("hu-turned", { name: metric.name, from: result.period, span: metric.period, before: moving(result.before, unit, decimals!, ctx, metric.period), after: moving(result.after, unit, decimals!, ctx, metric.period) }, ctx);
      const takeaway: Takeaway = {
        ...answerTakeaway(method),
        sentence,
        basis: sayIn("cp-basis", { n: result.n, tries: result.tries, span: metric.period }, ctx),
        assumptions: [sayIn("cp-assumes", {}, ctx)],
        footer: sayIn("footer-change-point", {}, ctx),
        figures: [
          { label: sayIn("numbers-slope-before", {}, ctx), value: Math.abs(result.before), text: sizeText(result.before, unit, decimals!, ctx.style) },
          { label: sayIn("numbers-slope-after", {}, ctx), value: Math.abs(result.after), text: sizeText(result.after, unit, decimals!, ctx.style) },
        ],
        numbers: [
          { label: sayIn("numbers-method", {}, ctx), text: method },
          { label: sayIn("numbers-periods-used", {}, ctx), text: t(result.n) },
          { label: sayIn("numbers-dates-tried", {}, ctx), text: t(result.tries) },
          { label: sayIn("numbers-change-date", {}, ctx), text: result.period },
          { label: sayIn("numbers-slope-before", {}, ctx), text: signedText(result.before, unit, decimals!, ctx.style) },
          { label: sayIn("numbers-slope-after", {}, ctx), text: signedText(result.after, unit, decimals!, ctx.style) },
          { label: sayIn("numbers-hu-gap", {}, ctx), text: plainValue(gap, unit, decimals!, ctx.style) },
          { label: sayIn("numbers-miss", {}, ctx), text: plainValue(result.spread, unit, unit.decimals, ctx.style) },
          ...lookedRows(looked, adjusted, ctx),
        ],
      };
      return made(look, "direction-change", last, takeaway, `direction-change:${metric.id}`, adjusted);
    },
  };
}

/** What the test of a Target read, for the words of its Heads-up: the Target's ends, the latest values, the period the Target is read at, the forecast's chance and
 * period and periods ahead, the straight line's value there, the decimals the ends are written with (as many as keep an end from reading as 0), whether one period ago the line was on pace (only asked with fewer than 2 periods left), and the period the data runs to. */
export type TargetReading = { ends: TargetEnds; decimals: number; rows: Point[]; now: { chance: number; period: string; ahead: number }; line: Fraction; onPace: boolean; last: string };

/** The Heads-up of a Target out of reach, in words: its sentence by which ends the Target has, the chance in tenths ("under 1 in 20" below 5 %), the forecast's footer, a line
 * where it was on pace a period ago, and the numbers it used. `looked` is how many checks were looked at and `adjusted` its chance after the correction. */
export function targetHeadsUp(look: SingleLook, reading: TargetReading, looked: number, adjusted: number, ctx: SingleContext): MetricHeadsUp {
  const { metric } = look;
  const { ends, now, rows } = reading;
  const span = metric.period;
  const t = text(ctx);
  const method = sayIn("numbers-method-hu-reach", {}, ctx);
  const { key: wording, k } = chanceCase(now.chance);
  const slots = { name: metric.name, from: now.period, span, chance: sayIn(wording, { k }, ctx) };
  const value = (v: number) => valueText(v, metric, reading.decimals, ctx.style);
  const sentence = ends.min !== null && ends.max !== null ? sayIn("hu-reach-between", { ...slots, min: value(ends.min), max: value(ends.max) }, ctx) : ends.min !== null ? sayIn("hu-reach-min", { ...slots, min: value(ends.min) }, ctx) : sayIn("hu-reach-max", { ...slots, max: value(ends.max!) }, ctx);
  const takeaway: Takeaway = {
    ...answerTakeaway(method),
    sentence,
    basis: sayIn("basis-history", { n: rows.length, span }, ctx),
    assumptions: [sayIn("fc-assumes", {}, ctx)],
    notes: reading.onPace && now.ahead < SINGLE.periodsLeft ? [sayIn("hu-was-on-pace", {}, ctx)] : [],
    footer: sayIn("footer-forecast", {}, ctx),
    figures: [
      ...(ends.min === null ? [] : [{ label: sayIn("numbers-target-min", {}, ctx), value: ends.min, text: value(ends.min) }]),
      ...(ends.max === null ? [] : [{ label: sayIn("numbers-target-max", {}, ctx), value: ends.max, text: value(ends.max) }]),
    ],
    numbers: [
      { label: sayIn("numbers-method", {}, ctx), text: method },
      { label: sayIn("numbers-chance", {}, ctx), text: `${t(chanceCase(now.chance).percent)} %` },
      { label: sayIn("numbers-hu-periods-left", {}, ctx), text: t(now.ahead) },
      { label: sayIn("numbers-hu-line", {}, ctx), text: plainValue(nearest(reading.line), metric, metric.decimals, ctx.style) },
      ...lookedRows(looked, adjusted, ctx),
    ],
  };
  return made(look, "target-out-of-reach", reading.last, takeaway, `target-out-of-reach:${metric.id}`, adjusted);
}

function targetTest(look: SingleLook, ctx: SingleContext): Test | null {
  const { metric } = look;
  const span = metric.period;
  const ends = endsOf(metric);
  const rows = readSeries(look.points);
  const line = rows.slice(-SINGLE.line.latest);
  // A test of this kind is a Metric with a Target and enough values for a straight line; what the forecast says is a condition, not a part of what is tried.
  if ((ends.min === null && ends.max === null) || line.length < SINGLE.line.least) return null;
  const last = rows[rows.length - 1].period;
  // The period the Target is read at: the forecast's own default, a few periods after the last value (2 or more except for a yearly Metric).
  const by = shiftPeriod(last, span, HORIZON[span]);
  const fit = lineAt(line, span, by);
  // The line is read against the end it is below (or above): the chance that it is as far off if the Target were just met. Both ends: either, twice (the one that is not
  // crossed is 0.5 or more, so the other's chance is the one that counts).
  // The larger of that and the chance read from the changes alone (a series that wanders has a line through it that looks like a trend), as for a change of direction.
  const below = ends.min === null ? 1 : Math.max(lineBelow(fit, ends.min), driftBelow(line, span, by, ends.min));
  const above = ends.max === null ? 1 : Math.max(lineAbove(fit, ends.max), driftAbove(line, span, by, ends.max));
  const lineChance = ends.min !== null && ends.max !== null ? Math.min(1, 2 * Math.min(below, above)) : Math.min(below, above);
  // The forecast is only worked out for a line that could be reported at all (nothing above the rate is ever reported): it is the costly part.
  // (An end too small to show a digit with the most decimals the writer has cannot be said in words: no Heads-up.)
  const decimals = decimalsFor([ends.min, ends.max].filter((v): v is number => v !== null), metric.decimals, ctx.style);
  // (A line whose misses carry over, by the check of carry-over.ts, follows its own past by more than 0.4 in a window of 24, so `mild` holds it back too.)
  // A line whose misses follow their own past by more than SINGLE.follow is not used (the estimate of how much they follow is too loose to allow for), nor is a Target period that is already over.
  const gates = {
    written: decimals !== null,
    // Stryker disable next-line EqualityOperator: a first autocorrelation of exactly 0.2 is a measure-zero event in doubles; which side it counts on is a convention.
    mild: fit.follow <= SINGLE.follow,
    ahead: by >= periodStart(ctx.today, span, ctx.yearStart ?? 1),
    current: isCurrent(last, ctx.today, span, ctx.yearStart ?? 1),
  };
  // Stryker disable next-line EqualityOperator,ConditionalExpression: only saves the forecast's work: a chance above the rate is never reported by the correction anyway.
  const small = lineChance <= SINGLE.rate;
  const now = holds(gates) && small ? reachOf(metric, rows, ctx, { ends, by }) : null;
  const all = { ...gates, unlikely: now === null ? !(holds(gates) && small) : unlikelyToReach(now.chance, now.ahead, wasOnPace(line, span, by, ends)) };
  return {
    kind: "target-out-of-reach", id: metric.id, gates: all, chance: lineChance, p: holds(all) && small ? lineChance : 1,
    build: (looked, adjusted) => targetHeadsUp(look, { ends, decimals: decimals!, rows, now: now!, line: fit.at, onPace: wasOnPace(line, span, by, ends), last }, looked, adjusted, ctx),
  };
}

function seasonTest(look: SingleLook, ctx: SingleContext): Test | null {
  const { metric } = look;
  const span = metric.period;
  const season = SEASON_LENGTH[span];
  const rows = readSeries(look.points).slice(-HEADS_UP.window);
  // Stryker disable next-line EqualityOperator: no Period has a season of exactly 2 (a half year is only a Display Period), so `<` and `<=` never differ.
  if (season < 2 || rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const earlier = rows.slice(0, -1);
  const range = usualRange(earlier, span, { season, at: latest.period, least: SINGLE.earlier });
  // A test of this kind is a Metric with at least 2 earlier values at the latest value's place in the season; what the checks of the usual range say is a condition, not a part of what is tried.
  if (!range) return null;
  const same = earlier.filter((r) => periodsBetween(latest.period, r.period, span) % season === 0).map((r) => r.value);
  const where = standing(range, latest.value);
  const mean = same.reduce((s, v) => s + v, 0) / same.length;
  // On the side the mean says: a value above the 90th percentile but below the mean (a few very high ones among the earlier) is not "high".
  // (Values written with as many decimals as keep the latest value, the low and the high apart; where that cannot be done, nothing is said.)
  const decimals = decimalsApart([latest.value, range.low, range.high], metric.decimals, ctx.style);
  const chance = newValueChance(same, latest.value);
  const gates = {
    written: decimals !== null,
    outside: where !== "within",
    side: where !== "within" && onTheSide(where, latest.value, mean),
    current: isCurrent(latest.period, ctx.today, span, ctx.yearStart ?? 1),
  };
  // The checks of the usual range (periods, variation, gaps, a level shift) are the costly part, and only asked of a value that could be reported at all.
  // Stryker disable next-line EqualityOperator,ConditionalExpression: only saves the checks' work: a chance above the rate is never reported by the correction anyway.
  const small = chance <= SINGLE.rate;
  // (`clean` is only asked of a value every other condition lets through, and holds where it is not asked.)
  const asked = holds(gates) && small;
  const all = { ...gates, clean: !asked || verdictOutcome(checkSuitability("usualRange", { series: [{ name: metric.name, points: rows }], span })) === "ok" };
  return {
    kind: "unusual-for-season", id: metric.id, gates: all, chance, p: holds(all) && small ? chance : 1,
    build: (looked, adjusted) => {
      const t = text(ctx);
      const method = sayIn("numbers-method-hu-season", {}, ctx);
      const value = (v: number) => valueText(v, metric, decimals!, ctx.style);
      const takeaway: Takeaway = {
        ...answerTakeaway(method),
        sentence: sayIn(where === "above" ? "hu-season-above" : "hu-season-below", { name: metric.name, from: latest.period, span, value: value(latest.value), low: value(range.low), high: value(range.high) }, ctx),
        basis: sayIn("basis-season", { n: range.n, span }, ctx),
        footer: sayIn("footer-hu-season", {}, ctx),
        figures: [
          { label: sayIn("numbers-low", {}, ctx), value: range.low, text: value(range.low) },
          { label: sayIn("numbers-high", {}, ctx), value: range.high, text: value(range.high) },
        ],
        numbers: [
          { label: sayIn("numbers-method", {}, ctx), text: method },
          { label: sayIn("numbers-median", {}, ctx), text: plainValue(range.median, metric, metric.decimals, ctx.style) },
          { label: sayIn("numbers-usual", {}, ctx), text: `${value(range.low)} – ${value(range.high)}` },
          { label: sayIn("numbers-values", {}, ctx), text: t(range.n) },
          ...lookedRows(looked, adjusted, ctx),
        ],
      };
      return made(look, "unusual-for-season", latest.period, takeaway, `unusual-for-season:${metric.id}`, adjusted);
    },
  };
}

/** The tests of one Metric, each with its conditions and chances (what `singleHeadsUpsFrom` weighs): a change of direction, a Target, a season, those that have enough values to be tried. */
export function testsOf(look: SingleLook, ctx: SingleContext): Test[] {
  return [directionTest(look, ctx), targetTest(look, ctx), seasonTest(look, ctx)].filter((t): t is Test => t !== null);
}

/** The Heads-ups about one Metric among the `looks` of the Metrics a person may see: a change of direction, a Target out of reach, a value unusual for its season. The
 * correction counts only the tests worked out for these looks, all three kinds together (see the file's header); a Metric with too few values for a kind is not a test of
 * that kind. Strongest first within each kind, the kinds in that order, ties by id. The same looks give the same Heads-ups in any order. */
export function singleHeadsUpsFrom(looks: readonly SingleLook[], ctx: SingleContext): HeadsUp[] {
  // Stryker disable next-line ArrowFunction,ArithmeticOperator,MethodExpression: the order the Metrics are tried in changes nothing: the correction does not read the order and the Heads-ups are sorted again below.
  const sorted = [...looks].sort((a, b) => a.metric.id - b.metric.id);
  const tests = sorted.flatMap((look) => testsOf(look, ctx));
  const reported = benjaminiHochberg(tests.map((t) => t.p), SINGLE.rate);
  const adjusted = adjustedChances(tests.map((t) => t.p));
  const out = tests.flatMap((test, i) => (reported[i] ? [test.build(tests.length, adjusted[i])] : []));
  return out.sort((x, y) => ORDER[x.kind] - ORDER[y.kind] || y.rank - x.rank || x.metrics[0] - y.metrics[0]);
}
