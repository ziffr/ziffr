import { describe, expect, it } from "vitest";
import { evaluate, formulaInputs } from "./formula";

describe("formula", () => {
  it("lists the metrics a formula reads, once each", () => {
    expect(formulaInputs("({revenue} - {cost}) / {revenue}")).toEqual(["revenue", "cost"]);
  });
  it("evaluates arithmetic over inputs", () => {
    expect(evaluate("({revenue} - {cost}) / {revenue} * 100", { revenue: 200, cost: 150 })).toBe(25);
  });
  it("gives no value when dividing by zero or an input is missing", () => {
    expect(evaluate("{a} / {b}", { a: 1, b: 0 })).toBeNull();
    expect(evaluate("{a} + {b}", { a: 1 })).toBeNull();
  });
});
