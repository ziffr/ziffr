// Heads-ups about one Metric (spec 0041, ticket 15): the chances behind a change of direction, a Target out of reach and a value unusual
// for its season held to SciPy and NumPy (fixtures/heads-up-single.py), to references written from the definitions (reference/
// heads-up-single.ts) and to numbers worked by hand; each condition one step either side of its threshold; hostile input; the words,
// the footers, the numbers a sentence uses; that nothing depends on a Metric that is not given; and the same looks in any order give the
// same Heads-ups.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nearest } from "../exact";
import { metric } from "../test/fixtures";
import { runs } from "../test/reference/check";
import { FIXTURE, HASHES } from "../test/reference/heads-up-single-fixture";
import { referenceBelow, referenceChangeChance, referenceLine, referenceMinus, referenceNewValue, referenceTwoSample, toNumber } from "../test/reference/heads-up-single";
import type { Point } from "../types";
import { changePoint } from "./change-point";
import { carryOf } from "./carry-over";
import { usualRange } from "./quantiles";
import { changeChance, driftAbove, holds, isCurrent, testsOf, driftBelow, farApart, lineAbove, lineAt, lineBelow, newValueChance, onTheSide, reaches, recentDate, shiftChance, singleHeadsUpsFrom, SINGLE, targetHeadsUp, turned, wasOnPace, twoLinesMisses, unlikelyToReach, type SingleContext, type SingleLook } from "./heads-up-single";

const { numRuns, seed } = runs();
const month = (k: number) => new Date(Date.UTC(2020, k, 1)).toISOString().slice(0, 10);
const series = (values: number[]): Point[] => values.map((value, k) => ({ period: month(k), value }));
const near = (got: number, want: number, rel = 1e-9, abs = 1e-300) => Math.abs(got - want) <= rel * Math.abs(want) + abs;

describe("the SciPy fixture", () => {
  it("was made by the current script (heads-up-single.py), and names the tools", () => {
    expect(HASHES.fixture, "run python3 packages/core/src/test/reference/fixtures/heads-up-single.py again").toBe(HASHES.script);
    expect(FIXTURE.version).toBe(1);
    expect(Object.keys(FIXTURE.tools).sort()).toEqual(["numpy", "python", "scipy"]);
  });
});

describe("a straight line through the latest values, read at a later period", () => {
  it("gives the value and its variance as NumPy's polyfit does, and the chance of being as far below or above a bound as SciPy's Student t does, over the whole fixture", () => {
    expect(FIXTURE.lines.length).toBeGreaterThan(100);
    for (const c of FIXTURE.lines) {
      // The fixture is the plain Student t: the allowance for misses that follow their own past is tested below.
      const line = { ...lineAt(series(c.values), "month", month(c.at)), follow: 0 };
      const label = `${c.values.length} values, at ${c.at}, bound ${c.bound}`;
      expect(near(nearest(line.at), c.yhat, 1e-9, 1e-9), `${label}: value ${nearest(line.at)} against ${c.yhat}`).toBe(true);
      expect(near(nearest(line.spread2), c.var, 1e-9, 1e-12), `${label}: variance ${nearest(line.spread2)} against ${c.var}`).toBe(true);
      expect(near(lineBelow(line, c.bound), c.below, 1e-9, 1e-14), `${label}: below ${lineBelow(line, c.bound)} against ${c.below}`).toBe(true);
      expect(near(lineAbove(line, c.bound), c.above, 1e-9, 1e-14), `${label}: above ${lineAbove(line, c.bound)} against ${c.above}`).toBe(true);
      // The same Target read from the changes alone: SciPy's t on the mean change against what it takes to meet the bound from the last value.
      const rows = series(c.values);
      expect(near(driftBelow(rows, "month", month(c.at), c.bound), c.driftBelow, 1e-9, 1e-14), `${label}: drift below ${driftBelow(rows, "month", month(c.at), c.bound)} against ${c.driftBelow}`).toBe(true);
      expect(near(driftAbove(rows, "month", month(c.at), c.bound), c.driftAbove, 1e-9, 1e-14), `${label}: drift above ${driftAbove(rows, "month", month(c.at), c.bound)} against ${c.driftAbove}`).toBe(true);
    }
  });
  it("reads a Target from the changes alone: worked by hand (changes 2, 4, 6 over places 0 to 3 from 0, so last is 12 and the mean change 4), the change per period it takes to reach 20 three periods on is 8/3", () => {
    // Values 0, 2, 6, 12; changes 2, 4, 6: mean 4, s = 2, se = 2/√3; needed (20 - 12) ÷ 3 = 8/3; short = 4 - 8/3 = 4/3 ≥ 0 so the chance is above 1/2.
    const rows = series([0, 2, 6, 12]);
    // With 2 degrees of freedom P(T ≤ t) = 1/2 + t ÷ (2·√(2 + t²)), t = (4/3) ÷ (2/√3) = 2/√3.
    const t = 2 / Math.sqrt(3);
    expect(driftBelow(rows, "month", month(6), 20)).toBeCloseTo(0.5 + t / (2 * Math.sqrt(2 + t * t)), 12);
    // An upper end of 20: it takes at most 8/3 a period, the mean 4 is above it: short = 8/3 - 4 = -4/3.
    expect(driftAbove(rows, "month", month(6), 20)).toBeCloseTo(0.5 - t / (2 * Math.sqrt(2 + t * t)), 12);
  });
  it("is 1 with fewer than 2 changes, 0 or 1 where the changes are all the same, and leaves out a change across a gap", () => {
    expect(driftBelow(series([1, 2]), "month", month(5), 100)).toBe(1);
    const steady = series([10, 12, 14, 16, 18]);
    expect([driftBelow(steady, "month", month(6), 100), driftBelow(steady, "month", month(6), 20), driftAbove(steady, "month", month(6), 20), driftAbove(steady, "month", month(6), 100)]).toEqual([0, 1, 0, 1]);
    // Changes exactly as large as it takes (2 a period to reach 22 from 18 in 2 periods): not short.
    expect(driftBelow(steady, "month", month(6), 22)).toBe(1);
    expect(driftAbove(steady, "month", month(6), 22)).toBe(1);
    expect(driftBelow(steady.filter((_, i) => i !== 2), "month", month(6), 100)).toBeLessThan(1);
    expect(driftBelow(steady.filter((_, i) => i !== 1 && i !== 3), "month", month(6), 100)).toBe(1);
  });
  it("is the exact least-squares line: the numbers worked by hand (1, 3, 2, 4 at places 0 to 3, read at 4: value 4.5, variance 27/20)", () => {
    const line = lineAt(series([1, 3, 2, 4]), "month", month(4));
    // slope 4/5, intercept 1.1, SSE 9/5, s² = 9/10, 1/4 + (5/2)²/5 = 3/2: the variance is 27/20.
    expect(line.at).toEqual({ num: BigInt(9), den: BigInt(2) });
    expect(line.spread2).toEqual({ num: BigInt(27), den: BigInt(20) });
    expect(line.n).toBe(4);
  });
  it("counts the periods for fewer where the misses follow their own past: the variance (1 + ρ) ÷ (1 - ρ) times larger, and n · (1 - ρ) ÷ (1 + ρ) less 2 degrees of freedom, rounded down", () => {
    const plain = { ...lineAt(series([1, 3, 2, 4, 3, 5, 4, 6]), "month", month(10)), follow: 0 };
    // ρ = 1/3: 8 · (2/3) ÷ (4/3) = 4 periods count, 2 degrees of freedom; the variance is twice as large.
    const follows = { ...plain, follow: 1 / 3 };
    const short = nearest(plain.at) - 100;
    const t = (v: number) => v / Math.sqrt(nearest(plain.spread2) * 2);
    // With 2 degrees of freedom, P(T ≤ t) = 1/2 + t ÷ (2 · √(2 + t²)).
    const t2 = (x: number) => 0.5 + x / (2 * Math.sqrt(2 + x * x));
    expect(lineBelow(follows, 100)).toBeCloseTo(t2(t(short)), 12);
    // Fewer than 3 periods worth counting: no chance to speak of; the line's own chance is smaller than the one that allows for the past.
    expect(lineBelow({ ...plain, follow: 0.7 }, 100)).toBe(1);
    expect(lineBelow(plain, 100)).toBeLessThan(lineBelow(follows, 100));
    // 8 periods at ρ = 0.4: 8 · 0.6 ÷ 1.4 = 3.4, 3 less 2 is 1 degree of freedom; at ρ = 0.5: 8 · 0.5 ÷ 1.5 = 2.67, 2 less 2 is 0: none.
    expect(lineBelow({ ...plain, follow: 0.4 }, 100)).toBeLessThan(1);
    expect(lineBelow({ ...plain, follow: 0.5 }, 100)).toBe(1);
  });
  it("measures how its misses follow their own past: about 0 for a line through ups and downs, near 1 for a wave, and the same flag the carry-over check gives", () => {
    const [alternating, wave] = [lineAt(series([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), "month", month(12)), lineAt(series([0, 3, 5, 6, 5, 3, 0, -3, -5, -6, -5, -3, 0, 3, 5, 6]), "month", month(18))];
    expect([alternating.follow, alternating.carries]).toEqual([0, false]);
    expect(wave.follow).toBeGreaterThan(0.5);
    expect(wave.carries).toBe(true);
  });
  it("is certain where the line has no miss at all: 0 below a bound above its value, 1 at or above it, and the same the other way for 'above'", () => {
    const line = lineAt(series([10, 12, 14, 16, 18, 20, 22, 24]), "month", month(10));
    // The line is 10 + 2k, at place 10 it is 30.
    expect(nearest(line.at)).toBe(30);
    expect([lineBelow(line, 31), lineBelow(line, 30), lineBelow(line, 29)]).toEqual([0, 1, 1]);
    expect([lineAbove(line, 29), lineAbove(line, 30), lineAbove(line, 31)]).toEqual([0, 1, 1]);
  });
  it("agrees with a reference worked out from the normal equations on exact fractions and from the density of Student's t, over generated series", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -2000, max: 2000 }), { minLength: 4, maxLength: 24 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: -2500, max: 2500 }), (cents, ahead, boundCents) => {
        const values = cents.map((c) => c / 100);
        if (new Set(values).size < 3) return;
        const at = values.length - 1 + ahead;
        const line = { ...lineAt(series(values), "month", month(at)), follow: 0 };
        const ref = referenceLine(values, at);
        expect(near(nearest(line.at), toNumber(ref.yhat), 1e-12, 1e-12)).toBe(true);
        expect(near(nearest(line.spread2), toNumber(ref.variance), 1e-12, 1e-12)).toBe(true);
        const bound = boundCents / 100;
        const got = lineBelow(line, bound);
        const want = referenceBelow(ref, bound, values.length - 2);
        expect(Math.abs(got - want) <= 1e-7 * want + 1e-12, `below ${got} against ${want}`).toBe(true);
        // Above is below the other way round: the same line seen upside down.
        const flipped = { ...lineAt(series(values.map((v) => -v)), "month", month(at)), follow: 0 };
        expect(Math.abs(lineAbove(line, bound) - lineBelow(flipped, -bound)) <= 1e-9).toBe(true);
      }),
      { numRuns, seed },
    );
  });
  it("does not change when every value is scaled or shifted: the chance is the same for a line in dollars or cents, and the value moves with it", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -500, max: 500 }), { minLength: 5, maxLength: 20 }), fc.integer({ min: 2, max: 9 }), fc.integer({ min: -400, max: 400 }), (ints, scale, shift) => {
        if (new Set(ints).size < 3) return;
        const [a, b] = [ints, ints.map((v) => v * scale + shift)];
        const at = a.length + 2;
        const [la, lb] = [lineAt(series(a), "month", month(at)), lineAt(series(b), "month", month(at))];
        expect(lb.follow).toBeCloseTo(la.follow, 9);
        expect(nearest(lb.at)).toBeCloseTo(nearest(la.at) * scale + shift, 6);
        expect(near(lineBelow(lb, 0 * scale + shift), lineBelow(la, 0), 1e-9, 1e-14)).toBe(true);
      }),
      { numRuns, seed },
    );
  });
});

describe("a new value against earlier ones at the same place in the season", () => {
  it("is SciPy's two-sided Student t at |latest - mean| ÷ (s · √(1 + 1/k)) with k - 1 degrees of freedom, over the whole fixture", () => {
    expect(FIXTURE.fresh.length).toBeGreaterThan(20);
    for (const c of FIXTURE.fresh) {
      const got = newValueChance(c.earlier, c.latest);
      expect(near(got, c.p, 1e-9, 1e-14), `${c.earlier} then ${c.latest}: ${got} against SciPy's ${c.p}`).toBe(true);
    }
  });
  it("is the arctangent for 1 degree of freedom, worked by hand: earlier 10 and 12, latest 20 is 1 - (2/π)·atan(9/√3)", () => {
    expect(newValueChance([10, 12], 20)).toBeCloseTo(1 - (2 / Math.PI) * Math.atan(9 / Math.sqrt(3)), 12);
    // …and 2 degrees of freedom is 1 - t ÷ √(2 + t²): earlier 10, 12, 14 and latest 20 is t = 8 ÷ (2 · √(4/3)) = 2√3.
    expect(newValueChance([10, 12, 14], 20)).toBeCloseTo(1 - (2 * Math.sqrt(3)) / Math.sqrt(2 + 12), 12);
  });
  it("is 1 where the earlier values are all the same (no spread to judge by), and where the latest is the mean", () => {
    expect(newValueChance([100, 100, 100], 120)).toBe(1);
    expect(newValueChance([100, 110], 105)).toBe(1);
  });
  it("is the same in either direction, and agrees with a reference from the definition, over generated values", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -3000, max: 3000 }), { minLength: 2, maxLength: 12 }), fc.integer({ min: -4000, max: 4000 }), (cents, latestCents) => {
        const earlier = cents.map((c) => c / 100);
        const latest = latestCents / 100;
        const got = newValueChance(earlier, latest);
        expect(Math.abs(got - referenceNewValue(earlier, latest)) <= 1e-7 * got + 1e-12).toBe(true);
        const mean = earlier.reduce((s, v) => s + v, 0) / earlier.length;
        // A mirror image around the mean has the same chance (up to the mean not being exact in doubles).
        expect(Math.abs(newValueChance(earlier.map((v) => 2 * mean - v), 2 * mean - latest) - got) <= 1e-6).toBe(true);
        expect(got).toBeGreaterThanOrEqual(0);
        expect(got).toBeLessThanOrEqual(1);
      }),
      { numRuns, seed },
    );
  });
});

describe("the chance of a change of direction by luck", () => {
  it("is the change point's F ratio times the dates tried, as SciPy's F distribution gives it, over the whole fixture, with the same date", () => {
    expect(FIXTURE.changes.length).toBeGreaterThan(20);
    for (const c of FIXTURE.changes) {
      const cp = changePoint(series(c.values), "month");
      if (!cp.ok) throw new Error("no change point");
      expect(cp.index, `${c.values}`).toBe(c.index);
      expect(cp.tries).toBe(c.tries);
      expect(near(changeChance(cp), c.p, 1e-8, 1e-300), `${c.values}: ${changeChance(cp)} against SciPy's ${c.p}`).toBe(true);
    }
  });
  it("is joined by the chance that the mean change per period differs before and after the date, SciPy's pooled t-test of the changes, over the whole fixture", () => {
    for (const c of FIXTURE.changes) {
      const cp = changePoint(series(c.values), "month");
      if (!cp.ok) throw new Error("no change point");
      const got = shiftChance(series(c.values), "month", cp.index);
      expect(near(got, c.shift, 1e-8, 1e-300), `${c.values}: ${got} against SciPy's ${c.shift}`).toBe(true);
    }
  });
  it("agrees with a reference that works the changes out one by one, over generated series and dates", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -3000, max: 3000 }), { minLength: 8, maxLength: 30 }), fc.nat(), (cents, pick) => {
        const values = cents.map((c) => c / 100);
        const index = 4 + (pick % (values.length - 7));
        const d = values.slice(1).map((v, i) => referenceMinus(v, values[i]));
        // The change into period j is d[j - 1]: before the date, periods 1..index-1; after, index+1..n-1.
        const want = referenceTwoSample(d.slice(0, index - 1), d.slice(index));
        expect(near(shiftChance(series(values), "month", index), want, 1e-8, 1e-300), `${values} at ${index}`).toBe(true);
      }),
      { numRuns, seed },
    );
  });
  it("is worked out with exactly 2 changes a side, and where one side's changes are all the same (the other's are not)", () => {
    const two = [0, 1, 3, 6, 10, 15];
    const refOf = (vals: number[], index: number) => { const d = vals.slice(1).map((v, i) => referenceMinus(v, vals[i])); return referenceTwoSample(d.slice(0, index - 1), d.slice(index)); };
    expect(shiftChance(series(two), "month", 3)).toBeCloseTo(refOf(two, 3), 12);
    expect(shiftChance(series(two), "month", 3)).toBeLessThan(1);
    // One change after the date is too few; so is one before it.
    expect(shiftChance(series([0, 1, 3, 6, 10, 15]), "month", 4)).toBe(1);
    expect(shiftChance(series([0, 1, 3, 6, 10, 15]), "month", 2)).toBe(1);
    const flatAfter = [0, 3, 8, 15, 16, 17];
    expect(shiftChance(series(flatAfter), "month", 3)).toBeCloseTo(refOf(flatAfter, 3), 12);
    expect(shiftChance(series(flatAfter), "month", 3)).toBeGreaterThan(0);
    const oneFlat = [0, 1, 2, 3, 6, 11];
    expect(shiftChance(series(oneFlat), "month", 3)).toBeCloseTo(refOf(oneFlat, 3), 12);
    expect(shiftChance(series(oneFlat), "month", 3)).toBeGreaterThan(0);
  });
  it("is 1 with fewer than 2 changes on a side, 0 where each side's changes are all the same and the two sides differ, 1 where they do not, and leaves out the change that spans the date", () => {
    expect(shiftChance(series([1, 2, 3, 4]), "month", 1)).toBe(1);
    expect(shiftChance(series([1, 2, 3, 4, 5]), "month", 3)).toBe(1);
    expect(shiftChance(series([0, 1, 2, 3, 4, 3, 2, 1, 0]), "month", 4)).toBe(0);
    expect(shiftChance(series([0, 1, 2, 3, 4, 5, 6, 7, 8]), "month", 4)).toBe(1);
    // The change into the date's own period (the 100 jump) belongs to neither side.
    expect(shiftChance(series([0, 1, 2, 3, 103, 104, 105, 106, 107]), "month", 4)).toBe(1);
    // A gap breaks a change: values at places 0 1 2 _ 4 5 6 7 8 give 6 changes and the one across the gap is none.
    const gapped = series([0, 1, 2, 3, 4, 5, 6, 7, 8]).filter((p) => p.period !== month(3));
    expect(shiftChance(gapped, "month", 5)).toBe(1);
  });
  it("agrees with a reference that tries every date by the normal equations on exact fractions, over generated series", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -3000, max: 3000 }), { minLength: 8, maxLength: 24 }), (cents) => {
        const values = cents.map((c) => c / 100);
        const ref = referenceChangeChance(values);
        const cp = changePoint(series(values), "month");
        if (!cp.ok) return;
        expect(cp.index).toBe(ref.index);
        expect(near(changeChance(cp), ref.p, 1e-8, 1e-300), `${values}`).toBe(true);
      }),
      { numRuns, seed },
    );
  });
  it("is 1 where one line fits perfectly (the two fit no better), 0 where two lines fit perfectly and one does not, and never above 1", () => {
    expect(changeChance({ n: 20, tries: 13, kept: null })).toBe(1);
    expect(changeChance({ n: 20, tries: 13, kept: 0 })).toBe(0);
    expect(changeChance({ n: 20, tries: 13, kept: 0.999 })).toBe(1);
    expect(changeChance({ n: 20, tries: 13, kept: 0.5 })).toBeCloseTo(13 * 0.5 ** 8, 15);
  });
  it("lets the periods count for fewer where the misses follow their own past: n · (1 - ρ) ÷ (1 + ρ), never more than n, and nothing for a negative ρ", () => {
    const cp = { n: 24, tries: 17, kept: 0.1 };
    // ρ = 1/3: 24 · (2/3) ÷ (4/3) = 12 periods count, exponent (12 - 4) ÷ 2 = 4.
    expect(changeChance(cp, 1 / 3)).toBeCloseTo(17 * 0.1 ** 4, 12);
    expect(changeChance(cp, 0)).toBeCloseTo(17 * 0.1 ** 10, 18);
    expect(changeChance(cp, -0.5)).toBe(changeChance(cp, 0));
    expect(changeChance(cp, 5)).toBe(1);
    // Where 4 or fewer periods are left to count, the chance is that of no change at all.
    expect(changeChance({ n: 24, tries: 17, kept: 0.1 }, 0.7)).toBe(1);
    expect(changeChance({ n: 8, tries: 1, kept: 0.1 }, 0)).toBeCloseTo(0.1 ** 2, 15);
  });
});

describe("the conditions, one step either side of each threshold", () => {
  it("a change is recent at the last 3 dates the change point can try: the later part has 4, 5 or 6 values, not 7", () => {
    expect(SINGLE.recentDates).toBe(3);
    const n = 30;
    expect([n - 4, n - 5, n - 6, n - 7].map((index) => recentDate(index, n))).toEqual([true, true, true, false]);
    expect(recentDate(n, n)).toBe(true);
  });
  it("the trend turned when one slope is up and the other down, not when one is flat or both go the same way", () => {
    expect([turned(1, -1), turned(-1, 1), turned(1e-300, -1e-300), turned(1, 0), turned(0, -1), turned(0, 0), turned(1, 2), turned(-1, -2)]).toEqual([true, true, true, false, false, false, false, false]);
  });
  it("two lines are far apart at 2 typical misses, in either direction, and not a hair under", () => {
    expect(SINGLE.misses).toBe(2);
    expect([farApart(2, 1), farApart(-2, 1), farApart(1.9999999999999998, 1), farApart(-1.9999999999999998, 1), farApart(2.0000000000000004, 1)]).toEqual([true, true, false, false, true]);
    expect([farApart(0, 0), farApart(1e-9, 0), farApart(0, 1)]).toEqual([true, true, false]);
  });
  it("a Target is out of reach under 20 %, with 2 or more periods left, or having been on pace a period ago; the rate is 1 %", () => {
    expect([SINGLE.under, SINGLE.periodsLeft, SINGLE.rate, SINGLE.line, SINGLE.earlier]).toEqual([0.2, 2, 0.01, { latest: 24, least: 8 }, 2]);
  });
});

describe("the misses of the two lines of a change point", () => {
  it("are the misses of a line through the values before the date and one through the values from it on, each with its place in the calendar", () => {
    const rows = series([0, 1, 2, 3, 9, 7, 5, 3]);
    const misses = twoLinesMisses(rows, "month", 4);
    expect(misses.map((m) => m.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // A perfect line each side: no miss at all.
    expect(misses.every((m) => m.miss.num === BigInt(0))).toBe(true);
    // One value off the first line: its miss and the others' balance, exactly.
    const off = twoLinesMisses(series([0, 1, 2, 4, 9, 7, 5, 3]), "month", 4);
    expect(off.slice(0, 4).reduce((s, m) => s + Number(m.miss.num) / Number(m.miss.den), 0)).toBeCloseTo(0, 12);
    expect(off.slice(4).every((m) => m.miss.num === BigInt(0))).toBe(true);
  });
});


describe("a Target is out of reach", () => {
  it("is out of reach under 20 %, with 2 or more periods left, or with fewer where it was on pace a period ago (asked only then), one step either side of each", () => {
    expect([unlikelyToReach(0.19999999999999998, 2, false), unlikelyToReach(0.2, 2, false), unlikelyToReach(0.05, 3, false), unlikelyToReach(0.0001, 14, false), unlikelyToReach(0.1, 1, false)]).toEqual([true, false, true, true, false]);
    expect([unlikelyToReach(0.1, 1, true), unlikelyToReach(0.2, 1, true), unlikelyToReach(0.1, 0, true), unlikelyToReach(0.1, 2, true)]).toEqual([true, false, true, true]);
  });
  it("was on pace when the line met the Target: at or above the lower end, at or below the upper, the ends included, decided exactly", () => {
    const at = (num: number, den: number) => ({ at: { num: BigInt(num), den: BigInt(den) } });
    const both = { min: 10, max: 20 };
    expect([reaches(at(10, 1), both), reaches(at(99999999, 10000000), both), reaches(at(20, 1), both), reaches(at(200000001, 10000000), both)]).toEqual([true, false, true, false]);
    expect([reaches(at(5, 1), { min: 10, max: null }), reaches(at(10, 1), { min: 10, max: null }), reaches(at(25, 1), { min: null, max: 20 }), reaches(at(20, 1), { min: null, max: 20 })]).toEqual([false, true, false, true]);
  });
  it("says it was on pace a period ago when it was, in a line of its own, and says the ends the Target has", () => {
    const look = { metric: revenue(), points: series(falling) };
    const now = { chance: 0.12, period: "2023-01-01", ahead: 1 };
    const reading = { ends: { min: 600, max: null }, decimals: 0, rows: series(falling), now, line: { num: BigInt(5551), den: BigInt(10) }, onPace: true, last: "2022-12-01" };
    const said = (over = {}, onPace = true) => targetHeadsUp(look, { ...reading, ...over, onPace }, 7, 0.0123, ctx);
    expect(said().takeaway.notes).toEqual(["Until its latest value, it was on pace."]);
    expect(said({}, false).takeaway.notes).toEqual([]);
    // The line is only said to have been on pace where fewer than 2 periods were left.
    expect(said({ now: { ...now, ahead: 2 } }).takeaway.notes).toEqual([]);
    expect(said({ now: { ...now, ahead: 0 } }).takeaway.notes).toEqual(["Until its latest value, it was on pace."]);
    expect(said().takeaway.sentence).toBe("Revenue is unlikely to reach 600 € or more in January 2023 (about 1 in 10).");
    expect(said({ ends: { min: null, max: 900 } }).takeaway.sentence).toBe("Revenue is unlikely to stay at 900 € or less in January 2023 (about 1 in 10).");
    expect(said({ ends: { min: 600, max: 900 } }).takeaway.sentence).toBe("Revenue is unlikely to land between 600 € and 900 € in January 2023 (about 1 in 10).");
    expect(said().takeaway.numbers.map((n) => [n.label, n.text])).toEqual([
      ["Method", "Target out of reach: the forecast's chance, and a straight line through the latest periods read against the Target, corrected for the Metrics looked at"],
      ["Chance of reaching the Target", "12 %"],
      ["Periods left", "1"],
      ["Straight line, at that period", "555 €"],
      ["Checks looked at", "7"],
      ["Chance of this by luck, after correcting for the checks looked at", "0.0123"],
    ]);
    expect(said().through).toBe("2022-12-01");
  });
  it("was on pace one period ago when the line without the latest value met the Target, where the line with it does not", () => {
    const rows = series([100, 101, 100, 99, 100, 101, 100, 40]);
    expect(wasOnPace(rows, "month", month(10), { min: 95, max: null })).toBe(true);
    expect(reaches(lineAt(rows, "month", month(10)), { min: 95, max: null })).toBe(false);
    expect(wasOnPace(rows, "month", month(10), { min: 105, max: null })).toBe(false);
    expect(wasOnPace(rows, "month", month(10), { min: null, max: 95 })).toBe(false);
  });
  it("is high or low only on the side of the mean it is outside on", () => {
    expect([onTheSide("above", 10, 9.99), onTheSide("above", 10, 10), onTheSide("above", 10, 10.01), onTheSide("below", 10, 10.01), onTheSide("below", 10, 10), onTheSide("below", 10, 9.99)]).toEqual([true, false, false, true, false, false]);
  });
});

// ---- whole Heads-ups ----
const ctx = { style: "1,234.5" as const, today: month(37) };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const FOOTER = { change: "This shows when the numbers changed, not what made them change.", forecast: "This carries the past forward; it is not a promise." };
const noise = (k: number) => ((k * 7) % 5) - 2;
const signups = metric({ id: 1, name: "Signups", polarity: "higher", target_min: null, target_max: null });
const revenue = (over: Partial<ReturnType<typeof metric>> = {}) => metric({ id: 2, name: "Revenue", polarity: "higher", target_min: 600, target_max: null, ...over });
const visits = metric({ id: 3, name: "Visits", polarity: "higher", target_min: null, target_max: null });
const turning = (cut: number, noisy = true) => Array.from({ length: 36 }, (_, k) => (k < cut ? 10 * k : 10 * cut - 10 * (k - cut)) + (noisy ? noise(k) : 0));
const falling = Array.from({ length: 36 }, (_, k) => 1000 - 15 * k + noise(k));
const seasonal = (n: number, spike: number) => Array.from({ length: n }, (_, k) => 100 + 20 * Math.sin((2 * Math.PI * k) / 12) + noise(k) * 2 + (k === n - 1 ? spike : 0));
const ups = (looks: SingleLook[], over = {}) => singleHeadsUpsFrom(looks, { ...ctx, ...over });
const textsOf = (u: ReturnType<typeof ups>[number]) => [u.takeaway.sentence, u.takeaway.basis, u.takeaway.method, u.takeaway.footer, ...u.takeaway.assumptions, ...u.takeaway.cautions, ...u.takeaway.notes, ...u.takeaway.numbers.flatMap((n) => [n.label, n.text]), ...u.takeaway.figures.flatMap((f) => [f.label, f.text])];

describe("a change of direction", () => {
  it("is reported with the sentence of the spec, the footer of a change point, the numbers it used and a stable key; a turn with no miss at all is the strongest there is", () => {
    const [up, ...rest] = ups([{ metric: signups, points: series(turning(30, false)) }]);
    expect(rest).toEqual([]);
    expect(up).toMatchObject({ key: "direction-change:1", kind: "direction-change", metrics: [1], span: "month", through: "2022-12-01", rank: 300 });
    expect(up.takeaway).toMatchObject({ kind: "answer", sentence: "Signups turned around in July 2022: up 10 € a month before, down 10 € a month since.", footer: FOOTER.change, strength: null, refusal: null, cautions: [], notes: [] });
    expect(up.takeaway.basis).toBe("from a straight line before the date and another after it, over 36 months, with the bar for chance raised for the dates tried (29)");
    expect(up.takeaway.numbers.map((n) => [n.label, n.text])).toEqual([
      ["Method", "Change of direction: a straight line before a date and another after it, corrected for the dates tried and the Metrics looked at"],
      ["Periods used", "36"],
      ["Dates tried", "29"],
      ["Best date", "2022-07-01"],
      ["Trend before the date (per period)", "+10 €"],
      ["Trend after the date (per period)", "−10 €"],
      ["Gap between the two trends at the latest period", "−100 €"],
      ["Typical miss", "0 €"],
      ["Checks looked at", "2"],
      ["Chance of this by luck, after correcting for the checks looked at", "under 0.0001"],
    ]);
    expect(up.takeaway.figures.map((f) => [f.value, f.text])).toEqual([[10, "10 €"], [10, "10 €"]]);
  });
  it("is reported for a turn with some noise, and ranked stronger for a clearer one: twice the noise is a smaller rank", () => {
    const withNoise = (amount: number) => ups([{ metric: signups, points: series(turning(30, false).map((v, k) => v + amount * noise(k))) }]);
    const [clear, blurred] = [withNoise(1), withNoise(2)];
    expect(clear[0].takeaway.sentence).toMatch(/^Signups turned around in [A-Z][a-z]+ 2022: up 10 € a month before, down (9|10|11) € a month since\.$/);
    expect(blurred.length).toBe(1);
    expect(blurred[0].rank).toBeLessThan(clear[0].rank);
    expect(clear[0].rank).toBeGreaterThan(10);
  });
  it("is reported only when the later part has 4, 5 or 6 values (the last 3 dates the change point can try): the sentence moves with the date, and 7 values is too late", () => {
    const says = (cut: number) => ups([{ metric: signups, points: series(turning(cut)) }]).map((u) => u.takeaway.sentence!.slice(0, 40));
    expect([says(28), says(29), says(31), says(32)]).toEqual([[], ["Signups turned around in July 2022: up 1"], ["Signups turned around in September 2022:"], ["Signups turned around in September 2022:"]]);
  });
  it("is not reported for a trend that slows, speeds up or only steps (the direction did not turn), nor a Metric that is not current", () => {
    const slowing = Array.from({ length: 36 }, (_, k) => (k < 30 ? 10 * k : 290 + 2 * (k - 29)) + noise(k));
    const stepping = Array.from({ length: 36 }, (_, k) => 10 * k + (k < 31 ? 0 : -100) + noise(k));
    expect(ups([{ metric: signups, points: series(slowing) }])).toEqual([]);
    expect(ups([{ metric: signups, points: series(stepping) }])).toEqual([]);
    // The latest period is month 35: current is within 6 periods of today's period.
    expect(ups([{ metric: signups, points: series(turning(30)) }], { today: month(35 + 7) })).toEqual([]);
    expect(ups([{ metric: signups, points: series(turning(30)) }], { today: month(35 + 6) }).length).toBe(1);
  });
  it("is not reported for a wave whose misses carry over, nor for a series that wanders", () => {
    const wave = Array.from({ length: 36 }, (_, k) => 100 + 30 * Math.sin(k / 3.2));
    expect(ups([{ metric: signups, points: series(wave) }])).toEqual([]);
    let [x, state] = [100, 12345];
    const walk = Array.from({ length: 36 }, () => { state = (state * 1103515245 + 12345) % 2147483648; return Math.round((x += (state / 2147483648 - 0.5) * 6) * 100) / 100; });
    expect(ups([{ metric: signups, points: series(walk) }])).toEqual([]);
  });
});

describe("a Target out of reach", () => {
  it("is reported with the forecast's footer, the chance in its words, and what it used", () => {
    const [up, ...rest] = ups([{ metric: revenue(), points: series(falling) }]);
    expect(rest.filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
    expect(up).toMatchObject({ key: "target-out-of-reach:2", kind: "target-out-of-reach", metrics: [2], span: "month", through: "2022-12-01" });
    expect(up.takeaway).toMatchObject({ sentence: "Revenue is unlikely to reach 600 € or more in March 2023 (under 1 in 20).", footer: FOOTER.forecast, notes: [], refusal: null });
    expect(up.takeaway.numbers.map((n) => [n.label, n.text]).slice(1, 5)).toEqual([["Chance of reaching the Target", "1 %"], ["Periods left", "3"], ["Straight line, at that period", "430 €"], ["Checks looked at", "3"]]);
    expect(up.takeaway.figures).toEqual([{ label: "Target, at least", value: 600, text: "600 €" }]);
  });
  it("reads a Target of at most for a lower-is-better Metric, and a band for closer-is-better", () => {
    const rising = falling.map((v) => 2000 - v);
    const [max] = ups([{ metric: revenue({ polarity: "lower", target_min: null, target_max: 1400 }), points: series(rising) }]);
    expect(max.takeaway.sentence).toBe("Revenue is unlikely to stay at 1,400 € or less in March 2023 (under 1 in 20).");
    const [between] = ups([{ metric: revenue({ polarity: "target", target_min: 900, target_max: 1100 }), points: series(falling) }]);
    expect(between.takeaway.sentence).toBe("Revenue is unlikely to land between 900 € and 1,100 € in March 2023 (under 1 in 20).");
    expect(between.takeaway.figures.map((f) => f.label)).toEqual(["Target, at least", "Target, at most"]);
  });
  it("is not reported for a Metric on its way, with no Target, with too few values for a line, or whose latest period is not recent", () => {
    expect(ups([{ metric: revenue({ target_min: 300 }), points: series(falling) }]).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
    expect(ups([{ metric: revenue({ target_min: null }), points: series(falling) }]).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
    expect(ups([{ metric: revenue({ polarity: "target", target_min: null, target_max: null }), points: series(falling) }]).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
    expect(ups([{ metric: revenue(), points: series(falling.slice(-7)) }]).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
    expect(ups([{ metric: revenue(), points: series(falling) }], { today: month(35 + 7) }).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
    // (A Target period already over is not told about: the latest period is 6 back, the Target 3 on from it.)
    expect(ups([{ metric: revenue(), points: series(falling) }], { today: month(35 + 3) }).filter((u) => u.kind === "target-out-of-reach").length).toBe(1);
    expect(ups([{ metric: revenue(), points: series(falling) }], { today: month(35 + 4) }).filter((u) => u.kind === "target-out-of-reach").length).toBe(0);
  });
  it("is not reported for a yearly Metric far below its Target (one period left, and the line was not on pace a period ago either), nor for a Target that cannot be read (its lower end above its upper)", () => {
    const yearly = Array.from({ length: 12 }, (_, k) => ({ period: `${2010 + k}-01-01`, value: 1000 - 60 * k + noise(k) }));
    const [target, today] = [{ ...revenue({ target_min: 900, period: "year" }) }, { today: "2022-06-01" }];
    expect(ups([{ metric: target, points: yearly }], today).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
    expect(ups([{ metric: revenue({ polarity: "target", target_min: 1100, target_max: 900 }), points: series(falling) }]).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
  });
  it("needs at least 8 values for the line: with 8 it can be reported, with 7 it is not even tried", () => {
    const eight = Array.from({ length: 8 }, (_, k) => 1000 - 60 * k + noise(k));
    const today = { today: month(9) };
    expect(ups([{ metric: revenue({ target_min: 700 }), points: series(eight) }], today).filter((u) => u.kind === "target-out-of-reach").length).toBe(1);
    expect(ups([{ metric: revenue({ target_min: 700 }), points: series(eight.slice(1)) }], today).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
  });
});

describe("a value unusual for its season", () => {
  it("is reported high, with its usual range from the earlier values at the same place in the season, the footer of a comparison with its own earlier values, and what it used", () => {
    const [up, ...rest] = ups([{ metric: visits, points: series(seasonal(106, 40)) }], { today: month(107) });
    expect(rest).toEqual([]);
    expect(up).toMatchObject({ key: "unusual-for-season:3", kind: "unusual-for-season", metrics: [3], span: "month", through: "2028-10-01", takeaway: { footer: "This compares the value with the earlier ones at this time of year; it does not show what made it differ.", strength: null, refusal: null } });
    expect(up.takeaway.sentence).toMatch(/^Visits's 1\d\d € in October 2028 is high for this time of year: it is usually between \d+ € and \d+ €\.$/);
    expect(up.takeaway.basis).toBe("from the 8 values at the same place in the season");
    expect(up.takeaway.numbers.map((n) => n.label)).toEqual(["Method", "Middle", "Usual range", "Values used", "Checks looked at", "Chance of this by luck, after correcting for the checks looked at"]);
  });
  it("is reported low for a dip, on the side of the mean, and not for a value within the usual range", () => {
    expect(ups([{ metric: visits, points: series(seasonal(106, -40)) }], { today: month(107) })[0].takeaway.sentence).toContain("is low for this time of year");
    expect(ups([{ metric: visits, points: series(seasonal(106, 0)) }], { today: month(107) })).toEqual([]);
  });
  it("needs at least 2 earlier values at the place: with 2 it is tried (and counted), with 1 it is not", () => {
    // 24 months of history give 1 earlier value at the latest value's place; 25 give 2 (the place is a year back, and two).
    const planted = { metric: signups, points: series(turning(30, false)) };
    const checks = (n: number) => ups([planted, { metric: visits, points: series(seasonal(n, 40)) }], { today: month(36 + 1) })[0].takeaway.numbers.find((x) => x.label === "Checks looked at")!.text;
    // The Metric Signups is tried for its direction in every case; Visits adds a test for its season from 2 earlier values and for its direction from 8 values.
    expect([checks(13), checks(24), checks(25), checks(26)]).toEqual(["3", "3", "4", "4"]);
  });
  it("is not reported for a yearly Metric (a season of 1) or where the earlier values at the place do not differ", () => {
    expect(ups([{ metric: { ...visits, period: "year" }, points: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024].map((y, i) => ({ period: `${y}-01-01`, value: [10, 12, 11, 13, 12, 14, 13, 15, 14, 90][i] })) }], { today: "2025-06-01" })).toEqual([]);
    const flat = Array.from({ length: 46 }, (_, k) => (k % 12 === 9 ? 80 : 100 + ((k * 7) % 5) * 3));
    flat[45] = 120;
    expect(ups([{ metric: visits, points: series(flat) }], { today: month(47) })).toEqual([]);
  });
});

describe("every condition on its own", () => {
  it("a change of direction is not told where only one condition fails: a far-off value in the history, a wave, no turn", () => {
    const base = turning(30);
    expect(ups([{ metric: signups, points: series(base) }]).length).toBe(1);
    expect(ups([{ metric: signups, points: series(base.map((v, k) => (k === 10 ? v + 5000 : v))) }])).toEqual([]);
    expect(ups([{ metric: signups, points: series(base.map((v, k) => v + 25 * Math.sin(k / 1.6))) }])).toEqual([]);
  });
  it("a Target is not told where only one condition fails: misses that follow their own past", () => {
    const wave = falling.map((v, k) => v + 40 * Math.sin(k / 1.5));
    expect(ups([{ metric: revenue(), points: series(wave) }]).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
  });
  it("a Target reads the straight line through the latest 24 periods only", () => {
    const early = falling.map((v, k) => (k < 12 ? v + 12 * noise(k) + (k % 2) * 30 : v));
    const [told] = ups([{ metric: revenue({ decimals: 2 }), points: series(early) }]).filter((u) => u.kind === "target-out-of-reach");
    const want = nearest(lineAt(series(early).slice(-24), "month", month(38)).at);
    expect(told.takeaway.numbers.find((n) => n.label === "Straight line, at that period")!.text).toBe(`${want.toFixed(2)} €`);
    expect(want.toFixed(2)).not.toBe(nearest(lineAt(series(early), "month", month(38)).at).toFixed(2));
  });
  it("a value unusual for its season is not told where only one condition fails: a Metric not current, a level shift in its history, tiny numbers; and it looks at the latest 120 periods", () => {
    const spike = seasonal(106, 40);
    expect(ups([{ metric: visits, points: series(spike) }], { today: month(105 + 7) })).toEqual([]);
    expect(ups([{ metric: visits, points: series(spike) }], { today: month(105 + 6) }).length).toBe(1);
    expect(ups([{ metric: visits, points: series(spike.map((v, k) => (k < 60 ? v - 400 : v))) }], { today: month(107) })).toEqual([]);
    expect(ups([{ metric: visits, points: series(spike.map((v) => v / 1e22)) }], { today: month(107) })).toEqual([]);
    const [long] = ups([{ metric: visits, points: series(seasonal(133, 40)) }], { today: month(134) });
    expect(long.takeaway.basis).toBe("from the 9 values at the same place in the season");
    expect(long.takeaway.figures.map((f) => f.label)).toEqual(["Usual low", "Usual high"]);
    expect(long.takeaway.numbers.find((n) => n.label === "Usual range")!.text).toBe(`${long.takeaway.figures[0].text} – ${long.takeaway.figures[1].text}`);
  });
  it("says its assumptions, and the ends of the Target it has, no more", () => {
    const [turn] = ups([{ metric: signups, points: series(turning(30)) }]);
    expect(turn.takeaway.assumptions.length).toBe(1);
    const [max] = ups([{ metric: revenue({ polarity: "lower", target_min: null, target_max: 1400 }), points: series(falling.map((v) => 2000 - v)) }]).filter((u) => u.kind === "target-out-of-reach");
    expect(max.takeaway.figures.map((f) => f.label)).toEqual(["Target, at most"]);
    expect(max.takeaway.assumptions.length).toBe(1);
    expect(ups([{ metric: revenue(), points: series(falling) }])[0].takeaway.figures.map((f) => f.label)).toEqual(["Target, at least"]);
  });
});

describe("every gate of every test, one at a time (the others holding)", () => {
  const at = (k: number) => ({ ...ctx, today: month(k) });
  const test = (kind: string, look: SingleLook, over: SingleContext = ctx) => testsOf(look, over).find((t) => t.kind === kind)!;
  // The names of the gates that are false.
  const failing = (t: { gates: Record<string, boolean> }) => Object.entries(t.gates).filter(([, v]) => !v).map(([k]) => k);
  const only = (t: { gates: Record<string, boolean>; p: number }, gate: string) => { expect(failing(t)).toEqual([gate]); expect(t.p).toBe(1); };
  const turn = (a = 1, after = 10, cut = 30) => Array.from({ length: 36 }, (_, k) => (k < cut ? 10 * k : 10 * cut - after * (k - cut)) + a * noise(k));
  const dir = (points: Point[], over: SingleContext = ctx) => test("direction-change", { metric: signups, points }, over);

  it("holds is true only where every condition is", () => {
    expect([holds({}), holds({ a: true, b: true }), holds({ a: true, b: false }), holds({ a: false, b: true }), holds({ a: false })]).toEqual([true, true, false, false, false]);
  });
  it("a change of direction: a clean turn has every gate and its chance; each condition alone failing leaves a chance of 1", () => {
    const clean = dir(series(turn()));
    expect(failing(clean)).toEqual([]);
    expect(clean.p).toBe(clean.chance);
    // The chance is the larger of the change point's and the one from the changes alone, by hand from the pieces.
    const points = series(turn());
    const cp = changePoint(points, "month");
    if (!cp.ok) throw new Error("no change point");
    const misses = twoLinesMisses(points, "month", cp.index);
    expect(clean.chance).toBe(Math.max(changeChance(cp, carryOf(misses)), Math.min(1, cp.tries * shiftChance(points, "month", cp.index))));
    expect(clean.chance).toBeGreaterThan(changeChance(cp, carryOf(misses)) - 1e-300);
    only(dir(series(turn(30))), "found");
    only(dir(series(turn().map((v, k) => v + 4 * Math.sin(k / 3)))), "steady");
    only(dir(series(turn()).filter((p) => ![5, 6, 7].includes(Number(p.period.slice(5, 7)) + 12 * (Number(p.period.slice(0, 4)) - 2020) - 1))), "clean");
    only(dir(series(turn()), at(60)), "current");
    only(dir(series(turn(1, 10, 28))), "recent");
    only(dir(series(turn(1, -3))), "turned");
    only(dir(series(turn().map((v, k) => (k >= 30 ? v + 100 : v)))), "apart");
    only(dir(series(turn().map((v) => v / 1e22))), "written");
  });
  it("a Target: every gate for a falling Metric and its chance by hand from the line and the changes; each condition alone failing leaves a chance of 1", () => {
    const tgt = (values: number[], over = {}, ctxOver: SingleContext = ctx, period = "month") => test("target-out-of-reach", { metric: revenue(over), points: values.map((value, k) => ({ period: period === "day" ? new Date(Date.UTC(2026, 0, 1 + k)).toISOString().slice(0, 10) : month(k), value })) }, ctxOver);
    const base = tgt(falling);
    expect(failing(base)).toEqual([]);
    expect(base.p).toBe(base.chance);
    const rows = series(falling).slice(-24);
    const line = lineAt(rows, "month", month(38));
    expect(base.chance).toBe(Math.max(lineBelow(line, 600), driftBelow(rows, "month", month(38), 600)));
    // An upper end alone, and both ends (twice the smaller of the two).
    const hi = tgt(falling.map((v) => 2000 - v), { polarity: "lower", target_min: null, target_max: 1400 });
    const rowsHi = series(falling.map((v) => 2000 - v)).slice(-24);
    expect(hi.chance).toBe(Math.max(lineAbove(lineAt(rowsHi, "month", month(38)), 1400), driftAbove(rowsHi, "month", month(38), 1400)));
    const band = tgt(falling, { polarity: "target", target_min: 900, target_max: 1100 });
    const [below, above] = [Math.max(lineBelow(line, 900), driftBelow(rows, "month", month(38), 900)), Math.max(lineAbove(line, 1100), driftAbove(rows, "month", month(38), 1100))];
    expect(band.chance).toBe(Math.min(1, 2 * Math.min(below, above)));
    only(tgt(falling, {}, at(39)), "ahead");
    // A Target that is met: nothing says it is out of reach, and where another gate fails the forecast is not asked.
    expect(failing(tgt(falling, { target_min: 300 }))).toEqual([]);
    expect(tgt(falling, { target_min: 300 }).p).toBe(1);
    only(tgt(falling, { target_min: 300 }, at(39)), "ahead");
    only(tgt(falling.map((v) => v / 1e22), { target_min: 1e-30 }), "written");
    only(tgt(falling.map((v, k) => v + 5 * Math.sin(k / 4))), "mild");
    // A Period with more periods ahead than the day it counts as current for: the Target is not over and the data is no longer current.
    const daily = Array.from({ length: 40 }, (_, k) => 1000 - 15 * k + noise(k));
    const dctx = { ...ctx, today: new Date(Date.UTC(2026, 0, 1 + 39 + 7)).toISOString().slice(0, 10) };
    only(tgt(daily, { period: "day", target_min: 300 }, dctx, "day"), "current");
  });
  it("a season: every gate for a spike and its chance; each condition alone failing leaves a chance of 1", () => {
    const sea = (values: number[], over: SingleContext = { ...ctx, today: month(107) }, period = "month") => test("unusual-for-season", { metric: period === "month" ? visits : { ...visits, period: "quarter" }, points: values.map((value, k) => ({ period: period === "month" ? month(k) : new Date(Date.UTC(2010, 3 * k, 1)).toISOString().slice(0, 10), value })) }, over);
    const spike = seasonal(106, 40);
    const base = sea(spike);
    expect(failing(base)).toEqual([]);
    expect(base.p).toBe(base.chance);
    expect(base.chance).toBeCloseTo(newValueChance(spike.slice(0, -1).filter((_, k) => (105 - k) % 12 === 0), spike[105]), 15);
    only(sea(spike, { ...ctx, today: month(105 + 7) }), "current");
    // Every gate holds but the chance is above the rate: nothing to report.
    const mild = sea(seasonal(106, 12));
    expect(failing(mild)).toEqual([]);
    expect(mild.chance).toBeGreaterThan(0.01);
    expect(mild.p).toBe(1);
    only(sea(spike.map((v) => v / 1e22)), "written");
    // The latest value in the middle of the usual range: not outside it (and so on neither side).
    const within = seasonal(106, 0);
    const median = usualRange(series(within).slice(0, -1), "month", { season: 12, at: month(105), least: 2 })!.median;
    const inside = sea(within.map((v, k) => (k === 105 ? median : v)));
    expect(failing(inside)).toEqual(["outside", "side"]);
    expect(inside.p).toBe(1);
    // Inside the range, below the mean: still neither outside nor on a side.
    const q1 = usualRange(series(within).slice(0, -1), "month", { season: 12, at: month(105), least: 2 })!.q1;
    expect(failing(sea(within.map((v, k) => (k === 105 ? q1 : v))))).toEqual(["outside", "side"]);
    // A yearly Metric has a season of 1: none.
    const yearly = testsOf({ metric: { ...visits, period: "year" }, points: Array.from({ length: 12 }, (_, k) => ({ period: `${2010 + k}-01-01`, value: 100 + noise(k) })) }, { ...ctx, today: "2026-06-01" }).map((x) => x.kind);
    expect(yearly).not.toContain("unusual-for-season");
    // A value above the usual range but below the mean of the earlier ones (a few very high among them): not high. Quarterly, 11 earlier values at the place.
    const skew = Array.from({ length: 45 }, (_, k) => (k % 4 === 0 && k < 44 ? (k === 40 ? 1000 : 0) : 100 + noise(k) * 3 + (k % 7)));
    skew[44] = 50;
    only(sea(skew, { ...ctx, today: new Date(Date.UTC(2010, 3 * 46, 1)).toISOString().slice(0, 10) }, "quarter"), "side");
    // A step in level (the usual range's own check) holds back a spike too, however far out, that every other condition lets through.
    const stepped = test("unusual-for-season", { metric: visits, points: series(seasonal(106, 1200).map((v, k) => (k < 50 ? v : v + 400))) }, { ...ctx, today: month(107) });
    expect(failing(stepped)).toEqual(["clean"]);
    // Where the other conditions fail the checks are not asked, whatever they would say.
    const gappedOld = test("unusual-for-season", { metric: visits, points: series(spike).filter((_, k) => ![30, 31, 32].includes(k)) }, { ...ctx, today: month(105 + 7) });
    expect(failing(gappedOld)).toEqual(["current"]);
    // The checks of the usual range (here a gap of 3 periods in a row) hold a spike back that every other condition lets through.
    const gapped = { metric: visits, points: series(spike).filter((_, k) => ![30, 31, 32].includes(k)) };
    const held = test("unusual-for-season", gapped, { ...ctx, today: month(107) });
    expect(failing(held)).toEqual(["clean"]);
    expect(held.p).toBe(1);
  });
});

describe("a Target with both ends counts twice", () => {
  it("has a chance twice as large as the same Target with its near end alone: the rank is log10(2) lower", () => {
    const rank = (over: object) => ups([{ metric: revenue(over), points: series(falling) }]).find((u) => u.kind === "target-out-of-reach")!.rank;
    expect(rank({ polarity: "higher", target_min: 600 }) - rank({ polarity: "target", target_min: 600, target_max: 5000 })).toBeCloseTo(Math.log10(2), 6);
  });
  it("is not told for a turn whose slopes are too small to write, or too blurred to be a change", () => {
    expect(ups([{ metric: signups, points: series(turning(30, false).map((v) => v / 1e22)) }])).toEqual([]);
    expect(ups([{ metric: signups, points: series(turning(30, false).map((v, k) => v + 150 * noise(k))) }])).toEqual([]);
  });
});

describe("data that is current", () => {
  it("runs to within 6 periods before today's period (the running period counts as the first), one step either side, in every Period", () => {
    expect([isCurrent("2026-01-01", "2026-07-15", "month", 1), isCurrent("2026-01-01", "2026-08-15", "month", 1)]).toEqual([true, false]);
    expect([isCurrent("2026-06-29", "2026-07-20", "week", 1), isCurrent("2026-06-01", "2026-07-20", "week", 1)]).toEqual([true, false]);
    expect([isCurrent("2025-04-01", "2026-07-15", "quarter", 1), isCurrent("2024-10-01", "2026-07-15", "quarter", 1)]).toEqual([true, false]);
    expect([isCurrent("2020-04-01", "2026-07-15", "year", 4), isCurrent("2019-04-01", "2026-07-15", "year", 4)]).toEqual([true, false]);
  });
});

describe("the order", () => {
  it("is the kinds in their order, the stronger first within a kind, ties by Metric id, whatever order the Metrics come in", () => {
    const turn106 = (amount: number) => Array.from({ length: 106 }, (_, k) => (k < 100 ? 10 * k : 1000 - 10 * (k - 100)) + amount * noise(k));
    const perfect = series(turn106(0));
    const looks: SingleLook[] = [
      { metric: metric({ id: 4, name: "Visits", polarity: "higher", target_min: null, target_max: null }), points: series(seasonal(106, 40)) },
      { metric: metric({ id: 3, name: "Blurred", polarity: "higher", target_min: null, target_max: null }), points: series(turn106(2)) },
      { metric: revenue({ id: 2, target_min: 1000 }), points: series(Array.from({ length: 106 }, (_, k) => 3000 - 20 * k + noise(k))) },
      { metric: metric({ id: 5, name: "Perfect B", polarity: "higher", target_min: null, target_max: null }), points: perfect },
      { metric: metric({ id: 1, name: "Perfect A", polarity: "higher", target_min: null, target_max: null }), points: perfect },
    ];
    const got = singleHeadsUpsFrom(looks, { ...ctx, today: month(107) });
    expect(got.map((u) => u.key.split(":").slice(0, 2).join(":"))).toEqual(["direction-change:1", "direction-change:5", "direction-change:3", "target-out-of-reach:2", "unusual-for-season:4"]);
    expect(got.slice(0, 3).map((u) => u.rank)).toEqual([300, 300, got[2].rank]);
    expect(got[2].rank).toBeLessThan(300);
    expect(got[2].rank).toBeGreaterThan(0);
    expect(got.map((u) => u.rank).every((r) => Number(r.toPrecision(12)) === r)).toBe(true);
  });
});

describe("the correction, at 1 %", () => {
  it("reports a value unusual for its season when its chance is at most 1 % ÷ the checks looked at (here 2: its direction and its season), one step either side of that", () => {
    const base = seasonal(106, 0);
    const same = base.slice(0, -1).filter((_, k) => (105 - k) % 12 === 0).map((v) => Math.round(v * 100) / 100);
    const chance = (x: number) => newValueChance(same, x);
    // The value at which the chance is exactly 0.005 = 0.01 ÷ 2: found by halving.
    let [lo, hi] = [same.reduce((a, b) => a + b, 0) / same.length, 1000];
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (chance(mid) > 0.005) lo = mid; else hi = mid; }
    const [inside, beyond] = [lo - 1e-6, hi + 1e-6];
    expect(chance(inside)).toBeGreaterThan(0.005);
    expect(chance(beyond)).toBeLessThan(0.005);
    const told = (latest: number) => ups([{ metric: visits, points: series([...base.slice(0, -1).map((v) => Math.round(v * 100) / 100), latest]) }], { today: month(107) }).map((u) => u.kind);
    expect([told(inside), told(beyond)]).toEqual([[], ["unusual-for-season"]]);
  });
  it("gives the same Heads-up for the same Metric in any scale: every value times 7 says the same, with the same chance", () => {
    fc.assert(
      fc.property(fc.integer({ min: 28, max: 32 }), fc.constantFrom(2, 7, 10, 1000), (cut, scale) => {
        const values = turning(cut);
        const [a, b] = [ups([{ metric: signups, points: series(values) }]), ups([{ metric: signups, points: series(values.map((v) => v * scale)) }])];
        expect(b.map((u) => u.key)).toEqual(a.map((u) => u.key));
        for (const [x, y] of a.map((u, i) => [u, b[i]] as const)) expect(y.rank).toBeCloseTo(x.rank, 6);
      }),
      { numRuns: Math.min(numRuns, 12), seed },
    );
  });
});

describe("small numbers are never written as 0, and never lose their sign", () => {
  it("writes the slopes, the gap, the typical miss, the Target and the line with the digits it takes to show them, for a Metric kept to whole numbers", () => {
    const tiny = ups([{ metric: signups, points: series(turning(30, false).map((v, k) => v / 1000 + (k % 2) * 1e-4)) }])[0];
    expect(tiny.takeaway.sentence).toBe("Signups turned around in July 2022: up 0.01 € a month before, down 0.01 € a month since.");
    const rows = Object.fromEntries(tiny.takeaway.numbers.map((n) => [n.label, n.text]));
    expect(rows["Gap between the two trends at the latest period"]).toMatch(/^−0\.\d*[1-9]\d* €$/);
    expect(rows["Typical miss"]).toMatch(/^0\.\d*[1-9]\d* €$/);
    const [out] = ups([{ metric: revenue({ target_min: 0.006 }), points: series(falling.map((v) => v / 100000)) }]).filter((u) => u.kind === "target-out-of-reach");
    expect(out.takeaway.sentence).toBe("Revenue is unlikely to reach 0.01 € or more in March 2023 (under 1 in 20).");
    expect(out.takeaway.figures[0].text).toBe("0.01 €");
    expect(out.takeaway.numbers.find((n) => n.label === "Straight line, at that period")!.text).toBe("0.004 €");
    const [high] = ups([{ metric: visits, points: series(seasonal(106, 40).map((v) => v / 100)) }], { today: month(107) });
    expect(high.takeaway.sentence).toMatch(/^Visits's 1\.\d+ € in October 2028 is high for this time of year: it is usually between 0\.\d+ € and 0\.\d+ €\.$/);
    const [low, hi] = high.takeaway.figures.map((f) => f.text);
    expect(low).not.toBe(hi);
  });
  it("says nothing where even the most decimals could not show an end of the Target", () => {
    expect(ups([{ metric: revenue({ target_min: 1e-30 }), points: series(falling.map((v) => v / 1e22)) }]).filter((u) => u.kind === "target-out-of-reach")).toEqual([]);
  });
});

describe("what is looked at, and by whom", () => {
  const planted = { metric: signups, points: series(turning(30)) };
  const crowd = (count: number): SingleLook[] => Array.from({ length: count }, (_, i) => ({ metric: metric({ id: 100 + i, name: `Noise ${i}`, polarity: "higher", target_min: null, target_max: null }), points: series(Array.from({ length: 36 }, (_, k) => 100 + (((k + 3 * i) * 7919) % 13) - 6)) }));
  it("counts only the Metrics it is given: more Metrics never make a Heads-up appear, and can make one go", () => {
    const [few, many] = [ups([planted, ...crowd(3)]), ups([planted, ...crowd(30)])];
    expect(few.map((u) => u.key)).toEqual(["direction-change:1"]);
    expect(many.map((u) => u.key).every((k) => few.map((u) => u.key).includes(k))).toBe(true);
    expect(Number(few[0].takeaway.numbers.find((n) => n.label === "Checks looked at")!.text)).toBeLessThan(Number(many[0].takeaway.numbers.find((n) => n.label === "Checks looked at")!.text));
  });
  it("names only Metrics that are given, and nothing in a Heads-up holds a word a person would have to look up", () => {
    const all = ups([planted, { metric: revenue(), points: series(falling) }, { metric: visits, points: series(seasonal(106, 40)) }, ...crowd(5)], { today: month(107) });
    expect(all.map((u) => u.kind)).toEqual(["direction-change", "target-out-of-reach", "unusual-for-season"].filter((k) => all.some((u) => u.kind === k)));
    for (const u of all) {
      expect(u.metrics.every((id) => [1, 2, 3].includes(id))).toBe(true);
      for (const t of textsOf(u)) if (t) expect(t, t).not.toMatch(FORBIDDEN);
    }
  });
  it("gives the same Heads-ups, in the same order, whatever order the Metrics come in, and the same twice", () => {
    const looks = [planted, { metric: revenue(), points: series(falling) }, { metric: visits, points: series(seasonal(106, 40)) }, ...crowd(4)];
    const want = JSON.stringify(ups(looks, { today: month(107) }));
    expect(JSON.stringify(ups(looks, { today: month(107) }))).toBe(want);
    fc.assert(fc.property(fc.shuffledSubarray(looks, { minLength: looks.length, maxLength: looks.length }), (shuffled) => { expect(JSON.stringify(ups(shuffled, { today: month(107) }))).toBe(want); }), { numRuns: Math.min(numRuns, 8), seed });
  });
  it("gives none for no Metrics, one Metric with no values, or values that are not numbers", () => {
    expect(ups([])).toEqual([]);
    expect(ups([{ metric: signups, points: [] }])).toEqual([]);
    expect(ups([{ metric: signups, points: series([NaN, Infinity, -Infinity, NaN, NaN, NaN, NaN, NaN, NaN, NaN]) }])).toEqual([]);
  });
  it("survives hostile series: too few values, all the same, a period twice, out of order, with gaps, huge and tiny values, never a wrong Heads-up", () => {
    const base = turning(30, false);
    const hostile: Point[][] = [
      series(base.slice(0, 7)),
      series(Array.from({ length: 36 }, () => 5)),
      [...series(base), { period: month(10), value: 3 }],
      [...series(base)].reverse(),
      series(base).filter((_, k) => k % 7 !== 3),
      series(base.map((v) => v * 1e300)),
      series(base.map((v) => v * 1e-300)),
      series(base.map((v, k) => (k === 12 ? NaN : v))),
    ];
    for (const points of hostile) {
      const got = ups([{ metric: signups, points }, { metric: revenue(), points }, { metric: visits, points }]);
      for (const u of got) expect(u.takeaway.sentence, `${u.kind}`).toMatch(/\S/);
    }
    // A period given twice counts once, the last value given: the same Heads-up as without the duplicate.
    expect(ups([{ metric: signups, points: [{ period: month(10), value: 3 }, ...series(base)] }]).map((u) => u.key)).toEqual(ups([{ metric: signups, points: series(base) }]).map((u) => u.key));
    // Unsorted input is the same as sorted.
    expect(JSON.stringify(ups([{ metric: signups, points: [...series(turning(30))].reverse() }]))).toBe(JSON.stringify(ups([{ metric: signups, points: series(turning(30)) }])));
  });
});
