// Made-up numbers for a Practice Workspace (spec 0063, #1267; GLOSSARY: Practice Workspace): believable values and
// targets for the periods a Metric has none for, so that year on year, year to date against last year, the quarter to
// date, the period before and Heads-ups have something to show. Pure: the same Metric, periods and values give the same
// numbers, so a second run adds nothing different. It never gives a number for a period that has one. How the numbers of
// one Pack belong together is in practice-relations.ts.
import { periodStart, shiftPeriod } from "./periods";
import type { Period, Polarity, YearStart } from "./types";

/** What the numbers of one Metric are made from. */
export type MadeUpMetric = {
  /** Anything that stays the same for the Metric, such as its name: it decides its level and its noise. */
  seed: string;
  period: Period;
  polarity: Polarity;
  unit: string;
  format: string;
  decimals: number;
  targetMin: number | null;
  targetMax: number | null;
  /** The range its level is picked from, where its unit and format would say something impossible (a rate per hour in
   * money is not thousands). */
  level?: readonly [number, number];
};

/** Periods that are always covered, by period, counted back from the last one filled: 13 months or more, quarterly 8,
 * yearly 3. */
const AT_LEAST: Record<Period, number> = { day: 397, week: 58, month: 14, quarter: 8, year: 3 };

/** The first days of every period made-up values are for, oldest first: from the start of the previous fiscal year, or
 * earlier where a period needs more to be compared, up to the one before the last that ended. The last ended period is
 * the one a request asks for and the running one follows it: both stay empty, so asking can be tried. With `ahead`, for
 * targets, on to the last period of the current fiscal year. */
export function madeUpPeriods(period: Period, today: string, yearStart: YearStart, ahead = false): string[] {
  const last = shiftPeriod(periodStart(today, period, yearStart), period, -2);
  const year = periodStart(today, "year", yearStart);
  const lastYear = periodStart(shiftPeriod(year, "year", -1), period, yearStart);
  const atLeast = shiftPeriod(last, period, 1 - AT_LEAST[period]);
  const to = ahead ? periodStart(shiftPeriod(shiftPeriod(year, "year", 1), "day", -1), period, yearStart) : last;
  const out: string[] = [];
  for (let at = atLeast < lastYear ? atLeast : lastYear; at <= to; at = shiftPeriod(at, period, 1)) out.push(at);
  return out;
}

/** A number from 0 to 1 that stays the same for the same words (FNV-1a). */
export function chance(words: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words.charCodeAt(i), 0x01000193);
  // Mixed once more, so words that differ at the end differ everywhere.
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** What kind of number a unit and a format call for. */
type Shape = { level: number; spread: number; max: number | null };

/** The level a Metric moves around when nothing says: by its format and unit, a month's worth for what adds up. */
function shapeOf(m: MadeUpMetric): Shape {
  const unit = m.unit.trim().toLowerCase();
  const pick = (low: number, high: number) => low + chance(`${m.seed}:level`) * (high - low);
  const perPeriod = { day: 1 / 21, week: 1 / 4.3, month: 1, quarter: 3, year: 12 }[m.period];
  if (m.level) return { level: pick(m.level[0], m.level[1]), spread: 0.05, max: m.format === "percent" ? 100 : null };
  if (m.format === "percent" || unit === "%") return { level: pick(m.polarity === "lower" ? 2 : 35, m.polarity === "lower" ? 12 : 80), spread: 0.05, max: 100 };
  if (m.format === "currency" || /^(€|\$|£|chf|eur|usd|gbp|k€|k\$)/.test(unit)) return { level: pick(20_000, 200_000) * perPeriod, spread: 0.07, max: null };
  if (/day|hour|minute|second|^h$|^d$|^min$/.test(unit)) return { level: pick(2, 30), spread: 0.08, max: null };
  if (/score|point|nps|rating|star/.test(unit)) return { level: pick(30, 70), spread: 0.05, max: 100 };
  if (m.format === "ratio" || unit === "x") return { level: pick(1, 4), spread: 0.05, max: null };
  // What comes in crowds: far more of these than of anything done by hand.
  if (/session|visit|view|click|impression|user|subscriber|follower/.test(unit)) return { level: pick(8_000, 60_000) * perPeriod, spread: 0.08, max: null };
  return { level: Math.max(4, pick(60, 600) * perPeriod), spread: 0.08, max: null };
}

/** The target a Target Range gives to aim at: the end the Polarity asks to reach, else the middle. */
function rangeAim(m: MadeUpMetric): number | null {
  const [low, high] = [m.targetMin, m.targetMax];
  if (m.polarity === "higher") return low ?? high;
  if (m.polarity === "lower") return high ?? low;
  return low !== null && high !== null ? (low + high) / 2 : (low ?? high);
}

/** Days since 1970 of a period's first day, as years. */
const years = (period: string) => Date.parse(`${period}T00:00:00Z`) / (365.2425 * 86_400_000);

/** The part of a value that follows the calendar: a yearly swing, a quiet weekend for daily numbers, and a trend that
 * goes the good way, mildly. Relative to 1. */
function course(m: MadeUpMetric, period: string): number {
  const at = years(period);
  const swing = m.period === "year" ? 0 : 0.02 + chance(`${m.seed}:swing`) * 0.1;
  const season = 1 + swing * Math.sin(2 * Math.PI * (at + chance(`${m.seed}:phase`)));
  const growth = (0.04 + chance(`${m.seed}:growth`) * 0.14) * (m.polarity === "lower" ? -1 : m.polarity === "higher" ? 1 : 0.2);
  const weekday = new Date(`${period}T00:00:00Z`).getUTCDay();
  const week = m.period === "day" && (weekday === 0 || weekday === 6) ? 0.55 : 1;
  return season * week * Math.exp(growth * at);
}

/** A value rounded to the Metric's decimals and held where such a number can be. */
function fit(value: number, m: MadeUpMetric, shape: Shape, negatives: boolean): number {
  const places = 10 ** Math.max(0, Math.min(m.decimals, 6));
  let v = Math.round(value * places) / places;
  if (!negatives && v < 0) v = 0;
  if (shape.max !== null && v > shape.max) v = shape.max;
  return v === 0 ? 0 : v;
}

/** The level a Metric moves around: what its values say, else its Target Range, else its kind of number. `along` is the
 * Metric whose course the values follow: itself, or the one it is a part of. */
function levelOf(m: MadeUpMetric, shape: Shape, existing: ReadonlyMap<string, number>, periods: string[], along = m): number {
  const known = [...existing].sort((a, b) => a[0].localeCompare(b[0]));
  if (known.length) {
    // The earliest values: what is filled in is mostly before them.
    const first = known.slice(0, Math.min(known.length, m.period === "day" ? 28 : 6));
    return first.reduce((n, [p, v]) => n + v / course(along, p), 0) / first.length;
  }
  const aim = rangeAim(m);
  // A little short of the aim in some Metrics and past it in others, so Attainment is not the same everywhere.
  const base = aim !== null && aim !== 0 ? aim * (0.92 + chance(`${m.seed}:aim`) * 0.14) : shape.level;
  return base / course(along, periods[periods.length - 1]);
}

/** Values for those of the periods that have none: a trend, a season and noise around the Metric's level. */
export function madeUpValues(m: MadeUpMetric, periods: string[], existing: ReadonlyMap<string, number>): Map<string, number> {
  const shape = shapeOf(m);
  const out = new Map<string, number>();
  if (!periods.length) return out;
  const level = levelOf(m, shape, existing, periods);
  const negatives = [...existing.values()].some((v) => v < 0) || level < 0;
  for (const p of periods) {
    if (existing.has(p)) continue;
    const noise = 1 + (chance(`${m.seed}:${p}`) - 0.5) * 2 * shape.spread;
    out.set(p, fit(level * course(m, p) * noise, m, shape, negatives));
  }
  return out;
}

/** Values of a Metric that is a share, or a multiple, of another one's: `whole` answers the other's value of the
 * period that holds `p`, and the factor stays between `low` and `high` in every period. None where the whole has none. */
export function madeUpShares(m: MadeUpMetric, periods: string[], existing: ReadonlyMap<string, number>, whole: (p: string) => number | undefined, [low, high]: readonly [number, number]): Map<string, number> {
  const shape = shapeOf(m);
  const out = new Map<string, number>();
  const usual = low + (high - low) * (0.25 + chance(`${m.seed}:share`) * 0.5);
  const places = 10 ** Math.max(0, Math.min(m.decimals, 6));
  for (const p of periods) {
    const of = whole(p);
    if (existing.has(p) || of === undefined) continue;
    const factor = Math.min(high, Math.max(low, usual + (chance(`${m.seed}:${p}`) - 0.5) * (high - low) * 0.5));
    // Cut off, not rounded, so that parts which add up to a whole never come to more than it.
    out.set(p, fit(Math.floor(of * factor * places) / places, m, shape, of < 0));
  }
  return out;
}

/** A Target Series for the previous and the whole current fiscal year, periods still to come included: the course without
 * its noise, a few percent above or below it, so that some Metrics are ahead of their targets and some behind. None for
 * a Metric whose Polarity asks for no direction and has no range. `along` is the Metric whose course the values follow. */
export function madeUpTargets(m: MadeUpMetric, periods: string[], values: ReadonlyMap<string, number>, along = m): Map<string, number> {
  const aim = rangeAim(m);
  if (m.polarity !== "higher" && m.polarity !== "lower" && aim === null) return new Map();
  const shape = shapeOf(m);
  const level = levelOf(m, shape, values, periods, along);
  const stretch = 0.95 + chance(`${m.seed}:stretch`) * 0.1;
  const now = periods[periods.length - 1];
  return new Map(periods.map((p) => {
    // With a Target Range, the targets lead up to it; without, they follow the course of the values.
    const target = aim !== null ? aim * Math.pow(course({ ...m, period: "month" }, p) / course({ ...m, period: "month" }, now), 0.5) : level * course(along, p) * stretch;
    return [p, fit(target, m, shape, level < 0)] as const;
  }));
}
