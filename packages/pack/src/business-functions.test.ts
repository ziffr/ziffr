// The Business Function list as a table (GLOSSARY: Business Function; spec 0052): nine keys, each with its words, and a
// check that accepts exactly those.
import { describe, expect, it } from "vitest";
import { BUSINESS_FUNCTIONS, BUSINESS_FUNCTION_LABELS, isBusinessFunction } from "./business-functions.js";

describe("the Business Function list", () => {
  it("is the nine keys of the spec, in order, each with its words", () => {
    expect([...BUSINESS_FUNCTIONS]).toEqual(["sales", "marketing", "finance", "operations", "customer_support", "people", "product_engineering", "management", "other"]);
    expect(BUSINESS_FUNCTION_LABELS).toEqual({
      sales: "Sales", marketing: "Marketing", finance: "Finance", operations: "Operations", customer_support: "Customer support",
      people: "People and HR", product_engineering: "Product and engineering", management: "Management", other: "Something else",
    });
    expect(Object.keys(BUSINESS_FUNCTION_LABELS)).toEqual([...BUSINESS_FUNCTIONS]);
  });

  it.each(BUSINESS_FUNCTIONS)("accepts %s", (k) => expect(isBusinessFunction(k)).toBe(true));

  it.each([
    ["an unknown key", "wizard"], ["another case", "Sales"], ["a label", "People and HR"], ["empty", ""], ["a space around", " sales"],
    ["a prototype name", "__proto__"], ["constructor", "constructor"], ["toString", "toString"], ["null", null], ["undefined", undefined],
    ["a number", 1], ["an array", ["sales"]], ["an object", { sales: 1 }],
  ])("refuses %s", (_name, value) => expect(isBusinessFunction(value)).toBe(false));
});
