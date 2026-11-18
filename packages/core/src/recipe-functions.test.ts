// The Analysis Recipe function library against its references (spec 0024, spec 0022; GLOSSARY: Analysis Recipe):
// every function on generated series, held to the exact result (the double nearest to it, or ±√ of the double
// nearest to the exact square), and the references held to sums worked out by hand. Generated with a fixed seed in
// `pnpm test`, more and a new seed in `test:numbers`.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pearson } from "./correlation";
import { correlation, difference, growth, linearTrend, mean, movingAverage, seasonalIndex, share, slope, standardDeviation, zScore, type Result } from "./recipe-functions";
import { periodsFrom, runs, valueText } from "./test/reference/check";
import { exactOf, exactText, fraction, isNearestDouble, nearestDoubleOf, plus, type Exact } from "./test/reference/exact";
import { exactSeries, refDifference, refGrowth, refLine, refMean, refMovingAverage, refSeasonal, refShare, refVariance, refZ, type RefPoint } from "./test/reference/recipes";
import type { Point } from "./types";

const { numRuns, seed } = runs();
// Values with constant runs among them, so a flat series turns up, and zeros for growth and shares.
const values = (min: number, max: number) =>
  fc.oneof(
    { weight: 4, arbitrary: fc.array(valueText.map(Number), { minLength: min, maxLength: max }) },
    { weight: 1, arbitrary: fc.tuple(valueText, fc.integer({ min, max })).map(([v, n]) => Array(n).fill(Number(v))) },
    { weight: 1, arbitrary: fc.array(fc.constantFrom(0, 1, -1, 0.5), { minLength: min, maxLength: max }) },
  );
const at = (vs: number[], from = "2024-01-01"): Point[] => periodsFrom(from, "month", vs.length).map((period, i) => ({ period, value: vs[i] }));
const pts = (r: Result) => (r.kind === "series" ? r.points : []);
const val = (r: Result) => (r.kind === "value" ? r.value : undefined);
const nearestTo = (code: number, exact: Exact, where: string) => expect(isNearestDouble(code, exact), `${where}: ${code} is not the double nearest to ${exactText(exact)}`).toBe(true);
const sameSeries = (code: Point[], ref: RefPoint[], where: string) => {
  expect(code.map((p) => p.period), where).toEqual(ref.map((p) => p.period));
  code.forEach((p, i) => nearestTo(p.value, ref[i].value, `${where} at ${p.period}`));
};
const prop = (arb: fc.Arbitrary<number[]>, check: (vs: number[]) => void) => fc.assert(fc.property(arb, check), { numRuns: numRuns * 2, seed });

describe("the function library, against the references", () => {
  it(`moving average (${numRuns * 2} series, seed ${seed})`, () => {
    fc.assert(fc.property(values(0, 40), fc.integer({ min: 2, max: 12 }), (vs, w) => sameSeries(pts(movingAverage(at(vs), w)), refMovingAverage(exactSeries(at(vs)), w), `${vs} by ${w}`)), { numRuns: numRuns * 2, seed });
  });
  it("difference", () => prop(values(0, 40), (vs) => sameSeries(pts(difference(at(vs))), refDifference(exactSeries(at(vs))), `${vs}`)));
  it("growth, none from 0", () => prop(values(0, 40), (vs) => sameSeries(pts(growth(at(vs))), refGrowth(exactSeries(at(vs))), `${vs}`)));
  it("share, on the periods both have, none where the whole is 0", () => {
    fc.assert(fc.property(values(0, 30), values(0, 30), fc.integer({ min: 0, max: 5 }), (a, b, shift) => {
      const pa = at(a);
      const pb = at(b, periodsFrom("2024-01-01", "month", shift + 1)[shift]);
      sameSeries(pts(share(pa, pb)), refShare(exactSeries(pa), exactSeries(pb)), `${a} of ${b}`);
    }), { numRuns: numRuns * 2, seed });
  });
  it("linear trend and slope, by least squares", () => {
    prop(values(0, 40), (vs) => {
      const ref = refLine(exactSeries(at(vs)));
      if (!ref) {
        expect(pts(linearTrend(at(vs)))).toEqual([]);
        expect(val(slope(at(vs)))).toBeNull();
        return;
      }
      nearestTo(val(slope(at(vs)))!, ref.slope, `${vs}: slope`);
      const fitted = exactSeries(at(vs)).map((p, i) => ({ period: p.period, value: addTimes(ref.intercept, ref.slope, i) }));
      sameSeries(pts(linearTrend(at(vs))), fitted, `${vs}: line`);
    });
  });
  it("mean", () => prop(values(0, 40), (vs) => {
    const ref = refMean(exactSeries(at(vs)));
    if (ref === null) expect(val(mean(at(vs)))).toBeNull();
    else nearestTo(val(mean(at(vs)))!, ref, `${vs}`);
  }));
  it("standard deviation: √ of the double nearest to the exact variance", () => prop(values(0, 40), (vs) => {
    const ref = refVariance(exactSeries(at(vs)));
    expect(val(standardDeviation(at(vs))), `${vs}`).toBe(ref === null ? null : Math.sqrt(nearestDoubleOf(ref)));
  }));
  it("z-score: ±√ of the double nearest to the exact z², none when nothing varies", () => prop(values(0, 40), (vs) => {
    const ref = refZ(exactSeries(at(vs)));
    const got = pts(zScore(at(vs)));
    if (!ref) return void expect(got, `${vs}`).toEqual([]);
    expect(got.map((p) => p.period)).toEqual(ref.map((r) => r.period));
    got.forEach((p, i) => expect(p.value, `${vs} at ${p.period}`).toBe((ref[i].negative ? -1 : 1) * Math.sqrt(nearestDoubleOf(ref[i].z2))));
  }));
  it("seasonal index, by the position in the season", () => {
    fc.assert(fc.property(values(0, 40), fc.integer({ min: 2, max: 12 }), (vs, season) => {
      const ref = refSeasonal(exactSeries(at(vs)), season);
      const got = pts(seasonalIndex(at(vs), season));
      if (!ref) return void expect(got, `${vs} by ${season}`).toEqual([]);
      sameSeries(got, ref, `${vs} by ${season}`);
    }), { numRuns: numRuns * 2, seed });
  });
  it("seasonal index has nothing for values whose mean is 0, and works for a negative mean", () => {
    // Generated values rarely add up to exactly 0 (#126, found by mutation testing): say so by hand.
    expect(pts(seasonalIndex(at([1, -1, 2, -2]), 2))).toEqual([]);
    expect(pts(seasonalIndex(at([-1, -3, -1, -3]), 2)).map((p) => p.value)).toEqual([50, 150, 50, 150]);
  });
  it("correlation is Pearson's r as the Correlation Analysis computes it, none without six pairs or for a flat series", () => {
    fc.assert(fc.property(values(0, 20), values(0, 20), (a, b) => {
      const r = pearson(at(a), at(b));
      expect(val(correlation(at(a), at(b)))).toBe(r && Number.isFinite(r.r) ? r.r : null);
    }), { numRuns: numRuns * 2, seed });
  });
});

// intercept + slope · i, exactly, by the reference's own arithmetic.
const addTimes = (intercept: Exact, slope_: Exact, i: number): Exact => plus(intercept, fraction(slope_.num * BigInt(i), slope_.den));

describe("the references, worked out by hand", () => {
  const s = (vs: (number | string)[]) => vs.map((v, i) => ({ period: `2026-0${i + 1}-01`, value: exactOf(v) }));
  const values_ = (ps: RefPoint[]) => ps.map((p) => exactText(p.value));
  it("moving average, difference and growth", () => {
    expect(values_(refMovingAverage(s([1, 2, 3, 4]), 3))).toEqual(["2", "3"]);
    expect(values_(refMovingAverage(s(["0.1", "0.2"]), 2))).toEqual(["0.15"]);
    expect(values_(refDifference(s(["0.3", "0.1", "0.4"])))).toEqual(["-0.2", "0.3"]);
    // 0 to 5 has no growth; 5 to 4 is −20 %; −4 to −2 is +50 % (from |−4|).
    expect(values_(refGrowth(s([0, 5, 4, -4, -2])))).toEqual(["-20", "-200", "50"]);
  });
  it("share, the line, the variance, z and the seasons", () => {
    expect(values_(refShare(s([1, 3, 2]), s([4, 0, 8])))).toEqual(["25", "25"]);
    // y = 1, 3, 5 lies on a line of slope 2 through 1.
    expect(refLine(s([1, 3, 5]))).toEqual({ slope: exactOf(2), intercept: exactOf(1) });
    // 2, 4, 4, 4, 5, 5, 7, 9: mean 5, Σ(y − 5)² = 32, sample variance 32 / 7.
    expect(refVariance(s([2, 4, 4, 4, 5, 5, 7, 9]))).toEqual({ num: 32n, den: 7n });
    expect(refZ(s([1, 1, 1]))).toBeNull();
    // 1, 3: mean 2, variance 2, so z² = 1/2 each, signs − and +.
    expect(refZ(s([1, 3]))?.map((z) => [exactText(z.z2), z.negative])).toEqual([["0.5", true], ["0.5", false]]);
    // 1, 3, 1, 3 by 2: positions average 1 and 3 against a mean of 2: 50 % and 150 %.
    expect(values_(refSeasonal(s([1, 3, 1, 3]), 2)!)).toEqual(["50", "150", "50", "150"]);
    expect(refSeasonal(s([1, 3, 1]), 2)).toBeNull();
    expect(refMean(s([]))).toBeNull();
  });
});
