// The work bound (GLOSSARY: Method; spec 0041, rule 12): values that cannot be worked out exactly in reasonable time are refused
// in words, decided exactly on their text, one step either side of each limit; the budget of digit work stops a Method at the same
// step on every machine; and no ordinary series is ever refused. The reference is another way of reading the same limits.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "./test/reference/check";
import { referenceWide } from "./test/reference/work-bound";
import { digits, spend, spendOn, WORK_BOUND, WORK_BUDGET, wideColumns, wideFindings, wideReason, widthOf, withWork } from "./work-bound";

const { numRuns, seed } = runs();
const pts = (vs: number[]) => vs.map((value, i) => ({ period: `2024-${String(i + 1).padStart(2, "0")}-01`, value }));

describe("the limits", () => {
  it("are 30 decimal places and 30 orders of magnitude", () => {
    expect(WORK_BOUND).toEqual({ places: 30, orders: 30 });
  });
});

describe("wideReason: decimal places, one step either side", () => {
  it("allows 30 places and refuses 31, for a tiny value, a negative one and one beside ordinary values", () => {
    expect(wideReason([1e-30])).toBeNull();
    expect(wideReason([1e-29, 1.2e-29, 5.5e-27])).toBeNull();
    expect(wideReason([1.5e-30])).toBe("places");
    expect(wideReason([1e-31])).toBe("places");
    expect(wideReason([-1e-31])).toBe("places");
    expect(wideReason([1, 2, 3, 1.5e-30])).toBe("places");
  });
  it("counts the places of the text, not of the double: 0.1 has one, 1e21 none, 123456789.123456789 nine", () => {
    expect(wideReason([0.1, 0.25, 1e21, 123456789.123456789])).toBeNull();
    expect(wideReason([0.1 + 0.2])).toBeNull();
  });
  it("reads a value that is 0 or not a number as nothing", () => {
    expect(wideReason([0, -0, NaN, Infinity, -Infinity])).toBeNull();
    expect(wideReason([NaN, 1e-300])).toBe("places");
    expect(wideReason([])).toBeNull();
  });
});

describe("wideReason: orders of magnitude, one step either side", () => {
  const over = 1.0000000000000002;
  it("allows a largest size exactly 10^30 times the smallest, and refuses anything above", () => {
    expect(wideReason([1, 1e30])).toBeNull();
    expect(wideReason([1, over * 1e30])).toBe("orders");
    expect(wideReason([1e-30, 1])).toBeNull();
    expect(wideReason([1e-30, over])).toBe("orders");
    expect(wideReason([0.5, 5e29])).toBeNull();
    expect(wideReason([0.5, 5.000000000000001e29])).toBe("orders");
    expect(wideReason([1e-15, 1e15])).toBeNull();
    expect(wideReason([1e-15, over * 1e15])).toBe("orders");
  });
  it("reads the size of a value, so negative values and mixed signs count the same", () => {
    expect(wideReason([-1, 1e30])).toBeNull();
    expect(wideReason([1, -1e30])).toBeNull();
    expect(wideReason([-1, -1e30])).toBeNull();
    expect(wideReason([-1, over * 1e30])).toBe("orders");
    expect(wideReason([1, -over * 1e30])).toBe("orders");
    expect(wideReason([-over * 1e30, -1])).toBe("orders");
  });
  it("leaves out values that are 0: 0 has no size to compare, however many there are", () => {
    expect(wideReason([0, 1, 1e30, 0])).toBeNull();
    expect(wideReason([0, 1, over * 1e30])).toBe("orders");
    expect(wideReason([0, 0, 0])).toBeNull();
    expect(wideReason([0, 5])).toBeNull();
  });
  it("finds the largest and the smallest wherever they stand in the list", () => {
    const list = [3, 1, 1e30, 7, 2, 1e29];
    for (let i = 0; i < list.length; i++) expect(wideReason([...list.slice(i), ...list.slice(0, i)]), `rotated by ${i}`).toBeNull();
    const wide = [3, 1, over * 1e30, 7, 2, 1e29];
    for (let i = 0; i < wide.length; i++) expect(wideReason([...wide.slice(i), ...wide.slice(0, i)]), `rotated by ${i}`).toBe("orders");
    expect(wideReason([...list].reverse())).toBeNull();
    // The smallest is not the first, the largest is not the last.
    expect(wideReason([1e15, 1e-14, 5, 1e16])).toBeNull();
    expect(wideReason([1e17, 1e-14, 5, 1e16])).toBe("orders");
  });
  it("refuses a series of huge values that spans 300 orders, and allows huge values that do not", () => {
    expect(wideReason([1e100, 1e-200])).toBe("places");
    expect(wideReason([1e300, 2e300, 9.8e299])).toBeNull();
    expect(wideReason([1e300, 1e-1])).toBe("orders");
    expect(wideReason([9.8e17, 1e-14])).toBe("orders");
    expect(wideReason([9.8e14, 1e-14])).toBeNull();
  });
  it("names the places first where both are too much", () => {
    expect(wideReason([9.8e14, 1e-290])).toBe("places");
  });
});

describe("wideReason is the reference's", () => {
  // Values built from text, so that each has a known number of places and size: a mantissa of 1 to 17 digits and a power of ten.
  const value = fc.tuple(fc.constantFrom("", "-"), fc.integer({ min: 0, max: 99_999_999_999 }), fc.integer({ min: -40, max: 40 })).map(([sign, m, e]) => Number(`${sign}${m}e${e}`));
  it(`agrees on ${numRuns * 5} generated lists, in the order given and reversed (seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(value, { maxLength: 8 }), (vs) => {
        expect(wideReason(vs)).toBe(referenceWide(vs));
        expect(wideReason([...vs].reverse())).toBe(wideReason(vs));
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it(`agrees on lists that sit right at the limits (${numRuns} runs): a power of ten, a step either side, and a neighbour`, () => {
    const edge = fc.tuple(fc.constantFrom(1, 2, 5, 9), fc.integer({ min: -2, max: 2 })).map(([m, step]) => Number(`${m}e${30 + step}`));
    const tiny = fc.tuple(fc.constantFrom(1, 3, 7), fc.integer({ min: 28, max: 32 })).map(([m, p]) => Number(`${m}e-${p}`));
    fc.assert(
      fc.property(fc.array(fc.oneof(edge, tiny, fc.constantFrom(1, 2, 3, 0.5)), { minLength: 1, maxLength: 4 }), (vs) => {
        expect(wideReason(vs)).toBe(referenceWide(vs));
      }),
      { numRuns, seed },
    );
  });
  it(`never refuses an ordinary series: values to the cent, up to a trillion, of both signs (${numRuns * 5} generated series)`, () => {
    const cents = fc.integer({ min: -100_000_000_000_000, max: 100_000_000_000_000 }).map((c) => c / 100);
    fc.assert(
      fc.property(fc.array(cents, { minLength: 1, maxLength: 60 }), (vs) => {
        expect(wideReason(vs)).toBeNull();
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it(`never refuses shares and rates: up to 10 decimal places between 1e-10 and 1e15 (${numRuns * 5} generated series)`, () => {
    const rate = fc.tuple(fc.integer({ min: 1, max: 999_999_999 }), fc.integer({ min: 0, max: 10 })).map(([m, p]) => Number(`${m}e-${p}`));
    fc.assert(
      fc.property(fc.array(rate, { minLength: 1, maxLength: 60 }), (vs) => {
        expect(wideReason(vs)).toBeNull();
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
});

describe("wideFindings and wideColumns", () => {
  it("say what is wrong with each series, by name, in the order given, with the limits", () => {
    const found = wideFindings([
      { name: "Fine", points: pts([1, 2, 3]) },
      { name: "Tiny", points: pts([1e-300, 2e-300]) },
      { name: "Spread", points: pts([1, 1e31]) },
    ]);
    expect(found).toEqual([
      { case: "refuse-exact-places", slots: { name: "Tiny", places: 30, orders: 30 } },
      { case: "refuse-exact-orders", slots: { name: "Spread", places: 30, orders: 30 } },
    ]);
  });
  it("finds nothing in series that are fine, and in none at all", () => {
    expect(wideFindings([{ name: "A", points: pts([1, 2, 3.25]) }])).toEqual([]);
    expect(wideFindings([])).toEqual([]);
    expect(wideFindings([{ name: "A", points: [] }])).toEqual([]);
  });
  it("reads a series as every Method does: a period twice counts once, with the value given last, and a value that is not a number is none", () => {
    const hostile = { period: "2024-01-01", value: 1e-300 };
    expect(wideFindings([{ name: "A", points: [hostile, { period: "2024-01-01", value: 2 }, { period: "2024-02-01", value: 3 }] }])).toEqual([]);
    expect(wideFindings([{ name: "A", points: [{ period: "2024-01-01", value: 2 }, hostile] }]).map((f) => f.case)).toEqual(["refuse-exact-places"]);
    expect(wideFindings([{ name: "A", points: [hostile, { period: "2024-02-01", value: NaN }].slice(1) }])).toEqual([]);
  });
  it("names the columns of a fit's rows as given", () => {
    expect(wideColumns(["Revenue", "Visits"], [[1, 2, 3], [1e-31, 5]])).toEqual([{ case: "refuse-exact-places", slots: { name: "Visits", places: 30, orders: 30 } }]);
    expect(wideColumns(["Revenue", "Visits"], [[1, 1e31], [4, 5]])).toEqual([{ case: "refuse-exact-orders", slots: { name: "Revenue", places: 30, orders: 30 } }]);
    expect(wideColumns([], [])).toEqual([]);
  });
});

describe("the budget of digit work", () => {
  it("counts nothing outside a bound, so that a Method called with no bound is never stopped", () => {
    expect(() => spend(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });
  it("answers with the result of the work while the budget lasts, and with null when it is spent", () => {
    expect(withWork(() => 7, 10)).toBe(7);
    expect(withWork(() => (spend(10), 7), 10)).toBe(7);
    expect(withWork(() => (spend(11), 7), 10)).toBeNull();
    expect(withWork(() => (spend(6), spend(4), 7), 10)).toBe(7);
    expect(withWork(() => (spend(6), spend(5), 7), 10)).toBeNull();
    // Spending 0 is free, however often.
    expect(withWork(() => (Array.from({ length: 100 }, () => spend(0)), 7), 0)).toBe(7);
  });
  it("stops at the step the budget runs out, and not before: the same step every time", () => {
    for (let run = 0; run < 3; run++) {
      let reached = 0;
      expect(withWork(() => { for (let i = 0; i < 100; i++) { spend(3); reached = i + 1; } }, 100)).toBeNull();
      expect(reached).toBe(33);
    }
  });
  it("is a budget of its own for each call, and the default one is the stated budget", () => {
    expect(withWork(() => (spend(WORK_BUDGET), 1))).toBe(1);
    expect(withWork(() => (spend(WORK_BUDGET + 1), 1))).toBeNull();
    expect(withWork(() => (spend(WORK_BUDGET), 1))).toBe(1);
  });
  it("lets the outer call count and answer when bounds are nested: the inner one spends from the outer budget", () => {
    expect(withWork(() => withWork(() => (spend(6), 1), 1000) === 1 && (spend(6), true), 10)).toBeNull();
    expect(withWork(() => withWork(() => (spend(6), 1), 1000), 10)).toBe(1);
    // An inner bound that runs out takes the outer one with it: the outer call answers null.
    expect(withWork(() => withWork(() => (spend(11), 1), 1000), 10)).toBeNull();
  });
  it("is clear after a stop and after a failure, so that the next call has a fresh budget and a failure is not swallowed", () => {
    expect(withWork(() => spend(11), 10)).toBeNull();
    expect(() => spend(1e300)).not.toThrow();
    expect(() => withWork(() => { throw new Error("broken"); }, 10)).toThrow("broken");
    expect(() => spend(1e300)).not.toThrow();
    expect(withWork(() => (spend(10), 1), 10)).toBe(1);
  });
  it("counts the size of numbers: one for what fits a machine word, the length in hex digits above", () => {
    const [big, one] = [BigInt(10) ** BigInt(19), BigInt(1)];
    expect(digits(BigInt(0))).toBe(1);
    expect(digits(big - one)).toBe(1);
    expect(digits(-(big - one))).toBe(1);
    expect(digits(big)).toBe(16);
    expect(digits(-big)).toBe(17);
    expect(digits(BigInt(10) ** BigInt(300))).toBe(BigInt(10) ** BigInt(300) === BigInt(0) ? 0 : (BigInt(10) ** BigInt(300)).toString(16).length);
    expect(widthOf({ num: big, den: one })).toBe(16);
    expect(widthOf({ num: one, den: big })).toBe(16);
    expect(widthOf({ num: BigInt(3), den: BigInt(7) })).toBe(1);
    expect(widthOf({ num: BigInt(10) ** BigInt(40), den: BigInt(10) ** BigInt(100) })).toBe((BigInt(10) ** BigInt(100)).toString(16).length);
  });
  it("charges a step the square of the sum of its sizes, which includes reducing its result", () => {
    expect(withWork(() => (spendOn(3, 4), 1), 49)).toBe(1);
    expect(withWork(() => (spendOn(3, 4), 1), 48)).toBeNull();
    expect(withWork(() => (spendOn(1, 1), 1), 4)).toBe(1);
    expect(withWork(() => (spendOn(1, 1), 1), 3)).toBeNull();
  });
});
