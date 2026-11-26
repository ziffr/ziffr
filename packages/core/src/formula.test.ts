import { describe, expect, it } from "vitest";
import { checkFormula, evaluate, evaluateRange, formulaInputs, inputsNotCombined, inputsProblem, rangeNumber, readFormula, targetInputs, targetProblem, targetReader, usesPrevious, usesTarget, type FormulaInput } from "./formula";
import { referenceReads } from "./test/reference/formula";

describe("formula", () => {
  it("lists the metrics a formula reads, once each", () => {
    expect(formulaInputs("({revenue} - {cost}) / {revenue}")).toEqual(["revenue", "cost"]);
  });
  it("reads a formula into the tree it is evaluated by, or says why not", () => {
    expect(readFormula("{a} - 2")).toEqual({ ok: true, node: { k: "op", op: "-", a: { k: "ref", slug: "a" }, b: { k: "num", v: "2" } } });
    expect(readFormula("{a} -")).toEqual({ ok: false, reason: "The formula ends where a value is missing." });
  });
  it("evaluates arithmetic over inputs", () => {
    expect(evaluate("({revenue} - {cost}) / {revenue} * 100", { revenue: 200, cost: 150 })).toBe(25);
    expect(evaluate("{a} - - {b}", { a: 5, b: 3 })).toBe(8);
    expect(evaluate("-({a} + 0.5) * 2", { a: 1 })).toBe(-3);
    expect(evaluate("  {a}*2/4  ", { a: 6 })).toBe(3);
  });
  it("gives no value when dividing by zero or an input is missing", () => {
    expect(evaluate("{a} / {b}", { a: 1, b: 0 })).toBeNull();
    expect(evaluate("{a} + {b}", { a: 1 })).toBeNull();
    expect(evaluate("{a}", { a: NaN })).toBeNull();
  });

  // Spec 0022: a formula is read whole or refused; each of these gave a number before.
  const malformed: [formula: string, why: RegExp][] = [
    ["{a} {b}", /side by side/],
    ["2{a}", /side by side/],
    ["({a}) ({b})", /side by side/],
    ["{a} ^ 2", /"\^" cannot be read/],
    ["{a} % {b}", /"%" cannot be read/],
    ["1e3 * {a}", /"e" is not part of a number/],
    [".5 * {a}", /"\." is not part of a number/],
    ["{a} * 1,5", /"," is not part of a number/],
    ["{a} * 1.5.2", /"\." is not part of a number/],
    ["({a} + {b}", /not closed/],
    ["{a} + {b})) * 100", /closed that was not opened/],
    [")({a}", /closed that was not opened/],
    ["{a} +", /value is missing/],
    ["* {a}", /value is missing/],
    ["{a} * / {b}", /value is missing/],
    ["()", /closed that was not opened/],
    ["+{a}", /value is missing/],
    ["{Revenue} / 2", /does not name a Metric/],
    ["{a b}", /does not name a Metric/],
    ["{a", /does not name a Metric/],
    ["", /empty/],
    ["   ", /empty/],
    ["{a} × 2", /"×" cannot be read/],
  ];
  it.each(malformed)("refuses %j", (formula, why) => {
    expect(evaluate(formula, { a: 10, b: 3 })).toBeNull();
    expect(checkFormula(formula, [input("a"), input("b")])).toMatch(why);
    expect(referenceReads(formula)).toBe(false);
  });

  // Generated formulas are checked against an exact reference evaluator in derived.test.ts (#126); the plain-JavaScript
  // reference that stood here computed in floating point, so it could only ask for six decimals.
});

function input(slug: string, over: Partial<FormulaInput> = {}): FormulaInput {
  return { slug, name: slug.toUpperCase(), period: "month", aggregation: "sum", formula: null, ...over };
}

describe("the reasons a formula is refused, word for word", () => {
  const ins = ["a", "b", "net-revenue", "revenue-2025-europe-north"].map((s) => input(s));
  it("names what it could not read", () => {
    expect(checkFormula("{Revenue} / 2", ins)).toBe('"{Revenue}" does not name a Metric: write its slug in lower case, such as {revenue}.');
    expect(checkFormula("2 * {a", ins)).toBe('"{a" does not name a Metric: write its slug in lower case, such as {revenue}.');
    expect(checkFormula("1e3 * {a}", ins)).toBe('"e" is not part of a number here: write numbers such as 12 or 0.5.');
    // A letter after a number is not part of it; one after an operator cannot be read at all.
    expect(checkFormula("12a + {a}", ins)).toBe('"a" is not part of a number here: write numbers such as 12 or 0.5.');
    expect(checkFormula("{a} + a", ins)).toBe('"a" cannot be read: a formula has + - * /, brackets, numbers and {metric}.');
    expect(checkFormula("2 + a", ins)).toBe('"a" cannot be read: a formula has + - * /, brackets, numbers and {metric}.');
    expect(checkFormula("x + 2", ins)).toBe('"x" cannot be read: a formula has + - * /, brackets, numbers and {metric}.');
    expect(checkFormula("* {a}", ins)).toBe('"*" stands where a value is missing.');
    expect(checkFormula("{a} + )", ins)).toBe("A bracket is closed that was not opened.");
    expect(checkFormula(`{a} * ${"1".repeat(30)}`, ins)).toBe(`"${"1".repeat(24)}…" has more than 20 digits.`);
  });
  it("counts digits, operations and characters as the bounds say", () => {
    // Twenty digits with a decimal point between them are twenty digits; a long slug with digits is no number.
    expect(evaluate("{a} * 1234567890.1234567890", { a: 1 })).toBe(1234567890.123456789);
    expect(evaluate("{revenue-2025-europe-north} * 2", { "revenue-2025-europe-north": 3 })).toBe(6);
    // Slugs with a "-" are no operations: 50 operations over them are read.
    expect(evaluate(Array(51).fill("{a-b}").join("+"), { "a-b": 1 })).toBe(51);
    for (const op of ["*", "/"]) {
      expect(evaluate(Array(51).fill("{a}").join(op), { a: 1 }), op).toBe(1);
      expect(checkFormula(Array(52).fill("{a}").join(op), ins), op).toBe("The formula has more than 50 operations.");
    }
    expect(evaluate("{c2} * 2", { c2: 3 })).toBe(6);
  });
  it("gives no value for an input that is not a number, on either side", () => {
    for (const bad of [NaN, Infinity, undefined]) {
      expect(evaluate("{a} + {b}", { a: 1, b: bad as number })).toBeNull();
      expect(evaluate("{a} + {b}", { a: bad as number, b: 1 })).toBeNull();
      expect(evaluate("-{a}", { a: bad as number })).toBeNull();
    }
    expect(evaluate("{a} / ({b} - 2)", { a: 1, b: 2 })).toBeNull();
  });
  it("skips inputs it does not know when it looks for reasons", () => {
    expect(inputsNotCombined({ formula: "{gone} / {stock}" }, [input("stock", { aggregation: "none" })])).toMatch(/STOCK is set to Aggregation none/);
    expect(inputsProblem({ formula: "{gone} / {a}", period: "month" }, [input("a")])).toBeNull();
  });
});

describe("checkFormula", () => {
  const inputs = [input("revenue"), input("cost"), input("orders"), input("visits", { period: "week" }), input("stock", { aggregation: "none" }), input("margin", { formula: "{revenue} - {cost}" })];
  it("takes a formula it can read over Metrics of one period that combine", () => {
    expect(checkFormula("({revenue} - {cost}) / {revenue} * 100", inputs, { slug: "m", period: "month" })).toBeNull();
    expect(checkFormula("{revenue} / {orders}", inputs)).toBeNull();
  });
  it("refuses Metrics it does not know, the Metric itself and other Derived Metrics", () => {
    expect(checkFormula("{revenue} / {nope}", inputs)).toMatch(/\{nope\} is not a Metric/);
    expect(checkFormula("{revenue} * 2", inputs, { slug: "revenue", period: "month" })).toMatch(/itself/);
    expect(checkFormula("{margin} * 2", inputs)).toMatch(/MARGIN is a Derived Metric/);
    expect(checkFormula("2 * 3", inputs)).toMatch(/names no Metric/);
  });
  it("refuses inputs of different periods, or of another period than the Metric", () => {
    expect(checkFormula("{revenue} / {visits}", inputs)).toMatch(/different periods/);
    expect(checkFormula("{revenue} / {orders}", inputs, { slug: "m", period: "week" })).toMatch(/counted by month, it by week/);
  });
  it("refuses inputs set to Aggregation none", () => {
    expect(checkFormula("{revenue} / {stock}", inputs)).toMatch(/STOCK is set to Aggregation none/);
  });
  it("names the reason an existing Derived Metric cannot be combined", () => {
    expect(inputsProblem({ formula: "{revenue} / {visits}", period: "month" }, inputs)).toMatch(/different periods/);
    expect(inputsProblem({ formula: "{revenue} / {orders}", period: "month" }, inputs)).toBeNull();
    // An input left out (a View Link) is skipped here, not taken for a problem.
    expect(inputsProblem({ formula: "{revenue} / {hidden}", period: "month" }, inputs)).toBeNull();
    expect(inputsNotCombined({ formula: "{revenue} / {stock}" }, inputs)).toMatch(/STOCK is set to Aggregation none/);
    expect(inputsNotCombined({ formula: "{revenue} / {orders}" }, inputs)).toBeNull();
  });
});

describe("a formula that reads a target (spec 0062)", () => {
  const range = (target_min: number | null, target_max: number | null) => ({ target_min, target_max });
  it("is read as the Metric's target, which makes the Metric an input", () => {
    expect(readFormula("target ( {commit} )")).toEqual({ ok: true, node: { k: "target", slug: "commit" } });
    expect(formulaInputs("{pipeline} / (target({commit}) - {closed})")).toEqual(["pipeline", "commit", "closed"]);
    expect(targetInputs("target({a}) + target( {a} ) - {b} + change({c})")).toEqual(["a"]);
    expect([usesTarget("target({a})"), usesTarget("{a} - prev({a})"), usesPrevious("target({a})")]).toEqual([true, false, false]);
  });
  it("needs the target and a value of that Metric", () => {
    expect(evaluate("target({a}) - {a}", { a: 70 }, {}, { a: 100 })).toBe(30);
    expect(evaluate("{b} / (target({a}) - 10)", { a: 1, b: 180 }, {}, { a: 100 })).toBe(2);
    // No target given, a target that is no number, and a target of a Metric without a value.
    expect(evaluate("target({a})", { a: 70 })).toBeNull();
    expect(evaluate("target({a})", { a: 70 }, {}, { a: NaN })).toBeNull();
    expect(evaluate("target({a})", {}, {}, { a: 100 })).toBeNull();
    expect(evaluate("{b} - target({a})", { b: 1 }, {}, { a: 100 })).toBeNull();
    // A range of values has no target to read.
    expect(evaluateRange("target({a})", {})).toBeNull();
  });
  it("refuses what is not one Metric between the brackets, in words", () => {
    const ins: FormulaInput[] = [{ slug: "a", name: "A", period: "month", aggregation: "sum", formula: null }];
    for (const bad of ["target(1)", "target({a} - 1)", "target {a}", "target()", "target(target({a}))", "prev(target({a}))"]) {
      expect(checkFormula(bad, ins), bad).toMatch(/takes one Metric/);
      expect(referenceReads(bad), bad).toBe(false);
    }
    expect(checkFormula("target(1)", ins)).toBe("target takes one Metric: write target({commit}), with the Metric's slug in lower case.");
    expect(checkFormula("target({a})", ins, { slug: "a", period: "month" })).toMatch(/this Metric itself/);
    expect(checkFormula("target({nobody})", ins)).toMatch(/not a Metric of this Workspace/);
    expect(checkFormula("target({a})", [{ ...ins[0], formula: "{b}" }])).toMatch(/Derived Metric itself/);
    expect(checkFormula("target({a})", [{ ...ins[0], aggregation: "none" }])).toMatch(/Aggregation none/);
  });
  it("takes a range as a number only where it holds one", () => {
    expect(rangeNumber(range(500, null))).toBe(500);
    expect(rangeNumber(range(null, 40))).toBe(40);
    expect(rangeNumber(range(7, 7))).toBe(7);
    expect(rangeNumber(range(0, null))).toBe(0);
    expect(rangeNumber(range(10, 20))).toBeUndefined();
    expect(rangeNumber(range(null, null))).toBeUndefined();
  });
  it("takes the period's Target Series value before the range, and never the range for one it cannot read", () => {
    const read = targetReader(range(500, null), [{ period: "2026-01-01", value: 600 }, { period: "2026-02-01", value: NaN }, { period: "2026-01-01", value: 650 }]);
    expect([read("2026-01-01"), read("2026-02-01"), read("2026-03-01")]).toEqual([650, undefined, 500]);
    expect(targetReader(range(1, 2), [])("2026-01-01")).toBeUndefined();
  });
  it("says why there may be no value: an input without a target to read", () => {
    const commit = { id: 1, slug: "commit", name: "Commit", ...range(null, null) };
    const why = "It reads the target of Commit, which has no number to read: set a Target Range with one bound, such as “at least 500”, or Target Series values.";
    expect(targetProblem({ formula: "target({commit})" }, [commit], {})).toBe(why);
    expect(targetProblem({ formula: "target({commit})" }, [{ ...commit, ...range(1, 2) }], { 1: [] })).toBe(why);
    expect(targetProblem({ formula: "target({commit})" }, [{ ...commit, ...range(1, null) }], {})).toBeNull();
    expect(targetProblem({ formula: "target({commit})" }, [commit], { 1: [{ period: "2026-01-01", value: 1 }] })).toBeNull();
    // An input the viewer was not given is not named.
    expect(targetProblem({ formula: "target({commit})" }, [], {})).toBeNull();
    expect(targetProblem({ formula: null }, [commit], {})).toBeNull();
  });
});
