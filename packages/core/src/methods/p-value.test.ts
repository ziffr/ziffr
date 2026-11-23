// The chance of a correlation by luck (spec 0041, ticket 13): held to Student's t from SciPy over a grid of r and n (whole and
// fractional, tiny chances included), to SciPy's pearsonr on generated data, to a reference written from the definition by
// numerical integration, to the finite sums of Abramowitz and Stegun for whole degrees of freedom, and to the cases worked by
// hand: with 1, 2 and 4 degrees of freedom the chance is 1 − (2/π)·asin|r|, 1 − |r| and 1 − |r|·(3 − r²)/2.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pearson } from "../correlation";
import { FIXTURE, HASHES } from "../test/reference/heads-up-fixture";
import { referenceChance, referenceChanceClosed, lnGammaStirling } from "../test/reference/heads-up";
import { close } from "../test/reference/methods-fixture";
import { runs } from "../test/reference/check";
import { pValueOfR } from "./p-value";

const { numRuns, seed } = runs();

describe("the SciPy fixture", () => {
  it("was made by the current script (heads-up.py), and names the tools", () => {
    expect(HASHES.fixture, "run python3 packages/core/src/test/reference/fixtures/heads-up.py again").toBe(HASHES.script);
    expect(FIXTURE.version).toBe(1);
    expect(Object.keys(FIXTURE.tools).sort()).toEqual(["numpy", "scipy"]);
  });
});

describe("pValueOfR against SciPy's Student t", () => {
  it(`agrees to a relative 1e-9 over the whole grid (${FIXTURE.chances.length} points, chances down to 1e-300)`, () => {
    expect(FIXTURE.chances.length).toBeGreaterThan(500);
    for (const { r, n, p } of FIXTURE.chances) {
      const got = pValueOfR(r, n);
      expect(Math.abs(got - p) <= 1e-9 * p + 1e-300, `r=${r} n=${n}: ${got} against SciPy's ${p}`).toBe(true);
    }
  });
  it("agrees with pearsonr's own chance on generated data, with r from the exact correlation", () => {
    for (const c of FIXTURE.pearson) {
      const pairs = c.x.map((x, i) => ({ period: String(i), x, y: c.y[i] }));
      const r = pearson(pairs.map((p) => ({ period: p.period, value: p.x })), pairs.map((p) => ({ period: p.period, value: p.y })))!;
      expect(close(r.r, c.r, 1e-12)).toBe(true);
      expect(Math.abs(pValueOfR(r.r, r.n) - c.p) <= 1e-9 * c.p + 1e-300, `${c.p}`).toBe(true);
    }
  });
});

describe("pValueOfR against the references", () => {
  it("is worked out by hand for 1, 2 and 4 degrees of freedom, for every r", () => {
    for (const r of [0.001, 0.1, 0.25, 0.5, 0.7, 0.9, 0.99, 0.9999, -0.3, -0.8]) {
      const a = Math.abs(r);
      expect(close(pValueOfR(r, 3), 1 - (2 / Math.PI) * Math.asin(a), 1e-12), `df 1, r ${r}`).toBe(true);
      expect(close(pValueOfR(r, 4), 1 - a, 1e-12), `df 2, r ${r}`).toBe(true);
      expect(close(pValueOfR(r, 6), 1 - (a * (3 - r * r)) / 2, 1e-12), `df 4, r ${r}`).toBe(true);
    }
    // r = 0.5 over 3 pairs is exactly 2/3.
    expect(close(pValueOfR(0.5, 3), 2 / 3, 1e-14)).toBe(true);
  });
  it("is the reference's integral, and the closed sums, for whole degrees of freedom up to 118", () => {
    for (let df = 1; df <= 118; df++) {
      for (const r of [0.05, 0.3, 0.6, 0.85, 0.97]) {
        const got = pValueOfR(r, df + 2);
        const integral = referenceChance(r, df + 2);
        expect(Math.abs(got - integral) <= 1e-11 * integral + 1e-300, `df ${df} r ${r}: ${got} against ${integral}`).toBe(true);
        // The closed sums give 1 − A, so are only as exact as 1 minus almost 1.
        expect(Math.abs(got - referenceChanceClosed(r, df)) <= 1e-12, `closed, df ${df} r ${r}`).toBe(true);
      }
    }
  });
  it("is the reference's integral for fractional counts and tiny chances", () => {
    for (const [r, n] of [[0.99, 7.5], [0.9999, 30.25], [0.99999999, 60.5], [0.2, 4.01], [0.5, 119.9]] as const) {
      const [got, ref] = [pValueOfR(r, n), referenceChance(r, n)];
      expect(Math.abs(got - ref) <= 1e-10 * ref, `${r} ${n}: ${got} ${ref}`).toBe(true);
    }
  });
  it("has the reference's own gamma function right: ln Γ(1) = 0, Γ(1/2) = √π, Γ(5) = 24, Γ(11/2) = 945√π/32", () => {
    expect(Math.abs(lnGammaStirling(1))).toBeLessThan(1e-14);
    expect(Math.abs(lnGammaStirling(0.5) - 0.5 * Math.log(Math.PI))).toBeLessThan(1e-14);
    expect(Math.abs(lnGammaStirling(5) - Math.log(24))).toBeLessThan(1e-13);
    expect(Math.abs(lnGammaStirling(5.5) - Math.log((945 * Math.sqrt(Math.PI)) / 32))).toBeLessThan(1e-13);
  });
});

describe("pValueOfR as a number", () => {
  it("is exactly 1 for r = 0 and exactly 0 for |r| = 1, whatever the count", () => {
    for (const n of [3, 4, 12, 30.5, 1e6]) {
      expect(pValueOfR(0, n)).toBe(1);
      expect(pValueOfR(-0, n)).toBe(1);
      expect(pValueOfR(1, n)).toBe(0);
      expect(pValueOfR(-1, n)).toBe(0);
    }
  });
  it("is NaN where it cannot be said: r not in -1 to 1 or not a number, a count under 3 or not a number", () => {
    for (const [r, n] of [[1.0000001, 20], [-1.5, 20], [NaN, 20], [Infinity, 20], [0.5, 2.999], [0.5, 2], [0.5, 0], [0.5, -4], [0.5, NaN], [0.5, Infinity], [0.5, -Infinity]] as const) expect(pValueOfR(r, n), `${r} ${n}`).toBeNaN();
  });
  it("is symmetric in the sign of r and never below 0 or above 1 (a grid of 400,000 shapes, no NaN)", () => {
    let seen = 0;
    for (let i = 1; i <= 800; i++) {
      for (let j = 0; j < 500; j++) {
        const [r, n] = [(i / 801) ** (1 + (j % 5)) * (i % 2 ? 1 : 1), 3 + (j / 499) * 200];
        const p = pValueOfR(r, n);
        expect(p >= 0 && p <= 1, `${r} ${n} ${p}`).toBe(true);
        expect(pValueOfR(-r, n)).toBe(p);
        seen++;
      }
    }
    expect(seen).toBe(400_000);
  });
  it(`falls as |r| grows and as n grows (${numRuns} generated), and is the same twice`, () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 0.999, noNaN: true }), fc.double({ min: 0.001, max: 0.999, noNaN: true }), fc.double({ min: 3.5, max: 150, noNaN: true }), fc.double({ min: 0.5, max: 50, noNaN: true }), (r1, r2, n, extra) => {
        const [lo, hi] = r1 < r2 ? [r1, r2] : [r2, r1];
        expect(pValueOfR(hi, n)).toBeLessThanOrEqual(pValueOfR(lo, n));
        expect(pValueOfR(lo, n + extra)).toBeLessThanOrEqual(pValueOfR(lo, n));
        expect(pValueOfR(lo, n)).toBe(pValueOfR(lo, n));
      }),
      { numRuns, seed },
    );
  });
});
