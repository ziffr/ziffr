// Writing values against the reference (spec 0022, Writing; GLOSSARY: Number Style, Metric Description): formatValue,
// formatNumber, formatPercent, formatChange and compactValue for generated values, every Number Style, both sides of
// a unit and every number of decimals, each held to text worked out digit by digit on the value's exact decimals
// (test/reference/write.ts). This is the display's rounding, through the functions that do it.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compactValue, formatChange, formatNumber, formatPercent, formatValue, type ValueUnit } from "./format";
import { NUMBER_STYLES } from "./number-style";
import { runs, valueText } from "./test/reference/check";
import { referenceChange, referenceCompact, referenceNumber, referenceValue } from "./test/reference/write";

const { numRuns, seed } = runs();
const unit = fc.record({
  unit: fc.constantFrom("", "€", "$", "CHF ", "d", "%", "pc"),
  unit_position: fc.constantFrom("before" as const, "after" as const),
  decimals: fc.integer({ min: 0, max: 6 }),
});
// Values as people send them, and values around the points where compactValue changes how it writes them.
const value = fc.oneof(
  { weight: 3, arbitrary: valueText },
  { weight: 1, arbitrary: fc.constantFrom("9999.4", "9999.5", "9999.99", "10000", "-10000", "12345", "12350", "12349.99", "99949.99", "99950", "99999", "100000", "999499", "999500", "999949.9", "999950", "1000000", "1049999", "1050000", "99950000", "-0.4", "-0.0000001", "0.05", "-0.05") },
);

describe("writing a value", () => {
  it(`matches the reference for every Number Style, unit side and number of decimals (${numRuns * 5} values, seed ${seed})`, () => {
    fc.assert(
      fc.property(value, unit, fc.constantFrom(...NUMBER_STYLES), fc.boolean(), (text, u: ValueUnit, style, group) => {
        const v = Number(text);
        const where = `${text} with ${JSON.stringify(u)} in ${style}`;
        // Text of up to 15 significant digits is what a double carries unchanged; longer text is checked as the double.
        const exact = String(v);
        expect(formatValue(u, v, style), where).toBe(referenceValue(u, exact, style));
        expect(formatNumber(v, u.decimals, style, { group }), where).toBe(referenceNumber(exact, u.decimals, style, group));
        expect(formatPercent(v, style, u.decimals), where).toBe(referenceValue({ unit: "%", unit_position: "after", decimals: u.decimals }, exact, style));
        expect(formatChange(v, style), where).toBe(referenceChange(exact, style));
        expect(formatChange(v, style, { signed: false }), where).toBe(referenceChange(exact, style, false));
        expect(compactValue(u, v, style), where).toBe(referenceCompact(u, v, style));
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it("writes a dash for no value or one that is not a number", () => {
    const u: ValueUnit = { unit: "€", unit_position: "after", decimals: 2 };
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) {
      for (const style of NUMBER_STYLES) {
        expect(formatValue(u, v, style)).toBe("–");
        expect(formatNumber(v, 2, style)).toBe("–");
        expect(formatChange(v, style)).toBe("–");
        expect(formatPercent(v, style)).toBe("–");
        if (typeof v === "number") expect(compactValue(u, v, style)).toBe("–");
      }
    }
  });
  it("the reference writes what was worked out by hand", () => {
    const eur = { unit: "€", unit_position: "after" as const, decimals: 2 };
    expect(referenceValue(eur, "1234567.005", "1.234,5")).toBe("1.234.567,01 €");
    expect(referenceValue({ ...eur, unit: "$", unit_position: "before" }, "-1200.5", "1,234.5")).toBe("-$1,200.50");
    expect(referenceValue(eur, "-0.004", "1 234,5")).toBe("0,00 €");
    expect(referenceNumber("1234.5", 0, "1'234.5")).toBe("1'235");
    expect(referenceNumber("1234.5", 1, "1'234.5", false)).toBe("1234.5");
    expect(referenceChange("-0.04", "1,234.5")).toBe("±0.0 %");
    expect(referenceChange("12.25", "1.234,5")).toBe("+12,3 %");
    expect(referenceChange("-3.45", "1,234.5")).toBe("−3.5 %");
    expect(referenceCompact(eur, 126_000, "1,234.5")).toBe("126k €");
    expect(referenceCompact(eur, 12_345, "1.234,5")).toBe("12,3k €");
    expect(referenceCompact(eur, 999_950, "1,234.5")).toBe("1M €");
    expect(referenceCompact(eur, -1_250_000, "1,234.5")).toBe("-1.3M €");
    expect(referenceCompact(eur, 9_999.5, "1,234.5")).toBe("9,999.50 €");
  });
});
