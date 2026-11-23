// Student's t curve (spec 0041, "Distributions"): SciPy's `t.ppf` and `t.cdf` at every fixture point, the reference (the
// incomplete beta function, a different route from the code's finite sums), hand-worked points, properties (symmetry, order,
// inverse), and hostile arguments, one step either side of every limit.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { referenceTCdf, referenceTQuantile } from "../test/reference/before-after";
import { normalCdf, Z80 } from "./normal-curve";
import { LIKELY, MOST_DF, tCdf, tQuantile } from "./t-curve";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/before-after.json", import.meta.url), "utf8"));
const relative = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
// A relative 1e-9 of the point, or an absolute 1e-12 for a point at 0.
const closeTo = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance * Math.max(Math.abs(b), 1e-3);

describe("Student's t curve against SciPy", () => {
  it("has the quantile of every fixture point (17 probabilities from 0.001 to 0.999 and 18 degrees of freedom from 1 to 2000) to a relative 1e-9", () => {
    expect(fixture.tPpf.length).toBe(17 * 18);
    for (const { p, df, t } of fixture.tPpf as { p: number; df: number; t: number }[]) {
      const got = tQuantile(p, df);
      expect(closeTo(got, t), `p=${p} df=${df}: ${got} vs ${t}`).toBe(true);
    }
  });
  it("has the 80 % range's point for every number of degrees of freedom from 1 to 200 to a relative 1e-9", () => {
    expect(fixture.t80.length).toBe(200);
    for (const { df, t } of fixture.t80 as { df: number; t: number }[]) expect(relative(tQuantile(LIKELY, df), t), `df=${df}`).toBeLessThan(1e-9);
  });
  it("has the chance at every fixture point, tails far below 0 included (t = −50 at 30 degrees of freedom, −10 at 2000), to a relative 1e-9", () => {
    expect(fixture.tCdf.length).toBe(18 * 18);
    for (const { t, df, p } of fixture.tCdf as { t: number; df: number; p: number }[]) {
      const got = tCdf(t, df);
      expect(relative(got, p) < 1e-12 || (p < 1e-300 && got < 1e-300), `t=${t} df=${df}: ${got} vs ${p}`).toBe(true);
    }
  });
  it("is the reference's curve, which is itself SciPy's to a relative 1e-10 (the incomplete beta function against the finite sums)", () => {
    for (const { p, df, t } of fixture.tPpf as { p: number; df: number; t: number }[]) {
      if (p < 0.5) continue;
      expect(closeTo(referenceTQuantile(p, df), t, 1e-10), `reference p=${p} df=${df}`).toBe(true);
    }
    // A difference of logarithms of large Γ values (ν = 2000 gives about 5900 each) leaves a relative 1e-13 in the factor in front.
    for (const { t, df, p } of fixture.tCdf as { t: number; df: number; p: number }[]) expect(relative(referenceTCdf(t, df), p) < 1e-9 || p < 1e-300, `reference t=${t} df=${df}`).toBe(true);
  });
});

describe("Student's t curve against the reference on generated points", () => {
  it(`has the reference's chance to a relative 1e-9 (tails too) and its quantile to a relative 1e-11 (${numRuns * 3} points, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.double({ min: -40, max: 40, noNaN: true }), fc.integer({ min: 1, max: 300 }), fc.double({ min: 0.55, max: 0.995, noNaN: true }), (t, df, p) => {
        expect(Math.abs(tCdf(t, df) - referenceTCdf(t, df)), `cdf t=${t} df=${df}`).toBeLessThan(1e-9 * referenceTCdf(t, df) + 1e-16);
        expect(relative(tQuantile(p, df), referenceTQuantile(p, df)), `quantile p=${p} df=${df}`).toBeLessThan(1e-11);
      }),
      { numRuns: numRuns * 3, seed },
    );
  });
});

describe("Student's t curve, worked by hand", () => {
  it("is 3/4 at 1 for one degree of freedom (the Cauchy curve: 1/2 + atan(t)/π), and its quartile is 1", () => {
    expect(tCdf(1, 1)).toBeCloseTo(0.75, 15);
    expect(tCdf(-1, 1)).toBeCloseTo(0.25, 15);
    expect(tQuantile(0.75, 1)).toBeCloseTo(1, 14);
  });
  it("is 1/2 + t ÷ (2 · √(2 + t²)) for two degrees of freedom, which gives √(2) ÷ ... : 0.9 lies at 1.8856180831641267 (= 4/√(4.5) ÷ ... , solved from the closed form)", () => {
    for (const t of [-3, -0.5, 0.25, 1, 7]) expect(relative(tCdf(t, 2), 0.5 + t / (2 * Math.sqrt(2 + t * t)))).toBeLessThan(1e-12);
    // 0.9 = 1/2 + t ÷ (2 √(2 + t²)) gives t² = 2 · 0.64 ÷ (1 − 0.64) ... worked: (0.8)² = t² ÷ (2 + t²), so t² = 3.5556 and t = 1.8856.
    expect(tQuantile(0.9, 2)).toBeCloseTo(Math.sqrt((2 * 0.64) / 0.36), 14);
  });
  it("is the textbook table's point: the 90th percentile is 1.533 at 4 degrees of freedom, 1.372 at 10, 1.310 at 30 and 1.282 for a great many", () => {
    expect(tQuantile(0.9, 4)).toBeCloseTo(1.5332, 4);
    expect(tQuantile(0.9, 10)).toBeCloseTo(1.3722, 4);
    expect(tQuantile(0.9, 30)).toBeCloseTo(1.3104, 4);
    expect(Math.abs(tQuantile(0.9, MOST_DF) - Z80)).toBeLessThan(1e-4);
    expect(Math.abs(normalCdf(tQuantile(0.9, MOST_DF)) - 0.9)).toBeLessThan(1e-4);
  });
  it("is 1/2 at 0 for every degree of freedom, and 0 for the quantile of 1/2", () => {
    for (const df of [1, 2, 3, 4, 7, 100]) {
      expect(tCdf(0, df)).toBe(0.5);
      expect(tQuantile(0.5, df)).toBe(0);
    }
  });
});

describe("Student's t curve, properties", () => {
  it(`is symmetric, ordered, within 0 and 1, and its quantile inverts it (${numRuns * 2} cases, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.double({ min: -60, max: 60, noNaN: true }), fc.double({ min: 0, max: 5, noNaN: true }), fc.integer({ min: 1, max: 400 }), fc.double({ min: 0.001, max: 0.999, noNaN: true }), (t, step, df, p) => {
        expect(Math.abs(tCdf(t, df) + tCdf(-t, df) - 1)).toBeLessThanOrEqual(2.3e-16);
        // Ordered up to the last digit of a double (the chance of a tail is 0.5 less half of what lies within).
        expect(tCdf(t + step, df)).toBeGreaterThanOrEqual(tCdf(t, df) - 2.3e-16);
        expect(tCdf(t, df)).toBeGreaterThanOrEqual(0);
        expect(tCdf(t, df)).toBeLessThanOrEqual(1);
        const q = tQuantile(p, df);
        expect(Math.abs(tCdf(q, df) - p)).toBeLessThan(1e-12);
        expect(tQuantile(1 - p, df)).toBeCloseTo(-q, 9);
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
  it("has a wider tail for fewer degrees of freedom: the 0.9 point falls as degrees of freedom rise", () => {
    let last = Infinity;
    for (let df = 1; df <= 120; df++) {
      const q = tQuantile(LIKELY, df);
      expect(q, `df=${df}`).toBeLessThan(last);
      expect(q).toBeGreaterThan(Z80);
      last = q;
    }
  });
});

describe("Student's t curve on hostile arguments", () => {
  it("is NaN for degrees of freedom that are not a whole number from 1 to the most (one step either side of each end)", () => {
    for (const df of [0, -1, 0.5, 1.5, 2.0000001, NaN, Infinity, -Infinity, MOST_DF + 1]) {
      expect(tCdf(1, df), String(df)).toBeNaN();
      expect(tQuantile(0.9, df), String(df)).toBeNaN();
    }
    expect(tCdf(1, 1)).not.toBeNaN();
    expect(tQuantile(0.9, 1)).not.toBeNaN();
    expect(tCdf(1, MOST_DF)).not.toBeNaN();
    expect(tQuantile(0.9, MOST_DF)).not.toBeNaN();
  });
  it("is NaN for a probability outside 0.001 to 0.999 and for NaN (one step either side of each end), and the ends are the extremes", () => {
    for (const p of [0, 0.0009999999, 0.9990000001, 1, -0.5, 2, NaN, Infinity, -Infinity]) expect(tQuantile(p, 5), String(p)).toBeNaN();
    for (const p of [0.001, 0.999]) expect(tQuantile(p, 5), String(p)).not.toBeNaN();
    expect(tCdf(NaN, 5)).toBeNaN();
    expect(tCdf(Infinity, 5)).toBe(1);
    expect(tCdf(-Infinity, 5)).toBe(0);
    expect(tCdf(1e300, 5)).toBe(1);
    expect(tCdf(-1e300, 5)).toBe(0);
    expect(tCdf(1e300, 1)).toBeCloseTo(1, 15);
  });
  it("does not lose a digit to a huge t: the chance at 1e150 is 1 and at −1e150 is 0 (even and odd degrees of freedom)", () => {
    for (const df of [1, 2, 3, 4, 5]) {
      expect(tCdf(1e150, df)).toBeCloseTo(1, 15);
      expect(tCdf(-1e150, df)).toBeCloseTo(0, 15);
    }
  });
});
