// Adding values up (spec 0022, spec 0028 step 2; GLOSSARY: Submission Rule): addUp against the reference, for values as
// people send them, with many decimals, big and small, and with halves at the sixth decimal.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addUp } from "./adding-up";
import { runs, valueText } from "./test/reference/check";
import { microUnits, referenceAdd } from "./test/reference/add";

const { numRuns, seed } = runs();

describe("adding up", () => {
  it("gives 0.3 for 0.1 + 0.2 and 0.2 for 0.3 - 0.1, the sums the database's numeric gave", () => {
    expect(addUp(0.1, 0.2)).toBe(0.3);
    expect(addUp(0.3, -0.1)).toBe(0.2);
    expect(addUp(0, 0)).toBe(0);
    expect(addUp(-1.5, 1.5)).toBe(0);
  });

  it("rounds to 6 decimals, halves away from zero", () => {
    expect(addUp(0.0000005, 0)).toBe(0.000001);
    expect(addUp(-0.0000005, 0)).toBe(-0.000001);
    expect(addUp(0.0000004, 0)).toBe(0);
    expect(addUp(1.2345675, 1)).toBe(2.234568);
    expect(addUp(-1.2345675, -1)).toBe(-2.234568);
  });

  it("adds numbers of very different sizes without loss", () => {
    expect(addUp(1e15, 0.000001)).toBe(1000000000000000);
    expect(addUp(123456789.123456, 0.000001)).toBe(123456789.123457);
    expect(addUp(1e-7, 1e-7)).toBe(0);
  });

  it("has no sum for a value that is not a number", () => {
    expect(addUp(NaN, 1)).toBeNaN();
    expect(addUp(1, Infinity)).toBeNaN();
  });

  it(`matches the reference for generated values (${numRuns * 5} sums, seed ${seed})`, () => {
    fc.assert(
      fc.property(valueText, valueText, (a, b) => {
        const [x, y] = [Number(a), Number(b)];
        expect(addUp(x, y), `${a} + ${b}`).toBe(referenceAdd(x, y));
      }),
      { numRuns: numRuns * 5, seed },
    );
  });

  it(`is exact on micro-units: no float noise for values with up to 6 decimals (${numRuns} sums, seed ${seed})`, () => {
    const micro = fc.integer({ min: -9_000_000_000_000, max: 9_000_000_000_000 }).map((n) => (n / 1_000_000).toFixed(6));
    fc.assert(
      fc.property(micro, micro, (a, b) => {
        const sum = microUnits(a) + microUnits(b);
        const text = `${sum < BigInt(0) ? "-" : ""}${(sum < BigInt(0) ? -sum : sum).toString().padStart(7, "0").replace(/(\d{6})$/, ".$1")}`;
        expect(addUp(Number(a), Number(b)), `${a} + ${b}`).toBe(Number(text));
      }),
      { numRuns, seed },
    );
  });
});
