// Comparing the code with the references (spec 0022, Testing Decisions): what counts as equal, and the generated
// series every combination is run on. Shared by the exhaustive tests and, later, the Calculation Catalogue's (#126).
import fc from "fast-check";
import type { SeriesBy, ShownTargets } from "../../display-periods";
import type { Span, YearStart } from "../../periods";
import type { Aggregation, Point } from "../../types";
import { dayOf, spanEnd, spanStart, textOf } from "./calendar";
import type { ReferenceSeries, ReferenceTarget } from "./combine";
import { exactOf, exactText, fitsDigits, isNearestDouble, placesOf, roundedText, type Exact } from "./exact";

/** Every Period a Metric counts in, and every Display Period. */
export const PERIODS = ["day", "week", "month", "quarter", "year"] as const;
/** The Display Periods, shortest first. */
export const DISPLAYS = ["week", "month", "quarter", "half", "year"] as const;
/** Every Aggregation. */
export const AGGREGATIONS: Aggregation[] = ["sum", "average", "last", "none"];
/** All twelve months a Fiscal Year can start in. */
export const YEAR_STARTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as YearStart[];

const RANK: Record<Span, number> = { day: 0, week: 1, month: 2, quarter: 3, half: 4, year: 5 };

/** The Display Periods longer than a Period, by the reference's own ranking. */
export function longer(p: Span): Span[] {
  return DISPLAYS.filter((d) => RANK[d] > RANK[p]);
}

/** How many generated series each combination is checked on, and the seed: `pnpm test` runs a fixed seed and a few
 * hundred runs, `pnpm --filter @ziffr/core test:numbers` at least 1,000 with a new seed each time (printed on failure,
 * and at the start, so a failure can be run again with NUMBERS_SEED). */
export function runs(): { numRuns: number; seed: number } {
  const asked = process.env.NUMBERS_SEED;
  // A new seed each run, from the minute it starts; each test names its seed, and fast-check prints it on a failure.
  const seed = asked === "random" ? Math.floor(Date.now() / 60_000) % 2 ** 31 : Number(asked) || 115;
  return { numRuns: Number(process.env.NUMBERS_RUNS) || 200, seed };
}

/** The display rounds through Intl.NumberFormat (formatValue): half away from zero, on the shortest text of the
 * double. Written the same way here, without grouping, so it can be read against the reference's rounding. */
export function displayed(x: number, decimals: number): string {
  const text = (FORMATS[decimals] ??= new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false })).format(x);
  // A value that rounds to zero is written without a minus (spec 0022, #110): compared without it here.
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}
const FORMATS: Intl.NumberFormat[] = [];

/** Whether rounding a double to `decimals` must give the exact value's rounding: when the exact value ends within 15
 * significant digits (a double carries those unchanged), or never ends and is below a million, where it stays further
 * from a halfway point than a double's error (an average of at most 400 values with six decimals). */
export function roundingIsExact(x: Exact): boolean {
  if (fitsDigits(x, 15)) return true;
  if (placesOf(x) !== null) return false;
  const size = x.num < 0n ? -x.num : x.num;
  return size < 1_000_000n * x.den;
}

/** The first way a value differs from the exact one: not the nearest double, or not rounded to the same text. */
export function valueMismatch(code: number, exact: Exact, decimals: number): string | null {
  if (!isNearestDouble(code, exact)) return `${code} is not the double nearest to ${exactText(exact)}`;
  if (roundingIsExact(exact) && displayed(code, decimals) !== roundedText(exact, decimals)) {
    return `${code} shows as ${displayed(code, decimals)} at ${decimals} decimals, the exact ${exactText(exact)} as ${roundedText(exact, decimals)}`;
  }
  return null;
}

/** The first way a series from the code differs from the reference's, or null when they are the same. */
export function seriesMismatch(code: SeriesBy, ref: ReferenceSeries, decimals: number): string | null {
  if (code.ok !== ref.ok) return `code ${code.ok ? "combines" : "refuses"}, the reference ${ref.ok ? "combines" : "refuses"}`;
  if (!ref.ok) return null;
  const spans = ref.spans;
  if (code.points.length !== spans.length) {
    return `code shows ${code.points.map((p) => p.period).join(", ") || "nothing"}, the reference ${spans.map((s) => s.period).join(", ") || "nothing"}`;
  }
  for (let i = 0; i < spans.length; i++) {
    const [c, r] = [code.points[i], spans[i]];
    for (const k of ["period", "held", "length", "toDate", "through"] as const) {
      if (c[k] !== r[k]) return `span ${r.period}: ${k} is ${c[k]}, the reference says ${r[k]}`;
    }
    const v = valueMismatch(c.value, r.value, decimals);
    if (v) return `span ${r.period}: ${v}`;
  }
  return null;
}

/** The first way a span's targets from the code differ from the reference's, or null. */
export function targetsMismatch(code: ShownTargets, ref: { at: Record<string, ReferenceTarget>; line: { period: string; value: Exact }[] }): string | null {
  const keys = (o: object) => Object.keys(o).sort().join(",");
  if (keys(code.at) !== keys(ref.at)) return `targets for ${keys(code.at) || "no span"}, the reference for ${keys(ref.at) || "no span"}`;
  for (const [period, t] of Object.entries(ref.at)) {
    for (const side of ["min", "max"] as const) {
      const [c, r] = [code.at[period][side], t[side]];
      if ((c === null) !== (r === null) || (r !== null && !isNearestDouble(c!, r))) return `target ${side} of ${period} is ${c}, the reference says ${r && exactText(r)}`;
    }
  }
  if (code.line.length !== ref.line.length) return `target line has ${code.line.length} points, the reference ${ref.line.length}`;
  for (let i = 0; i < ref.line.length; i++) {
    if (code.line[i].period !== ref.line[i].period || !isNearestDouble(code.line[i].value, ref.line[i].value)) return `target line at ${ref.line[i].period} differs`;
  }
  return null;
}

/** The first days of `count` Metric periods from the one `from` falls in, by the reference calendar. */
export function periodsFrom(from: string, period: Span, count: number, yearStart: YearStart = 1): string[] {
  const out: string[] = [];
  for (let d = spanStart(dayOf(from), period, yearStart); out.length < count; d = spanEnd(d, period, yearStart) + 1) out.push(textOf(d));
  return out;
}

/** The most periods a generated series has: a daily one a little more than a year, so a year can be half full. */
export const MOST: Record<(typeof PERIODS)[number], number> = { day: 400, week: 120, month: 40, quarter: 16, year: 6 };

/** A value as people send them, as text: zero, small, large (up to 10^15) and tiny, negative or not, with up to six
 * decimals, and the values chosen to break floating point (0.1, 0.2, 0.01, a 5 at the rounding digit). */
export const valueText = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom("0", "0.1", "0.2", "0.01", "0.005", "1.005", "2.675", "-0.5", "0.000001", "999999999999999", "-123456789012.345678") },
  {
    weight: 6,
    arbitrary: fc
      .tuple(
        fc.boolean(),
        fc.oneof(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 999 }), fc.integer({ min: 0, max: 1_000_000 }), fc.bigInt({ min: 0n, max: 10n ** 15n })),
        fc.stringMatching(/^\d{0,6}$/),
      )
      .map(([negative, whole, decimals]) => `${negative ? "-" : ""}${whole}${decimals ? `.${decimals}` : ""}`),
  },
);

/** A generated series of one Period: values at random periods with gaps, some periods given twice, in any order;
 * the day it is read on; a Comparison's cut (one of its periods) or none; the Metric's decimals. */
export function series(period: (typeof PERIODS)[number]) {
  return fc
    .record({
      start: fc.integer({ min: dayOf("2023-01-01"), max: dayOf("2028-12-31") }),
      fill: fc.double({ min: 0.05, max: 1, noNaN: true }),
      slots: fc.array(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), valueText), { maxLength: MOST[period] }),
      twice: fc.array(fc.tuple(fc.nat(), valueText), { maxLength: 3 }),
      order: fc.integer(),
      today: fc.integer({ min: -40, max: 40 }),
      todayAt: fc.double({ min: 0, max: 1.2, noNaN: true }),
      cut: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { freq: 3 }),
      decimals: fc.integer({ min: 0, max: 6 }),
    })
    .map((g) => {
      const starts = periodsFrom(textOf(g.start), period, Math.max(1, g.slots.length));
      const kept: Point[] = [];
      g.slots.forEach(([draw, text], i) => draw < g.fill && kept.push({ period: starts[i], value: Number(text) }));
      for (const [i, text] of g.twice) if (kept.length) kept.push({ period: kept[i % kept.length].period, value: Number(text) });
      const points = shuffled(kept, g.order);
      const first = dayOf(starts[0]);
      const last = dayOf(starts[starts.length - 1]);
      const today = textOf(Math.round(first + (last - first) * g.todayAt) + g.today);
      const alignTo = g.cut === null || !kept.length ? undefined : [...kept].sort((a, b) => (a.period < b.period ? -1 : 1))[Math.floor(g.cut * (kept.length - 1))].period;
      return { points, today, alignTo, decimals: g.decimals };
    });
}

/** The points in an order of the seed's choosing (Fisher–Yates with a small fixed generator). */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** An exact value from a number's text: what the database sent. */
export const exact = (v: number) => exactOf(v);
