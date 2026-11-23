// Exact fractions for the Methods: each result is in lowest terms, worked out by hand, and equal to the fraction of the exact decimal.
import { describe, expect, it } from "vitest";
import { fractionOf } from "../exact";
import { add, div, mul, sub, total, whole } from "./fractions";

const [a, b] = [fractionOf(0.1), fractionOf(0.2)];

describe("fractions in lowest terms", () => {
  it("add, subtract, multiply and divide as arithmetic does, with no digit lost to a double: 0.1 + 0.2 is 3/10", () => {
    expect(add(a, b)).toEqual({ num: 3n, den: 10n });
    expect(sub(b, a)).toEqual({ num: 1n, den: 10n });
    expect(sub(a, b)).toEqual({ num: -1n, den: 10n });
    expect(mul(a, b)).toEqual({ num: 1n, den: 50n });
    expect(div(b, a)).toEqual({ num: 2n, den: 1n });
    expect(div(a, { num: -2n, den: 1n })).toEqual({ num: -1n, den: 20n });
  });
  it("make a whole number a fraction, and total some, 0 for none", () => {
    expect(whole(7)).toEqual({ num: 7n, den: 1n });
    expect(whole(-3)).toEqual({ num: -3n, den: 1n });
    expect(total([a, b, fractionOf(0.7)])).toEqual({ num: 1n, den: 1n });
    expect(total([])).toEqual({ num: 0n, den: 1n });
  });
});
