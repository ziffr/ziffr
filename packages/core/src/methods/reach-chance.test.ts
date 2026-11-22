// The reach chance against SciPy and an exact reference (spec 0041, ticket 6): the chance a forecast value lands within a Target's
// limits, as the normal curve says, from the fixtures (fixtures/forecast.py), the reference's fixed-point Φ, hand-worked points,
// the refusals, and the properties (order, bounds, shift and scale, the two one-sided chances adding to 1).
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { referenceNormalCdf } from "../test/reference/forecast";
import { reachChance, type Limits } from "./reach-chance";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/forecast.json", import.meta.url), "utf8"));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), Number.MIN_VALUE);
const chance = (value: number, sd: number, min: number | null, max: number | null) => reachChance({ value, sd }, { min, max });

describe("the reach chance", () => {
  it("equals SciPy's normal curve: a relative 1e-9 with one limit, 1e-12 apart with two", () => {
    expect(fixture.reach.length).toBeGreaterThan(10);
    for (const r of fixture.reach as { value: number; sd: number; min: number | null; max: number | null; chance: number | null }[]) {
      const c = chance(r.value, r.sd, r.min, r.max);
      if (r.chance === null) expect(c, JSON.stringify(r)).toBeNull();
      else if (r.min === null || r.max === null) expect(rel(c!, r.chance), JSON.stringify(r)).toBeLessThan(1e-9);
      else expect(Math.abs(c! - r.chance), JSON.stringify(r)).toBeLessThan(1e-12);
    }
  });
  it("equals the reference's fixed-point curve on generated values, spreads and limits", () => {
    const number = fc.double({ min: -1000, max: 1000, noNaN: true });
    fc.assert(
      fc.property(number, fc.double({ min: 0.01, max: 500, noNaN: true }), number, number, (value, sd, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const phi = (x: number) => referenceNormalCdf(Math.max(-12, Math.min(12, x)));
        // The reference's curve is read to 12 spreads; beyond that the chance is below 2e-33 or above 1 less that.
        const clipped = (x: number) => Math.abs(x) <= 12;
        const [zMin, zMax] = [(value - lo) / sd, (hi - value) / sd];
        if (clipped(zMin)) expect(rel(chance(value, sd, lo, null)!, phi(zMin)), `min ${value} ${sd} ${lo}`).toBeLessThan(1e-12);
        if (clipped(zMax)) expect(rel(chance(value, sd, null, hi)!, phi(zMax)), `max ${value} ${sd} ${hi}`).toBeLessThan(1e-12);
        if (clipped(zMin) && clipped(zMax)) expect(Math.abs(chance(value, sd, lo, hi)! - (phi(zMax) - phi((lo - value) / sd))), `both`).toBeLessThan(1e-12);
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
  it("by hand: on the limit it is 1/2, 2 spreads short 2.275 %, 2 spreads over 97.725 %, within 1 spread either side 68.27 %", () => {
    expect(chance(100, 10, 100, null)).toBe(0.5);
    expect(chance(100, 10, null, 100)).toBe(0.5);
    expect(rel(chance(100, 10, 120, null)!, 0.022750131948179195)).toBeLessThan(1e-9);
    expect(Math.abs(chance(100, 10, 80, null)! - 0.9772498680518208)).toBeLessThan(1e-15);
    expect(Math.abs(chance(100, 10, 90, 110)! - 0.6826894921370859)).toBeLessThan(1e-12);
  });
  it("gives exactly 1 or 0 where the past had no miss (spread 0): the limits are inside, one step either side of them", () => {
    expect(chance(5, 0, 5, null)).toBe(1);
    expect(chance(5 - 1e-12, 0, 5, null)).toBe(0);
    expect(chance(5, 0, null, 5)).toBe(1);
    expect(chance(5 + 1e-12, 0, null, 5)).toBe(0);
    expect(chance(5, 0, 5, 5)).toBe(1);
    expect(chance(5, 0, 6, 7)).toBe(0);
    expect(chance(8, 0, 6, 7)).toBe(0);
    expect(chance(6.5, 0, 6, 7)).toBe(1);
  });
  it("says nothing without a Target, or for what is not a number, a negative spread or lower limit above the upper", () => {
    expect(chance(1, 1, null, null)).toBeNull();
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(chance(bad, 1, 0, null)).toBeNull();
      expect(chance(1, bad, 0, null)).toBeNull();
      expect(chance(1, 1, bad, null)).toBeNull();
      expect(chance(1, 1, null, bad)).toBeNull();
    }
    expect(chance(1, -1, 0, null)).toBeNull();
    expect(chance(1, 1, 2, 1)).toBeNull();
    // A lower limit equal to the upper is a point: possible, and not null.
    expect(chance(1, 1, 1, 1)).toBe(0);
  });
  it("is within 0 and 1, grows as the lower limit falls and as the upper rises, and the two one-sided chances add to 1", () => {
    const num = fc.integer({ min: -1000, max: 1000 });
    fc.assert(
      fc.property(num, fc.integer({ min: 1, max: 300 }), num, fc.integer({ min: 0, max: 400 }), (value, sd, limit, step) => {
        const [low, high] = [chance(value, sd, limit, null)!, chance(value, sd, null, limit)!];
        expect(low).toBeGreaterThanOrEqual(0);
        expect(low).toBeLessThanOrEqual(1);
        expect(Math.abs(low + high - 1)).toBeLessThanOrEqual(2.3e-16);
        expect(chance(value, sd, limit - step, null)!).toBeGreaterThanOrEqual(low);
        expect(chance(value, sd, null, limit + step)!).toBeGreaterThanOrEqual(high);
        // Both limits: the chance of the band is the chance of its lower limit being met, less that of the upper being passed.
        expect(Math.abs(chance(value, sd, limit, limit + step)! - (low - (1 - chance(value, sd, null, limit + step)!)))).toBeLessThan(1e-12);
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
  it("is the same for a shift of everything, and for a change of unit by a power of two (both exact)", () => {
    const num = fc.integer({ min: -1000, max: 1000 });
    fc.assert(
      fc.property(num, fc.integer({ min: 1, max: 300 }), num, num, fc.integer({ min: -8, max: 8 }), (value, sd, a, shift, power) => {
        const limits: Limits = { min: a, max: a + 50 };
        const base = reachChance({ value, sd }, limits);
        expect(reachChance({ value: value + shift, sd }, { min: a + shift, max: a + 50 + shift })).toBe(base);
        const k = 2 ** power;
        expect(reachChance({ value: value * k, sd: sd * k }, { min: a * k, max: (a + 50) * k })).toBe(base);
      }),
      { numRuns, seed },
    );
  });
});
