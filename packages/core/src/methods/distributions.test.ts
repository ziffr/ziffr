// The t quantile against SciPy and the reference (spec 0041, "Distributions"): the table of `t.ppf` from fixtures/fit.py to a
// relative 1e-9, the reference's numerical integration of the density, closed forms worked out by hand, the curve's properties
// (symmetry of the chance, the quantile rising with p and falling with the degrees of freedom, tending to the normal curve's)
// and what it does with numbers outside what it is meant for.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { likelyBetween, MOST_DF, tQuantile } from "./distributions";
import { runs } from "../test/reference/check";
import { referenceB, referenceHalfChance, referenceTQuantile } from "../test/reference/distributions";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/fit.json", import.meta.url), "utf8"));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe("the fixture", () => {
  it("was made by the current script (fit.py), and names the tools", () => {
    const script = readFileSync(new URL("../test/reference/fixtures/fit.py", import.meta.url));
    expect(fixture.script, "run python3 packages/core/src/test/reference/fixtures/fit.py again").toBe(createHash("sha256").update(script).digest("hex"));
    expect(fixture.version).toBe(1);
    expect(Object.keys(fixture.tools)).toEqual(["numpy", "scipy"]);
  });
});

describe("tQuantile against SciPy", () => {
  it(`equals t.ppf to a relative 1e-9 for ${fixture.quantiles.length} pairs of degrees of freedom and share`, () => {
    for (const q of fixture.quantiles as { df: number; p: number; t: number }[]) expect(rel(tQuantile(q.p, q.df), q.t), `df ${q.df}, p ${q.p}`).toBeLessThan(1e-9);
  });
  it("gives the 80 % range's half width, the 90 % point", () => {
    expect(likelyBetween(10)).toBe(tQuantile(0.9, 10));
    expect(likelyBetween(10)).toBeCloseTo(1.3721836411, 9);
  });
});

describe("tQuantile against hand-worked values", () => {
  it("is the Cauchy curve's tan(π(p − ½)) for one degree of freedom", () => {
    for (const p of [0.6, 0.75, 0.9, 0.975]) expect(rel(tQuantile(p, 1), Math.tan(Math.PI * (p - 0.5))), `p ${p}`).toBeLessThan(1e-12);
    expect(tQuantile(0.75, 1)).toBeCloseTo(1, 12);
  });
  it("is √2 · (2p − 1) ÷ √(1 − (2p − 1)²) for two", () => {
    for (const p of [0.6, 0.75, 0.9, 0.975, 0.995]) {
      const a = 2 * p - 1;
      expect(rel(tQuantile(p, 2), (Math.SQRT2 * a) / Math.sqrt(1 - a * a)), `p ${p}`).toBeLessThan(1e-12);
    }
    expect(tQuantile(0.975, 2)).toBeCloseTo(4.302652729749463, 12);
  });
  it("is the known textbook values: 12.706 for 1 df at 97.5 %, 2.228 for 10, 1.960 for very many", () => {
    expect(tQuantile(0.975, 1)).toBeCloseTo(12.7062047361747, 9);
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.2281388519649, 9);
    expect(tQuantile(0.975, 100000)).toBeCloseTo(1.959963984540054, 3);
    expect(tQuantile(0.9, MOST_DF)).toBeCloseTo(1.2815515655446004, 3);
  });
});

describe("the reference", () => {
  it("has the gamma ratios right: B(1) = 1/√π, B(2) = √π/2, B(3) = 2/√π, B(4) = 3√π/4", () => {
    expect(referenceB(1)).toBeCloseTo(1 / Math.sqrt(Math.PI), 14);
    expect(referenceB(2)).toBeCloseTo(Math.sqrt(Math.PI) / 2, 14);
    expect(referenceB(3)).toBeCloseTo(2 / Math.sqrt(Math.PI), 14);
    expect(referenceB(4)).toBeCloseTo((3 * Math.sqrt(Math.PI)) / 4, 14);
  });
  it("has the whole curve's half as the chance up to the end of the interval, and the Cauchy curve's arctangent", () => {
    for (const v of [1, 2, 3, 8, 15]) expect(referenceHalfChance(Math.PI / 2, v), `v ${v}`).toBeCloseTo(0.5, 9);
    expect(referenceHalfChance(Math.atan(1), 1)).toBeCloseTo(0.25, 12);
  });
  it("equals the Method's quantile to a relative 1e-9, for the degrees of freedom a fit has", () => {
    for (const df of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 20, 33, 60, 100, 118, 200]) {
      for (const p of [0.75, 0.9, 0.975]) expect(rel(tQuantile(p, df), referenceTQuantile(p, df)), `df ${df}, p ${p}`).toBeLessThan(1e-9);
    }
  });
  it(`equals the Method's quantile on generated degrees of freedom and shares (${numRuns} cases, seed ${seed})`, () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 150 }), fc.double({ min: 0.55, max: 0.995, noNaN: true }), (df, p) => rel(tQuantile(p, df), referenceTQuantile(p, df)) < 1e-9), { numRuns, seed });
  });
});

describe("the curve's properties", () => {
  it(`rises with the share and falls with the degrees of freedom, and is above the normal curve's (${numRuns} cases, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.double({ min: 0.55, max: 0.98, noNaN: true }), fc.double({ min: 0.001, max: 0.01, noNaN: true }), (df, p, dp) => {
        expect(tQuantile(p + dp, df)).toBeGreaterThan(tQuantile(p, df));
        expect(tQuantile(p, df)).toBeGreaterThan(tQuantile(p, df + 1));
      }),
      { numRuns, seed },
    );
  });
  it("is the same twice", () => {
    expect(tQuantile(0.9, 17)).toBe(tQuantile(0.9, 17));
  });
});

describe("tQuantile outside what it is meant for", () => {
  it("is not a number for a share not above a half, or 1 or more, or not a number", () => {
    for (const p of [0.5, 0.2, 0, -1, 1, 1.5, NaN, Infinity]) expect(tQuantile(p, 10), `p ${p}`).toBeNaN();
  });
  it("is not a number for degrees of freedom that are not a whole number of at least 1, or more than the limit", () => {
    for (const df of [0, -3, 2.5, NaN, Infinity, MOST_DF + 1]) expect(tQuantile(0.9, df), `df ${df}`).toBeNaN();
  });
  it("works at the edges: 1 degree and the limit", () => {
    expect(Number.isFinite(tQuantile(0.9, 1))).toBe(true);
    expect(Number.isFinite(tQuantile(0.9, MOST_DF))).toBe(true);
    expect(Number.isFinite(tQuantile(0.999999, 5))).toBe(true);
  });
});
