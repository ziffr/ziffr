// The normal curve against SciPy and an exact reference (spec 0041, "Distributions"): Φ(z) from SciPy's `norm.cdf` over both tails
// and across the switch between the series and the continued fraction, from the fixed-point series of the reference
// (test/reference/forecast.ts), properties (symmetry, order, bounds), and the points that are known: Φ(0) = 1/2, 1.96 → 97.5 %.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { referenceNormalCdf } from "../test/reference/forecast";
import { normalCdf, Z80 } from "./normal-curve";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/forecast.json", import.meta.url), "utf8"));
const relative = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), Number.MIN_VALUE);

describe("the normal curve", () => {
  it("equals SciPy's norm.cdf to a relative 1e-9 at every fixture point, in both tails and across the switch at |z| = 3.54 (below −30 a double's tail is a denormal and says nothing)", () => {
    expect(fixture.normal.length).toBeGreaterThan(150);
    for (const { z, cdf } of fixture.normal as { z: number; cdf: number }[]) expect(relative(normalCdf(z), cdf), `z=${z}`).toBeLessThan(1e-9);
  });
  it("equals the reference (a 150-digit series) to a relative 1e-12 for |z| up to 12, and the reference equals SciPy to 1e-13", () => {
    for (const { z, cdf } of fixture.normal as { z: number; cdf: number }[]) {
      if (Math.abs(z) > 12) continue;
      expect(relative(referenceNormalCdf(z), cdf), `reference z=${z}`).toBeLessThan(1e-13);
      expect(relative(normalCdf(z), referenceNormalCdf(z)), `z=${z}`).toBeLessThan(1e-12);
    }
  });
  it(`equals the reference to a relative 1e-12 on generated points between −12 and 12 (${numRuns * 3} points, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.double({ min: -12, max: 12, noNaN: true }), (z) => {
        expect(relative(normalCdf(z), referenceNormalCdf(z)), String(z)).toBeLessThan(1e-12);
      }),
      { numRuns: numRuns * 3, seed },
    );
  });
  it("is exactly 1/2 at 0, 97.5 % at 1.96 and 90 % at the 80 % range's multiplier, as SciPy's quantiles say", () => {
    expect(normalCdf(0)).toBe(0.5);
    expect(Math.abs(normalCdf(fixture.z975) - 0.975)).toBeLessThan(1e-15);
    expect(Z80).toBe(fixture.z80);
    expect(Math.abs(normalCdf(Z80) - 0.9)).toBeLessThan(1e-15);
    expect(Math.abs(normalCdf(-Z80) - 0.1)).toBeLessThan(1e-15);
  });
  it("keeps the digits of a tiny chance: Φ(−8) is 6.22e-16, not 0 and not a rounded 1 − Φ(8)", () => {
    expect(relative(normalCdf(-8), 6.220960574271785e-16)).toBeLessThan(1e-9);
  });
  it("is symmetric, ordered and within 0 and 1", () => {
    fc.assert(
      fc.property(fc.double({ min: -40, max: 40, noNaN: true }), fc.double({ min: 0, max: 3, noNaN: true }), (z, step) => {
        expect(Math.abs(normalCdf(z) + normalCdf(-z) - 1)).toBeLessThanOrEqual(2.3e-16);
        expect(normalCdf(z + step)).toBeGreaterThanOrEqual(normalCdf(z));
        expect(normalCdf(z)).toBeGreaterThanOrEqual(0);
        expect(normalCdf(z)).toBeLessThanOrEqual(1);
      }),
      { numRuns, seed },
    );
  });
  it("is NaN for NaN, and 0 and 1 at the ends", () => {
    expect(normalCdf(NaN)).toBeNaN();
    expect(normalCdf(-Infinity)).toBe(0);
    expect(normalCdf(Infinity)).toBe(1);
    expect(normalCdf(-40)).toBe(0);
    expect(normalCdf(40)).toBe(1);
  });
});
