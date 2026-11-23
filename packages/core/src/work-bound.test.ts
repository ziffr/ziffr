// The work bound (GLOSSARY: Method; spec 0041, rule 12): values that cannot be worked out exactly in reasonable time are refused
// in words, decided exactly on their text, one step either side of each limit; the budget of digit work stops a Method at the same
// step on every machine; and no ordinary series is ever refused. The reference is another way of reading the same limits.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "./test/reference/check";
import { referenceWide } from "./test/reference/work-bound";
import { lowestTerms } from "./exact";
import { capped, digits, latestCommon, MOST_PERIODS, spend, tryWork, spendOn, WORK_BOUND, WORK_BUDGET, wideColumns, wideFindings, wideReason, widthOf, withWork } from "./work-bound";

const { numRuns, seed } = runs();
const pts = (vs: number[]) => vs.map((value, i) => ({ period: `2024-${String(i + 1).padStart(2, "0")}-01`, value }));

describe("the limits", () => {
  it("are 40 decimal places and 30 orders of magnitude", () => {
    expect(WORK_BOUND).toEqual({ places: 40, orders: 30 });
  });
});

describe("wideReason: decimal places, one step either side", () => {
  it("allows 40 places and refuses 41, for a tiny value, a negative one and one beside ordinary values", () => {
    expect(wideReason([1e-40])).toBeNull();
    expect(wideReason([1e-39, 1.2e-39, 5.5e-37])).toBeNull();
    expect(wideReason([1.5e-40])).toBe("places");
    expect(wideReason([1e-41])).toBe("places");
    expect(wideReason([-1e-41])).toBe("places");
    expect(wideReason([1, 2, 3, 1.5e-40])).toBe("places");
  });
  it("counts the places of the text, not of the double: 0.1 has one, 1e21 none, 123456789.123456789 nine", () => {
    expect(wideReason([0.1, 0.25, 1e15, 123456789.123456789])).toBeNull();
    expect(wideReason([0.1 + 0.2])).toBeNull();
  });
  it("reads a value that is 0 or not a number as nothing", () => {
    expect(wideReason([0, -0, NaN, Infinity, -Infinity])).toBeNull();
    expect(wideReason([NaN, 1e-300])).toBe("places");
    expect(wideReason([])).toBeNull();
    expect(wideReason([null, 1])).toBeNull();
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
    expect(wideReason([1e15, 1e-14, 5, 1e16])).toBeNull();
    expect(wideReason([1e17, 1e-14, 5, 1e16])).toBe("orders");
  });
  it("refuses a series of huge values that spans 300 orders, and allows huge values that do not", () => {
    expect(wideReason([1e100, 1e-200])).toBe("places");
    expect(wideReason([1e300, 2e300, 9.8e299])).toBeNull();
    expect(wideReason([1e300, 1e-1])).toBe("orders");
    expect(wideReason([9.8e15, 1e-14])).toBeNull();
    expect(wideReason([9.8e17, 1e-14])).toBe("orders");
  });
  it("names the places first where both are too much", () => {
    expect(wideReason([9.8e14, 1e-290])).toBe("places");
  });
});

describe("wideReason is the reference's", () => {
  // Values built from text, so that each has a known number of places and size: a mantissa of up to 11 digits and a power of ten.
  const value = fc.tuple(fc.constantFrom("", "-"), fc.integer({ min: 0, max: 99_999_999_999 }), fc.integer({ min: -60, max: 60 })).map(([sign, m, e]) => Number(`${sign}${m}e${e}`));
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
    const tiny = fc.tuple(fc.constantFrom(1, 3, 7), fc.integer({ min: 38, max: 42 })).map(([m, p]) => Number(`${m}e-${p}`));
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
  it(`never refuses shares and rates: up to 10 decimal places, and rates computed as doubles of 17 digits down to 1e-20 (${numRuns * 5} generated series)`, () => {
    const rate = fc.tuple(fc.integer({ min: 1, max: 999_999_999 }), fc.integer({ min: 0, max: 10 })).map(([m, p]) => Number(`${m}e-${p}`));
    const computed = fc.tuple(fc.integer({ min: 1, max: 3000 }), fc.integer({ min: 1, max: 999_999 })).map(([num, den]) => num / (den * 1e6));
    fc.assert(
      fc.property(fc.array(fc.oneof(rate, computed), { minLength: 1, maxLength: 60 }), (vs) => {
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
      { case: "refuse-exact-places", slots: { name: "Tiny", places: 40, orders: 30 } },
      { case: "refuse-exact-orders", slots: { name: "Spread", places: 40, orders: 30 } },
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
    expect(wideColumns(["Revenue", "Visits"], [[1, 2, 3], [1e-41, 5]])).toEqual([{ case: "refuse-exact-places", slots: { name: "Visits", places: 40, orders: 30 } }]);
    expect(wideColumns(["Revenue", "Visits"], [[1, 1e31], [4, 5]])).toEqual([{ case: "refuse-exact-orders", slots: { name: "Revenue", places: 40, orders: 30 } }]);
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
  it("is spent by every reduction to lowest terms, which is where the greatest common divisor of long numbers is worked out", () => {
    const big = { num: BigInt(10) ** BigInt(200), den: BigInt(3) * BigInt(10) ** BigInt(100) };
    expect(lowestTerms(big)).toEqual({ num: BigInt(10) ** BigInt(100), den: BigInt(3) });
    expect(withWork(() => lowestTerms(big), 10)).toBeNull();
    expect(withWork(() => lowestTerms({ num: BigInt(6), den: BigInt(4) }), 10)).toEqual({ num: BigInt(3), den: BigInt(2) });
    expect(withWork(() => lowestTerms(big))).toEqual(lowestTerms(big));
  });
});

describe("latestCommon", () => {
  const run = (from: number, n: number, over: (i: number) => number = (i) => i) => Array.from({ length: n }, (_, i) => ({ period: `2000-${String(1 + ((from + i) % 12)).padStart(2, "0")}-01`.replace(/^2000/, String(2000 + Math.floor((from + i) / 12))), value: over(i) }));
  it("cuts to the latest 120 periods the series have in common, and says how many, and leaves what is not longer as it is (120 and 121 either side)", () => {
    expect(MOST_PERIODS).toBe(120);
    const exact = latestCommon([run(0, 120)]);
    expect(exact.cut).toBeNull();
    expect(exact.series[0]).toHaveLength(120);
    const over = latestCommon([run(0, 121)]);
    expect(over.cut).toBe(120);
    expect(over.series[0]).toHaveLength(120);
    expect(over.series[0][0].period).toBe(run(0, 121)[1].period);
    expect(over.series[0][119].period).toBe(run(0, 121)[120].period);
  });
  it("keeps only the periods every series has, the latest of them, each period once with the value given last", () => {
    const a = run(0, 200);
    const b = run(50, 200);
    const { series, cut } = latestCommon([a, b]);
    expect(cut).toBe(120);
    expect(series[0].map((p) => p.period)).toEqual(series[1].map((p) => p.period));
    expect(series[0]).toHaveLength(120);
    expect(series[0][119].period).toBe(a[199].period);
    // Periods the first series has and another lacks are not common: the cut is of the common ones, so each series keeps the same 120.
    const holes = run(0, 200).filter((_, i) => i < 150 || i > 160);
    const gap = latestCommon([run(0, 200), holes]);
    expect(gap.series[0].map((p) => p.period)).toEqual(gap.series[1].map((p) => p.period));
    expect(gap.series[0]).toHaveLength(120);
    const twice = latestCommon([[...run(0, 3, () => 1), ...run(0, 3, () => 2)]], 2);
    expect(twice.series[0].map((p) => p.value)).toEqual([2, 2]);
    expect(twice.cut).toBe(2);
    expect(latestCommon([run(0, 5), []]).cut).toBeNull();
  });
});

describe("tryWork", () => {
  it("runs a part inside a bound, and answers null for the part that spends the rest, and for every part after it", () => {
    const seen = withWork(() => [tryWork(() => (spend(4), "a")), tryWork(() => (spend(7), "b")), tryWork(() => (spend(1), "c"))], 10);
    expect(seen).toEqual(["a", null, null]);
  });
  it("runs the part as it is outside a bound, and lets any other failure through", () => {
    expect(tryWork(() => 5)).toBe(5);
    expect(tryWork(() => (spend(1e300), 6))).toBe(6);
    expect(() => tryWork(() => { throw new Error("broken"); })).toThrow("broken");
    expect(withWork(() => tryWork(() => 1), 1)).toBe(1);
  });
});

describe("capped", () => {
  it("runs a part under a limit of its own: what it spends counts against the bound, and past the limit it answers null having spent only the limit", () => {
    expect(withWork(() => [capped(5, () => (spend(3), "a")), capped(5, () => (spend(6), "b")), capped(5, () => (spend(1), "c"))], 12)).toEqual(["a", null, "c"]);
    // 3 + 5 (the stopped part's whole limit) + 1 = 9 of 12: the next part of 4 still fits, and one of 4 more does not.
    expect(withWork(() => [capped(5, () => (spend(3), 1)), capped(5, () => (spend(6), 2)), capped(5, () => (spend(1), 3)), capped(4, () => (spend(4), 4)), capped(4, () => (spend(1), 5))], 12)).toEqual([1, null, 3, null, null]);
  });
  it("stops at the bound's own end where that is nearer than the limit, and then every part after it", () => {
    expect(withWork(() => [capped(100, () => (spend(8), "a")), capped(100, () => (spend(5), "b")), capped(100, () => (spend(1), "c"))], 10)).toEqual(["a", null, null]);
  });
  it("runs the part as it is outside a bound, and lets any other failure through with the bound as it was", () => {
    expect(capped(1, () => (spend(1e300), 7))).toBe(7);
    expect(withWork(() => { try { capped(5, () => { spend(2); throw new Error("broken"); }); } catch { /* the failure passed through */ } return capped(100, () => (spend(8), "rest")); }, 10)).toBe("rest");
    expect(() => withWork(() => capped(5, () => { throw new Error("broken"); }), 10)).toThrow("broken");
  });
});
