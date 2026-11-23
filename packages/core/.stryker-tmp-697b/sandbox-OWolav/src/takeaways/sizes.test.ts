// @ts-nocheck
// How a size is written (spec 0041, rule 10): in the Number Style and the unit, with its sign, never so rounded that a size that
// is not zero reads as zero.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { decimalsApart, decimalsFor, plainValue, SHARE_UNIT, signedText, sizeText, valueText } from "./sizes";

const { numRuns, seed } = runs();
const eur = { unit: "€", unit_position: "after", decimals: 0 } as const;
const usd = { unit: "$", unit_position: "before", decimals: 2 } as const;

describe("the decimals a size needs", () => {
  it("are the base where every size shows a digit that is not zero, and more where one would read as 0 (one step either side)", () => {
    expect(decimalsFor([0.5, 12, 1234], 0, "1,234.5")).toBe(0);
    expect(decimalsFor([0.4], 0, "1,234.5")).toBe(1);
    expect(decimalsFor([0.04], 0, "1,234.5")).toBe(2);
    expect(decimalsFor([0.049, 3], 1, "1,234.5")).toBe(2);
    expect(decimalsFor([0.05], 1, "1,234.5")).toBe(1);
    expect(decimalsFor([0.0499], 1, "1,234.5")).toBe(2);
    expect(decimalsFor([-0.0004, 7], 1, "1,234.5")).toBe(4);
    expect(decimalsFor([1e-20], 0, "1,234.5")).toBe(20);
    expect(decimalsFor([4e-21], 0, "1,234.5")).toBeNull();
    expect(decimalsFor([0.3, 4e-21], 0, "1,234.5")).toBeNull();
  });
  it("leave a size of exactly 0 alone, and an empty list at the base", () => {
    expect(decimalsFor([0, -0], 1, "1,234.5")).toBe(1);
    expect(decimalsFor([], 3, "1,234.5")).toBe(3);
    expect(decimalsFor([5], 2, "1,234.5")).toBe(2);
  });
  it("hold a base that is not a number of places to 0 to 20", () => {
    expect(decimalsFor([5], -3, "1,234.5")).toBe(0);
    expect(decimalsFor([5], 99, "1,234.5")).toBe(20);
    expect(decimalsFor([5], 20, "1,234.5")).toBe(20);
  });
  it(`never leaves a size that is not zero reading as zero, in any Number Style (${numRuns * 2} sizes, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }).map((v) => v * 1e-12), fc.constantFrom("1,234.5", "1.234,5", "1 234,5", "1'234.5"), fc.integer({ min: 0, max: 3 }), (a, b, style, base) => {
        const d = decimalsFor([a, b], base, style as "1,234.5");
        if (d === null) return;
        for (const v of [a, b]) if (v !== 0) expect(sizeText(v, { unit: "", unit_position: "after", decimals: 0 }, d, style as "1,234.5"), String(v)).toMatch(/[1-9]/);
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
});

describe("how a size is written", () => {
  it("is without its sign for a size, with + or − (± for exactly none) for a signed size, and with the minus only for a plain value", () => {
    expect(sizeText(-12.5, eur, 1, "1,234.5")).toBe("12.5 €");
    expect(signedText(12.5, eur, 1, "1,234.5")).toBe("+12.5 €");
    expect(signedText(-12.5, eur, 1, "1,234.5")).toBe("−12.5 €");
    expect(signedText(0, eur, 1, "1,234.5")).toBe("±0.0 €");
    expect(valueText(-12.5, eur, 1, "1,234.5")).toBe("−12.5 €");
    expect(valueText(12.5, eur, 1, "1,234.5")).toBe("12.5 €");
  });
  it("stands the unit on its side and writes the Number Style's marks", () => {
    expect(sizeText(1234.5, usd, 2, "1.234,5")).toBe("$1.234,50");
    expect(signedText(-1234.5, usd, 2, "1 234,5")).toMatch(/^−\$1.234,50$/);
    expect(signedText(5, SHARE_UNIT, 1, "1,234.5")).toBe("+5.0 %");
  });
  it("writes a number for Show the numbers with the decimals it needs, and in scientific form where none would show it", () => {
    expect(plainValue(1234.5, eur, 0, "1,234.5")).toBe("1,235 €");
    expect(plainValue(-0.04, eur, 0, "1,234.5")).toBe("−0.04 €");
    expect(plainValue(2.5e-25, eur, 0, "1,234.5")).toBe("2.50e-25 €");
    expect(plainValue(-2.5e-25, usd, 2, "1,234.5")).toBe("−$2.50e-25");
    expect(plainValue(0, eur, 0, "1,234.5")).toBe("0 €");
  });
  it("leaves no stray space for a value with no unit", () => {
    expect(plainValue(3e-30, { unit: "", unit_position: "after", decimals: 0 }, 0, "1,234.5")).toBe("3.00e-30");
  });
});

describe("decimals that tell values apart", () => {
  it("are those of decimalsFor where every pair that differs already reads differently, and more where two would read the same (1.011 and 0.886 need one decimal, not 0)", () => {
    expect(decimalsApart([5, 3], 0, "1,234.5")).toBe(0);
    expect(decimalsApart([1.011, 0.886], 0, "1,234.5")).toBe(1);
    expect(decimalsApart([1.04, 1.01], 0, "1,234.5")).toBe(2);
    expect(decimalsApart([1.04, 1.01, 1.4], 1, "1,234.5")).toBe(2);
    expect(decimalsApart([0.5, -0.5], 0, "1,234.5")).toBe(0);
  });
  it("leave equal values and a lone value alone, and count a sign as a difference", () => {
    expect(decimalsApart([2, 2, 2], 0, "1,234.5")).toBe(0);
    expect(decimalsApart([], 2, "1,234.5")).toBe(2);
    expect(decimalsApart([0.4, -0.4], 0, "1,234.5")).toBe(1);
    expect(decimalsApart([0, -0], 0, "1,234.5")).toBe(0);
  });
  it("are none where two values differ below the most decimals, or one is too small to show", () => {
    expect(decimalsApart([3e-20, 3.4e-20], 0, "1,234.5")).toBeNull();
    expect(decimalsApart([1e-20, 3e-20], 0, "1,234.5")).toBe(20);
    expect(decimalsApart([4e-21], 0, "1,234.5")).toBeNull();
    // One shows at 20 decimals and the other does not: the Method cannot write both, and says null, not the 20 that suits the one.
    expect(decimalsApart([3e-20, 1e-21], 0, "1,234.5")).toBeNull();
  });
  it(`never writes two values that differ the same when it gives decimals (${numRuns * 2} lists, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -100, max: 100, noNaN: true }), { maxLength: 5 }), fc.integer({ min: 0, max: 3 }), (vs, base) => {
        const d = decimalsApart(vs, base, "1,234.5");
        if (d === null) return;
        const text = vs.map((v) => signedText(v, { unit: "", unit_position: "after", decimals: 0 }, d, "1,234.5"));
        for (const [i, v] of vs.entries()) for (const [j, w] of vs.entries()) if (v !== w) expect(text[i]).not.toBe(text[j]);
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
});
