import { describe, expect, it } from "vitest";
import { checkFormula, evaluate, formulaInputs, inputsNotCombined, inputsProblem, type FormulaInput } from "./formula";
import { STARTING_METRICS } from "./trial-starting-values";

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
  });

  it("agrees with a reference evaluator on generated formulas", () => {
    // A small seeded generator: random trees of + - * /, brackets, unary minus, numbers and inputs, written out and
    // computed by plain JavaScript as the reference.
    let seed = 22;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const vars = { a: 7.5, b: -3, c: 0.25, "net-revenue": 1200 };
    const names = Object.keys(vars) as (keyof typeof vars)[];
    const gen = (depth: number): [string, number] => {
      const r = rand();
      if (depth === 0 || r < 0.25) {
        if (rand() < 0.5) { const n = names[Math.floor(rand() * names.length)]; return [`{${n}}`, vars[n]]; }
        const v = Math.floor(rand() * 1000) / (rand() < 0.5 ? 1 : 100);
        return [String(v), v];
      }
      if (r < 0.35) { const [s, v] = gen(depth - 1); return [`-(${s})`, -v]; }
      const [sa, va] = gen(depth - 1), [sb, vb] = gen(depth - 1);
      const op = "+-*/"[Math.floor(rand() * 4)];
      const v = op === "+" ? va + vb : op === "-" ? va - vb : op === "*" ? va * vb : va / vb;
      return [`(${sa}) ${op} (${sb})`, v];
    };
    for (let i = 0; i < 500; i++) {
      const [f, want] = gen(4);
      const got = evaluate(f, vars);
      if (!Number.isFinite(want)) expect(got).toBeNull();
      else expect(got).toBeCloseTo(want, 6);
    }
  });
});

function input(slug: string, over: Partial<FormulaInput> = {}): FormulaInput {
  return { slug, name: slug.toUpperCase(), period: "month", aggregation: "sum", formula: null, ...over };
}

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
  it("takes every formula of the trial's starting Metrics", () => {
    const made = STARTING_METRICS.map((m) => ({ slug: m.slug, name: m.name, period: m.period, aggregation: m.aggregation, formula: m.formula ?? null }));
    for (const m of STARTING_METRICS.filter((x) => x.formula)) expect(checkFormula(m.formula!, made, m)).toBeNull();
  });
});
