// @ts-nocheck
// Before and after (spec 0041, Method `afterDate`): equal to the reference (the normal equations by Cramer's rule, the variance
// of the gap from the covariance matrix) exactly on the values' text, to NumPy and SciPy to a relative 1e-9, hand-worked, planted
// differences found with their range, every calendar span, hostile input, properties (shifting, scaling, trends, order), and the
// Takeaway with its suitability limits one step either side.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatValue, type ValueUnit } from "../format";
import type { Span } from "../periods";
import type { TakeawayContext } from "../takeaways/takeaway";
import { referenceAfter, referenceHalf, referenceShareRange } from "../test/reference/before-after";
import { runs } from "../test/reference/check";
import { exactOf, nearestDoubleOf } from "../test/reference/exact";
import { close, series } from "../test/reference/methods-fixture";
import type { Point } from "../types";
import { afterDate, afterDateTakeaway, isDay, MAX_PERIODS, splitAt, type AfterDate } from "./before-after";

const { numRuns, seed } = runs();
type AfterCase = { values: (number | null)[]; start: number; n: number; m: number; slope: number; intercept: number; sse: number; spread: number; expected: number; actual: number; gap: number; half: number; lo: number; hi: number; share: { gap: number; lo: number; hi: number } | null };
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/before-after.json", import.meta.url), "utf8")) as { tools: Record<string, string>; after: Record<string, AfterCase> };
const ctx: TakeawayContext = { style: "1,234.5" };
const euro: ValueUnit = { unit: "€", unit_position: "after", decimals: 0 };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const FOOTER = "This compares what happened with where the earlier trend pointed; it does not show what made the difference.";
const monthStart = (i: number) => new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 10);
const ok = (r: AfterDate | { ok: false; why: string }): AfterDate => {
  if (!r.ok) throw new Error(`no gap: ${r.why}`);
  return r;
};

// The reference's exact answer for monthly values with the date at the start of month `start`.
function reference(values: (number | null)[], start: number) {
  const pts = values.flatMap((v, i) => (v === null ? [] : [{ x: i, y: exactOf(v) }]));
  return referenceAfter(pts.filter((p) => p.x < start), pts.filter((p) => p.x >= start));
}

// Everything the code gives, held to the reference: exact where arithmetic is exact, a relative 1e-12 where a root or t is read.
function expectReference(values: (number | null)[], start: number) {
  const got = ok(afterDate(series(values), "month", monthStart(start)));
  const ref = reference(values, start);
  expect(got.before, "n").toBe(ref.n);
  expect(got.after, "m").toBe(ref.m);
  expect(got.slope, "slope").toBe(nearestDoubleOf(ref.slope));
  expect(got.expected, "expected").toBe(nearestDoubleOf(ref.expected));
  expect(got.actual, "actual").toBe(nearestDoubleOf(ref.actual));
  expect(got.gap, "gap").toBe(nearestDoubleOf(ref.gap));
  expect(got.spread, "spread").toBe(Math.sqrt(nearestDoubleOf(ref.s2)));
  expect(got.fits, "fits").toBe(ref.sse.num === 0n);
  const half = referenceHalf(ref.variance, ref.n - 2);
  expect(close(got.half, half, 1e-12), `half ${got.half} vs ${half}`).toBe(true);
  expect(got.lo).toBe(got.gap - got.half);
  expect(got.hi).toBe(got.gap + got.half);
  const range = ref.expected.num > 0n ? referenceShareRange(ref, ref.n - 2) : null;
  if (range) {
    const hundred = nearestDoubleOf({ num: ref.gap.num * 100n * ref.expected.den, den: ref.gap.den * ref.expected.num });
    expect(got.share!.gap, "share").toBe(hundred);
    // The ends are Fieller's interval for the ratio of the mean after to the trend's level, which counts the uncertainty of the level.
    const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * (Math.abs(b) + 1);
    expect(near(got.share!.lo, range.lo), `share low ${got.share!.lo} vs ${range.lo}`).toBe(true);
    expect(near(got.share!.hi, range.hi), `share high ${got.share!.hi} vs ${range.hi}`).toBe(true);
  } else expect(got.share, "no share of a level at or below 0, or not clearly above it").toBeNull();
  return got;
}

describe("before and after against NumPy and SciPy", () => {
  it.each(Object.entries(fixture.after))("%s: the line, the gap and its 80 % range equal NumPy's least squares, the covariance of the fit and SciPy's t quantile to a relative 1e-9", (name, c) => {
    const got = ok(afterDate(series(c.values), "month", monthStart(c.start)));
    const same = (a: number, b: number, what: string) => expect(close(a, b, 1e-9), `${name} ${what}: ${a} vs ${b}`).toBe(true);
    expect([got.before, got.after]).toEqual([c.n, c.m]);
    same(got.slope, c.slope, "slope");
    same(got.expected, c.expected, "where the trend pointed");
    same(got.actual, c.actual, "actual");
    same(got.gap, c.gap, "gap");
    same(got.half, c.half, "half");
    same(got.lo, c.lo, "low");
    same(got.hi, c.hi, "high");
    same(got.spread, c.spread, "spread");
    if (c.share === null) expect(got.share, name).toBeNull();
    else for (const k of ["gap", "lo", "hi"] as const) same(got.share![k], c.share[k], `share ${k}`);
    // And the reference, exactly.
    expectReference(c.values, c.start);
  });
  it("finds Anscombe's textbook line (y = 3.0001 + 0.5001 x, squared misses 13.7627) in the line before the date", () => {
    const c = fixture.after["anscombe-1"];
    expect(c.slope).toBeCloseTo(0.5001, 4);
    expect(c.intercept).toBeCloseTo(3.0001, 4);
    expect(c.sse).toBeCloseTo(13.7627, 3);
    expect(ok(afterDate(series(c.values), "month", monthStart(c.start))).spread).toBeCloseTo(Math.sqrt(13.7627 / 9), 4);
  });
  it("has the fixture made by the current script, naming its tools", () => {
    expect(Object.keys(fixture.tools).sort()).toEqual(["numpy", "scipy"]);
  });
});

describe("before and after, worked by hand", () => {
  it("is exactly 0 for values after the date on the line before it, and exactly the offset for values a whole offset above it", () => {
    // A line 100, 105, 110, … for 12 months: months after it are on the same line.
    const line = (i: number) => 100 + 5 * i;
    const on = Array.from({ length: 16 }, (_, i) => line(i));
    const got = ok(afterDate(series(on), "month", monthStart(12)));
    expect([got.gap, got.half, got.lo, got.hi, got.slope, got.fits]).toEqual([0, 0, 0, 0, 5, true]);
    const above = on.map((v, i) => (i >= 12 ? v + 37.25 : v));
    const r = ok(afterDate(series(above), "month", monthStart(12)));
    expect([r.gap, r.expected, r.actual, r.spread, r.half]).toEqual([37.25, 100 + 5 * 13.5, 100 + 5 * 13.5 + 37.25, 0, 0]);
    expect(r.share!.gap).toBe((37.25 / (100 + 5 * 13.5)) * 100);
  });
  it("works the gap out by hand for 4 values before and 2 after: the line through (0,1) (1,3) (2,2) (3,5) is 1.3 + 1.1 x, so at 4 and 5 it points to 5.7 and 6.8 (mean 6.25), and 8 and 9 give a gap of 2.25", () => {
    // Sxx = 5, Sxy = (−1.5)(−1.75) + (−0.5)(0.25) + (0.5)(−0.75) + (1.5)(2.25) = 2.625 − 0.125 − 0.375 + 3.375 = 5.5, slope 1.1; mean 1.5, 2.75 → intercept 2.75 − 1.65 = 1.1.
    const got = ok(afterDate(series([1, 3, 2, 5, 8, 9]), "month", monthStart(4)));
    expect(got.slope).toBeCloseTo(1.1, 14);
    // The line is 1.1 + 1.1 x: at 4.5 (the mean position after) it points to 6.05; the values after average 8.5, so the gap is 2.45.
    expect(got.expected).toBeCloseTo(6.05, 14);
    expect(got.gap).toBeCloseTo(2.45, 14);
    // Squared misses: the line gives 1.1, 2.2, 3.3, 4.4 for the four values: misses −0.1, 0.8, −1.3, 0.6: 0.01 + 0.64 + 1.69 + 0.36 = 2.7.
    expect(got.spread).toBeCloseTo(Math.sqrt(2.7 / 2), 14);
    // The range: t(0.9; 2) = 1.8856 · s · √(1/2 + 1/4 + (4.5 − 1.5)² ÷ 5) = 1.8856 · 1.1619 · √(0.75 + 1.8) = 1.8856 · 1.1619 · 1.5968.
    expect(got.half).toBeCloseTo(1.8856180831641267 * Math.sqrt(2.7 / 2) * Math.sqrt(0.75 + 9 / 5), 12);
  });
  it("says a share of the level only where the trend points above 0, and in the Metric's own unit otherwise", () => {
    const falling = fixture.after["falling-trend-below-zero"];
    expect(ok(afterDate(series(falling.values), "month", monthStart(falling.start))).share).toBeNull();
    const rising = fixture.after["planted-rise"];
    expect(ok(afterDate(series(rising.values), "month", monthStart(rising.start))).share).not.toBeNull();
  });
});

describe("before and after equals the reference on generated series (exact on the text, 1e-12 where a root and t are read)", () => {
  const value = fc.integer({ min: -2_000_000, max: 2_000_000 }).map((v) => v / 100);
  const maybe = fc.option(value, { nil: null, freq: 8 });
  // 3 to 30 months before the date and 1 to 12 after it, with some periods without a value.
  const generated = fc
    .record({ before: fc.array(value, { minLength: 3, maxLength: 30 }), gaps: fc.array(fc.nat({ max: 29 }), { maxLength: 4 }), after: fc.array(maybe, { minLength: 1, maxLength: 12 }), tail: value })
    .map(({ before, gaps, after, tail }) => {
      const b: (number | null)[] = before.map((v, i) => (gaps.includes(i) && i > 0 && i < before.length - 1 && before.length > 3 ? null : v));
      return { values: [...b, ...after, ...(after.every((v) => v === null) ? [tail] : [])], start: b.length };
    })
    .filter(({ values, start }) => values.slice(0, start).filter((v) => v !== null).length >= 3);
  it(`holds (${numRuns * 2} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(generated, ({ values, start }) => {
        expectReference(values, start);
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
  it("holds across 2 to 3 weeks, quarters, half-years, years and days: the position of a value is its place in the calendar, a gap a longer step", () => {
    const starts: Record<Span, (i: number) => string> = {
      day: (i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
      week: (i) => new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10),
      month: monthStart,
      quarter: (i) => new Date(Date.UTC(2024, 3 * i, 1)).toISOString().slice(0, 10),
      half: (i) => new Date(Date.UTC(2024, 6 * i, 1)).toISOString().slice(0, 10),
      year: (i) => new Date(Date.UTC(2024 + i, 0, 1)).toISOString().slice(0, 10),
    };
    const values: (number | null)[] = [12, 15, 14, null, 19, 21, 20, 25, null, 26, 31, 30, 41, 44, 39];
    for (const span of Object.keys(starts) as Span[]) {
      const points = values.flatMap((v, i) => (v === null ? [] : [{ period: starts[span](i), value: v }]));
      const split = 9;
      const got = ok(afterDate(points, span, starts[span](split)));
      const pts = values.flatMap((v, i) => (v === null ? [] : [{ x: i, y: exactOf(v) }]));
      const ref = referenceAfter(pts.filter((p) => p.x < split), pts.filter((p) => p.x >= split));
      expect([got.slope, got.gap, got.expected], span).toEqual([nearestDoubleOf(ref.slope), nearestDoubleOf(ref.gap), nearestDoubleOf(ref.expected)]);
    }
  });
});

describe("before and after, properties", () => {
  // Values are whole numbers of cents, so that adding, scaling and shifting them keeps their text exact.
  const cents = fc.integer({ min: -100_000, max: 100_000 });
  const arb = fc.record({ before: fc.array(cents, { minLength: 4, maxLength: 24 }), after: fc.array(cents, { minLength: 1, maxLength: 10 }) });
  const at = (before: number[], after: number[]) => ok(afterDate(series([...before, ...after].map((c) => c / 100)), "month", monthStart(before.length)));
  const props = (name: string, body: (c: { before: number[]; after: number[] }) => void) =>
    it(`${name} (${numRuns} series, seed ${seed})`, () => fc.assert(fc.property(arb, body), { numRuns, seed }));
  props("is unchanged by adding the same amount to every value, in the gap, its range and the miss", ({ before, after }) => {
    const [a, b] = [at(before, after), at(before.map((v) => v + 100_000), after.map((v) => v + 100_000))];
    expect([b.gap, b.half, b.spread, b.slope]).toEqual([a.gap, a.half, a.spread, a.slope]);
  });
  props("scales exactly with the values: four times the values give four times the gap, range and miss, and the same share", ({ before, after }) => {
    const [a, b] = [at(before, after), at(before.map((v) => v * 4), after.map((v) => v * 4))];
    expect([b.gap, b.half, b.spread, b.slope, b.lo, b.hi]).toEqual([4 * a.gap, 4 * a.half, 4 * a.spread, 4 * a.slope, 4 * a.lo, 4 * a.hi]);
    if (a.share) expect(b.share).toEqual(a.share);
  });
  props("is unchanged by adding a straight trend to every value (the line takes it up), except the slope, which rises by it", ({ before, after }) => {
    const bent = (v: number, i: number) => v + 300 * i;
    const [a, b] = [at(before, after), at(before.map((v, i) => bent(v, i)), after.map((v, i) => bent(v, before.length + i)))];
    expect([b.gap, b.half, b.spread]).toEqual([a.gap, a.half, a.spread]);
    expect(b.slope).toBeCloseTo(a.slope + 3, 9);
  });
  props("moves with what is added to the values after the date alone: the gap by that amount, the range not at all", ({ before, after }) => {
    const [a, b] = [at(before, after), at(before, after.map((v) => v + 25_000))];
    expect(b.half).toBe(a.half);
    expect(b.gap).toBeCloseTo(a.gap + 250, 9);
  });
  props("turns over with the values: negated values give the negated gap and the same range", ({ before, after }) => {
    const [a, b] = [at(before, after), at(before.map((v) => -v), after.map((v) => -v))];
    expect([b.gap, b.half, b.lo, b.hi]).toEqual([-a.gap, a.half, -a.hi, -a.lo]);
  });
  props("holds the gap within its range, with a range of no negative width", ({ before, after }) => {
    const a = at(before, after);
    expect(a.half).toBeGreaterThanOrEqual(0);
    expect(a.lo).toBeLessThanOrEqual(a.gap);
    expect(a.hi).toBeGreaterThanOrEqual(a.gap);
  });
  it(`gives the same bytes from the same input, from the input in any order, and with a period given twice (the last value counts) (${numRuns} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(arb, fc.integer(), ({ before, after }, shuffle) => {
        const points = series([...before, ...after].map((c) => c / 100));
        const date = monthStart(before.length);
        const first = JSON.stringify(afterDate(points, "month", date));
        expect(JSON.stringify(afterDate(points, "month", date))).toBe(first);
        const mixed = [...points].sort((x, y) => ((x.period.charCodeAt(9) * 31 + shuffle) % 7) - ((y.period.charCodeAt(9) * 31 + shuffle) % 7) || x.period.localeCompare(y.period)).reverse();
        const twice = [{ period: points[0].period, value: 12345.5 }, ...mixed, { period: points[1].period, value: points[1].value }, { period: points[0].period, value: points[0].value }];
        expect(JSON.stringify(afterDate(twice, "month", date))).toBe(first);
      }),
      { numRuns, seed },
    );
  });
  it("is the same for a Metric kept in any period when the values and their positions are the same (weekly equals monthly by position)", () => {
    const values = [12, 15, 14, 19, 21, 20, 25, 26, 31, 30, 41, 44];
    const week = (i: number) => new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10);
    const [m, w] = [ok(afterDate(series(values), "month", monthStart(8))), ok(afterDate(values.map((v, i) => ({ period: week(i), value: v })), "week", week(8)))];
    expect(w).toEqual(m);
  });
});

describe("the caution that the ups and downs carry over", () => {
  // Seeded series with a slow wave (carry-over 0.8) and without, 24 months before the date and 6 after.
  const stream = (start: number) => {
    let state = start;
    const next = () => (state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296) / 4_294_967_296;
    return () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
  };
  it("is said exactly where the misses of the line before the date carry over, in the Takeaway, with the Metric's name", () => {
    const z = stream(5);
    let [said, quiet] = [0, 0];
    for (let r = 0; r < 120; r++) {
      let e = 0;
      const v = Array.from({ length: 30 }, (_, i) => Math.round((100 + 1.5 * i + 7 * (e = (r % 2 ? 0.8 : 0) * e + z())) * 100) / 100);
      const raw = ok(afterDate(series(v), "month", monthStart(24)));
      const t = afterDateTakeaway("Signups", series(v), "month", monthStart(24), euro, ctx);
      const text = "The ups and downs of Signups carry over from one month to the next, which a change does too, but so does a slow wave; read this with care, since the range or the chance may be too sure.";
      expect(t.cautions.includes(text), `series ${r}`).toBe(raw.carries);
      if (raw.carries) said++;
      else quiet++;
    }
    expect(said).toBeGreaterThan(5);
    expect(quiet).toBeGreaterThan(5);
  });
});

describe("which periods are before and after a date", () => {
  const points = series([10, 11, 12, 13, 14, 15, 16, 17]);
  const counts = (date: string) => {
    const s = splitAt(points, "month", date)!;
    return [s.before.length, s.straddle?.period ?? null, s.after.length];
  };
  it("puts a period starting on the date after it, a period that holds the date in neither, and a period that ended before it before", () => {
    expect(counts("2024-05-01")).toEqual([4, null, 4]);
    expect(counts("2024-05-02")).toEqual([4, "2024-05-01", 3]);
    expect(counts("2024-05-31")).toEqual([4, "2024-05-01", 3]);
    expect(counts("2024-06-01")).toEqual([5, null, 3]);
    expect(counts("2024-04-30")).toEqual([3, "2024-04-01", 4]);
  });
  it("puts every period after a date before the first, and every period before a date after the last", () => {
    expect(counts("2023-12-31")).toEqual([0, null, 8]);
    expect(counts("2024-01-01")).toEqual([0, null, 8]);
    expect(counts("2024-08-31")).toEqual([7, "2024-08-01", 0]);
    expect(counts("2024-09-01")).toEqual([8, null, 0]);
  });
  it("holds the date to a day: not a day, a month that has no 31st, a time, a missing zero and a non-text are none", () => {
    for (const d of ["", "tomorrow", "2024-13-01", "2024-02-30", "2024-6-1", "2024-06-01T00:00", "24-06-01", "2024/06/01", " 2024-06-01", "2024-06-01 ", "2023-02-29", "0000-13-45"] as string[]) {
      expect(isDay(d), d).toBe(false);
      expect(splitAt(points, "month", d), d).toBeNull();
      expect(afterDate(points, "month", d)).toEqual({ ok: false, why: "date" });
    }
    // An array of one day reads as that day as text, and must not be taken for a text.
    for (const bad of [null, undefined, 20240601, {}, [], ["2024-06-01"], new String("2024-06-01")]) expect(isDay(bad)).toBe(false);
    for (const d of ["2024-02-29", "2024-12-31", "2000-02-29", "0001-01-01"]) expect(isDay(d), d).toBe(true);
    expect(isDay("1900-02-29")).toBe(false);
  });
  it("treats weeks and days by their own ends: a week holds the date from its Monday to its Sunday", () => {
    const weeks = Array.from({ length: 6 }, (_, i) => ({ period: new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10), value: i }));
    expect(splitAt(weeks, "week", "2024-01-15")!.after.length).toBe(4);
    expect(splitAt(weeks, "week", "2024-01-21")!.straddle?.period).toBe("2024-01-15");
    expect(splitAt(weeks, "week", "2024-01-22")!.before.length).toBe(3);
    const days = Array.from({ length: 5 }, (_, i) => ({ period: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), value: i }));
    expect(splitAt(days, "day", "2024-01-03")).toEqual({ before: days.slice(0, 2), after: days.slice(2), straddle: null });
  });
});

describe("before and after on hostile input", () => {
  it("is none for no values, one value, fewer than 3 before the date (one step either side), and none after it", () => {
    expect(afterDate([], "month", "2024-05-01")).toEqual({ ok: false, why: "before" });
    expect(afterDate(series([5]), "month", "2024-01-01")).toEqual({ ok: false, why: "before" });
    expect(afterDate(series([1, 2, 5, 6]), "month", monthStart(2))).toEqual({ ok: false, why: "before" });
    expect(afterDate(series([1, 2, 5, 6, 8]), "month", monthStart(3)).ok).toBe(true);
    expect(afterDate(series([1, 2, 3, 4]), "month", monthStart(4))).toEqual({ ok: false, why: "after" });
    expect(afterDate(series([1, 2, 3, 4, 5]), "month", monthStart(4)).ok).toBe(true);
  });
  it("leaves out values that are not numbers, counts a period twice once with the last value, and orders unsorted input", () => {
    const clean = series([4, 1, 3, 2, 9, 7, 8]);
    const dirty = [{ period: "2031-01-01", value: NaN }, ...[...clean].reverse(), { period: clean[0].period, value: 100 }, { period: clean[0].period, value: 4 }, { period: "2024-03-01", value: Infinity }];
    // The Infinity is for a period that has another value (given before it): the last value given counts, and Infinity is no value, so the earlier one stands.
    const date = monthStart(4);
    expect(afterDate(dirty.filter((p) => Number.isFinite(p.value)), "month", date)).toEqual(afterDate(clean, "month", date));
    expect(afterDate(dirty, "month", date)).toEqual(afterDate(clean, "month", date));
  });
  it("gives the exact right answer for huge and tiny values, and says so where a number is too large", () => {
    const big = ok(afterDate(series([1e10, 2e10, 3e10, 5e10, 4e10, 6e10, 7e10]), "month", monthStart(5)));
    expect(big.gap).toBe(nearestDoubleOf(reference([1e10, 2e10, 3e10, 5e10, 4e10, 6e10, 7e10], 5).gap));
    const tiny = ok(afterDate(series([1e-10, 2e-10, 3e-10, 5e-10, 4e-10, 6e-10, 7e-10]), "month", monthStart(5)));
    expect(tiny.gap).toBe(nearestDoubleOf(reference([1e-10, 2e-10, 3e-10, 5e-10, 4e-10, 6e-10, 7e-10], 5).gap));
    expect(afterDate(series([1e300, 2e300, 5e300, 3e300, 9e300, 1e301, 2e300]), "month", monthStart(5))).toEqual({ ok: false, why: "huge" });
    const flat = ok(afterDate(series([1.7e308, 1.7e308, 1.7e308, 1.7e308, 1.7e308, 1.7e308]), "month", monthStart(4)));
    expect(flat.gap).toBe(0);
  });
  it("is none for numbers too large to work out when the trend points to 0 or below too (no share is worked out then), and for a share of the trend that is not a number (a trend of 1e-300, values after of 1e300)", () => {
    expect(afterDate(series([-1e300, -2e300, -5e300, -3e300, -9e300, -1e301, -2e300]), "month", monthStart(5))).toEqual({ ok: false, why: "huge" });
    expect(afterDate(series([1e-300, 2e-300, 3e-300, 4e-300, 5e-300, 7e-300, 1e300, 2e300]), "month", "2024-07-01")).toEqual({ ok: false, why: "huge" });
  });
  it("gives no share where the trend points to exactly 0 (a share of 0 is no share), and the gap in the Metric's unit", () => {
    // The line 7 − position through 6 months points to 0 at the mean position after (7).
    const values = [7, 6, 5, 4, 3, 2, 1, 0.5, -0.5];
    const got = ok(afterDate(series(values), "month", monthStart(6)));
    expect([got.expected, got.share, got.fits]).toEqual([0, null, true]);
    expect(got.gap).toBe(1 / 3);
    const t = afterDateTakeaway("Debt", series(values), "month", monthStart(6), euro, ctx);
    expect(t.numbers.map((n) => n.label)).toEqual(["Method", "Date", "Periods before", "Periods after", "Trend before (per period)", "Where the trend pointed (average)", "What it was (average)", "Difference", "Likely between", "Typical miss"]);
  });
  it("is none where the share's ends are not numbers though the share is (a trend of 1e-100 scale, values after of 1e100)", () => {
    expect(afterDate(series([1e-100, 2e-100, 3e-100, 4e-100, 5e-100, 6e-100, 1e100, 1e100]), "month", "2024-07-01")).toEqual({ ok: false, why: "huge" });
  });
  it("gives the same range from the same fit however far a gap runs, since each value counts at its place in the calendar", () => {
    const withGap = ok(afterDate(series([5, 7, null, null, 11, 13, 17, 19, 23]), "month", monthStart(6)));
    const ref = reference([5, 7, null, null, 11, 13, 17, 19, 23], 6);
    expect(withGap.slope).toBe(nearestDoubleOf(ref.slope));
    expect(withGap.before).toBe(4);
  });
  it("is none for more than the most degrees of freedom the t curve is worked out for", () => {
    const long: Point[] = Array.from({ length: 100_004 }, (_, i) => ({ period: new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10), value: (i * 7919) % 101 }));
    // 100,002 values before the date are 100,000 degrees of freedom (the most); 100,003 are one more.
    expect(afterDate(long.slice(0, 100_003), "day", long[100_002].period).ok).toBe(true);
    expect(afterDate(long, "day", long[100_003].period)).toEqual({ ok: false, why: "huge" });
  });
});

const text = (t: ReturnType<typeof afterDateTakeaway>) => [t.sentence, t.refusal, t.basis, t.footer, ...t.cautions, ...t.notes, ...t.assumptions, ...t.numbers.flatMap((n) => [n.label, n.text])].filter((x): x is string => typeof x === "string");

describe("the Takeaway of a before-and-after look", () => {
  const noise = (i: number) => ((i * 37) % 11) - 5;
  const planted = (n: number, at: number, jump: number, base = 1000) => Array.from({ length: n }, (_, i) => base + 10 * i + 8 * noise(i) + (i >= at ? jump : 0));
  it("says a planted rise, with the range around it, as a share of where the trend pointed, and carries no strength word and the footer of its own", () => {
    const t = afterDateTakeaway("Signups", series(planted(24, 12, 150)), "month", monthStart(12), euro, ctx);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("After 1 Jan 2025, Signups ran about 12.0 % above where its trend pointed (likely between +8.1 % and +16.2 %; that range leaves out zero).");
    expect(t.range).toEqual({ lo: expect.closeTo(8.0586, 3), hi: expect.closeTo(16.1599, 3), text: "+8.1 % – +16.2 %" });
    expect([t.strength, t.strengthText]).toEqual([null, null]);
    expect(t.footer).toBe(FOOTER);
    expect(t.basis).toBe("from a straight line through the 12 months before 1 Jan 2025, compared with the 12 months since");
    expect(t.assumptions).toEqual(["This assumes the trend before 1 Jan 2025 would have carried on, and that the ups and downs since are as large as those before and do not carry over from one period to the next."]);
    expect(t.cautions).toEqual([]);
    expect(t.numbers.map((n) => [n.label, n.text])).toEqual([
      ["Method", "Before and after"], ["Date", "1 Jan 2025"], ["Periods before", "12"], ["Periods after", "12"], ["Trend before (per period)", "11 €"],
      ["Where the trend pointed (average)", "1,183 €"], ["What it was (average)", "1,324 €"], ["Difference", "142 €"], ["Likely between", "99 € – 185 €"],
      ["Difference as a share of the trend", "+8.1 % – +16.2 %"], ["Typical miss", "29 €"],
    ]);
    expect(t.figures.map((f) => [f.label, f.text])).toEqual([["Difference", "12.0 %"], ["Likely between (low)", "+8.1 %"], ["Likely between (high)", "+16.2 %"]]);
  });
  it("finds planted differences: the range holds the planted rise and fall, and excludes it for no planted change (the fixture's planted cases)", () => {
    for (const [name, c] of Object.entries(fixture.after)) {
      const t = afterDateTakeaway("Signups", series(c.values), "month", monthStart(c.start), euro, ctx);
      expect(t.kind, name).toBe("answer");
      const gap = c.share ? c.share.gap : c.gap;
      expect(t.range!.lo <= gap + 1e-9 * Math.abs(gap), name).toBe(true);
      expect(t.range!.hi >= gap - 1e-9 * Math.abs(gap), name).toBe(true);
    }
    const rise = afterDateTakeaway("Signups", series(planted(24, 12, 150)), "month", monthStart(12), euro, ctx);
    expect(rise.range!.lo).toBeGreaterThan(0);
    const fall = afterDateTakeaway("Signups", series(planted(24, 12, -150)), "month", monthStart(12), euro, ctx);
    expect(fall.sentence).toMatch(/ran about [\d.]+ % below where its trend pointed \(likely between −[\d.]+ % and −[\d.]+ %; that range leaves out zero\)\.$/);
    expect(fall.range!.hi).toBeLessThan(0);
    const none = afterDateTakeaway("Signups", series(planted(24, 12, 0)), "month", monthStart(12), euro, ctx);
    expect(none.range!.lo).toBeLessThan(0);
    expect(none.range!.hi).toBeGreaterThan(0);
    expect(none.sentence).toContain("that range includes zero");
  });
  it("says the gap in the Metric's unit when the trend points to 0 or below, and exactly where it is exactly on the trend", () => {
    const f = fixture.after["falling-trend-below-zero"];
    const t = afterDateTakeaway("Debt", series(f.values), "month", monthStart(f.start), euro, ctx);
    expect(t.sentence).toMatch(/^After 1 Jan 2025, Debt ran about \d+ € (above|below) where its trend pointed/);
    expect(t.numbers.map((n) => n.label)).not.toContain("Difference as a share of the trend");
    const level = afterDateTakeaway("Debt", series(Array.from({ length: 16 }, (_, i) => 100 + 5 * i)), "month", monthStart(12), euro, ctx);
    expect(level.sentence).toBe("After 1 Jan 2025, Debt ran exactly where its trend pointed (likely between ±0.0 % and ±0.0 %; that range includes zero).");
    expect(level.cautions).toEqual(["The values before 1 Jan 2025 lie exactly on a straight line, so the range has no spread to go by and may be too sure."]);
  });
  it("never writes a size that is not zero as zero, or loses its sign: a gap of 0.3 € is written 0.3 €, one of −0.004 € −0.004 €, in the range too", () => {
    const base = Array.from({ length: 12 }, (_, i) => 10 + 2 * i + (i % 3) * 0.01);
    const small = afterDateTakeaway("Fee", series([...base, 36.3, 38.3, 40.3, 42.3]), "month", monthStart(12), euro, ctx);
    const [size, low, high] = small.figures.map((f) => f.text);
    for (const x of [size, low, high]) expect(x, x).toMatch(/[1-9]/);
    expect(small.figures[0].value).toBeGreaterThan(0);
    // A level of 0 € or below keeps the unit: write the gap in it, with as many decimals as it takes.
    const tinyUnit = afterDateTakeaway("Fee", series([...base.map((v) => v - 100), -64.004, -62.004, -60.004, -58.004]), "month", monthStart(12), { unit: "€", unit_position: "after", decimals: 0 }, ctx);
    expect(tinyUnit.figures.every((f) => /[1-9]/.test(f.text) || f.value === 0)).toBe(true);
    expect(tinyUnit.range!.text).toMatch(/[−+]/);
  });
  it("sets a comparison Metric beside it, with its own gap and range, and says when something else may have moved both", () => {
    const own = series(planted(24, 12, 150));
    const flat = series(Array.from({ length: 24 }, (_, i) => 500 + 5 * i + 6 * noise(i + 3)));
    const t = afterDateTakeaway("Signups", own, "month", monthStart(12), euro, ctx, { name: "Visits", points: flat, unit: euro });
    expect(t.sentence).toMatch(/^After 1 Jan 2025, Signups ran about 12\.0 % above .* Set beside it, Visits ran .* where its trend pointed/);
    expect(t.cautions).toEqual([]);
    expect(t.numbers.filter((n) => n.label.startsWith("Visits: ")).length).toBe(9);
    const moved = series(Array.from({ length: 24 }, (_, i) => 500 + 5 * i + 6 * noise(i + 3) + (i >= 12 ? 120 : 0)));
    const t2 = afterDateTakeaway("Signups", own, "month", monthStart(12), euro, ctx, { name: "Visits", points: moved, unit: euro });
    expect(t2.cautions).toEqual(["Visits, set beside it, also ran outside the same range around its own trend, which chance alone gives about 1 time in 5, so something else may have moved both, or it may be chance."]);
    expect(t2.footer).toBe(FOOTER);
  });
  it("says nothing of a Metric set beside it that ran exactly where its trend pointed, and carries the notes and cautions of the Metric set beside it", () => {
    const own = series(planted(24, 12, 150));
    const online = afterDateTakeaway("Signups", own, "month", monthStart(12), euro, ctx, { name: "Visits", points: series(Array.from({ length: 24 }, (_, i) => 500 + 5 * i)), unit: euro });
    expect(online.sentence).toMatch(/Set beside it, Visits ran exactly where its trend pointed \(likely between ±0.0 % and ±0.0 %; that range includes zero\)\.$/);
    expect(online.cautions).toEqual(["The values before 1 Jan 2025 lie exactly on a straight line, so the range has no spread to go by and may be too sure."]);
    // A date inside a month: both leave that month out, and the Metric set beside it has two months without a value.
    const gappy = series(Array.from({ length: 24 }, (_, i): number | null => (i === 3 || i === 7 ? null : 500 + 5 * i + 6 * noise(i + 3))));
    const t = afterDateTakeaway("Signups", own, "month", "2025-01-15", euro, ctx, { name: "Visits", points: gappy, unit: euro });
    expect(t.cautions).toEqual(["Visits: no value for 2 of 24 months, left out."]);
    expect(t.notes).toEqual(["The month of January 2025 began before 15 Jan 2025, so it is left out.", "The month of January 2025 began before 15 Jan 2025, so it is left out."]);
  });
  it("says when the comparison cannot be set beside it, and still gives the answer for the Metric asked about", () => {
    const own = series(planted(24, 12, 150));
    const flat = afterDateTakeaway("Signups", own, "month", monthStart(12), euro, ctx, { name: "Visits", points: series([1, 2, 3]), unit: euro });
    expect(flat.kind).toBe("answer");
    expect(flat.notes).toEqual(["Visits could not be set beside it.", "Not enough months yet: 3 of 6 needed."]);
    expect(flat.sentence).not.toContain("Visits");
  });
  it("is a refusal in words, with no number, strength, range or footer, for no day, too few periods before the date, none after it, a series that hardly changes and too many gaps", () => {
    const refusal = (t: ReturnType<typeof afterDateTakeaway>) => {
      expect(t.kind).toBe("refusal");
      expect([t.sentence, t.range, t.strength, t.footer, t.basis]).toEqual([null, null, null, null, null]);
      expect(t.figures).toEqual([]);
      return t.refusal;
    };
    expect(refusal(afterDateTakeaway("A", series(planted(24, 12, 150)), "month", "2025-02-30", euro, ctx))).toBe("That date is not a day, so nothing can be compared before and after it.");
    expect(refusal(afterDateTakeaway("A", series(planted(24, 12, 150)), "month", "2027-01-01", euro, ctx))).toBe("A has no value on or after 1 Jan 2027 yet, so there is nothing to compare.");
    expect(refusal(afterDateTakeaway("A", series(planted(10, 5, 150)), "month", monthStart(5), euro, ctx))).toBe("Not enough months yet: 5 of 6 needed.");
    expect(afterDateTakeaway("A", series(planted(10, 6, 150)), "month", monthStart(6), euro, ctx).kind).toBe("answer");
    expect(refusal(afterDateTakeaway("A", series(Array.from({ length: 20 }, () => 7)), "month", monthStart(10), euro, ctx))).toBe("A has hardly changed, so there is nothing to compare.");
    const gappy = planted(24, 12, 150).map((v, i): number | null => (i % 4 === 1 ? null : v));
    expect(refusal(afterDateTakeaway("A", series(gappy), "month", monthStart(12), euro, ctx))).toMatch(/^A: no value for 6 of 24 months, too many to go on\./);
    expect(refusal(afterDateTakeaway("A", series([1e300, 2e300, 5e300, 3e300, 9e300, 1e301, 2e300, 4e300]), "month", monthStart(6), euro, ctx))).toBe("The values of A are too large to work out a range from.");
  });
  it("says so, in words, when a number is too large to work out a share from, or a difference too small to write out, and writes a number of Show the numbers that no digit could show in scientific form", () => {
    const refusal = (values: number[], unit = euro) => afterDateTakeaway("A", series(values), "month", "2024-07-01", unit, ctx).refusal;
    // Trend values tiny, values after huge: the share of the trend (1e300 ÷ 1e-300 as a percentage) cannot be a number.
    expect(refusal([1e-300, 2e-300, 3e-300, 4e-300, 5e-300, 7e-300, 1e300, 2e300])).toBe("The values of A are too large to work out a range from.");
    // A trend at or below 0 so the gap is in the unit, and it is 1e-30: even 20 decimals show nothing.
    expect(refusal([-1e-30, -2e-30, -3e-30, -4e-30, -5e-30, -6e-30, -7.5e-30, -8e-30])).toBe("A: the difference is too small to write out.");
    // A line with a miss of 1e-25 (the first value is off it by that): the typical miss is written as 2.50e-25 style, not as 0.
    const t = afterDateTakeaway("A", series([1e-25, 1, 2, 3, 4, 5, 7, 8, 9]), "month", "2024-07-01", euro, ctx);
    expect(t.kind).toBe("answer");
    const miss = t.numbers.find((n) => n.label === "Typical miss")!.text;
    expect(miss).toMatch(/^\d\.\d\de-\d+ €$/);
    expect(t.numbers.find((n) => n.label === "Trend before (per period)")!.text).toBe("1 €");
  });
  it("uses the first 120 periods since the date, and says so (a date years back would average a long, far extrapolation of the line)", () => {
    const long = Array.from({ length: 12 + 130 }, (_, i) => 100 + 2 * i + 9 * noise(i) + (i >= 12 ? 40 : 0));
    const t = afterDateTakeaway("A", series(long), "month", monthStart(12), euro, ctx);
    expect(t.notes).toEqual(["Only the first 120 months with a value since 1 Jan 2025 are used."]);
    const cut = afterDateTakeaway("A", series(long).slice(0, 12 + 120), "month", monthStart(12), euro, ctx);
    expect(t.sentence).toBe(cut.sentence);
    expect(t.basis).toContain("compared with the 120 months since");
    expect(cut.notes).toEqual([]);
  });
  it("says no share where the level the trend points to is not clearly above 0 (the ratio has no finite range), though the gap and its range stand", () => {
    const values = [-4, 5, -5, 4, -3, 6, -2, 7, 1, 0, 2];
    const got = ok(afterDate(series(values), "month", monthStart(8)));
    expect(got.expected).toBeGreaterThan(0);
    expect(got.share).toBeNull();
    expect(got.half).toBeGreaterThan(Math.abs(got.expected));
    expect(afterDateTakeaway("A", series(values), "month", monthStart(8), euro, ctx).numbers.map((n) => n.label)).not.toContain("Difference as a share of the trend");
  });
  it("counts the uncertainty of the level the share is a share of: its range is wider than the gap's range over the level, and asymmetric", () => {
    const c = fixture.after["no-change"];
    const got = ok(afterDate(series(c.values), "month", monthStart(c.start)));
    const naive = (got.half / got.expected) * 100;
    expect(got.share!.hi - got.share!.gap).toBeGreaterThan(naive);
    expect(got.share!.hi - got.share!.gap).not.toBeCloseTo(got.share!.gap - got.share!.lo, 3);
  });
  it("says what the range is, and never \"clear\": the false rate of a range that leaves out zero is about 1 in 5 for series with no change (400 and the 80 % range)", () => {
    let state = 31;
    const next = () => (state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296) / 4_294_967_296;
    const gauss = () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
    let [outside, said] = [0, 0];
    for (let r = 0; r < 1500; r++) {
      const v = Array.from({ length: 24 }, (_, i) => Math.round((100 + 1.5 * i + 7 * gauss()) * 100) / 100);
      const t = afterDateTakeaway("A", series(v), "month", monthStart(12), euro, ctx);
      if (t.kind === "refusal") continue;
      if (t.range!.lo > 0 || t.range!.hi < 0) {
        outside++;
        if (t.sentence!.includes("leaves out zero")) said++;
      } else expect(t.sentence).toContain("that range includes zero");
      expect(t.sentence).not.toMatch(/clear/i);
    }
    expect(said).toBe(outside);
    expect(outside / 1500).toBeGreaterThan(0.15);
    expect(outside / 1500).toBeLessThan(0.25);
  });
  it("holds the minimum to the periods before the date that the line is fitted to, in the sentence, the basis and the numbers alike (6 either side of the limit, with a gap and a period holding the date)", () => {
    // 7 months with a value, one of them the month that holds the date: 6 before.
    const v = [5, 9, 7, 12, 10, 14, 13, 16, 20, 22];
    const with6 = afterDateTakeaway("A", series(v), "month", "2024-07-15", euro, ctx);
    expect(with6.kind).toBe("answer");
    expect(with6.notes).toEqual(["The month of July 2024 began before 15 Jul 2024, so it is left out."]);
    // The period that holds the date has a value, which the checks count: it is not a gap.
    expect(with6.cautions).toEqual([]);
    expect(with6.basis).toBe("from a straight line through the 6 months before 15 Jul 2024, compared with the 3 months since");
    expect(with6.numbers.filter((n) => n.label === "Periods before" || n.label === "Periods after").map((n) => n.text)).toEqual(["6", "3"]);
    const with5 = afterDateTakeaway("A", series(v), "month", "2024-06-15", euro, ctx);
    expect(with5.refusal).toBe("Not enough months yet: 5 of 6 needed.");
  });
  it("uses the latest 120 periods before the date, and says so, giving what the 120 give", () => {
    const long = Array.from({ length: 150 }, (_, i) => 100 + 2 * i + 9 * noise(i) + (i >= 130 ? 40 : 0));
    const t = afterDateTakeaway("A", series(long), "month", monthStart(130), euro, ctx);
    expect(t.notes).toEqual(["Only the latest 120 months with a value before 1 Nov 2034 are used."]);
    expect(MAX_PERIODS).toBe(120);
    const cut = afterDateTakeaway("A", series(long).slice(10), "month", monthStart(130), euro, ctx);
    expect(t.sentence).toBe(cut.sentence);
    expect(t.basis).toBe(cut.basis);
    expect(afterDateTakeaway("A", series(long).slice(11), "month", monthStart(130), euro, ctx).notes).toEqual([]);
  });
  it("writes numbers in the Number Style and the Metric's unit and period, and no forbidden word anywhere", () => {
    const de = { style: "1.234,5" as const };
    const t = afterDateTakeaway("Umsatz", series(planted(24, 12, 150)), "month", monthStart(12), { unit: "€", unit_position: "after", decimals: 2 }, de);
    expect(t.sentence).toContain("12,0 %");
    expect(t.numbers.find((n) => n.label === "What it was (average)")!.text).toBe(`${formatValue({ unit: "€", unit_position: "after", decimals: 2 }, 1324.33, de.style)}`);
    for (const x of text(t)) expect(x).not.toMatch(FORBIDDEN);
    const quarters = [5, 7, 6, 9, 8, 11, 10, 13, 14, 12, 15, 17].map((value, i) => ({ period: new Date(Date.UTC(2024, 3 * i, 1)).toISOString().slice(0, 10), value }));
    const q = afterDateTakeaway("Sales", quarters, "quarter", "2026-01-01", euro, ctx);
    expect(q.basis).toBe("from a straight line through the 8 quarters before 1 Jan 2026, compared with the 4 quarters since");
  });
  it("carries the same numbers in the sentence as the Method gave (the gap's size, and both ends of its range, as the figures)", () => {
    const c = fixture.after["planted-rise"];
    const t = afterDateTakeaway("Signups", series(c.values), "month", monthStart(c.start), euro, ctx);
    for (const f of t.figures) expect(t.sentence, f.label).toContain(f.text);
    const share = c.share!;
    expect(t.figures[0].value).toBeCloseTo(share.gap, 9);
    expect(t.figures[1].value).toBeCloseTo(share.lo, 9);
    expect(t.figures[2].value).toBeCloseTo(share.hi, 9);
  });
});
