import { describe, expect, it } from "vitest";
import { checkFormula, evaluate, formulaInputs, inputsNotCombined, inputsProblem, type FormulaInput } from "./formula";
import { referenceReads } from "./test/reference/formula";

describe("formula", () => {
  it("lists the metrics a formula reads, once each", () => {
    expect(formulaInputs("({revenue} - {cost}) / {revenue}")).toEqual(["revenue", "cost"]);
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
