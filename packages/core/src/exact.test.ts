// Exact arithmetic (spec 0022, "Exact results"), on results worked out by hand; the generated tests against the
// references (aggregations-*.test.ts, changes.test.ts) hold every caller to it.
import { describe, expect, it } from "vitest";
import { bitLength, changeBeyond, changePct, exactTotal, fractionOf, lowestTerms, nearestDouble, percentOf, scaled } from "./exact";

describe("exact arithmetic", () => {
  it("reads a value from its shortest text", () => {
    expect(scaled(1.25)).toEqual({ digits: BigInt(125), places: 2 });
    expect(scaled(1e-7)).toEqual({ digits: BigInt(1), places: 7 });
    expect(scaled(1e21)).toEqual({ digits: BigInt(10) ** BigInt(21), places: 0 });
    expect(fractionOf(-0.5)).toEqual({ num: BigInt(-5), den: BigInt(10) });
  });
  it("turns a fraction into the nearest double, ties to even", () => {
    expect(nearestDouble(BigInt(3), BigInt(10))).toBe(0.3);
    expect(nearestDouble(BigInt(-1), BigInt(3))).toBe(-1 / 3);
    expect(Object.is(nearestDouble(BigInt(0), BigInt(7)), 0)).toBe(true);
    expect(nearestDouble(BigInt(-3), BigInt(4))).toBe(-0.75);
    // 2^53 + 1 lies halfway between 2^53 and 2^53 + 2: the even one, 2^53; 2^53 + 3 between + 2 and + 4: + 4.
    expect(nearestDouble(BigInt(2) ** BigInt(53) + BigInt(1), BigInt(1))).toBe(2 ** 53);
    expect(nearestDouble(BigInt(2) ** BigInt(53) + BigInt(3), BigInt(1))).toBe(2 ** 53 + 4);
  });
  it("adds and averages exactly, and leaves values that are not numbers to doubles", () => {
    expect(exactTotal([0.1, 0.2], 1)).toBe(0.3);
    expect(exactTotal(Array(1000).fill(0.01), 1)).toBe(10);
    expect(exactTotal([1, 2], 2)).toBe(1.5);
    expect(exactTotal([1, Infinity], 1)).toBeNaN();
  });
  it("keeps fractions in lowest terms and measures them in bits", () => {
    const b = (n: number) => BigInt(n);
    expect(lowestTerms({ num: b(-6), den: b(4) })).toEqual({ num: b(-3), den: b(2) });
    expect(lowestTerms({ num: b(0), den: b(7) })).toEqual({ num: b(0), den: b(1) });
    expect(lowestTerms({ num: b(3), den: b(5) })).toEqual({ num: b(3), den: b(5) });
    expect(lowestTerms({ num: b(6), den: b(4) })).toEqual({ num: b(3), den: b(2) });
    expect([bitLength(b(0)), bitLength(b(1)), bitLength(b(-255)), bitLength(b(256))]).toEqual([1, 1, 8, 9]);
  });
  it("divides by a negative value", () => {
    expect(percentOf(1, -4)).toBe(-25);
    expect(percentOf(-0.1, -0.3)).toBe(100 / 3);
  });
  it("decides a change beyond a limit exactly", () => {
    expect(changeBeyond(1.1, 1, 10)).toBe(false);
    expect(changeBeyond(1.100001, 1, 10)).toBe(true);
    expect(changeBeyond(-1.1, -1, 10)).toBe(false);
    expect(changeBeyond(0.875, 1, 12.5)).toBe(false);
    expect(changeBeyond(0.874, 1, 12.5)).toBe(true);
    expect([changeBeyond(Infinity, 1, 10), changeBeyond(1, NaN, 10), changeBeyond(2, 1, Infinity)]).toEqual([false, false, false]);
    expect(changePct(5, -10)).toBe(150);
  });
});
